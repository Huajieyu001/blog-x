FROM node:24.15.0-alpine

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN corepack pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/contracts packages/contracts

EXPOSE 3001
CMD ["corepack", "pnpm", "--filter", "@blog-x/api", "dev"]
