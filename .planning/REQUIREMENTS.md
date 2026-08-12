# Requirements: Blog X

**Defined:** 2026-08-05  
**Core Value:** 博主能够可靠地发布和保存 Markdown 内容，访客能够持续、快速地通过博客域名阅读已发布文章。

## v1 Requirements

### Public Reading

- [x] **READ-01**: 访客可在首页查看已发布文章的标题、摘要、发布日期和分页信息。
- [x] **READ-02**: 访客可打开文章固定链接，并正确阅读 Markdown、代码块、表格、引用、链接和图片。
- [x] **READ-03**: 访客可通过文章标题生成的分层目录定位到正文对应章节。
- [x] **READ-04**: 访客可在文章卡片看到分类与标签，并分别查看某个分类、某个标签及按时间归档的已发布文章列表。
- [x] **READ-05**: 访客可访问由管理员维护的“关于”独立页面。
- [x] **READ-06**: 访客可在手机、平板和桌面端正常导航与阅读，并可选择浅色、深色或跟随系统主题。
- [x] **READ-07**: 访客访问不存在的页面或后端暂时不可用时，可看到明确且可继续导航的错误提示。

### Administration and Content

- [x] **AUTH-01**: 唯一管理员可登录后台并保持安全会话，未登录访客无法访问受保护的管理功能。
- [x] **CONT-01**: 管理员可创建、编辑、预览、发布、下线和删除 Markdown 文章。
- [x] **CONT-02**: 管理员可保存草稿，且草稿及已下线文章不会出现在公开页面、RSS 或 Sitemap 中。
- [x] **CONT-03**: 管理员可维护文章标题、摘要、封面、唯一固定链接、发布时间和 SEO 描述。
- [x] **TAXO-01**: 管理员可创建、修改、删除分类与标签，并将它们关联到文章。
- [x] **MEDIA-01**: 管理员可上传经过类型和大小校验的图片，将其插入文章，并通过站点入口公开访问。
- [x] **PORT-01**: 管理员可导出文章 Markdown 原文和必要元数据，导出结果可用于迁移。

### Discovery and Distribution

- [x] **SEO-01**: 每个公开页面具有正确的唯一标题、描述、规范链接和 Open Graph 分享元数据。
- [x] **SEO-02**: 站点提供可抓取的 `robots.txt` 和仅包含公开页面及已发布文章的 Sitemap。
- [x] **FEED-01**: 访客可订阅包含最新已发布文章及永久链接的 RSS 或 Atom 源。

### Security and Operations

- [x] **SEC-01**: 管理写接口要求认证，并具备登录失败限制、请求限流和适当的 CSRF 防护。
- [x] **SEC-02**: 服务端校验所有输入和上传，渲染内容不会执行不可信脚本，数据访问不接受 SQL 注入。
- [x] **SEC-03**: 密码只以安全哈希保存，应用密钥和数据库凭据通过环境配置提供且不会提交到 Git。
- [x] **OPS-01**: 浏览器的页面、API 和媒体请求在正式环境中只使用博客 HTTPS 域名，副服务器 API 和数据库不直接暴露公网。
- [x] **OPS-02**: 应用进程异常后可自动恢复，日志会轮转，并可检查服务存活、CPU、内存、磁盘和证书状态。
- [x] **OPS-03**: 数据库、Markdown 内容、媒体和关键配置至少每日备份，并可通过恢复演练验证内容重新可访问。
- [x] **OPS-04**: 开发者可在本地通过隔离的开发配置启动并验证前台、后台、API 和数据库，不依赖主服务器。
- [ ] **OPS-05**: 只有在用户明确解除主服务器冻结，且生产备份、回滚和节点间安全链路均验证通过后，系统才允许部署到主服务器。

## v2 Requirements

### Reading Enhancements

- **SRCH-01**: 访客可按标题、摘要和正文搜索已发布文章。
- **READ-08**: 访客可在文章末尾查看按分类或标签计算的相关文章。

### Authoring Enhancements

- **CONT-04**: 编辑器可定期自动保存未提交内容，并在异常刷新后恢复。
- **CONT-05**: 管理员可设置未来发布时间，系统在指定时间自动发布文章。
- **AUDT-01**: 管理员可查看登录、发布、删除和站点配置变更的审计记录。

### Analytics and Metadata

- **SEO-03**: 公开文章包含适当的结构化数据。
- **STAT-01**: 管理员可查看采用明确去重规则的文章阅读量。
- **STAT-02**: 管理员可查看不采集非必要个人信息的聚合访问统计。

## Out of Scope

| Feature | Reason |
|---------|--------|
| 多作者与复杂角色权限 | 首期只有单一管理员，避免权限模型过度设计 |
| 自建评论系统 | 需求未确认，且会引入审核、反垃圾和隐私义务 |
| 用户社区、论坛、私信与即时聊天 | 不服务于个人内容发布的核心价值 |
| 会员、付费阅读和订单 | 首期无商业化目标 |
| 私密或密码文章 | 需求未确认，会扩大访问控制范围 |
| 邮件订阅 | 需要邮件投递、退订和反垃圾合规，后续单独分析 |
| 视频及大文件托管 | 不适合当前带宽、磁盘和备份预算 |
| 个性化推荐 | 数据规模不足，复杂度高于预期收益 |
| Kubernetes、微服务和多地域高可用 | 不适合两台低配置服务器的运维条件 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| CONT-01 | Phase 1 | Complete |
| CONT-02 | Phase 1 | Complete |
| CONT-03 | Phase 1 | Complete |
| READ-01 | Phase 1 | Complete |
| READ-02 | Phase 1 | Complete |
| OPS-04 | Phase 1 | Complete |
| READ-03 | Phase 2 | Complete |
| READ-04 | Phase 2 | Complete |
| READ-05 | Phase 2 | Complete |
| READ-06 | Phase 2 | Complete |
| READ-07 | Phase 2 | Complete |
| TAXO-01 | Phase 2 | Complete |
| MEDIA-01 | Phase 2 | Complete |
| PORT-01 | Phase 3 | Complete |
| SEO-01 | Phase 3 | Complete |
| SEO-02 | Phase 3 | Complete |
| FEED-01 | Phase 3 | Complete |
| SEC-01 | Phase 4 | Complete |
| SEC-02 | Phase 4 | Complete |
| SEC-03 | Phase 4 | Complete |
| OPS-01 | Phase 5 | Complete |
| OPS-02 | Phase 4 | Complete |
| OPS-03 | Phase 5 | Complete |
| OPS-05 | Phase 5 | Verification gap |

**Coverage:**

- v1 requirements: 25 total
- Mapped to phases: 25
- Complete: 24
- Pending gap closure: 1
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-05*  
*Last updated: 2026-08-10 after independent Phase 05 verification found that the retained receipt does not bind actual suite output; live release remains BLOCKED*
