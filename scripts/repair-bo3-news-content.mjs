import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const JINA_PROXY = 'https://r.jina.ai/http://';
const MAX_FETCH_ATTEMPTS = 4;

function parseArgs(argv) {
  const out = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const body = raw.slice(2);
    const i = body.indexOf('=');
    if (i === -1) {
      out[body] = true;
      continue;
    }
    out[body.slice(0, i)] = body.slice(i + 1);
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBody(row) {
  return String(row?.content_markdown_en || row?.content_en || '').trim();
}

function bodyHash(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  return createHash('sha1').update(normalized).digest('hex');
}

function countMarkdownH1(text = '') {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^#\s+\S/.test(line))
    .length;
}

function hasNavNoise(text = '') {
  const t = String(text || '');
  if (!t) return false;
  return (
    /CS2[\s\S]{0,160}Valorant[\s\S]{0,160}R6S[\s\S]{0,160}Dota 2/i.test(t) ||
    /Home[\s\S]{0,120}Matches[\s\S]{0,160}Schedule and Live/i.test(t) ||
    /\[\]\(\)\s*[\s\S]{0,80}\*\s*CS2/i.test(t)
  );
}

function hasTailNoise(text = '') {
  return /Additional content available|Go to Twitter bo3\.gg|By date|Cookies settings|Limited Time Offer|DINAH HOLDINGS LIMITED/i.test(String(text || ''));
}

function tokenizeEnglish(text = '') {
  const words = String(text || '').toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  const stop = new Set([
    'dota', 'news', 'with', 'from', 'this', 'that', 'have', 'will', 'were', 'been', 'into', 'after',
    'before', 'their', 'your', 'for', 'the', 'and', 'said', 'says', 'about', 'misses', 'season',
  ]);
  return Array.from(new Set(words.filter((w) => !stop.has(w))));
}

function countTitleTokenHits(title = '', body = '') {
  const titleTokens = tokenizeEnglish(title);
  if (titleTokens.length === 0) return { total: 0, hits: 0, tokens: [] };
  const haystack = String(body || '').toLowerCase().slice(0, 1800);
  const hits = titleTokens.filter((token) => haystack.includes(token)).length;
  return { total: titleTokens.length, hits, tokens: titleTokens };
}

function hasTitleBodyMismatch(title = '', body = '') {
  const t = String(title || '');
  const b = String(body || '');
  if (!t || !b) return false;

  const stat = countTitleTokenHits(t, b);
  if (stat.total >= 2 && stat.hits === 0) return true;
  if (stat.total >= 4 && stat.hits <= 1) return true;
  if (/Álvaro\s+"?Avo\+/.test(b) && !/(organizer|birmingham|avo\+)/i.test(t)) return true;
  return false;
}

function cleanJinaBoilerplate(content = '') {
  return String(content)
    .replace(/^Title:.*$/gim, '')
    .replace(/^URL Source:.*$/gim, '')
    .replace(/^Published Time:.*$/gim, '')
    .replace(/^Markdown Content:\s*$/gim, '')
    .trim();
}

function cutBeforeTail(text = '') {
  const markers = [
    /\nAdditional content available\b/i,
    /\nGo to Twitter bo3\.gg/i,
    /\n##### Comments\b/i,
    /\nCookies settings\b/i,
    /\nLimited Time Offer\b/i,
    /\nSource\b/i,
    /\nTAGS?\b/i,
  ];
  let out = String(text || '');
  for (const marker of markers) {
    const m = out.match(marker);
    if (m && typeof m.index === 'number') {
      out = out.slice(0, m.index).trim();
    }
  }
  return out.trim();
}

function normalizeMarkdown(text = '') {
  return String(text || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function markdownToText(text = '') {
  return String(text)
    .replace(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi, ' ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\s*#+\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitLines(markdown = '') {
  return String(markdown || '').split('\n');
}

function extractTopHeadings(lines = []) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '').trim();
    const m = line.match(/^#\s+(.+)$/);
    if (m) out.push({ index: i, text: m[1].trim() });
  }
  return out;
}

function normalizeByHeadingWindow(markdown = '', title = '') {
  const lines = splitLines(markdown);
  const headings = extractTopHeadings(lines);
  if (headings.length <= 1) return markdown;

  const score = (headingText) => {
    const stat = countTitleTokenHits(title, headingText);
    return stat.hits * 100 + headingText.length;
  };

  let best = headings[0];
  let bestScore = score(best.text);
  for (const h of headings.slice(1)) {
    const s = score(h.text);
    if (s > bestScore || (s === bestScore && h.index > best.index)) {
      best = h;
      bestScore = s;
    }
  }

  const next = headings.find((h) => h.index > best.index);
  const slice = lines.slice(best.index, next ? next.index : lines.length).join('\n').trim();
  return slice || markdown;
}

function extractFirstImage(markdown = '') {
  const m = String(markdown || '').match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
  if (!m?.[1]) return null;
  return m[1].replace(/&amp;/g, '&');
}

function collectDuplicateHashes(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const body = getBody(row);
    if (!body || body.length < 320) continue;
    const hash = bodyHash(body);
    if (!hash) continue;
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push(row.url);
  }
  const set = new Set();
  for (const [hash, urls] of groups.entries()) {
    if (urls.length > 1) set.add(hash);
  }
  return set;
}

function inspectRow(row, duplicateHashes = new Set()) {
  const reasons = [];
  const body = getBody(row);
  const merged = `${row?.summary_en || ''}\n${row?.content_en || ''}\n${body}`;

  if (/抓取失败|正文暂不可读/i.test(merged)) reasons.push('fallback_placeholder');
  if (!body || body.length < 140) reasons.push('too_short');
  if (hasNavNoise(body)) reasons.push('nav_noise');
  if (hasTailNoise(body)) reasons.push('tail_noise');
  if (countMarkdownH1(body) > 1) reasons.push('multiple_h1');
  if (hasTitleBodyMismatch(row?.title_en || '', body)) reasons.push('title_body_mismatch');
  const hash = bodyHash(body);
  if (hash && duplicateHashes.has(hash) && body.length >= 320 && hasTitleBodyMismatch(row?.title_en || '', body)) {
    reasons.push('duplicate_body_batch');
  }
  return reasons;
}

async function loadBo3ListMap() {
  const url = `${JINA_PROXY}bo3.gg/dota2/news`;
  const res = await fetch(url, { headers: { Accept: 'text/plain' } });
  if (!res.ok) return new Map();
  const text = await res.text();
  const map = new Map();
  const cardRegex = /\[!\[[^\]]*]\((https?:\/\/[^)\s]+)\)\s*([^\]]*)]\((https?:\/\/bo3\.gg\/dota2\/news\/[a-z0-9-]+)\)/gi;
  let m;
  while ((m = cardRegex.exec(text)) !== null) {
    const image = String(m[1] || '').replace(/&amp;/g, '&').trim();
    const label = String(m[2] || '').trim();
    const urlRaw = String(m[3] || '').replace(/^http:\/\//, 'https://').trim();
    if (!urlRaw) continue;
    map.set(urlRaw, { image: image || null, label });
  }
  return map;
}

