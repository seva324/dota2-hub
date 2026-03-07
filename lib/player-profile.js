const MAX_REASONABLE_AGE = 120;

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toInt(value) {
  const num = toFiniteNumber(value);
  if (num === null) return null;
  return Math.trunc(num);
}

function toBool(value) {
  return value === true || value === 1 || value === '1';
}

function parseAccountId(player) {
  const raw = player?.account_id ?? player?.accountId ?? player?.accountid;
  if (raw === null || raw === undefined) return null;
  const asString = String(raw).trim();
  if (!asString) return null;
  const numeric = toInt(asString);
  if (numeric !== null && numeric > 0) return String(numeric);
  return /^[0-9]+$/.test(asString) ? asString : null;
}

export function normalizeLogo(url) {
  if (!url) return null;
  return String(url).replace('steamcdn-a.akamaihd.net', 'cdn.steamstatic.com');
}

export function convertSeriesType(seriesType) {
  if (seriesType === null || seriesType === undefined || seriesType === '') return 'BO3';
  const map = { 0: 'BO1', 1: 'BO3', 2: 'BO5', 3: 'BO2' };
  if (typeof seriesType === 'string') {
    const normalized = seriesType.toUpperCase().trim();
    if (normalized.startsWith('BO')) return normalized;
    const parsed = Number(normalized);
    return Number.isInteger(parsed) && map[parsed] ? map[parsed] : 'BO3';
  }
  return map[seriesType] || 'BO3';
}

function clampAge(age) {
  if (!Number.isFinite(age)) return null;
  if (age < 0 || age > MAX_REASONABLE_AGE) return null;
  return age;
}

export function calculateDynamicAge(
  input,
  now = new Date()
) {
  if (!input) return null;

  let birthDate = null;

  if (input.birthDate) {
    const parsed = new Date(input.birthDate);
    if (!Number.isNaN(parsed.getTime())) {
      birthDate = parsed;
    }
  }

  const birthYear = toInt(input.birthYear);
  const birthMonth = toInt(input.birthMonth);

  if (!birthDate && birthYear && birthMonth && birthMonth >= 1 && birthMonth <= 12) {
    birthDate = new Date(Date.UTC(birthYear, birthMonth - 1, 1));
  }

  if (!birthDate || Number.isNaN(birthDate.getTime())) return null;

  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const nowMonth = now.getUTCMonth();
  const birthMonthIdx = birthDate.getUTCMonth();
  const nowDay = now.getUTCDate();
  const birthDay = birthDate.getUTCDate();

  if (nowMonth < birthMonthIdx || (nowMonth === birthMonthIdx && nowDay < birthDay)) {
    age -= 1;
  }

  return clampAge(age);
}

function parsePlayerSlot(player) {
  const slot = toInt(player?.player_slot);
  return slot === null ? null : slot;
}

function isRadiantSlot(slot) {
  return slot !== null && slot < 128;
}

function parseHeroId(player) {
  const heroId = toInt(player?.hero_id);
  return heroId && heroId > 0 ? heroId : null;
}

function normalizePickTeam(value) {
  if (value === 0 || value === '0') return 'radiant';
  if (value === 1 || value === '1') return 'dire';
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'radiant' || normalized === 'dire') return normalized;
  }
  return null;
}

function deriveTeamHeroIds(payload, onRadiant, fallbackPlayers) {
  const picksBans = Array.isArray(payload?.picks_bans) ? payload.picks_bans : [];
  const fromDraft = picksBans
    .filter((entry) => {
      const team = normalizePickTeam(entry?.team);
      return toBool(entry?.is_pick) && team === (onRadiant ? 'radiant' : 'dire');
    })
    .sort((a, b) => (toInt(a?.order) || 0) - (toInt(b?.order) || 0))
    .map((entry) => parseHeroId(entry))
    .filter((heroId) => heroId !== null)
    .slice(0, 5);

  if (fromDraft.length > 0) return fromDraft;

  return fallbackPlayers
    .map((p) => parseHeroId(p))
    .filter((heroId) => heroId !== null)
    .slice(0, 5);
}

function pickTeam(payload, side) {
  if (!payload) return null;
  const key = side === 'radiant' ? 'radiant_team' : 'dire_team';
  const team = payload[key];
  return team && typeof team === 'object' ? team : null;
}

function fallbackTeamId(row, side) {
  return side === 'radiant' ? row?.radiant_team_id : row?.dire_team_id;
}

function fallbackTeamName(row, side) {
  return side === 'radiant' ? row?.radiant_team_name : row?.dire_team_name;
}

function fallbackTeamLogo(row, side) {
  return side === 'radiant' ? row?.radiant_team_logo : row?.dire_team_logo;
}

function toTeamRef(row, payload, side) {
  const fromPayload = pickTeam(payload, side);
  const id = fromPayload?.team_id ?? (side === 'radiant' ? payload?.radiant_team_id : payload?.dire_team_id) ?? fallbackTeamId(row, side);
  const name = fromPayload?.name ?? (side === 'radiant' ? payload?.radiant_team_name : payload?.dire_team_name) ?? fallbackTeamName(row, side);
  const logo = fromPayload?.logo_url ?? fallbackTeamLogo(row, side);
  return {
    team_id: id !== null && id !== undefined ? String(id) : null,
    name: name ? String(name) : null,
    logo_url: normalizeLogo(logo)
  };
}

