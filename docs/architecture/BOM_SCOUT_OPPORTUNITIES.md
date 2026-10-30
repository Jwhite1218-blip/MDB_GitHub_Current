# Two additional BOM opportunities — Scout Two handoff

Saved at Jon's request, 2026-09-09. **Documentation-reviewed concepts; neither candidate has been runtime tested.** These complement the [Gubbins production handoff](GUBBINS_PRODUCTION_OPPORTUNITY.md), without changing MDB's controlled BOM/CTS authority, controller approvals, stock reservations, postings or GP authority.

## 1. eBOMGen: explain where imported quantities came from

Source: https://github.com/SayCV/ebomgen. Upstream ownership; license has not been inspected or cleared in this review.

The useful idea is source-to-line traceability: group matching components while preserving source references so a reviewer can explain each quantity. Unknown prices should show incomplete costing, not a complete-looking total. The saved README groups component references and shows an unpriced component in its cost example; that is evidence for a review opportunity, not proof that the application handles missing costs correctly.

**MDB starting point:** a preview alongside reviewed BOM intake, showing source document/revision, source references, normalized part identity, quantity, price completeness and unresolved mappings. It does not authorize the BOM or add parts to orders. This tool parses electronic designs; it has not demonstrated mechanical drawing or auger support. Borrow the pattern only until technical and license review justify code reuse.

**First experiment, not yet run:** inspect the source and supported PADS path, then use a synthetic fixture with two identical capacitors, a third of a different footprint, and one unpriced crystal. Require grouped quantities 2/1/1, retained references, no cross-footprint merge and explicit incomplete-cost status. Failure of price handling must not hide success/failure of grouping.

**Limits:** the README introduction advertises KiCad/Eagle but its TODO marks them unfinished. Validate each format; do not advertise general CAD support. No parser runtime, reliability-estimation result, dependency audit or deployment verified.

## 2. BOMWiki: preview the impact of a proposed revision

Source: https://github.com/BOMWiki/bomwiki. Upstream ownership. README declares AGPL-3.0; exact license and proposed reuse need review before copying source.

The useful idea is an advisory change-impact panel: compare a proposed BOM with the approved revision and show how material demand, buildable count and limiting parts change. Preserve both revision identifiers and the stock snapshot so the explanation is reproducible.

**MDB starting point:** after the Gubbins material-readiness preview is independently validated, calculate the same preview for a proposed discrete BOM revision. Display old/new values and verification gaps. Keep explicit controller approval and existing reservation transactions separate; no automatic trust-based publishing or committed schedule changes.

**First experiment, not yet run:** a standalone synthetic fixture with 10 bearings, approved requirement 2 per unit and proposed requirement 3. Expect capacity to change from 5 to 3 with both revision IDs attached. When the analyzer is unavailable, show Analysis unavailable, never a green approval. Use no customer records, deployment or BOMWiki service. This would test our proposed connection, not prove BOMWiki's implementation.

**Limits:** public repository is an incomplete reading mirror; proprietary CAD Studio and hosted analyzer are omitted. Do not assume a complete runnable engine. Snapshot revisions, three-way merge and analyzer behavior are README claims, not independently tested functionality. Use only discrete quantities while Gubbins' fractional roll-up defect remains unresolved.

## Evidence and next action

See [Scout Two's independent review](../evidence/scout-bom/REVIEW.md) and its saved README evidence in the same folder. No new test passes or adoption decisions are implied by this handoff. Both discoveries remain Needs audit / concept candidates in the Ammo Chest and operator-authored hypotheses in Scout's opportunity cards.

Recommended order: validate the small 5-to-3 revision-impact fixture first; investigate eBOMGen grouping second if a real import source needs it. Keep both within existing MDB production workflows rather than creating another inventory application.
