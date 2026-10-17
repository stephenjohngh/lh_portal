// parking/utils/applicationWorkflow.js
//
// The online parking application's workflow, as it SHIPS (2026-10-17,
// migration 247). An admin may change it in Admin → Workflows; this is only
// what a deployment starts from. ⭐ Applied by the app, not by a migration
// (the seed rule in CLAUDE.md): the first time an admin opens Parking →
// Applications, it is saved if there is none. Until then the public form
// says applications are not open.

export const APPLICATION_WORKFLOW_KEY = 'parking_application';

/** @type {{ key: string, name: string, appId: string, description: string,
 *           steps: import('#lib/workflow/workflowModel.js').Step[],
 *           moves: import('#lib/workflow/workflowModel.js').Move[] }} */
export const DEFAULT_APPLICATION_WORKFLOW = Object.freeze({
  key: APPLICATION_WORKFLOW_KEY,
  name: 'Parking application',
  appId: 'parking',
  description: 'An application for a car park bay made on the public form (/parking/apply).',
  steps: [
    { key: 'received',     name: 'Received',            public_name: 'Received — waiting to be checked', kind: 'start' },
    { key: 'checking',     name: 'Being checked',       public_name: 'Being checked',                    kind: 'open' },
    { key: 'waiting_list', name: 'On the waiting list', public_name: 'Accepted — on the waiting list',   kind: 'done' },
    { key: 'declined',     name: 'Declined',            public_name: 'Not accepted',                     kind: 'declined' },
    { key: 'withdrawn',    name: 'Withdrawn',           public_name: 'Withdrawn',                        kind: 'declined' },
  ],
  moves: [
    { from_key: 'received', to_key: 'checking',     label: 'Start checking' },
    { from_key: 'checking', to_key: 'waiting_list', label: 'Accept onto the waiting list', action: 'parking_add_to_waiting_list' },
    { from_key: 'checking', to_key: 'declined',     label: 'Decline',   note_required: true },
    { from_key: 'received', to_key: 'withdrawn',    label: 'Withdrawn', note_required: true },
    { from_key: 'checking', to_key: 'withdrawn',    label: 'Withdrawn', note_required: true },
  ],
});
