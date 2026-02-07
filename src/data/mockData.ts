import type { Tournament, Team, Transfer, News, CommunityPost } from '@/types';

// 中国战队信息
export const chineseTeams: Team[] = [
  { 
    id: 'xg', 
    name: 'Xtreme Gaming', 
    tag: 'XG', 
    country: 'CN', 
    ranking: 6, 
    points: 698,
    logo: '/images/xg-logo.png'
  },
  { 
    id: 'yb', 
    name: 'Yakult Brothers', 
    tag: 'YB', 
    country: 'CN', 
    ranking: 15, 
    points: 356,
    logo: '/images/yb-logo.png'
  },
  { 
    id: 'vg', 
    name: 'Vici Gaming', 
    tag: 'VG', 
    country: 'CN', 
    ranking: 18, 
    points: 298,
    logo: '/images/vg-logo.png'
  },
  { 
    id: 'lgd', 
    name: 'PSG.LGD', 
    tag: 'LGD', 
    country: 'CN', 
    ranking: 22, 
    points: 245,
    logo: '/images/lgd-logo.png'
  },
  { 
    id: 'ar', 
    name: 'Azure Ray', 
    tag: 'AR', 
    country: 'CN', 
    ranking: 25, 
    points: 198,
    logo: '/images/ar-logo.png'
  },
];

// 国际顶级战队
export const internationalTeams: Team[] = [
  { id: 'falcons', name: 'Team Falcons', tag: 'Falcons', country: 'SA', ranking: 1, points: 1308, logo: '/images/falcons-logo.png' },
  { id: 'tundra', name: 'Tundra Esports', tag: 'Tundra', country: 'EU', ranking: 2, points: 1142, logo: '/images/tundra-logo.png' },
  { id: 'spirit', name: 'Team Spirit', tag: 'TSpirit', country: 'EEU', ranking: 3, points: 939, logo: '/images/spirit-logo.png' },
  { id: 'yandex', name: 'Team Yandex', tag: 'Yandex', country: 'EEU', ranking: 4, points: 812 },
  { id: 'betboom', name: 'BetBoom Team', tag: 'BetBoom', country: 'EEU', ranking: 5, points: 756 },
  { id: 'liquid', name: 'Team Liquid', tag: 'Liquid', country: 'EU', ranking: 7, points: 654, logo: '/images/liquid-logo.png' },
  { id: 'pari', name: 'PARIVISION', tag: 'PARI', country: 'EEU', ranking: 8, points: 612 },
  { id: 'og', name: 'OG', tag: 'OG', country: 'EU', ranking: 9, points: 578, logo: '/images/og-logo.png' },
  { id: 'mouz', name: 'MOUZ', tag: 'MOUZ', country: 'EU', ranking: 10, points: 534, logo: '/images/mouz-logo.png' },
  { id: 'navi', name: 'Natus Vincere', tag: 'NAVI', country: 'EEU', ranking: 11, points: 498, logo: '/images/navi-logo.png' },
  { id: 'heroic', name: 'HEROIC', tag: 'HEROIC', country: 'SA', ranking: 12, points: 456, logo: '/images/heroic-logo.png' },
  { id: 'gl', name: 'GamerLegion', tag: 'GL', country: 'EU', ranking: 13, points: 423, logo: '/images/gl-logo.png' },
];

// 合并所有战队
export const topTeams: Team[] = [...chineseTeams, ...internationalTeams];

