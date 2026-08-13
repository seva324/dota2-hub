import { describe, expect, it } from 'vitest';
import {
  parseDltvUpcomingMatchesMarkdown,
  parseDltvUpcomingMatchesPage,
  parseUtcDateTimeToUnixSeconds,
} from '../../../../lib/server/dltv-upcoming.js';

const fixture = `
  <div class="match upcoming" data-series-id="101" data-matches-odd="2026-04-14 01:30:00">
    <div class="match__head">
      <div class="match__head-event"><span>PGL Wallachia Season 7</span></div>
      <div class="match__head-format text-red">Upper Bracket</div>
      <div class="match__head-format">Bo5</div>
    </div>
    <div class="match__body-details">
      <div class="match__body-details__team">
        <div class="team__title"><span>Team Spirit</span></div>
      </div>
      <div class="match__body-details__team">
        <div class="team__title"><span>Team Falcons</span></div>
      </div>
    </div>
  </div>
  <div class="match upcoming" data-series-id="202" data-matches-odd="2026-04-23 01:30:00">
    <div class="match__head">
      <div class="match__head-event"><span>Too Far Away Cup</span></div>
      <div class="match__head-format text-red">Group Stage</div>
      <div class="match__head-format">Bo3</div>
    </div>
    <div class="match__body-details">
      <div class="match__body-details__team">
        <div class="team__title"><span>Team Liquid</span></div>
      </div>
      <div class="match__body-details__team">
        <div class="team__title"><span>Tundra Esports</span></div>
      </div>
    </div>
  </div>
  <div class="match upcoming" data-series-id="303" data-matches-odd="2026-04-14 02:30:00">
    <div class="match__head">
      <div class="match__head-event"><span>Duplicate Team Cup</span></div>
      <div class="match__head-format text-red">Showmatch</div>
      <div class="match__head-format">Bo1</div>
    </div>
    <div class="match__body-details">
      <div class="match__body-details__team">
        <div class="team__title"><span>PARIVISION</span></div>
      </div>
      <div class="match__body-details__team">
        <div class="team__title"><span>PARIVISION</span></div>
      </div>
    </div>
  </div>
`;

