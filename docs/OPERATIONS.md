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
