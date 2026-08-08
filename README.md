# Blog X

Blog X 是一个面向个人写作的全栈博客。当前 Phase 1 已覆盖管理员登录、Markdown 草稿与安全预览、发布生命周期、公开首页分页和文章永久链接。

## 本地前置条件

- Node.js 24.15 或更高版本，并启用 Corepack。
- 可运行 Linux 容器的 Docker Engine，以及 `docker-compose` 命令。
- 至少 4 GB 可用内存；完整验收只启动 Web、API、PostgreSQL 和一个 Chromium worker。

首次准备：

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium
cp .env.example .env
```

`.env` 只用于普通本地开发，不得提交真实凭据。完整验收会自行生成随机管理员密码、数据库名、Compose 命名空间和 Web 端口，并且不会打印这些秘密。

## 一条命令完成 Phase 1 验收

```bash
corepack pnpm local:verify -- --full-phase --interruption-check --parallel-check
```

这条命令会检查环境与架构边界，构建本地镜像，启动隔离 PostgreSQL，执行并发迁移和 schema/迁移账本检查，模拟迁移中断与原卷重试，创建随机管理员，运行类型检查、构建、API 测试及单一浏览器发布旅程，最后再运行两个并行隔离命名空间。无论成功或失败，它都只清理本次生成并校验过的资源。

只验证容器、迁移恢复和并行隔离时：

```bash
corepack pnpm local:verify -- --infrastructure-only --interruption-check --parallel-check
```

Phase 1 的规范验收完全使用本地基础设施，不会连接或部署到任何云服务器，也没有远程回退路径。

## 手动启动与检查

需要在浏览器中持续查看页面时，可以使用固定且独立的 `blogxlocal` Compose 项目：

```bash
docker-compose -p blogxlocal -f compose.yaml up -d --build postgres
docker-compose -p blogxlocal -f compose.yaml run --rm api corepack pnpm --filter @blog-x/api db:migrate
docker-compose -p blogxlocal -f compose.yaml run --rm api corepack pnpm --filter @blog-x/api db:schema:verify
export ADMIN_USERNAME=local-admin
export ADMIN_PASSWORD=choose-a-long-random-local-password
docker-compose -p blogxlocal -f compose.yaml run --rm -e ADMIN_USERNAME -e ADMIN_PASSWORD api corepack pnpm --filter @blog-x/api db:seed
docker-compose -p blogxlocal -f compose.yaml up -d --wait api web
curl --fail http://127.0.0.1:3100/api/health
```

随后访问 [http://127.0.0.1:3100](http://127.0.0.1:3100)。只有 Web 的 `3100` 端口绑定到本机回环地址；API 和 PostgreSQL 仅位于 Compose 内部网络。

日常停止服务并保留数据库卷：

```bash
docker-compose -p blogxlocal -f compose.yaml down --remove-orphans
```

再次启动时可重复执行迁移；迁移带有 PostgreSQL advisory lock，并应收敛到唯一账本记录。普通停止不删除数据卷。

## 常用开发检查

```bash
corepack pnpm -r typecheck
corepack pnpm -r build
corepack pnpm check:boundaries
corepack pnpm test:ops
```

## 常见问题

- Docker 无法拉取镜像：先确认 Docker 运行时已启动，并且运行时内部 DNS 能解析镜像仓库；修复网络后直接重跑同一验收命令。
- Chromium 缺失：重新执行 `corepack pnpm exec playwright install chromium`。
- `3100` 被占用：规范验收会自动选择空闲端口；手动模式可设置 `BLOG_X_WEB_PORT` 后重新启动。
- 上次验收被中断：直接重跑规范命令。每次运行使用独立命名空间，清理范围不会扩展到其他 Compose 项目。

生产拓扑与冻结约束记录在 [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md)，但不属于 Phase 1 的执行路径。
