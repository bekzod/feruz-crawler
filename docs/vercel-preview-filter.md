# Vercel preview build filter

Only preview builds skip reliably unrelated changes. Production always builds: VERCEL_GIT_PREVIOUS_SHA is project/branch-scoped, not target-specific, so even master may reference a preview rather than the last production deployment. Production filtering needs a separately verified production baseline and is not implemented. Unknown/development/custom environments, same-SHA redeployments, rollbacks and rewritten history always build.

All shared packages and workspace manifests/locks remain build-affecting.

Ignored independent paths: apps/api/, apps/worker/, docs/ plus root README/AGENTS/ARCHITECTURE/design-qa documentation. All unknown paths, shared packages, frontend code/config and manifests/locks always build. Remove an exclusion before importing its code into the frontend.

Uses Vercel's last successful branch deployment SHA (VERCEL_GIT_PREVIOUS_SHA), or origin/master merge base for a first preview. Cumulative changes are checked, not HEAD^. Missing Git history, shallow gaps, unavailable baseline/fetch or Git failures permit a build. First-baseline fetch is bounded to 100 commits/20 seconds. Rename/deletion checks use no-renames and NUL-delimited paths.

No dependencies need installation. Vercel exit 0 skips, exit 1 builds. Deployment records may still appear. No dashboard settings or existing CI checks changed. For a forced rebuild, bypass the ignore step during redeployment.

Test: `node --test apps/web/scripts/ignore-vercel-preview.test.mjs`

References: https://vercel.com/docs/project-configuration/vercel-json#ignorecommand and https://vercel.com/docs/environment-variables/system-environment-variables#vercel_git_previous_sha


First-branch limitation: private Vercel checkouts may lack fetch credentials or sufficient history. If no merge base is available, the first preview builds conservatively. No settings or credentials are changed to circumvent this.
