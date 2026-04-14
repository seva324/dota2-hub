const BO3_IMAGE_PROXY_PATH = '/api/bo3-image';
const BO3_IMAGE_HOSTS = new Set([
  'files.bo3.gg',
  'image-proxy.bo3.gg',
  'bo3.gg',
  'www.bo3.gg',
]);

function normalizeUrl(rawUrl, baseUrl = 'https://bo3.gg') {
  try {
    const url = new URL(rawUrl, baseUrl);
    url.hash = '';
    if (url.searchParams.has('utm_source')) url.searchParams.delete('utm_source');
    if (url.searchParams.has('utm_medium')) url.searchParams.delete('utm_medium');
    if (url.searchParams.has('utm_campaign')) url.searchParams.delete('utm_campaign');
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function hasImageExtension(pathname = '') {
  return /\.(?:avif|gif|jpe?g|png|webp)(?:\.webp)?$/i.test(pathname);
}

export function isAllowedBo3ImageUrl(rawUrl, baseUrl = 'https://bo3.gg') {
  const normalized = normalizeUrl(rawUrl, baseUrl);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (!BO3_IMAGE_HOSTS.has(host)) return false;
    if (!url.pathname.startsWith('/uploads/news/')) return false;
    return hasImageExtension(url.pathname);
  } catch {
    return false;
  }
}

export function normalizeBo3CoverImageUrl(rawUrl, baseUrl = 'https://bo3.gg') {
  const normalized = normalizeUrl(rawUrl, baseUrl);
  if (!normalized) return undefined;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    const isBo3NewsTitleImage =
      url.pathname.startsWith('/uploads/news/') &&
      url.pathname.includes('/title_image/');

    if (host === 'image-proxy.bo3.gg') {
      if (!isBo3NewsTitleImage) return normalized;
      if (!url.searchParams.has('w')) url.searchParams.set('w', '960');
      if (!url.searchParams.has('h')) url.searchParams.set('h', '480');
      return url.toString();
    }

    if ((host === 'files.bo3.gg' || host === 'bo3.gg' || host === 'www.bo3.gg') && isBo3NewsTitleImage) {
      return `https://image-proxy.bo3.gg${url.pathname}.webp?w=960&h=480`;
    }

    return normalized;
  } catch {
    return normalized;
  }
}

export function toChinaReachableBo3ImageUrl(rawUrl, baseUrl = 'https://bo3.gg', options = {}) {
  const normalized = normalizeUrl(rawUrl, baseUrl);
  if (!normalized || !isAllowedBo3ImageUrl(normalized)) return rawUrl || undefined;

  const proxiedPath = `${BO3_IMAGE_PROXY_PATH}?url=${encodeURIComponent(normalized)}`;
  const publicOrigin = options?.publicOrigin ? String(options.publicOrigin).replace(/\/+$/, '') : '';
  return publicOrigin ? `${publicOrigin}${proxiedPath}` : proxiedPath;
}

export function rewriteBo3ImageUrlsForClient(text = '', options = {}) {
  if (!text || !/(?:files|image-proxy|www)?\.?bo3\.gg/i.test(text)) return text;

  return String(text).replace(/https?:\/\/(?:files|image-proxy|www)?\.?bo3\.gg\/[^\s)"'<>]+/gi, (matched) => {
    const cleaned = matched.replace(/[.,;:!?]+$/, '');
    const trailing = matched.slice(cleaned.length);
    const replacement = toChinaReachableBo3ImageUrl(cleaned, 'https://bo3.gg', options);
    return `${replacement || cleaned}${trailing}`;
  });
}

function stripImageProxyWebpSuffix(pathname) {
  return pathname.endsWith('.webp.webp') ? pathname.slice(0, -5) : pathname;
}

function appendUnique(candidates, candidate) {
  if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
}

export function getBo3ImageFetchCandidates(rawUrl, baseUrl = 'https://bo3.gg') {
  const normalized = normalizeUrl(rawUrl, baseUrl);
  if (!normalized || !isAllowedBo3ImageUrl(normalized)) return [];

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    const candidates = [];
    const pathWithoutProxySuffix = stripImageProxyWebpSuffix(url.pathname);

    if (host === 'image-proxy.bo3.gg') {
      appendUnique(candidates, url.toString());
      appendUnique(candidates, `https://files.bo3.gg${pathWithoutProxySuffix}`);
      return candidates;
    }

    if (host === 'files.bo3.gg' || host === 'bo3.gg' || host === 'www.bo3.gg') {
      appendUnique(candidates, `https://files.bo3.gg${url.pathname}${url.search}`);
      if (url.pathname.includes('/title_image/')) {
        appendUnique(candidates, `https://image-proxy.bo3.gg${url.pathname}.webp?w=960&h=480`);
      }
      return candidates;
    }

    return candidates;
  } catch {
    return [];
  }
}
