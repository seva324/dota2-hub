# DotaHub Web 重设计重构计划

## 设计依据

本次重设计以 `Prototype/` 中的 8 张原型图为准：

- `Desktop Homepage.png`
- `Mobile Homepage.png`
- `Desktop Match detail.png`
- `Mobile Match detail.png`
- `Desktop Team Flyout.png`
- `Mobile Team Flyout.png`
- `Desktop Player Profile.png`
- `Mobile Player Profile.png`

这些原型把当前偏营销落地页的页面结构，改成了电竞数据仪表盘：深色玻璃质感、红色直播/主操作状态、高密度比赛数据、移动端横向卡片流，以及战队/选手实体抽屉。

## 当前代码形态

- `apps/web/src/App.tsx` 当前渲染单页堆叠：`Navbar`、`HeroSection`、`TournamentSection`、`UpcomingSection`、`NewsSection`、`CommunitySection`、`Footer`。
- `apps/web/src/sections/TournamentSection.tsx` 同时承载赛事数据、精选赛事 UI、比赛选择、战队速览、选手速览和比赛详情编排，是本次重构的主要风险点。
- `apps/web/src/components/custom/MatchDetailModal.tsx` 已有比赛详情的数据加载和桌面 Dialog / 移动 Sheet 响应式行为。
- `apps/web/src/components/custom/TeamFlyout.tsx` 和 `PlayerProfileFlyout.tsx` 已经提供 API 驱动的懒加载实体浮层。
- 项目已有 React、Vite、Tailwind、shadcn/ui、Radix、lucide、ECharts/Recharts 和现有 `/api/*` 合约。本计划不需要新增依赖。

## Series 聚合规则

- 重构后 **比赛卡** 和 **比赛详情** 都必须以 `Series` 为聚合边界，而不是以单张地图/单局比赛为边界。
- 如果同一个 `Series` 下有 3 张地图，列表和卡片只显示一场 **比赛**，内部展示 `地图 1 / 地图 2 / 地图 3`，并按原型里的 map tabs / map progress 设计呈现每张地图状态。
- 比分、BO 类型、直播/完赛状态、赛事名、双方战队、经济差和当前地图状态都从聚合后的 Series 计算。
- 点击比赛卡进入 **比赛详情** 时，默认打开当前进行中的地图；若比赛已结束，默认打开最后一张已完成地图。
- 数据层需要保留每张地图的 `match_id`，用于加载单图详情、BP、经济曲线、事件和选手数据。

### 当前实现落点

- `HeroSection` 的中国战队即将开赛卡已通过 `series_id` 聚合，并在单张卡片内展示 `地图 1 / 地图 2 / 地图 3`。
- `TournamentSection` 的 Series 卡片已在折叠态直接展示地图入口；点击任一地图会打开对应 `match_id`。
- `MatchDetailModal` 接收同一 Series 下的 `seriesMaps`，顶部展示地图选择器，并在切换地图时重新加载该地图的比赛详情。
- `TeamFlyout` 和 `PlayerProfileFlyout` 保留桌面侧边 Sheet；移动端按原型改为底部抽屉，减少横向挤压。

## 设计系统目标

- **Shell**：桌面端固定顶部导航，包含 logo、导航、搜索、主题/账号入口；移动端顶部身份栏加底部 tab bar。
- **色彩**：近黑背景、slate 玻璃面板、细边框、红色直播/主操作、绿色正向状态、金色经济值、灰色辅助文字。
- **密度**：桌面端保持仪表盘高信息密度和右侧信息栏；移动端使用大点击区域、横向滑动卡片和底部抽屉。
- **字体层级**：中文优先的紧凑 UI 层级，大号比分数字，小号元数据标签，数据面板中避免营销页式超大标题。
- **组件族**：共享面板、比赛卡、比分块、logo/avatar、状态徽标、地图 tabs、数据行、英雄条、赛果表格行、实体抽屉、移动底部导航。
- **shadcn 约束**：优先复用 `Button`、`Badge`、`Tabs`、`Table`、`Sheet`、`Drawer`、`Dialog`、`Avatar`、`ScrollArea`、`Skeleton`、`Separator`、`Tooltip`，并保证所有覆盖层有可访问标题。

