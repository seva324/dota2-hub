/**
 * Steam announcement content helpers for the Dota 2 official news source.
 *
 * dota2.com/news is backed by Steam partner events. The events API returns
 * announcement bodies in Steam BBCode; the steamcommunity announcement page
 * embeds a localized (per ?l=) JSON blob with headline + body.
 */

const CLAN_CDN_ASSET_URL = 'https://clan.fastly.steamstatic.com/';

const CDN_TOKENS = {
  '{STEAM_CLAN_IMAGE}': `${CLAN_CDN_ASSET_URL}images/`,
  '{STEAM_CLAN_LOC_IMAGE}': `${CLAN_CDN_ASSET_URL}images/`,
  '{MEDIA_CDN_URL}': 'https://media.steampowered.com/',
  '{COMMUNITY_CDN_URL}': 'https://community.akamai.steamstatic.com/',
  '{STORE_CDN_URL}': 'https://cdn.cloudflare.steamstatic.com/steam/',
  '{IMG_URL}': 'https://media.steampowered.com/',
  '{STEAM_APP_IMAGE}': 'https://cdn.akamai.steamstatic.com/steam/apps/',
  '{VIDEO_CDN_URL}': 'https://video.akamai.steamstatic.com/',
  '{BASE_URL_SHARED_CDN}': 'https://shared.steamstatic.com/',
};

export function resolveSteamCdnTokens(text = '') {
  let out = String(text || '');
  for (const [token, base] of Object.entries(CDN_TOKENS)) {
    if (out.includes(token)) out = out.split(token).join(base);
  }
  // Collapse path double-slashes without touching URL schemes (https://).
  return out.replace(/([^:])\/\/+/g, '$1/');
}

const HTML_ENTITIES = {
  quot: '"', amp: '&', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', bull: '•',
  times: '×', divide: '÷', minus: '−',
};

// Single-pass HTML entity decoder (does not re-decode output).
export function unescapeHtmlEntities(value = '') {
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);?/gi, (match, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1] === 'x' || entity[1] === 'X';
      const code = hex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

// Reads a JSON string value for `key` starting at `startIdx` (points at `"key"`),
// handling \" \\ \n \t \r and \uXXXX escapes (including surrogate pairs).
function scanJsonStringAt(text, key, startIdx) {
  const colon = text.indexOf(':', startIdx + key.length + 2);
  const quote = text.indexOf('"', colon + 1);
  if (colon === -1 || quote === -1) return null;

  let out = '';
  let i = quote + 1;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === 'u') {
        const hex = text.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          const code = parseInt(hex, 16);
          if (code >= 0xd800 && code <= 0xdbff) {
            const lowHex = text.slice(i + 6, i + 12);
            if (lowHex.startsWith('\\u') && /^[0-9a-fA-F]{4}$/.test(lowHex.slice(2))) {
              const low = parseInt(lowHex.slice(2), 16);
              out += String.fromCharCode(code, low);
              i += 12;
              continue;
            }
          }
          out += String.fromCharCode(code);
          i += 6;
          continue;
        }
      }
      if (next === undefined) break;
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Extracts the localized announcement { headline, body } embedded in a
 * steamcommunity announcement detail page. The announcement object contains
 * `posttime`, `headline`, `body` (Steam BBCode) close together in the page.
 */
export function extractLocalizedAnnouncement(pageHtml = '') {
  const html = unescapeHtmlEntities(String(pageHtml || ''));
  const postIdx = html.indexOf('"posttime"');
  if (postIdx === -1) return null;
  const headlineIdx = html.lastIndexOf('"headline"', postIdx);
  const bodyIdx = html.indexOf('"body"', postIdx);
  const headline = headlineIdx === -1 || postIdx - headlineIdx > 8000
    ? ''
    : (scanJsonStringAt(html, 'headline', headlineIdx) ?? '');
  const body = bodyIdx === -1 || bodyIdx - postIdx > 40000
    ? ''
    : (scanJsonStringAt(html, 'body', bodyIdx) ?? '');
  if (!headline && !body) return null;
  return { headline, body };
}

const BBCodeTokenRe = /\[(\/?)([a-zA-Z0-9*]+)([^\]]*)\]/g;

function tokenize(src) {
  const tokens = [];
  let last = 0;
  let m;
  BBCodeTokenRe.lastIndex = 0;
  while ((m = BBCodeTokenRe.exec(src))) {
    if (m.index > last) tokens.push({ type: 'text', text: src.slice(last, m.index) });
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const rawArg = (m[3] || '').trim();
    const arg = rawArg ? rawArg.replace(/^[=:]/, '').replace(/^"|"$/g, '').trim() : '';
    tokens.push({ type: 'tag', closing, name, arg, raw: m[0] });
    last = BBCodeTokenRe.lastIndex;
  }
  if (last < src.length) tokens.push({ type: 'text', text: src.slice(last) });
  return tokens;
}

