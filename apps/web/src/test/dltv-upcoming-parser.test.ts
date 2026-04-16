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
