# Evidence provenance

Copied from the isolated Scout validation on 2026-09-09. Inputs are synthetic. No upstream application source or private shop records are included.

Original workspace: C:/Users/Jon/Documents/ChatGPT/workforce product/market-scout/code-scout/validation/round-004.

To reproduce elsewhere, put the test harnesses and JSON outputs together in a new scratch directory, clone BootBlock/Gubbins into its gubbins/ subdirectory and check out 71ffeafc14fa53459be6bb9c3c1042a835d18af2. With Node 24 run node test-gubbins.mjs. It deliberately exits nonzero for the fractional-input defect. In an isolated Python environment install python-requirements.txt and run test-material-to-schedule.py. The Python script reads the fresh gubbins-results.json. No NLTK model is needed for this scheduling-only experiment. Do not run installs inside the MDB application environment.

The upstream README version and schema warnings are observations, not verified upgrade tests. Original execution timestamps are preserved. Dependencies and upstream code were not changed by the Scout tests.
