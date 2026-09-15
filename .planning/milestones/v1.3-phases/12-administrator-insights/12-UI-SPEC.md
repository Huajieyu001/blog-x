---
phase: 12
slug: administrator-insights
status: proposed
shadcn_initialized: false
preset: none
created: 2026-09-05
requirements:
  - STAT-05
  - ADMN-02
---

# Phase 12 — Administrator Insights UI Specification

> Blog X 管理员工作台与匿名访问统计页的视觉、信息与交互契约。目标是让单一博主快速回答“内容现在是什么状态、下一步写什么、近期哪些文章被阅读”，而不是建立一个通用业务仪表盘。Phase 12 只改善 `/admin` 首页并新增 `/admin/analytics`；统一后台壳层和全站管理导航属于 Phase 13。

---

## 1. Outcome and scope

### 1.1 Required outcome

Phase 12 必须交付两个互相连通、受管理员认证保护的页面：

1. `/admin` — **工作台**：以有层级的分组卡片呈现内容概况、主要创作入口、最近 30 天匿名 PV 摘要、现有文章管理列表和低频维护入口。
2. `/admin/analytics?range=7|30|90|400` — **访问统计**：呈现所选时段总 PV、每日趋势、热门文章和五类来源分布，并始终说明数据的隐私和准确性边界。

首页不能继续使用当前“文章管理标题旁平铺分类、关于、日志、新建和导出”的同权重布局。最强视觉与首个操作应是 **新建草稿**；统计是决策信息，导出和站点维护是次要工具。

### 1.2 Explicit non-goals

- 不在 Phase 12 重做 `apps/web/app/admin/layout.tsx` 为侧栏、顶栏或移动抽屉。
- 不建立全局管理导航、不处理当前页高亮、不增加移动菜单；这些属于 Phase 13 `ADMN-01`。
- 不重做文章行的生命周期操作、预约表单或危险操作渐进披露；这些属于 Phase 13 `ADMN-03`。
- 不统一改造分类标签、关于、审计、编辑器的全部控件；这些属于 Phase 13 `ADMN-04/05`。
- 不增加自定义日期范围、环比、同比、实时在线、独立访客、地域、设备、漏斗、目标、导出统计或文章级明细钻取。
- 不引入图表库、图标包、UI 套件、第三方分析脚本、客户端数据仓库或常驻统计服务。
- 不把统计读取写入管理员操作日志；查看统计不是审计事件。

---

## 2. Existing baseline and reuse rules

### 2.1 Visual baseline

新页面延续 `ArticleEditor` 和现有公开站的安静编辑气质：

| Existing pattern | Phase 12 use |
|---|---|
| 衬线标题 `ui-serif, Georgia, "Noto Serif SC", serif` | 页面标题、卡片主数字、文章标题 |
| 无衬线 `ui-sans-serif, system-ui, sans-serif` | 控件、说明、状态、来源标签 |
| 等宽小字 `ui-monospace, monospace` | 眉题、日期范围、PV 单位、图表刻度 |
| 细边线、纸张背景、极少阴影、3–5px 圆角 | 卡片与分区；不使用浮夸阴影和大面积渐变 |
| 胶囊主按钮和原生表单语义 | **新建草稿**、范围选择与恢复动作 |
| `2px solid var(--accent)` 可见焦点 | 所有新增链接、按钮、`summary` 与可滚动区域 |

视觉上应像“作者书桌上的工作摘要”，不是 SaaS 控制台。禁止彩色 KPI 方块、图标墙、仪表盘转盘、面积渐变、排行榜奖牌和装饰性大插画。

### 2.2 Existing tokens

新页面只消费已经由 `public.module.css` 和根布局建立的主题变量：

| Token | Meaning |
|---|---|
| `--paper` | 页面底色 |
| `--surface` | 卡片、输入和局部面板底色 |
| `--ink` | 主文字、主边界 |
| `--muted` | 说明、次级信息、日期 |
| `--line` | 分隔线、非活动控件边框 |
| `--accent` | 链接、当前范围、图表柱、焦点 |

新卡片、文章行和统计图不得硬编码 `#fff`、`#20201d` 或仅适用于浅色的边线。错误文字可使用局部语义变量 `--danger`（浅色 `#a1261d`，深色 `#ffaca5`），但不得仅靠红色传达错误。

根布局现有首屏主题脚本继续作为唯一主题解析权威。Phase 12 页面必须在浅色、深色和跟随系统三种已解析状态下可读；本阶段不在管理页头新增主题控制，也不改变主题存储键。主题控制在后台壳层中的最终位置留给 Phase 13。

### 2.3 Spacing and sizing

- 页面最大内容宽度：`1120px`；1280px 视口左右至少 `28px` 内边距。
- 768px 视口左右 `24px`；390px 视口左右 `18px`。
- 页面大区块间距：`48px` 桌面、`36px` 平板、`32px` 手机。
- 卡片内边距：`24px` 桌面、`20px` 平板、`16px` 手机。
- 内部间距只使用 4/8/12/16/24/32/48px 节奏。
- 所有新增交互目标最小高度和最小可点击宽度均为 **44px**；相邻触控目标至少留 `8px`。
- 数字使用 `font-variant-numeric: tabular-nums`，避免加载和范围切换时宽度跳动。

