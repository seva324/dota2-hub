import { describe, expect, it } from 'vitest';

import { classifyNewsCategory } from '../../../../lib/server/news-category.js';

describe('classifyNewsCategory', () => {
  it('detects roster news', () => {
    expect(classifyNewsCategory({
      title_en: "Davai Lama to Replace SumaiL on Nigma Galaxy's Dota 2 Roster",
    })).toBe('roster');
  });

  it('detects roster from disband', () => {
    expect(classifyNewsCategory({
      title_en: 'Astini+5 Team with DM and SoNNeikO Disbanded',
    })).toBe('roster');
  });

  it('detects drama news', () => {
    expect(classifyNewsCategory({
      title_en: 'Nix accused Valve of destroying Dota 2',
    })).toBe('drama');
  });

  it('detects 322 as drama', () => {
    expect(classifyNewsCategory({
      title_en: 'Matthew Discusses the 322 Incident at Thunder Awaken',
    })).toBe('drama');
  });

  it('detects patch news', () => {
    expect(classifyNewsCategory({
      title_en: 'Dota 2 Releases Balance Patch 7.41a',
    })).toBe('patch');
  });

  it('detects patch from dark carnival event', () => {
    expect(classifyNewsCategory({
      title_en: 'Dark Carnival in Dota 2: new event with rooms, visual novel and interactive progression',
    })).toBe('patch');
  });

  it('detects esports news', () => {
    expect(classifyNewsCategory({
      title_en: 'Team Yandex defeat Team Spirit, Tundra beat Aurora in playoffs at ESL One Birmingham 2026',
    })).toBe('esports');
  });

  it('detects esports schedule', () => {
    expect(classifyNewsCategory({
      title_en: 'ESL One Birmingham 2026: Schedule, Standings, Results',
    })).toBe('esports');
  });

  it('detects takes news', () => {
    expect(classifyNewsCategory({
      title_en: 'Yatoro gave a candid assessment of Team Spirit preparation',
    })).toBe('takes');
  });

  it('detects takes tier list', () => {
    expect(classifyNewsCategory({
      title_en: 'RAMZES666 compiled a tier list of the best mid laners on the Dota 2 pro scene',
    })).toBe('takes');
  });

  it('falls back to community for skins', () => {
    expect(classifyNewsCategory({
      title_en: 'Largo will get a unique frog skin in the next treasure',
    })).toBe('community');
  });

  it('does not match roster for opinion about team', () => {
    expect(classifyNewsCategory({
      title_en: 'NS stood up for Larl, calling him the strongest link in Team Spirit',
    })).not.toBe('roster');
  });
});
