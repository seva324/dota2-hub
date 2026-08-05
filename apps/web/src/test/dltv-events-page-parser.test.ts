import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDltvEventsPageRaw } from '../../../../lib/server/dltv-events-page-parser.js';

function buildCardHtml({ title, href, live, startDate, endDate, dateAttr }) {
  const dateSpans = dateAttr === 'data-datetime-source'
    ? `<span data-datetime-source="${startDate}">Jul 30</span> - <span data-datetime-source="${endDate}">Aug 05</span>`
    : `<span data-moment="MMM DD">${startDate}</span> - <span data-moment="MMM DD">${endDate}</span>`;
  const liveTag = live ? '<div class="pic__tag"><strong>LIVE</strong></div>' : '';
  return `
    <a href="${href}" class="events__card-head">
      <div class="events__card-head__pic">
        <div class="pic" style="background-image: url('https://s3.dltv.org/uploads/events/big/x.png')">
          ${liveTag}
          ${dateSpans}
        </div>
      </div>
      <div class="events__card-head__info">
        <div class="info__col">
          <div class="info__col-item name">${title}</div>
          <div class="info__col-item"><div class="info__col-item__flag"></div><span>Europe</span></div>
          <div class="info__col-item prize"><span>Prize pool <strong>$1,000,000</strong></span></div>
        </div>
        <div class="info__col width-50 abs">
          <div class="info__col-item align-right">S-Tier Tier</div>
        </div>
      </div>
    </a>
  `;
}

describe('parseDltvEventsPageRaw status derivation (LIVE badge priority)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 已过 2026-08-05 00:00:00Z（两个赛事的结束日期），但仍在进行中。
    vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a LIVE card ongoing even when its listed end date is in the past (direct HTML)', () => {
    const raw = buildCardHtml({
      title: '1win Essence II',
      href: 'https://dltv.org/events/1win-essence-ii',
      live: true,
      startDate: '2026-07-30 00:00:00',
      endDate: '2026-08-05 00:00:00',
      dateAttr: 'data-moment',
    });

    const [entry] = parseDltvEventsPageRaw(raw, 'ongoing');
    expect(entry).toMatchObject({ title: '1win Essence II', live: true, status: 'ongoing' });
  });

  it('keeps a LIVE card ongoing with jina data-datetime-source attributes', () => {
    const raw = buildCardHtml({
      title: 'Games of the Future 2026',
      href: 'https://dltv.org/events/games-of-the-future-2026',
      live: true,
      startDate: '2026-07-31 00:00:00',
      endDate: '2026-08-05 00:00:00',
      dateAttr: 'data-datetime-source',
    });

    const [entry] = parseDltvEventsPageRaw(raw, 'ongoing');
    expect(entry).toMatchObject({ title: 'Games of the Future 2026', live: true, status: 'ongoing' });
  });

  it('still derives completed from past dates when there is no LIVE badge', () => {
    const raw = buildCardHtml({
      title: 'Past Cup',
      href: 'https://dltv.org/events/past-cup',
      live: false,
      startDate: '2026-07-01 00:00:00',
      endDate: '2026-08-05 00:00:00',
      dateAttr: 'data-moment',
    });

    const [entry] = parseDltvEventsPageRaw(raw, 'ongoing');
    expect(entry).toMatchObject({ title: 'Past Cup', live: false, status: 'completed' });
  });

  it('keeps a LIVE markdown snapshot entry ongoing', () => {
    const raw = `
Title: Events | DLTV

Markdown Content:
# Events

## 2026

[LIVE Jul 30 - Aug 05 1win Essence II Europe Prize pool $1,000,000 S-Tier Tier](https://dltv.org/events/1win-essence-ii)
[Aug 08 - Aug 12 DreamLeague 29 Europe Prize pool $1,250,000 S-Tier Tier](https://dltv.org/events/dreamleague-season-29)
`;

    const entries = parseDltvEventsPageRaw(raw, 'ongoing');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ title: '1win Essence II', live: true, status: 'ongoing' });
    expect(entries[1]).toMatchObject({ title: 'DreamLeague 29', live: false, status: 'upcoming' });
  });
});
