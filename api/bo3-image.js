import { getBo3ImageFetchCandidates } from '../lib/server/bo3-images.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;
const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function fetchCandidate(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
      Referer: 'https://bo3.gg/dota2/news',
      'User-Agent': 'Mozilla/5.0 (compatible; Dota2HubImageProxy/1.0)',
    },
  });

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !/^image\//i.test(contentType) && !/octet-stream/i.test(contentType)) {
    return { ok: false, status: 415 };
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413 };
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413 };
  }

  return {
    ok: true,
    body: Buffer.from(arrayBuffer),
    contentType: contentType || 'image/webp',
    etag: response.headers.get('etag') || '',
    lastModified: response.headers.get('last-modified') || '',
  };
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
  const candidates = getBo3ImageFetchCandidates(rawUrl);
  if (candidates.length === 0) {
    return res.status(400).json({ error: 'Unsupported BO3 image URL' });
  }

  const failures = [];
  for (const candidate of candidates) {
    try {
      const fetched = await fetchCandidate(candidate);
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

  console.warn('[BO3 Image Proxy] All candidates failed:', failures);
  return res.status(502).json({ error: 'Failed to fetch BO3 image' });
}

