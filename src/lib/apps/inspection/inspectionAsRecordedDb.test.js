// What an inspection result was judged against — the DATABASE half (migration 285,
// 2026-11-07).
//
// ⛔ Runs only when asked, only against DEV, and ALWAYS rolls back:
//     npm run test:db
// It reads DEV_DB_URL from .env and refuses PROD_DB_URL. With
// LH_DB_TEST_MIGRATION=supabase/migrations/285_inspection_as_recorded.sql it applies
// that migration first, inside the same transaction.
//
// What it proves: a result keeps the door, its fixed attributes and the checks as they
// stood, whatever is renamed afterwards; identical wording is stored once; the
// snapshot cannot be changed; a system-level attribute is included; and a snapshot
// that cannot be taken does not stop the result being saved.

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
const asUser = (/** @type {string} */ who) => [
  `reset role;`,
  `select set_config('request.jwt.claims', json_build_object('sub', ${who}, 'role', 'authenticated')::text, true);`,
  `select set_config('request.jwt.claim.sub', (${who})::text, true);`,
  `set local role authenticated;`,
].join('\n');

const must = (/** @type {string} */ cond, /** @type {string} */ what) => `if not coalesce((${cond}), false) then raise exception ${txt(what)}; end if;`;

const R = (/** @type {number} */ n) => `'aaaaaaaa-0000-4000-8000-00000000000${n}'::uuid`;
const DOOR = `(select id from components where type_code = 'door_apartment_door' order by id limit 1)`;
const ROW  = (/** @type {number} */ n) => `(select as_recorded from component_inspections where id = ${R(n)})`;
const SET  = (/** @type {number} */ n) => `(select checks::text from inspection_check_sets where id = ${ROW(n)}->>'checks_set')`;
const add  = (/** @type {number} */ n, comp = DOOR) => `insert into component_inspections (id, component_id, inspection_result) values (${R(n)}, ${comp}, 'ok');`;
const CHECK = `(select ta.id from type_attributes ta join component_types ct on ct.id = ta.component_type_id
  where ct.code = 'door_apartment_door' and ta.checkable order by ta.presentation_order limit 1)`;
const SYSTEM_COMPONENT = `(select c.id from components c
  join component_types ct on ct.code = c.type_code
  join type_attributes ta on ta.building_system_id = ct.building_system_id
  order by c.id limit 1)`;
const SYSTEM_ATTR = `(select ta.name from components c
  join component_types ct on ct.code = c.type_code
  join type_attributes ta on ta.building_system_id = ct.building_system_id
  where c.id = ${SYSTEM_COMPONENT} order by ta.name limit 1)`;

/** @type {Array<[string, string, string|null]>} */
const AS_ADMIN = [
  ['a result saved through the API keeps the door and its checks', `
    ${add(1)}
    ${must(`${ROW(1)}->>'ref' = (select f.short_name || '/' || rtrim(ct.initial) || '/' || c.asset_id
      from components c join floors f on f.id = c.floor_id join component_types ct on ct.code = c.type_code where c.id = ${DOOR})`, 'wrong ref')}
    ${must(`${ROW(1)}#>>'{component,label}' = (select label from components where id = ${DOOR})`, 'wrong label')}
    ${must(`${ROW(1)}#>>'{component,status_before}' = (select status from components where id = ${DOOR})`, 'wrong status')}
    ${must(`${ROW(1)}->'fixed' @> '[{"name":"Rating"}]'`, 'no rating')}
    ${must(`${SET(1)} like '%Hinges%'`, 'no checks')}`, null],
  ['an ordinary user cannot write a set of checks', `insert into inspection_check_sets (id, checks) values ('x', '[]');`, 'row-level security'],
];

/** @type {Array<[string, string, string|null]>} */
const AS_SYSTEM = [
  ['a later rename leaves the result as it was, and a new result sees the new words', `
    update components set label = 'DBT label' where id = ${DOOR};
    update type_attributes set name = 'DBT check', help_notes = 'DBT wording' where id = ${CHECK};
    ${must(`${ROW(1)}#>>'{component,label}' <> 'DBT label'`, 'old row followed the label')}
    ${must(`${SET(1)} not like '%DBT check%'`, 'old set followed the name')}
    ${add(2)}
    ${must(`${ROW(2)}#>>'{component,label}' = 'DBT label'`, 'new row missed the label')}
    ${must(`${SET(2)} like '%DBT check%' and ${SET(2)} like '%DBT wording%'`, 'new set missed the wording')}
    ${must(`${ROW(2)}->>'checks_set' <> ${ROW(1)}->>'checks_set'`, 'a new set was not made')}`, null],
  ['identical wording is stored once', `
    ${add(3)}
    ${must(`${ROW(3)}->>'checks_set' = ${ROW(2)}->>'checks_set'`, 'second copy of a set')}`, null],
  ['the snapshot cannot be changed, and a later save keeps it', `
    update component_inspections set as_recorded = '{}'::jsonb, inspector_notes = 'x' where id = ${R(1)};
    ${must(`${ROW(1)}->>'ref' is not null`, 'snapshot was overwritten')}`, null],
  ['a check held at system level is included', `
    ${add(4, SYSTEM_COMPONENT)}
    ${must(`(${ROW(4)}->'fixed')::text like '%' || ${SYSTEM_ATTR} || '%' or ${SET(4)} like '%' || ${SYSTEM_ATTR} || '%'`, 'system attribute missing')}`, null],
  ['a snapshot that cannot be taken does not stop the result being saved', `
    alter table inspection_check_sets rename to inspection_check_sets_gone;
    ${add(5)}
    alter table inspection_check_sets_gone rename to inspection_check_sets;
    ${must(`${ROW(5)} ? 'error'`, 'no error recorded')}`, null],
];

describe.skipIf(!RUN)('inspection results keep what they were judged against (dev, rolled back)', () => {
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
      asUser(ADMIN),
      ...AS_ADMIN.map(([n, b, p]) => check(`as recorded: ${n}`, b, p)),
      'reset role;',
      ...AS_SYSTEM.map(([n, b, p]) => check(`as recorded: ${n}`, b, p)),
      'rollback;',
    ].join('\n');
    const r = spawnSync(PSQL, [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 50e6 });
    output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    for (const m of output.matchAll(/RESULT\|([^|]*)\|(OK|FAIL)\|(.*)/g)) results.set(m[1], m[2] === 'OK' ? 'OK' : m[3]);
    if (r.status !== 0 && !results.size) throw new Error(`psql failed:\n${output.slice(0, 4000)}`);
  }, 120000);

  for (const [n] of [...AS_ADMIN, ...AS_SYSTEM]) {
    it(`as recorded: ${n}`, () => {
      expect(results.get(`as recorded: ${n}`), output.slice(-3000)).toBe('OK');
    });
  }
});
