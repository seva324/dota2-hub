import { getTournamentBackgroundSourceUrl } from '../lib/tournament-backgrounds.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const slug = String(req.query?.slug || '').trim();
  const sourceUrl = getTournamentBackgroundSourceUrl(slug);
  if (!sourceUrl) {
    return res.status(404).json({ error: 'Tournament background not found' });
  }

  try {
    const upstream = await fetch(sourceUrl);
    if (!upstream.ok) {
      return res.status(502).json({ error: `Upstream image request failed: ${upstream.status}` });
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');

    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    return res.status(200).end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Tournament Background API] Error:', message);
    return res.status(500).json({ error: message });
  }
}
