# Roadmap: Blog X

## Overview

Blog X 采用四个纵向 MVP 阶段交付。第一阶段在本地建立完整的写作发布闭环；第二阶段补齐内容组织、媒体和跨设备阅读；第三阶段使内容可被搜索引擎、订阅工具和迁移流程可靠消费；第四阶段完成安全、备份、监控与受控生产发布门禁。主服务器在用户明确解除冻结前不属于任何阶段的可操作环境。

## Phases

- [ ] **Phase 1: Local Publishing Slice** - 在本地跑通管理员登录、Markdown 写作、发布与访客阅读。
- [ ] **Phase 2: Complete Reading Experience** - 补齐分类标签、归档、关于页、图片、目录、主题和错误体验。
- [ ] **Phase 3: Distribution and Portability** - 提供 SEO、Sitemap、RSS 和可迁移内容导出。
- [ ] **Phase 4: Secure Operations and Release Gate** - 完成安全加固、备份恢复、监控和受控生产部署准备。

## Phase Details

### Phase 1: Local Publishing Slice

**Goal**: 开发者可在本地启动系统，管理员可登录并发布 Markdown 文章，访客可立即在首页和固定链接阅读。
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, CONT-01, CONT-02, CONT-03, READ-01, READ-02, OPS-04
**UI hint**: yes
**Success Criteria** (what must be TRUE):

  1. 开发者可用一套文档化命令在本地启动前台、API 和数据库，并看到健康状态。
  2. 管理员可登录、创建包含代码块的 Markdown 草稿、预览并发布文章。
  3. 发布文章会出现在首页，访客可通过唯一固定链接阅读；草稿和下线文章不可公开访问。
  4. 管理员可修改文章核心元数据并完成下线或删除操作。

**Plans**: 8/8 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — 完成依赖合法性门禁，并以真实浏览器跑通相对 `/api`、Fastify、PostgreSQL 与公开 SSR 的纵向 tracer。

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — 将已验证 tracer 提取为可分离部署的 pnpm 工作区与共享契约边界。

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — 完成单管理员登录、服务端会话生命周期与受保护访问。

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04-PLAN.md — 完成文章草稿、核心元数据、Markdown 编辑与服务端安全预览。

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-05-PLAN.md — 完成发布、编辑、下线、重新发布、软删除和已发布 slug 变更确认。

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-06-PLAN.md — 完成仅含已发布内容的编辑型首页与明确分页。

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 01-07-PLAN.md — 完成安全 Markdown 固定链接渲染与非公开状态统一 404。

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 01-08-PLAN.md — 完成本地启动、迁移并发/中断恢复、边界检查与全阶段浏览器验收。

### Phase 2: Complete Reading Experience

**Goal**: 访客获得完整、响应式且可导航的内容阅读体验，管理员可组织内容并安全使用图片。
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: READ-03, READ-04, READ-05, READ-06, READ-07, TAXO-01, MEDIA-01
**UI hint**: yes
**Success Criteria** (what must be TRUE):

  1. 访客可通过目录、分类、标签、归档和关于页发现并浏览内容。
  2. 同一站点在手机、平板和桌面端均可正常使用，主题偏好可持久保存。
  3. 管理员可管理分类标签、上传受校验图片并插入文章，图片通过站点入口访问。
  4. 不存在的页面和暂时性服务异常均显示明确、可恢复导航的错误状态。

**Plans**: 2 plans

Plans:

- [ ] 02-01: 实现分类、标签、归档、关于页和文章目录。
- [ ] 02-02: 实现媒体上传、响应式视觉系统、主题偏好和错误/降级页面。

### Phase 3: Distribution and Portability

**Goal**: 已发布内容能够被搜索引擎和订阅工具正确发现，并能脱离当前数据库完成迁移。
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: PORT-01, SEO-01, SEO-02, FEED-01
**UI hint**: no
**Success Criteria** (what must be TRUE):

  1. 每个公开页面输出正确且唯一的标题、描述、规范链接和分享卡片元数据。
  2. Sitemap、robots.txt 和 RSS 只包含允许公开的页面与已发布文章。
  3. 管理员可导出 Markdown 和必要元数据，并能验证导出内容可用于重建文章。

**Plans**: 2 plans

Plans:

- [ ] 03-01: 实现 SEO 元数据、robots.txt、Sitemap 和 RSS。
- [ ] 03-02: 实现内容导出格式、导出接口和迁移可用性验证。

### Phase 4: Secure Operations and Release Gate

**Goal**: 系统在低资源环境中具备可验证的安全、恢复和运维能力，并在主服务器冻结解除前保持零生产触碰。
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: SEC-01, SEC-02, SEC-03, OPS-01, OPS-02, OPS-03, OPS-05
**UI hint**: no
**Success Criteria** (what must be TRUE):

  1. 未认证写请求、暴力登录、恶意输入和非法上传受到自动化测试及运行时防护。
  2. 副服务器 API 和数据库不直接向浏览器或公网暴露，凭据不出现在仓库与构建产物中。
  3. 运维人员可查看健康、资源和证书状态，进程可自恢复且日志不会无限增长。
  4. 数据库、内容、媒体和配置备份可按文档恢复，并通过一次恢复演练。
  5. 主服务器只有在用户明确解冻并通过备份、回滚、安全链路检查后才可进入部署步骤。

**Plans**: 3 plans

Plans:

- [ ] 04-01: 完成认证、输入、上传、密钥和网络边界安全加固。
- [ ] 04-02: 建立副服务器进程管理、日志、监控、备份和恢复演练。
- [ ] 04-03: 建立不触碰冻结主机的发布清单、回滚方案和上线门禁验证。

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Local Publishing Slice | 8/8 | In Progress|  |
| 2. Complete Reading Experience | 0/2 | Not started | - |
| 3. Distribution and Portability | 0/2 | Not started | - |
| 4. Secure Operations and Release Gate | 0/3 | Not started | - |
