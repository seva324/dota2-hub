#!/usr/bin/env node

function parseArgs(argv) {
  const result = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const body = raw.slice(2);
    const eqIndex = body.indexOf('=');
    if (eqIndex === -1) {
      result[body] = true;
      continue;
    }
    result[body.slice(0, eqIndex)] = body.slice(eqIndex + 1);
  }
  return result;
}

function pickPositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseDate(value) {
  if (!value) return null;
  const ts = Date.parse(String(value));
  if (!Number.isFinite(ts)) return null;
  return new Date(ts);
}

function pickBranchName(branch) {
  return (
    branch?.name ||
    branch?.branch_name ||
    branch?.branch?.name ||
    ''
  ).trim();
}

function pickBranchId(branch) {
  return String(
    branch?.id ||
    branch?.branch_id ||
    branch?.branch?.id ||
    ''
  ).trim();
}

function pickBranchCreatedAt(branch) {
  return parseDate(
    branch?.created_at ||
    branch?.creation_time ||
    branch?.createdAt ||
    branch?.branch?.created_at
  );
}

function pickBranchUpdatedAt(branch) {
  return parseDate(
    branch?.updated_at ||
    branch?.last_updated_at ||
    branch?.last_active_at ||
    branch?.updatedAt ||
    branch?.branch?.updated_at
  );
}

function isProtectedBranch(branch, protectedNameSet) {
  const name = pickBranchName(branch).toLowerCase();
  if (protectedNameSet.has(name)) return true;
  return Boolean(
    branch?.primary ||
    branch?.default ||
    branch?.is_default ||
    branch?.is_protected
  );
}

async function fetchBranches(projectId, apiKey) {
  const url = `https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}/branches`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload?.message || payload?.error || text.slice(0, 300);
    throw new Error(`Neon API ${response.status}: ${detail}`);
  }
  const branches = payload?.branches || payload?.data?.branches || [];
  if (!Array.isArray(branches)) {
    throw new Error('Neon API 返回结构不包含 branches 数组');
  }
  return branches;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = String(args.project || process.env.NEON_PROJECT_ID || '').trim();
  const apiKey = String(args.token || process.env.NEON_API_KEY || '').trim();
  if (!projectId) {
    throw new Error('Missing project id: --project=<id> or NEON_PROJECT_ID');
  }
  if (!apiKey) {
    throw new Error('Missing API key: --token=<key> or NEON_API_KEY');
  }

  const includedBranches = Math.max(0, Math.trunc(pickPositiveNumber(args.included || process.env.NEON_INCLUDED_BRANCHES, 10)));
  const maxIdleHours = pickPositiveNumber(args['max-idle-hours'], 72);
  const branchHourRate = pickPositiveNumber(args['branch-hour-rate'], 0.002016096);
  const protectedNames = String(args.protect || process.env.NEON_PROTECTED_BRANCHES || 'main,production,prod,development,dev')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const protectedNameSet = new Set(protectedNames);

  const now = Date.now();
  const branches = await fetchBranches(projectId, apiKey);
  const enriched = branches.map((branch) => {
    const createdAt = pickBranchCreatedAt(branch);
    const updatedAt = pickBranchUpdatedAt(branch);
    const idleHours = updatedAt ? (now - updatedAt.getTime()) / (1000 * 60 * 60) : null;
    return {
      id: pickBranchId(branch),
      name: pickBranchName(branch),
      protected: isProtectedBranch(branch, protectedNameSet),
      createdAt: createdAt ? createdAt.toISOString() : null,
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
      idleHours: Number.isFinite(idleHours) ? Number(idleHours.toFixed(1)) : null,
    };
  });

  const candidates = enriched
    .filter((item) => !item.protected && item.idleHours !== null && item.idleHours >= maxIdleHours)
    .sort((a, b) => (b.idleHours || 0) - (a.idleHours || 0));
  const totalBranches = enriched.length;
  const extraBranchesNow = Math.max(0, totalBranches - includedBranches);
  const estMonthlyExtraCost = Number((extraBranchesNow * 24 * 30 * branchHourRate).toFixed(2));

  const result = {
    projectId,
    totalBranches,
    includedBranches,
    extraBranchesNow,
    maxIdleHours,
    estimatedMonthlyExtraBranchCostUsd: estMonthlyExtraCost,
    staleCandidates: candidates,
    protectedNames,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
