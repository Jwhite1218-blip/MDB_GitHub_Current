# Operations Portfolio Merge Record

## Decision

The Operations portfolio is now treated as part of the Mobile Drill Brain product, not as a second application. The current repository is the canonical project. The standalone portfolio remains available only as a historical reference until the unified site is reviewed and deliberately deployed.

The merge is conceptual and functional rather than a blind three-file copy. Most standalone portfolio screens were older, synthetic versions of capabilities that are already deeper in MDB. Copying those screens wholesale would have created duplicate Customers, Items, Quotes, Inventory, BOM, Opportunities, and Follow-Up models.

## Source that was audited

- Local source: `C:\Users\Jon\.codex\.chatgpt-projects\g-p-6a625b2f64348191869e41c3cbd856a5\MDB_Portfolio_Demo\site`
- Historical Netlify site: `mdb-operations-portfolio`
- Site ID: `718892eb-1cd9-4cbb-80ab-3c2ecc741c02`
- Historical URL: `https://mdb-operations-portfolio.netlify.app`
- Audited deploy ID: `6a8258d7395d972421dfd4f3`
- Deploy title: `Publish portfolio-safe synthetic MDB demo`
- Deploy source: Netlify CLI; three static files; no Functions and no database

The deployed files matched the local portfolio source byte-for-byte at audit time:

| File | SHA-256 |
| --- | --- |
| `index.html` | `F71D67D1D4D7EAD6BD0A95BCCB3F4922E36F24A60713F3992A40B824E4C7C104` |
| `app.js` | `6C21CBCCA81239FE630851FE1E9B4831CB25F45A380680999A29C746270F73D5` |
| `styles.css` | `A3683E50D019D332C8E29A6F9082FCCC589C00A589A807B930A77F2A6B6D42D3` |

## Capability disposition

| Standalone portfolio area | Unified MDB disposition |
| --- | --- |
| Customers | Superseded by the deeper Customer Profile and history workspace |
| Parts Search | Superseded by Item Master, Tooling, universal search, and serial/BOM navigation |
| Quotes | Superseded by the current Quote workspace and order handoff |
| Inventory | Superseded by current Inventory plus reservation, shipment, and build posting behavior |
| BOM | Superseded by the source-derived rig BOM and tooling architecture |
| Opportunities | Retained through Rig Sales rather than duplicated |
| Follow-Up | Retained through Daily Call List and customer interaction history |
| Guided Tour | Retained through current training and knowledge surfaces |
| Production coordination | Expanded into Build Requests, Build Orders, Production Control, and the shared Operations Job |
| Service coordination | Expanded into Service Requests, Service Work Orders, the Operations Board, capacity, checkpoints, signoff, and closeout |

## Unified production workflow

The missing operational value was converted into one controlled flow:

1. Sales creates a Build Request from an exact Sales Order line. The request cannot exceed the line quantity that has not already been requested.
2. Production Control is the gatekeeper. It can accept or return the request, commit a completion date, set priority, assign a shop cell, and create the controlled Build Order.
3. Only Production Control can edit the open production plan or release it to the shop.
4. Release checks availability and reserves planned components. A shortage prevents the release without partially reserving inventory.
5. The shop can report reserved component consumption and finished quantity, but cannot rewrite the plan, date, priority, assignment, or source demand.
6. Sales tracks the same request through waiting, scheduled, released, in-production, exception, and complete states without editing the controlled Build Order.
7. Reopening unused work returns its component reservations. Finishing a build releases any unused reservation, adds finished quantity to inventory, and fulfills the originating Build Request.

The public demo simulates these role boundaries in-browser so the workflow can be evaluated. The operational foundation in `PRODUCTION_CONTROL_FOUNDATION.md`, its database migration, and the authenticated `production-control` Function are the enforcement path for a future internal deployment.

The next merge layer is now defined in
`OPERATIONS_JOB_AND_SERVICE_FOUNDATION.md`. It links Build Orders and separate
Service Work Orders to one shared Operations Job so the gatekeeper can direct
production and service capacity without erasing their specialized behavior.

## Deliberate exclusions

- No duplicate ERP navigation, posting journals, finance, purchasing, or administrative setup was copied from Business Central.
- No standalone synthetic customer, price, or inventory dataset became company truth.
- No direct GP write-back was added. GP remains the current transactional authority.
- No live Supabase schema or data was changed during this interface merge.
- The historical Netlify site was not deleted, redirected, or overwritten.
- The new shared operations/service foundation remains on its local feature
  branch until review; it has not been deployed or connected to live company
  systems.

## Retirement gate

Retire or redirect the historical `mdb-operations-portfolio` site only after the unified MDB site passes stakeholder review, authenticated operational testing, company-data validation, and an approved production deployment. Until then, it is a frozen comparison artifact—not a second development track.
