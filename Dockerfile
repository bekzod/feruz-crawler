FROM oven/bun:1.3.14 AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/lookup/package.json ./packages/lookup/package.json

RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.14 AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["bun", "apps/api/src/index.js"]
