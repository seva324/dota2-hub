const GITHUB_TEAM_LOGO_BASE_URL = 'https://raw.githubusercontent.com/seva324/dota2-hub/main/public/images/mirror/teams';

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function collectLookupValues(inputs) {
  const values = [];
  for (const input of inputs.flat()) {
    if (!input) continue;
    if (typeof input === 'object') {
      values.push(input.teamId, input.team_id, input.id, input.name);
      continue;
    }
    values.push(input);
  }
  return values.filter(Boolean);
}

function buildEntry(definition) {
  const fileName = definition.fileName;
  const mirrorPath = `/images/mirror/teams/${fileName}`;
  const githubUrl = `${GITHUB_TEAM_LOGO_BASE_URL}/${fileName}`;
  return {
    ...definition,
    teamIds: Array.isArray(definition.teamIds) ? definition.teamIds.map((value) => String(value)) : [],
    aliases: Array.isArray(definition.aliases) ? definition.aliases : [],
    mirrorPath,
    githubUrl,
  };
}

export const CURATED_TEAM_LOGOS = [
  buildEntry({
    name: 'Tundra Esports',
    teamIds: ['8291895'],
    aliases: ['tundra', 'tundraesports'],
    fileName: 'tundra-esports.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/UA0TkIDfiYKdehswu3gIMyqZWkzsf1xc.png',
  }),
  buildEntry({
    name: 'Team Yandex',
    teamIds: ['9823272'],
    aliases: ['yandex', 'teamyandex'],
    fileName: 'team-yandex.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/n6lR8FGHdGnrXE9IDxRI0EEFs6XbyY81.png.webp',
  }),
  buildEntry({
    name: 'Team Liquid',
    teamIds: ['2163'],
    aliases: ['liquid', 'teamliquid'],
    fileName: 'team-liquid.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/ow0lHBBYMZsSHrUsVC4yYuI8YFZ8woga.png.webp',
  }),
  buildEntry({
    name: 'Team Falcons',
    teamIds: ['9247354'],
    aliases: ['falcons', 'teamfalcons'],
    fileName: 'team-falcons.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/wgw40Ih0bmTPCoQIcFcCOjJUkNHrJjOJ.png.webp',
  }),
  buildEntry({
    name: 'Aurora',
    teamIds: ['9467224'],
    aliases: ['aurora', 'auroragaming'],
    fileName: 'aurora.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/2fxCLHnhSIGZE2EGlg1y9HI9X1dgxkZk.png',
  }),
  buildEntry({
    name: 'Xtreme Gaming',
    teamIds: ['8261500'],
    aliases: ['xtremegaming', 'xg'],
    fileName: 'xtreme-gaming.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/GchHJf4tIIk1qWBGeob5QKr1D88q4rH8.png.webp',
  }),
  buildEntry({
    name: 'BetBoom Team',
    teamIds: ['8255888'],
    aliases: ['betboom', 'betboomteam'],
    fileName: 'betboom-team.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/uy6DxOllnIUmOVS9XwXLTe7DL1XOGt24.png.webp',
  }),
  buildEntry({
    name: 'Team Spirit',
    teamIds: ['7119388'],
    aliases: ['spirit', 'teamspirit'],
    fileName: 'team-spirit.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/bjSvoovDaI3RlP5J58vn7Gl3rKXK4J8P.png.webp',
  }),
  buildEntry({
    name: 'PARIVISION',
    teamIds: ['9572001'],
    aliases: ['parivision', 'parivisionteam', 'pari vision'],
    fileName: 'parivision.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/eT2duK11e7GzuuCAYFdxZrSX9CNfUMso.png.webp',
  }),
  buildEntry({
    name: 'MOUZ',
    teamIds: ['9338413'],
    aliases: ['mouz'],
    fileName: 'mouz.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/vVbGcKekF9NtwvcI9Cx2kAssEG0zDcer.png',
  }),
  buildEntry({
    name: 'Natus Vincere',
    teamIds: ['36'],
    aliases: ['natusvincere', 'navi'],
    fileName: 'natus-vincere.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/foQbFHzrnM9pp1Gd1TIiiTuwJtU1F3zl.png.webp',
  }),
  buildEntry({
    name: 'Heroic',
    teamIds: ['9303484'],
    aliases: ['heroic'],
    fileName: 'heroic.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/MVWzITs1XdFOpUrIbg4Hm46jXpfW2Vsk.png.webp',
  }),
  buildEntry({
    name: 'OG',
    teamIds: ['2586976'],
    aliases: ['og'],
    fileName: 'og.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/uWhgX97E8F8dkHOhCCcy5zoZKiS8Y8Lh.png',
  }),
  buildEntry({
    name: 'GamerLegion',
    teamIds: ['9964962'],
    aliases: ['gamerlegion'],
    fileName: 'gamerlegion.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/7zAN8tkJ3Kmy071KN8tnIYviZqgGckTX.png',
  }),
  buildEntry({
    name: 'Rekonix',
    aliases: ['rekonix'],
    fileName: 'rekonix.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/1UYy17t6I6H7Vn3Qi1lxCqIgPNqC99Yd.png.webp',
  }),
  buildEntry({
    name: 'Power Rangers',
    aliases: ['powerrangers'],
    fileName: 'power-rangers.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/i6ow6RJs0Rx6GgKj162OlvaXvqD06xda.png',
  }),
  buildEntry({
    name: 'Nigma Galaxy',
    aliases: ['nigmagalaxy', 'nigma'],
    fileName: 'nigma-galaxy.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/ASAY4yOTXJuRzChrhyTvwmKCGjjSOo8I.png.webp',
  }),
  buildEntry({
    name: 'Execration',
    teamIds: ['8254145'],
    aliases: ['execration'],
    fileName: 'execration.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/egM5JPRM3khCJf2T9m1U8lHGfoK72IME.png',
  }),
  buildEntry({
    name: 'Virtus.pro',
    aliases: ['virtuspro'],
    fileName: 'virtus-pro.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/G991zr8WiWSlwiAhdljivuSv29Fy4uUg.png.webp',
  }),
  buildEntry({
    name: 'Vici Gaming',
    teamIds: ['726228'],
    aliases: ['vicigaming', 'vici', 'vg'],
    fileName: 'vici-gaming.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/omVP2poiDIlm8hFMQsIeMuP7AIRuvi2P.png.webp',
  }),
  buildEntry({
    name: 'Yakult Brothers',
    teamIds: ['9351740'],
    aliases: ['yakultbrothers', 'yakult', 'yb'],
    fileName: 'yakult-brothers.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/AdlD9qVa03HXL592yDoOvogBjk66dtTH.png',
  }),
  buildEntry({
    name: 'Team Nemesis',
    aliases: ['teamnemesis', 'nemesis'],
    fileName: 'team-nemesis.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/AzMsPwd9Ckk4dFr4YWropGU4Mc3FJwwd.png.webp',
  }),
  buildEntry({
    name: '1win Team',
    aliases: ['1winteam', '1win'],
    fileName: '1win-team.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/RqLAq4VuE204goSWDE8JtRlJe7NI79mu.png.webp',
  }),
  buildEntry({
    name: 'GLYPH',
    aliases: ['glyph'],
    fileName: 'glyph.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/3MVq16bz293TvdFQAZWYnpIndGltNWur.png',
  }),
  buildEntry({
    name: 'Team Resilience',
    aliases: ['teamresilience', 'resilience'],
    fileName: 'team-resilience.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/v3z0zPXOvFXuQOTJFlowVj8JYw3FUW9B.png',
  }),
  buildEntry({
    name: 'Modus',
    aliases: ['modus'],
    fileName: 'modus.svg',
    placeholder: true,
    sourceUrl: '/images/desktop/empty/team.svg',
  }),
  buildEntry({
    name: 'Zero Tenacity',
    aliases: ['zerotenacity'],
    fileName: 'zero-tenacity.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/bqvSuvVyaGzS75qmgZvBbPXoNQzaIDUa.png.webp',
  }),
  buildEntry({
    name: 'Ivory',
    aliases: ['ivory'],
    fileName: 'ivory.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/mXJjsz3jIiIVZMTPtwtJca3PKPoA8fLx.png.webp',
  }),
  buildEntry({
    name: 'L1ga Team',
    aliases: ['l1gateam', 'l1ga'],
    fileName: 'l1ga-team.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/ZtneB4oOpkSmXwf5FxAilvPsWem8igty.png.webp',
  }),
  buildEntry({
    name: 'Roar Gaming',
    aliases: ['roargaming'],
    fileName: 'roar-gaming.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/wrFHtKFRwkIUtM22BwkHZJmTuUkTUbLV.png',
  }),
  buildEntry({
    name: 'Team Lynx',
    aliases: ['teamlynx', 'lynx'],
    fileName: 'team-lynx.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/REVr3uMfZQ0ZaaPyPNvkuHFPuIT4uyU4.png',
  }),
  buildEntry({
    name: 'Rune Eaters',
    aliases: ['runeeaters'],
    fileName: 'rune-eaters.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/xoKm3D3TqOZiGdGsHgkD8Q1mFO4BntKc.png.webp',
  }),
  buildEntry({
    name: 'BarrancoBar',
    aliases: ['barrancobar'],
    fileName: 'barrancobar.svg',
    placeholder: true,
    sourceUrl: '/images/desktop/empty/team.svg',
  }),
  buildEntry({
    name: 'Estar Backs',
    aliases: ['estarbacks'],
    fileName: 'estar-backs.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/azV3r0Nlbk9o0qiVLuz4ksBmp6QIrZ6q.png.webp',
  }),
  buildEntry({
    name: 'Inner Circle',
    aliases: ['innercircle'],
    fileName: 'inner-circle.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/LSbzm6JxHf65vd1O32sY9W3yyHd0WgIK.png.webp',
  }),
  buildEntry({
    name: 'BTC Gaming',
    aliases: ['btcgaming'],
    fileName: 'btc-gaming.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/6RVUzULXS3BMqFsl1XAJdA90b7jSonqW.png',
  }),
  buildEntry({
    name: 'PlayTime',
    aliases: ['playtime'],
    fileName: 'playtime.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/6lniOY3OIB5EYx7kgEB4aEVjU0ml4jyx.png',
  }),
  buildEntry({
    name: 'Yangon Galacticos',
    aliases: ['yangongalacticos'],
    fileName: 'yangon-galacticos.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/ZE1KJNn0bfjMLfwXuCr13fS6MITr5JAg.png.webp',
  }),
  buildEntry({
    name: 'Nemiga Gaming',
    aliases: ['nemigagaming', 'nemiga'],
    fileName: 'nemiga-gaming.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/5NZlkrAInYqsQUVbXZpHRjADLBVzll5b.png',
  }),
  buildEntry({
    name: 'Veroja',
    aliases: ['veroja'],
    fileName: 'veroja.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/29JAm1dxWLC2FFAvE9CvDpxmd9y5SMhf.png',
  }),
  buildEntry({
    name: 'Cloud Dawning',
    aliases: ['clouddawning'],
    fileName: 'cloud-dawning.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/AmEnEb09Ht0QpWCSPXximt9Pjc4jpK0Q.png',
  }),
  buildEntry({
    name: 'Zetta Games',
    aliases: ['zettagames'],
    fileName: 'zetta-games.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/QsPD4AHMeIP6PrJhQEE8kUzpMFWXsBcs.png',
  }),
  buildEntry({
    name: 'Amaru Flame',
    aliases: ['amaruflame'],
    fileName: 'amaru-flame.svg',
    placeholder: true,
    sourceUrl: '/images/desktop/empty/team.svg',
  }),
  buildEntry({
    name: 'InterActive Philippines',
    aliases: ['interactivephilippines'],
    fileName: 'interactive-philippines.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/LXsbVEz6uEZVwpD3bPpyZvzuwJPVgNeg.png',
  }),
  buildEntry({
    name: 'Game Master',
    aliases: ['gamemaster'],
    fileName: 'game-master.png',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/medium/XKFKD4FqfOLjcnggPKyAPFOnkaZxZ4xu.png',
  }),
  buildEntry({
    name: 'VP.Prodigy',
    aliases: ['vpprodigy'],
    fileName: 'vp-prodigy.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/bmfN9eB3SiW51K0QNzi1KQRoEpYfuvQk.png.webp',
  }),
  buildEntry({
    name: 'Carstensz',
    aliases: ['carstensz'],
    fileName: 'carstensz.webp',
    sourceUrl: 'https://s3.dltv.org/uploads/teams/zwBsKnOne2lNRjlEzaSElCZE1wKqUdoW.png.webp',
  }),
  buildEntry({
    name: 'Chandogs',
    aliases: ['chandogs'],
    fileName: 'chandogs.svg',
    placeholder: true,
    sourceUrl: '/images/desktop/empty/team.svg',
  }),
  buildEntry({
    name: 'Mideng Dreamer',
    aliases: ['midengdreamer'],
    fileName: 'mideng-dreamer.svg',
    placeholder: true,
    sourceUrl: '/images/desktop/empty/team.svg',
  }),
];

