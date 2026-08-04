import { describe, expect, it } from 'vitest';
import { getHeroImageUrl, getItemImageUrl, toCnAssetUrl } from '../lib/assetUrls';

describe('assetUrls mirror/fallback routing', () => {
  it('resolves mirrored items straight to static files', () => {
    // blink is in the mirrored item set (generated from the mirror manifest)
    expect(getItemImageUrl('blink')).toBe('/images/mirror/items/blink.png');
  });

  it('proxies items that are not mirrored', () => {
    expect(getItemImageUrl('not_a_real_item')).toMatch(/^\/api\/asset-image\?url=/);
  });

  it('resolves mirrored heroes straight to static files', () => {
    // hero 1 (Anti-Mage) is in the mirrored hero set
    expect(getHeroImageUrl(1)).toBe('/images/mirror/heroes/1.png');
  });

  it('proxies heroes that are not mirrored', () => {
    expect(getHeroImageUrl(9999)).toMatch(/^\/api\/asset-image\?url=/);
  });

  it('toCnAssetUrl proxies supported steam asset urls', () => {
    expect(
      toCnAssetUrl('https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/blink.png')
    ).toMatch(/^\/api\/asset-image\?url=/);
  });
});
