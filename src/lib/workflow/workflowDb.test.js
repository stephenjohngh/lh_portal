// The workflow manager's DATABASE half, tested (2026-10-18 review). Until now
// workflow_save() and workflow_move() — the code every process depends on —
// had only been rehearsed by hand in rolled-back transactions, and nothing
// held them to the browser's copy of the rules.
//
// ⛔ Runs only when asked, only against DEV, and ALWAYS rolls back:
//     npm run test:db
// ⚠ It expects the Complaints workflow to be set up on dev (an admin opening
// Complaints does it). It reads DEV_DB_URL from .env and refuses a URL that is PROD_DB_URL. Every
// statement runs inside one transaction ended by ROLLBACK, so nothing it does
// is kept. With LH_DB_TEST_MIGRATION=supabase/migrations/NNN_x.sql it runs that
// migration first, inside the same transaction — a rehearsal before applying.
//
// It sends the SHARED list of workflows that must be refused
// (workflowSaveCases.test-helper.js) to workflow_save(), then plays through
// the runtime rules: opening a case, the fields a move needs, the history of a
// field change, a save over somebody else's, a deleted subject, a complaint's
// clock from its receipt, a bank holiday re-dating a deadline.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SAVE_CASES } from './workflowSaveCases.test-helper.js';
import { DEFAULT_COMPLIANCE_ACTION_WORKFLOW as ACTION_WF } from '#lib/apps/compliance/utils/complianceActionWorkflow.js';
import { DEFAULT_WORKS_SCHEDULE_WORKFLOW as WORKS_WF } from '#lib/apps/building_assets/utils/worksScheduleWorkflow.js';
import { DEFAULT_MAINTENANCE_JOB_WORKFLOW as JOB_WF } from '#lib/apps/maintenance/utils/maintenanceJobWorkflow.js';

const RUN = process.env.LH_DB_TESTS === 'dev';
const PSQL = process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe' : 'psql';