// T1 Tournaments Data - 突出中国战队比赛
export const tournaments: Tournament[] = [
  {
    id: 'blast-slam-6',
    name: 'BLAST Slam VI',
    organizer: 'BLAST',
    tier: 'T1',
    prizePool: '$1,000,000',
    location: 'Malta',
    startDate: '2026-02-03',
    endDate: '2026-02-15',
    status: 'ongoing',
    format: 'Round-robin Group Stage + Single-elimination Playoffs',
    image: '/images/blast-slam.jpg',
    teams: topTeams.slice(0, 16),
    standings: [
      { position: 1, team: internationalTeams[0], wins: 0, losses: 0 },
      { position: 2, team: internationalTeams[1], wins: 0, losses: 0 },
      { position: 3, team: chineseTeams[0], wins: 0, losses: 0 }, // XG
      { position: 4, team: internationalTeams[2], wins: 0, losses: 0 },
      { position: 5, team: internationalTeams[3], wins: 0, losses: 0 },
      { position: 6, team: internationalTeams[4], wins: 0, losses: 0 },
      { position: 7, team: internationalTeams[5], wins: 0, losses: 0 },
      { position: 8, team: internationalTeams[6], wins: 0, losses: 0 },
      { position: 9, team: internationalTeams[7], wins: 0, losses: 0 },
      { position: 10, team: internationalTeams[8], wins: 0, losses: 0 },
      { position: 11, team: internationalTeams[9], wins: 0, losses: 0 },
      { position: 12, team: internationalTeams[10], wins: 0, losses: 0 },
    ],
    series: [
      // 中国战队比赛 - XG
      {
        seriesId: 'bs6-xg-1',
        teamA: chineseTeams[0], // XG
        teamB: internationalTeams[8], // MOUZ
        scoreA: 0,
        scoreB: 0,
        format: 'BO1',
        stage: 'Group Stage - Feb 3',
        matches: [],
        timestamp: '2026-02-03T19:00:00Z',
      },
      {
        seriesId: 'bs6-xg-2',
        teamA: chineseTeams[0], // XG
        teamB: internationalTeams[3], // Yandex
        scoreA: 0,
        scoreB: 0,
        format: 'BO1',
        stage: 'Group Stage - Feb 4',
        matches: [],
        timestamp: '2026-02-04T12:00:00Z',
      },
      {
        seriesId: 'bs6-xg-3',
        teamA: chineseTeams[0], // XG
        teamB: internationalTeams[11], // GamerLegion
        scoreA: 0,
        scoreB: 0,
        format: 'BO1',
        stage: 'Group Stage - Feb 4',
        matches: [],
        timestamp: '2026-02-04T16:00:00Z',
      },
      {
        seriesId: 'bs6-xg-4',
        teamA: chineseTeams[0], // XG
        teamB: internationalTeams[10], // HEROIC
        scoreA: 0,
        scoreB: 0,
        format: 'BO1',
        stage: 'Group Stage - Feb 5',
        matches: [],
        timestamp: '2026-02-05T14:00:00Z',
      },
      {
        seriesId: 'bs6-xg-5',
        teamA: chineseTeams[0], // XG
        teamB: internationalTeams[0], // Falcons
        scoreA: 0,
        scoreB: 0,
        format: 'BO1',
        stage: 'Group Stage - Feb 5',
        matches: [],
        timestamp: '2026-02-05T18:00:00Z',
      },
    ],
  },
  {
    id: 'dreamleague-28',
    name: 'DreamLeague Season 28',
    organizer: 'ESL',
    tier: 'T1',
    prizePool: '$1,000,000',
    location: 'Online (Europe)',
    startDate: '2026-02-16',
    endDate: '2026-03-01',
    status: 'upcoming',
    format: 'Group Stage 1 (Bo2) + Group Stage 2 (Bo3) + Playoffs',
    image: '/images/dreamleague.jpg',
    teams: [...topTeams.slice(0, 12), chineseTeams[1]], // 包含YB
    series: [],
  },
  {
    id: 'pgl-wallachia-7',
    name: 'PGL Wallachia Season 7',
    organizer: 'PGL',
    tier: 'T1',
    prizePool: '$1,000,000',
    location: 'Bucharest, Romania',
    startDate: '2026-03-07',
    endDate: '2026-03-15',
    status: 'upcoming',
    format: 'Swiss-system Group Stage (Bo3) + Double-elimination Playoffs',
    image: '/images/pgl-wallachia.jpg',
    teams: [...topTeams.slice(0, 12), chineseTeams[1], chineseTeams[2]], // 包含YB和VG
    series: [],
  },
  {
    id: 'ti-14',
    name: 'The International 2025',
    organizer: 'Valve',
    tier: 'T1',
    prizePool: '$2,500,000+',
    location: 'Hamburg, Germany',
    startDate: '2025-09-04',
    endDate: '2025-09-14',
    status: 'completed',
    format: 'Swiss Round (Bo3) + Special Elimination + Double-elimination Playoffs',
    image: '/images/ti14.jpg',
    teams: topTeams.slice(0, 16),
    standings: [
      { position: 1, team: internationalTeams[0], wins: 5, losses: 2 },
      { position: 2, team: chineseTeams[0], wins: 4, losses: 3 }, // XG亚军
      { position: 3, team: internationalTeams[6], wins: 4, losses: 2 },
      { position: 4, team: internationalTeams[1], wins: 3, losses: 3 },
    ],
    series: [
      {
        seriesId: 'ti14-final',
        teamA: internationalTeams[0], // Falcons
        teamB: chineseTeams[0], // XG
        scoreA: 3,
        scoreB: 2,
        format: 'BO5',
        winner: internationalTeams[0],
        stage: 'Grand Final',
        timestamp: '2025-09-15T00:00:00Z',
        matches: [
          {
            matchId: 'ti14-m1',
            radiantTeam: internationalTeams[0],
            direTeam: chineseTeams[0],
            radiantScore: 45,
            direScore: 23,
            duration: '42:15',
            winner: 'radiant',
            timestamp: '2025-09-15T00:00:00Z',
          },
          {
            matchId: 'ti14-m2',
            radiantTeam: chineseTeams[0],
            direTeam: internationalTeams[0],
            radiantScore: 38,
            direScore: 19,
            duration: '38:42',
            winner: 'radiant',
            timestamp: '2025-09-15T01:30:00Z',
          },
          {
            matchId: 'ti14-m3',
            radiantTeam: internationalTeams[0],
            direTeam: chineseTeams[0],
            radiantScore: 52,
            direScore: 31,
            duration: '51:18',
            winner: 'radiant',
            timestamp: '2025-09-15T03:00:00Z',
          },
          {
            matchId: 'ti14-m4',
            radiantTeam: chineseTeams[0],
            direTeam: internationalTeams[0],
            radiantScore: 41,
            direScore: 28,
            duration: '44:33',
            winner: 'radiant',
            timestamp: '2025-09-15T04:30:00Z',
          },
          {
            matchId: 'ti14-m5',
            radiantTeam: internationalTeams[0],
            direTeam: chineseTeams[0],
            radiantScore: 48,
            direScore: 35,
            duration: '58:27',
            winner: 'radiant',
            timestamp: '2025-09-15T06:00:00Z',
          },
        ],
      },
    ],
  },
];

