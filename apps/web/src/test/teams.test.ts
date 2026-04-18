import { describe, expect, it } from 'vitest';
import { resolveTeamLogo } from '@/lib/teams';

describe('resolveTeamLogo', () => {
  it('returns white logo variants for the black DLTV team marks', () => {
    const teams = [
      { team_id: '2163', name: 'Team Liquid', logo_url: 'https://dltv.example/liquid.png' },
      { team_id: '7119388', name: 'Team Spirit', logo_url: 'https://dltv.example/spirit.png' },
      { team_id: '8291895', name: 'Tundra Esports', logo_url: 'https://dltv.example/tundra.png' },
      { team_id: '9964962', name: 'GamerLegion', logo_url: 'https://dltv.example/gamerlegion.png' },
    ];

    expect(resolveTeamLogo({ teamId: '2163', name: 'Team Liquid' }, teams)).toBe('/images/mirror/teams/2163-white.png');
    expect(resolveTeamLogo({ name: 'Team Spirit' }, teams, 'https://cdn.example/spirit.png')).toBe('/images/mirror/teams/7119388-white.png');
    expect(resolveTeamLogo({ name: 'Tundra' }, [], 'https://cdn.example/tundra.png')).toBe('/images/mirror/teams/8291895-white.png');
    expect(resolveTeamLogo({ teamId: '9964962', name: 'GamerLegion' }, teams)).toBe('/images/mirror/teams/9964962-white.png');
  });

  it('keeps other team logos unchanged', () => {
    expect(
      resolveTeamLogo(
        { teamId: '8261500', name: 'Xtreme Gaming' },
        [{ team_id: '8261500', name: 'Xtreme Gaming', logo_url: 'https://cdn.example/xg.png' }],
      ),
    ).toBe('https://cdn.example/xg.png');
  });
});
