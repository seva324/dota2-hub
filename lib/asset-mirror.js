import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeAssetProxySourceUrl,
  rebaseAssetImageProxyUrl,
  toChinaReachableAssetUrl,
} from './asset-image-proxy.js';

const DEFAULT_SITE_BASE_URL = 'https://dota2-hub.vercel.app';
const MIRROR_PATH_PREFIX = '/images/mirror/';
const MANIFEST_CANDIDATE_PATHS = [
  path.join(process.cwd(), 'public', 'images', 'mirror', 'manifest.json'),
  path.join(process.cwd(), 'apps', 'web', 'public', 'images', 'mirror', 'manifest.json'),
  path.join(process.cwd(), 'apps', 'web', 'dist', 'images', 'mirror', 'manifest.json'),
  path.join(process.cwd(), '.edgeone', 'assets', 'images', 'mirror', 'manifest.json'),
  path.join(process.cwd(), 'images', 'mirror', 'manifest.json'),
];

let manifestCache = null;
let manifestPathCache = null;
let manifestMtime = 0;

export function normalizeAssetUrl(url) {
  return normalizeAssetProxySourceUrl(url);
}

function loadManifest() {
  for (const manifestPath of MANIFEST_CANDIDATE_PATHS) {
    try {
      const stat = fs.statSync(manifestPath);
      if (
        manifestCache &&
        manifestPathCache === manifestPath &&
        stat.mtimeMs === manifestMtime
      ) {
        return manifestCache;
      }
      manifestPathCache = manifestPath;
      manifestMtime = stat.mtimeMs;
      manifestCache = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return manifestCache;
    } catch {
      continue;
    }
  }

  manifestCache = { mappings: {} };
  manifestPathCache = null;
  manifestMtime = 0;
  return manifestCache;
}

function getBaseUrl(req) {
  const configured = process.env.PUBLIC_SITE_URL || process.env.SITE_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return String(configured).replace(/\/$/, '');
  const proto = req?.headers?.['x-forwarded-proto'] || req?.headers?.['X-Forwarded-Proto'];
  const host = req?.headers?.host || req?.headers?.Host;
  if (host) return `${proto || 'https'}://${host}`.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, '');
  return DEFAULT_SITE_BASE_URL;
}

function hasBaseUrlContext(req) {
  return Boolean(
    req?.headers?.host
    || req?.headers?.Host
    || process.env.PUBLIC_SITE_URL
    || process.env.SITE_BASE_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || process.env.VERCEL_URL
  );
}

export function toMirroredAssetUrl(assetPath, req) {
  const normalizedPath = String(assetPath || '').trim();
  if (!normalizedPath) return null;
  const withLeadingSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  if (!withLeadingSlash.startsWith(MIRROR_PATH_PREFIX)) return withLeadingSlash;

  if (!hasBaseUrlContext(req)) return withLeadingSlash;
  return `${getBaseUrl(req)}${withLeadingSlash}`;
}

export function rebaseMirroredAssetUrl(url, req) {
  const normalized = normalizeAssetUrl(url);
  if (!normalized) return null;
  const publicOrigin = hasBaseUrlContext(req) ? getBaseUrl(req) : '';

  const proxied = rebaseAssetImageProxyUrl(normalized, {
    publicOrigin,
  });
  if (proxied) return proxied;

  if (normalized.startsWith(MIRROR_PATH_PREFIX)) {
    return toMirroredAssetUrl(normalized, req);
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.pathname.startsWith(MIRROR_PATH_PREFIX)) {
      return toMirroredAssetUrl(parsed.pathname, req);
    }
  } catch {
    return normalized;
  }

  return normalized;
}

export function getMirroredAssetUrl(url, req) {
  const normalized = normalizeAssetUrl(url);
  if (!normalized) return null;
  const manifest = loadManifest();
  const publicOrigin = hasBaseUrlContext(req) ? getBaseUrl(req) : '';
  const mirroredPath = manifest?.mappings?.[normalized];
  if (mirroredPath) {
    return toMirroredAssetUrl(mirroredPath, req);
  }
  const proxied = toChinaReachableAssetUrl(normalized, {
    publicOrigin,
  });
  if (proxied) return proxied;
  return rebaseMirroredAssetUrl(normalized, req);
}
