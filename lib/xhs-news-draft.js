function trimTrailingPunctuation(text = '') {
  return String(text || '').replace(/[\s，。！？、；：,.!?;:]+$/g, '').trim();
}

function countHanChars(text = '') {
  const matches = String(text || '').match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
}

function normalizeIdentity(text = '') {
  return normalizeWhitespace(stripMarkdown(text))
    .replace(/[“”"'`]/g, '')
    .replace(/[，。！？、；：,.!?;:\-—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function stripMarkdown(text = '') {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeWhitespace(text = '') {
  return String(text)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function clipText(text = '', maxLen = 420) {
  const plain = normalizeWhitespace(stripMarkdown(text));
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen - 1).trim()}…`;
}

export function clipTextComplete(text = '', maxLen = 420) {
  const plain = normalizeWhitespace(stripMarkdown(text));
  if (plain.length <= maxLen) return plain;

  const slice = plain.slice(0, maxLen).trim();
  const breakpoints = ['\n\n', '。', '！', '？', '；', '\n', '，', '、', ' '];
  for (const breakpoint of breakpoints) {
    const idx = slice.lastIndexOf(breakpoint);
    if (idx >= Math.max(8, Math.floor(maxLen * 0.45))) {
      const candidate = trimTrailingPunctuation(slice.slice(0, idx));
      if (candidate) return candidate;
    }
  }

  return trimTrailingPunctuation(slice);
}

export function truncateTitle(text = '', maxHanChars = 20, maxTotalChars = 60) {
  const clean = normalizeWhitespace(text);
  if (!clean) return '';
  if (countHanChars(clean) <= maxHanChars && clean.length <= maxTotalChars) return clean;

  let han = 0;
  let total = 0;
  let slice = '';
  for (const ch of clean) {
    const nextHan = /[\u4e00-\u9fff]/.test(ch) ? han + 1 : han;
    const nextTotal = total + 1;
    if (nextHan > maxHanChars || nextTotal > maxTotalChars) break;
    slice += ch;
    han = nextHan;
    total = nextTotal;
  }
  if (!slice) return clean.slice(0, Math.min(clean.length, maxTotalChars));

  for (const bp of ['：', ':', '，', ',', '。', ' ']) {
    const idx = slice.lastIndexOf(bp);
    if (idx >= Math.floor(slice.length * 0.5)) {
      return trimTrailingPunctuation(slice.slice(0, idx));
    }
  }
  return trimTrailingPunctuation(slice);
}

export function sanitizeArticleBody(row) {
  const title = normalizeWhitespace(row.title_zh || row.title_en || '');
  let text = normalizeWhitespace(stripMarkdown(
    row.content_zh || row.content_markdown_zh || row.summary_zh || row.content_en || row.content_markdown_en || row.summary_en || ''
  ));
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^作者[:：]/.test(line))
    .filter((line) => !/^更新时间[:：]/.test(line))
    .filter((line) => !/^来源[:：]/.test(line))
    .filter((line) => !/^原文链接[:：]/.test(line))
    .filter((line) => !/^[-—]{3,}$/.test(line));

  if (title && lines[0] && normalizeWhitespace(lines[0]) === title) {
    lines.shift();
  }
  return normalizeWhitespace(lines.join('\n'));
}

function extractSentences(text = '') {
  return normalizeWhitespace(text)
    .replace(/\n+/g, ' ')
    .split(/(?<=[。！？!?])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function appendIfFits(parts, next, maxLen) {
  const candidate = parts.length ? `${parts.join('\n\n')}\n\n${next}` : next;
  if (candidate.length > maxLen) return false;
  parts.push(next);
  return true;
}

export function buildArticleDrivenTitle(row) {
  const base = normalizeWhitespace(row.title_zh || row.title_en || row.summary_zh || row.summary_en || 'DOTA2新闻');
  return truncateTitle(base, 20, 60);
}

export function buildArticleDrivenBody(row, options = {}) {
  const maxLen = Math.max(80, Number(options.maxLen) || 400);
  const articleBody = sanitizeArticleBody(row);
  const lead = clipTextComplete(normalizeWhitespace(row.summary_zh || row.summary_en || ''), Math.min(110, maxLen));

  if (!articleBody) return clipTextComplete(lead, maxLen);

  const parts = [];
  const seen = new Set();
  const titleIdentity = normalizeIdentity(row.title_zh || row.title_en || '');

  const tryAdd = (value) => {
    const normalized = clipTextComplete(normalizeWhitespace(value), maxLen);
    if (!normalized) return;
    const identity = normalizeIdentity(normalized);
    if (!identity || identity === titleIdentity || seen.has(identity)) return;
    if (!appendIfFits(parts, normalized, maxLen)) return;
    seen.add(identity);
  };

  tryAdd(lead);

  for (const sentence of extractSentences(articleBody)) {
    const normalizedSentence = clipTextComplete(sentence, Math.min(90, maxLen));
    if (!normalizedSentence) continue;
    const before = parts.length;
    tryAdd(normalizedSentence);
    if (parts.length === before) continue;
    if (parts.join('\n\n').length >= Math.floor(maxLen * 0.75)) break;
  }

  if (!parts.length) {
    return clipTextComplete(articleBody, maxLen);
  }

  return clipTextComplete(parts.join('\n\n'), maxLen);
}

export function inferTopic(row) {
  const sourceText = `${row.title_zh || ''}\n${row.title_en || ''}\n${row.summary_zh || ''}\n${row.summary_en || ''}\n${row.content_zh || ''}\n${row.content_en || ''}`;
  if (/PGL Wallachia/i.test(sourceText)) return 'PGL Wallachia';
  if (/Team Spirit/i.test(sourceText)) return 'Team Spirit';
  if (/DreamLeague/i.test(sourceText)) return 'DreamLeague';
  if (/Dota 2|DOTA2|刀塔/i.test(sourceText)) return 'DOTA2';
  return null;
}
