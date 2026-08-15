import { beforeEach, describe, expect, it, vi } from 'vitest';

// live-detail-roles 的 getSquadRoleMap：Neon 有 squad 数据时直接用，不抓 dltv。
// 本地 cron 预热写 Neon，EdgeOne 读这里稳定命中（出口抓 dltv 战队页间歇失败）。

const getDbMock = vi.fn();
const readTeamSquadCache = vi.fn();
const writeTeamSquadCache = vi.fn();
const ensureTeamSquadCacheTable = vi.fn();

vi.mock('../../../../lib/db.js', () => ({
  getDb: () => getDbMock(),
}));

vi.mock('../../../../lib/server/dltv-squad-cache.js', () => ({
  ensureTeamSquadCacheTable,
  readTeamSquadCache,
  writeTeamSquadCache,
}));

function squadItemHtml(nick: string, real: string, roleBg = '', coach = false) {
  return `<a href="https://dltv.org/players/${nick}" class="squad__box-item">
    <div class="flag" style="background-image: url('https://dltv.org/assets/flags/4x3/kz.svg')"></div>
    <span>${nick}</span>
    </div>
    <div>${real}</div>
    <div class="rank__num">100</div>
    ${roleBg ? `<div class="role__bg-${roleBg}">Core</div>` : ''}
    ${coach ? '<div class="coach"></div>' : ''}
  </a>`;
}

function squadPageHtml(items: string[]) {
  return `<html><body><section class="squad">${items.join('')}</section></body></html>`;
}

function makePayload(team1Name: string, team2Name: string, pickNames: string[]) {
  return {
    team1: { name: team1Name },
    team2: { name: team2Name },
    maps: [{ isTeam1Radiant: true, picks: pickNames.map((name) => ({ isRadiant: true, player: { name } })) }],
  };
}

describe('live-detail roles Neon squad cache', () => {
  beforeEach(() => {
    vi.resetModules();
    getDbMock.mockReset();
    getDbMock.mockReturnValue({});
    readTeamSquadCache.mockReset();
    writeTeamSquadCache.mockReset();
    ensureTeamSquadCacheTable.mockReset();
    ensureTeamSquadCacheTable.mockResolvedValue(undefined);
    writeTeamSquadCache.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('uses the Neon squad snapshot without fetching dltv (EdgeOne stable path)', async () => {
    const { enrichLiveDetailPositions } = await import('../../../../lib/server/live-detail-roles.js');
    readTeamSquadCache.mockResolvedValue({
      payload: [['yuma', 1], ['topson', 2], ['wisper', 3], ['thiolicor', 4], ['kj', 5]],
      refreshedAt: Date.now(),
    });

    const payload = makePayload('LGD Gaming', 'Xtreme Gaming', ['Yuma', 'TOPSON', 'Wisper', 'Thiolicor', 'KingJungles']);

    const out = await enrichLiveDetailPositions(payload);
    const byName = Object.fromEntries(out.maps[0].picks.map((p) => [p.player.name, p.position]));
    expect(byName.Yuma).toBe(1);
    expect(byName.TOPSON).toBe(2);
    expect(byName.Wisper).toBe(3);
    expect(byName.Thiolicor).toBe(4);
    // KingJungles：Neon 里只有 'kj'，token 兜底（jungles ∈ 真名不可用）→
    // 无子串命中时保持 undefined（本用例只验证 Neon 直接命中路径）。
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('re-fetches and rewrites Neon when the cached snapshot is stale (>6h)', async () => {
    const { enrichLiveDetailPositions } = await import('../../../../lib/server/live-detail-roles.js');
    readTeamSquadCache.mockResolvedValue({
      payload: [['yuma', 1], ['topson', 2]],
      refreshedAt: Date.now() - 7 * 60 * 60 * 1000, // 超过 6h 新鲜窗口
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => squadPageHtml([squadItemHtml('Yuma', 'Yuma Langlet', '1'), squadItemHtml('KJ', 'Matheus Santos Jungles Diniz', '5')]),
    } as Response);

    const payload = makePayload('LGD Gaming', 'Xtreme Gaming', ['Yuma', 'KingJungles']);

    const out = await enrichLiveDetailPositions(payload);
    const byName = Object.fromEntries(out.maps[0].picks.map((p) => [p.player.name, p.position]));
    expect(byName.Yuma).toBe(1);
    // 过期快照被重新抓取覆盖（token 'jungles' 命中 KJ 真名）。
    expect(byName.KingJungles).toBe(5);
    expect(writeTeamSquadCache).toHaveBeenCalledWith(expect.anything(), 'lgd-gaming', expect.any(Array));
  });
});
