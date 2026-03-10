import { describe, expect, it, vi } from 'vitest';
import { ensureProPlayerAuditLog } from '../../lib/server/pro-player-audit.js';
import { ensureTeamAuditLog } from '../../lib/server/team-audit.js';

describe('database name guards', () => {
  it('installs the pro_players name guard trigger', async () => {
    const query = vi.fn().mockResolvedValue([]);

    await ensureProPlayerAuditLog({ query } as never);

    const sql = query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION protect_pro_players_name()');
    expect(sql).toContain('CREATE TRIGGER trg_pro_players_name_guard');
    expect(sql).toContain('name_source:enrich-pro-players');
  });

  it('installs the teams name guard trigger', async () => {
    const query = vi.fn().mockResolvedValue([]);

    await ensureTeamAuditLog({ query } as never);

    const sql = query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION protect_teams_name()');
    expect(sql).toContain('CREATE TRIGGER trg_teams_name_guard');
  });
});
