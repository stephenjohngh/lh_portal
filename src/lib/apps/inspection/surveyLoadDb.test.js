// Loading an outside survey — the DATABASE half (migration 287, 2026-11-08).
//
// ⛔ Runs only when asked, only against DEV, and ALWAYS rolls back:
//     npm run test:db
// With LH_DB_TEST_MIGRATION=supabase/migrations/28N_….sql it applies
// that migration first, inside the same transaction.
//
// What it proves: only an administrator can load; the evidence must be attached
// first; each row keeps its own time; one closed session per survey day; a status
// changes only for a result newer than the one held, and never for no access; the
// same file cannot be loaded twice; loaded results cannot be changed; and an undo
// keeps the record, removes the results and puts the status back.

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

const ADMIN    = `(select id from profiles where is_admin order by created_at limit 1)`;
const NOTADMIN = `(select id from profiles where not is_admin order by created_at limit 1)`;
const asUser = (/** @type {string} */ who) => [
  `reset role;`,
  `select set_config('request.jwt.claims', json_build_object('sub', ${who}, 'role', 'authenticated')::text, true);`,
  `select set_config('request.jwt.claim.sub', (${who})::text, true);`,
  `set local role authenticated;`,
].join('\n');
const must = (/** @type {string} */ cond, /** @type {string} */ what) => `if not coalesce((${cond}), false) then raise exception ${txt(what)}; end if;`;

const SID  = `'bbbbbbbb-0000-4000-8000-000000000001'::uuid`;
const SID2 = `'bbbbbbbb-0000-4000-8000-000000000002'::uuid`;
const DOC  = (/** @type {number} */ n) => `'cccccccc-0000-4000-8000-00000000000${n}'::uuid`;
const OB   = `(select id from statutory_obligations order by created_at limit 1)`;
// Components with no results except this test's own (any type: survey_load does not
// check scope). A survey left on dev, such as the Spartafire load, must not decide
// where an undo puts a status back.
const DOOR = (/** @type {number} */ n) => `(select c.id from components c
  where not exists (select 1 from component_inspections ci join walk_sessions ws on ws.id = ci.walk_session_id
                     where ci.component_id = c.id and ws.survey_id is distinct from ${SID})
  order by c.id offset ${n} limit 1)`;

const survey = (/** @type {string} */ id, /** @type {string} */ sha, /** @type {number} */ d1, /** @type {number} */ d2) =>
  `jsonb_build_object('id', ${id}, 'definition_id', ${OB}, 'firm', 'DBT Firm', 'reference', 'DBT-1',
    'template_version', 'survey-template/1', 'file_sha256', ${txt(sha)},
    'report_document_id', ${DOC(d1)}, 'file_document_id', ${DOC(d2)})`;

// Door 0: Failed on 4 Oct, OK on 6 Oct (status follows the 6th). Door 1: no access only.
// Door 2: Failed, but older than the status it holds (set in AS_SYSTEM below).
const ROWS = `jsonb_build_array(
  jsonb_build_object('component_id', ${DOOR(0)}, 'inspected_at', '2026-10-04T09:15:00Z', 'result', 'failed', 'checklist_results', '{}'::jsonb, 'readings', '{}'::jsonb, 'seen_by', 'A Surveyor', 'source_ref', 'Sheet 12'),
  jsonb_build_object('component_id', ${DOOR(0)}, 'inspected_at', '2026-10-06T08:05:00Z', 'result', 'ok'),
  jsonb_build_object('component_id', ${DOOR(1)}, 'inspected_at', '2026-10-04T11:00:00Z', 'time_recorded', false, 'result', 'no_access', 'no_access_reason', 'no_answer'),
  jsonb_build_object('component_id', ${DOOR(2)}, 'inspected_at', '2026-10-04T10:00:00Z', 'result', 'failed'))`;

const docs = (/** @type {string} */ id, /** @type {number} */ a, /** @type {number} */ b) => `
  insert into document_library (id, provider_file_id, filename, entity_type, entity_id) values
    (${DOC(a)}, 'dbt-${a}', 'report.pdf', 'inspection_survey', ${id}),
    (${DOC(b)}, 'dbt-${b}', 'survey.xlsx', 'inspection_survey', ${id});`;

/** @type {Array<[string, string, string|null]>} */
const AS_SYSTEM_BEFORE = [
  ['set up: the evidence, and a door whose status is newer than the survey', `
    ${docs(SID, 1, 2)}
    update components set status = 'ok', status_set_at = '2026-11-01T09:00:00Z' where id = ${DOOR(2)};
    update components set status = 'ok', status_set_at = null where id in (${DOOR(0)}, ${DOOR(1)});`, null],
];

/** @type {Array<[string, string, string|null]>} */
const AS_NOT_ADMIN = [
  ['an ordinary user cannot load a survey', `perform survey_load(${survey(SID, 'dbt-sha-1', 1, 2)}, ${ROWS});`, 'Only an administrator'],
];

