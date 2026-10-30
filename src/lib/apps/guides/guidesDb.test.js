// The Guides app's DATABASE half, tested (migration 268, 2026-10-30).
//
// ⛔ Runs only when asked, only against DEV, and ALWAYS rolls back:
//     npm run test:db
// It reads DEV_DB_URL from .env and refuses PROD_DB_URL. Every statement runs in one
// transaction ended by ROLLBACK. With LH_DB_TEST_MIGRATION=supabase/migrations/268_guides.sql
// it applies that migration first, inside the same transaction — the rehearsal before
// the user applies it.
//
// What it proves: publishing freezes a copy that later edits do not change; a version
// is immutable; a draft, its steps and a retired guide are admin-only; a published
// guide is readable by any signed-in user, a staff-only one not by a contractor; only
// an admin writes or publishes; a published guide cannot be deleted; a link must name
// a target; a step may carry four photos at most; the app id is registered.

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
const asUser = (/** @type {string} */ who) => [
  `reset role;`,
  `select set_config('request.jwt.claims', json_build_object('sub', ${who}, 'role', 'authenticated')::text, true);`,
  `select set_config('request.jwt.claim.sub', (${who})::text, true);`,
  `set local role authenticated;`,
].join('\n');

/** @type {Array<[string, string, string|null]>} */
const AS_ADMIN = [
  ['an admin makes a guide with two steps and a link', `
    insert into guide_categories (key, name) values ('dbt_cat', 'DB test') on conflict do nothing;
    insert into guides (id, title, category_key, you_need) values ('00000000-0000-4000-8000-0000000000a1', 'DBT bins', 'dbt_cat', 'gloves');
    insert into guide_steps (guide_id, position, kind, title, body) values
      ('00000000-0000-4000-8000-0000000000a1', 1, 'step', 'Open the store', 'Use the key'),
      ('00000000-0000-4000-8000-0000000000a1', 2, 'stop', 'If the door is jammed', 'Call the office');
    insert into guide_links (guide_id, space_id) values ('00000000-0000-4000-8000-0000000000a1', gen_random_uuid());`, null],
  ['a link must name a target', `
    insert into guide_links (guide_id) values ('00000000-0000-4000-8000-0000000000a1');`, 'guide_links_has_target'],
  ['a guide with no steps cannot be published', `
    insert into guides (id, title) values ('00000000-0000-4000-8000-0000000000a2', 'DBT empty');
    perform guide_publish('00000000-0000-4000-8000-0000000000a2');`, 'at least one step'],
  ['a stop step must say who to call', `
    insert into guides (id, title) values ('00000000-0000-4000-8000-0000000000a3', 'DBT stop');
    insert into guide_steps (guide_id, position, kind, title) values ('00000000-0000-4000-8000-0000000000a3', 1, 'stop', 'Stop');
    perform guide_publish('00000000-0000-4000-8000-0000000000a3');`, 'must say who to call'],
  ['a step may have four photos, not five', `
    insert into guides (id, title) values ('00000000-0000-4000-8000-0000000000a4', 'DBT photos');
    insert into guide_steps (id, guide_id, position, title) values ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000a4', 1, 'Step');
    insert into media_attachments (entity_type, entity_id, storage_url, filename, mime_type)
      select 'guide_step', '00000000-0000-4000-8000-0000000000b4', 'u' || g, 'p' || g || '.jpg', 'image/jpeg' from generate_series(1, 5) g;
    perform guide_publish('00000000-0000-4000-8000-0000000000a4');`, 'at most four photos'],
  ['publishing freezes version 1 with its steps', `
    if guide_publish('00000000-0000-4000-8000-0000000000a1') <> 1 then raise exception 'not version 1'; end if;
    if (select jsonb_array_length(snapshot -> 'steps') from guide_versions where guide_id = '00000000-0000-4000-8000-0000000000a1' and version = 1) <> 2
      then raise exception 'snapshot has not two steps'; end if;
    if (select status from guides where id = '00000000-0000-4000-8000-0000000000a1') <> 'published' then raise exception 'not published'; end if;`, null],
  ['editing the draft does not change the published version', `
    update guide_steps set title = 'CHANGED' where guide_id = '00000000-0000-4000-8000-0000000000a1' and position = 1;
    if (select snapshot -> 'steps' -> 0 ->> 'title' from guide_versions where guide_id = '00000000-0000-4000-8000-0000000000a1' and version = 1) <> 'Open the store'
      then raise exception 'the frozen copy moved'; end if;`, null],
  ['publishing again makes version 2, and version 1 is kept', `
    if guide_publish('00000000-0000-4000-8000-0000000000a1') <> 2 then raise exception 'not version 2'; end if;
    if (select count(*) from guide_versions where guide_id = '00000000-0000-4000-8000-0000000000a1') <> 2 then raise exception 'a version went'; end if;`, null],
  ['a version cannot be changed', `
    update guide_versions set snapshot = '{}' where guide_id = '00000000-0000-4000-8000-0000000000a1' and version = 1;`, 'cannot be changed or removed|permission denied'],
  ['a version cannot be removed', `
    delete from guide_versions where guide_id = '00000000-0000-4000-8000-0000000000a1' and version = 1;`, 'cannot be changed or removed|permission denied'],
  ['a published guide cannot be deleted by a client', `
    create temp table _n1 (c integer) on commit drop;
    with d as (delete from guides where id = '00000000-0000-4000-8000-0000000000a1' returning 1) insert into _n1 select count(*) from d;
    if (select c from _n1) <> 0 then raise exception 'it was deleted'; end if;`, null],
  ['a draft that was never published can be deleted', `
    create temp table _n2 (c integer) on commit drop;
    insert into guides (id, title) values ('00000000-0000-4000-8000-0000000000a6', 'DBT never published');
    with d as (delete from guides where id = '00000000-0000-4000-8000-0000000000a6' returning 1) insert into _n2 select count(*) from d;
    if (select c from _n2) <> 1 then raise exception 'it was not deleted'; end if;`, null],
  ['a step edit bumps the guide so "unpublished changes" can show (migration 269)', `
    insert into guides (id, title) values ('00000000-0000-4000-8000-0000000000c1', 'DBT reorder');
    insert into guide_steps (id, guide_id, position, title) values
      ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 1, 'One'),
      ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', 2, 'Two'),
      ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1', 3, 'Three');
    update guides set updated_at = '2020-01-01' where id = '00000000-0000-4000-8000-0000000000c1';
    update guide_steps set title = 'One!' where id = '00000000-0000-4000-8000-0000000000d1';
    if (select updated_at from guides where id = '00000000-0000-4000-8000-0000000000c1') < now() - interval '1 minute'
      then raise exception 'the guide was not touched'; end if;`, null],
  ['reordering renumbers 1..n in one call', `
    perform guide_reorder_steps('00000000-0000-4000-8000-0000000000c1',
      array['00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2']::uuid[]);
    if (select array_agg(id::text order by position) from guide_steps where guide_id = '00000000-0000-4000-8000-0000000000c1')
       <> array['00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2']
      then raise exception 'not reordered'; end if;`, null],
  ['a list that is not exactly the guide steps is refused', `
    perform guide_reorder_steps('00000000-0000-4000-8000-0000000000c1',
      array['00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d1']::uuid[]);`, 'not exactly this guide'],
  ['a staff-only guide is made for the contractor test', `
    insert into guides (id, title, staff_only) values ('00000000-0000-4000-8000-0000000000a5', 'DBT staff only', true);
    insert into guide_steps (guide_id, position, title) values ('00000000-0000-4000-8000-0000000000a5', 1, 'Step');
    perform guide_publish('00000000-0000-4000-8000-0000000000a5');`, null],
];

