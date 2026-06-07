FROM oven/bun:1.3.14 AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/lookup/package.json ./packages/lookup/package.json

RUN bun install --frozen-lockfile --production

# IMPORTANT: build this image for linux/amd64. The CloakBrowser stealth Chromium
# (CloakHQ/chromium-stealth-builds) ships Linux x64 + macOS arm64 only — there is
# no Linux arm64 build. On Apple Silicon:
#   docker build --platform=linux/amd64 -t feruz-crawler .
FROM oven/bun:1.3.14 AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Runtime libraries + fonts required by the CloakBrowser stealth Chromium.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdbus-1-3 \
    libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libx11-xcb1 \
    libfontconfig1 libx11-6 libxcb1 libxext6 libxshmfence1 libglib2.0-0 \
    libgtk-3-0 libpangocairo-1.0-0 libcairo-gobject2 libgdk-pixbuf-2.0-0 \
    libxss1 libxtst6 \
    fonts-liberation fonts-noto-color-emoji fonts-unifont fonts-freefont-ttf \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-tlwg-loma-otf \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Deterministic, user-independent cache path for the stealth Chromium binary.
ENV CLOAKBROWSER_CACHE_DIR=/app/.cloakbrowser

COPY --from=deps /app/node_modules ./node_modules

# Pre-download the ~200MB stealth Chromium at build time so containers start
# instantly. Placed before copying source so this heavy layer stays cached
# across application code changes.
RUN bun -e "const { ensureBinary } = await import('cloakbrowser'); await ensureBinary();"

COPY . .

EXPOSE 3000

CMD ["bun", "apps/api/src/index.js"]
