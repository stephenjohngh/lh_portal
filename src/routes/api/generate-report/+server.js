// src/routes/api/generate-report/+server.js
// The Building Assets component report, built on the SERVER.
//
// ⚠ Since 2026-10-05 the report is built in the BROWSER by default
// (#lib/docx/componentReport.js, switched by BUILD_IN_BROWSER in
// building_assets/components/plan/reportGenerator.js), because a whole building
// with plans did not fit Northflank's free tier. This route is kept, working,
// as the swap-back: it builds the same file with the same code.
//
// Accepts multipart form data: 'payload' = JSON { options, floors, allComponents },
// plus one PNG file part per floor plan, named by that floor's imagePart.
// (The older all-JSON body with imageBase64 per floor is still read.)
import { json } from '@sveltejs/kit';
import { requireAuth } from '#lib/server/requireAuth.js';
import { getLogger } from '#lib/utils/logger.js';
import { documentBuildingName } from '#lib/server/identity.js';
import { buildComponentReport, ReportInputError } from '#lib/docx/componentReport.js';

const logger = getLogger('generateReport');

export async function POST({ request }) {
  // Authenticated users only — these endpoints render caller-supplied data
  // into official-looking documents and burn server compute; neither should
  // be reachable anonymously.
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  logger('📄 POST /api/generate-report');

  try {
    // The plans arrive as binary file parts of a form, never base64 inside one
    // JSON string: reading that held several copies of every plan at once.
    const isForm = (request.headers.get('content-type') ?? '').startsWith('multipart/form-data');
    const form   = isForm ? await request.formData() : null;
    const body   = form ? JSON.parse(String(form.get('payload') ?? '{}')) : await request.json();
    const { options = {}, floors = [], allComponents = [] } = body;

    const { bytes, filename } = await buildComponentReport({
      // The building as an admin named it (Admin → Building & business), never
      // what the request carried (leanReport.test.js).
      building: await documentBuildingName(),
      options, floors, allComponents,
      async imageOf(fi) {
        const { imagePart, imageBase64 } = floors[fi] ?? {};
        const part = form && imagePart ? form.get(imagePart) : null;
        if (form && imagePart) form.delete(imagePart);   // the bytes are the one copy kept
        if (part && typeof part !== 'string') return new Uint8Array(await part.arrayBuffer());
        if (imageBase64) { floors[fi].imageBase64 = null; return Buffer.from(imageBase64, 'base64'); }
        return null;
      },
    });

    return new Response(bytes, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (/** @type {any} */ err) {
    if (err instanceof ReportInputError) return json({ error: err.message }, { status: 400 });
    logger('❌ Error:', err.message, err.stack);
    return json({ error: err.message }, { status: 500 });
  }
}
