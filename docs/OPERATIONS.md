# Blog X 运维与恢复手册

> 状态：本地策略已验证；生产主机、证书、私网与告警证据待授权核验。
> 适用范围：本地 `blogxlocal` 与生成的 `blogxverify_*` 环境。

## 本地进程与日志策略

- PostgreSQL、API、Web 使用容器 init、`unless-stopped` 自动恢复和既有健康检查。
- 三个服务均使用 Docker `local` 日志驱动，单文件上限 10 MiB、最多 3 个文件。
- 只有 Web 绑定 `127.0.0.1`；API 与 PostgreSQL 不发布宿主机端口。
- API/Web 构建网络关闭且镜像拉取策略为 `never`。缺少固定基础镜像或依赖缓存时，本地验收应直接失败，不允许转向外部 registry。
- 尚未为生产设置 CPU/内存硬限制；必须先在授权主机上采集基线，再作为 04-03 发布证据确定。

查看本地状态：

```bash
node scripts/ops-status.mjs --project=blogxlocal --web-origin=http://127.0.0.1:3100
```

输出只包含 PASS、FAIL、NOT_EVALUATED 和汇总数值，不输出环境变量、数据库地址、Cookie、内部地址或原始 inspect JSON。没有单独授权且仍在有效期内的 TLS 证据时，证书状态必须显示 `NOT_EVALUATED`，不能解释为生产证书健康。

运行隔离的进程恢复验收：

```bash
corepack pnpm local:verify -- --phase4-operations
```

该命令只使用 Docker/Colima、生成的 Compose 命名空间和回环地址；它会终止生成环境中的 API 容器并验证 30 秒内恢复、重启计数增加以及数据库和媒体卷身份不变。

## 生产待决事项

以下内容尚未选择或测量，不能由本地通过结果代替：生产资源限制、日志采集目的地、告警接收人、证书与续期状态、节点间防火墙/加密链路、异机备份目的地、保留策略、加密密钥权威以及 RPO/RTO。

主服务器仍处于冻结状态；本文不提供远程执行命令，也不构成解除冻结或部署授权。

## 完整备份集合

Blog X 备份格式版本 1 将四类恢复权威放在同一个原子集合中：PostgreSQL 自定义格式 dump、保持不变的 `blog-x-portable-export` v1、API 所有的 source/derivative 媒体字节，以及不含秘密值的配置/镜像/迁移清单。`manifest.json` 记录每个 payload 的字节数与 SHA-256，`COMPLETE` 只绑定 manifest 哈希并且最后写入；集合通过验证后才从唯一 incomplete staging 目录原子改名。

生产策略文件不进入 Git。跟踪的 [backup-policy.names.json](../ops/backup-policy.names.json) 只列字段名和权威来源。创建命令在以下外部引用全部存在前拒绝运行：异机目的地、保留决策、加密密钥权威、告警接收人和服务秘密权威。仅在同一主机复制不构成灾难恢复；`daily` 定时器也不代表已经选择或测量 RPO/RTO。

本地生成策略准备完成后，操作顺序为：

```text
create.mjs --policy=<未跟踪的生成策略>
verify.mjs --backup-root=<精确生成的最终集合>
```

`ops/systemd/blog-x-backup.service` 与 `.timer` 是未启用的结构合同。只有 04-03 发布门禁确认外部引用、权限、目的地和恢复证据后，才具备讨论启用条件。

## 隔离恢复演练

恢复分为不可绕过的两个阶段。`preflightRestore` 先只读验证 `COMPLETE`、manifest、全部文件哈希与媒体清单，再验证目标是全新的 `blogxrestore_*` Compose 命名空间、对应的 `blog_x_restore_*` 数据库、精确媒体卷、回环 Web 地址和空的生成临时目录。备份损坏、目标已存在/活动、目录非空或符号链接时，在启动容器、`pg_restore` 或写媒体之前失败。

只有前置检查全部通过，恢复阶段才会：

1. 启动独立 PostgreSQL；
2. 使用自定义格式 dump 执行非破坏性 `pg_restore`；
3. 运行正常迁移与 schema 验证，不执行 reset/truncate；
4. 恢复 source 与 derivative 媒体字节并启动 API/Web；
5. 对比严格 v1 导出、所有保留生命周期/分类标签/About/封面字段和每个媒体 SHA-256；
6. 通过恢复后的唯一回环 Web 地址验证公开文章与图片可读、草稿/下线/删除/空发布时间内容仍为 404，最后仅清理本次生成目标。

本地规范门禁为：

```bash
corepack pnpm local:verify -- --phase4-restore --interruption-check --parallel-check
```

该门禁会保留完整备份直到数据库、媒体和浏览器三类对比都完成，并验证迁移中断恢复及两个并行演练不会交叉覆盖或清理。它不接受活动环境覆盖参数，也不提供 HTTP import/restore 接口。

真实生产恢复仍需另行人工授权，并至少先完成：停止写入、证明目标数据库和媒体目录为空、确认准确的主机/命名空间、异机备份可达、秘密权威可用、维护窗口与回滚责任人明确。主服务器冻结期间不得将本地演练命令改写为远程命令。

## 发布与回滚边界

生产发布当前为 **BLOCKED**。未来证据顺序、责任人与 STOP/GO 判断见 [发布门禁](./RELEASE-GATE.md)，数据/媒体保全和回滚决策点见 [回滚手册](./ROLLBACK.md)。这两份文档不包含远程执行步骤；本地状态、备份演练或合成 READY 结果均不能解除冻结或证明生产证书、网络、资源、告警及恢复目标已经就绪。

最终本地门禁为：

```bash
corepack pnpm local:verify -- --phase4-full --interruption-check --parallel-check
```

它要求所有 Phase 1–4 语义测试无跳过、完整备份/恢复与恢复后浏览器旅程通过，并在最后机器确认仓库发布证据仍为 BLOCKED。命令只适用于已经准备好依赖和镜像缓存的本地工作区；缺失离线前置条件即失败。
