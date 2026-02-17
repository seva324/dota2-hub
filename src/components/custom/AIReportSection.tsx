import { useState, useEffect } from 'react';

// Define Player interface locally
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
  obs_log?: Array<{ time: number }>;
  sen_log?: Array<{ time: number }>;
}

interface Match {
  match_id: number;
  duration: number;
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean;
  players?: Player[];
  picks_bans?: Array<{
    is_pick: boolean;
    hero_id: number;
    team: number;
    order: number;
  }>;
  objectives?: Array<{
    type: string;
    time: number;
    key?: string;
  }>;
  teamfights?: Array<{
    start: number;
    end: number;
    radiant_deaths: number[];
    dire_deaths: number[];
    buybacks: number;
  }>;
  radiant_gold_adv?: number[];
}

// Hero nickname mapping - common heroes
const heroNicknames: Record<number, string> = {
  72: '飞机',      // 矮人直升机
  126: '紫猫',    // 虚无之灵
  123: '小鹿',    // 森海飞霞
  96: '人马',     // 半人马战行者
  106: '火猫',   // 灰烬之灵
  79: '毒狗',    // 暗影恶魔
  131: '滚滚',   // 马戏团长
  49: 'DK',      // 龙骑士
  28: '鱼人',    // 斯拉达
  51: '发条',    // 发条技师
  1: '敌法',
  2: '蓝猫',
  5: '影魔',
  6: '潮汐',
  7: '牛头',
  8: '谜团',
  11: '兽王',
  13: '冰女',
  14: '小鱼人',
  16: '剑圣',
  17: '炼金',
  19: '女王',
  20: '伐木机',
  21: '夜魔',
  22: '蚂蚁',
  23: '光法',
  25: '混沌',
  26: '先知',
  27: '漏斗',
  29: '蝙蝠',
  30: '飞机',
  31: '神灵',
  32: '火枪',
  35: '死灵龙',
  37: 'NEC',
  38: '电魂',
  40: '拍拍',
  41: '猛犸',
  43: '毒龙',
  44: '幽鬼',
  45: 'TB',
  46: '水人',
  47: '猴子',
  48: '小狗',
  52: 'DP',
  53: 'lion',
  55: '屠夫',
  56: 'TK',
  57: '白虎',
  58: '风行',
  59: 'VS',
  60: '炸弹人',
  61: '老奶奶',
  62: '陈',
  63: '小精灵',
  64: '大屁股',
  65: '末日',
  66: '沉默',
  67: '飞机',
  68: '墨客',
  69: '大树',
  70: '土猫',
  71: 'PA',
  73: 'TS',
  74: '小鹿',
  75: '酒仙',
  76: '卡尔',
  77: 'AA',
  78: '光瘤',
  80: '毒狗',
  81: '神谕',
  82: '大鱼人',
  83: '兔子',
  84: '沙王',
  86: '天怒',
  88: '亚巴顿',
  89: '桓',
  90: '巨魔',
  92: 'NAGA',
  94: 'pom',
  95: 'BDO',
  98: '白牛',
  99: '黑贤',
  100: '大牛',
  104: '血魔',
  107: '赏金',
  108: '小Y',
  109: 'SK',
  110: 'coco',
  112: 'ES',
  114: 'OD',
  119: '维萨吉',
  120: 'SB',
  128: 'Lina',
  129: 'Lich',
  130: 'Luna',
  135: 'Mirana',
  136: 'Monkey',
  137: 'Morph',
  138: 'Naga',
  139: 'Necro',
  140: 'OD',
  141: 'Ogre',
  143: 'Oracle',
  147: 'Phantom',
  151: 'Ratt',
  152: 'Razor',
  153: 'Riki',
  154: 'Rubick',
  155: 'SK',
  157: 'Shadow2',
  160: 'Slark',
  162: 'Sniper',
  163: 'Spectre',
  165: 'Storm',
  166: 'Sven',
  167: 'Techies',
  168: 'TA',
  169: 'Terror',
  170: 'Timber',
  171: 'Tiny',
  172: 'Treant',
  173: 'Troll',
  174: 'Tusk',
  175: 'Undying',
  176: 'Ursa',
  177: 'Venge',
  178: 'Venom',
  179: 'Viper',
  181: 'Void',
  182: 'Warf',
  183: 'Weaver',
  184: 'Wind',
  186: 'Witch',
  189: 'Zeus',
};

