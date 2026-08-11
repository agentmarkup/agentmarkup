FROM node:22.16.0-bookworm-slim AS build

WORKDIR /app

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile \
    && pnpm -C website build

FROM node:22.16.0-bookworm-slim

WORKDIR /app

RUN npm install --global wrangler@4.76.0

COPY --from=build /app/website/dist ./dist

EXPOSE 8080

CMD ["wrangler", "pages", "dev", "dist", "--ip", "0.0.0.0", "--port", "8080", "--compatibility-date", "2026-03-17"]
