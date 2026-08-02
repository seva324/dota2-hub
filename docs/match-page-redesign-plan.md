# Match 详情页重构：DLTV + OpenDota 数据归因与实施方案

> 目标：重做 MatchDetailModal。用户点击比赛页的比分或 View Match 后跳转到独立的比赛详情页（`#/match/<seriesId>`），
> 三场比赛（同一系列赛）倒叙展示在同一页面，参考三张原型图的"黄色 pip = 系列赛累计胜场"设计。
>
> 参考 URL：https://dltv.org/matches/427386/midas-club-vs-team-resilience-games-of-the-future-2026

## 一、数据源发现（关键结论）

DLTV 的比赛详情页内嵌一个 `series_item` JSON（单次抓取即可拿到整场系列赛的全部数据），包含：

```
series_item = {
  id: 427386,                       // DLTV seriesId
  first_team_id, second_team_id,
  first_team:  {...}               // 队名、logo（light/dark 两套）
  second_team: {...}
  event:      { id, title, slug }  // 赛事名
  series_players: [ { player: { id, steam_id, title, image, full_name, rank, country } }, ... ]  // 10人
  maps: [
    {
      id: 1082656915,
      steam_id: 8923506996,        // ★ OpenDota 的 match_id，用于深链/校验/回退
      radiant_team_id, dire_team_id,
      radiant_score, dire_score,    // 本场击杀数
      winner: 'radiant'|'dire',     // 本场赢家
      fb, f10, duration,            // 一血、十杀、时长(秒)
      radiant_picks, dire_picks, radiant_bans, dire_bans,   // 选/ban（hero_id + order）
      map_results: [ { team_id, player{id,title,slug,country,rank}, hero{id,title,facets,image},
                       level, kills, deaths, assists, last_hits, denied_hits, gpm, xpm,
                       gold_total, gold_current, items[], backpack[], neutral_item,
                       aghanims_scepter, aghanims_shard, role, ... }, ×10 ]
    }, ...
  ]
}
```

**实测样例（427386 系列赛，BO3）：**

| Map | steam_id | 比分 | winner | 时长 | map_results |
|---|---|---|---|---|---|
| #1 | 8923506996 | 42:23 | radiant | 2968s (49:28) | 10人 ✓ |
| #2 | 8923579943 | 29:14 | radiant | 2017s | 10人 ✓ |
| #3 | 8923640730 | — | — | — | **空 []**（弃权/未打） |
| #4 | 8923643650 | 6:36 | dire | 1832s | 10人 ✓ |

> 注意：系列赛 4 张 map 中有一张（steam 8923640730）`map_results` 为空 —— 这张是系列赛内被弃权/取消的地图。
> 倒叙展示时应**跳过空 map_results 的地图**，只展示有数据的比赛（对应原型的三张图）。

**玩家头像：** `series_players[].player.image`（如 `/uploads/players/R27SBf7llqzooxbPfdUuJUzYYY6tAulw.png`）。
`map_results` 里的 player 对象**不含** image/steam_id，需要通过 `player.id` join 到 `series_players`。

## 二、数据归因：DLTV vs OpenDota

| 页面元素 | 数据来源 | 说明 |
|---|---|---|
| 系列赛结构（几场、胜负关系） | **DLTV** `series_item.maps[]` | 倒叙 + 跳空 map |
| 每场 Steam match ID | **DLTV** `maps[].steam_id` | 同时是 OpenDota 深链 key |
| 每场击杀比分 / winner / 时长 | **DLTV** `maps[].radiant_score/dire_score/winner/duration` | 就是原型里的数字 |
| 小比分（系列赛胜场 pip） | **DLTV** 累计 `maps[].winner` | 1:0 / 1:1 / 1:2 |
| 战队名 / logo | **DLTV** `first_team/second_team` | logo 走 `/api/asset-image` 代理 |
| 赛事名 | **DLTV** `event.title` | |
| 选手名 / ID / 国家 / 排名 | **DLTV** `series_players[].player` | `steam_id`=account_id |
| 选手头像 | **DLTV** `series_players[].player.image` | join 到每场 player |
| 英雄头像 / facet | **DLTV** `map_results[].hero.image` | 或走现有 `/api/heroes` CN 名 |
| 英雄等级 | **DLTV** `map_results[].level` | |
| KDA / 正补 / 反补 / GPM / XPM / 金钱 | **DLTV** `map_results[]` | |
| 装备 / 背包 / 中立装 / 魔晶 / A杖 | **DLTV** `map_results[]` | `aghanims_scepter/shard` 布尔位 |
| 英雄中文名 | **OpenDota** `/api/heroes`（DB） | 现有端点 |
| 空 map_results 的地图回退 | **OpenDota** `/api/matches/<steam_id>` | 弃权图一般不展示，跳过即可 |
| 数值交叉校验（QA） | **OpenDota** `/api/matches/<steam_id>` | 用 steam_id 校验击杀/时长/KDA/装备 |

