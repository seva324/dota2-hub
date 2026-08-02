import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDltvRanking } from '../../../../lib/server/dltv-ranking-parser.js';

const FIXTURE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'dltv-ranking.html');
const fixtureHtml = fs.readFileSync(FIXTURE_PATH, 'utf8');

describe('parseDltvRanking', () => {
  it('parses every team with rank, name and logo', () => {
    const teams = parseDltvRanking(fixtureHtml);
    expect(teams).toHaveLength(3);
    expect(teams.map((t) => t.rank)).toEqual([1, 2, 3]);
    expect(teams[0].name).toBe('PARIVISION');
    expect(teams[0].logo).toMatch(/^https:\/\/dltv\.org\/uploads\/teams\//);
    expect(teams[0].teamUrl).toMatch(/^https:\/\/dltv\.org\/teams\//);
  });

  it('parses 5 players per team with photo, solo rank, country and url', () => {
    const teams = parseDltvRanking(fixtureHtml);
    const [first] = teams;
    expect(first.players).toHaveLength(5);
    const [p] = first.players;
    expect(p.name).toBe('Satanic');
    expect(p.photo).toMatch(/^https:\/\/dltv\.org\/uploads\/players\/medium\//);
    expect(p.soloRank).toBe(5);
    expect(p.country).toBe('ru');
    expect(p.playerUrl).toMatch(/^https:\/\/dltv\.org\/players\//);
  });

  it('sorts teams by rank ascending regardless of page order', () => {
    const shuffled = fixtureHtml.replace(/ranking__list-case__item active/, 'ranking__list-case__item');
    const teams = parseDltvRanking(shuffled);
    expect(teams.map((t) => t.rank)).toEqual([1, 2, 3]);
  });

  it('returns empty array for non-ranking HTML', () => {
    expect(parseDltvRanking('<html><body>no ranking here</body></html>')).toEqual([]);
    expect(parseDltvRanking('')).toEqual([]);
  });

  it('decodes HTML entities in player names', () => {
    const teams = parseDltvRanking(fixtureHtml);
    const names = teams.flatMap((t) => t.players.map((p) => p.name));
    expect(names).toContain('No[o]ne-');
    expect(names.some((n) => n.includes('&'))).toBe(false);
  });
});