---

## 3. Information architecture

### 3.1 `/admin` fixed order

工作台的文档顺序在所有宽度固定，视觉重排不得改变阅读和键盘顺序：

1. 页面标题区：眉题 **BLOG X / 管理**、`h1` **工作台**、说明 **查看内容状态，继续写作，了解近期阅读趋势。**、主操作 **新建草稿**。
2. **内容概况**：三个状态卡片。
3. **继续创作** 与 **最近 30 天访问**：桌面并列，窄屏顺序堆叠。
4. **文章管理**：保留全部未删除文章及当前生命周期能力，不在本阶段另造文章索引路由。
5. **站点维护**：低视觉权重的分类标签、关于页、操作日志、Markdown 导出入口。

### 3.2 `/admin/analytics` fixed order

1. 页面标题区：眉题 **BLOG X / 管理**、`h1` **访问统计**、返回工作台链接。
2. 持久可见的隐私口径说明。
3. 时间范围选择器：**7 天 / 30 天 / 90 天 / 400 天**。
4. 选定时段总览与 **每日趋势**。
5. **来源分布** 与 **热门文章**。
6. 可展开的 **查看每日数据** 表格。

范围选择器必须位于结果之前；改变范围后上述统计区作为一个整体更新，不保留来自旧范围的数字。

---

## 4. Admin dashboard: exact sections

### 4.1 Header

```text
BLOG X / 管理
工作台                                      [新建草稿]
查看内容状态，继续写作，了解近期阅读趋势。
```

- **新建草稿** 使用正常链接 `/admin/new`，无需 JavaScript，保持胶囊主按钮样式。
- 页面只有一个 `h1`。后续区块标题均为 `h2`，卡片内部标题为 `h3` 或普通标签，不跳级。
- 不在标题行增加导航菜单、搜索、通知、头像或设置齿轮。

### 4.2 Content overview

区块标题：**内容概况**。三个卡片使用现有受认证文章列表在服务端计算，卡片本身不是链接：

| Card | Main value | Supporting copy |
|---|---:|---|
| **已发布** | `{publishedCount}` | **当前对访客可见** |
| **草稿** | `{draftCount}` | `scheduledCount > 0` 时：**其中 {scheduledCount} 篇已预约**；否则：**等待继续编辑** |
| **已下线** | `{unpublishedCount}` | **保留内容，暂不公开** |

- `draftCount` 包含已预约草稿；支持文案明确重叠关系，避免用户把三卡误认为互斥总和之外还有第四类。
- 数值为 `0` 时必须显示真实的 `0`，不得以破折号伪装缺失。
- 内容 API 失败时，不显示三张 `0` 卡；整个区块换成“内容概况暂时不可用”失败状态。

### 4.3 Continue creating

区块标题：**继续创作**。这是首页视觉上最明确的行动面板，但不重复堆叠多个主按钮。

Populated state：

- 主行：**继续编辑「{latestDraft.title}」**，链接至 `/admin/posts/{id}`。
- 元信息：**上次保存：{Asia/Shanghai 格式化日期时间}**。
- 已预约时增加：**计划于 {日期时间} 发布**。
- 次操作：文本链接 **新建另一篇草稿**。

`latestDraft` 取未删除草稿中 `version`（当前 API 的更新时间）最新者；不要读取或展示 Markdown 摘要作为工作台预览。

No-draft state：

- 标题：**还没有待写草稿**
- 正文：**从一个标题开始，先把想法保存下来。**
- 操作：**新建草稿**

Content failure state：

- 标题：**暂时无法读取创作进度**
- 正文：**文章内容没有改变，请稍后重试。**
- 操作：普通链接 **重新加载工作台**。

### 4.4 Recent 30-day analytics summary

区块标题：**最近 30 天访问**。首页范围固定为 30 天，不放第二套范围选择器。

Populated state must contain：

- 主数字：`{totalPv}`，单位视觉文本 **PV**。
- 说明：**匿名页面浏览量**。
- 30 个按日期连续排列的 CSS 柱，使用与完整统计页相同的 `DailyTrend` 轻量视觉；首页不展开每日表格。
- 最热门文章一行：**阅读最多：{title} · {pv} PV**；如果总 PV 为 0，则不显示伪造热门项。
- 链接：**查看完整统计 →**，目标 `/admin/analytics?range=30`。
- 固定短说明：**仅表示匿名、尽力而为的浏览趋势，不是独立访客数。**

Analytics failure is local to this card：

- 标题：**访问趋势暂时不可用**
- 正文：**内容管理仍可继续，稍后再查看统计。**
- 操作：**重试统计**，目标 `/admin#recent-analytics` 或重新加载当前页。
- 文章概况、继续创作和文章操作不得因统计失败而消失。

### 4.5 Article management

区块标题：**文章管理 · {retainedCount} 篇**。

