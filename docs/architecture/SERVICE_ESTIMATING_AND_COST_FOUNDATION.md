# Service Estimating and Cost-Learning Foundation

## Purpose

Service pricing is qualified work. MDB must reduce repetitive assembly without
turning incomplete field evidence into an automatic customer promise. The
workflow therefore separates four records and four authorities:

```text
Service Request -> Service Estimate -> Gatekeeper approval
                                      |
                                      +-> Service Work Order -> Actual cost
```

- **Service Request:** what the employee, customer, email, Mobile Lite command,
  or future NFC rig profile reported.
- **Service Estimate:** the qualified estimator's commercial interpretation of
  that evidence: scope, assumptions, exclusions, cost, sell price, source, and
  override rationale.
- **Gatekeeper approval:** accepts or returns the locked estimator package and
  controls the customer commitment and routing decision.
- **Service Work Order:** executes only the approved scope and captures actual
  labor, parts, travel, and outside cost.

The general Sales Quote Builder is not used as the authority for this process.
A service estimate requires cost visibility and service-specific judgment that
ordinary product quoting does not.

## Qualified estimator boundary

The `service_estimator` role is separate from `service_controller`.

- A requester cannot create or edit a Service Estimate.
- A Service Estimator can create, scan, edit, and submit an assigned estimate.
- Submitted and approved revisions are locked.
- A Service Estimator cannot approve their own package.
- A Service Gatekeeper can return or approve a submitted package but cannot
  silently rewrite its commercial lines.
- Admin is the emergency authority; it should not be the daily workflow.

The two actual qualified employees have not been named in the repository. The
public sandbox uses `Qualified Estimator A` and `Qualified Estimator B` as
configuration placeholders, not assertions about MDB personnel.

## Guided estimate matrix

The estimator worksheet keeps the source evidence beside the commercial work:

1. rig/asset identity, model, hours, urgency, mode, location, and requester;
2. detected service family and a starting labor pattern;
3. customer-facing scope, assumptions, and exclusions;
4. labor, parts, travel, outside service, shop supplies, and contingency lines;
5. unit cost, unit sell, source type, source reference, and confidence per line;
6. a required reason whenever an estimator overrides the reference cost or
   sell rate;
7. total cost, quote price, gross profit, margin, confidence, and handoff
   completeness in one visible summary.

MDB's recommendation is explainable. It records the intake pattern and pricing
profile version used. It does not diagnose the machine, invent a part, or hide
an override. A placeholder `Parts pending qualified estimator selection` line
is optional and excluded from the quote until the estimator selects real parts.

## Pricing structure

`service_pricing_rules` is the controlled rate-card surface. A rule is versioned
and can vary by service family, service mode, and line type. It stores:

- reference unit cost;
- recommended unit sell price;
- unit of measure;
- evidence count and confidence;
- effective dates and approval evidence.

The sandbox profile is intentionally marked **DEMO PLACEHOLDER**. Real MDB labor
burden, sell rates, travel rules, margin bands, and approval thresholds are not
known yet and must not be inferred from the portfolio values.

## Estimate-to-actual learning

`service_actual_cost_entries` is append-only evidence captured against the
Service Work Order. Entries distinguish Time Entry, GP, Inventory, Outside
Invoice, and Manual sources and retain a source reference. The Operations Board
shows approved quote, estimated cost, actual cost, variance, and actual margin.

This is the basis for later recommendations:

1. start with an approved rate card and conservative confidence;
2. capture actual time, material, travel, and outside invoices;
3. compare estimate versus actual by service family and line type;
4. surface evidence counts and variance to the qualified estimators;
5. let an authorized human approve a new pricing-profile version.

MDB does not silently train on email text or change customer pricing on its own.
Only closed, attributable operational evidence should influence a proposed rate
update, and a qualified human must approve that update.

## Configuration still required

Before production pricing is enabled, MDB needs:

- the names and identity subjects of the two qualified Service Estimators;
- approved labor burden and customer labor rates by work type;
- field travel, mileage, mobilization, per-diem, and overtime rules;
- part-cost source and markup/margin rules from GP;
- outside-service and freight treatment;
- target margin bands and exception-approval thresholds;
- quote validity, tax, warranty, and customer-authorization language;
- the existing service quote examples used to establish the first evidence
  counts and confidence levels.