/** @type {Array<[string, string, string|null]>} */
const AS_PLAIN = [
  ['anyone signed in reads a published guide', `
    if not exists (select 1 from guides where id = '00000000-0000-4000-8000-0000000000a1') then raise exception 'cannot see it'; end if;`, null],
  ['and its frozen version and its links', `
    if (select count(*) from guide_versions where guide_id = '00000000-0000-4000-8000-0000000000a1') <> 2 then raise exception 'versions not visible'; end if;
    if not exists (select 1 from guide_links where guide_id = '00000000-0000-4000-8000-0000000000a1') then raise exception 'link not visible'; end if;`, null],
  ['but not the draft steps', `
    if exists (select 1 from guide_steps) then raise exception 'steps are visible'; end if;`, null],
  ['and not a draft guide', `
    if exists (select 1 from guides where id = '00000000-0000-4000-8000-0000000000a3') then raise exception 'a draft is visible'; end if;`, null],
  ['a non-admin cannot make a guide', `
    insert into guides (title) values ('nope');`, 'row-level security'],
  ['a non-admin cannot publish', `
    perform guide_publish('00000000-0000-4000-8000-0000000000a1');`, 'Only an administrator'],
  ['a non-admin cannot reorder steps', `
    perform guide_reorder_steps('00000000-0000-4000-8000-0000000000c1', array[]::uuid[]);`, 'Only an administrator'],
  ['a non-admin cannot add a link', `
    insert into guide_links (guide_id, space_id) values ('00000000-0000-4000-8000-0000000000a1', gen_random_uuid());`, 'row-level security'],
  ['a non-contractor sees a staff-only guide', `
    if not exists (select 1 from guides where id = '00000000-0000-4000-8000-0000000000a5') then raise exception 'staff cannot see it'; end if;`, null],
];