- Phase 12 保留现有全部未删除文章列表和 `ArticleActions variant="list"` 的行为，以免工作台替换首页后丢失唯一文章管理入口。
- 本阶段允许只给列表加分区外壳和标题层级；不得重新排序生命周期按钮、隐藏危险操作、改变确认或预约语义。
- 列表默认继续按现有 API 的更新时间倒序。
- 无文章：**还没有文章。新建第一篇草稿，开始记录。**，操作 **新建草稿**。
- 内容读取失败：**暂时无法读取文章列表。文章内容没有改变，请稍后重试。**，不得显示“还没有文章”。

### 4.6 Site maintenance

区块标题：**站点维护**。使用一个细边线上下分隔的紧凑列表，而非四张同权重功能卡：

1. **分类与标签** — **整理文章的分类与标签。** — `/admin/taxonomy`
2. **关于页** — **维护站点介绍。** — `/admin/about`
3. **操作日志** — **查看关键管理操作。** — `/admin/audit`
4. **导出 Markdown** — **导出可迁移的内容副本；访问统计不包含在内。** — 保留现有原生 POST 表单 `/api/admin/export`

前三项是普通链接；导出保持原生表单按钮和现有安全语义。它们不得伪装为全局导航，也不设置 `aria-current`。Phase 13 可将这些目的地迁入共享导航，但不应依赖 Phase 12 的视觉结构。

---

## 5. Analytics page: exact sections

### 5.1 Header and privacy notice

```text
BLOG X / 管理
访问统计                                  [返回工作台]
了解文章被打开的趋势，不追踪具体访客。

隐私说明
这里展示的是按 Asia/Shanghai 自然日汇总的匿名页面浏览量（PV）。
系统不保存 IP、Cookie、指纹、原始 User-Agent 或 Referrer URL，也不提供独立访客数。
数据会受重复刷新、浏览器拦截和爬虫识别影响，仅供趋势参考，不用于计费或精确反作弊。
```

- 隐私说明是正文级常驻信息，不藏在 tooltip、问号图标或折叠面板里。
- 使用中性说明面板（`aside` + `aria-labelledby`），不是警告色。
- 不使用“访问人数”“用户”“访客数”“UV”“精准”“实时”等词描述指标。

### 5.2 Range selector

Visible label：**统计时间范围**。

| Value | Visible label | URL |
|---:|---|---|
| 7 | **7 天** | `/admin/analytics?range=7` |
| 30 | **30 天** | `/admin/analytics?range=30` |
| 90 | **90 天** | `/admin/analytics?range=90` |
| 400 | **400 天** | `/admin/analytics?range=400` |

- 使用命名 `<nav aria-label="统计时间范围">` 内的普通链接，不依赖客户端状态；当前项设置 `aria-current="page"`。
- 缺少 `range` 时默认并显示 30 天。
- 重复、未知、非整数或其他值不得透传到 API。页面呈现：**时间范围无效** / **请选择 7、30、90 或 400 天。** / **查看 30 天**。
- 范围链接每个至少 44×44px。390px 时四项可使用等宽 2×2 网格；不得把文字缩到难读或要求精细横向拖动。
- 结果标题使用明确日期：**{fromDay} 至 {toDay} · 共 {range} 天**。日期按 `Asia/Shanghai` 自然日显示，包含首尾两天。

### 5.3 Total and daily trend

Section heading：**每日趋势**。

Header content：

- 主数字：`{totalPv}` + 单位 **PV**。
- 辅助：**所选时段匿名页面浏览量**。
- 刻度说明：**最高单日 {maxDailyPv} PV**。

#### Visual implementation contract

使用语义 HTML + CSS 自定义属性绘制柱状趋势，不使用图表包、canvas 或客户端测量：

```html
<figure aria-labelledby="daily-trend-title" aria-describedby="daily-trend-summary">
  <figcaption>…可读摘要…</figcaption>
  <div class="trendScroll" tabindex="0" aria-label="每日 PV 趋势图，可横向滚动">
    <ol class="trendBars" aria-hidden="true">
      <li style="--bar-ratio: 0.42"></li>
      …
    </ol>
  </div>
</figure>
```

- API/服务端必须返回完整、按日期升序、零值补齐的 `range` 个 daily 点；UI 不猜测缺失日期。
- 柱高为 `pv / maxDailyPv`；`maxDailyPv = 0` 时不渲染假柱，显示真实空状态。
- 7/30 天柱子填满可用宽度；90 天可适度紧凑；400 天趋势保留每一天，并在图表内部横向滚动，不得让文档产生水平溢出。
- 400 天图表建议 `min-width: 1200px`，每个日柱至少 2px 并有 1px 间隔。滚动区获得键盘焦点、可用方向键/触控滚动，并显示焦点轮廓。
- 图表只使用 `--accent` 柱、`--line` 网格线和 `--muted` 日期；不依赖五种颜色区分含义。
- 起始和结束日期始终可见在图下；7/30 天可增加稀疏刻度，90/400 天不得挤入不可读的每日标签。
- 禁止动画柱高、延迟逐柱出现、悬停才可见的唯一信息。

`figcaption` 的可读摘要为：**{fromDay} 至 {toDay} 共 {totalPv} PV，最高单日 {maxDailyPv} PV。** 视觉柱 `aria-hidden`，避免屏幕阅读器逐柱朗读数百项。精确每日值由后续可展开表格提供。

