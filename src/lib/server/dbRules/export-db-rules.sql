-- src/lib/server/dbRules/export-db-rules.sql
--
-- Writes dbRules.snapshot.json: the rules the DATABASE enforces, so a test can
-- hold the code's copies to them (dbRulesParity.test.js — read its header for
-- why there are two copies at all). Read-only.
--
-- Run it with:  npm run db:rules   (scripts/db-rules.mjs — it writes the JSON
-- and lists what changed). `npm run db:push:prod` runs it after every push.
--
-- ⭐ Transitions are not parsed out of SQL: each status pair is put to the
-- database's own *_is_valid_transition function and the answer recorded — what
-- is enforced, not what the source appears to say. Parking writes its moves
-- inline in its trigger, in one regular shape, so those are read from the
-- function source; the test fails if that shape stops matching.

with
-- Every CHECK of the form  col = ANY (ARRAY[...])  (optionally "col IS NULL OR …"),
-- as  table.column -> sorted values.
checks as (
  select conrelid::regclass::text || '.' ||
         (regexp_match(pg_get_constraintdef(oid), '([a-z_]+) = ANY \(ARRAY\['))[1] as col,
         (select array_agg(v order by v)
            from (select (regexp_matches(pg_get_constraintdef(oid), '''([^'']+)''::text', 'g'))[1] as v) x) as vals
    from pg_constraint
   where contype = 'c'
     and connamespace = 'public'::regnamespace
     -- a single value list, optionally "or empty" either side; conditional
     -- rules (a demised bay needs a flat reference) are not lists and stay out
     and pg_get_constraintdef(oid) ~ '^CHECK \(+(\(?[a-z_]+ IS NULL\)? OR \(?)?[a-z_]+ = ANY \(ARRAY\[[^]]*\]\)\)*( OR \(?[a-z_]+ IS NULL\)?)?\)*$'
),
statuses as (
  select col, vals from checks
   where col in ('mor_cases.status', 'complaint_cases.status', 'gt_documents.status', 'gt_risks.status')
),
pairs as (
  select s.col, a, b
    from statuses s, unnest(s.vals) a, unnest(s.vals) b
   where a <> b
),
allowed as (
  select col, json_agg(json_build_array(a, b) order by a, b) as moves
    from pairs
   where (col = 'mor_cases.status'       and mor_is_valid_transition(a, b))
      or (col = 'complaint_cases.status' and complaint_is_valid_transition(a, b))
      or (col = 'gt_documents.status'    and gt_is_valid_transition(a, b))
      or (col = 'gt_risks.status'        and gt_risk_is_valid_transition(a, b))
   group by col
),
-- Parking: "(old.status = 'x' and new.status in ('y', 'z'))" / "= 'y'".
parking as (
  select p.proname,
         m[1] as from_status,
         coalesce(m[2], '''' || m[3] || '''') as to_list
    from pg_proc p,
         regexp_matches(p.prosrc,
           'old\.status = ''([a-z_]+)''\s+and new\.status (?:in \(([^)]*)\)|= ''([a-z_]+)'')', 'g') m
   where p.proname in ('parking_agreement_rules', 'parking_application_rules')
),
parking_pairs as (
  -- distinct: a trigger may test the same pair twice (offered -> waiting is
  -- allowed, then checked again for its declined/lapsed reason)
  select distinct proname, from_status, (regexp_matches(to_list, '''([a-z_]+)''', 'g'))[1] as t
    from parking
),
parking_moves as (
  select proname, json_agg(json_build_array(from_status, t) order by from_status, t) as moves
    from parking_pairs
   group by proname
)
select jsonb_pretty(jsonb_build_object(
  'exportedFrom', 'prod (read-only)',
  'checks',       (select jsonb_object_agg(col, to_jsonb(vals)) from checks where col is not null),
  'transitions',  (select jsonb_object_agg(col, moves) from allowed),
  'parkingTransitions', (select jsonb_object_agg(proname, moves) from parking_moves)
));