function makeRecentRow(row, payload, player, heroId, teamHeroIds) {
  const slot = parsePlayerSlot(player);
  if (slot === null) return null;

  const onRadiant = isRadiantSlot(slot);
  const ownSide = onRadiant ? 'radiant' : 'dire';
  const opponentSide = onRadiant ? 'dire' : 'radiant';
  const won = row.radiant_win === null || row.radiant_win === undefined
    ? null
    : (onRadiant ? toBool(row.radiant_win) : !toBool(row.radiant_win));

  const ownScore = onRadiant ? toInt(row.radiant_score) : toInt(row.dire_score);
  const opponentScore = onRadiant ? toInt(row.dire_score) : toInt(row.radiant_score);

  return {
    match_id: row.match_id !== null && row.match_id !== undefined ? String(row.match_id) : null,
    start_time: toInt(row.start_time) || 0,
    series_type: convertSeriesType(row.series_type),
    won,
    player_hero_id: heroId,
    team_hero_ids: teamHeroIds,
    selected_team: toTeamRef(row, payload, ownSide),
    opponent: toTeamRef(row, payload, opponentSide),
    selected_score: ownScore,
    opponent_score: opponentScore,
    league_id: toInt(row.league_id),
    tournament_name: row.tournament_name || null
  };
}

export function summarizePlayerMatches(
  rows,
  accountId,
  options = {}
) {
  const nowTs = toInt(options.nowTs) || Math.floor(Date.now() / 1000);
  const windowDays = toInt(options.windowDays) || 90;
  const windowStart = nowTs - windowDays * 24 * 60 * 60;
  const signatureWindowDays = toInt(options.signatureWindowDays) || 730;
  const signatureWindowStart = nowTs - signatureWindowDays * 24 * 60 * 60;
  const signatureMinMatchesExclusive = toInt(options.signatureMinMatchesExclusive) ?? 10;
  const recentLimit = toInt(options.recentLimit) || 15;

  const targetAccount = String(accountId || '').trim();
  if (!targetAccount) {
    return {
      recentMatches: [],
      mostPlayedHeroes: [],
      signatureHeroes: [],
      signatureHero: null,
      wins: 0,
      losses: 0,
      decidedMatches: 0,
      winRate: 0
    };
  }

  const heroStats = new Map();
  const signatureHeroStats = new Map();
  const recentMatches = [];

  const sortedRows = [...(Array.isArray(rows) ? rows : [])]
    .sort((a, b) => (toInt(b?.start_time) || 0) - (toInt(a?.start_time) || 0));

  for (const row of sortedRows) {
    const payload = row?.payload;
    const players = Array.isArray(payload?.players) ? payload.players : [];
    const player = players.find((p) => parseAccountId(p) === targetAccount);
    if (!player) continue;

    const slot = parsePlayerSlot(player);
    if (slot === null) continue;

    const onRadiant = isRadiantSlot(slot);
    const teamPlayers = players.filter((p) => {
      const s = parsePlayerSlot(p);
      if (s === null) return false;
      return onRadiant ? isRadiantSlot(s) : !isRadiantSlot(s);
    });
    const teamHeroIds = deriveTeamHeroIds(payload, onRadiant, teamPlayers);
    const heroId = parseHeroId(player);

    const recentRow = makeRecentRow(row, payload, player, heroId, teamHeroIds);
    if (recentRow) {
      recentMatches.push(recentRow);
    }

    if (!heroId) continue;
    const startTime = toInt(row.start_time) || 0;
    if (startTime >= windowStart) {
      const prev = heroStats.get(heroId) || { hero_id: heroId, matches: 0, wins: 0 };
      prev.matches += 1;
      if (recentRow?.won === true) prev.wins += 1;
      heroStats.set(heroId, prev);
    }

    if (startTime >= signatureWindowStart) {
      const prev = signatureHeroStats.get(heroId) || { hero_id: heroId, matches: 0, wins: 0 };
      prev.matches += 1;
      if (recentRow?.won === true) prev.wins += 1;
      signatureHeroStats.set(heroId, prev);
    }
  }

  const heroEntries = Array.from(heroStats.values())
    .map((hero) => ({
      ...hero,
      win_rate: hero.matches > 0 ? Math.round((hero.wins / hero.matches) * 100) : 0
    }))
    .sort((a, b) => {
      if (b.matches !== a.matches) return b.matches - a.matches;
      if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate;
      return a.hero_id - b.hero_id;
    });

  const signatureHeroEntries = Array.from(signatureHeroStats.values())
    .filter((hero) => hero.matches > signatureMinMatchesExclusive)
    .map((hero) => ({
      ...hero,
      win_rate: hero.matches > 0 ? Math.round((hero.wins / hero.matches) * 100) : 0
    }));

  const signatureHero = [...signatureHeroEntries]
    .sort((a, b) => {
      if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate;
      if (b.matches !== a.matches) return b.matches - a.matches;
      return a.hero_id - b.hero_id;
    })[0] || null;
  const signatureHeroes = [...signatureHeroEntries]
    .sort((a, b) => {
      if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate;
      if (b.matches !== a.matches) return b.matches - a.matches;
      return a.hero_id - b.hero_id;
    })
    .slice(0, 3);

  const boundedRecent = recentMatches.slice(0, recentLimit);
  const windowMatches = recentMatches.filter((match) => (toInt(match?.start_time) || 0) >= windowStart);
  const wins = windowMatches.filter((match) => match.won === true).length;
  const losses = windowMatches.filter((match) => match.won === false).length;
  const decidedMatches = wins + losses;
  const winRate = decidedMatches > 0 ? Math.round((wins / decidedMatches) * 100) : 0;

  return {
    recentMatches: boundedRecent,
    mostPlayedHeroes: heroEntries.slice(0, 6),
    signatureHeroes,
    signatureHero,
    wins,
    losses,
    decidedMatches,
    winRate
  };
}