#### Daily data table

趋势区之后提供原生 `<details>`：

- `<summary>`：**查看每日数据**，至少 44px 高。
- 表头：**日期**、**PV**。
- 每行按日期倒序，便于先读最近数据；图表本身仍按时间正序。
- 400 天允许 400 行，不分页、不客户端虚拟化。表格在容器内滚动或自然换行，但不能造成文档溢出。
- 数值为 `0` 的日子仍显示，证明范围连续而不是数据缺失。

### 5.4 Source distribution

Section heading：**来源分布**。

固定顺序与文案：

| API key | Visible label | Supporting meaning |
|---|---|---|
| `direct` | **直接访问** | 无来源或无法可靠解析 |
| `internal` | **站内跳转** | 从 Blog X 其他页面进入 |
| `search` | **搜索引擎** | 从已识别的搜索站点进入 |
| `social` | **社交平台** | 从已识别的社交站点进入 |
| `external` | **其他外部来源** | 其他可解析的外部站点 |

每行包含可见标签、`{count} PV`、`{percentage}%` 和一条水平比例条。比例条是装饰性的 `aria-hidden`；计数和百分比文本才是信息权威。百分比可显示一位小数，五项因四舍五入不必强行等于 100%，但五项计数之和必须等于 `totalPv`。

固定说明：**来源仅根据请求当时的 Referrer 粗略归类；原始地址不会保存。**

总 PV 为 0 时：

- 标题：**所选时段还没有来源数据**
- 正文：**文章产生匿名浏览后，粗粒度来源会显示在这里。**
- 不显示五条全为 0% 的装饰条，但保留来源口径说明。

### 5.5 Top articles

Section heading：**热门文章**。默认最多展示 8 条，服务端和 API 均设置上限。

桌面使用语义表格，列为：

1. **排名**
2. **文章**
3. **当前状态**
4. **PV**
5. **占比**

排序为 `totalPv DESC`，稳定次序由 API 明确的次级键决定，不由 UI 重排。文章标题允许完整换行，不以省略号遮掉辨识信息。当前状态显示文本：**已发布 / 草稿 / 已下线 / 已删除**。

- 未删除文章标题链接至 `/admin/posts/{articleId}`。
- 已删除文章保留统计行与 **已删除** 标签，但标题不是链接，避免进入已知 404。
- 历史上获得 PV 后又下线或删除的文章仍计入总 PV 和排行；不得为了匹配当前公开状态而静默移除，导致总数不一致。
- 占比的分母为所选范围全部文章总 PV。

手机将每行用 CSS 改为两列的紧凑定义式布局，但保持 `<table>` 语义或提供等价的有序列表语义；不得依赖横向滚动才能看到标题和 PV。排名只显示普通 `1–8`，无奖牌颜色。

Zero state：

- 标题：**所选时段还没有热门文章**
- 正文：**有匿名浏览记录后，文章会按 PV 排列在这里。**

---

## 6. Wireframes

### 6.1 Dashboard — 1280px

```text
┌──────────────────────────── existing minimal admin header ───────────────────────────┐
│ Blog X                                                                  退出登录      │
└───────────────────────────────────────────────────────────────────────────────────────┘

  BLOG X / 管理
  工作台                                               [ 新建草稿 ]
  查看内容状态，继续写作，了解近期阅读趋势。

  内容概况
  ┌────────────────────┬────────────────────┬────────────────────┐
  │ 已发布             │ 草稿               │ 已下线             │
  │  18                │  4                 │  2                  │
  │ 当前对访客可见     │ 其中 1 篇已预约    │ 保留内容，暂不公开 │
  └────────────────────┴────────────────────┴────────────────────┘

  ┌───────────────────────────────┬────────────────────────────────────┐
  │ 继续创作                      │ 最近 30 天访问                     │
  │ 继续编辑「把部署写成手册」    │ 1,284 PV                            │
  │ 上次保存：9月5日 14:20        │ ▁▂▃▂▄▅▆▃▇…                          │
  │ [继续编辑]  新建另一篇草稿    │ 阅读最多：…… · 328 PV              │
  │                               │ 查看完整统计 →                     │
  └───────────────────────────────┴────────────────────────────────────┘

  文章管理 · 24 篇
  ─────────────────────────────────────────────────────────────────────
  文章标题 / slug / current ArticleActions rows …
  ─────────────────────────────────────────────────────────────────────

  站点维护
  分类与标签        关于页        操作日志        导出 Markdown
  （单一低权重分组，不模拟全局导航）
```

### 6.2 Analytics — 1280px

