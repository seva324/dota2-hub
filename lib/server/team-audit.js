import { neon } from '@neondatabase/serverless';

export function buildDbUrlWithAppName(databaseUrl, appName) {
  if (!databaseUrl) return databaseUrl;

  try {
    const url = new URL(databaseUrl);
    if (appName) {
      url.searchParams.set('application_name', appName);
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

export async function ensureTeamAuditLog(db) {
  if (!db) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS teams_audit_log (
      id BIGSERIAL PRIMARY KEY,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      action VARCHAR(10) NOT NULL,
      team_id BIGINT,
      source TEXT,
      application_name TEXT,
      db_user TEXT,
      txid BIGINT,
      query_text TEXT,
      old_row JSONB,
      new_row JSONB
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_teams_audit_changed_at
    ON teams_audit_log(changed_at DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_teams_audit_team_id
    ON teams_audit_log(team_id, changed_at DESC)
  `);

  await db.query(`
    CREATE OR REPLACE FUNCTION protect_teams_name()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_next_name TEXT;
      v_old_name TEXT;
    BEGIN
      v_next_name := NULLIF(BTRIM(COALESCE(NEW.name, '')), '');

      IF TG_OP <> 'UPDATE' THEN
        NEW.name := v_next_name;
        RETURN NEW;
      END IF;

      v_old_name := NULLIF(BTRIM(COALESCE(OLD.name, '')), '');
      IF v_old_name IS NULL THEN
        NEW.name := v_next_name;
      ELSE
        NEW.name := v_old_name;
      END IF;

      RETURN NEW;
    END;
    $$;
  `);

  await db.query(`
    DROP TRIGGER IF EXISTS trg_teams_name_guard ON teams
  `);

  await db.query(`
    CREATE TRIGGER trg_teams_name_guard
    BEFORE INSERT OR UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION protect_teams_name()
  `);

  await db.query(`
    CREATE OR REPLACE FUNCTION log_teams_changes()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_query TEXT;
      v_app TEXT;
    BEGIN
      SELECT application_name, query
      INTO v_app, v_query
      FROM pg_stat_activity
      WHERE pid = pg_backend_pid();

      IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN
        RETURN NEW;
      END IF;

      INSERT INTO teams_audit_log (
        action,
        team_id,
        source,
        application_name,
        db_user,
        txid,
        query_text,
        old_row,
        new_row
      ) VALUES (
        TG_OP,
        COALESCE(NEW.team_id, OLD.team_id),
        COALESCE(NULLIF(v_app, ''), 'unknown'),
        NULLIF(v_app, ''),
        CURRENT_USER,
        txid_current(),
        v_query,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );

      RETURN COALESCE(NEW, OLD);
    END;
    $$;
  `);

  await db.query(`
    DROP TRIGGER IF EXISTS trg_teams_audit_log ON teams
  `);

  await db.query(`
    CREATE TRIGGER trg_teams_audit_log
    AFTER INSERT OR UPDATE OR DELETE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION log_teams_changes()
  `);
}

export function createDbWithAppName(databaseUrl, appName) {
  return neon(buildDbUrlWithAppName(databaseUrl, appName));
}
