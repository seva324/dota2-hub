import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAndSortNews,
  normalizeBo3CoverImageUrl,
} from '../api/news.js';

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
