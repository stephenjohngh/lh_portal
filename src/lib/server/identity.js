// src/lib/server/identity.js
//
// The building and the business, as an admin set them, for documents built on
// the server. Read here rather than taken from the request: a route that used
// a name the browser sent, or one typed into the route as a default, is how
// one building came to be "Lonsdale House" on some exports and "Lancaster
// House" on others. See #lib/utils/identity.js.

import { createClient }        from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env }                 from '$env/dynamic/private';
import { ORGANISATION_KEY, cleanOrganisation, buildingName } from '#lib/utils/identity.js';

let _db = null;
const db = () => (_db ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''));

/**
 * @returns {Promise<{
 *   building: { name: string, shortName: string|null, address: string|null },
 *   organisation: Record<string, string>,
 * }>}  `building.name` is the placeholder when unset; throws if it cannot read.
 */
export async function getIdentity() {
  const [facility, org] = await Promise.all([
    db().from('facilities').select('name, short_name, address').order('created_at').limit(1).maybeSingle(),
    db().from('portal_settings').select('value').eq('key', ORGANISATION_KEY).maybeSingle(),
  ]);
  if (facility.error) throw facility.error;
  if (org.error) throw org.error;
  return {
    building: {
      name:      buildingName(facility.data),
      shortName: facility.data?.short_name ?? null,
      address:   facility.data?.address ?? null,
    },
    organisation: cleanOrganisation(org.data?.value),
  };
}

/**
 * The building's name for a document, from the setting — a route sets it over
 * whatever the request carried, so no browser and no default in code decides
 * what a document is headed with. The placeholder when unset.
 */
export async function documentBuildingName() {
  return (await getIdentity()).building.name;
}