const CURATED_TEAM_LOGO_BY_KEY = new Map();

for (const entry of CURATED_TEAM_LOGOS) {
  const keys = new Set([
    entry.name,
    ...entry.aliases,
    ...entry.teamIds,
  ].map((value) => normalizeKey(value)).filter(Boolean));
  for (const key of keys) {
    if (!CURATED_TEAM_LOGO_BY_KEY.has(key)) {
      CURATED_TEAM_LOGO_BY_KEY.set(key, entry);
    }
  }
}

export function normalizeCuratedTeamLogoKey(value) {
  return normalizeKey(value);
}

export function findCuratedTeamLogoEntry(...inputs) {
  for (const value of collectLookupValues(inputs)) {
    const match = CURATED_TEAM_LOGO_BY_KEY.get(normalizeKey(value));
    if (match) return match;
  }
  return null;
}

export function getCuratedTeamLogoMirrorPath(...inputs) {
  return findCuratedTeamLogoEntry(...inputs)?.mirrorPath || null;
}

export function getCuratedTeamLogoGithubUrl(...inputs) {
  return findCuratedTeamLogoEntry(...inputs)?.githubUrl || null;
}

export function isCuratedTeamLogoUrl(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  return CURATED_TEAM_LOGOS.some((entry) => normalized === entry.githubUrl || normalized === entry.mirrorPath);
}
