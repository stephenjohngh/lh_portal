// src/lib/server/mediaAccess.test.js
import { describe, it, expect, vi } from 'vitest';

vi.mock('$app/env/private', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('private', { SUPABASE_SERVICE_ROLE_KEY: 'test-secret' }));

const {
  mediaSessionValue, readMediaSession, mediaSessionSeconds,
  canViewFile, canDeleteFile, describeFile, findFileReferences,
} = await import('./mediaAccess.js');

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const none = { library: [], media: [], maintenance: [] };

describe('the media session cookie', () => {
  const now = Date.UTC(2026, 8, 27, 12);

  it('vouches for the user it was issued to, until it expires', () => {
    const v = mediaSessionValue(U1, now);
    expect(readMediaSession(v, now)).toBe(U1);
    expect(readMediaSession(v, now + (mediaSessionSeconds() - 1) * 1000)).toBe(U1);
    expect(readMediaSession(v, now + mediaSessionSeconds() * 1000)).toBeNull();
  });

  it('cannot be forged or re-pointed at someone else', () => {
    const [, exp, sig] = mediaSessionValue(U1, now).split('.');
    expect(readMediaSession(`${U2}.${exp}.${sig}`, now)).toBeNull();                       // other user
    expect(readMediaSession(`${U1}.${Number(exp) + 99999}.${sig}`, now)).toBeNull();      // longer life
    expect(readMediaSession(`${U1}.${exp}.${'0'.repeat(64)}`, now)).toBeNull();           // made-up signature
  });

  it('refuses anything malformed rather than throwing', () => {
    for (const v of [undefined, null, '', 'x', 'a.b.c', `${U1}.1`, `${U1}.abc.${'0'.repeat(64)}`]) {
      expect(readMediaSession(/** @type {any} */ (v), now)).toBeNull();
    }
  });
});

describe('who may view a file through the proxy', () => {
  const viewer = { isAdmin: false, grants: new Set(['maintenance']) };

  it('refuses an id no portal record names — the Drive account holds more than the portal', () => {
    expect(canViewFile(none, viewer)).toBe(false);
    expect(canViewFile(none, { isAdmin: true, grants: new Set() })).toBe(false);
  });

  it('serves photos and documents the portal knows', () => {
    expect(canViewFile({ ...none, media: [{ id: 'm', created_by: U2 }] }, viewer)).toBe(true);
    expect(canViewFile({ ...none, library: [{ id: 'd', entity_type: 'issue' }] }, viewer)).toBe(true);
  });

  it('holds a parking licence to the Parking grant, as the table does', () => {
    const refs = { ...none, library: [{ id: 'd', entity_type: 'parking_agreement' }] };
    expect(canViewFile(refs, viewer)).toBe(false);
    expect(canViewFile(refs, { isAdmin: false, grants: new Set(['parking']) })).toBe(true);
    expect(canViewFile(refs, { isAdmin: true, grants: new Set() })).toBe(true);
  });
});

describe('who may delete a file', () => {
  const me = { userId: U1, isAdmin: false };

  it('never deletes a library document here, not even for an admin', () => {
    const refs = { ...none, library: [{ id: 'd', entity_type: 'gt_document' }], media: [{ id: 'm', created_by: U1 }] };
    expect(canDeleteFile(refs, me).ok).toBe(false);
    expect(canDeleteFile(refs, { userId: U1, isAdmin: true }).ok).toBe(false);
  });

  it('never deletes a file no attachment names', () => {
    expect(canDeleteFile(none, { userId: U1, isAdmin: true }).ok).toBe(false);
  });

  it('lets whoever added it delete it, and an admin delete anything', () => {
    expect(canDeleteFile({ ...none, media: [{ id: 'm', created_by: U1 }] }, me).ok).toBe(true);
    expect(canDeleteFile({ ...none, maintenance: [{ id: 'x', uploaded_by: U1 }] }, me).ok).toBe(true);
    expect(canDeleteFile({ ...none, media: [{ id: 'm', created_by: U2 }] }, { userId: U1, isAdmin: true }).ok).toBe(true);
  });

  // Anyone logged in can insert a media_attachments row. Pointing one at
  // somebody else's photo must not make that photo theirs to delete.
  it('refuses when anyone else also names the file', () => {
    const refs = { ...none, media: [{ id: 'mine', created_by: U1 }, { id: 'theirs', created_by: U2 }] };
    expect(canDeleteFile(refs, me).ok).toBe(false);
  });
});

describe('describeFile', () => {
  it('prefers the library record, then the attachment', () => {
    expect(describeFile({ ...none, library: [{ id: 'd', entity_type: 'x', filename: 'a.pdf', mime_type: 'application/pdf' }] }))
      .toEqual({ filename: 'a.pdf', mime: 'application/pdf' });
    expect(describeFile({ ...none, media: [{ id: 'm', created_by: U1, filename: 'p.jpg', mime_type: 'image/jpeg' }] }))
      .toEqual({ filename: 'p.jpg', mime: 'image/jpeg' });
    expect(describeFile(none)).toEqual({ filename: null, mime: null });
  });
});

describe('findFileReferences', () => {
  function fakeDb(results, calls = []) {
    return {
      calls,
      from: (table) => ({
        select: () => ({
          eq:    (col, val) => { calls.push([table, 'eq', col, val]); return Promise.resolve(results[table]); },
          ilike: (col, val) => { calls.push([table, 'ilike', col, val]); return Promise.resolve(results[table]); },
        }),
      }),
    };
  }
  const ok = { data: [], error: null };

  it('escapes LIKE wildcards so an id matches only itself', async () => {
    const db = fakeDb({ document_library: ok, media_attachments: ok, maintenance_documents: ok });
    await findFileReferences(db, 'ab_c%d');
    const like = db.calls.find(c => c[0] === 'media_attachments')[3];
    expect(like).toBe('%ab\\_c\\%d%');
  });

  it('fails closed: a lookup that errored is not "no rows"', async () => {
    const db = fakeDb({ document_library: ok, media_attachments: { data: null, error: { message: 'down' } }, maintenance_documents: ok });
    await expect(findFileReferences(db, 'abc')).rejects.toThrow('down');
  });
});
