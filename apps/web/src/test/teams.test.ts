import { describe, expect, it } from 'vitest';
import { resolveTeamLogo } from '@/lib/teams';

describe('resolveTeamLogo', () => {
  it('prefers the uploaded SVG overrides for the custom teams', () => {
    expect(resolveTeamLogo({ teamId: '2163', name: 'Team Liquid' }, [], 'https://example.com/liquid.png'))
      .toBe('/images/mirror/teams/team-liquid-white.svg');
    expect(resolveTeamLogo({ teamId: '7119388', name: 'Team Spirit' }, [], 'https://example.com/spirit.png'))
      .toBe('/images/mirror/teams/team-spirit-white.svg');
    expect(resolveTeamLogo({ teamId: '8291895', name: 'Tundra Esports' }, [], 'https://example.com/tundra.png'))
      .toBe('/images/mirror/teams/tundra-esports-white.svg');
    expect(resolveTeamLogo({ teamId: '9964962', name: 'GamerLegion' }, [], 'https://example.com/gamerlegion.png'))
      .toBe('/images/mirror/teams/gamerlegion-white.svg');
    expect(resolveTeamLogo({ teamId: '8261500', name: 'Xtreme Gaming' }, [], null))
      .toBe('/images/mirror/teams/xtreme_icon_only_fixed.svg');
    expect(resolveTeamLogo({ teamId: '9467224', name: 'Aurora Gaming' }, [], 'https://example.com/aurora.png'))
      .toBe('/images/mirror/teams/aurora_gaming.svg');
    expect(resolveTeamLogo({ name: 'South America Rejects' }, [], 'https://example.com/sar.png'))
      .toBe('/images/mirror/teams/south_america_rejects.svg');
  });
});
