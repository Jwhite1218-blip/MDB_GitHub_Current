# MDB — Project State

Last verified: 2026-09-03

## Current stage
Active internal operations build with production deployment.

## Canonical source
- Repository: `Jwhite1218-blip/MDB_GitHub_Current`
- Canonical branch: `main`
- Production site: `mobiledrillbrain`
- Production URL: `https://mdbgeotech.com`
- Verified production commit: `446e8382eb031adcec4d2b03ecdd601295692904`
- GitHub `main` and production were verified identical on 2026-09-03.

## Environment roles
- Production: `mobiledrillbrain` / `mdbgeotech.com`.
- Portfolio snapshot: `mdb-operations-portfolio` — frozen synthetic/portfolio demo; never use it as the active MDB codebase.
- Archived preview shell: `archive-mdb-feedback-preview` — team-only and not a valid staging target.

## Current milestone
Validate and tighten the Operations Job / Service / Production Control workflows and GP read-sync/data reconciliation against the real working process before another large UI expansion.

## Current rules
- All production work starts from current `main`.
- Do not revive old feature branches as parallel product versions without comparing them to current `main` first.
- If a real staging environment is needed, designate one branch and one non-production Netlify site explicitly before deploying.
- Keep the portfolio demo frozen and separate from internal production logic/data.

## Next three actions
1. Review the architecture/operations documentation for statements that still describe already-merged work as feature-branch-only and update them when touched.
2. Use the real GP/data reconciliation path as the next technical validation target rather than adding unrelated surfaces.
3. Create a new designated review branch/environment only when a change actually needs staging; do not reuse the archived preview shell by accident.