**结论：99% 数据来自 DLTV 单次抓取；OpenDota 只用于英雄中文名 + QA 校验。**
这比原来"每场都要单独抓 OpenDota"的方案简单、快、且更贴合原型（原型数据就来自 DLTV）。

## 三、API 设计

新增 **`/api/match-page?series_id=<DLTV seriesId>`**（或 `?url=<dltv match url>`）：

1. 拼 DLTV match URL：`https://dltv.org/matches/<series_id>/<slug>`（slug 可选，不带 slug 也能拿到 series_item 但 maps 为空 —— **必须带 slug**）。
   - 从哪拿 slug？`api/matches.js` 返回的 `match_url` 已经带完整 slug。前端把 `match_url` 一起传给新页面。
2. 抓取：复用 `lib/server/dltv-matches-service.js` 的 `fetchText`（direct + jina fallback）+ 热缓存（新开一把 key，TTL 较长，如 10 分钟）。
3. 解析 `series_item` → 归一化成前端需要的 payload。
4. 对 `map_results` 为空的 map：尝试 OpenDota 回退（带 `api_key`），失败则标记 `available:false` 由前端跳过。
5. 所有 DLTV 图片路径（队 logo、选手头像、英雄、物品）相对路径 → 绝对 URL，并走 `getMirroredAssetUrl` 代理。

**响应结构（草案）：**

```ts
type MatchPagePayload = {
  seriesId: number;
  eventName: string;
  bestOf: string;                 // 'BO3'
  startTime: number;
  teams: {
    radiant: TeamInfo;            // { id, name, tag, logo, logoDark }
    dire: TeamInfo;
  };
  players: Record<playerId, PlayerMeta>;  // { id, steamId, name, image, country, rank }
  maps: Array<{
    steamId: string;
    label: string;                // 'Map #1'
    radiantScore: number;
    direScore: number;
    winner: 'radiant' | 'dire';
    duration: number;             // 秒
    fb: 'radiant' | 'dire' | null;
    f10: 'radiant' | 'dire' | null;
    radiantPicks: number[];
    direPicks: number[];
    radiantBans: number[];
    direBans: number[];
    players: Array<{             // 10人，倒序可直接渲染
      teamId: number;
      playerId: number;
      heroId: number;
      heroImg?: string;
      heroName?: string;
      level: number;
      kills: number; deaths: number; assists: number;
      lastHits: number; denies: number;
      gpm: number; xpm: number;
      gold: number;
      items: number[];           // 主装备6格 + 中立
      backpack: number[];
      hasScepter: boolean;
      hasShard: boolean;
    }>;
  }>;
};
```

> 物品显示用 DLTV 自己的 `items[].image`（自带 `/uploads/items/...`），不走 OpenDota item 常量，少一次请求。

## 四、前端页面架构

**新增 `apps/web/src/pages/SeriesMatchPage.tsx`**（独立全页，替代 MatchDetailModal 的 fullPage 分支）：

```
┌────────────────────────────────────────────────┐
│ ← 返回 赛事名 · 2026-08-01 · BO3              │
│                                                │
│   [队A logo] [队A名]   1:2   [队B名] [队B logo]│   ← 系列赛总比分
│                                                │
│ ──────── 第3场 · 6:36 · 36:6 胜:队B ────────  │
│   [队B logo] [VICTORY/队B名]   36    [队A]     │
│   ●●           (6:36)             ●            │   ← 黄色pip = 系列胜场
│   ┌ 5个选手行: 头像|英雄|ID|Lv|KDA|正补|反补|   │
│   │  金币|经验|装备(6)|背包|A杖|魔晶           │
│   └──────────────────────────────────────────┘
│ ──────── 第2场 · 33:38 · 29:14 胜:队A ──────── │  ← 倒叙：最新在上面
│   (同上结构)                                    │
│ ──────── 第1场 · 49:28 · 42:23 胜:队A ──────── │
│   (同上结构)                                    │
└────────────────────────────────────────────────┘
```

### 核心视觉：黄色 pip（系列赛胜场）

原型逻辑（用户已确认）：
- pip 数 = 该队到目前为止的**累计系列赛胜场**。
- 第1场队A赢 → 队A侧 1 个 pip，队B 0 个。
- 第2场队B赢 → 1:1，两侧各 1 个 pip。
- 第3场队B赢 → 队B 侧 2 个 pip，队A 1 个。

