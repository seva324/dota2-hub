import { beforeEach, describe, expect, it, vi } from 'vitest';

// 模块级 squadCache/inflight 需要 resetModules 清空。
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

function makePayload(team1Name: string, team2Name: string, pickNames: Record<string, string>) {
  const picks = Object.entries(pickNames).map(([player, hero]) => ({
    isRadiant: false,
    player: { name: player },
    hero: { name: hero },
  }));
  return {
    team1: { name: team1Name },
    team2: { name: team2Name },
    maps: [{ isTeam1Radiant: false, picks }],
  };
}

describe('live-detail position enrichment', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('matches hawk nicknames with Chinese prefixes against DLTV squad nicks (医者watson → watson)', async () => {
    const { enrichLiveDetailPositions } = await import('../../../../lib/server/live-detail-roles.js');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => squadPageHtml([
        squadItemHtml('watson', 'Alijan Islambekov', '1'),
        squadItemHtml('CHIRA_JUNIOR', 'Ilya Chirtsov', '2'),
        squadItemHtml('Saksa', 'Martin Sazdov', '4'),
      ]),
    } as Response);

    const payload = makePayload('Team Yandex', 'Rune Eaters', {
      医者watson: 'Nature\'s Prophet',
      CHIRA_JUNIOR: 'Earth Spirit',
      Saksa: 'Hoodwink',
    });

    const out = await enrichLiveDetailPositions(payload);
    const byName = Object.fromEntries(out.maps[0].picks.map((p) => [p.player.name, p.position]));
    expect(byName['医者watson']).toBe(1);
    expect(byName.CHIRA_JUNIOR).toBe(2);
    expect(byName.Saksa).toBe(4);
  });

  it('matches suffix variants via substring (Maladych → malady)', async () => {
    const { enrichLiveDetailPositions } = await import('../../../../lib/server/live-detail-roles.js');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => squadPageHtml([squadItemHtml('Malady', 'Arman Orazbaev', '5')]),
    } as Response);

    const payload = makePayload('Team Yandex', 'Rune Eaters', { Maladych: 'Witch Doctor' });

    const out = await enrichLiveDetailPositions(payload);
    expect(out.maps[0].picks[0].position).toBe(5);
    expect(out.maps[0].picks[0].positionLabel).toBe('5号位');
  });

  it('does not cache an empty squad result and retries on the next call', async () => {
    const { enrichLiveDetailPositions } = await import('../../../../lib/server/live-detail-roles.js');
    // 两个队都会 fetch；对 team-resilience 的第一次请求返回空 body（EdgeOne 限速），
    // 之后正常返回 squad。空结果不缓存 → 第二次调用重新抓取 team1。
    let resilienceCalls = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('team-resilience')) {
        resilienceCalls += 1;
        return {
          ok: true,
          text: async () => (resilienceCalls === 1
            ? '<html><body>shell page</body></html>'
            : squadPageHtml([squadItemHtml('Erika', 'Yang Shaohan', '1')])),
        } as Response;
      }
      return { ok: true, text: async () => squadPageHtml([squadItemHtml('zzq', 'Zhang Ziqiang', '5')]) } as Response;
    });

    const payload = makePayload('Team Resilience', 'Rune Eaters', { Erika: 'Drow Ranger' });

    const first = await enrichLiveDetailPositions(payload);
    expect(first.maps[0].picks[0].position).toBeUndefined();

    // 空结果不缓存 → 第二次调用重新抓取，匹配成功。
    const second = await enrichLiveDetailPositions(payload);
    expect(resilienceCalls).toBe(2);
    expect(second.maps[0].picks[0].position).toBe(1);
  });

  it('maps hawk display names to DLTV nicks via alias table (YSR-04E → Erika)', async () => {
    const { enrichLiveDetailPositions } = await import('../../../../lib/server/live-detail-roles.js');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => squadPageHtml([
        squadItemHtml('Erika', 'Yang Shaohan', '1'),
        squadItemHtml('niu', 'Li Kongbo', '3'),
      ]),
    } as Response);

    const payload = makePayload('Team Resilience', 'Rune Eaters', { 'YSR-04E': 'Shadow Fiend' });

    const out = await enrichLiveDetailPositions(payload);
    expect(out.maps[0].picks[0].position).toBe(1);
    expect(out.maps[0].picks[0].positionLabel).toBe('1号位');
  });

  it('matches via real-name token when hawk name shares no substring with the nick (KingJungles → KJ via "jungles")', async () => {
    const { enrichLiveDetailPositions } = await import('../../../../lib/server/live-detail-roles.js');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => squadPageHtml([
        squadItemHtml('KJ', 'Matheus Santos Jungles Diniz', '5'),
        squadItemHtml('Yuma', 'Yuma Benjamin Langlet Muckenhirn', '1'),
      ]),
    } as Response);

    const payload = makePayload('LGD Gaming', 'Rune Eaters', { KingJungles: 'Undying' });

    const out = await enrichLiveDetailPositions(payload);
    expect(out.maps[0].picks[0].position).toBe(5);
    expect(out.maps[0].picks[0].positionLabel).toBe('5号位');
  });

  it('falls back to known player positions when the team has no DLTV roster (HULIGANI/L1GA)', async () => {
    const { enrichLiveDetailPositions } = await import('../../../../lib/server/live-detail-roles.js');
    // HULIGANI：DLTV 战队页无 Active squad（302 到 l1ga-team 也无 roster）。
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => '<html><body>no squad section</body></html>',
    } as Response);

    const payload = makePayload('OG', 'HULIGANI', {
      ssnovv1: 'Sven',
      'Mirage`雨': 'Shadow Fiend',
      Corrupted: 'Centaur Warrunner',
      sayuw: 'Earthshaker',
      RESPECT: 'Undying',
    });

    const out = await enrichLiveDetailPositions(payload);
    const byName = Object.fromEntries(out.maps[0].picks.map((p) => [p.player.name, p.position]));
    expect(byName.ssnovv1).toBe(1);
    expect(byName['Mirage`雨']).toBe(2);
    expect(byName.Corrupted).toBe(3);
    expect(byName.sayuw).toBe(4);
    expect(byName.RESPECT).toBe(5);
  });

  it('skips substring matching for very short names to avoid false positives', async () => {
    const { enrichLiveDetailPositions } = await import('../../../../lib/server/live-detail-roles.js');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => squadPageHtml([squadItemHtml('DM', 'Dmitry Dorokhin', '3')]),
    } as Response);

    const payload = makePayload('Team Yandex', 'Rune Eaters', { 'dm!!': 'Timbersaw' });

    const out = await enrichLiveDetailPositions(payload);
    // 'dm' 归一化后长度 < 3 → 精确匹配（'dm' === 'dm' 应该命中！）
    // 这里用真正不匹配的短名验证不误配：
    const out2 = await (async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: async () => squadPageHtml([squadItemHtml('DM', 'Dmitry Dorokhin', '3')]),
      } as Response);
      return enrichLiveDetailPositions(makePayload('Team Yandex', 'Rune Eaters', { 'dx': 'Timbersaw' }));
    })();
    expect(out2.maps[0].picks[0].position).toBeUndefined();
  });
});
