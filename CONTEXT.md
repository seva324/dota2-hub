# Dota2-Hub

Dota 2 esports information platform for Chinese-speaking users.

## Tech stack

- React + Vite + TypeScript SPA, deployed on EdgeOne Pages.
- Tailwind + shadcn/ui (Radix) + lucide; ECharts/Recharts for data viz.

## Deployment (2026-08-06 确认)

- 生产 = **EdgeOne Pages**（Provider=Github，仓库集成），**Vercel 已弃用**（仓库中的 vercel 部署记录/vercel.json 均为遗留）。
- Provider=Github 项目**拒绝 CLI 直传**，`.github/workflows/deploy-edgeone.yml` 的 deploy job 默认跳过（`EDGEONE_DIRECT_DEPLOY` 变量已删除），push 只跑 build-and-test。
- 部署 = **EdgeOne 控制台 Git 集成自动触发**：push main 后约 **2 分钟**自动构建部署，无需手动操作。
- 验证方法：对比 `https://dotahub.cn/` 的 `assets/index-*.js` 与本地 `apps/web/dist/assets/`（push 后等 ~2 分钟再验）。
- 详见 `DEPLOYMENT.md`。
- **No react-router.** 自建轻量 hash router(`#/...`),2026-07-31 决策:可分享 URL 无需 EdgeOne SPA rewrite,且不新增依赖。
- **Overlay 后退语义 = Replace 模型**(2026-07-31 决策):打开/切换浮层与比赛详情用 `history.replace`,back 永远回到 `#/`,历史深度 ≤2。overlay 是"临时查看",back 关掉浮层回列表最符合直觉。
- **路由单一数据源**(2026-07-31 决策):所有打开浮层/详情/切换页面 = 更新 hash;所有 hash 变化(深链/刷新/分享/后退)由同一 listener 分发。浮层打开时 dashboard 保持渲染(纯 overlay,back 零闪烁);深链浮层不改变顶栏高亮。
- **浮层数据保留组件内懒加载**(2026-07-31 决策):路由只负责按 URL 渲染浮层并传 id,浮层组件挂载时自行 fetch `/api/team-flyout` / `/api/player-profile` / `/api/match-details`。现有懒加载语义与测试不变。
- **比赛详情深链 = 单图模式**(2026-07-31 决策):`#/match/:id` 深链时无 seriesMaps,详情页按单张地图 fallback 渲染(比分取自 match 本身)。地图 tabs 的 series 进度仅在从首页卡片进入时可见;反查 Series 的聚合接口记为已知缺口,后续需要时再接。
- **选手深链直接走 fetch**(2026-07-31 决策):`#/player/:id` 不依赖 dashboardHotPlayers 是否就绪,直接构造最简 fallback 并触发 `fetchPlayerProfileFlyoutModel(id)`,名字在数据返回后填充。
- **路由分发 = 单分发器 + 受控浮层**(2026-07-31 决策):`HashRouter` 解析 hash 为 `{ page, overlay }`,页面互斥渲染、overlay 叠加其上;浮层开关完全由 hash 决定(replace 语义),`HomeDashboard` 变成受控组件,现有 `handleOpen*` 改为调 `navigate`。浮层深链 URL 隐式 `page=home`。
- **顶层页先占位**(2026-07-31 决策):导航栏 `赛事/比赛/战队/选手` 先建可渲染占位页(导航可用、URL 可分享),完整页面内容在后续 iteration 逐个填实。
- Backend: 现有 `/api/*` serverless 路由(tournaments / upcoming / news / live-hero / team-flyout / player-profile / match-details / cron)。

## Architecture

- **Shell**: 桌面固定顶栏(logo/导航/搜索/主题/账号)+ 移动底部 tab bar。
- **导航入口**: 首页 / 赛事 / 比赛 / 战队 / 选手(桌面顶栏);首页 / 赛程 / 战队 / 选手 / 我的(移动 tab bar)。
- **实体展示**: 战队/选手 flyout 作为轻量速览 overlay;深链目标当前为浮层(`#/team/:name`、`#/player/:accountId` 打开浮层),完整实体页后续再建。
- **聚合边界**: 比赛卡与比赛详情以 `Series` 为单位,而非单张地图。

## Domain glossary

See `docs/mechanism.md` for Dota 2 game mechanics terminology.
