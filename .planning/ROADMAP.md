# Roadmap: Blog X

## Milestones

- ✅ **v1.0 Local MVP** — Phases 1–5 (shipped 2026-08-15)
- ✅ **v1.1 Content Discovery** — Phases 6–8 (shipped 2026-09-04)
- ✅ **v1.2 Publishing Quality** — Phases 9–10 (shipped 2026-09-05)
- ✅ **v1.3 Private Insights** — Phases 11–13 (shipped 2026-09-15)
- 🚧 **v1.4 Post-launch Hardening** — Phases 14–17

## Completed Phases

<details>
<summary>✅ v1.3 Private Insights (Phases 11–13, 8 plans) — SHIPPED 2026-09-15</summary>

- [x] **Phase 11: Privacy-Safe View Authority** — 匿名、原子且有界的文章 PV 聚合。
- [x] **Phase 12: Administrator Insights** — 管理员总览、趋势、热门文章和来源统计。
- [x] **Phase 13: Responsive Admin Workspace and Local Delivery** — 统一响应式后台与固定本地交付。

</details>

完整历史计划、需求、验证和阶段记录位于 `.planning/milestones/`。

### Phase 14: Post-launch Security and Content Recovery

**Goal:** 管理员可安全轮换密码，正式入口获得完整响应头保护，软删除文章可从后台恢复为草稿。
**Requirements**: SEC-04, SEC-05, CONT-09
**Depends on:** Phase 13
**Plans:** 3/3 plans complete

Plans:

- [x] 14-01-PLAN.md
- [x] 14-02-PLAN.md
- [x] 14-03-PLAN.md

### Phase 15: Managed Media Library and Off-host Backup Readiness

**Goal:** 管理员可复用与安全清理媒体，生产内容备份可安全同步到可配置异地目的地并完成恢复验证。
**Requirements**: MEDIA-02, OPS-06
**Depends on:** Phase 14
**Plans:** 3/3 plans complete

Plans:

- [x] 15-01-PLAN.md
- [x] 15-02-PLAN.md
- [x] 15-03-PLAN.md

### Phase 16: Site Identity Link Continuity and Revision History

**Goal:** 站点身份可维护，旧文章链接持续可用，误改内容可通过服务端版本历史恢复。
**Requirements**: SITE-01, LINK-01, CONT-10
**Depends on:** Phase 15
**Plans:** 3/3 plans complete

Plans:

- [x] 16-01-PLAN.md
- [x] 16-02-PLAN.md
- [x] 16-03-PLAN.md

### Phase 17: Operational Monitoring and Retention

**Goal:** 数据保留任务自动执行，关键服务、备份、证书与资源异常可被及时发现。
**Requirements**: OPS-07
**Depends on:** Phase 16
**Plans:** 0 plans

Plans:

- [ ] TBD (run $gsd-plan-phase 17 to break down)
