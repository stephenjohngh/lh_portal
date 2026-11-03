// src/lib/apps/dossier/utils/publicationAccess.js
// Turning a published link's access events into the few figures the author reads.
// Pure and Type-1 testable.

export const EVENT_LABEL = {
  opened:          'Opened the pack',
  unlock_ok:       'Passphrase accepted',
  unlock_failed:   'Wrong passphrase',
  file:            'Took a file',
  refused_revoked: 'Tried the link after it was revoked',
  refused_expired: 'Tried the link after it expired',
};

/** Events that are a person getting in or trying to. Used to colour the list. */
export const EVENT_CONCERN = new Set(['unlock_failed', 'refused_revoked', 'refused_expired']);

const emptySummary = () => ({
  opens: 0, firstOpen: null, lastOpen: null, addresses: 0, files: 0, failedUnlocks: 0, refused: 0,
});

/**
 * @param {string[]} publicationIds  every id asked about gets an entry, even with no events
 * @param {{ publication_id:string, event:string, ip?:string|null, created_at:string }[]} rows
 */
export function summariseAccess(publicationIds, rows) {
  const out = Object.fromEntries((publicationIds ?? []).map(id => [id, emptySummary()]));
  const ips = {};
  for (const r of rows ?? []) {
    const s = out[r.publication_id] ?? (out[r.publication_id] = emptySummary());
    if (r.event === 'opened') {
      s.opens += 1;
      if (!s.firstOpen || r.created_at < s.firstOpen) s.firstOpen = r.created_at;
      if (!s.lastOpen || r.created_at > s.lastOpen) s.lastOpen = r.created_at;
      if (r.ip) (ips[r.publication_id] ??= new Set()).add(r.ip);
    } else if (r.event === 'file') s.files += 1;
    else if (r.event === 'unlock_failed') s.failedUnlocks += 1;
    else if (r.event === 'refused_revoked' || r.event === 'refused_expired') s.refused += 1;
  }
  for (const [id, set] of Object.entries(ips)) out[id].addresses = set.size;
  return out;
}

/** "Opened 3 times from 2 addresses, last 3 Nov" — or that it has not been opened. */
export function describeAccess(s, fmt = (v) => v) {
  if (!s || !s.opens) return 'Not opened yet';
  const times = `${s.opens} ${s.opens === 1 ? 'time' : 'times'}`;
  const from = s.addresses ? ` from ${s.addresses} ${s.addresses === 1 ? 'address' : 'addresses'}` : '';
  return `Opened ${times}${from}, last ${fmt(s.lastOpen)}`;
}
