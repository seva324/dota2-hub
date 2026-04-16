import { describe, expect, it } from 'vitest';
import {
  parseDltvEventPage,
  parseDltvEventsListPage,
  scoreTournamentNameMatch,
} from '../../../../lib/server/dltv-events.js';

describe('parseDltvEventPage', () => {
  it('parses main-event metadata and qualifier grouping links', () => {
    const raw = `
      <html>
        <head>
          <title>Blast Slam 7 overview | DLTV</title>
          <meta name="description" content="Complete overview of Blast Slam 7 which will take place from May 26, 2026 to Jun. 07, 2026, a $1,000,000 Dota 2 tournament.">
          <meta property="og:image" content="https://dltv.org/images/opengraph.png">
        </head>
        <body>
          <h1>BLAST SLAM 7</h1>
          <div class="event__hero" style="background-image: url('https://s3.dltv.org/uploads/events/big/blast-main.png')"></div>
          <div>UPCOMING</div>
          <div>DATES</div>
          <div>MAY 26 - JUN 07, 2026</div>
          <div>COUNTRY</div>
          <div>DENMARK</div>
          <div>EVENT TIER</div>
          <div>A-TIER</div>
          <div>EVENT TYPE</div>
          <div>OFFLINE</div>
          <div>PRIZE POOL</div>
          <div>$1,000,000</div>
          <a href="https://dltv.org/events/blast-slam-7/blast-slam-vii-china-closed-qualifier">BLAST Slam 7: China Closed Qualifier</a>
          <a href="https://dltv.org/events/blast-slam-7/blast-slam-vii-southeast-asia-closed-qualifier">BLAST Slam 7: Southeast Asia Closed Qualifier</a>
        </body>
      </html>
    `;

    expect(parseDltvEventPage(raw, 'https://dltv.org/events/blast-slam-7')).toEqual(
      expect.objectContaining({
        title: 'Blast Slam 7',
        status: 'upcoming',
        tier: 'A',
        location: 'DENMARK',
        locationFlagUrl: 'https://flagcdn.com/w40/dk.png',
        prizePool: '$1,000,000',
        prizePoolUsd: 1000000,
        image: 'https://s3.dltv.org/uploads/events/big/blast-main.png',
        eventSlug: 'blast-slam-7',
        parentSlug: 'blast-slam-7',
        eventGroupSlug: 'blast-slam-7',
        relatedEventLinks: expect.arrayContaining([
          'https://dltv.org/events/blast-slam-7/blast-slam-vii-southeast-asia-closed-qualifier',
        ]),
      })
    );
  });

  it('parses qualifier metadata and resolves the parent main event', () => {
    const raw = `
      <html>
        <head>
          <title>BLAST Slam 7: Southeast Asia Closed Qualifier overview | DLTV</title>
          <meta name="description" content="Complete overview of BLAST Slam 7: Southeast Asia Closed Qualifier held from Apr. 02, 2026 to Apr. 03, 2026, a Dota 2 tournament.">
        </head>
        <body>
          <h1>BLAST SLAM 7: SOUTHEAST ASIA CLOSED QUALIFIER</h1>
          <a href="https://dltv.org/events/blast-slam-7">MAIN EVENT</a>
          <a href="https://dltv.org/events/blast-slam-7/blast-slam-vii-europe-closed-qualifier">BLAST Slam 7: Europe Closed Qualifier</a>
          <div>FINISHED</div>
          <div>DATES</div>
          <div>APR 02 - APR 03, 2026</div>
          <div>COUNTRY</div>
          <div>SEA</div>
          <div>EVENT TIER</div>
          <div>A-QUAL TIER</div>
          <div>EVENT TYPE</div>
          <div>ONLINE</div>
        </body>
      </html>
    `;

    expect(parseDltvEventPage(
      raw,
      'https://dltv.org/events/blast-slam-7/blast-slam-vii-southeast-asia-closed-qualifier'
    )).toEqual(expect.objectContaining({
      title: 'BLAST Slam 7: Southeast Asia Closed Qualifier',
      status: 'finished',
      tier: 'A-QUAL',
      location: 'SEA',
      locationFlagUrl: null,
      eventSlug: 'blast-slam-vii-southeast-asia-closed-qualifier',
      parentSlug: 'blast-slam-7',
      eventGroupSlug: 'blast-slam-7',
      parentSourceUrl: 'https://dltv.org/events/blast-slam-7',
    }));
  });

  it('parses Jina-rendered markdown event pages without confusing nav labels for metadata', () => {
    const raw = `
Title: CCT Season 2: South America Series 4 overview | DLTV

Markdown Content:
# CCT Season 2: South America Series 4 overview | DLTV

Country

Type

Tier

# CCT Season 2: South America Series 4

Apr 09 - Apr 17 2026

live

Dates

Apr 09 - Apr 17, 2026

Country

South America

Event tier

C-Tier

Event type

Online

Prize pool

$20,000
`;

    expect(parseDltvEventPage(raw, 'https://dltv.org/events/cct-season-2-south-america-series-4')).toEqual(
      expect.objectContaining({
        title: 'CCT Season 2: South America Series 4',
        status: 'ongoing',
        tier: 'C',
        location: 'South America',
        prizePool: '$20,000',
        prizePoolUsd: 20000,
        eventSlug: 'cct-season-2-south-america-series-4',
      })
    );
  });
});

