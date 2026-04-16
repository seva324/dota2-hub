import { describe, expect, it } from 'vitest';
import {
  parseDltvEventPage,
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
