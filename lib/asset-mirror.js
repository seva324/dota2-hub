import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_PATH = path.join(process.cwd(), 'public', 'images', 'mirror', 'manifest.json');
const DEFAULT_SITE_BASE_URL = 'https://dota2-hub.vercel.app';

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

export function getMirroredAssetUrl(url, req) {
  const normalized = normalizeAssetUrl(url);
  if (!normalized) return null;
  const manifest = loadManifest();
  const mirroredPath = manifest?.mappings?.[normalized];
  if (mirroredPath) {
    return `${getBaseUrl(req)}${mirroredPath.startsWith('/') ? mirroredPath : `/${mirroredPath}`}`;
  }
  return normalized;
}
