import fs from 'node:fs';
import path from 'node:path';
import {
  getSteamHostAlternate,
  normalizeAssetProxySourceUrl,
  rebaseAssetImageProxyUrl,
  toChinaReachableAssetUrl,
  getDltvHostAlternate,
} from './asset-image-proxy.js';
import bundledManifest from './generated/asset-mirror-manifest.js';
import { getPublicOrigin } from './server/public-origin.js';

const DEFAULT_SITE_BASE_URL = 'https://dota2-hub.vercel.app';
const MIRROR_PATH_PREFIX = '/images/mirror/';
// Legacy placeholder URLs baked into DB rows. The files were never deployed,
// so they 404 — treat them as missing and let the UI render its fallback.
const DEAD_PLACEHOLDER_PATH_RE = /^\/images\/desktop\/empty\//i;
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

  // Serverless functions bundle this module instead of shipping loose files,
  // so it stays available when no manifest.json exists on disk.
  manifestCache = bundledManifest && typeof bundledManifest === 'object'
    ? bundledManifest
    : { mappings: {} };
  manifestPathCache = null;
  manifestMtime = 0;
  return manifestCache;
}

function lookupMirroredPath(manifest, normalized) {
  const direct = manifest?.mappings?.[normalized];
  if (direct) return direct;
  const alternate = getSteamHostAlternate(normalized);
  if (alternate && alternate !== normalized) {
    const hit = manifest?.mappings?.[alternate];
    if (hit) return hit;
  }
  const dltvAlternate = getDltvHostAlternate(normalized);
  if (dltvAlternate && dltvAlternate !== normalized) {
    const hit = manifest?.mappings?.[dltvAlternate];
    if (hit) return hit;
  }
  return null;
}

function getBaseUrl(req) {
  const configured = process.env.PUBLIC_SITE_URL || process.env.SITE_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return String(configured).replace(/\/$/, '');
  if (hasBaseUrlContext(req)) return getPublicOrigin(req);
  return DEFAULT_SITE_BASE_URL;
}

function hasBaseUrlContext(req) {
  return Boolean(
    req?.headers?.host
    || req?.headers?.Host
    || req?.headers?.['x-forwarded-host']
    || req?.headers?.['X-Forwarded-Host']
    || req?.headers?.['x-original-host']
    || req?.headers?.['X-Original-Host']
    || process.env.PUBLIC_SITE_URL
    || process.env.SITE_BASE_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || process.env.PUBLIC_SITE_ORIGIN
    || process.env.VITE_PUBLIC_SITE_ORIGIN
    || process.env.SITE_URL
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
  if (!normalized || DEAD_PLACEHOLDER_PATH_RE.test(new URL(normalized).pathname)) return null;
  const manifest = loadManifest();
  const publicOrigin = hasBaseUrlContext(req) ? getBaseUrl(req) : '';
  const mirroredPath = lookupMirroredPath(manifest, normalized);
  if (mirroredPath) {
    return toMirroredAssetUrl(mirroredPath, req);
  }
  const proxied = toChinaReachableAssetUrl(normalized, {
    publicOrigin,
  });
  if (proxied) return proxied;
  return rebaseMirroredAssetUrl(normalized, req);
}
