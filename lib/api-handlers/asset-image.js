import {
  getAssetImageFetchCandidates,
  isSupportedAssetImageUrl,
  normalizeAssetProxySourceUrl,
} from '../asset-image-proxy.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;
const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CURATED_GITHUB_TEAM_SVG_RE = /^https:\/\/raw\.githubusercontent\.com\/seva324\/dota2-hub\/main\/public\/images\/mirror\/teams\/[^/]+\.svg$/i;

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function isSafeImageContentType(contentType = '', sourceUrl = '') {
  const mediaType = String(contentType).split(';')[0].trim().toLowerCase();
  if (!mediaType.startsWith('image/')) return false;
  if (mediaType !== 'image/svg+xml') return true;
  return CURATED_GITHUB_TEAM_SVG_RE.test(String(sourceUrl || ''));
}

async function fetchCandidate(url, method = 'GET') {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8',
        Referer: 'https://dotahub.cn/',
        'User-Agent': 'Mozilla/5.0 (compatible; Dota2HubAssetProxy/1.0)',
      },
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location') || '';
      const redirectedUrl = normalizeAssetProxySourceUrl(location, currentUrl);
      if (!redirectedUrl || !isSupportedAssetImageUrl(redirectedUrl, currentUrl)) {
        return { ok: false, status: 400 };
      }
      currentUrl = redirectedUrl;
      continue;
    }

    if (!response.ok) {
      return { ok: false, status: response.status };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!isSafeImageContentType(contentType, currentUrl)) {
      return { ok: false, status: 415 };
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      return { ok: false, status: 413 };
    }

    if (method === 'HEAD') {
      return {
        ok: true,
        body: null,
        contentType: contentType || 'image/png',
        etag: response.headers.get('etag') || '',
        lastModified: response.headers.get('last-modified') || '',
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      return { ok: false, status: 413 };
    }

    return {
      ok: true,
      body: Buffer.from(arrayBuffer),
      contentType: contentType || 'image/png',
      etag: response.headers.get('etag') || '',
      lastModified: response.headers.get('last-modified') || '',
    };
  }

  return { ok: false, status: 508 };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUrl = firstQueryValue(req.query?.url || req.query?.src);
  const candidates = getAssetImageFetchCandidates(rawUrl);
  if (candidates.length === 0) {
    return res.status(400).json({ error: 'Unsupported asset image URL' });
  }

  const failures = [];
  for (const candidate of candidates) {
    try {
      const fetched = await fetchCandidate(candidate, req.method);
      if (!fetched.ok) {
        failures.push({ candidate, status: fetched.status });
        continue;
      }

      res.setHeader('Content-Type', fetched.contentType);
      res.setHeader('Cache-Control', CACHE_CONTROL);
      res.setHeader('CDN-Cache-Control', CACHE_CONTROL);
      res.setHeader('Vercel-CDN-Cache-Control', CACHE_CONTROL);
      if (fetched.etag) res.setHeader('ETag', fetched.etag);
      if (fetched.lastModified) res.setHeader('Last-Modified', fetched.lastModified);

      if (req.method === 'HEAD') {
        return res.status(200).end();
      }

      return res.status(200).send(fetched.body);
    } catch (error) {
      failures.push({
        candidate,
        status: 'fetch_failed',
        message: error instanceof Error ? error.message : String(error || 'unknown_error'),
      });
    }
  }

  console.warn('[Asset Image Proxy] All candidates failed:', failures);
  return res.status(502).json({ error: 'Failed to fetch asset image' });
}
