# Shared Operations Job and Service Foundation

## Decision

MDB is one project, but its business records are not flattened into one generic
document.

```text
Sales Order line -> Build Request -----> Build Order ---------+
                                                               |
Service need ----> Service Request ----> Service Estimate ----> Gatekeeper
                                           |                       |
                                           +-----------------------+----> Service Work Order ---+--> Operations Job
                                                                                                    | schedule/capacity
                                                                                                    | assignee/tasks
                                                                                                    | checkpoints/evidence
                                                                                                    | events/exceptions
                                                                                                    + closeout visibility
```

The **request** records who needs what and why. The specialized **Build Order**
or **Service Work Order** records the controlled execution details. The shared
**Operations Job** gives the gatekeeper one place to direct capacity, priority,
assignment, checkpoints, exceptions, and lifecycle visibility.

This structure merges Sales and Operations into one ERP foundation without
making a production build behave like service work or turning a Service Scope
of Work into a manufacturing component list.

## Evidence behind the design

The private OneDrive and email intake showed two recurring operating patterns:

- production schedules are organized around bays/cells, dated commitments,
  modules, readiness gates, punch lists, and final-delivery checkpoints;
- service begins as incomplete field/customer information, becomes a reviewed
  scope, then requires order/MO/PO decisions, parts coordination, scheduling,
  execution evidence, signoff, and financial closeout.

Both flows need the same operational control plane, but they do not use the same
execution document. That is why the common layer starts at `operations_jobs`
rather than replacing `build_orders` or `service_work_orders`.

Private evidence remains under the ignored `private-intake/` boundary. No PST,
OneDrive export, customer email, or extracted attachment is part of this
migration, API, or public demo.

## Core records

### Demand and requester visibility

- `build_requests`: exact Sales Order-line demand sent to Production Control.
- `service_requests`: desktop, future Mobile Lite/NFC, email, or imported service
  demand. It preserves asset/serial, complaint, requested help, urgency, source,
  requester, and returned-information history.

A requester cannot accept their own request merely because they created it.
Request status is kept separate from the downstream job so the requester can see
a stable lifecycle without editing controlled work.

### Qualified commercial interpretation

- `service_estimates`: revisioned, qualified scope, assumptions, exclusions,
  recommendation basis, confidence, estimated cost, quote price, and margin.
- `service_estimate_lines`: labor, part, travel, outside-service, supply, and
  contingency detail with reference values, source evidence, and mandatory
  override rationale.
- `service_pricing_rules`: versioned cost and sell-rate structure.
- `service_actual_cost_entries`: append-only Service Work Order costs used for
  estimate-versus-actual feedback.

Only the `service_estimator` role builds and submits the commercial package.
The gatekeeper approves or returns it without rewriting the estimator's locked
revision. See `SERVICE_ESTIMATING_AND_COST_FOUNDATION.md`.

### Specialized execution

- `build_orders`: production quantity, component plan, reservation/consumption,
  finished output, and manufacturing-specific control.
- `service_work_orders`: versioned service scope, source documents, GP service /
  warranty / MO / PO / invoice references, and internal/customer signoff.

### Shared operations control plane

- `operations_jobs`: type, controlled state, gatekeeper, assignee, priority,
  work center, commitment, exception, GP link status, and timestamps.
- `operations_job_assignments`: revisioned, non-overlapping work-center windows.
- `operations_checkpoint_definitions` and `operations_job_checkpoints`: versioned
  gates with owner role, evidence, blocker, and completion state.
- `operations_job_events`: append-only lifecycle evidence.
- `workflow_tasks`: order setup, PO decision, parts identification, customer
  clarification, accounting closeout, and document follow-up.
- `notification_outbox`: retryable event delivery without coupling a database
  transaction to email, SMS, or mobile push.

## Controlled lifecycle

### Service Request

```text
Draft -> Submitted -> Triaged -> Accepted -> Converted -> Resolved
                   \-> Needs Information / Returned -> Submitted
                   \-> Cancelled
```

- Requester: create, submit, resubmit, cancel eligible pre-conversion demand.
- Service gatekeeper: triage, request information, classify Warranty/Billable,
  choose In House/Field/Outside, accept, and convert.
- System consequence: closing the controlled job resolves the original request.

### Service Operations Job

```text
Order Setup Pending -> Scheduled -> Released -> In Progress
    -> Work Complete -> Signoff Complete -> Closed
```

Work completion, signoff completion, and administrative close are deliberately
separate. A technician cannot close their own work. A gatekeeper cannot declare
signoff complete until both internal and customer acceptance are captured for
the current scope version.

### Checkpoints

Service v1 seeds:

1. Before photos captured
2. Safety functions confirmed
3. Inspection complete
4. Repair evidence captured
5. Final clean complete
6. Shipping or pickup ready

Rig-build v1 seeds preserve the useful Operations portfolio controls: parts
staged, digital and physical build books, final inspection, punch list, digital
and physical customer manuals, and the final good-to-go gate.

Checkpoint ownership is enforced server-side. The assigned service technician
can update technician-owned checkpoints; role owners can update their own gates;
controllers can make audited overrides. Evidence-required gates cannot be
completed with an empty evidence note.