function getHeroNickname(heroId: number): string {
  return heroNicknames[heroId] || `英雄${heroId}`;
}

// Lane names
const laneNames: Record<number, string> = {
  1: '上路',
  2: '中路',
  3: '下路',
};

// Chinese team detection
const cnPlayerNames = ['ame', 'xnova', 'fy', 'nothingtosay', 'xxs', 'kaka', 'emil', 'mickey', 'miracle', 'n0tail', 'ceb', 'topson', 'ana', 'kuroky', 'luka', 'yapzorb', '皮鞋', '拒绝者', 'ori', 'fly', 'super', 'ger', 'mdd', 'vel', 'pon', 'lil', 'xmj', 'jnk'];

function isChineseTeam(players: Player[]): boolean {
  const playerNames = players.map(p => (p.name || p.personaname || '').toLowerCase()).join(' ');
  return cnPlayerNames.some(name => playerNames.includes(name.toLowerCase()));
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
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
    const winnerName = radiantWin ? radiantTeamName : direTeamName;
    const loserName = radiantWin ? direTeamName : radiantTeamName;
    const winnerPlayers = radiantWin ? radiantPlayers : direPlayers;
    const loserPlayers = radiantWin ? direPlayers : radiantPlayers;
    
    // Find MVP
    const allPlayers = [...radiantPlayers, ...direPlayers];
    const mvp = allPlayers.reduce((prev: Player, curr: Player) => {
      const prevScore = ((prev.kills || 0) * 2 + (prev.assists || 0) * 1.5 - (prev.deaths || 0) * 1.5);
      const currScore = ((curr.kills || 0) * 2 + (curr.assists || 0) * 1.5 - (curr.deaths || 0) * 1.5);
      return currScore > prevScore ? curr : prev;
    });
    
    const mvpHero = getHeroNickname(mvp.hero_id);
    
    // Chinese team detection
    const radiantCN = isChineseTeam(radiantPlayers);
    const direCN = isChineseTeam(direPlayers);
    const hasCNTeam = radiantCN || direCN;
    const cnLost = (radiantWin && direCN) || (!radiantWin && radiantCN);
    
    // ===== BUILD COMPREHENSIVE REPORT =====
    let reportText = '';
    
    // ===== 标题 =====
    const score = `${match.radiant_score}:${match.dire_score}`;
    const duration = formatTime(match.duration || 0);
    reportText += `# 🎮 ${radiantTeamName} vs ${direTeamName}\n`;
    reportText += `## Dota 2 职业联赛 | ${duration} | 比分 ${score}\n\n`;
    reportText += `**${radiantWin ? radiantTeamName : direTeamName} 击败 ${radiantWin ? direTeamName : radiantTeamName}！**\n\n`;
    
    // ===== 开篇 =====
    reportText += `## 📖 开篇\n\n`;
    
    // Determine game type based on gold advantage
    const goldAdv = match.radiant_gold_adv || [];
    const lateGame = goldAdv[30] || 0;
    
    let gameType = '';
    if (Math.abs(lateGame) < 3000) {
      gameType = '势均力敌的拉锯战';
    } else if (lateGame > 5000) {
      gameType = '步步为营的运营局';
    } else {
      gameType = '一边倒的碾压局';
    }
    
    if (cnLost) {
      reportText += `${winnerName} 从对线期便建立起不可逾越的优势，最终以${score}的人头比终结比赛。全场比赛，${loserName}的经济落后高达${Math.abs(lateGame)}金币。\n\n`;
    } else {
      reportText += `这是一场精彩的${gameType}！${winnerName} 展现出强大的团队配合，最终拿下胜利。\n\n`;
    }
    
    // ===== MVP =====
    reportText += `### 🏆 MVP: ${mvpHero}\n\n`;
    reportText += `| 数据 | 数值 |\n|------|------|\n`;
    reportText += `| KDA | ${mvp.kills || 0}/${mvp.deaths || 0}/${mvp.assists || 0} |\n`;
    reportText += `| GPM | ${mvp.gold_per_min || 0} |\n`;
    reportText += `| XPM | ${mvp.xp_per_min || 0} |\n`;
    reportText += `| 补刀 | ${mvp.last_hits || 0} |\n\n`;
    
    // ===== 对线篇 =====
    reportText += `## ⚔️ 对线篇\n\n`;
    
    // Analyze each lane (1=上路, 2=中路, 3=下路)
    const laneAnalysis = [
      { lane: 1, rHeroes: radiantPlayers.filter(p => p.lane === 1), dHeroes: direPlayers.filter(p => p.lane === 1) },
      { lane: 2, rHeroes: radiantPlayers.filter(p => p.lane === 2), dHeroes: direPlayers.filter(p => p.lane === 2) },
      { lane: 3, rHeroes: radiantPlayers.filter(p => p.lane === 3), dHeroes: direPlayers.filter(p => p.lane === 3) },
    ];
    
    for (const lane of laneAnalysis) {
      const laneName = laneNames[lane.lane];
      const rTotalLH = lane.rHeroes.reduce((s, p) => s + (p.last_hits || 0), 0);
      const dTotalLH = lane.dHeroes.reduce((s, p) => s + (p.last_hits || 0), 0);
      const rTotalDN = lane.rHeroes.reduce((s, p) => s + (p.denies || 0), 0);
      const dTotalDN = lane.dHeroes.reduce((s, p) => s + (p.denies || 0), 0);
      
      const rHeroNames = lane.rHeroes.map(p => getHeroNickname(p.hero_id)).join('+');
      const dHeroNames = lane.dHeroes.map(p => getHeroNickname(p.hero_id)).join('+');
      
      reportText += `### 📍 ${laneName} (lane=${lane.lane})\n\n`;
      reportText += `| 阵营 | 英雄 | 补刀 | 反补 |\n`;
      reportText += `|------|------|------|------|\n`;
      reportText += `| ${radiantTeamName} | ${rHeroNames} | ${rTotalLH} | ${rTotalDN} |\n`;
      reportText += `| ${direTeamName} | ${dHeroNames} | ${dTotalLH} | ${dTotalDN} |\n\n`;
      
      // Analysis
      const diff = dTotalLH - rTotalLH;
      if (Math.abs(diff) > 30) {
        if (diff > 0) {
          reportText += `**结果：${direTeamName} ${laneName}完胜！** ${dHeroNames}通过出色的对线能力，压制了对手${Math.abs(diff)}刀。\n\n`;
        } else {
          reportText += `**结果：${radiantTeamName} ${laneName}完胜！** ${rHeroNames}彻底统治了${laneName}。\n\n`;
        }
      } else {
        reportText += `**结果：双方平分秋色**\n\n`;
      }
    }
    
    // ===== 节奏篇 =====
    reportText += `## 📈 节奏篇\n\n`;
    
    // Find key objectives
    const objectives = match.objectives || [];
    const firstBlood = objectives.find(o => o.type === 'CHAT_MESSAGE_FIRSTBLOOD');
    const roshanKills = objectives.filter(o => o.type === 'CHAT_MESSAGE_ROSHAN_KILL');
    const towers = objectives.filter(o => o.type === 'building_kill');
    
    // First blood
    if (firstBlood) {
      reportText += `**一血**：${formatTime(firstBlood.time)} - 比赛正式进入激烈对抗阶段！\n\n`;
    }
    
    // Roshan
    if (roshanKills.length > 0) {
      reportText += `### 🐉 肉山争夺\n\n`;
      roshanKills.forEach((r, i) => {
        const owner = i === 0 ? direTeamName : radiantTeamName;
        reportText += `- 第${i+1}代肉山：${formatTime(r.time)} - ${owner}拿下\n`;
      });
      reportText += `\n`;
    }
    
    // Tower pushes
    if (towers.length > 0) {
      reportText += `### 🗼 防御塔摧毁\n\n`;
      const rTowers = towers.filter(t => t.key?.includes('goodguys')).length;
      const dTowers = towers.filter(t => t.key?.includes('badguys')).length;
      reportText += `- ${radiantTeamName} 摧毁塔数：${rTowers}\n`;
      reportText += `- ${direTeamName} 摧毁塔数：${dTowers}\n\n`;
      
      const firstTower = towers[0];
      if (firstTower) {
        reportText += `**首塔**：${formatTime(firstTower.time)}\n\n`;
      }
    }
    
    // ===== 高潮篇 =====
    const teamfights = match.teamfights || [];
    if (teamfights.length > 0) {
      reportText += `## 🏆 高潮篇\n\n`;
      reportText += `### 关键团战\n\n`;
      
      teamfights.slice(0, 3).forEach((tf, i) => {
        const rDeaths = tf.radiant_deaths?.length || 0;
        const dDeaths = tf.dire_deaths?.length || 0;
        const buybacks = tf.buybacks || 0;
        
        reportText += `**第${i+1}波团战** ${formatTime(tf.start)}-${formatTime(tf.end)}\n`;
        reportText += `- ${radiantTeamName} 减员：${rDeaths}人\n`;
        reportText += `- ${direTeamName} 减员：${dDeaths}人\n`;
        if (buybacks > 0) {
          reportText += `- 买活使用：${buybacks}次\n`;
        }
        reportText += `\n`;
      });
    }
    
    // ===== 复盘 =====
    reportText += `## 🔍 复盘\n\n`;
    
    // Stats summary
    const radiantKills = radiantPlayers.reduce((s, p) => s + (p.kills || 0), 0);
    const direKills = direPlayers.reduce((s, p) => s + (p.kills || 0), 0);
    
    reportText += `### 📊 数据统计\n\n`;
    reportText += `| 队伍 | 击杀 | 死亡 |\n`;
    reportText += `|------|------|------|\n`;
    reportText += `| ${radiantTeamName} | ${radiantKills} | ${direKills} |\n`;
    reportText += `| ${direTeamName} | ${direKills} | ${radiantKills} |\n\n`;
    
    // Player performance
    reportText += `### ⚔️ 选手数据\n\n`;
    
    reportText += `**${radiantTeamName} (天辉)**\n\n`;
    for (const p of radiantPlayers) {
      const hero = getHeroNickname(p.hero_id);
      const kda = `${p.kills || 0}/${p.deaths || 0}/${p.assists || 0}`;
      const gpm = p.gold_per_min || 0;
      const xpm = p.xp_per_min || 0;
      reportText += `- ${hero}: ${kda} | GPM:${gpm} | XPM:${xpm}\n`;
    }
    reportText += `\n`;
    
    reportText += `**${direTeamName} (夜魇)**\n\n`;
    for (const p of direPlayers) {
      const hero = getHeroNickname(p.hero_id);
      const kda = `${p.kills || 0}/${p.deaths || 0}/${p.assists || 0}`;
      const gpm = p.gold_per_min || 0;
      const xpm = p.xp_per_min || 0;
      reportText += `- ${hero}: ${kda} | GPM:${gpm} | XPM:${xpm}\n`;
    }
    reportText += `\n`;
    
    // Failure analysis for Chinese team loss
    if (cnLost) {
      reportText += `---\n\n`;
      reportText += `## 💔 失败原因分析\n\n`;
      
      const loserTotalLH = loserPlayers.reduce((s, p) => s + (p.last_hits || 0), 0);
      const winnerTotalLH = winnerPlayers.reduce((s, p) => s + (p.last_hits || 0), 0);
      
      reportText += `1. **对线全面溃败**：全队补刀落后${winnerTotalLH - loserTotalLH}刀，对线期被完爆\n`;
      reportText += `差距巨大**：比赛2. **经济后期经济落后${Math.abs(lateGame)}金币，相当于落后2个大件\n`;
      
      if (teamfights.length > 0) {
        reportText += `3. **团战处理不当**：多次团战亏损，未能组织有效反击\n`;
      }
      
      reportText += `\n`;
      
      // Improvement suggestions
      reportText += `## 💡 改进建议\n\n`;
      reportText += `1. **加强前期对线**：劣势路对线需要更多沟通和针对\n`;
      reportText += `2. **加快核心装备节奏**：关键装备需要更快出炉\n`;
      reportText += `3. **提高团队支援意识**：地图意识需要加强\n`;
    } else if (!hasCNTeam) {
      reportText += `---\n\n`;
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
        <pre className="whitespace-pre-wrap font-sans text-slate-200 text-xs sm:text-sm leading-relaxed">{report}</pre>
      </div>
    </div>
  );
}
