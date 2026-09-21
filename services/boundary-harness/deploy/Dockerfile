FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ wget \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY openapi ./openapi

RUN pnpm install --frozen-lockfile

ENV DATABASE_PATH=/app/data/harness.db
ENV HARNESS_MODE=all
ENV PORT=8080
EXPOSE 8080

CMD ["pnpm", "--filter", "@harness/api", "start"]