// 近期转会 - 2026年1-2月
export const transfers: Transfer[] = [
  {
    id: 't1',
    player: { id: 'p1', name: 'Yang', position: 3, country: 'CN' },
    fromTeam: undefined,
    toTeam: chineseTeams[1], // YB
    date: '2026-01-16',
    type: 'join',
    note: '加盟Yakult Brothers司职三号位',
  },
  {
    id: 't2',
    player: { id: 'p2', name: 'Srf', position: 3, country: 'CN' },
    fromTeam: chineseTeams[1], // YB
    toTeam: undefined,
    date: '2026-01-16',
    type: 'leave',
    note: '离开Yakult Brothers',
  },
  {
    id: 't3',
    player: { id: 'p3', name: 'Bach', position: 3, country: 'CN' },
    fromTeam: undefined,
    toTeam: chineseTeams[2], // VG
    date: '2026-01-24',
    type: 'join',
    note: '正式加入Vici Gaming',
  },
  {
    id: 't4',
    player: { id: 'p4', name: 'SSS', position: 3, country: 'RU' },
    fromTeam: { id: '1w', name: '1w Team', tag: '1w', country: 'EEU' },
    toTeam: internationalTeams[6], // PARIVISION
    date: '2026-02-01',
    type: 'transfer',
  },
  {
    id: 't5',
    player: { id: 'p5', name: 'Raven', position: 1, country: 'PH' },
    fromTeam: { id: 'nemesis', name: 'Team Nemesis', tag: 'Nemesis', country: 'SEA' },
    toTeam: undefined,
    date: '2026-02-01',
    type: 'leave',
  },
  {
    id: 't6',
    player: { id: 'p6', name: 'DM', position: 3, country: 'RU' },
    fromTeam: internationalTeams[6], // PARIVISION
    toTeam: undefined,
    date: '2026-01-31',
    type: 'leave',
    note: 'Moved to inactive',
  },
];

