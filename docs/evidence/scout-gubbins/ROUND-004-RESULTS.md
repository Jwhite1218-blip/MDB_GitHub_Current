# Round 4 — standout: material readiness plus production scheduling

**Gubbins is the strongest new reuse candidate in this round for discrete shop parts.** Its pure inventory logic passed 12 of 13 independent scenario checks, including one check covering 100 shared-material stock levels. A fractional recipe roll-up failed. A separate experiment successfully passed the actual Gubbins buildable count into PyJobShop to schedule 27 operations for nine synthetic units.

This is component-level evidence, not a production-ready application or a business ROI claim.

## Source and scope

- Repository: https://github.com/BootBlock/Gubbins
- Downloaded revision: `71ffeafc14fa53459be6bb9c3c1042a835d18af2`.
- package.json reports 0.32.0; README still says 0.3.0. Pin the commit rather than treating README version text as authoritative.
- Upstream owner: Joe Cox / Gubbins contributors. LICENSE is MIT; retain required notices. Localis does not own the upstream code.
- Directly imported, unchanged TypeScript modules using Node 24: kit-availability.ts, kits.ts, batches.ts and stock.ts. No app dependencies installed, no upstream source modifications, no database, browser, service or customer data used.
- Exact execution timestamps and case outputs are in gubbins-results.json. The repository clone is a test input, not another maintained Localis product.

## Why it stands out

The tested logic connects a bill of materials to operational decisions:

| Synthetic stock | Requirement per auger | Capacity |
|---|---|---|
| 12 shafts | 1 | 12 units |
| 70 flights | 6 | 11 units |
| 18 bearings | 2 | 9 units |

It correctly returned nine buildable units and bearings as the limiting part. Increasing bearings to 24 correctly shifted capacity to 11 units and flights as the limiting part. A request for ten units against the original stock explicitly reported 20 bearings needed versus 18 available. The nine-unit assembly plan drew exactly nine shafts, 54 flights and 18 bearings.

Additional passing checks covered shared raw material across subassemblies, already-built subassemblies reducing demand, earliest-expiry batch consumption, explicit shortages, selected-lot isolation, transfer limits, and deterministic circular-assembly repair. The 100-case check compared shared-material capacity with independent arithmetic; these are not 100 separate production workflows.

## Confirmed limit — fractional recipe count

A portion requiring 0.25 kg from 1 kg of flour should allow four portions. rollUpBuildable returned one, while planAssembly correctly allowed four. The availability ceiling and assembly planner therefore disagree for this fractional input. Source inspection shows the roll-up search ceiling sums floored on-hand stocks, which is not a safe bound when each output consumes less than one stock unit.

Do not promote the nested roll-up for fractional recipes or gauge materials until corrected and retested. This failure does not erase the passing discrete-part scenarios. No fix was made, and no upstream issue was posted.

## Material-to-schedule experiment

test-material-to-schedule.py reads the actual nine-unit result in gubbins-results.json and constructs nine three-step jobs in PyJobShop 0.0.9. Assumed durations: prep two, weld four, inspection one, with one machine for each step. It found an optimal finish at 39 arbitrary time units. An independent lower bound is 2 + 9*4 + 1 = 39; all precedence and same-machine non-overlap constraints were checked. Results are in material-to-schedule.json.

This proves a small data handoff, not a deployable integration. Real routings, labor availability, setup rules, material reservations, downtime, scrap, due dates and cross-order stock competition still need modeling. No claim that these are actual auger process times.

## Adoption barriers and next step

The README warns that pre-1.0 schema changes can require a local-data reset. Backup/restore, migrations, browser persistence, transaction safety, sync, security and the complete UI were not tested here. Batch logic is a withdrawal planner; earliest-expiry selection is not proof that expired food is blocked from use.

Save as **Partial — promising discrete inventory mechanisms**, paired experimentally with PyJobShop. Next useful validation is a small representative auger BOM and routing supplied by Jon, with synthetic or authorized stock quantities. Keep the fractional defect and upgrade warning attached to the inventory entry.

## Other leads screened this round

These were documentation reviews, not runtime tests or automatic rejection:

- BOMWiki: versioned BOM graph and merge mechanisms are interesting, but README explicitly says the public mirror omits proprietary CAD Studio source and is not a complete runnable checkout.
- eBOMGen: electronics-focused; README's TODO leaves KiCad and Eagle processing unchecked despite broad introductory support language. Not the leading fit for auger production.
- SolverForge: additional Rust/WASM/Java service prerequisites; no runtime verification this round.
- Pantry Tracker: Android pantry app; single-user scope and platform setup make it less direct for the current shop test.
- PDF Extractor and Unpack_pdf: document extraction leads remain pending runtime checks; the reviewed descriptions did not justify choosing them over Gubbins in this round.

## Reproduce

From round-004 with the pinned Gubbins clone present:

```powershell
node test-gubbins.mjs
../round-001/.venv/Scripts/python.exe test-material-to-schedule.py
```

The first command intentionally exits nonzero for the confirmed fractional failure. Original discovery history and prior rounds remain unchanged. Seven of 35 leads now have runtime evidence; 24 remain without runtime/source resolution after accounting for the four archive/fit exclusions. Separate Timefold Java referral is outside that count.
