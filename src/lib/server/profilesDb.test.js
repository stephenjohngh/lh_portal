// Who may change a person's profile — the DATABASE half (migration 279, 2026-11-03).
//
// ⛔ Runs only when asked, only against DEV, and ALWAYS rolls back:
//     npm run test:db
// It reads DEV_DB_URL from .env and refuses PROD_DB_URL. With
// LH_DB_TEST_MIGRATION=supabase/migrations/279_profile_short_name.sql it applies
// that migration first, inside the same transaction.
//
// What it proves: an ordinary user can no longer change their own name, short
// name or contractor flag (the "own update" policy let them, and the guard
// covered only is_admin and is_read_only); an admin can; two people cannot share
// a short name, whatever the case; a short name with a space is refused.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const RUN = process.env.LH_DB_TESTS === 'dev';
const PSQL = process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe' : 'psql';

/** @returns {Record<string, string>} */
function readEnv() {
  if (!existsSync('.env')) return {};
  return Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
    .map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(l))
    .filter(Boolean).map((m) => [/** @type {any} */ (m)[1], /** @type {any} */ (m)[2].replace(/^["']|["']$/g, '')]));
}

const txt = (/** @type {string} */ v) => `'${v.replace(/'/g, "''")}'`;

/** One check: run `body` (plpgsql), expect an error matching `pattern`, or none when pattern is null. */
function check(/** @type {string} */ name, /** @type {string} */ body, /** @type {string|null} */ pattern) {
  const n = txt(name);
  return `do $t$ begin
  begin
    ${body}
    raise notice 'RESULT|%|%', ${n}, ${pattern ? `'FAIL|it was accepted'` : `'OK|'`};
  exception when others then
    if sqlerrm like 'RESULT|%' then raise; end if;
    raise notice 'RESULT|%|%', ${n}, case when ${pattern ? `sqlerrm ~ ${txt(pattern)}` : 'false'} then 'OK|' else 'FAIL|' || sqlerrm end;
  end;
end $t$;`;
}

const ADMIN = `(select id from profiles where is_admin order by created_at limit 1)`;
const PLAIN = `(select id from profiles where not is_admin order by created_at limit 1)`;
const OTHER = `(select id from profiles where not is_admin order by created_at offset 1 limit 1)`;
const asUser = (/** @type {string} */ who) => [
  `reset role;`,
  `select set_config('request.jwt.claims', json_build_object('sub', ${who}, 'role', 'authenticated')::text, true);`,
  `select set_config('request.jwt.claim.sub', (${who})::text, true);`,
  `set local role authenticated;`,
].join('\n');

// An UPDATE refused by a trigger raises; one hidden by RLS changes no row, so the
// check confirms a row really changed where it should.
const changed = (/** @type {string} */ sql) => `${sql}\n    if not found then raise exception 'no row changed'; end if;`;

/** @type {Array<[string, string, string|null]>} */
const AS_PLAIN = [
  ['a user cannot change their own name', changed(`update profiles set full_name = 'Someone Else' where id = ${PLAIN};`), 'Only an admin'],
  ['a user cannot set their own short name', changed(`update profiles set short_name = 'ZZ' where id = ${PLAIN};`), 'Only an admin'],
  ['a user cannot change their own contractor flag', changed(`update profiles set is_contractor = not is_contractor where id = ${PLAIN};`), 'Only an admin'],
];

/** @type {Array<[string, string, string|null]>} */
const AS_ADMIN = [
  ['an admin sets a person\u2019s name and short name', changed(`update profiles set full_name = 'DBT Person', short_name = 'DBT1' where id = ${PLAIN};`), null],
  ['two people cannot share a short name, whatever the case', changed(`update profiles set short_name = 'dbt1' where id = ${OTHER};`), 'profiles_short_name_unique|duplicate'],
  ['a short name with a space is refused', changed(`update profiles set short_name = 'D B' where id = ${OTHER};`), 'profiles_short_name_check'],
  ['a short name can be cleared', changed(`update profiles set short_name = null where id = ${PLAIN};`), null],
];

describe.skipIf(!RUN)('profiles — who may change a person (dev, rolled back)', () => {
  /** @type {Map<string, string>} */
  const results = new Map();
  let output = '';

  beforeAll(() => {
    const env = { ...readEnv(), ...process.env };
    const url = env.DEV_DB_URL;
    if (!url) throw new Error('DEV_DB_URL is not set in .env');
    if (env.PROD_DB_URL && url === env.PROD_DB_URL) throw new Error('DEV_DB_URL is the production database — refusing');
    let migration = '';
    if (env.LH_DB_TEST_MIGRATION) {
      migration = readFileSync(env.LH_DB_TEST_MIGRATION, 'utf8').replace(/^\s*begin\s*;\s*$/gim, '').replace(/^\s*commit\s*;\s*$/gim, '');
    }
    const sql = [
      'begin;',
      migration,
      asUser(PLAIN),
      ...AS_PLAIN.map(([n, b, p]) => check(`profiles: ${n}`, b, p)),
      asUser(ADMIN),
      ...AS_ADMIN.map(([n, b, p]) => check(`profiles: ${n}`, b, p)),
      'reset role;',
      'rollback;',
    ].join('\n');
    const r = spawnSync(PSQL, [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 50e6 });
    output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    for (const m of output.matchAll(/RESULT\|([^|]*)\|(OK|FAIL)\|(.*)/g)) results.set(m[1], m[2] === 'OK' ? 'OK' : m[3]);
    if (r.status !== 0 && !results.size) throw new Error(`psql failed:\n${output.slice(0, 4000)}`);
  }, 120000);

  for (const [n] of [...AS_PLAIN, ...AS_ADMIN]) {
    it(`profiles: ${n}`, () => {
      expect(results.get(`profiles: ${n}`), output.slice(-3000)).toBe('OK');
    });
  }
});
