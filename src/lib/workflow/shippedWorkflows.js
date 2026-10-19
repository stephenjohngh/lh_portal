// src/lib/workflow/shippedWorkflows.js
//
// The workflows that SHIP with the portal, by key (2026-10-18 review). Each is
// saved once, by the app, the first time an administrator opens it — so a
// later release's correction never reaches a building that already has one,
// and nothing said the live workflow had moved away from what ships. Admin →
// Workflows compares the two and can load the shipped one into the editor;
// it is saved like any change (the review mark applies). An app's seed stays
// its own file; this only lists them.

import { DEFAULT_APPLICATION_WORKFLOW } from '#lib/apps/parking/utils/applicationWorkflow.js';
import { DEFAULT_COMPLAINT_WORKFLOW } from '#lib/apps/complaints/utils/complaintWorkflow.js';
import { DEFAULT_COMPLIANCE_ACTION_WORKFLOW } from '#lib/apps/compliance/utils/complianceActionWorkflow.js';
import { DEFAULT_WORKS_SCHEDULE_WORKFLOW } from '#lib/apps/building_assets/utils/worksScheduleWorkflow.js';
import { DEFAULT_MAINTENANCE_JOB_WORKFLOW } from '#lib/apps/maintenance/utils/maintenanceJobWorkflow.js';
import { DEFAULT_WAITING_LIST_WORKFLOW } from '#lib/apps/parking/utils/waitingListWorkflow.js';

/** @type {ReadonlyArray<any>} */
export const SHIPPED_WORKFLOWS = Object.freeze([DEFAULT_APPLICATION_WORKFLOW, DEFAULT_COMPLAINT_WORKFLOW, DEFAULT_COMPLIANCE_ACTION_WORKFLOW, DEFAULT_WORKS_SCHEDULE_WORKFLOW,
  DEFAULT_MAINTENANCE_JOB_WORKFLOW, DEFAULT_WAITING_LIST_WORKFLOW]);

/** The shipped version of a workflow, or null (a Cases process has none). @param {string} key */
export function shippedWorkflowFor(key) {
  return SHIPPED_WORKFLOWS.find((w) => w.key === key) ?? null;
}
