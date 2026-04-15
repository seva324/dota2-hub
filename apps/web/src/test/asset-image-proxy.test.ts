import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getAssetImageFetchCandidates,
  toChinaReachableAssetUrl,
} from '../../../../lib/asset-image-proxy.js'
import assetImageHandler from '../../../../lib/api-handlers/asset-image.js'
import { getHeroImageUrl, toCnAssetUrl } from '../lib/assetUrls'

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: new Map<string, string>(),
    setHeader(name: string, value: string) {
      this.headers.set(name, value)
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
    send(payload: unknown) {
      this.body = payload
      return this
    },
    end() {
      return this
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('asset image proxy helpers', () => {
  it('rewrites DLTV player avatars to the same-origin asset proxy', () => {
    expect(
      toChinaReachableAssetUrl('https://s3.dltv.org/uploads/players/5oQ0XCp7aqrvWr0yzeoL7bb5M5FvFe5H.png')
    ).toBe('/api/asset-image?url=https%3A%2F%2Fs3.dltv.org%2Fuploads%2Fplayers%2F5oQ0XCp7aqrvWr0yzeoL7bb5M5FvFe5H.png')
  })

  it('rewrites Steam item images to a public-origin asset proxy URL', () => {
    expect(
      toChinaReachableAssetUrl('https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/aegis.png', {
        publicOrigin: 'https://dotahub.cn/',
      })
    ).toBe('https://dotahub.cn/api/asset-image?url=https%3A%2F%2Fcdn.cloudflare.steamstatic.com%2Fapps%2Fdota2%2Fimages%2Fdota_react%2Fitems%2Faegis.png')
  })

  it('adds the akamai Steam fallback candidate for proxied Steam assets', () => {
    expect(
      getAssetImageFetchCandidates('https://steamcdn-a.akamaihd.net/apps/dota2/images/heroes/antimage_lg.png')
    ).toEqual([
      'https://cdn.steamstatic.com/apps/dota2/images/heroes/antimage_lg.png',
      'https://steamcdn-a.akamaihd.net/apps/dota2/images/heroes/antimage_lg.png',
    ])
  })

  it('canonicalizes DLTV assets to dltv.org and keeps an s3 fallback candidate', () => {
    expect(
      getAssetImageFetchCandidates('https://s3.dltv.org/uploads/teams/g0qIsTyso5cQylIY7xnnCgQEi05uvITy.png.webp')
    ).toEqual([
      'https://dltv.org/uploads/teams/g0qIsTyso5cQylIY7xnnCgQEi05uvITy.png.webp',
      'https://s3.dltv.org/uploads/teams/g0qIsTyso5cQylIY7xnnCgQEi05uvITy.png.webp',
    ])
  })

  it('rejects non-default ports and svg assets from the generic proxy allowlist', () => {
    expect(toChinaReachableAssetUrl('https://cdn.steamstatic.com:8443/team-a.png')).toBeNull()
    expect(toChinaReachableAssetUrl('https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/blink.svg')).toBeNull()
  })

  it('rewrites browser-consumed hero and item assets through the same helper', () => {
    expect(getHeroImageUrl(1, 'antimage')).toBe('/api/asset-image?url=https%3A%2F%2Fcdn.steamstatic.com%2Fapps%2Fdota2%2Fimages%2Fheroes%2Fantimage_lg.png')
    expect(toCnAssetUrl('https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/blink.png')).toBe('/api/asset-image?url=https%3A%2F%2Fcdn.cloudflare.steamstatic.com%2Fapps%2Fdota2%2Fimages%2Fdota_react%2Fitems%2Fblink.png')
  })

  it('uses upstream HEAD requests without downloading image bodies', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(1))
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      headers: {
        get(name: string) {
          const values: Record<string, string> = {
            'content-type': 'image/png',
            'content-length': '128',
          }
          return values[name.toLowerCase()] ?? null
        },
      },
      arrayBuffer,
    }))

    vi.stubGlobal('fetch', fetchMock)

    const res = createResponse()
    await assetImageHandler(
      {
        method: 'HEAD',
        query: {
          url: 'https://cdn.steamstatic.com/apps/dota2/images/heroes/antimage_lg.png',
        },
      },
      res
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.steamstatic.com/apps/dota2/images/heroes/antimage_lg.png',
      expect.objectContaining({ method: 'HEAD' })
    )
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })
})
