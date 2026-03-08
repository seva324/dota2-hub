# DOTA2 Pro Hub

专业的 DOTA2 战报与赛事资讯平台，聚合赛事、赛程、新闻与社区内容。

## 功能特性

- **赛事战报**：实时比分、关键战绩与赛事汇总
- **赛事预告**：即将开赛对阵与时间线
- **新闻聚合**：聚合 BO3.gg 与 Hawk Live 新闻
- **中文翻译**：新闻标题、摘要、正文自动翻译并入库
- **内容过滤**：自动过滤博彩相关新闻

## 新闻抓取与翻译流程

1. `GET/POST /api/sync-news` 抓取 BO3.gg + Hawk Live 新闻，并写入 `news_articles`。
2. 入库时保存英文原文字段（`*_en`）。
3. 对新增或更新文章触发 MiniMax 翻译，写入中文字段（`*_zh`）。
4. `GET /api/news` 直接读取数据库，按发布时间倒序返回中文优先内容。

说明：
- BO3 正文仅从 `.c-article-body .c-editorjs-render` 提取，保留正文段落、正文内链接和正文图片。
- 已存在且未变化的新闻不会重复抓取/重复翻译。

## 关键 API

- `GET /api/news`：读取新闻列表（中文优先）
- `GET/POST /api/sync-news`：手动触发新闻同步与增量翻译

> 说明：`translate-news-content` 与 `backfill-match-details` 已移至 `scripts/manual-api/`，不再作为 Vercel Serverless Function 部署（用于控制 Hobby 计划函数数量）。

`/api/sync-news` 常用参数：
- `onlySource=bo3|hawk`：仅同步指定来源
- `purgeBo3=1`：同步前删除 BO3 历史数据
- `testUrl=<bo3文章URL>`：仅抓取指定 BO3 文章（测试模式）
- `translateLimit=<N>`：本次最多翻译 N 篇

## 自动任务（Vercel Cron）

`vercel.json` 中配置了定时任务：
- `/api/sync-opendota`：`0 8 * * *`
- `/api/sync-liquipedia`：`0 14 * * *`
- `/api/sync-news`：`30 9 * * *`
- `/api/cron?action=refresh-derived-data-incremental`：`30 14 * * *`（增量刷新最近活跃队伍/选手的衍生缓存）

手动监控当前衍生缓存全量刷新进度（tmux + Telegram）：

```bash
tmux new-session -d -s d2hub-derived-monitor \
  'cd /home/seva324/dota2-hub && node --env-file=.env.local scripts/ops/monitor-derived-refresh.mjs --pid=<refresh_pid> --started-at=<iso_time>'
```

## 环境变量

- `DATABASE_URL` 或 `POSTGRES_URL`：PostgreSQL 连接串（Neon）
- `MINIMAX_API_KEY`：MiniMax API Key，用于中文翻译
- `MINIMAX_MODEL`：可选，默认 `MiniMax-M2.5`

## 数据来源

- [OpenDota API](https://docs.opendota.com/)
- [Liquipedia](https://liquipedia.net/dota2)
- [BO3.gg](https://bo3.gg/dota2/news)
- [Hawk Live](https://hawk.live/tags/dota-2-news)

## 技术栈

- React + TypeScript + Vite
- Vercel Serverless Functions
- PostgreSQL (Neon)
- Tailwind CSS + shadcn/ui

## 本地开发

```bash
npm install
npm run dev
npm run build
```

## 许可证

MIT