## 页面计划

### 1. 首页

桌面端重构为三块仪表盘：

- 顶部 shell：DotaHub logo、`首页 / 赛程 / 比赛 / 战队 / 选手 / 赛事 / 资讯`、全局搜索、主题切换、登录入口。
- 顶部焦点区：一个视觉化直播赛事卡，加一组即将开始比赛卡。
- 主内容区：按 Series 聚合后的直播比赛卡、即将开始横向卡片、已结束比赛表格；每张比赛卡内部显示地图状态而不是拆成多张卡。
- 右侧信息栏：热门战队、版本热点、赛事筛选、人气选手。
- Footer 保留，但改成和深色数据仪表盘一致的视觉系统。

移动端重构为 App 化首页：

- 顶部 logo、搜索、通知、账号图标。
- 分段筛选：`全部 / LIVE / 即将开始 / 已结束`。
- 日期选择行。
- 直播卡和即将开始卡使用横向滑动。
- 已结束比赛使用高密度列表。
- 底部 tab bar：`首页 / 赛程 / 战队 / 选手 / 我的`。

### 2. 比赛详情

原型要求的是围绕单场比赛的数据页面，而不是营销区块：

- 顶部比分面板：双方战队、logo、BO 类型、直播/完赛状态、地图进度、赛果。
- Tabs：`概览 / 阵容选择 / 比赛数据 / 比赛进程 / 历史交锋`。
- 地图选择器展示同一 Series 下每张地图状态，并保留每张地图对应的 `match_id`。
- BP 条展示 pick / ban。
- 经济曲线和关键事件。
- 双方战队数据表：英雄、KDA、正反补、经济、GPM、XPM、伤害、治疗、物品。
- 队伍阵容、直播源、赛事信息、相关/接下来比赛。
- 移动端保持同一信息结构，但按比分、tabs、地图、BP、图表、事件、表格、相关内容纵向堆叠。

推荐实现：先从 `MatchDetailModal.tsx` 抽出 `MatchDetailSurface`，让它继续能在现有 modal/sheet 中渲染；导航策略确认后，再提升为独立比赛页面或 URL 状态。

### 3. 战队速览

桌面端是右侧 Sheet，移动端是底部 Drawer：

- 战队头图区域：logo、名称、地区/排名、关注、近期状态。
- 阵容区：位置标签和选手头像/行。
- 接下来比赛和最近比赛。
- 英雄池，包含场次和胜率。
- 关键数据和近期参赛赛事。
- CTA 指向完整战队主页，同时保留速览作为主要快速查看方式。

推荐实现：保留现有 `TeamFlyout` API 合约，把 JSX 拆成 `TeamFlyoutHeader`、`TeamRoster`、`TeamMatches`、`TeamHeroPool`、`TeamStats`、`TeamTournaments`。

### 4. 选手速览

桌面端是右侧选手 Sheet，移动端是大底部 Drawer：

- 头像、姓名、认证/状态、当前战队、国家/地区、位置、关注/分享。
- 核心数据：KDA、GPM、胜率、人气/排名、近期趋势。
- 英雄池，包含胜率和使用场次。
- 最近比赛：对手、比分、赛果、KDA、使用英雄。
- 荣誉成就和近期赛事表现。
- CTA 指向完整选手页。

推荐实现：继续保持 `PlayerProfileFlyout` 懒加载，但新增共享 `EntityProfileShell`，让战队和选手抽屉共享间距、覆盖层行为、头部操作和移动端交互。

## 重构顺序

1. **先锁行为，再改视觉**
   - 保留现有 `/api/team-flyout`、`/api/player-profile`、`/api/match-details`、`/api/tournaments`、`/api/upcoming`、`/api/live-hero` 测试。
   - 在抽出共享组件后，补充 App shell、比赛详情 surface、战队速览、选手速览的 UI smoke tests。

