// parking/utils/waitingListWorkflow.js
//
// A place on the waiting list, on the shared workflow manager (migration 262)
// — a SEED, saved by the app the first time an administrator opens Parking,
// then edited in Admin → Workflows like any other.
//
// ⭐ The steps ARE the place's statuses (APPLICATION_STATUSES in
// waitingListModel.js), fixed by key (workflowContracts.js KEY_CONTRACTS +
// workflow_key_problem()). What the workflow adds is the history, who it is
// with, the record — and the TIMER: an offer that runs past its expiry date
// goes back to the queue by itself the day after (a timer counted from the
// item's deadline, which for an offer is its expiry date). Before that date a
// return is recorded as declined, after it as lapsed; either way the person
// keeps their place (decision D5).
//
// ⛔ Offering and accepting are made through Parking's own forms (the bay and
// dates; the agreement), which move the item: parking_offer_bay() and
// parking_application_allocate(). "Reopen the offer" is made only by deleting
// the draft agreement an acceptance drew up (migration 229).

export const WAITING_LIST_WORKFLOW_KEY = 'parking_waiting_list';

export const DEFAULT_WAITING_LIST_WORKFLOW = Object.freeze({
  key: WAITING_LIST_WORKFLOW_KEY,
  name: 'Waiting list place',
  appId: 'parking',
  description: 'A place on the car park waiting list, first come, first served: waiting, offered a bay, then allocated or back in the queue keeping its place.',
  reviewRequired: false,
  reviewReason: null,
  steps: [
    { key: 'waiting',   name: 'Waiting',       public_name: null, kind: 'start' },
    { key: 'offered',   name: 'Offered a bay', public_name: null, kind: 'open' },
    { key: 'allocated', name: 'Allocated',     public_name: null, kind: 'done' },
    { key: 'withdrawn', name: 'Withdrawn',     public_name: null, kind: 'declined' },
  ],
  moves: [
    { from_key: 'waiting',   to_key: 'offered',   label: 'Offer a bay' },
    { from_key: 'offered',   to_key: 'allocated', label: 'Accepted' },
    { from_key: 'offered',   to_key: 'waiting',   label: 'Back to the queue', timer_days: 1, timer_basis: 'deadline' },
    { from_key: 'waiting',   to_key: 'withdrawn', label: 'Withdraw' },
    { from_key: 'offered',   to_key: 'withdrawn', label: 'Withdraw' },
    { from_key: 'allocated', to_key: 'offered',   label: 'Reopen the offer', admin_only: true },
  ],
});
