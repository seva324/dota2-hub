# DOTA2 战报中心

专注中国战队 (XG, AR, VG, LGD, iG 等) 的 DOTA2 赛事战报网站。

## 功能特性

- 🏆 **T1 赛事战报** - 实时更新顶级赛事比赛结果
- ⏰ **赛事倒计时** - 即将开始的比赛倒计时提醒
- 🇨🇳 **中国战队聚焦** - XG, Azure Ray, VG, LGD 等重点关注
- 📰 **转会新闻** - 选手转会动态
- 🔥 **社区热点** - X/Reddit/NGA 热门讨论

## 技术栈

- **前端**: Next.js 15 + TypeScript + Tailwind CSS
- **数据库**: SQLite (better-sqlite3)
- **数据源**: 
  - OpenDota API
  - Liquidpedia
  - GosuGamers
- **部署**: GitHub Pages (前端) + 本地服务器 (数据采集)

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库

```bash
npm run init-db
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 4. 更新数据

```bash
npm run update-data
```

## 数据采集

### OpenDota API
- 获取职业比赛数据
- 战队信息
- 比赛详情

配置 API Key: 在 `scripts/fetch-opendota.js` 中设置

### Liquidpedia 抓取
- 赛事信息
- 战队 Logo
- 转会新闻

```bash
npm run fetch-liquipedia
```

## 部署

### GitHub Pages 自动部署

1. Fork 本仓库
2. 在 Settings > Pages 中启用 GitHub Pages
3. 设置 Secrets: `OPENDOTA_API_KEY`
4. 推送代码，自动触发部署

### 定时更新

GitHub Actions 每天 8:00 UTC 自动：
1. 拉取最新数据
2. 构建静态站点
3. 部署到 GitHub Pages

## 项目结构

```
dota2-hub/
├── data/                  # SQLite 数据库
├── scripts/               # 数据采集脚本
│   ├── init-db.js        # 数据库初始化
│   ├── fetch-opendota.js # OpenDota API 抓取
│   └── scrape-liquipedia.js # Liquidpedia 抓取
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── page.tsx      # 首页
│   │   ├── matches/      # 比赛页面
│   │   ├── tournaments/  # 赛事页面
│   │   ├── teams/        # 战队页面
│   │   ├── news/         # 新闻页面
│   │   └── api/          # API 路由
│   ├── components/       # 组件
│   └── lib/              # 工具函数
└── .github/workflows/    # GitHub Actions
```

## 数据来源

- [OpenDota](https://www.opendota.com/)
- [Liquidpedia Dota2](https://liquipedia.net/dota2/)
- [GosuGamers](https://www.gosugamers.net/dota2)

## License

MIT
