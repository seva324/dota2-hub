import { beforeEach, describe, expect, it } from 'vitest';
import { getPublicOrigin } from '../../../../lib/server/public-origin.js';

describe('getPublicOrigin', () => {
  beforeEach(() => {
    delete process.env.PUBLIC_SITE_ORIGIN;
    delete process.env.VITE_PUBLIC_SITE_ORIGIN;
    delete process.env.SITE_URL;
  });

  it('falls back to dotahub.cn for EdgeOne internal function hosts', () => {
    expect(getPublicOrigin({
      headers: {
        host: 'pages-pro-12-2e9b.pages-scf-gz-pro.qcloudteo.com',
      },
    })).toBe('https://dotahub.cn');
  });

  it('prefers public forwarded hosts over platform internals', () => {
    expect(getPublicOrigin({
      headers: {
        host: 'pages-pro-12-2e9b.pages-scf-gz-pro.qcloudteo.com',
        'x-forwarded-host': 'dotahub.cn',
        'x-forwarded-proto': 'https',
      },
    })).toBe('https://dotahub.cn');
  });

  it('lets explicit public origin configuration win', () => {
    process.env.PUBLIC_SITE_ORIGIN = 'https://preview.dotahub.cn/';
    expect(getPublicOrigin({
      headers: {
        host: 'pages-pro-12-2e9b.pages-scf-gz-pro.qcloudteo.com',
      },
    })).toBe('https://preview.dotahub.cn');
  });
});
