import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_PATH = path.join(process.cwd(), 'public', 'images', 'mirror', 'manifest.json');
const DEFAULT_SITE_BASE_URL = 'https://dota2-hub.vercel.app';
const MIRROR_PATH_PREFIX = '/images/mirror/';

let manifestCache = null;
let manifestMtime = 0;

export function normalizeAssetUrl(url) {
  const value = String(url || '').trim();
  if (!value) return null;
  const normalized = value.startsWith('//') ? `https:${value}` : value;
  return normalized.replace('steamcdn-a.akamaihd.net', 'cdn.steamstatic.com');
}

function loadManifest() {
  try {
    const stat = fs.statSync(MANIFEST_PATH);
    if (manifestCache && stat.mtimeMs === manifestMtime) return manifestCache;
    manifestMtime = stat.mtimeMs;
    manifestCache = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return manifestCache;
  } catch {
    manifestCache = { mappings: {} };
    manifestMtime = 0;
    return manifestCache;
  }
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

export function toMirroredAssetUrl(assetPath, req) {
  const normalizedPath = String(assetPath || '').trim();
  if (!normalizedPath) return null;
  const withLeadingSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  if (!withLeadingSlash.startsWith(MIRROR_PATH_PREFIX)) return withLeadingSlash;

  const hasRequestContext = Boolean(
    req?.headers?.host
    || req?.headers?.Host
    || process.env.PUBLIC_SITE_URL
    || process.env.SITE_BASE_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || process.env.VERCEL_URL
  );

  if (!hasRequestContext) return withLeadingSlash;
  return `${getBaseUrl(req)}${withLeadingSlash}`;
}

export function rebaseMirroredAssetUrl(url, req) {
  const normalized = normalizeAssetUrl(url);
  if (!normalized) return null;

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
  const mirroredPath = manifest?.mappings?.[normalized];
  if (mirroredPath) {
    return toMirroredAssetUrl(mirroredPath, req);
  }
  return rebaseMirroredAssetUrl(normalized, req);
}