2. **建立 redesign 基础**
   - 在 `apps/web/src/index.css` 中更新 DotaHub 语义 token；只有 shadcn token 不够表达时才添加少量工具类。
   - 在 `apps/web/src/components/custom/dotahub/` 下添加小而稳定的复用 UI primitives。
   - 格式化和数据转换 helper 放进 `apps/web/src/lib/`，避免各页面重复。

3. **拆分大型 surface**
   - 从 `TournamentSection.tsx` 中抽出比赛卡、赛果行、logo/name、状态徽标、英雄条、数据表格等模式。
   - 移动 UI 到小组件时，保持当前 fetch 时机和懒加载行为。
   - 第一轮视觉迁移不改变 API payload shape。

4. **实现首页 redesign**
   - 用 `HomeDashboard` composition 替换当前 section stack。
   - 复用 `HeroSection`、`UpcomingSection`、`TournamentSection` 已经在使用的直播/即将开始/已结束数据，但通过新的 dashboard 布局渲染。
   - 加桌面右栏和移动底部 tab bar。

5. **重做比赛详情**
   - 从 `MatchDetailModal.tsx` 抽出 `MatchDetailSurface`。
   - 按原型实现桌面全宽详情布局和移动纵向布局。
   - 保持现有 dialog/sheet 入口可用，同时引入 route/hash/search-param 策略支持可分享比赛详情。

6. **重做战队和选手抽屉**
   - 使用共享 profile shell 重绘 `TeamFlyout` 和 `PlayerProfileFlyout`。
   - 桌面用 `Sheet` 侧边栏，移动用 `Drawer` 底部抽屉。
   - 保持懒加载：战队/选手 payload 只在打开时请求。

7. **视觉 QA 和回归**
   - 跑 `npm run test:web`、`npm run lint:web`、`npm run build:web`。
   - 启动 Vite，用桌面/移动浏览器截图对比 8 张原型。
   - 记录 fidelity ledger：布局、字体、色彩、间距、抽屉行为、卡片密度、图表/表格可读性、响应式溢出。

## 数据与 API 检查

- 首页需要直播比赛、即将开始比赛、已结束比赛、排行榜、版本热点、赛事筛选、人气选手。
- 首页和比赛详情需要能从现有 payload 里识别 Series；优先使用明确的 `series_id` / series key，缺失时用赛事、双方战队、开始时间窗口和 BO 类型做保守聚合。
- 比赛详情已有 `/api/match-details`；需要确认是否足够覆盖单张地图的事件时间线、BP、直播源、相关比赛和赛事侧栏。
- 战队速览已有 `/api/team-flyout`；需要确认是否足够覆盖位置、排名、近期状态、接下来比赛、英雄池和赛事成绩。
- 选手速览已有 `/api/player-profile`；需要确认是否足够覆盖头像、位置、国家/地区、战队、英雄池、最近比赛、荣誉和趋势数据。
- 如果首页右栏数据缺失，先复用现有 endpoint；只有 UI parity 被 payload 阻塞时才新增聚合接口。

## 风险

- `TournamentSection.tsx` 体积过大，直接在里面改完整 redesign 风险高；先抽共享组件再迁移视觉最稳。
- 原型把比赛详情表现为完整页面，而当前代码把它当 modal/sheet。这个导航决策会影响 URL、测试和后续埋点。
- 移动端抽屉需要固定高度、滚动区域和可访问标题，否则容易出现内容溢出或焦点问题。
- 图表、物品条、英雄条必须有稳定尺寸，避免移动端横向溢出。
- 现有 app shell 测试仍期待旧 section stack，`HomeDashboard` 替换后需要同步更新。

## 第一个推荐确认的决策

建议把 **比赛详情** 做成可分享的独立 surface，同时保留从卡片/列表打开 modal 或 sheet 的过渡兼容层。

这样桌面比赛详情能承载原型里的高密度布局，比赛链接也能分享；同时我们还能复用现有 `MatchDetailModal` 代码，避免一次性重写全部交互。