## Gatekeeper model

The Operations Board is the cross-functional control surface:

- Tooling and rig-part Build Requests plus Service Requests arrive in one
  decision inbox. The originating Sales Order line remains the demand source
  for build requests.
- Acceptance creates the appropriate specialized document, not a generic order.
- The gatekeeper routes accepted tooling and rig-part work to the Machine Shop,
  Preassembly Work Bay, or another controlled center before release.
- Work-center capacity is committed before release. A reroute creates a new
  assignment revision and preserves the prior gatekeeper decision as history.
- Priority, assignment, schedule, exceptions, and readiness remain visible in
  one queue.
- Requesters and sales representatives see derived lifecycle stages without
  obtaining write authority over the execution record.
- The shop/technician view exposes execution and evidence actions, not promise,
  schedule, or closeout authority.

The existing Production Control and Build Order workspaces remain useful focused
views. The Operations Board does not replace them; it provides the common top
level the company needs as service and production scale together.

## Capacity and concurrency

`work_centers` define bays, field teams, shop cells, inspection stations, and
their slot capacity. Active assignments are revisioned rather than overwritten.
A database trigger rejects overlapping use of the same work-center slot. This
prevents two browser sessions from making the same bay commitment even if both
loaded an older screen.

`Machine Shop` and `Preassembly Work Bay` are seeded as controlled routing
destinations with one placeholder slot each. Those capacities are deliberately
conservative until the gatekeeper validates actual concurrency. Routing and
capacity stay on the shared Operations Job; BOM preparation, release,
consumption, output, and completion remain on the linked Build Order.

## GP boundary

The foundation is ready to accept GP identifiers, but it does not invent or
write them.

- `gp_link_status = Pending` is the safe initial state.
- GP company, Sales Order, MO, service order, warranty order, PO, and invoice
  references are explicit nullable fields.
- The existing GP sync remains inbound/read-only.
- A visible workflow task directs the office employee to create or link the
  official GP record.
- Reconciliation can later change a pending link to Linked or Conflict without
  rewriting the request or operational evidence.

No GP write-back, automated order creation, or price authority is claimed until
the company approves a connection path and representative GP data proves the
mapping.

## Security boundary

- Netlify Identity supplies the signed-in subject.
- `operational_users` maps that subject to an active employee.
- `operational_user_roles` is server-managed; browser metadata is never trusted
  as authorization.
- The browser calls `/api/operations/jobs`.
- The Netlify Function calls role-checking PostgreSQL RPCs with the service role.
- Operational tables have RLS enabled and revoke direct `anon` and
  `authenticated` Data API access.
- Events and signoffs are append-only to application roles.
- State transitions lock the affected row and recheck current state/role inside
  the database transaction.

The public portfolio uses versioned browser-local demo data only. It demonstrates
the workflow but is not a shared operational database.

## Mobile Lite and NFC boundary

Mobile is an intake and escalation edge, not a full ERP client. `source_channel`
already supports `Mobile` and `NFC`, so a future authorized phone flow can:

1. authenticate the employee;
2. scan an NFC tag for a non-secret rig/profile identifier;
3. confirm the actual rig/serial;
4. capture urgency, complaint, photo/evidence references, and requested office
   help;
5. submit a Service Request and notify the office gatekeeper.

The NFC tag supplies context only. It does not authenticate a person, approve a
scope, promise a date, or create a GP parts order.

## Scalability path

This slice is additive and can be scaled in place:

1. Apply the migration in a non-production Supabase environment.
2. Provision test employees and server roles.
3. Seed real work centers and capacities.
4. Run shadow Service Requests beside the existing email/SOW process.
5. Compare commitments, checkpoints, exceptions, and closeout against actual
   office practice.
6. Add object storage for service documents with signed, authorized access.
7. Connect approved notification workers to `notification_outbox`.
8. Load read-only GP identifiers and reconcile pending links.
9. Tune checkpoints and tasks from observed exceptions before adding new
   modules.

The current API intentionally returns bounded operational queues. As volume
grows, replace broad controller lists with cursor-based queue projections by
status, date window, work center, and assignee; do not move filtering or
authorization into the browser.

## Deliberately not built yet

- live GP connectivity or GP write-back;
- automatic warranty decisions;
- automatic SOW generation from email prose;
- document/object-storage upload;
- notification delivery worker;
- customer portal or public service submission;
- NFC tag programming;
- accounting posting, labor time, or payroll;
- predictive scheduling or AI dispatch.

Those features need approved data, operating decisions, or integration authority.
The present foundation captures the stable workflow first so future automation
has controlled facts and evidence to learn from.

## Implementation map

- Migration: `supabase/migrations/20260825090000_operations_job_service_foundation.sql`
- Authenticated API: `netlify/functions/operations-jobs.mts`
- Pure transition contract: `netlify/functions/_operations-job.js`
- Requester and Operations Board demo: `site/app.js`
- Contract tests: `test/operations-job.test.js`
- Database lifecycle tests: `test/operations-job-database.test.js`
- Security/static tests: `test/operations-job-foundation.test.js`
- Workspace boundary tests: `test/operations-workspace.test.js`
