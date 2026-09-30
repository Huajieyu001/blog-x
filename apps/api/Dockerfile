FROM node:24.15.0-alpine AS dependencies

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN corepack pnpm --filter @blog-x/api... install --frozen-lockfile

FROM dependencies AS build

COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN corepack pnpm --filter @blog-x/api build

FROM node:24.15.0-alpine AS production-dependencies

WORKDIR /workspace
ENV COREPACK_HOME=/corepack-cache
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN corepack pnpm --filter @blog-x/api... install --prod --frozen-lockfile

FROM node:24.15.0-alpine

ARG BLOG_X_REVISION
LABEL org.opencontainers.image.revision=${BLOG_X_REVISION}

WORKDIR /workspace
ENV NODE_ENV=production
ENV COREPACK_HOME=/home/node/.cache/node/corepack

RUN corepack enable \
  && mkdir -p /var/lib/blog-x/media \
  && mkdir -p /home/node/.cache/node/corepack \
  && chown -R 1000:1000 /workspace /var/lib/blog-x/media

COPY --chown=1000:1000 package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=1000:1000 apps/api/package.json apps/api/package.json
COPY --chown=1000:1000 packages/contracts/package.json packages/contracts/package.json
COPY --from=production-dependencies --chown=1000:1000 /workspace/node_modules /workspace/node_modules
COPY --from=production-dependencies --chown=1000:1000 /workspace/apps/api/node_modules /workspace/apps/api/node_modules
COPY --from=production-dependencies --chown=1000:1000 /workspace/packages/contracts/node_modules /workspace/packages/contracts/node_modules
COPY --from=production-dependencies --chown=1000:1000 /corepack-cache /home/node/.cache/node/corepack
COPY --chown=1000:1000 apps/api/src apps/api/src
COPY --chown=1000:1000 apps/api/drizzle apps/api/drizzle
COPY --chown=1000:1000 packages/contracts/src packages/contracts/src

USER node
EXPOSE 3001
CMD ["corepack", "pnpm", "--filter", "@blog-x/api", "start"]