/** @returns {Record<string, string>} */
function readEnv() {
  if (!existsSync('.env')) return {};
  return Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
    .map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(l))
    .filter(Boolean).map((m) => [/** @type {any} */ (m)[1], /** @type {any} */ (m)[2].replace(/^["']|["']$/g, '')]));
}

const lit = (/** @type {any} */ v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
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

/** A save case as a call to workflow_save(). */
function saveCall(/** @type {any} */ c, /** @type {number} */ i) {
  const steps = c.steps.map((/** @type {any} */ s, /** @type {number} */ n) => ({ ...s, position: n + 1 }));
  const moves = c.moves.map((/** @type {any} */ m, /** @type {number} */ n) => ({ ...m, position: n + 1 }));
  return `perform workflow_save('dbtest_${i}', 'DB test ${i}', ${txt(c.appId)}, null, ${lit(steps)}, ${lit(moves)}, null, null, null, ${lit(c.fields ?? [])}, null);`;
}

const actionSave = `perform workflow_save('compliance_action', ${txt(ACTION_WF.name)}, 'compliance', null,
      ${lit(ACTION_WF.steps.map((x, n) => ({ ...x, position: n + 1 })))},
      ${lit(ACTION_WF.moves.map((m, n) => ({ ...m, position: n + 1 })))}, null, null, null, '[]', null);`;
// An action still OPEN on dev, chosen once (dev's own actions are moved by hand
// in browser tests, so naming one — A1 was — breaks the run).
const ACT = `(select template_key from dbtest_action)`;
const worksSave = `perform workflow_save('works_schedule', ${txt(WORKS_WF.name)}, 'building_assets', null,
      ${lit(WORKS_WF.steps.map((x, n) => ({ ...x, position: n + 1 })))},
      ${lit(WORKS_WF.moves.map((m, n) => ({ ...m, position: n + 1 })))}, null, null, null, '[]', null);`;
const worksItem = `(select i.id from workflow_items i join works_schedules w on w.id = i.subject_id where w.title = 'DB test works')`;
const jobSave = `perform workflow_save('maintenance_job', ${txt(JOB_WF.name)}, 'maintenance', null,
      ${lit(JOB_WF.steps.map((x, n) => ({ ...x, position: n + 1 })))},
      ${lit(JOB_WF.moves.map((m, n) => ({ ...m, position: n + 1 })))}, null, null, null, '[]', null);`;
const jobItem = `(select i.id from workflow_items i join maintenance_jobs j on j.id = i.subject_id where j.title = 'DB test job')`;
const ADMIN_CLAIMS = `perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where is_admin order by created_at limit 1), 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', (select id::text from profiles where is_admin order by created_at limit 1), true);`;
/** Act as a non-admin: the job's contractor (true) or someone else (false). */
const asNonAdmin = (/** @type {boolean} */ contractor) => {
  const who = `(select p.id from profiles p where not p.is_admin
      and ${contractor ? '' : 'not '}exists (select 1 from maintenance_jobs j where j.title = 'DB test job' and j.contractor_id = p.id)
      and not exists (select 1 from app_permissions a where a.user_id = p.id and a.app_id = 'maintenance' and not a.is_read_only)
      order by p.created_at limit 1)`;
  return `perform set_config('request.jwt.claims', json_build_object('sub', ${who}, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', ${who}::text, true);`;
};
const firstAction = `(select i.id from workflow_items i join statutory_register r on r.id = i.subject_id where r.template_key = ${ACT})`;

/** The runtime checks, in order; each sees what the ones before it did. */
const RUNTIME = [
  ['set up a Cases process with a needed field and a field a move needs', `
    perform workflow_save('dbtest_case', 'DB test case', 'cases', null,
      '[{"key":"open","name":"Open","kind":"start","position":1,"deadline_days":5,"deadline_basis":"working","deadline_from":"started"},{"key":"done","name":"Done","kind":"done","position":2}]',
      '[{"from_key":"open","to_key":"done","label":"Finish","required_fields":["ok"],"position":1}]',
      null, null, null,
      '[{"key":"contractor","label":"Contractor","type":"text","required_on_create":true,"position":1},{"key":"ok","label":"Checked","type":"yes_no","position":2}]', null);`, null],
  ['a case is not opened without a field needed to open it', `
    perform case_open((select id from workflows where key = 'dbtest_case'), 'T', null, '{}');`, 'Fill in "Contractor" to open a case'],
  ['a case opens with it, its values on its item', `
    perform case_open((select id from workflows where key = 'dbtest_case'), 'T', null, '{"contractor":"ACME"}');
    if (select i.fields->>'contractor' from workflow_items i join cases c on c.id = i.subject_id where c.title = 'T') <> 'ACME'
      then raise exception 'the value did not reach the item'; end if;`, null],
  ['a move needing a field is refused until it is filled', `
    perform workflow_move((select i.id from workflow_items i join cases c on c.id = i.subject_id where c.title = 'T'), 'done', null);`,
    'Fill in "Checked" first'],
  ['a value is checked against its field', `
    perform workflow_set_fields((select i.id from workflow_items i join cases c on c.id = i.subject_id where c.title = 'T'), '{"ok":"Maybe"}');`,
    '"Checked" must be Yes or No'],
  ['a field the process has not got is refused', `
    perform workflow_set_fields((select i.id from workflow_items i join cases c on c.id = i.subject_id where c.title = 'T'), '{"nope":"x"}');`,
    'There is no field "nope"'],
  ['a field change is kept in the history, and the move then goes', `
    perform workflow_set_fields((select i.id from workflow_items i join cases c on c.id = i.subject_id where c.title = 'T'), '{"ok":"Yes"}');
    if not exists (select 1 from workflow_events e join workflow_items i on i.id = e.item_id join cases c on c.id = i.subject_id
                    where c.title = 'T' and e.kind = 'fields' and e.note = 'Changed: Checked') then raise exception 'no history row'; end if;
    perform workflow_move((select i.id from workflow_items i join cases c on c.id = i.subject_id where c.title = 'T'), 'done', null);`, null],
  ['a save over somebody else’s is refused', `
    perform workflow_save('dbtest_case', 'DB test case', 'cases', null,
      '[{"key":"open","name":"Open","kind":"start","position":1},{"key":"done","name":"Done","kind":"done","position":2}]',
      '[{"from_key":"open","to_key":"done","label":"Finish","position":1}]', null, null, null, null, '2000-01-01T00:00:00Z');`,
    'Someone else changed this workflow'],
  ['a deleted case takes its item with it', `
    delete from cases where title = 'T';
    if exists (select 1 from workflow_items i where i.workflow_id = (select id from workflows where key = 'dbtest_case')) then
      raise exception 'the item was left behind'; end if;`, null],
  ['a complaint’s clock runs from when it was received', `
    insert into complaint_cases (subject, description, received_at, created_by, updated_by)
         values ('DB test', 'x', now() - interval '3 days', auth.uid(), auth.uid());
    if (select i.started_at::date from workflow_items i join complaint_cases c on c.id = i.subject_id where c.subject = 'DB test')
       <> (now() - interval '3 days')::date then raise exception 'the clock did not start at receipt'; end if;`, null],
  ['a complaint cannot have been received in the future', `
    insert into complaint_cases (subject, description, received_at, created_by, updated_by)
         values ('DB test future', 'x', now() + interval '2 days', auth.uid(), auth.uid());`, 'cannot have been received in the future'],
  ['a complaint moves through the app’s hook, and its status follows', `
    perform workflow_move((select i.id from workflow_items i join complaint_cases c on c.id = i.subject_id where c.subject = 'DB test'), 'acknowledged', null);
    if (select status from complaint_cases where subject = 'DB test') <> 'acknowledged' then raise exception 'the status did not follow'; end if;`, null],
  ['a bank holiday added re-dates a deadline it falls within', `
    perform case_open((select id from workflows where key = 'dbtest_case'), 'U', null, '{"contractor":"ACME"}');
    declare d0 date; d1 date; begin
      select i.due_on into d0 from workflow_items i join cases c on c.id = i.subject_id where c.title = 'U';
      insert into non_working_days (day, name) select d, 'DB test' from generate_series(current_date + 1, d0, '1 day') d
        where extract(isodow from d) < 6 and not exists (select 1 from non_working_days w where w.day = d) limit 1;
      select i.due_on into d1 from workflow_items i join cases c on c.id = i.subject_id where c.title = 'U';
      if d1 <= d0 then raise exception 'not re-dated (% then %)', d0, d1; end if;
    end;`, null],
  // W3 (migration 255): the register's outstanding actions.
  ['the shipped Compliance action workflow saves, and the actions attach to it', `
    ${actionSave}
    perform compliance_action_attach_to_workflow();
    if (select count(*) from statutory_register r where r.kind = 'action'
          and not exists (select 1 from workflow_items i where i.subject_id = r.id)) > 0 then raise exception 'an action was left out'; end if;
    create temp table dbtest_action on commit drop as
      select template_key from statutory_register where kind = 'action' and action_status = 'open'
       and template_key ~ '^[adh][0-9]+$' order by template_key limit 1;
    if (select label from workflow_items where id = ${firstAction}) <> upper(${ACT}) then raise exception 'not named by its reference'; end if;`, null],
  ['an action’s status changes only through its workflow', `
    update statutory_register set action_status = 'closed' where template_key = ${ACT};`, 'through its workflow'],
  ['a move writes the status back', `
    perform workflow_move(${firstAction}, 'in_progress', null);
    if (select action_status from statutory_register where template_key = ${ACT}) <> 'in_progress' then raise exception 'the status did not follow'; end if;`, null],
  ['owner and due date are set without marking the row edited, kept in the history, and date the item', `
    perform compliance_action_set_details(${ACT}, 'The duty holder', null, current_date + 10);
    if (select seed_modified_at from statutory_register where template_key = ${ACT}) is not null then raise exception 'marked as edited'; end if;
    if (select due_on from workflow_items where id = ${firstAction}) <> current_date + 10 then raise exception 'not dated'; end if;
    if not exists (select 1 from workflow_events where item_id = ${firstAction} and kind = 'fields' and note = 'Changed: Owner, Due date')
      then raise exception 'no history row'; end if;`, null],
  ['a closed action has no deadline', `
    perform workflow_move(${firstAction}, 'answered', 'Determined');
    perform workflow_move(${firstAction}, 'closed', null);
    if (select due_on from workflow_items where id = ${firstAction}) is not null then raise exception 'still dated'; end if;`, null],
  // W4 (migration 257): a requirement's completion action links to an action.
  ['a requirement links its completion action to an action', `
    update statutory_register set completion_action_key = 'a4' where template_key = 'acrow_prop_check';
    set constraints all immediate;`, null],
  ['…and not to another requirement', `
    update statutory_register set completion_action_key = 'crack_monitoring' where template_key = 'acrow_prop_check';
    set constraints all immediate;`, 'must be one of the register.s outstanding actions'],
  ['…and an action cannot have one', `
    update statutory_register set completion_action_key = 'a4' where template_key = 'a1';
    set constraints all immediate;`, 'Only a compliance obligation can have a completion action'],
  ['the action statuses are fixed', `
    perform workflow_save('compliance_action', 'x', 'compliance', null,
      '[{"key":"open","name":"Open","kind":"start","position":1},{"key":"closed","name":"Closed","kind":"done","position":2}]',
      '[{"from_key":"open","to_key":"closed","label":"Close","position":1}]', null, null, null, '[]', null);`, 'must keep its step'],
  // Migration 258: works schedules.
  ['the shipped Works schedule workflow saves, and the schedules attach to it', `
    ${worksSave}
    perform works_schedule_attach_to_workflow();
    if exists (select 1 from works_schedules w where not exists (select 1 from workflow_items i where i.subject_id = w.id))
      then raise exception 'a schedule was left out'; end if;`, null],
  ['a new schedule joins its workflow, dated by its expected completion', `
    insert into works_schedules (title, reference, expected_completion, created_by, updated_by)
         values ('DB test works', null, current_date + 20, auth.uid(), auth.uid());
    if (select due_on from workflow_items where id = ${worksItem}) <> current_date + 20 then raise exception 'not dated'; end if;
    if (select label from workflow_items where id = ${worksItem}) <> 'DB test works' then raise exception 'not named'; end if;`, null],
  ['a schedule’s status changes only through its workflow', `
    update works_schedules set status = 'issued' where title = 'DB test works';`, 'through its workflow'],
  ['issuing writes the status and the date it was issued', `
    perform workflow_move(${worksItem}, 'issued', null);
    if (select status from works_schedules where title = 'DB test works') <> 'issued' or
       (select issued_at from works_schedules where title = 'DB test works') is null then raise exception 'not issued'; end if;`, null],
  ['a changed expected completion re-dates it', `
    update works_schedules set expected_completion = current_date + 40 where title = 'DB test works';
    if (select due_on from workflow_items where id = ${worksItem}) <> current_date + 40 then raise exception 'not re-dated'; end if;`, null],
  ['completing stamps the date and ends the deadline', `
    perform workflow_move(${worksItem}, 'completed', null);
    if (select completed_at from works_schedules where title = 'DB test works') is null then raise exception 'no date'; end if;
    if (select due_on from workflow_items where id = ${worksItem}) is not null then raise exception 'still dated'; end if;`, null],
  ['a deleted schedule takes its item with it', `
    delete from works_schedules where title = 'DB test works';
    if exists (select 1 from workflow_items i join workflows w on w.id = i.workflow_id
                where w.key = 'works_schedule' and not exists (select 1 from works_schedules s where s.id = i.subject_id))
      then raise exception 'left behind'; end if;`, null],
  // Migration 259: timers — a move the system makes after N days in its step.
  ['a timed move is made by the run once due, by nobody, with its reason', `
    perform workflow_save('dbtest_timer', 'DB test timer', 'cases', null,
      '[{"key":"open","name":"Open","kind":"start","position":1},{"key":"done","name":"Done","kind":"done","position":2}]',
      '[{"from_key":"open","to_key":"done","label":"Lapse","timer_days":2,"position":1}]', null, null, null, '[]', null);
    perform case_open((select id from workflows where key = 'dbtest_timer'), 'TIMER old', null, '{}');
    perform case_open((select id from workflows where key = 'dbtest_timer'), 'TIMER new', null, '{}');
    update workflow_items set started_at = now() - interval '5 days'
     where subject_id = (select id from cases where title = 'TIMER old');
    update workflow_events set at = now() - interval '5 days'
     where item_id = (select i.id from workflow_items i join cases c on c.id = i.subject_id where c.title = 'TIMER old');
    perform workflow_run_timers();
    if (select i.step_key from workflow_items i join cases c on c.id = i.subject_id where c.title = 'TIMER old') <> 'done'
      then raise exception 'the due one did not move'; end if;
    if (select i.step_key from workflow_items i join cases c on c.id = i.subject_id where c.title = 'TIMER new') <> 'open'
      then raise exception 'the new one moved too early'; end if;
    if not exists (select 1 from workflow_events e join workflow_items i on i.id = e.item_id join cases c on c.id = i.subject_id
                    where c.title = 'TIMER old' and e.by is null and e.note = 'Automatic — 2 days in Open') then
      raise exception 'no automatic history row'; end if;
    if (select moved from workflow_timer_runs order by ran_at desc limit 1) < 1 then raise exception 'the run was not kept'; end if;`, null],
  ['a timed move that cannot be made is counted as failed, and nothing moves', `
    perform workflow_save('dbtest_timer2', 'DB test timer 2', 'cases', null,
      '[{"key":"open","name":"Open","kind":"start","position":1},{"key":"done","name":"Done","kind":"done","position":2}]',
      '[{"from_key":"open","to_key":"done","label":"Lapse","timer_days":1,"required_fields":["why"],"position":1}]', null, null, null,
      '[{"key":"why","label":"Why","type":"text","position":1}]', null);
    perform case_open((select id from workflows where key = 'dbtest_timer2'), 'TIMER blocked', null, '{}');
    update workflow_items set started_at = now() - interval '5 days'
     where subject_id = (select id from cases where title = 'TIMER blocked');
    update workflow_events set at = now() - interval '5 days'
     where item_id = (select i.id from workflow_items i join cases c on c.id = i.subject_id where c.title = 'TIMER blocked');
    perform workflow_run_timers();
    if (select i.step_key from workflow_items i join cases c on c.id = i.subject_id where c.title = 'TIMER blocked') <> 'open'
      then raise exception 'it moved without its field'; end if;
    if not exists (select 1 from workflow_timer_runs r, jsonb_array_elements(r.failures) f
                    where f->>'label' like 'CAS-%' and f->>'reason' like '%Why%') then
      raise exception 'the failure was not kept'; end if;`, null],
  ['an action’s status follows a timed move too (an app rule that needs an admin)', `
    perform workflow_save('compliance_action', 'Compliance action', 'compliance', null,
      ${lit(ACTION_WF.steps.map((x, n) => ({ ...x, position: n + 1 })))},
      ${lit(ACTION_WF.moves.map((m, n) => (m.from_key === 'open' && m.to_key === 'in_progress' ? { ...m, timer_days: 1, position: n + 1 } : { ...m, position: n + 1 })))},
      null, null, null, '[]', null);
    perform compliance_action_attach_to_workflow();
    update workflow_items set started_at = now() - interval '5 days'
     where subject_id = (select id from statutory_register where template_key = 'a2') and step_key = 'open';
    update workflow_events set at = now() - interval '5 days'
     where item_id = (select i.id from workflow_items i join statutory_register r on r.id = i.subject_id where r.template_key = 'a2');
    perform set_config('request.jwt.claims', '{}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform workflow_run_timers();
    perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where is_admin order by created_at limit 1), 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', (select id::text from profiles where is_admin order by created_at limit 1), true);
    if (select action_status from statutory_register where template_key = 'a2') <> 'in_progress'
       or (select step_key from workflow_items i join statutory_register r on r.id = i.subject_id where r.template_key = 'a2') <> 'in_progress'
      then raise exception 'not moved by the nightly run'; end if;`, null],
  // Migration 260: maintenance jobs — the steps are the administrator's, and a
  // step's kind is the job's status.
  ['the shipped Maintenance job workflow saves; a new job joins at its start, named and dated', `
    ${jobSave}
    perform maintenance_job_attach_to_workflow();
    insert into maintenance_jobs (title, scheduled_date, created_by)
         values ('DB test job', current_date + 30, auth.uid());
    if (select step_key from workflow_items where id = ${jobItem}) <> 'scheduled' then raise exception 'not at Scheduled'; end if;
    if (select due_on from workflow_items where id = ${jobItem}) <> current_date + 30 then raise exception 'not dated'; end if;
    if (select label from workflow_items where id = ${jobItem}) not like 'DB test job · %' then raise exception 'not named'; end if;`, null],
  ['an earlier hard expiry dates it instead', `
    update maintenance_jobs set hard_expiry_date = current_date + 10 where title = 'DB test job';
    if (select due_on from workflow_items where id = ${jobItem}) <> current_date + 10 then raise exception 'not re-dated'; end if;`, null],
  ['a job’s status changes only through its workflow', `
    update maintenance_jobs set status = 'cancelled' where title = 'DB test job';`, 'through its workflow'],
  ['booking it makes it in progress', `
    perform workflow_move(${jobItem}, 'booked', null);
    if (select status from maintenance_jobs where title = 'DB test job') <> 'in_progress' then raise exception 'not in progress'; end if;`, null],
  ['its contractor may move it on, with no editable grant', `
    update maintenance_jobs set contractor_id = (select p.id from profiles p where not p.is_admin
        and not exists (select 1 from app_permissions a where a.user_id = p.id and a.app_id = 'maintenance' and not a.is_read_only)
        order by p.created_at limit 1)
     where title = 'DB test job';
    ${asNonAdmin(true)}
    perform workflow_move(${jobItem}, 'attended', null);
    ${ADMIN_CLAIMS}
    if (select step_key from workflow_items where id = ${jobItem}) <> 'attended' then raise exception 'not moved'; end if;`, null],
  ['someone else without an editable grant may not', `
    ${asNonAdmin(false)}
    if exists (select 1 from app_permissions a where a.user_id = auth.uid() and a.app_id = 'maintenance' and not a.is_read_only)
      then raise exception 'the chosen user holds an editable grant, so this proves nothing'; end if;
    perform workflow_move(${jobItem}, 'completed', null);`, 'You cannot change this'],
  ['a job is not completed by a bare move: its result must be recorded', `
    ${ADMIN_CLAIMS}
    perform workflow_move(${jobItem}, 'completed', null);`, 'Record the completion first'],
  ['recording the completion completes it, and ends its deadline', `
    ${ADMIN_CLAIMS}
    perform maintenance_job_complete((select id from maintenance_jobs where title = 'DB test job'), current_date, 'pass', 'Done', null, null, 'CERT-1');
    if (select status from maintenance_jobs where title = 'DB test job') <> 'completed' then raise exception 'not completed'; end if;
    if (select step_key from workflow_items where id = ${jobItem}) <> 'completed' then raise exception 'not at Completed'; end if;
    if (select due_on from workflow_items where id = ${jobItem}) is not null then raise exception 'still dated'; end if;`, null],
  ['re-opening clears the completion', `
    perform workflow_move(${jobItem}, 'scheduled', 'Certificate was for the wrong system');
    if (select status from maintenance_jobs where title = 'DB test job') <> 'scheduled'
       or (select result from maintenance_jobs where title = 'DB test job') is not null then raise exception 'not cleared'; end if;`, null],
  ['a deleted job takes its item with it', `
    delete from maintenance_jobs where title = 'DB test job';
    if exists (select 1 from workflow_items i join workflows w on w.id = i.workflow_id
                where w.key = 'maintenance_job' and not exists (select 1 from maintenance_jobs j where j.id = i.subject_id))
      then raise exception 'left behind'; end if;`, null],
];

describe.skipIf(!RUN)('workflow manager — the database (dev, rolled back)', () => {
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
      // Act as the first administrator (auth.uid() reads the request's claims).
      `select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where is_admin order by created_at limit 1), 'role', 'authenticated')::text, true);`,
      `select set_config('request.jwt.claim.sub', (select id::text from profiles where is_admin order by created_at limit 1), true);`,
      ...SAVE_CASES.map((c, i) => check(`save: ${c.name}`, saveCall(c, i), c.expect ? c.expect.source : null)),
      ...RUNTIME.map(([name, body, pattern]) => check(`run: ${name}`, /** @type {string} */ (body), pattern)),
      // Someone with no grant may not change an item's fields.
      `select set_config('request.jwt.claims', json_build_object('sub', (select p.id from profiles p where not p.is_admin and not exists (select 1 from app_permissions a where a.user_id = p.id and a.app_id = 'cases') limit 1), 'role', 'authenticated')::text, true);`,
      `select set_config('request.jwt.claim.sub', (select p.id::text from profiles p where not p.is_admin and not exists (select 1 from app_permissions a where a.user_id = p.id and a.app_id = 'cases') limit 1), true);`,
      check('run: someone without the grant cannot change a field',
        `perform workflow_set_fields((select i.id from workflow_items i join cases c on c.id = i.subject_id where c.title = 'U'), '{"ok":"No"}');`,
        'You cannot change this'),
      'rollback;',
    ].join('\n');
    const r = spawnSync(PSQL, [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 50e6 });
    output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    for (const m of output.matchAll(/RESULT\|([^|]*)\|(OK|FAIL)\|(.*)/g)) results.set(m[1], m[2] === 'OK' ? 'OK' : m[3]);
    if (r.status !== 0 && !results.size) throw new Error(`psql failed:\n${output.slice(0, 4000)}`);
  }, 120000);

  const names = [...SAVE_CASES.map((c) => `save: ${c.name}`), ...RUNTIME.map(([n]) => `run: ${n}`), 'run: someone without the grant cannot change a field'];
  for (const name of names) {
    it(name, () => {
      expect(results.get(name), output.slice(-3000)).toBe('OK');
    });
  }
});