function buildCandidateUrls(url) {
  const normalized = String(url || '').replace(/^http:\/\//, 'https://');
  const stamp = Date.now();
  return [
    normalized,
    `${normalized}?r=${stamp}`,
    `${normalized}?_=${stamp + 1}`,
    `${normalized}?utm_source=repair${stamp + 2}`,
  ];
}

async function fetchJinaCandidate(url, title) {
  const target = `${JINA_PROXY}${String(url).replace(/^https?:\/\//, '')}`;
  const res = await fetch(target, { headers: { Accept: 'text/plain' } });
  if (!res.ok) {
    return { ok: false, url, status: res.status, markdown: '', content: '', image: null, reasons: ['http_error'] };
  }
  const raw = await res.text();
  let markdown = normalizeMarkdown(cutBeforeTail(cleanJinaBoilerplate(raw)));
  markdown = normalizeByHeadingWindow(markdown, title);
  const image = extractFirstImage(markdown);
  const content = markdownToText(markdown);
  const reasons = [];
  if (!markdown || markdown.length < 140) reasons.push('too_short');
  if (hasNavNoise(markdown)) reasons.push('nav_noise');
  if (hasTailNoise(markdown)) reasons.push('tail_noise');
  if (countMarkdownH1(markdown) > 1) reasons.push('multiple_h1');
  if (hasTitleBodyMismatch(title, markdown)) reasons.push('title_body_mismatch');
  return { ok: true, url, status: res.status, markdown, content, image, reasons };
}

function scoreCandidate(candidate) {
  if (!candidate.ok) return -100000;
  const len = candidate.markdown.length;
  const penalty = candidate.reasons.length * 400;
  return len - penalty;
}

function buildFallbackBody(title = '', url = '') {
  const heading = title ? `# ${title}` : '# BO3.gg News';
  const markdown = `${heading}\n\nContent temporarily unavailable due source anti-bot protection.\n\nOpen original article: ${url}`.trim();
  return { markdown, content: markdownToText(markdown) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const recentDays = Number.isFinite(Number(args['recent-days'])) ? Math.max(1, Number(args['recent-days'])) : 14;
  const scanLimit = Number.isFinite(Number(args['scan-limit'])) ? Math.max(1, Number(args['scan-limit'])) : 300;
  const limit = Number.isFinite(Number(args.limit)) ? Math.max(1, Number(args.limit)) : 12;
  const delayMs = Number.isFinite(Number(args['delay-ms'])) ? Math.max(0, Number(args['delay-ms'])) : 500;
  const dryRun = Boolean(args['dry-run']);
  const requestedIds = args.ids
    ? new Set(String(args.ids).split(',').map((x) => x.trim()).filter(Boolean))
    : null;
  const fallbackOnFailure = !args['no-fallback'];

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    throw new Error('Missing DATABASE_URL/POSTGRES_URL');
  }

  const sql = neon(dbUrl);
  const cutoffSeconds = Math.floor(Date.now() / 1000) - recentDays * 86400;
  const rows = await sql`
    SELECT id, url, title_en, summary_en, content_en, content_markdown_en, image_url, published_at, updated_at
    FROM news_articles
    WHERE source = 'BO3.gg'
      AND published_at >= ${cutoffSeconds}
    ORDER BY published_at DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT ${scanLimit}
  `;

  const scopedRows = requestedIds ? rows.filter((row) => requestedIds.has(row.id)) : rows;
  const duplicateHashes = collectDuplicateHashes(scopedRows);
  const candidates = scopedRows
    .map((row) => ({ row, reasons: inspectRow(row, duplicateHashes) }))
    .filter((x) => x.reasons.length > 0);

  console.log(JSON.stringify({
    recentDays,
    cutoffSeconds,
    scanned: scopedRows.length,
    suspicious: candidates.length,
    dryRun,
    limit,
    fallbackOnFailure,
  }, null, 2));

  if (candidates.length > 0) {
    console.log(JSON.stringify({
      preview: candidates.slice(0, 30).map(({ row, reasons }) => ({
        id: row.id,
        url: row.url,
        reasons,
        bodyLen: getBody(row).length,
        updatedAt: row.updated_at,
      })),
    }, null, 2));
  }

  if (dryRun || candidates.length === 0) return;

  const listMap = await loadBo3ListMap();
  let fixed = 0;
  let fallbacked = 0;
  let unchanged = 0;

  for (const { row, reasons } of candidates.slice(0, limit)) {
    const baseTitle = String(row.title_en || '').trim();
    const url = String(row.url || '').trim();
    if (!url) continue;

    console.log(`[repair-bo3] start id=${row.id} reasons=${reasons.join(',')} url=${url}`);
    let best = null;
    const candidatesUrls = buildCandidateUrls(url).slice(0, MAX_FETCH_ATTEMPTS);
    for (const candidateUrl of candidatesUrls) {
      try {
        const fetched = await fetchJinaCandidate(candidateUrl, baseTitle);
        fetched.score = scoreCandidate(fetched);
        if (!best || fetched.score > best.score) best = fetched;
        const acceptable = fetched.ok && fetched.reasons.length === 0;
        console.log(`[repair-bo3] attempt url=${candidateUrl} status=${fetched.status} len=${fetched.markdown.length} reasons=${fetched.reasons.join(',') || 'none'}`);
        if (acceptable) break;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[repair-bo3] attempt error url=${candidateUrl} msg=${msg}`);
      }
      if (delayMs > 0) await sleep(Math.min(delayMs, 300));
    }

    const hint = listMap.get(url);
    const bestAcceptable = best?.ok && best.reasons.length === 0;
    if (bestAcceptable) {
      const summary = best.content.slice(0, 320) || row.summary_en || null;
      const image = best.image || hint?.image || row.image_url || null;
      const updated = await sql`
        UPDATE news_articles
        SET
          summary_en = ${summary},
          content_en = ${best.content},
          content_markdown_en = ${best.markdown},
          summary_zh = NULL,
          content_zh = NULL,
          content_markdown_zh = NULL,
          summary_zh_provider = NULL,
          content_zh_provider = NULL,
          translation_status = 'pending',
          translation_provider = NULL,
          translated_at = NULL,
          image_url = COALESCE(${image}, image_url),
          updated_at = NOW()
        WHERE id = ${row.id}
        RETURNING id, url
      `;
      if (updated.length > 0) fixed += 1;
      console.log(`[repair-bo3] fixed id=${row.id} mode=content_refresh`);
    } else if (fallbackOnFailure) {
      const fallback = buildFallbackBody(baseTitle, url);
      const image = hint?.image || row.image_url || null;
      const updated = await sql`
        UPDATE news_articles
        SET
          summary_en = ${`Source content unavailable for now. Open original URL: ${url}`.slice(0, 320)},
          content_en = ${fallback.content},
          content_markdown_en = ${fallback.markdown},
          summary_zh = NULL,
          content_zh = NULL,
          content_markdown_zh = NULL,
          summary_zh_provider = NULL,
          content_zh_provider = NULL,
          translation_status = 'pending',
          translation_provider = NULL,
          translated_at = NULL,
          image_url = COALESCE(${image}, image_url),
          updated_at = NOW()
        WHERE id = ${row.id}
        RETURNING id, url
      `;
      if (updated.length > 0) fallbacked += 1;
      console.warn(`[repair-bo3] fallback id=${row.id} reason=${best?.reasons?.join(',') || 'fetch_failed'}`);
    } else {
      unchanged += 1;
      console.warn(`[repair-bo3] unchanged id=${row.id}`);
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  const verifyRows = await sql`
    SELECT id, url, title_en, summary_en, content_en, content_markdown_en, updated_at
    FROM news_articles
    WHERE source = 'BO3.gg'
      AND published_at >= ${cutoffSeconds}
    ORDER BY updated_at DESC
    LIMIT ${scanLimit}
  `;
  const verifyDup = collectDuplicateHashes(verifyRows);
  const verifyBad = verifyRows
    .map((row) => ({ row, reasons: inspectRow(row, verifyDup) }))
    .filter((x) => x.reasons.length > 0);

  console.log(JSON.stringify({
    result: {
      fixed,
      fallbacked,
      unchanged,
      suspiciousAfter: verifyBad.length,
      suspiciousAfterPreview: verifyBad.slice(0, 20).map(({ row, reasons }) => ({
        id: row.id,
        reasons,
        bodyLen: getBody(row).length,
      })),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error('[repair-bo3] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