// 最新新闻 - 2026年1-2月
export const news: News[] = [
  {
    id: 'n1',
    title: 'BLAST Slam VI预选赛战报：XG鏖战92分钟险胜VG晋级',
    summary: '2026年1月6日，BLAST Slam VI中国赛区预选赛决赛上演史诗级对决，XG与VG战满三局，在决胜局长达92分钟的鏖战后终于分出胜负，XG 2-1击败VG，获得了BLAST Slam VI的参赛资格。',
    source: '17173',
    publishedAt: '2026-01-06',
    category: 'tournament',
    image: '/images/blast-slam.jpg',
  },
  {
    id: 'n2',
    title: '电竞国家杯ENC官宣DOTA2项目，11月利雅得开战',
    summary: '2026年1月29日，电竞国家杯官方正式宣布Dota 2将成为16个参赛项目之一。比赛将于11月2日-8日在沙特阿拉伯利雅得举办，共32支国家代表队将争夺150万美元的总奖金。',
    source: '直播吧',
    publishedAt: '2026-01-29',
    category: 'tournament',
    image: '/images/ewc-2026.jpg',
  },
  {
    id: 'n3',
    title: '2026年DOTA2国际邀请赛将在上海盛大举办',
    summary: '维尔福集团近日宣布，2026年DOTA2国际邀请赛将在中国上海举办。这是该赛事时隔7年重返申城，上海也将成为美国西雅图之外唯一一座承办过多次DOTA2国际邀请赛的城市。',
    source: '新华社',
    publishedAt: '2026-01-16',
    category: 'tournament',
    image: '/images/ti14.jpg',
  },
  {
    id: 'n4',
    title: '《刀塔2》2026年1月30日更新：修复多个英雄漏洞',
    summary: 'Valve发布最新更新，修复了克林克兹的骷髅弓箭手对建筑造成超出预期伤害、斯拉克的深度笼罩未按预期为友军提供移动速度和生命恢复等多个漏洞，同时优化了网络性能。',
    source: 'Steam',
    publishedAt: '2026-01-31',
    category: 'patch',
    image: '/images/patch-update.jpg',
  },
  {
    id: 'n5',
    title: 'Bach正式加入Vici Gaming，VG阵容补强冲击新赛季',
    summary: '2026年1月24日，Vici Gaming官方宣布Bach正式加入战队。这位经验丰富的三号位选手将为VG注入新的活力，助力战队在新赛季取得更好成绩。',
    source: 'Liquipedia',
    publishedAt: '2026-01-24',
    category: 'transfer',
    image: '/images/vg-roster.jpg',
  },
  {
    id: 'n6',
    title: '2026年DOTA2赛事日历公布：全年13场T1赛事',
    summary: '2026年DOTA2赛事日历正式公布，全年将有13场T1级别赛事，包括3届DreamLeague、3届PGL Wallachia、3届BLAST Slam、ESL One伯明翰站以及TI15上海站。',
    source: 'DLTV',
    publishedAt: '2026-01-01',
    category: 'tournament',
    image: '/images/esl-reform.jpg',
  },
];

