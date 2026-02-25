# 本地测试 Summary

## 测试目标
验证系列赛胜负判断逻辑和战队名称映射是否正确。

## 测试用例：Match ID 8703101544

### 原始数据（从 OpenDota API 获取）
```json
{
  "match_id": "8703101544",
  "radiant_team_id": "9338413",
  "dire_team_id": "8255888",
  "radiant_score": 18,
  "dire_score": 33,
  "radiant_win": false,
  "start_time": 1771847457
}
```

### 修复后的战队名称映射
| Team ID | 修复前 (错误) | 修复后 (正确) |
|---------|--------------|---------------|
| 9338413 | MOUZ | MOUZ |
| 8255888 | Yakult Brothers ❌ | BetBoom Team ✅ |

### 完整比赛数据
```json
{
  "match_id": "8703101544",
  "radiant_team_id": "9338413",
  "dire_team_id": "8255888",
  "radiant_team_name": "MOUZ",
  "radiant_team_name_cn": "MOUZ",
  "dire_team_name": "BetBoom Team",
  "dire_team_name_cn": "BB",
  "radiant_score": 18,
  "dire_score": 33,
  "radiant_game_wins": 0,
  "dire_game_wins": 1
}
```

### 胜负判断逻辑验证

**修复前的问题：**
- 直接使用 `radiant_win` 判断胜负
- 假设 team A 一直在 radiant，team B 一直在 dire

**修复后的逻辑：**
```javascript
// 1. 获取本场比赛中 radiant 边的实际队伍名称
const matchRadiantTeam = match.radiant_team_name; // "MOUZ"
const matchDireTeam = match.dire_team_name;        // "BetBoom Team"

// 2. 判断哪边赢了
const radiantWin = match.radiant_win; // false (MOUZ 输了)

// 3. 根据实际获胜队伍判断
const winner = radiantWin ? matchRadiantTeam : matchDireTeam;
// winner = "BetBoom Team"

// 4. 与系列赛中记录的队伍比较
if (winner === groups[groupKey].radiant_team_name) {
  groups[groupKey].radiant_wins++;
} else {
  groups[groupKey].dire_wins++;
}
```

### 验证结果

| 检查项 | 状态 |
|--------|------|
| ✅ Team ID 8255888 正确映射为 "BetBoom Team" | PASS |
| ✅ Team ID 8255888 缩写正确为 "BB" | PASS |
| ✅ 胜负判断基于实际 radiant/dire 边 | PASS |
| ✅ 数据导出正常 | PASS |
| ✅ 本地 Build 成功 | PASS |

## 本地测试步骤

```bash
# 1. 重新生成数据
node scripts/sync-league-matches.mjs
node scripts/fetch-real-data.js

# 2. 导出静态数据
node scripts/export-static-data.js

# 3. 本地 Build 测试
npm run build

# 4. 验证特定比赛数据
grep "8703101544" public/data/matches.json
```

## 已修复的问题

1. **Team ID 映射错误** - 8255888 从 "Yakult Brothers" 修正为 "BetBoom Team"
2. **系列赛胜负计算** - 现在基于每场比赛中队伍实际所在的 radiant/dire 边
3. **战队缩写** - 移动端显示缩写，桌面端显示全称

## 提交前 Checklist

- [x] 本地运行 `npm run build` 成功
- [x] 验证特定比赛数据正确 (Match 8703101544)
- [x] 检查 series 聚合结果
- [ ] 代码 review (待完成)
