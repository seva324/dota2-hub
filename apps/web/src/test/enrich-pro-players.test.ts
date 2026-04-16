import { describe, expect, it } from 'vitest';
import {
  extractDltvPlayerLinks,
  resolveDltvProfileSourceByAccountId,
} from '../../../../scripts/manual-api/enrich-pro-players.js';

describe('extractDltvPlayerLinks', () => {
  it('keeps profile URLs and skips player image assets', () => {
    const raw = `
      <a href="/players/ghost">Ghost</a>
      <a href="https://dltv.org/players/ghostik">Ghostik</a>
      <img src="/players/medium/pFKsdt46dSsZrUOA1wibrqBNUuYoXUc7.png">
      <img src="https://dltv.org/players/3CpNFkFn6yA9Ha1eBqE0D6D3QhfU9n7F.png.webp">
    `;

    expect(extractDltvPlayerLinks(raw)).toEqual([
      'https://dltv.org/players/ghost',
      'https://dltv.org/players/ghostik',
    ]);
  });
});

describe('resolveDltvProfileSourceByAccountId', () => {
  it('selects the DLTV profile whose embedded Steam ID matches the target account id', async () => {
    const searchHtml = `
      <a href="/players/ghost">Ghost</a>
      <a href="/players/ghostik">Ghostik</a>
    `;
    const ghostHtml = `
      <html>
        <head><title>Ghost - Nigma Galaxy</title></head>
        <body>
          <h1>Ghost</h1>
          <a href="https://steamcommunity.com/profiles/76561198166908095">Steam</a>
        </body>
      </html>
    ` + ' '.repeat(300);
    const ghostikHtml = `
      <html>
        <head><title>Ghostik - Team</title></head>
        <body>
          <h1>Ghostik</h1>
          <a href="https://steamcommunity.com/profiles/76561197960266727">Steam</a>
        </body>
      </html>
    ` + ' '.repeat(300);

    const fetchImpl = async (url: string | URL) => {
      if (String(url) === 'https://dltv.org/search/players?q=Ghost') {
        return { ok: true, text: async () => searchHtml };
      }
      if (String(url) === 'https://dltv.org/players/ghost') {
        return { ok: true, text: async () => ghostHtml };
      }
      if (String(url) === 'https://dltv.org/players/ghostik') {
        return { ok: true, text: async () => ghostikHtml };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const resolved = await resolveDltvProfileSourceByAccountId(
      { account_id: 206642367, name: 'Ghost' },
      fetchImpl,
    );

    expect(resolved?.url).toBe('https://dltv.org/players/ghost');
    expect(resolved?.parsed.account_id).toBe(206642367);
    expect(resolved?.parsed.player_name).toBe('Ghost');
  });
});
