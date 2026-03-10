import { describe, it, expect } from 'vitest'

describe('League Name Matching', () => {
  // League name mappings - based on actual OpenDota data
  const LEAGUE_NAME_MAP: Record<string, { id: string; name: string; name_cn: string; tier: string }> = {
    'dream league season28': { id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
    'dreamleague season 27': { id: 'dreamleague-s27', name: 'DreamLeague Season 27', name_cn: '梦联赛 S27', tier: 'S' },
    'dreamleague s28': { id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
    'blast slam': { id: 'blast-slam', name: 'BLAST Slam', name_cn: 'BLAST 锦标赛', tier: 'S' },
    'esl one': { id: 'esl-one', name: 'ESL One', name_cn: 'ESL One', tier: 'S' },
    'pgl': { id: 'pgl', name: 'PGL', name_cn: 'PGL', tier: 'S' },
    'ultras dota pro league': { id: 'ultras-dpl', name: 'Ultras Dota Pro League', name_cn: '超级DPL', tier: 'A' },
    'destiny league': { id: 'destiny-league', name: 'Destiny League', name_cn: '命运联赛', tier: 'B' },
  }

  // Match OpenDota data for match 8708689404
  const sampleMatch = {
    match_id: '8708689404',
    league_id: null as number | null,
    league_name: 'DreamLeague Season 28',
    radiant_team_name: 'Xtreme Gaming',
    dire_team_name: 'Team Falcons',
    start_time: 1772206023,
    radiant_win: 1,
    radiant_score: 2,
    dire_score: 1,
    series_type: 1,
  }

  function findTournamentByLeagueName(leagueName: string | null | undefined) {
    if (!leagueName) return null
    // Normalize: lowercase, trim, and remove spaces for matching
    const normalized = leagueName.toLowerCase().trim().replace(/\s+/g, '')
    const trimmed = leagueName.toLowerCase().trim()

    // Try exact match first (with spaces removed)
    if (LEAGUE_NAME_MAP[normalized]) {
      return LEAGUE_NAME_MAP[normalized]
    }
    // Try exact match with original spacing
    if (LEAGUE_NAME_MAP[trimmed]) {
      return LEAGUE_NAME_MAP[trimmed]
    }
    // Try partial match - check if any key is contained in the normalized name
    for (const [key, value] of Object.entries(LEAGUE_NAME_MAP)) {
      const keyNormalized = key.replace(/\s+/g, '')
      if (normalized.includes(keyNormalized) || keyNormalized.includes(normalized)) {
        return value
      }
    }
    return null
  }

  it('should match tournament by league_name when league_id is null', () => {
    // This is the actual case from match 8708689404
    const result = findTournamentByLeagueName(sampleMatch.league_name)
    expect(result).not.toBeNull()
    expect(result?.id).toBe('dreamleague-s28')
  })

  it('should return null for null league_name', () => {
    const result = findTournamentByLeagueName(null)
    expect(result).toBeNull()
  })

  it('should return null for undefined league_name', () => {
    const result = findTournamentByLeagueName(undefined)
    expect(result).toBeNull()
  })

  it('should return null for empty league_name', () => {
    const result = findTournamentByLeagueName('')
    expect(result).toBeNull()
  })

  it('should match partial league names', () => {
    const result = findTournamentByLeagueName('DreamLeague Season 28')
    expect(result?.id).toBe('dreamleague-s28')
  })

  it('should match BLAST Slam', () => {
    const result = findTournamentByLeagueName('BLAST Slam III')
    expect(result?.id).toBe('blast-slam')
  })

  it('should match Ultras Dota Pro League', () => {
    const result = findTournamentByLeagueName('Ultras Dota Pro League 2025-26')
    expect(result?.id).toBe('ultras-dpl')
  })
})