渲染：每场比赛分数下方，一排小黄色方块（`bg-[#facc15]`），数量=累计胜场。
判赢/判负标签：本场 winner 侧显示 VICTORY（黄/白），负侧显示 DEFEAT（灰）。
**左右队布局沿用 MatchesPage 的 `TeamMatchup` 等宽容器（w-48 两侧 + w-24 中间），保证严格居中**（见 card-layout-qa 记忆）。

### 选手行（每场 10 行）

```
[英雄头像 40px] [选手头像 32px] 名字(ID)  Lv  KDA  正补 反补  GPM  XPM  金币  装备6格+中立  A杖 魔晶
```

- 英雄头像用 DLTV `hero.image`（或 `/api/heroes` 的 `img_url`），40px 圆角。
- 选手头像用 DLTV `series_players[].player.image`，32px 圆形；点击跳 `#/player/<steam_id>`。
- 装备 6 格小图 + 中立装角标；A杖/魔晶用 DLTV 布尔位 → 显示对应图标（可复用项目里已有的 aghs 图标或 item image）。
- 左右队：radiant 5 行（浅色底/绿色侧）+ dire 5 行（深色/红色侧），居中对称。

### 路由

- `hashRouter.ts` 已支持 `#/match/<id>`。现 `parseHash` 把 match 落在 `page:'home'` —— **改为 `page:'matches'` 或新 page**，并在 `App.tsx` 渲染 `SeriesMatchPage`。
- MatchesPage：`CompletedRow`/`UpcomingRow` 点击 → `navigate({page:'matches', overlay:{type:'match', matchId: seriesId}})`，同时把 `match_url` 传给页面。**修复当前 bug**：现在 `onOpenMatch` 传的是 `match_id`(=seriesId) 但 `App.tsx` 拿它调 `/api/match-details`（DB 查询）→ 404 → 显示硬编码假数据（XG vs Team Spirit）。新流程改为新端点 + 真数据。
- HomeDashboard 的 `handleOpenMatch` 保留兼容（仍走 modal），或也切到新页面 —— 先保留 modal 不动，最小改动。

### 主题

沿用现有 DotaHub 深色主题 token：bg `#0f1115`、card `#1a1d24`、蓝 `#2b55e8`、红 `#ff3b30`、黄 pip `#facc15`（胜利强调）。不用 DLTV 的紫色。

## 五、实施步骤

1. **后端**：`api/match-page.js` + `lib/server/dltv-match-page-service.js`（fetchText 复用 + 新热缓存）+ `lib/server/dltv-series-parser.js`（从 HTML 提取并解析 `series_item`）。
   - 解析：用现有 `series_item = {...}` 提取技巧（找到 `series_item =`，括号配对截取 JSON）。
   - 处理多 map_results blob：每个 `maps[i].map_results` 内嵌在 map 对象里，直接取。
2. **前端**：`SeriesMatchPage.tsx`（含 `SeriesMapBlock`、`PlayerRow`、`PipRow` 子组件）+ 类型文件 + `App.tsx`/`MatchesPage.tsx`/`hashRouter.ts` 路由接线。
3. **QA**：
   - 内容有效性：427386 系列数据 vs 原型三图（42:23 / 29:14 / 6:36、时长、pip 1:0/1:1/1:2、KDA/装备/A杖/魔晶抽查）；空 map 跳过。
   - UI 设计 QA：`vision.cjs` 看截图 + puppeteer 测元素中心对齐（左右队等宽、比分居中、pip 居中）。
4. **本地展示**：dev server + 预览给用户看。

## 六、风险与备注

- **DLTV 反爬**：直接 fetch 可能空，必须 jina fallback（现有 `fetchText` 已处理）。匹配页比列表页大很多（~1MB），热缓存 TTL 建议 10 分钟，避免频繁抓。
- **slug 必须**：不带 slug 的 `/matches/<seriesId>` 能拿到 `series_item` 但 `maps` 为空。前端把 `match_url`（含 slug）传进来；后端也可尝试无 slug + OpenDota 兜底。
- **地图缺失**：弃权图 `map_results` 空 → 跳过不渲染（原型只有 3 张图）。
- **不破坏现有**：HomeDashboard 的 modal 流保留；新页面只接管 `#/match/<id>`（seriesId 深链）与比赛页点击。
- 图片全部走 `/api/asset-image` 代理（`getMirroredAssetUrl`），保证国内浏览器可加载。