/** @type {Array<[string, string, string|null]>} */
const AS_ADMIN = [
  ['a load with no evidence attached is refused', `perform survey_load(${survey(SID2, 'dbt-sha-2', 3, 4)}, ${ROWS});`, 'must both be attached'],
  ['a load makes one closed session per day, each row with its own time', `
    perform survey_load(${survey(SID, 'dbt-sha-1', 1, 2)}, ${ROWS});
    ${must(`(select count(*) from walk_sessions where survey_id = ${SID} and status = 'closed' and session_type = 'survey') = 2`, 'not two sessions')}
    ${must(`(select started_at from walk_sessions where survey_id = ${SID} order by started_at limit 1) = '2026-10-04T09:15:00Z'`, 'day started at the wrong time')}
    ${must(`(select closed_at from walk_sessions where survey_id = ${SID} order by started_at limit 1) = '2026-10-04T10:00:00Z'`, 'day closed at the wrong time (288: an untimed row at midday must not stretch it)')}
    ${must(`(select count(*) from component_inspections ci join walk_sessions ws on ws.id = ci.walk_session_id where ws.survey_id = ${SID}) = 4`, 'not four results')}
    ${must(`exists (select 1 from component_inspections where component_id = ${DOOR(0)} and inspected_at = '2026-10-04T09:15:00Z' and seen_by = 'A Surveyor' and source_ref = 'Sheet 12')`, 'row lost its time or source')}
    ${must(`exists (select 1 from component_inspections where component_id = ${DOOR(1)} and not time_recorded)`, 'no-time flag lost')}
    ${must(`(select rows_loaded from inspection_surveys where id = ${SID}) = 4`, 'survey record wrong')}`, null],
  ['the status follows the newest result, and no access changes nothing', `
    ${must(`(select status from components where id = ${DOOR(0)}) = 'ok' and (select status_set_at from components where id = ${DOOR(0)}) = '2026-10-06T08:05:00Z'`, 'status not from the newest result')}
    ${must(`(select status from components where id = ${DOOR(1)}) = 'ok'`, 'no access changed the status')}
    ${must(`(select status from components where id = ${DOOR(2)}) = 'ok'`, 'an older result changed the status')}`, null],
  ['the same file cannot be loaded twice', `perform survey_load(${survey(SID2, 'dbt-sha-1', 1, 2)}, ${ROWS});`, 'already been loaded'],
  ['a loaded result cannot be changed', `update component_inspections set inspector_notes = 'x' where component_id = ${DOOR(0)} and inspected_at = '2026-10-04T09:15:00Z';`, 'loaded from a survey'],
  ['a loaded session cannot be deleted', `delete from walk_sessions where survey_id = ${SID};`, 'loaded from a survey'],
  ['an undo needs a reason', `perform survey_undo(${SID}, ' ');`, 'Say why'],
  ['an undo keeps the record, removes the results and puts the status back', `
    perform survey_undo(${SID}, 'Wrong doors');
    ${must(`(select undone_reason from inspection_surveys where id = ${SID}) = 'Wrong doors'`, 'record not kept')}
    ${must(`not exists (select 1 from walk_sessions where survey_id = ${SID})`, 'sessions not removed')}
    ${must(`(select status_set_at from components where id = ${DOOR(2)}) = '2026-11-01T09:00:00Z'`, 'undo touched a status the load did not set')}
    ${must(`(select status from components where id = ${DOOR(0)}) = 'ok' and not exists (select 1 from component_inspections where component_id = ${DOOR(0)} and inspected_at in ('2026-10-04T09:15:00Z', '2026-10-06T08:05:00Z'))`, 'door 0 not put back')}`, null],
  ['after an undo the same file can be loaded again', `
    perform survey_load(${survey(SID2, 'dbt-sha-1', 3, 4)}, ${ROWS});`, 'must both be attached'],
];

describe.skipIf(!RUN)('survey load (dev, rolled back)', () => {
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
      ...AS_SYSTEM_BEFORE.map(([n, b, p]) => check(`survey: ${n}`, b, p)),
      asUser(NOTADMIN),
      ...AS_NOT_ADMIN.map(([n, b, p]) => check(`survey: ${n}`, b, p)),
      asUser(ADMIN),
      ...AS_ADMIN.map(([n, b, p]) => check(`survey: ${n}`, b, p)),
      'rollback;',
    ].join('\n');
    const r = spawnSync(PSQL, [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 50e6 });
    output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    for (const m of output.matchAll(/RESULT\|([^|]*)\|(OK|FAIL)\|(.*)/g)) results.set(m[1], m[2] === 'OK' ? 'OK' : m[3]);
    if (r.status !== 0 && !results.size) throw new Error(`psql failed:\n${output.slice(0, 4000)}`);
  }, 120000);

  for (const [n] of [...AS_SYSTEM_BEFORE, ...AS_NOT_ADMIN, ...AS_ADMIN]) {
    it(`survey: ${n}`, () => {
      expect(results.get(`survey: ${n}`), output.slice(-3000)).toBe('OK');
    });
  }
});