describe('parseDltvUpcomingMatchesPage', () => {
  it('parses upcoming DLTV matches and treats schedule timestamps as UTC', () => {
    const rows = parseDltvUpcomingMatchesPage(fixture, {
      now: parseUtcDateTimeToUnixSeconds('2026-04-14 00:00:00'),
      maxStartTime: parseUtcDateTimeToUnixSeconds('2026-04-21 00:00:00'),
    });

    expect(rows).toEqual([
      expect.objectContaining({
        seriesId: '101',
        radiantName: 'Team Spirit',
        direName: 'Team Falcons',
        tournament: 'PGL Wallachia Season 7',
        stage: 'Upper Bracket',
        bestOf: 'BO5',
        timestamp: parseUtcDateTimeToUnixSeconds('2026-04-14 01:30:00'),
      }),
    ]);
  });

  it('handles current DLTV match-card wrappers and attributes', () => {
    const realCardFixture = `
      <div class="match upcoming " data-matches-odd="2026-04-14 15:05:00" data-series-id="426139" date-matches-odd="104">
        <div class="match__head">
          <a href="https://dltv.org/events/european-pro-league-season-36"></a>
          <div class="match__head-event">
            <i class="match__head-event__star"></i>
            <span>European Pro League Season 36</span>
          </div>
          <div class="match__head-format red"><span>Upper Bracket R1</span></div>
          <div class="match__head-format"><span>bo3</span></div>
        </div>
        <div class="match__body">
          <div class="match__body-details">
            <div class="match__body-details__team">
              <div class="team__title"><span>Team Lynx</span></div>
            </div>
            <div class="match__body-details__team">
              <div class="team__title"><span>Modus</span></div>
            </div>
          </div>
        </div>
      </div>
    `;

    const rows = parseDltvUpcomingMatchesPage(realCardFixture, {
      now: parseUtcDateTimeToUnixSeconds('2026-04-14 15:00:00'),
      maxStartTime: parseUtcDateTimeToUnixSeconds('2026-04-15 00:00:00'),
    });

    expect(rows).toEqual([
      expect.objectContaining({
        seriesId: '426139',
        radiantName: 'Team Lynx',
        direName: 'Modus',
        tournament: 'European Pro League Season 36',
        eventUrl: 'https://dltv.org/events/european-pro-league-season-36',
        stage: 'Upper Bracket R1',
        bestOf: 'BO3',
        timestamp: parseUtcDateTimeToUnixSeconds('2026-04-14 15:05:00'),
      }),
    ]);
  });

  it('reuses the nearest event header when sibling cards omit head metadata', () => {
    const groupedFixture = `
      <div class="match upcoming " data-matches-odd="2026-04-18 07:00:00" data-series-id="426172">
        <div class="match__head">
          <a href="https://dltv.org/events/pgl-wallachia-season-8"></a>
          <div class="match__head-event"><span>PGL Wallachia Season 8</span></div>
          <div class="match__head-format red"><span>Group Stage</span></div>
          <div class="match__head-format"><span>bo3</span></div>
        </div>
        <div class="match__body-details">
          <div class="match__body-details__team"><div class="team__title"><span>Xtreme Gaming</span></div></div>
          <div class="match__body-details__team"><div class="team__title"><span>Natus Vincere</span></div></div>
        </div>
      </div>
      <div class="match upcoming " data-matches-odd="2026-04-18 08:00:00" data-series-id="426173">
        <div class="match__body">
          <div class="match__body-details">
            <a href="https://dltv.org/matches/426173/team-spirit-vs-vici-gaming-pgl-wallachia-season-8"></a>
            <div class="match__body-details__team"><div class="team__title"><span>Team Spirit</span></div></div>
            <div class="match__body-details__timer">
              <small data-moment="MMM DD">2026-04-18 08:00:00</small>
              <strong data-moment="HH:mm">2026-04-18 08:00:00</strong>
            </div>
            <div class="match__body-details__team"><div class="team__title"><span>Vici Gaming</span></div></div>
          </div>
        </div>
      </div>
    `;

    const rows = parseDltvUpcomingMatchesPage(groupedFixture, {
      now: parseUtcDateTimeToUnixSeconds('2026-04-18 00:00:00'),
      maxStartTime: parseUtcDateTimeToUnixSeconds('2026-04-19 00:00:00'),
    });

    expect(rows).toEqual([
      expect.objectContaining({
        seriesId: '426172',
        tournament: 'PGL Wallachia Season 8',
      }),
      expect.objectContaining({
        seriesId: '426173',
        radiantName: 'Team Spirit',
        direName: 'Vici Gaming',
        tournament: 'PGL Wallachia Season 8',
        eventUrl: 'https://dltv.org/events/pgl-wallachia-season-8',
        stage: 'Group Stage',
        bestOf: 'BO3',
        timestamp: parseUtcDateTimeToUnixSeconds('2026-04-18 08:00:00'),
      }),
    ]);
  });

  it('carries the event header across many consecutive cards (regression: 4 upcoming, only first has head metadata)', () => {
    const card = (seriesId, teams, opts = {}) => `
      <div class="match upcoming " data-matches-odd="${opts.time}" data-series-id="${seriesId}">
        ${opts.head ? `
        <div class="match__head">
          <a href="https://dltv.org/events/the-international-2026"></a>
          <div class="match__head-event"><span>The International 2026</span></div>
          <div class="match__head-format red"><span>Group Stage</span></div>
          <div class="match__head-format"><span>bo3</span></div>
        </div>` : ''}
        <div class="match__body">
          <div class="match__body-details">
            <a href="https://dltv.org/matches/${seriesId}/dummy"></a>
            <div class="match__body-details__team"><div class="team__title"><span>${teams[0]}</span></div></div>
            <div class="match__body-details__team"><div class="team__title"><span>${teams[1]}</span></div></div>
          </div>
        </div>
      </div>
    `;
    // 卡片间隔 2500 字符：第 3、4 场超出旧的 4000 字符回溯窗口，旧实现会丢这两场。
    const pad = '\n' + ' '.repeat(2500);
    const fixture = [
      card('501', ['Team Spirit', 'Aurora'], { time: '2026-08-14 02:00:00', head: true }),
      pad,
      card('502', ['Team Yandex', 'Team Liquid'], { time: '2026-08-14 02:00:00' }),
      pad,
      card('503', ['Xtreme Gaming', 'GamerLegion'], { time: '2026-08-14 02:00:00' }),
      pad,
      card('504', ['HULIGANI', 'Vici Gaming'], { time: '2026-08-14 02:00:00' }),
    ].join('');

    const rows = parseDltvUpcomingMatchesPage(fixture, {
      now: parseUtcDateTimeToUnixSeconds('2026-08-14 00:00:00'),
      maxStartTime: parseUtcDateTimeToUnixSeconds('2026-08-15 00:00:00'),
    });

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.seriesId)).toEqual(['501', '502', '503', '504']);
    for (const row of rows) {
      expect(row.tournament).toBe('The International 2026');
      expect(row.eventUrl).toBe('https://dltv.org/events/the-international-2026');
      expect(row.bestOf).toBe('BO3');
    }
  });

  it('parses Jina-rendered markdown match cards as a fallback source', () => {
    const markdownFixture = `
Title: Dota 2 Matches & livescore – DLTV

Markdown Content:
#### April 16 - Thursday[](http://dltv.org/matches)

[](https://dltv.org/events/european-pro-league-season-36)

European Pro League Season 36

Upper Bracket Final

bo3

[](https://dltv.org/matches/426144/team-lynx-vs-nemiga-gaming-european-pro-league-season-36)

Team Lynx

Apr 16**12:00**

Starts in:**06 : 30 : 21**

Nemiga Gaming

[](https://dltv.org/matches/426144/team-lynx-vs-nemiga-gaming-european-pro-league-season-36#lineups)Stats
`;

    const rows = parseDltvUpcomingMatchesMarkdown(markdownFixture, {
      now: parseUtcDateTimeToUnixSeconds('2026-04-16 05:00:00'),
      maxStartTime: parseUtcDateTimeToUnixSeconds('2026-04-17 00:00:00'),
    });

    expect(rows).toEqual([
      expect.objectContaining({
        seriesId: '426144',
        radiantName: 'Team Lynx',
        direName: 'Nemiga Gaming',
        tournament: 'European Pro League Season 36',
        eventUrl: 'https://dltv.org/events/european-pro-league-season-36',
        stage: 'Upper Bracket Final',
        bestOf: 'BO3',
        timestamp: parseUtcDateTimeToUnixSeconds('2026-04-16 12:00:00'),
      }),
    ]);

    expect(parseDltvUpcomingMatchesPage(markdownFixture, {
      now: parseUtcDateTimeToUnixSeconds('2026-04-16 05:00:00'),
      maxStartTime: parseUtcDateTimeToUnixSeconds('2026-04-17 00:00:00'),
    })).toEqual(rows);
  });
});
