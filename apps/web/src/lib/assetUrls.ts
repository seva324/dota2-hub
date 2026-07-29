import { toChinaReachableAssetUrl } from '../../../../lib/asset-image-proxy.js'
import { mirroredHeroIds } from './mirrored-heroes'

export function toCnAssetUrl(url?: string | null): string {
  return toChinaReachableAssetUrl(url || '') || String(url || '')
}

export function getHeroImageUrl(heroId: number, img?: string | null): string {
  // Prefer locally mirrored hero art: static file, no proxy round-trip.
  if (mirroredHeroIds.has(heroId)) {
    return `/images/mirror/heroes/${heroId}.png`
  }
  const raw = img
    ? `https://steamcdn-a.akamaihd.net/apps/dota2/images/heroes/${img}_lg.png`
    : `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${heroId}.png`
  return toCnAssetUrl(raw)
}
