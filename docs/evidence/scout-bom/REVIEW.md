# Second Scout: overlooked enhancement review

Date: 2026-09-09. Reviewer: independently running second Scout agent.

This bounded pass read the three saved README files below, EVALUATION.md, and scout-opportunities/CARDS.md. No candidate code was executed, no packages installed, no new network searches performed, and no shared evaluation ledger changed. These are opportunity hypotheses supported by saved documentation, not runtime findings. README release/status statements are snapshot claims, not newly verified current facts.

## 1. SayCV/ebomgen — explainable BOM intake and missing-price review

**Potential:** enhancement; error prevention, time savings, learning.

**Overlooked use:** A design-to-purchasing preview that lets an operator trace each aggregated quantity back to its source references. For MDB, the transferable idea is showing *why* a material quantity is present before approving an imported BOM. An unexpected use is a repair bench identifying which board positions share one replacement component. This repository is an electronic-design parser, not evidence of support for mechanical auger drawings.

**Useful piece even if the package is unsuitable:** Grouped references alongside quantity, value and footprint; retain source identity when turning raw design data into purchasing lines. Its sample cost CSV also makes a useful negative example: missing prices should appear as unknown, not silently become a complete-looking total.

**Evidence and limits:** The README sample groups C1/C2 into quantity 2 and C3–C22 into quantity 20. Its cost example leaves the crystal's UnitPrice empty. The introduction advertises KiCad and Eagle, but its TODO marks both unfinished; format support must be checked individually. BOMMTBF is listed as checked but the example is empty, so there is no demonstrated reliability-estimation result. No license file or runtime behavior was reviewed in this pass.

**One small proposed experiment:** After source/dependency inspection, run an isolated supported PADS fixture with two identical capacitors, a third with a different footprint, and one unpriced crystal. Compare against a manually authored expected BOM. Require quantities 2/1/1, preserved references, no merging across footprints, and explicit incomplete-cost status for the crystal. If grouping passes but pricing does not, retain only the import/traceability concept. This experiment has not run.

Evidence: [saved README](SayCV--ebomgen.md).

## 2. DocGerd/pantry-tracker — a low-friction count station

**Potential:** enhancement; user experience, data capture, error prevention.

**Overlooked use:** Borrow the scan → preview → confirm interaction for a small receiving or stock-count station. The extra confirmation can prevent barcode lookup results from becoming unquestioned inventory facts. An unexpected use is keeping a service van's packaged consumables organized; custom industrial part labels would require a different lookup path and possibly barcode support.

**Useful piece even if the whole app is unsuitable:** Separate network lookup from local inventory actions, show the resolved item before changing quantity, and make scan-to-add versus scan-to-remove visually distinct. These are useful patterns for MDB even if the Android app is never embedded or copied.

**Evidence and limits:** README claims local Room/SQLite storage, anonymous product lookups, and EAN/UPC scanning. It explicitly scopes the app to a single user and excludes multi-user sync and expiry tracking. Therefore it is not evidence of a restaurant lot/expiry system or a shared warehouse ledger. The scope says shopping lists are a non-goal, while screenshot descriptions advertise a buying list and low-stock limits: resolve that documentation inconsistency before counting replenishment as working. Badges and a license declaration are claims, not verification of build quality, dependency rights, or privacy behavior. Build requires JDK 21 and Android SDK API 36; none were set up in this pass.

**One small proposed experiment:** In an isolated emulator after source review, preload one known barcode, disable networking, scan it three times while confirming only once, then force-stop and reopen the app. Scan an unknown barcode offline as well. Require exactly one committed increment to survive restart and the unknown item to remain unresolved rather than inventing a product. Record whether scanner callbacks cause unintended duplicates. This experiment has not run.

**Possible connection:** Its capture/confirmation pattern plus ReflectDB's separately tested sync ideas could inform a future shared count workflow. They have not been integrated; multi-device conflict and stock-movement semantics remain separate work.

Evidence: [saved README](DocGerd--pantry-tracker.md).

## 3. BOMWiki/bomwiki — show the impact of a proposed change

**Potential:** oddball/enhancement; traceability, new capability, review quality.

**Overlooked use:** An advisory "what changes if we approve this?" panel. Instead of merely saving BOM revision history, compare a proposed revision with the approved one and display affected material demand, buildable quantity, and the limiting part. An unexpected use is documenting compatible replacement parts and the reasons technicians accepted or rejected substitutions.

**Useful piece even if the engine is unsuitable:** The analyzer-sidecar contract returns findings beside proposed changesets. It suggests a way to connect Gubbins-style material calculations to human change review without making those calculations an approval authority. Plain-language changeset summaries and field-level history are additional interface patterns worth studying.

**Evidence and limits:** README describes snapshot revisions, three-way merges, integer-quantity graph checks, and an optional analyzer HTTP contract. It explicitly says this is an incomplete reading mirror: the proprietary CAD Studio is stripped, and its hosted analyzer is closed source. No complete runnable engine or analyzer has been verified. The README declares AGPL-3.0; exact license and intended reuse need review before copying code. The trust ladder's automatic publishing is not a recommendation for MDB production approvals. Merely receiving no analyzer findings must not be interpreted as a successful check.

**One small proposed experiment:** Make a standalone synthetic contract fixture, without deploying BOMWiki or changing MDB: bearing stock 10, an approved BOM requiring 2 bearings per unit, and a proposed BOM requiring 3. Have a read-only analyzer prototype report the buildable quantity change from 5 to 3 with both revision identifiers. Repeat with the analyzer unavailable; require "analysis unavailable," never a green approval. Keep other parts non-limiting and quantities discrete. This tests the proposed connection, not BOMWiki runtime reliability. It has not run.

Evidence: [saved README](BOMWiki--bomwiki.md).

## Suggested next experiment

Start with the BOM-change impact fixture: it is small, has independently checkable answers, and extends the strongest existing shop-production finding. It can evaluate the idea without installing an incomplete wiki or copying its code. Pantry Tracker's confirmed-scan flow is the next useful enhancement to investigate. eBOMGen remains an interesting adjacent-domain pattern whose advertised format support needs careful checking.

All three remain documentation-only opportunities from this review. No candidate is newly certified, rejected as broken, or promoted to production. The coordinator can decide whether to append these hypotheses to Scout's opportunity input after review.
