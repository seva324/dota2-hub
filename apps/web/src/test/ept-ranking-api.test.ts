import { beforeEach, describe, expect, it, vi } from 'vitest';

function createRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    payload: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

describe('/api/ept-ranking', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('parses top teams from the DLTV ranking page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => `
        <a href="https://dltv.org/teams/tundra-esports" class="table__body-row">
          <div class="table__body-row__cell width-10"><div class="cell__num">01</div></div>
          <div class="table__body-row__cell width-60 width-m-65">
            <div class="cell__logo" data-theme-dark="https://cdn.example/tundra.png"></div>
            <div class="cell__name">Tundra Esports</div>
          </div>
          <div class="table__body-row__cell width-30 width-m-25 align-center">
            <div class="cell__text">14 510 pts.</div>
          </div>
        </a>
        <a href="https://dltv.org/teams/xtreme-gaming" class="table__body-row">
          <div class="table__body-row__cell width-10"><div class="cell__num">02</div></div>
          <div class="table__body-row__cell width-60 width-m-65">
            <div class="cell__logo" data-theme-dark="https://cdn.example/xg.png"></div>
            <div class="cell__name">Xtreme Gaming</div>
          </div>
          <div class="table__body-row__cell width-30 width-m-25 align-center">
            <div class="cell__text">9 560 pts.</div>
          </div>
        </a>
      `,
    })) as typeof fetch);

    const { default: handler } = await import('../../../../api/ept-ranking.js');
    const res = createRes();

    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toContain('max-age=300');
    const payload = res.payload as { teams: Array<{ rank: number; name: string; logo: string | null; points: number }>; source: string };
    expect(payload.source).toBe('dltv');
    // 解析出的排名/队名/积分保持不变（logo 走镜像/代理包装，不断言精确值）
    expect(payload.teams.map((t) => ({ rank: t.rank, name: t.name, points: t.points }))).toEqual([
      { rank: 1, name: 'Tundra Esports', points: 14510 },
      { rank: 2, name: 'Xtreme Gaming', points: 9560 },
    ]);
  });

  it('returns fallback data when the DLTV fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }) as typeof fetch);

    const { default: handler } = await import('../../../../api/ept-ranking.js');
    const res = createRes();

    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toContain('max-age=300');
    expect((res.payload as { source: string; teams: unknown[] }).source).toBe('fallback');
    expect((res.payload as { teams: unknown[] }).teams.length).toBeGreaterThan(0);
  });
});