```text
  BLOG X / 管理
  访问统计                                                   返回工作台
  了解文章被打开的趋势，不追踪具体访客。

  ┌ 隐私说明 ─────────────────────────────────────────────────────────┐
  │ 匿名 PV；不保存访客标识；仅供趋势参考，不用于计费或精确反作弊。 │
  └────────────────────────────────────────────────────────────────────┘

  统计时间范围       [7 天] [30 天●] [90 天] [400 天]

  每日趋势                         2026-08-07 至 2026-09-05 · 共 30 天
  1,284 PV                         最高单日 92 PV
  ┌────────────────────────────────────────────────────────────────────┐
  │    ▄ ▆▃       ▅                                                   │
  │ ▂▃ █ ██ ▄▅▆▃ █ …     CSS-only daily bars                         │
  └────────────────────────────────────────────────────────────────────┘
  08-07                                                        09-05
  ▸ 查看每日数据

  ┌──────────────────────────────┬─────────────────────────────────────┐
  │ 来源分布                     │ 热门文章                            │
  │ 直接访问  600 PV  46.7%     │ 1 文章标题      已发布  328 25.5%  │
  │ 站内跳转  320 PV  24.9%     │ 2 文章标题      已下线  201 15.7%  │
  │ 搜索引擎  …                  │ … 最多 8 行                         │
  └──────────────────────────────┴─────────────────────────────────────┘
```

### 6.3 768px

```text
┌──────────────────────────────────────────────┐
│ existing admin header                       │
├──────────────────────────────────────────────┤
│ 工作台                         [新建草稿]    │
│                                              │
│ [已发布]        [草稿]                       │
│ [已下线]                                     │
│                                              │
│ [继续创作 — full width]                      │
│ [最近 30 天访问 — full width]                │
│ [文章管理 — full width]                      │
│ [站点维护 — 2×2 items]                       │
└──────────────────────────────────────────────┘

访问统计：标题 → 隐私说明 → 4 项单行范围选择 → 趋势 → 来源 → 热门文章。
来源和热门文章不再强行并列；趋势占满可用宽度。
```

### 6.4 390px

```text
┌──────────────────────────────────┐
│ Blog X                 退出登录  │
├──────────────────────────────────┤
│ BLOG X / 管理                    │
│ 工作台                           │
│ 查看内容状态……                  │
│ [       新建草稿  ≥44px       ] │
│                                  │
│ 内容概况                         │
│ [已发布 18]                      │
│ [草稿 4 / 其中 1 篇已预约]       │
│ [已下线 2]                       │
│ [继续创作]                       │
│ [最近 30 天访问]                 │
│ [文章管理 rows stack naturally] │
│ [站点维护 1 column]              │
└──────────────────────────────────┘

访问统计范围：
┌──────────────┬──────────────┐
│ 7 天 ≥44px   │ 30 天 ≥44px  │
├──────────────┼──────────────┤
│ 90 天 ≥44px  │ 400 天 ≥44px │
└──────────────┴──────────────┘

趋势图只在自身容器横向滚动；来源逐行；热门文章每项显示
“排名 + 标题 / 状态 + PV + 占比”，页面本身无横向滚动。
```

---

## 7. Responsive contract

| Viewport | Dashboard | Analytics |
|---|---|---|
| **1280px** | 1120px 内容宽；三张概况卡同排；继续创作与访问摘要以约 `1fr 1fr` 并排；文章列表全宽；维护入口四列。 | 总趋势全宽；来源约 38%、热门文章约 62% 并排；表格列完整。 |
| **768px** | 24px 页边距；概况两列并让第三张自然占一列，不拉伸为误导性超宽；创作、访问、文章、维护依文档顺序单列。 | 四个范围按钮可单排；趋势、来源、热门文章单列；热门表格仍保留明确表头或移动标签。 |
| **390px** | 18px 页边距；标题操作堆叠且 CTA 满可用宽；所有卡片单列；长标题、slug、日期和状态 `overflow-wrap:anywhere`。 | 范围选择 2×2；400 天仅图表内部滚动；热门文章转紧凑行；每日表格容器可滚动但页面 `scrollWidth <= clientWidth`。 |

Breakpoint recommendations：

- `<= 720px`：手机重排，与现有 admin CSS 断点一致。
- `721px–1023px`：平板层；不要因只有现有 720px 断点而让 768px 维持拥挤桌面布局。
- `>= 1024px`：桌面双列/三列布局。

不得通过隐藏隐私说明、单位、状态、文章标题或范围选项来解决窄屏问题。允许隐藏的是纯装饰网格线，不是数据文本。

---

## 8. Loading, empty, error and partial states

### 8.1 State principles

- **0 是数据，失败不是 0。** API 失败、契约解析失败与真实空集合必须是不同 UI。
- 不用旧范围数字填充新范围，也不以“暂无数据”掩盖网络/服务错误。
- `/admin` 的内容数据与统计数据分别失败：统计失败不得阻止创作；内容失败不得将文章数量显示为零。
- `/admin/analytics` 的核心响应是一个严格整体；daily、sources、topArticles 任一必需字段畸形时，整个结果显示失败，不拼装互相矛盾的局部数字。

### 8.2 Dashboard state matrix

| Content API | Analytics API | Required result |
|---|---|---|
| success populated | success populated | 全部区块正常。 |
| success empty | success zero | 三个概况显示 0；继续创作和文章管理显示各自空状态；访问卡显示 0 PV 空趋势。 |
| success | failure | 内容区完整；访问卡显示局部失败与重试。 |
| failure | success | 内容概况、继续创作、文章管理显示内容失败；访问摘要仍显示。 |
| failure | failure | 页面标题和两个分区失败状态仍可见；新建草稿、维护入口和退出仍可操作。 |

