# CloakBrowser support in the Docker build — Design

**Date:** 2026-06-07
**Status:** Approved (design)
**Scope:** Image-only. Make the Docker build capable of running CloakBrowser. No application code changes.

## Goal

Bake [CloakBrowser](https://github.com/CloakHQ/cloakbrowser) into the `feruz-crawler` API Docker image so the container can launch the stealth Chromium without downloading it at runtime. The crawler's current endpoints (`/health`, `/`) are unchanged.

CloakBrowser is the npm package `cloakbrowser` plus a peer driver. It exposes a Playwright-style API and, on first launch, auto-downloads a ~200MB patched stealth Chromium from [`CloakHQ/chromium-stealth-builds`](https://github.com/CloakHQ/chromium-stealth-builds), cached under `~/.cloakbrowser/chromium-<version>/` (overridable via `CLOAKBROWSER_CACHE_DIR`).

## Decisions

- **Package:** `cloakbrowser`
- **Driver peer:** `playwright-core` (the primary/default API: `import { launch } from 'cloakbrowser'`)
- **Approach:** Extend the existing multi-stage `oven/bun` build (no foreign base image). No official Bun-based CloakBrowser image exists — the only official image, `cloakhq/cloakbrowser`, is `python:3.12-slim` + Node 20.
- **Pre-download:** Fetch the stealth binary at build time so containers start instantly.
- **Platform:** Image is pinned to `linux/amd64` (see Constraints).

## Architecture / changes

### 1. Dependencies (`apps/api/package.json`)

Add to `dependencies` (regular, not dev — `--production` must keep them):

- `cloakbrowser`
- `playwright-core`

Run `bun install` locally to regenerate `bun.lock`. The Dockerfile's `deps` stage uses `bun install --frozen-lockfile`, so the lockfile must already contain both packages.

### 2. Dockerfile (stays on `oven/bun:1.3.14`, multi-stage)

**`deps` stage:** unchanged structurally. `bun install --frozen-lockfile --production` now also resolves `cloakbrowser` + `playwright-core` into `node_modules`.

**`runtime` stage**, ordered for layer caching:

1. `apt-get update && apt-get install -y --no-install-recommends <libs>` then `rm -rf /var/lib/apt/lists/*`.
   System libraries + fonts (CloakHQ's list, trimmed for a headless Bun server):
   ```
   libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdbus-1-3
   libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3
   libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libx11-xcb1
   libfontconfig1 libx11-6 libxcb1 libxext6 libxshmfence1 libglib2.0-0
   libgtk-3-0 libpangocairo-1.0-0 libcairo-gobject2 libgdk-pixbuf-2.0-0
   libxss1 libxtst6
   fonts-liberation fonts-noto-color-emoji fonts-unifont fonts-freefont-ttf
   fonts-ipafont-gothic fonts-wqy-zenhei fonts-tlwg-loma-otf
   ca-certificates
   ```
   **Trimmed from CloakHQ's list:** `xvfb`, `xdotool` (headed mode only), `nodejs` (we run Bun), `curl` (not needed for the build). `ca-certificates` is kept for TLS during the binary download and during browsing.
2. `ENV CLOAKBROWSER_CACHE_DIR=/app/.cloakbrowser` — fixed, user-independent path so the binary location is deterministic regardless of which user the container runs as.
3. `COPY --from=deps /app/node_modules ./node_modules`
4. Pre-download the stealth binary (runs before copying source so the ~200MB layer stays cached across app edits):
   ```
   RUN bun -e "const { ensureBinary } = await import('cloakbrowser'); await ensureBinary();"
   ```
5. `COPY . .`
6. `EXPOSE 3000`, `CMD ["bun", "apps/api/src/index.js"]` (unchanged).

### 3. `.dockerignore`

Add `.cloakbrowser` so a developer's local cache directory can never be copied over the build-time download by `COPY . .`.

## Constraints

- **Platform: `linux/amd64` only.** `chromium-stealth-builds` ships Linux **x64** and macOS arm64 — there is **no Linux arm64** stealth binary. The image must be built and run as `linux/amd64`. On Apple Silicon: `docker build --platform=linux/amd64 …` (emulated). Without this, `ensureBinary()` cannot find a binary. This is documented in the Dockerfile and the build instructions.
- **Debian release:** `oven/bun:1.3.14` and `python:3.12-slim` are both Debian bookworm-based, so the apt package names from CloakHQ's Dockerfile apply directly. Confirm during implementation.

## Error handling

- If `ensureBinary()` fails at build time (e.g. wrong platform, missing binary for the arch), the `docker build` fails fast — the broken image is never produced.
- The binary is verified by SHA-256 by the package's own download logic.

## Verification (no app code changes)

1. `docker build --platform=linux/amd64 -t feruz-crawler .` completes successfully.
2. The stealth binary exists in the image under `/app/.cloakbrowser/`.
3. Smoke launch:
   ```
   docker run --rm feruz-crawler bun -e "const {launch}=await import('cloakbrowser'); const b=await launch(); const p=await b.newPage(); await p.goto('about:blank'); console.log('ok'); await b.close();"
   ```
   prints `ok`.
4. Existing endpoints still work: `docker run` the image, `GET /health` returns `{ ok: true }`.

## Risks

- **Bun + Playwright launch:** CloakBrowser claims Bun support, but Playwright-style browser launch under Bun can be finicky. The smoke-launch verification step (above) is how we catch this before declaring done.
- **Exact pre-download invocation:** README documents `await ensureBinary();` (primary path). If the installed package instead exposes a CLI bin (e.g. `bunx cloakbrowser install`), use that. Confirm against the installed package during implementation.

## Out of scope (possible follow-ups)

- Wiring CloakBrowser into `packages/lookup` / crawler logic (Scope C).
- A `/cloak/health` runtime endpoint that launches the browser (Scope B).
- Headed mode (`xvfb`/`xdotool`) support.