describe('scoreTournamentNameMatch', () => {
  it('prefers matching qualifier aliases with roman numerals and region synonyms normalized', () => {
    const score = scoreTournamentNameMatch(
      'BLAST Slam 7: Southeast Asia Closed Qualifier',
      'RES Unchained - A Blast Dota Slam VII Qualifier SEA'
    );

    expect(score.score).toBeGreaterThanOrEqual(12);
    expect(score.detailOverlap).toBeGreaterThanOrEqual(4);
    expect(score.groupOverlap).toBeGreaterThanOrEqual(3);
  });
});

describe('parseDltvEventsListPage', () => {
  it('parses featured cards and qualifier rows from the DLTV events index', () => {
    const raw = `
      <html>
        <body>
          <div class="events__card">
            <a href="https://dltv.org/events/dreamleague-season-29" class="events__card-head">
              <div class="events__card-head__pic">
                <div class="pic" style="background-image: url('https://s3.dltv.org/uploads/events/dreamleague-main.png')">
                  <div class="pic__tag">
                    <span data-datetime-source="2026-05-13 00:00:00">May 12</span>
                    -
                    <span data-datetime-source="2026-05-24 00:00:00">May 23</span>
                  </div>
                </div>
              </div>
              <div class="events__card-head__info">
                <div class="info__col">
                  <div class="info__col-item name">DreamLeague 29</div>
                  <div class="info__col-item">
                    <div class="info__col-item__flag"></div>
                    <span>Europe</span>
                  </div>
                  <div class="info__col-item prize">
                    <span>Prize pool <strong>$1,000,000</strong></span>
                  </div>
                </div>
                <div class="info__col width-50 abs">
                  <div class="info__col-item align-right">A-Tier Tier</div>
                  <div class="info__col-item align-right">8 participants</div>
                </div>
              </div>
            </a>
          </div>
          <a href="https://dltv.org/events/blast-slam-7/blast-slam-vii-southeast-asia-closed-qualifier" class="table__body-row">
            <div class="table__body-row__cell width-10 width-m-20">
              <div class="cell__num">
                <span data-datetime-source="2026-04-02 00:00:00">Apr 01</span>
                -
                <span data-datetime-source="2026-04-04 00:00:00">Apr 03</span>
              </div>
            </div>
            <div class="table__body-row__cell width-28 width-m-80">
              <div class="cell__logo" style="background-image: url('https://s3.dltv.org/uploads/events/small/blast-sea.png')"></div>
              <div class="cell__name">BLAST Slam 7: Southeast Asia Closed Qualifier</div>
            </div>
            <div class="table__body-row__cell width-10 mobile-none"><div class="cell__text">SEA</div></div>
            <div class="table__body-row__cell center width-10 mobile-none"><div class="cell__text">Online</div></div>
            <div class="table__body-row__cell center width-10 mobile-none"><div class="cell__text">A-Qual Tier</div></div>
            <div class="table__body-row__cell center width-10 mobile-none"><div class="cell__text">$0</div></div>
          </a>
        </body>
      </html>
    `;

    expect(parseDltvEventsListPage(raw)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceUrl: 'https://dltv.org/events/dreamleague-season-29',
        title: 'DreamLeague 29',
        eventSlug: 'dreamleague-season-29',
        eventGroupSlug: 'dreamleague-season-29',
        location: 'Europe',
        prizePool: '$1,000,000',
        tier: 'A',
        image: 'https://s3.dltv.org/uploads/events/dreamleague-main.png',
      }),
      expect.objectContaining({
        sourceUrl: 'https://dltv.org/events/blast-slam-7/blast-slam-vii-southeast-asia-closed-qualifier',
        title: 'BLAST Slam 7: Southeast Asia Closed Qualifier',
        eventSlug: 'blast-slam-vii-southeast-asia-closed-qualifier',
        eventGroupSlug: 'blast-slam-7',
        location: 'SEA',
        prizePool: '$0',
        tier: 'A-QUAL',
        image: 'https://s3.dltv.org/uploads/events/small/blast-sea.png',
      }),
    ]));
  });
});