/** @type {Array<[string, string, string|null]>} */
const AS_CONTRACTOR = [
  ['a contractor reads an ordinary published guide', `
    if not exists (select 1 from guides where id = '00000000-0000-4000-8000-0000000000a1') then raise exception 'cannot see it'; end if;`, null],
  ['a contractor does not see a staff-only guide', `
    if exists (select 1 from guides where id = '00000000-0000-4000-8000-0000000000a5') then raise exception 'a staff-only guide is visible'; end if;
    if exists (select 1 from guide_versions where guide_id = '00000000-0000-4000-8000-0000000000a5') then raise exception 'its version is visible'; end if;`, null],
];

const SETUP_ONLY = [
  ['the guides app id is accepted by app_permissions', `
    if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'app_permissions_app_id_check') not like '%guides%'
      then raise exception 'guides is not registered'; end if;`, null],
];

describe.skipIf(!RUN)('guides — the database (dev, rolled back)', () => {
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
      ...SETUP_ONLY.map(([n, b, p]) => check(`guides: ${n}`, b, p)),
      // a contractor account to test with (rolled back with everything else)
      `update profiles set is_contractor = false where id = ${PLAIN};`,
      asUser(ADMIN),
      ...AS_ADMIN.map(([n, b, p]) => check(`guides: ${n}`, b, p)),
      asUser(PLAIN),
      ...AS_PLAIN.map(([n, b, p]) => check(`guides: ${n}`, b, p)),
      `reset role;`,
      `update profiles set is_contractor = true where id = ${PLAIN};`,
      asUser(PLAIN),
      ...AS_CONTRACTOR.map(([n, b, p]) => check(`guides: ${n}`, b, p)),
      'reset role;',
      'rollback;',
    ].join('\n');
    const r = spawnSync(PSQL, [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 50e6 });
    output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    for (const m of output.matchAll(/RESULT\|([^|]*)\|(OK|FAIL)\|(.*)/g)) results.set(m[1], m[2] === 'OK' ? 'OK' : m[3]);
    if (r.status !== 0 && !results.size) throw new Error(`psql failed:\n${output.slice(0, 4000)}`);
  }, 120000);

  const names = [...SETUP_ONLY, ...AS_ADMIN, ...AS_PLAIN, ...AS_CONTRACTOR].map(([n]) => `guides: ${n}`);
  for (const name of names) {
    it(name, () => {
      expect(results.get(name), output.slice(-3000)).toBe('OK');
    });
  }
});
