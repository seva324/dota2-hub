# DOTA2 Pro Hub

专业的DOTA2战报与赛事预测平台，重点关注中国战队（XG、YB、VG、LGD、AR），汇集T1级别赛事结果、转会动态、社区热点。

## 功能特性

- **赛事战报**：T1级别赛事实时比分与排名，突出显示中国战队
- **赛事预告**：即将开始的比赛和赛事日历
- **新闻与转会**：最新DOTA2电竞资讯与选手动态
- **社区热点**：Reddit、NGA、X 热门讨论

## 数据来源

- [OpenDota API](https://docs.opendota.com/)
- [Liquidpedia](https://liquipedia.net/dota2)
- [Dotabuff](https://www.dotabuff.com)
- [GosuGamers](https://www.gosugamers.net/dota2)

## 技术栈

- React + TypeScript + Vite
- Tailwind CSS
- shadcn/ui

## 自动更新

网站每天早上 8:00（北京时间）自动更新，通过 GitHub Actions 工作流实现。

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建
npm run build
```

## 许可证

MIT
