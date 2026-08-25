# MDB Production Control Foundation

Status: implementation contract for the unified Sales + Operations project.

## Decision

MDB is one application and one operational data platform, but it preserves separate linked documents:

`Salesforce opportunity -> MDB Quote -> Sales Order line -> Build Request -> Build Order -> Inventory ledger -> Shipment -> GP`

Sales documents express customer demand. Build Requests carry that demand into Production Control. Build Orders authorize and record shop execution. Posted inventory entries are immutable facts. These records must never be flattened into one editable document.

The separate Ops portfolio is now a frozen reference. Build Orders link into the
shared Operations Job control plane defined in
`OPERATIONS_JOB_AND_SERVICE_FOUNDATION.md`; production quantity, components,
inventory posting, and finished output remain Build Order responsibilities.

## Roles

| Role | Authority |
| --- | --- |
| `sales` | Create and edit owned drafts, submit requests, view linked progress, comment, and request a change. |
| `production_controller` | Gatekeeper. Return or accept requests; commit dates; assign, prioritize, release, hold, reschedule, reopen, or cancel eligible work. |
| `shop` | View assigned released work; start work; record actual consumption/output; report blockers. |
| `inventory_controller` | Record or correct authorized inventory postings without controlling production priority. |
| `admin` | Manage operational access and act as the controlled substitute when required. |

Roles are server-controlled. Browser-selected names, initials, and `user_metadata` are display information and never authorization evidence.

The primary production controller must have a named substitute so an absence does not stop all production. The substitute receives the same role only through an administrator-controlled assignment.

## Build Request lifecycle

`Draft -> Submitted -> Accepted -> Fulfilled`

Exception paths:

- `Submitted -> Returned -> Submitted`
- Any unstarted eligible request may become `Cancelled`.
- `Fulfilled` is set only by the successful final Build Order posting transaction.

Accepting a request creates its initial scheduled Build Order. It does not release work to the shop.

Every sales-driven Build Request identifies one stable Sales Order line. Requested quantities across active requests may not exceed the unshipped quantity on that line.

## Build Order lifecycle

The existing persisted statuses remain compatible during rollout:

- `Open`: controller-owned preparation and scheduling.
- `Released`: authorized for assigned shop execution.
- `Finished`: fully posted, immutable completion.
- `Cancelled`: terminal order with no posted consumption or output.

Rep-facing stages are derived rather than manually entered:

- An `Open` Build Order linked to an accepted request displays as **Scheduled**.
- A `Released` order with an actual start or posted activity displays as **In Progress**.
- A `Finished` order displays as **Completed**.

Exceptions are orthogonal to lifecycle status: `needs_information`, `blocked`, `on_hold`, `customer_change`, and `at_risk`.

## Gatekeeper rules

Only Production Control or an administrator may:

- Accept or return submitted demand.
- Set the committed completion date and priority.
- Assign or reassign shop responsibility.
- Freeze the component snapshot and release the Build Order.
- Hold, reschedule, reopen, or cancel eligible work.

Release reserves available components. A shortage prevents release and returns an actionable error to the gatekeeper. Reopening or cancelling untouched work releases those reservations.

Sales can request changes after submission, but cannot directly change production dates, priority, components, assignments, consumption, output, or status.

## Posting rules

Consumption and output are one server-side transaction:

1. Authenticate the employee.
2. Verify an allowed operational role and, for shop employees, the assignment.
3. Lock the Build Order, components, and affected inventory rows.
4. Verify component reservations and remaining quantities.
5. Reduce component on-hand and allocated quantities.
6. Increase finished-item on-hand.
7. Append negative consumption and positive output ledger entries.
8. Update Build Order quantities and activity history.
9. When output reaches the required quantity, finish the Build Order and fulfill its Build Request.

Each posting has an idempotency key. Retrying the same network request returns the prior result instead of posting inventory twice.

Posted ledger entries are never edited or deleted. Corrections create reversing entries that point to the original entry.

## Source and integration rules

- Stable external identifiers are retained for Salesforce and GP.
- Integrations publish through an outbox with idempotency keys, retry counts, and visible failures.
- A successful MDB transaction and its integration message are committed together.
- An external timeout never causes MDB to guess whether a write succeeded; the reconciliation queue resolves it.
- GP remains transactional authority until a separately approved cutover.

## Merge gate for the Ops portfolio

The Ops interface is ready to merge when all of the following are true:

1. Netlify Identity is enabled as invite-only and operational users are mapped to server-controlled roles.
2. The production-control migration has been applied to a non-production Supabase environment.
3. Build Request creation and gatekeeper transitions pass contract tests.
4. Component reservation and posting pass partial, retry, concurrency, shortage, reversal, and cancellation tests.
5. A sales rep can view—but cannot mutate—the linked Build Order lifecycle.
6. The primary gatekeeper and substitute have validated the inbox fields and transition language.

At that point the Ops portfolio should be merged as interface and workflow ideas, not copied wholesale.
