// Floor groups — the DATABASE half (migration 280).
//
// ⛔ Runs only when asked, only against DEV, and ALWAYS rolls back:
//     npm run test:db
// With LH_DB_TEST_MIGRATION=supabase/migrations/280_floor_groups.sql it applies
// that migration first, inside the same transaction.
//
// What it proves: this building's two groups hold the right floors (Basement
// has Upper Basement and not Ground); floor_group_save changes a group and its
// floors together; an ordinary user reads groups and cannot change them; two
// groups cannot share a name; deleting a group leaves its floors alone.

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

function check(/** @type {string} */ name, /** @type {string} */ body, /** @type {string|null} */ pattern) {
  const n = txt(name);
  return `do $t$ declare v_id uuid; begin
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
const asUser = (/** @type {string} */ who) => [
  `reset role;`,
  `select set_config('request.jwt.claims', json_build_object('sub', ${who}, 'role', 'authenticated')::text, true);`,
  `select set_config('request.jwt.claim.sub', (${who})::text, true);`,
  `set local role authenticated;`,
].join('\n');

const members = (/** @type {string} */ name) => `(select array_agg(f.short_name order by f.level_order) from floor_group_floors m
  join floors f on f.id = m.floor_id join floor_groups g on g.id = m.group_id where g.name = ${txt(name)})`;
const floorIds = (/** @type {string} */ list) => `(select array_agg(id) from floors where short_name in (${list}))`;

/** @type {Array<[string, string, string|null]>} */
const AS_PLAIN = [
  ['an ordinary user reads the groups', `if (select count(*) from floor_groups) < 2 then raise exception 'cannot see them'; end if;`, null],
  ['an ordinary user cannot make a group', `perform floor_group_save(null, 'Nope', 99, '{}');`, 'row-level security'],
];

/** @type {Array<[string, string, string|null]>} */
const AS_ADMIN = [
  ['Basement holds X, L and U, and not Ground', `if ${members('Basement')} is distinct from array['X','L','U'] then raise exception 'wrong: %', ${members('Basement')}; end if;`, null],
  ['Residential holds Ground to Seventh', `if ${members('Residential')} is distinct from array['G','1','2','3','4','5','6','7'] then raise exception 'wrong: %', ${members('Residential')}; end if;`, null],
  ['an admin adds External with its floors', `v_id := floor_group_save(null, ' External ', 30, ${floorIds(`'S','W','N'`)});
    if ${members('External')} is distinct from array['S','W','N'] then raise exception 'wrong floors'; end if;`, null],
  ['saving again replaces the floors', `select id into v_id from floor_groups where name = 'External';
    perform floor_group_save(v_id, 'External', 30, ${floorIds(`'S'`)});
    if ${members('External')} is distinct from array['S'] then raise exception 'not replaced'; end if;`, null],
  ['a floor can be in two groups', `select id into v_id from floor_groups where name = 'External';
    perform floor_group_save(v_id, 'External', 30, ${floorIds(`'G'`)});
    if ${members('Residential')}[1] <> 'G' then raise exception 'lost from Residential'; end if;`, null],
  ['two groups cannot share a name, whatever the case', `perform floor_group_save(null, 'BASEMENT', 40, '{}');`, 'floor_groups_name_unique|duplicate'],
  ['a blank name is refused', `perform floor_group_save(null, '   ', 40, '{}');`, 'floor_groups_name_check'],
  ['deleting a group leaves its floors', `delete from floor_groups where name = 'External';
    if not exists (select 1 from floors where short_name = 'G') then raise exception 'floor gone'; end if;
    if exists (select 1 from floor_group_floors m where not exists (select 1 from floor_groups g where g.id = m.group_id)) then raise exception 'members left behind'; end if;`, null],
];

describe.skipIf(!RUN)('floor groups (dev, rolled back)', () => {
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
      'begin;', migration,
      asUser(PLAIN), ...AS_PLAIN.map(([n, b, p]) => check(`floors: ${n}`, b, p)),
      asUser(ADMIN), ...AS_ADMIN.map(([n, b, p]) => check(`floors: ${n}`, b, p)),
      'reset role;', 'rollback;',
    ].join('\n');
    const r = spawnSync(PSQL, [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 50e6 });
    output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    for (const m of output.matchAll(/RESULT\|([^|]*)\|(OK|FAIL)\|(.*)/g)) results.set(m[1], m[2] === 'OK' ? 'OK' : m[3]);
    if (r.status !== 0 && !results.size) throw new Error(`psql failed:\n${output.slice(0, 4000)}`);
  }, 120000);

  for (const [n] of [...AS_PLAIN, ...AS_ADMIN]) {
    it(`floors: ${n}`, () => {
      expect(results.get(`floors: ${n}`), output.slice(-3000)).toBe('OK');
    });
  }
});
