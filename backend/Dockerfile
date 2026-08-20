# --- deps: install once, cached across builds unless package*.json changes
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile && pnpm prisma generate

# --- build: compile Nest (tsc) -> dist/main.js
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- runtime: slim image, prod deps only
FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --prod && pnpm prisma generate
COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/main"]
