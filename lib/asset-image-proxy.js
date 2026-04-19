export const ASSET_IMAGE_PROXY_PATH = '/api/asset-image';

const DEFAULT_BASE_URL = 'https://dotahub.cn';
const STEAM_ALIAS_HOST = 'cdn.steamstatic.com';
const STEAM_HOSTS = new Set([
  'cdn.cloudflare.steamstatic.com',
  'cdn.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'cdn.steamusercontent.com',
]);
const DLTV_HOSTS = new Set([
  'dltv.org',
  'www.dltv.org',
  's3.dltv.org',
]);
const GITHUB_RAW_HOSTS = new Set([
  'raw.githubusercontent.com',
]);
const GITHUB_TEAM_LOGO_PATH_RE = /^\/seva324\/dota2-hub\/main\/public\/images\/mirror\/teams\/[^/]+\.(?:png|jpe?g|webp|gif|avif|svg)$/i;

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function hasImageExtension(pathname = '') {
  return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(pathname);
}

function usesAllowedTransport(url) {
  return url.protocol === 'https:' && (!url.port || url.port === '443');
}

function appendUnique(candidates, candidate) {
  if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
}

export function normalizeAssetProxySourceUrl(rawUrl, baseUrl = DEFAULT_BASE_URL) {
  const value = String(rawUrl || '').trim();
  if (!value) return null;

  try {
    const url = new URL(value, baseUrl);
    url.hash = '';
    const host = url.hostname.toLowerCase();
    if (host === 'steamcdn-a.akamaihd.net') {
      url.hostname = STEAM_ALIAS_HOST;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function isSupportedAssetImageUrl(rawUrl, baseUrl = DEFAULT_BASE_URL) {
  const normalized = normalizeAssetProxySourceUrl(rawUrl, baseUrl);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();

    if (url.pathname === ASSET_IMAGE_PROXY_PATH) return false;
    if (!usesAllowedTransport(url)) return false;

    if (DLTV_HOSTS.has(host)) {
      if (!hasImageExtension(url.pathname)) return false;
      return /^\/(?:uploads\/(?:players|teams)\/|images\/teams\/)/i.test(url.pathname);
    }

    if (STEAM_HOSTS.has(host)) {
      return hasImageExtension(url.pathname);
    }

    if (GITHUB_RAW_HOSTS.has(host)) {
      return GITHUB_TEAM_LOGO_PATH_RE.test(url.pathname);
    }

    return false;
  } catch {
    return false;
  }
}

export function rebaseAssetImageProxyUrl(rawUrl, options = {}) {
  const normalized = normalizeAssetProxySourceUrl(rawUrl, options.baseUrl);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (url.pathname !== ASSET_IMAGE_PROXY_PATH) return null;
    const rebased = `${ASSET_IMAGE_PROXY_PATH}${url.search || ''}`;
    const publicOrigin = normalizeOrigin(options.publicOrigin);
    return publicOrigin ? `${publicOrigin}${rebased}` : rebased;
  } catch {
    return null;
  }
}

export function toChinaReachableAssetUrl(rawUrl, options = {}) {
  const proxied = rebaseAssetImageProxyUrl(rawUrl, options);
  if (proxied) return proxied;

  const normalized = normalizeAssetProxySourceUrl(rawUrl, options.baseUrl);
  if (!normalized || !isSupportedAssetImageUrl(normalized, options.baseUrl)) return null;

  const proxyPath = `${ASSET_IMAGE_PROXY_PATH}?url=${encodeURIComponent(normalized)}`;
  const publicOrigin = normalizeOrigin(options.publicOrigin);
  return publicOrigin ? `${publicOrigin}${proxyPath}` : proxyPath;
}

export function getAssetImageFetchCandidates(rawUrl, baseUrl = DEFAULT_BASE_URL) {
  const normalized = normalizeAssetProxySourceUrl(rawUrl, baseUrl);
  if (!normalized || !isSupportedAssetImageUrl(normalized, baseUrl)) return [];

  const candidates = [];

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (host === STEAM_ALIAS_HOST) {
      appendUnique(candidates, normalized);
      appendUnique(candidates, `https://steamcdn-a.akamaihd.net${url.pathname}${url.search}`);
    } else if (host === 's3.dltv.org' && /^\/uploads\/(?:players|teams)\//i.test(url.pathname)) {
      appendUnique(candidates, `https://dltv.org${url.pathname}${url.search}`);
      appendUnique(candidates, normalized);
    } else if (host === 'dltv.org' && /^\/uploads\/(?:players|teams)\//i.test(url.pathname)) {
      appendUnique(candidates, normalized);
      appendUnique(candidates, `https://s3.dltv.org${url.pathname}${url.search}`);
    } else if (GITHUB_RAW_HOSTS.has(host) && GITHUB_TEAM_LOGO_PATH_RE.test(url.pathname)) {
      appendUnique(candidates, normalized);
    } else {
      appendUnique(candidates, normalized);
    }
  } catch {
    appendUnique(candidates, normalized);
  }

  return candidates;
}
