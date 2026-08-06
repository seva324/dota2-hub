import { describe, expect, it } from 'vitest';
import { getCuratedTeamLogoMirrorPath } from '../../../../lib/team-logo-overrides.js';
import { resolveTeamLogo } from '@/lib/teams';

describe('resolveTeamLogo', () => {
  it('prefers the uploaded SVG overrides for the four custom teams', () => {
    expect(resolveTeamLogo({ teamId: '2163', name: 'Team Liquid' }, [], 'https://example.com/liquid.png'))
      .toBe('/images/mirror/teams/team-liquid-white.svg');
    expect(resolveTeamLogo({ teamId: '7119388', name: 'Team Spirit' }, [], 'https://example.com/spirit.png'))
      .toBe('/images/mirror/teams/team-spirit-white.svg');
    expect(resolveTeamLogo({ teamId: '8291895', name: 'Tundra Esports' }, [], 'https://example.com/tundra.png'))
      .toBe('/images/mirror/teams/tundra-esports-white.svg');
    expect(resolveTeamLogo({ teamId: '9964962', name: 'GamerLegion' }, [], 'https://example.com/gamerlegion.png'))
      .toBe('/images/mirror/teams/gamerlegion-white.svg');
  });

  it('keeps the refreshed Xtreme Gaming mirror fallback', () => {
    expect(resolveTeamLogo({ teamId: '8261500', name: 'Xtreme Gaming' }, [], null))
      .toBe(getCuratedTeamLogoMirrorPath('Xtreme Gaming'));
  });

  it('prefers curated mirrored logo paths for name-only teams over external explicit logos', () => {
    expect(resolveTeamLogo('Team Yandex', [], 'https://hawk.live/storage/teams/yandex.png'))
      .toBe(getCuratedTeamLogoMirrorPath('Team Yandex'));
    expect(resolveTeamLogo('Zero Tenacity', [], 'https://dltv.org/images/desktop/empty/team.svg'))
      .toBe(getCuratedTeamLogoMirrorPath('Zero Tenacity'));
  });

  it('prefers the local name-based mirror fallback over DLTV explicit logos', () => {
    // PSG.LGD 只有镜像 fallback（无 curated/override），DLTV logo 不应抢先
    expect(resolveTeamLogo({ teamId: '5014799', name: 'PSG.LGD' }, [], 'https://hawk.live/storage/teams/lgd.png'))
      .toBe('/images/mirror/teams/5014799.png');
    // 行数据带远端 logo_url + tag 命中时，本地镜像 fallback 同样优先
    expect(resolveTeamLogo(
      { teamId: '5014799', name: 'LGD Gaming' },
      [{ team_id: '5014799', name: 'LGD Gaming', tag: 'LGD', logo_url: 'https://s3.dltv.org/uploads/teams/lgd.png' }],
      'https://hawk.live/storage/teams/lgd.png',
    )).toBe('/images/mirror/teams/5014799.png');
  });

  it('falls back to the explicit DLTV logo when no local mirror exists', () => {
    expect(resolveTeamLogo({ teamId: '10781', name: 'RE Arise' }, [], 'https://hawk.live/storage/teams/10781.png'))
      .toBe('https://hawk.live/storage/teams/10781.png');
  });
});
