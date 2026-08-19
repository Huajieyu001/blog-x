FROM node:24.15.0-alpine AS build

WORKDIR /workspace
RUN corepack enable

ARG INTERNAL_API_ORIGIN=http://api:3001
ENV INTERNAL_API_ORIGIN=${INTERNAL_API_ORIGIN}
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN corepack pnpm install --frozen-lockfile

ARG PUBLIC_ORIGIN=http://127.0.0.1:3100
ENV PUBLIC_ORIGIN=${PUBLIC_ORIGIN}

COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN corepack pnpm --filter @blog-x/web build

EXPOSE 3100
CMD ["corepack", "pnpm", "--filter", "@blog-x/web", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3100"]
