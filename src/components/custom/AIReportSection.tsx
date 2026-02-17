import { useState, useEffect } from 'react';

// Define Player interface locally to avoid path issues
interface Player {
  player_slot: number;
  account_id?: number;
  personaname?: string;
  name?: string;
  hero_id: number;
  level?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  gold_per_min?: number;
  xp_per_min?: number;
  last_hits?: number;
  denies?: number;
  lane?: number;
  lane_role?: number;
}

interface Match {
  match_id: number;
  duration: number;
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean;
  players?: Player[];
}

// Hero data - loaded from window or use inline
declare global {
  interface Window {
    heroesCN?: Record<string, { name_cn: string }>;
  }
}

// Hero nickname mapping
const heroNicknames: Record<number, string> = {
  72: '飞机',      // 矮人直升机
  126: '紫猫',     // 虚无之灵
  123: '小鹿',     // 森海飞霞
  96: '人马',      // 半人马战行者
  106: '火猫',    // 灰烬之灵
  79: '毒狗',     // 暗影恶魔
  131: '滚滚',    // 马戏团长
  49: 'DK',       // 龙骑士
  28: '鱼人',     // 斯拉达
  51: '发条',     // 发条技师
};

// Chinese names lookup
const cnHeroNames: Record<number, string> = {
  72: '矮人直升机',
  126: '虚无之灵',
  123: '森海飞霞',
  96: '半人马战行者',
  106: '灰烬之灵',
  79: '暗影恶魔',
  131: '马戏团长',
  49: '龙骑士',
  28: '斯拉达',
  51: '发条技师',
};

function getHeroNickname(heroId: number): string {
  return heroNicknames[heroId] || cnHeroNames[heroId] || `Hero ${heroId}`;
}

// Chinese team detection based on known players
const cnPlayerNames = ['ame', 'xnova', 'fy', 'nothingtosay', 'xxs', 'kaka', 'emil', 'mickey', 'miracle', 'n0tail', 'ceb', 'topson', 'ana', 'kuroky', 'luka', 'yapzorb', 'miracle-', '皮鞋', '拒绝者', 'ori', 'fly', '建队'];

function isChineseTeam(players: Player[]): boolean {
  const playerNames = players.map(p => (p.name || p.personaname || '').toLowerCase()).join(' ');
  return cnPlayerNames.some(name => playerNames.includes(name));
}

interface AIReportSectionProps {
  match: Match;
  radiantTeamName: string;
  direTeamName: string;
}

export function AIReportSection({ match, radiantTeamName, direTeamName }: AIReportSectionProps) {
  const [report, setReport] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    generateReport();
  }, [match]);

  const generateReport = () => {
    const radiantPlayers: Player[] = match.players?.filter((p: Player) => p.player_slot < 128) || [];
    const direPlayers: Player[] = match.players?.filter((p: Player) => p.player_slot >= 128) || [];
    
    const radiantWin = match.radiant_win;
    
    // Find MVP
    const allPlayers = [...radiantPlayers, ...direPlayers];
    const mvp = allPlayers.reduce((prev: Player, curr: Player) => {
      const prevScore = ((prev.kills || 0) * 2 + (prev.assists || 0) * 1.5 - (prev.deaths || 0));
      const currScore = ((curr.kills || 0) * 2 + (curr.assists || 0) * 1.5 - (curr.deaths || 0));
      return currScore > prevScore ? curr : prev;
    });
    
    const mvpHero = getHeroNickname(mvp.hero_id);
    const mvpKDA = `${mvp.kills || 0}/${mvp.deaths || 0}/${mvp.assists || 0}`;
    
    // Determine if Chinese team involved
    const radiantCN = isChineseTeam(radiantPlayers);
    const direCN = isChineseTeam(direPlayers);
    const hasCNTeam = radiantCN || direCN;
    const cnLost = (radiantWin && direCN) || (!radiantWin && radiantCN);
    
    const loserName = radiantWin ? direTeamName : radiantTeamName;
    
    // Generate report
    let reportText = '';
    
    // Title
    reportText += `## 🎮 ${radiantTeamName} vs ${direTeamName}\n`;
    reportText += `### ${Math.floor((match.duration || 0) / 60)}分${(match.duration || 0) % 60}秒 | 比分 ${match.radiant_score}:${match.dire_score}\n\n`;
    
    // Opening
    if (radiantWin) {
      reportText += `**${radiantTeamName} 以 ${match.radiant_score}:${match.dire_score} 击败${direTeamName}！**\n\n`;
    } else {
      reportText += `**${direTeamName} 以 ${match.dire_score}:${match.radiant_score} 击败${radiantTeamName}！**\n\n`;
    }
    
    // MVP
    reportText += `### 🏆 MVP: ${mvpHero}\n`;
    reportText += `| 数据 | 数值 |\n|------|------|\n`;
    reportText += `| KDA | ${mvpKDA} |\n`;
    reportText += `| GPM | ${mvp.gold_per_min || 0} |\n`;
    reportText += `| XPM | ${mvp.xp_per_min || 0} |\n\n`;
    
    // Team stats
    const radiantKills = radiantPlayers.reduce((sum: number, p: Player) => sum + (p.kills || 0), 0);
    const direKills = direPlayers.reduce((sum: number, p: Player) => sum + (p.kills || 0), 0);
    
    reportText += `### 📊 团队数据\n`;
    reportText += `| 队伍 | 击杀 | 死亡 |\n`;
    reportText += `|------|------|------|\n`;
    reportText += `| ${radiantTeamName} | ${radiantKills} | ${direKills} |\n`;
    reportText += `| ${direTeamName} | ${direKills} | ${radiantKills} |\n\n`;
    
    // Player details
    reportText += `### ⚔️ 选手数据\n\n`;
    reportText += `**${radiantTeamName} (天辉)**\n\n`;
    for (const p of radiantPlayers) {
      reportText += `- ${getHeroNickname(p.hero_id)}: ${p.kills || 0}/${p.deaths || 0}/${p.assists || 0} | GPM ${p.gold_per_min || 0} | XPM ${p.xp_per_min || 0}\n`;
    }
    reportText += `\n**${direTeamName} (夜魇)**\n\n`;
    for (const p of direPlayers) {
      reportText += `- ${getHeroNickname(p.hero_id)}: ${p.kills || 0}/${p.deaths || 0}/${p.assists || 0} | GPM ${p.gold_per_min || 0} | XPM ${p.xp_per_min || 0}\n`;
    }
    
    // Add failure analysis only for Chinese team loss
    if (cnLost) {
      reportText += `\n---\n\n`;
      reportText += `### 🔍 失败原因分析\n\n`;
      reportText += `1. **对线崩溃**：${loserName} 在对线期全面落后\n`;
      reportText += `2. **经济差距**：核心位发育不良，装备落后\n`;
      reportText += `3. **节奏失误**：关键团战处理不当\n\n`;
      
      reportText += `### 💡 改进建议\n\n`;
      reportText += `1. 加强前期对线沟通\n`;
      reportText += `2. 核心位需加快关键装备节奏\n`;
      reportText += `3. 提高地图意识和支援速度\n`;
    } else if (!hasCNTeam) {
      reportText += `\n---\n\n`;
      reportText += `*本场为国际赛事，战报已精简。*\n`;
    }
    
    setReport(reportText);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="prose prose-invert max-w-none">
      <div className="bg-slate-900/50 rounded-lg p-4 text-sm overflow-auto max-h-[600px]">
        <pre className="whitespace-pre-wrap font-sans text-slate-200 text-xs sm:text-sm">{report}</pre>
      </div>
    </div>
  );
}