export function bbcodeToMarkdown(src) {
  const tokens = tokenize(resolveSteamCdnTokens(String(src || '')));
  let i = 0;

  function render(untilName) {
    let out = '';
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === 'text') {
        out += t.text;
        i += 1;
        continue;
      }
      if (t.closing) {
        if (untilName && t.name === untilName) {
          i += 1;
          return out;
        }
        i += 1;
        continue;
      }
      if (untilName && t.name === untilName) {
        i += 1;
        return out;
      }
      out += renderTag(t);
    }
    return out;
  }

  function renderTag(t) {
    i += 1; // consume the opening tag token
    const { name, arg } = t;
    switch (name) {
      case 'b': case 'strong': return `**${render('b')}**`;
      case 'i': case 'em': return `*${render('i')}*`;
      case 'u': return `__${render('u')}__`;
      case 's': case 'strike': return `~~${render(name)}~~`;
      case 'url': return renderUrl(arg);
      case 'img': return renderImg(arg);
      case 'p': return `\n\n${render('p').trim()}\n\n`;
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        return `\n\n${'#'.repeat(Number(name[1]))} ${render(name).trim()}\n\n`;
      case 'list': return renderList('ul');
      case 'olist': return renderList('ol');
      case '*': return '- ';
      case 'quote': return `\n> ${render('quote').trim().replace(/\n/g, '\n> ')}\n\n`;
      case 'code': return `\n\`\`\`\n${render('code')}\n\`\`\`\n`;
      case 'hr': return '\n---\n';
      case 'center': case 'left': case 'right': case 'color': case 'size': case 'font':
      case 'expand': case 'spoiler': case 'o': case 'hero': case 'noparse':
        return render(name);
      case 'youtube': case 'previewyoutube': return renderYoutube(name, arg);
      case 'table': return renderTable();
      case 'tr': return '\n';
      case 'td': case 'th': return ' | ';
      default: return render(name);
    }
  }

  function renderUrl(href) {
    const text = render('url').trim();
    const url = href || text;
    if (!url) return '';
    return text && text !== url ? `[${text}](${url})` : `[${url}](${url})`;
  }

  function extractImgSrc(arg) {
    const m = String(arg).match(/\bsrc="?([^"\]]+)/);
    return m ? m[1].trim() : '';
  }

  function renderImg(alt) {
    const src = extractImgSrc(alt);
    const url = src || render('img').trim();
    if (!url) return '';
    return `![${src ? 'img' : (alt || 'img')}](${url})`;
  }

  function renderList(type) {
    const inner = render('list');
    const lines = String(inner).split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    return `\n${lines.map((l, idx) => {
      const text = l.replace(/^-\s*/, '').trim();
      return type === 'ol' ? `${idx + 1}. ${text}` : `- ${text}`;
    }).join('\n')}\n`;
  }

  function renderYoutube(name, arg) {
    const inner = render(name);
    let videoId = arg ? arg.split(';')[0].trim() : '';
    const match = String(inner).match(/youtube\.com\/watch\?v=([\w-]+)|youtu\.be\/([\w-]+)/i);
    if (!videoId && match) videoId = match[1] || match[2];
    if (!videoId) return String(inner).trim();
    return `[YouTube](https://www.youtube.com/watch?v=${videoId})`;
  }

  function renderTable() {
    const inner = render('table');
    const rows = String(inner)
      .split('\n')
      .map((r) => r.split('|').map((c) => c.trim()))
      .filter((r) => r.some((c) => c));
    if (!rows.length) return '';
    const width = Math.max(...rows.map((r) => r.length));
    const fmt = (r) => `| ${Array.from({ length: width }, (_, idx) => r[idx] || '').join(' | ')} |`;
    return `\n${fmt(rows[0])}\n| ${Array.from({ length: width }, () => '---').join(' | ')} |\n${rows.slice(1).map(fmt).join('\n')}\n`;
  }

  return String(render(null)).replace(/\n{3,}/g, '\n\n').trim();
}

export function stripBbcodeToText(src) {
  const text = resolveSteamCdnTokens(String(src || ''));
  return String(text)
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function extractFirstImageUrl(src) {
  const text = resolveSteamCdnTokens(String(src || ''));
  const match = text.match(/\[img\]([^\]]+)\[\/img\]|\[img=[^\]]*\]([^\]]+)\[\/img\]|\[img src="?([^"]+)"?[^\]]*\]/i);
  const url = match ? (match[1] || match[2] || match[3] || '').trim() : '';
  return url || undefined;
}
