const PRIORITY = ['drama', 'patch', 'roster', 'esports', 'takes'];

// English-only patterns
const EN = {
  drama: [
    /\b(322|match[- ]?fix|banned|boosted viewers?|boosting|controvers(?:y|ial))\b/i,
    /\b(destroy(?:s|ed|ing)? dota|hates|accused.*(?:valve|destroy)|criticized.*(?:valve|condition)|penalt(?:y|ies).*322)\b/i,
    /\b(account (?:boost|ban|cheat)|boosted viewers?)\b/i,
    /\b(?:assault|threat|stole|theft)\b.*\b(?:player|team|incident|during|claim)\b/i,
  ],
  patch: [
    /\b(patch\s*7\.\d|balance patch|hotfix|emergency patch|facet(?:s)? removed)\b/i,
    /\b(aghanim|tormentor|meepo|dark carnival|fortune mechanic)\b/i,
    /\b(bug(?:s)? fix|exploit(?:s)?|rework(?:ed|ing)?|crafting|replay issue)\b/i,
    /\b(items? (?:added|found|return)|new (?:item|hero|ability|mechanic))\b/i,
    /\b(removed from (?:dota|game)|valve (?:fix|remov|rework))\b/i,
    /\b(test server.*patch|patch.*release|preparing.*(?:update|patch))\b/i,
  ],
  roster: [
    /\b(roster (?:move|change|revamp)|lineup change|coach(?:ing)? change)\b/i,
    /\b(?:joins?|joined|signs?|signed|departs?|departed|benched|benching|stand[- ]?in|substitut)\b/i,
    /\b(?:kicked|released|disband\w*|assembled|new team|replaces? \w+ on)\b/i,
    /\b(?:return(?:s|ed)?.*(?:roster|pro scene)|will leave|leave.*team)\b/i,
    /\b(?:missed.*opportunity.*coach|why.*kicked|real reason.*depart)\b/i,
  ],
  esports: [
    /\b(playoffs?|playoff|standings?|schedule|bracket|group stage|grand final|semi[- ]?final|quarter[- ]?final)\b/i,
    /\b(?:defeated?|beat|beats|triumph|advance[d]? to|eliminat|exit(?:ed)?)\b/i,
    /\b(?:season \d+|slam|wallachia|birmingham|dreamleague|blast|championship|qualif(?:ier)?)\b/i,
    /\b(?:top \d+ (?:hero|player|team) (?:at|in|of)|best (?:player|team|carry|mid) (?:at|in|of))\b/i,
  ],
  takes: [
    /\b(?:said|says|comment(?:s|ed)?|admit(?:s|ted)?|explain(?:s|ed)?|reveal(?:s|ed)?)\b/i,
    /\b(?:assess(?:es|ed|ment)?|spoke|speak(?:s|ing)?|compare[ds]?|tier list|rated)\b/i,
    /\b(?:evaluat(?:e[ds]|ion)?|honestly|candidly|shared|objectively|believes?|thinks?|claims?)\b/i,
    /\b(?:surpris(?:e[ds])?|shock(?:s|ed)?|warn(?:s|ed)?|defend(?:s|ed)?|joke[ds]?|refuse[ds]?)\b/i,
    /\b(?:clarifi(?:es|ed)|calls? for|suggest(?:s|ed)?|trolled|praise[ds]?|addressed)\b/i,
  ],
};

// Chinese-only patterns
const ZH = {
  drama: [
    /(假赛|开挂|封号|账号被封|争议|冲突|矛盾|风波|炮轰|怒喷|开团|开喷)/,
  ],
  patch: [
    /(补丁|版本改动|热更新|平衡性|命石|折磨者|修复bug|重做英雄)/,
  ],
  roster: [
    /(转会|离队|加盟|签约|替补|试训|阵容变动|阵容调整|教练变动|担任教练|被踢|官宣加入|组队|解散|复出)/,
  ],
  esports: [
    /(赛事|比赛对阵|赛程|赛果|积分榜|淘汰|晋级|季后赛|总决赛|小组赛|淘汰赛|胜者组|败者组|不敌|击败|夺冠)/,
  ],
  takes: [
    /(表示|坦言|透露|评价|点评|认为|觉得|直言|分析|回应|发声|盛赞|力挺|锐评|吐槽|谈到|聊到)/,
  ],
};

function getEnText(row = {}) {
  return [row.title_en, row.summary_en, row.content_en, row.content_markdown_en]
    .filter(Boolean).join('\n');
}

function getZhText(row = {}) {
  return [row.title_zh, row.summary_zh, row.content_zh, row.content_markdown_zh]
    .filter(Boolean).join('\n');
}

export function classifyNewsCategory(row = {}) {
  const en = getEnText(row);
  const zh = getZhText(row);
  if (!en && !zh) return 'community';

  for (const cat of PRIORITY) {
    const enPatterns = EN[cat] || [];
    const zhPatterns = ZH[cat] || [];
    const enHit = en && enPatterns.some(p => p.test(en));
    const zhHit = zh && zhPatterns.some(p => p.test(zh));
    if (enHit || zhHit) return cat;
  }

  return 'community';
}