现有 `getAdminPosts()` 把失败折叠为 `[]`，不能满足此契约。Phase 12 实现必须让工作台消费可区分 `ok` 与 `upstream_error` 的内部 helper；不要从空数组猜测错误。

### 8.3 Analytics state matrix and exact copy

| State | Copy | Action |
|---|---|---|
| Initial/navigation loading | **正在读取匿名 PV 趋势…** | 静态骨架保留页面结构；主结果区域 `aria-busy="true"`。 |
| Valid zero | **所选时段还没有浏览记录** / **公开文章产生匿名浏览后，每日趋势会显示在这里。** | 保留范围选择；来源和热门文章显示各自 zero state。 |
| Upstream/network/contract failure | **暂时无法读取访问统计** / **统计服务似乎暂时不可用，文章内容和已有统计没有改变。** | **重试当前范围**、**返回工作台**。 |
| Invalid range | **时间范围无效** / **请选择 7、30、90 或 400 天。** | **查看 30 天**、**返回工作台**。 |
| Unauthorized/expired session | 不在页面内渲染任何统计或骨架数据。 | 复用现有管理员布局，重定向 `/login`。 |

骨架使用中性块和真实栏目宽度，不填入 `0`、随机柱或假文章名；不使用持续 shimmer。`prefers-reduced-motion: reduce` 下无动画，本设计默认也无需动画。

### 8.4 Long and boundary data

- 0、1、8 和超过 8 篇热门文章均有确定行为；UI 最多接收/显示 8 篇，更多由 API 截断。
- 文章标题可以是 240 字符；允许多行，不能撑破卡片或表格。
- PV 以安全整数格式化，例如 `12,345`；不缩写为 `12.3k`，避免中文界面口径含糊。
- 日期范围必须包含恰好 7/30/90/400 个 daily 点。保留期边界下 400 天包括今天在内的最近 400 个上海自然日。
- 所有来源计数为零、单一来源占 100%、单日极值远高于其他天时，标签与精确数值仍可读。

---

## 9. Accessibility and keyboard contract

### 9.1 Semantics

- 每页一个 `<main>`、一个 `h1`，使用顺序正确的 `h2/h3`。
- 工作台概况用列表或三个有标题的 `<article>`；数字与标签在 DOM 中有自然阅读顺序。
- 范围选择器为命名 `<nav>`，当前范围使用 `aria-current="page"`，不是只靠填充色。
- 趋势使用 `<figure>` + 可读 `<figcaption>`；装饰柱 `aria-hidden`；精确日值用表格提供。
- 来源列表的文本计数和百分比是权威，比例条不进可访问树。
- 热门文章使用带 `<caption>` 或可关联标题的表格；状态不能只用颜色或圆点。
- 加载使用 `role="status"`；错误容器使用 `role="alert"`；服务端完成的正常结果不重复放进 live region。

### 9.2 Keyboard and focus

- 自然 Tab 顺序遵循文档顺序：页头 → 主 CTA →创作/统计动作 → 文章操作 → 维护入口；不得用正数 `tabIndex` 重排。
- 所有链接、按钮、表单按钮、`summary`、范围选项和 400 天趋势滚动区都具有 `2px solid var(--accent)`、至少 2–4px offset 的 `:focus-visible`。
- 范围链接支持 Enter 原生导航；不自造 roving-tabindex tablist，也不劫持左右键。
- 400 天趋势滚动区 `tabIndex="0"`，焦点时可用键盘水平滚动；它的可访问名称明确含“可横向滚动”。
- 不自动聚焦统计结果，不在范围切换后把焦点强制移走；普通文档导航和浏览器返回行为保持可预测。
- 44px 最小目标覆盖：新建、继续编辑、完整统计、返回、重试、四个范围、每日数据 summary、文章标题链接、维护入口和导出按钮。

### 9.3 Contrast and motion

- `--muted` 只用于辅助文案，不用于关键数字、错误标题或当前范围的唯一标记。
- 柱状图和背景在浅/深主题下保持可辨识；零值不以极浅“幽灵柱”表达。
- 不新增自动播放、闪烁、无限旋转、计数滚动或视差效果。
- 所有 hover 效果必须有等价 `:focus-visible`，触摸设备不依赖 hover 暴露操作。

---

## 10. Data and rendering contract

### 10.1 Existing content data

工作台内容概况、最近草稿和文章列表复用现有受认证 `GET /admin/posts` 及严格 `adminPostListSchema`，通过 Next 服务端 helper 携带管理员 Cookie、`cache: "no-store"` 读取。浏览器不直接拉取内容列表，也不新建客户端缓存。

Phase 12 不应从 Markdown 正文、摘要文本或公开列表接口推断创作状态。现有字段足够：`id`、`title`、`slug`、`status`、`scheduledAt`、`version`。

### 10.2 Required analytics view model

管理员统计 API/contract 至少应提供以下严格、可直接渲染的整体形状；命名可由实现计划细化，但语义不得丢失：