// 社区热点 - 2026年1-2月
export const communityPosts: CommunityPost[] = [
  {
    id: 'c1',
    title: 'XG鏖战92分钟击败VG晋级BLAST Slam VI，毛哥还是没做到吗？',
    author: 'u/XGSupporter',
    source: 'reddit',
    upvotes: 2850,
    comments: 423,
    url: 'https://reddit.com/r/DotA2',
    publishedAt: '2026-01-07',
  },
  {
    id: 'c2',
    title: '2026年TI将在上海举办！CNDOTA主场作战能否重夺冠军盾？',
    author: 'u/Shanghai2026',
    source: 'reddit',
    upvotes: 3420,
    comments: 567,
    url: 'https://reddit.com/r/DotA2',
    publishedAt: '2026-01-17',
  },
  {
    id: 'c3',
    title: '【搬运】今日REDDIT讨论热点（2026.02.02）：宙斯就是在复刻希腊神话',
    author: '没屁事搬运工',
    source: 'nga',
    upvotes: 1560,
    comments: 234,
    url: 'https://nga.cn',
    publishedAt: '2026-02-02',
  },
  {
    id: 'c4',
    title: 'BLAST Slam VI小组赛预测：XG能否从死亡之组突围？',
    author: 'u/DotaAnalyst',
    source: 'reddit',
    upvotes: 1890,
    comments: 312,
    url: 'https://reddit.com/r/DotA2',
    publishedAt: '2026-02-01',
  },
  {
    id: 'c5',
    title: '电竞国家杯官宣DOTA2项目，国家队版本的世界杯要来了！',
    author: 'u/ENC2026',
    source: 'reddit',
    upvotes: 2156,
    comments: 398,
    url: 'https://reddit.com/r/DotA2',
    publishedAt: '2026-01-30',
  },
  {
    id: 'c6',
    title: '【搬运】今日REDDIT讨论热点（2026.02.01）：玩起来很好玩的英雄',
    author: '手游0星达人',
    source: 'nga',
    upvotes: 890,
    comments: 145,
    url: 'https://nga.cn',
    publishedAt: '2026-02-01',
  },
];

// 即将开始的比赛 - 突出中国战队
export const upcomingMatches = [
  {
    id: 'um1',
    tournament: 'BLAST Slam VI',
    teamA: chineseTeams[0], // XG
    teamB: internationalTeams[8], // MOUZ
    format: 'BO1',
    stage: 'Group Stage',
    time: '2026-02-03T19:00:00Z',
  },
  {
    id: 'um2',
    tournament: 'BLAST Slam VI',
    teamA: chineseTeams[0], // XG
    teamB: internationalTeams[3], // Yandex
    format: 'BO1',
    stage: 'Group Stage',
    time: '2026-02-04T12:00:00Z',
  },
  {
    id: 'um3',
    tournament: 'BLAST Slam VI',
    teamA: chineseTeams[0], // XG
    teamB: internationalTeams[11], // GamerLegion
    format: 'BO1',
    stage: 'Group Stage',
    time: '2026-02-04T16:00:00Z',
  },
  {
    id: 'um4',
    tournament: 'BLAST Slam VI',
    teamA: chineseTeams[0], // XG
    teamB: internationalTeams[10], // HEROIC
    format: 'BO1',
    stage: 'Group Stage',
    time: '2026-02-05T14:00:00Z',
  },
  {
    id: 'um5',
    tournament: 'BLAST Slam VI',
    teamA: chineseTeams[0], // XG
    teamB: internationalTeams[0], // Falcons
    format: 'BO1',
    stage: 'Group Stage',
    time: '2026-02-05T18:00:00Z',
  },
];

// Hero Statistics (Sample)
export const heroStats = [
  { heroId: 1, name: 'Anti-Mage', localizedName: '敌法师', winRate: 52.3, pickRate: 15.2, banRate: 8.5 },
  { heroId: 2, name: 'Axe', localizedName: '斧王', winRate: 51.8, pickRate: 22.1, banRate: 12.3 },
  { heroId: 3, name: 'Bane', localizedName: '祸乱之源', winRate: 49.5, pickRate: 8.7, banRate: 5.2 },
  { heroId: 4, name: 'Bloodseeker', localizedName: '嗜血狂魔', winRate: 48.9, pickRate: 6.3, banRate: 3.1 },
  { heroId: 5, name: 'Crystal Maiden', localizedName: '水晶室女', winRate: 53.2, pickRate: 18.5, banRate: 4.2 },
];
