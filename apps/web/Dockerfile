FROM node:24.15.0-alpine AS dependencies

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN corepack pnpm --filter @blog-x/web... install --frozen-lockfile

FROM dependencies AS build

ARG INTERNAL_API_ORIGIN=http://api:3001
ENV INTERNAL_API_ORIGIN=${INTERNAL_API_ORIGIN}
ENV NEXT_TELEMETRY_DISABLED=1

COPY apps/web apps/web
COPY packages/contracts packages/contracts

# Keep this after the dependency layer: the public origin is compiled into Next output.
ARG PUBLIC_ORIGIN=http://127.0.0.1:3100
ENV PUBLIC_ORIGIN=${PUBLIC_ORIGIN}
RUN corepack pnpm --filter @blog-x/web build

FROM node:24.15.0-alpine AS production-dependencies

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN corepack pnpm --filter @blog-x/web... install --prod --frozen-lockfile

FROM node:24.15.0-alpine

ARG BLOG_X_REVISION
LABEL org.opencontainers.image.revision=${BLOG_X_REVISION}

WORKDIR /workspace
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable \
  && mkdir -p /workspace/apps/web/.next/cache \
  && chown -R 1000:1000 /workspace

COPY --chown=1000:1000 package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=1000:1000 apps/web/package.json apps/web/package.json
COPY --chown=1000:1000 packages/contracts/package.json packages/contracts/package.json
COPY --from=production-dependencies --chown=1000:1000 /workspace/node_modules /workspace/node_modules
COPY --from=production-dependencies --chown=1000:1000 /workspace/apps/web/node_modules /workspace/apps/web/node_modules
COPY --from=production-dependencies --chown=1000:1000 /workspace/packages/contracts/node_modules /workspace/packages/contracts/node_modules
COPY --chown=1000:1000 apps/web/server.mjs apps/web/server.mjs
COPY --chown=1000:1000 packages/contracts/src packages/contracts/src
COPY --from=build --chown=1000:1000 /workspace/apps/web/.next /workspace/apps/web/.next

USER node
EXPOSE 3100
CMD ["node", "apps/web/server.mjs"]