```ts
type AdminAnalytics = {
  range: 7 | 30 | 90 | 400;
  timezone: "Asia/Shanghai";
  fromDay: string; // YYYY-MM-DD, inclusive
  toDay: string;   // YYYY-MM-DD, inclusive
  totalPv: number;
  daily: Array<{ day: string; pv: number }>;
  sources: {
    direct: number;
    internal: number;
    search: number;
    social: number;
    external: number;
  };
  topArticles: Array<{
    articleId: string;
    title: string;
    currentStatus: "draft" | "published" | "unpublished" | "deleted";
    totalPv: number;
  }>;
};
```

Contract invariants：

- `daily.length === range`，日期连续、升序、首尾与 `fromDay/toDay` 一致。
- `sum(daily.pv) === totalPv`。
- 五项 `sources` 之和等于 `totalPv`。
- `topArticles.length <= requestedLimit <= 8`，每项 `totalPv > 0`。
- 所有数字为非负安全整数；未知字段被严格拒绝。
- 不含 IP、Cookie、session、administrator ID、User-Agent、Referrer URL/host、指纹、独立访客字段或原始事件。

Recommended read shape：`GET /admin/analytics?range={enum}&limit={bounded}`。首页请求 `range=30&limit=1`；完整页请求所选 range 且 `limit=8`。若实现选择一个固定上限响应，也必须保持同一严格 contract 和低资源边界。

### 10.3 Authentication, cache and privacy boundaries

- API 使用现有 `requireAdministrator` 读取保护；不需要、也不应复用写操作 CSRF 语义。
- 未认证读取返回 401，不能获得总量、日期、文章标题或“是否有统计”的旁路信息。
- API 响应明确 `Cache-Control: private, no-store, max-age=0`；Next helper 使用 `cache: "no-store"`，页面不得静态生成或跨管理员请求复用。
- 页面 HTML、日志和错误文案不得包含内部 API origin、主/副服务器地址、数据库信息或异常堆栈。
- 统计页面不得加载第三方脚本、字体、图表资源或图片；浏览器 HTTP(S) 请求继续保持 Blog X 同源。
- 统计是读取视图，不改变 Phase 11 聚合、400 天保留、备份恢复或 Markdown 导出边界。

### 10.4 Rendering strategy

- 页面和数据区优先使用 React Server Components/SSR；范围选择是普通链接。
- CSS 柱高可以由服务端写入有限的内联 CSS custom property（0–1），不得插入任意用户 CSS。
- 不为图表创建 client component，不监听页面 resize，不安装 D3/Chart.js/ECharts/Recharts。
- 一次页面请求最多并行读取一次内容数据和一次统计数据；不按文章发 N+1 查询/请求。

---

## 11. Component map

```text
AdminLayout (existing; Phase 12 does not redesign)
├── AdminDashboardPage [server]
│   ├── DashboardHeader
│   ├── ContentOverview
│   │   └── ContentStatusCard × 3
│   ├── ContinueCreating
│   ├── AnalyticsSummary
│   │   └── DailyTrend (compact 30-day variant)
│   ├── ArticleManagementList
│   │   └── ArticleActions (existing, behavior unchanged)
│   └── MaintenanceLinks
└── AdminAnalyticsPage [server]
    ├── AnalyticsHeader
    ├── PrivacyNotice
    ├── RangeSelector
    ├── AnalyticsResult
    │   ├── DailyTrend (full variant)
    │   ├── DailyDataTable
    │   ├── SourceDistribution
    │   └── TopArticles
    └── AnalyticsStatePanel
```

Implementation guidance：

- `DailyTrend` 可在 dashboard 和 analytics 复用同一纯展示组件；compact variant 省略每日表格但保留摘要。
- `AnalyticsStatePanel` 只覆盖统计结果状态，不演变成 Phase 13 的全后台通用组件库。
- `DashboardHeader` 和 `AnalyticsHeader` 可共享局部标题样式，但不要借机重构所有管理员页面。
- 组件命名不是文件结构强制要求；信息、语义和边界是强制要求。

---

## 12. Phase 13 handoff boundary

Phase 12 必须给 Phase 13 留下清晰接缝：

| Phase 12 owns now | Phase 13 owns later |
|---|---|
| `/admin` 内容层级和 dashboard 卡片 | 统一后台 header/sidebar/drawer 与当前页语义 |
| `/admin/analytics` 页面内容和统计状态 | 将统计纳入共享导航、移动菜单、Escape 与焦点恢复 |
| 新页面局部 token 消费和主题正确渲染 | 全部管理员页面的统一主题控件和通用组件规范 |
| 保留当前文章行能力 | 文章列表压缩、低频/危险操作渐进披露 |
| 工作台低权重维护入口 | 分类、关于、审计、统计等页面的统一标题/卡片/状态 |

因此 Phase 12 不应：

- 在 dashboard 内做永久侧栏并要求 Phase 13 兼容；
- 把 `站点维护` 的四项列表当作共享 nav API；
- 为了“统一”移动 `LogoutButton`、新增菜单状态或复制 `PublicHeader`；
- 将 analytics 页面特有卡片抽象成庞大的通用设计系统；
- 改变现有编辑恢复、预约、确认、无脚本表单或审计脱敏行为。

Phase 13 接入共享壳层时，应该可以原样保留 `<main>` 内的 Phase 12 内容，只替换其外部导航和页头容器。

