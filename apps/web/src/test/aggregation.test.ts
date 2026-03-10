import { describe, it, expect } from 'vitest'

describe('Tournament Aggregation', () => {
  // Simulated LEAGUE_IDS from the aggregation code
  const LEAGUE_IDS: Record<number, { id: string; name: string; name_cn: string; tier: string }> = {
    19269: { id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
    18988: { id: 'dreamleague-s27', name: 'DreamLeague Season 27', name_cn: '梦联赛 S27', tier: 'S' },
  }

  // Simulated TEAM_LOGOS
  const TEAM_LOGOS: Record<string, string> = {
    'xtreme gaming': 'https://example.com/xg.png',
    'xg': 'https://example.com/xg.png',
  }

  function getTeamLogo(teamName: string | null | undefined): string | null {
    if (!teamName) return null
    const name = teamName.toLowerCase()
    return TEAM_LOGOS[name] || null
  }

  // Simplified aggregation function
  function buildTournamentSeries(matchesData: Record<string, {
    match_id: string
    leagueid: number | null
    radiant_team_name: string
    dire_team_name: string
    radiant_score?: number
    dire_score?: number
    radiant_win: number
    start_time: number
    series_type?: string
    radiant_team_logo?: string
    dire_team_logo?: string
  }>) {
    const seriesByTournament: Record<string, Array<{
      series_id: string
      series_type: string
      radiant_team_name: string
      dire_team_name: string
      radiant_team_logo: string | null
      dire_team_logo: string | null
      radiant_wins: number
      dire_wins: number
      games: Array<{
        match_id: string
        radiant_team_name: string
        dire_team_name: string
        radiant_score: number
        dire_score: number
        radiant_win: number
        start_time: number
      }>
    }>> = {}
    const matchIds = Object.keys(matchesData)

    for (const matchId of matchIds) {
      const m = matchesData[matchId]
      if (!m.leagueid) continue

      const leagueId = String(m.leagueid)
      const tournamentInfo = LEAGUE_IDS[leagueId]
      if (!tournamentInfo) continue

      const tournamentId = tournamentInfo.id

      if (!seriesByTournament[tournamentId]) {
        seriesByTournament[tournamentId] = []
      }

      const seriesKey = `${m.radiant_team_name}_vs_${m.dire_team_name}_${m.series_type || 'BO3'}`
      let series = seriesByTournament[tournamentId].find(s => s.series_id === seriesKey)

      if (!series) {
        series = {
          series_id: seriesKey,
          series_type: m.series_type || 'BO3',
          radiant_team_name: m.radiant_team_name,
          dire_team_name: m.dire_team_name,
          radiant_team_logo: m.radiant_team_logo || getTeamLogo(m.radiant_team_name),
          dire_team_logo: m.dire_team_logo || getTeamLogo(m.dire_team_name),
          radiant_wins: 0,
          dire_wins: 0,
          games: []
        }
        seriesByTournament[tournamentId].push(series)
      }

      series.games.push({
        match_id: m.match_id,
        radiant_team_name: m.radiant_team_name,
        dire_team_name: m.dire_team_name,
        radiant_score: m.radiant_score || 0,
        dire_score: m.dire_score || 0,
        radiant_win: m.radiant_win,
        start_time: m.start_time,
      })

      if (m.radiant_win === 1) {
        series.radiant_wins++
      } else {
        series.dire_wins++
      }
    }

    const tournaments = []
    for (const [leagueId, info] of Object.entries(LEAGUE_IDS)) {
      if (seriesByTournament[info.id] && seriesByTournament[info.id].length > 0) {
        tournaments.push({
          id: info.id,
          name: info.name,
          name_cn: info.name_cn,
          tier: info.tier,
          leagueid: parseInt(leagueId)
        })
      }
    }

    return { tournaments, seriesByTournament }
  }

  it('should build tournament series from matches', () => {
    const matchesData = {
      '12345': {
        match_id: '12345',
        leagueid: 19269,
        radiant_team_name: 'Team A',
        dire_team_name: 'Team B',
        radiant_score: 2,
        dire_score: 1,
        radiant_win: 1,
        start_time: 1700000000,
        series_type: 'BO3'
      },
      '12346': {
        match_id: '12346',
        leagueid: 19269,
        radiant_team_name: 'Team A',
        dire_team_name: 'Team B',
        radiant_score: 1,
        dire_score: 2,
        radiant_win: 0,
        start_time: 1700000100,
        series_type: 'BO3'
      }
    }

    const result = buildTournamentSeries(matchesData)

    expect(result.tournaments).toHaveLength(1)
    expect(result.tournaments[0].id).toBe('dreamleague-s28')
    expect(result.seriesByTournament['dreamleague-s28']).toHaveLength(1)
    expect(result.seriesByTournament['dreamleague-s28'][0].radiant_wins).toBe(1)
    expect(result.seriesByTournament['dreamleague-s28'][0].dire_wins).toBe(1)
    expect(result.seriesByTournament['dreamleague-s28'][0].games).toHaveLength(2)
  })

  it('should skip matches without leagueid', () => {
    const matchesData = {
      '12345': {
        match_id: '12345',
        leagueid: null,
        radiant_team_name: 'Team A',
        dire_team_name: 'Team B',
        radiant_win: 1,
      }
    }

    const result = buildTournamentSeries(matchesData)

    expect(result.tournaments).toHaveLength(0)
    expect(result.seriesByTournament).toEqual({})
  })

  it('should skip unknown league IDs', () => {
    const matchesData = {
      '12345': {
        match_id: '12345',
        leagueid: 99999, // Unknown league
        radiant_team_name: 'Team A',
        dire_team_name: 'Team B',
        radiant_win: 1,
      }
    }

    const result = buildTournamentSeries(matchesData)

    expect(result.tournaments).toHaveLength(0)
  })

  it('should group matches by series', () => {
    const matchesData = {
      '12345': {
        match_id: '12345',
        leagueid: 19269,
        radiant_team_name: 'Team X',
        dire_team_name: 'Team Y',
        radiant_win: 1,
        series_type: 'BO3'
      },
      '12346': {
        match_id: '12346',
        leagueid: 19269,
        radiant_team_name: 'Team X',
        dire_team_name: 'Team Y',
        radiant_win: 1,
        series_type: 'BO3'
      },
      '12347': {
        match_id: '12347',
        leagueid: 19269,
        radiant_team_name: 'Team A',
        dire_team_name: 'Team B',
        radiant_win: 0,
        series_type: 'BO3'
      }
    }

    const result = buildTournamentSeries(matchesData)

    // Should have 2 series (Team X vs Team Y, Team A vs Team B)
    expect(result.seriesByTournament['dreamleague-s28']).toHaveLength(2)
  })
})
