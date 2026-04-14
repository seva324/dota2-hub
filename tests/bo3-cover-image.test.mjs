import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAndSortNews,
  normalizeBo3CoverImageUrl,
} from '../api/news.js';
import {
  getBo3ImageFetchCandidates,
  rewriteBo3ImageUrlsForClient,
  toChinaReachableBo3ImageUrl,
} from '../lib/server/bo3-images.js';

test('normalizeBo3CoverImageUrl routes BO3 files title images through the image proxy', () => {
  assert.equal(
    normalizeBo3CoverImageUrl('https://files.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp'),
    'https://image-proxy.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp.webp?w=960&h=480',
  );
});

test('normalizeBo3CoverImageUrl preserves proxied BO3 title images and fills dimensions', () => {
  assert.equal(
    normalizeBo3CoverImageUrl('https://image-proxy.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp.webp'),
    'https://image-proxy.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp.webp?w=960&h=480',
  );
});

test('normalizeAndSortNews normalizes BO3 article cover images before persistence', () => {
  const [item] = normalizeAndSortNews([
    {
      id: 'bo3-test',
      title: 'BO3 cover image test',
      summary: 'summary',
      content: 'content',
      source: 'BO3.gg',
      url: 'https://bo3.gg/dota2/news/test',
      imageUrl: 'https://files.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp',
      publishedAt: new Date('2026-04-14T00:00:00Z'),
    },
  ], { limit: null });

  assert.equal(
    item.image_url,
    'https://image-proxy.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp.webp?w=960&h=480',
  );
});

test('toChinaReachableBo3ImageUrl rewrites BO3 images to the same-origin image proxy', () => {
  assert.equal(
    toChinaReachableBo3ImageUrl('https://image-proxy.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp.webp?w=960&h=480'),
    '/api/bo3-image?url=https%3A%2F%2Fimage-proxy.bo3.gg%2Fuploads%2Fnews%2F471032%2Ftitle_image%2Fwebp-a1ad4563323fda40b1520cf8559625c2.webp.webp%3Fw%3D960%26h%3D480',
  );
});

test('toChinaReachableBo3ImageUrl can emit an absolute URL for Mini Program clients', () => {
  assert.equal(
    toChinaReachableBo3ImageUrl('https://files.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp', 'https://bo3.gg', {
      publicOrigin: 'https://dota.example.com/',
    }),
    'https://dota.example.com/api/bo3-image?url=https%3A%2F%2Ffiles.bo3.gg%2Fuploads%2Fnews%2F471032%2Ftitle_image%2Fwebp-a1ad4563323fda40b1520cf8559625c2.webp',
  );
});

test('getBo3ImageFetchCandidates falls back from BO3 image proxy to files origin', () => {
  assert.deepEqual(
    getBo3ImageFetchCandidates('https://image-proxy.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp.webp?w=960&h=480'),
    [
      'https://image-proxy.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp.webp?w=960&h=480',
      'https://files.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp',
    ],
  );
});

test('rewriteBo3ImageUrlsForClient proxies BO3 image URLs inside markdown', () => {
  assert.equal(
    rewriteBo3ImageUrlsForClient('![cover](https://files.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp)'),
    '![cover](/api/bo3-image?url=https%3A%2F%2Ffiles.bo3.gg%2Fuploads%2Fnews%2F471032%2Ftitle_image%2Fwebp-a1ad4563323fda40b1520cf8559625c2.webp)',
  );
});