---

## 13. Testable acceptance criteria

### ADMN-02 — dashboard hierarchy

- [ ] `/admin` 的首个 `h1` 是 **工作台**，可见主 CTA 是 **新建草稿**。
- [ ] 当前同权重标题链接组被替换为：内容概况、继续创作、最近 30 天访问、文章管理、站点维护五个有序区块。
- [ ] 已发布、草稿、已下线数由现有未删除管理员文章数据准确计算；已预约数作为草稿辅助信息呈现。
- [ ] 有草稿时继续创作链接指向最近更新草稿；无草稿时显示明确空状态和新建动作。
- [ ] 文章管理仍可访问所有现有未删除文章及其既有生命周期操作；Phase 12 未破坏预约、确认或原生表单语义。
- [ ] Markdown 导出文案明确 **访问统计不包含在内**，并保持原生 POST 行为。
- [ ] 内容 API 失败不会显示假的 0 或“还没有文章”；统计 API 失败不阻止内容管理。

### STAT-05 — protected analytics

- [ ] 已登录管理员可通过 URL 链接切换 7/30/90/400 天；缺省为 30 天，当前范围有 `aria-current="page"`。
- [ ] 每个有效范围显示总 PV、恰好相同天数的连续每日趋势、最多 8 篇热门文章和五类固定来源分布。
- [ ] 日汇总范围和所有日期按 `Asia/Shanghai` 解释；总 PV 等于 daily 合计和 sources 合计。
- [ ] CSS/HTML 趋势图不加载图表依赖；400 天保留每天并只在图表容器内滚动。
- [ ] **查看每日数据** 能通过键盘展开，并精确列出包含零值日期在内的全部 daily 数据。
- [ ] 热门文章包含当前状态；已删除文章仍可计数但不生成失效编辑链接。
- [ ] 页面常驻说明匿名 PV、无独立访客、不用于计费或精确反作弊，并明确来源只作粗粒度分类且原始地址不保存。
- [ ] 未登录请求不能读取统计；管理员 API 和 Next fetch 均为 no-store；页面和响应不含隐私禁止字段。
- [ ] 真实零数据、API/网络失败、严格 contract 失败、非法 range 和会话过期各有不混淆的状态。

### Responsive, theme and accessibility

- [ ] 在 390、768、1280px 下，`document.documentElement.scrollWidth <= clientWidth`；仅 400 天图表自身允许水平滚动。
- [ ] 390px 时卡片单列、范围 2×2、热门文章无需文档级横向滚动；768px 不强行保留桌面双栏；1280px 使用规定的三卡与双栏层级。
- [ ] 所有新增主要交互 computed width/height 均至少 44px，键盘焦点可见，范围和 `details` 可通过原生键盘操作。
- [ ] 页面在 light、dark 和 system-resolved 两种实际配色下，卡片、柱、文字、边界和焦点均可辨识；新样式不含浅色专用硬编码表面。
- [ ] 屏幕阅读器可获得趋势摘要和每日数据表，不会被迫逐个听 400 个装饰柱；来源和状态不依赖颜色。
- [ ] `prefers-reduced-motion: reduce` 下无趋势动画、shimmer 或滚动动画；默认实现也不要求动画。

### Dependency and phase boundary

- [ ] `package.json` 没有因 Phase 12 新增 chart/UI/icon/runtime dependency。
- [ ] 浏览器没有向第三方分析、CDN、内部 API origin 或服务器公网地址发请求。
- [ ] `admin/layout.tsx` 未被改造成 Phase 13 的统一导航，且没有新侧栏、移动抽屉或跨页 active-nav 系统。
- [ ] 现有编辑器恢复、生命周期确认、审计脱敏和 Markdown 导出边界没有被 Phase 12 UI 改写。

---

## 14. Visual QA checklist

人工视觉检查应使用有代表性的 fixture：24 篇文章（18 已发布、4 草稿且 1 篇已预约、2 已下线）、30 天有高低起伏但非单调的 PV、五类来源均有值、8 篇热门文章中含一篇已下线和一篇已删除。另检查全零与服务失败 fixture。

检查重点：

1. 进入工作台后，视线先看到工作状态与新建/继续创作，而不是导出或危险操作。
2. 统计信息清楚但克制；主数字、趋势、来源、热门文章不争夺同一级视觉注意力。
3. 长中文标题、英文 slug、四位以上 PV、400 天趋势不会撑破 390/768/1280 布局。
4. 浅色、深色、跟随系统切换后没有白底白字、浅灰低对比或硬编码表面残留。
5. 键盘可依次到达所有动作，焦点不被裁切；400 天趋势滚动和每日数据展开可完成。
6. 所有空、失败和隐私文案听起来诚实，不暗示人数、精准归因、反作弊或计费能力。

---

## 15. Design approval summary

本规格用现有 Blog X 的编辑式视觉语言组织两页：工作台回答“内容状态与下一步”，统计页回答“何时、从哪里、哪些文章被打开”。实现保持 SSR、原生链接、CSS 柱状图和严格 no-store 数据边界，不引入图表或 UI 依赖；共享后台导航、移动抽屉与全后台一致性明确留给 Phase 13。
