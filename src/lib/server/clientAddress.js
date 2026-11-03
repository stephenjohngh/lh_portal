// src/lib/server/clientAddress.js
// WHO IS ASKING — the one rule for a visitor's internet address (2026-11-03).
//
// The login lockout, every public rate limit, the Dossier access log and the
// audit log all key on it. They used three different methods, and the audit log
// trusted the FIRST x-forwarded-for entry, which a caller writes himself. Now
// hooks.server.js works the address out once per request (resolveClientAddress)
// and remembers it against the request; everything else asks clientAddressOf().
//
// The order, most trusted first:
//   1. x-nf-client-connection-ip — set by Netlify itself; a caller cannot set it.
//   2. SvelteKit's own address (getClientAddress), when it is a PUBLIC address.
//      Netlify: the visitor. adapter-node (Northflank): the visitor only when the
//      host sets ADDRESS_HEADER (and XFF_DEPTH); otherwise the connection, which
//      behind a load balancer is the balancer's private address.
//   3. The LAST x-forwarded-for entry — the one added by the proxy nearest us.
//      Right when the host's proxy appends to the header (most do); a caller can
//      only add entries to the LEFT of it.
//   4. x-real-ip.
//   5. The connection's own (private) address.
//   6. '0.0.0.0' — unknown.
// ⚠ Which of these a deployment actually uses is shown to an admin at
// Admin → Limits and timing → Visitor address. Check it after moving host.

/** @typedef {'netlify'|'platform'|'forwarded'|'real-ip'|'connection'|'unknown'} AddressSource */
/** @typedef {{ address: string, source: AddressSource, connection: string|null }} ResolvedAddress */

export const UNKNOWN_ADDRESS = '0.0.0.0';

/**
 * Is this an address no visitor on the internet can have — a private network,
 * loopback, link-local, carrier NAT, or the IPv6 equivalents? A load balancer's
 * address is one of these.
 * @param {string|null|undefined} ip
 */
export function isPrivateAddress(ip) {
  if (!ip) return true;
  let a = String(ip).trim().toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7);            // IPv4 written as IPv6
  const v4 = a.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [p, q] = [Number(v4[1]), Number(v4[2])];
    return p === 10 || p === 127 || p === 0
      || (p === 172 && q >= 16 && q <= 31)
      || (p === 192 && q === 168)
      || (p === 169 && q === 254)
      || (p === 100 && q >= 64 && q <= 127);               // carrier-grade NAT
  }
  return a === '::1' || a === '::' || /^f[cd]/.test(a) || /^fe[89ab]/.test(a);
}

/** @param {Request} request @param {string} name */
function header(request, name) {
  const v = request?.headers?.get?.(name);
  return v ? v.trim() : '';
}

/** The last entry of x-forwarded-for, or ''. @param {Request} request */
export function lastForwarded(request) {
  const parts = header(request, 'x-forwarded-for').split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

/**
 * Work out the visitor's address, saying where it came from.
 * @param {{ request: Request, getClientAddress?: () => string }} event
 * @returns {ResolvedAddress}
 */
export function resolveClientAddress({ request, getClientAddress }) {
  let connection = null;
  try { connection = getClientAddress?.() || null; } catch { connection = null; }

  const netlify = header(request, 'x-nf-client-connection-ip');
  if (netlify) return { address: netlify, source: 'netlify', connection };

  if (connection && !isPrivateAddress(connection)) return { address: connection, source: 'platform', connection };

  const forwarded = lastForwarded(request);
  if (forwarded) return { address: forwarded, source: 'forwarded', connection };

  const realIp = header(request, 'x-real-ip');
  if (realIp) return { address: realIp, source: 'real-ip', connection };

  if (connection) return { address: connection, source: 'connection', connection };
  return { address: UNKNOWN_ADDRESS, source: 'unknown', connection };
}

const remembered = new WeakMap();

/** Called once per request by hooks.server.js. @param {Request} request @param {ResolvedAddress} resolved */
export function rememberClientAddress(request, resolved) {
  if (request && resolved) remembered.set(request, resolved);
}

/**
 * The visitor's address for this request: what the hook worked out, or — where
 * no hook ran (a test, a script) — the same rule from what is to hand.
 * @param {Request} request
 * @param {() => string} [getClientAddress]
 * @returns {string}
 */
export function clientAddressOf(request, getClientAddress) {
  return (remembered.get(request) ?? resolveClientAddress({ request, getClientAddress })).address;
}

/** The full answer for this request, for the admin check. @param {Request} request */
export function resolvedAddressOf(request) {
  return remembered.get(request) ?? resolveClientAddress({ request });
}

/**
 * The raw headers an address could come from, for the admin check — shown, never used.
 * @param {Request} request
 */
export function addressHeadersSeen(request) {
  return Object.fromEntries(
    ['x-nf-client-connection-ip', 'x-forwarded-for', 'x-real-ip', 'forwarded', 'cf-connecting-ip', 'true-client-ip']
      .map((n) => [n, header(request, n) || null]));
}

/**
 * What an administrator should make of it — the Visitor address check.
 * @param {ResolvedAddress} r
 * @returns {{ level: 'ok'|'check'|'problem', message: string }}
 */
export function addressVerdict(r) {
  if (r.source === 'netlify') return { level: 'ok', message: 'Netlify names the visitor itself; nobody can change it.' };
  if (r.source === 'platform') return { level: 'ok', message: 'The server was told which header to trust, and it gives a public address.' };
  if (r.source === 'forwarded' || r.source === 'real-ip') {
    return { level: 'check', message: 'Taken from a header the host’s proxy is expected to add. Correct if the address below is your own; if it is not, set ADDRESS_HEADER and XFF_DEPTH on the host.' };
  }
  return { level: 'problem', message: 'Every visitor looks the same here, so the sign-in lockout and the rate limits treat everyone as one person. Set ADDRESS_HEADER and XFF_DEPTH on the host.' };
}
