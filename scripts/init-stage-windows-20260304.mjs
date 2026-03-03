import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

function dayStart(dateStr) {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}

function dayEnd(dateStr) {
  return Math.floor(new Date(`${dateStr}T23:59:59Z`).getTime() / 1000);
}

const stageWindowsByLeague = {
  // BLAST Slam VI (Liquipedia format-based manual initialization)
  19099: [
    {
      key: 'group_stage',
      label: 'Group Stage',
      label_cn: '小组赛',
      kind: 'group',
      start: dayStart('2026-02-03'),
      end: dayEnd('2026-02-05'),
      priority: 10
    },
    {
      key: 'last_chance_playin',
      label: 'Last Chance / Play-In',
      label_cn: '最后机会赛 / 入围赛',
      kind: 'playin',
      start: dayStart('2026-02-06'),
      end: dayEnd('2026-02-08'),
      priority: 20
    },
    {
      key: 'playoffs',
      label: 'Playoffs',
      label_cn: '淘汰赛',
      kind: 'playoff',
      start: dayStart('2026-02-13'),
      end: dayEnd('2026-02-16'),
      priority: 30
    },
    {
      key: 'grand_final',
      label: 'Grand Final',
      label_cn: '总决赛',
      kind: 'final',
      start: dayStart('2026-02-16'),
      end: dayEnd('2026-02-16'),
      priority: 40
    }
  ],

  // DreamLeague Season 28
  19269: [
    {
      key: 'group_stage_1',
      label: 'Group Stage 1',
      label_cn: '小组赛第一阶段',
      kind: 'group',
      start: dayStart('2026-02-16'),
      end: dayEnd('2026-02-19'),
      priority: 10
    },
    {
      key: 'group_stage_2',
      label: 'Group Stage 2',
      label_cn: '小组赛第二阶段',
      kind: 'group',
      start: dayStart('2026-02-20'),
      end: dayEnd('2026-02-27'),
      priority: 20
    },
    {
      key: 'playoffs',
      label: 'Playoffs',
      label_cn: '淘汰赛',
      kind: 'playoff',
      start: dayStart('2026-02-28'),
      end: dayEnd('2026-03-02'),
      priority: 30
    },
    {
      key: 'grand_final',
      label: 'Grand Final',
      label_cn: '总决赛',
      kind: 'final',
      start: dayStart('2026-03-02'),
      end: dayEnd('2026-03-02'),
      priority: 40
    }
  ],

  // DreamLeague Season 27
  18988: [
    {
      key: 'group_stage',
      label: 'Group Stage',
      label_cn: '小组赛',
      kind: 'group',
      start: dayStart('2025-12-10'),
      end: dayEnd('2025-12-16'),
      priority: 10
    },
    {
      key: 'playoffs',
      label: 'Playoffs',
      label_cn: '淘汰赛',
      kind: 'playoff',
      start: dayStart('2025-12-17'),
      end: dayEnd('2025-12-20'),
      priority: 20
    },
    {
      key: 'grand_final',
      label: 'Grand Final',
      label_cn: '总决赛',
      kind: 'final',
      start: dayStart('2025-12-21'),
      end: dayEnd('2025-12-21'),
      priority: 30
    }
  ],

  // ESL Challenger China Season 1 (double-elimination rounds)
  19130: [
    {
      key: 'lower_bracket_round_1',
      label: 'Lower Bracket Round 1',
      label_cn: '败者组第一轮',
      kind: 'playoff',
      start: dayStart('2026-01-27'),
      end: dayEnd('2026-01-28'),
      priority: 10
    },
    {
      key: 'upper_bracket_semifinals',
      label: 'Upper Bracket Semifinals',
      label_cn: '胜者组半决赛',
      kind: 'playoff',
      start: dayStart('2026-01-29'),
      end: dayEnd('2026-01-30'),
      priority: 20
    },
    {
      key: 'lower_bracket_quarterfinals',
      label: 'Lower Bracket Quarterfinals',
      label_cn: '败者组四分之一决赛',
      kind: 'playoff',
      start: dayStart('2026-01-30'),
      end: dayEnd('2026-01-31'),
      priority: 30
    },
    {
      key: 'upper_bracket_final',
      label: 'Upper Bracket Final',
      label_cn: '胜者组决赛',
      kind: 'playoff',
      start: dayStart('2026-02-01'),
      end: dayEnd('2026-02-01'),
      priority: 40
    },
    {
      key: 'lower_bracket_semifinal',
      label: 'Lower Bracket Semifinal',
      label_cn: '败者组半决赛',
      kind: 'playoff',
      start: dayStart('2026-02-01'),
      end: dayEnd('2026-02-01'),
      priority: 50
    },
    {
      key: 'lower_bracket_final',
      label: 'Lower Bracket Final',
      label_cn: '败者组决赛',
      kind: 'playoff',
      start: dayStart('2026-02-02'),
      end: dayEnd('2026-02-02'),
      priority: 60
    },
    {
      key: 'grand_final',
      label: 'Grand Final',
      label_cn: '总决赛',
      kind: 'final',
      start: dayStart('2026-02-02'),
      end: dayEnd('2026-02-02'),
      priority: 70
    }
  ]
};

await sql.query('BEGIN');
try {
  await sql.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS stage_windows JSONB NOT NULL DEFAULT '[]'::jsonb`);

  for (const [leagueId, windows] of Object.entries(stageWindowsByLeague)) {
    await sql.query(
      `UPDATE tournaments
       SET stage_windows = $1::jsonb,
           updated_at = NOW()
       WHERE league_id = $2`,
      [JSON.stringify(windows), Number(leagueId)]
    );
  }

  await sql.query('COMMIT');

  const verify = await sql.query(`
    SELECT league_id, name, jsonb_array_length(stage_windows) AS stage_count
    FROM tournaments
    WHERE league_id IN (18988,19099,19130,19269)
    ORDER BY league_id
  `);

  console.log(JSON.stringify(verify, null, 2));
} catch (e) {
  await sql.query('ROLLBACK');
  throw e;
}
