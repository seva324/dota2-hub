export function mergeEnrichment(base, next) {
  return {
    account_id: base.account_id || next.account_id || null,
    name: next.name || base.name || null,
    name_cn: base.name_cn || next.name_cn || null,
    realname: base.realname || next.realname || null,
    team_name: base.team_name || next.team_name || null,
    country_code: base.country_code || next.country_code || null,
    avatar_url: base.avatar_url || next.avatar_url || null,
    birth_year: base.birth_year || next.birth_year || null,
    birth_month: base.birth_month || next.birth_month || null,
    source_urls: Array.from(new Set([...(base.source_urls || []), ...(next.source_urls || [])])),
  };
}
