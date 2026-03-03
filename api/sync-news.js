import { syncNewsToDb } from './news.js';

function pickParam(value, fallback = '') {
  if (Array.isArray(value)) return String(value[0] || fallback);
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function toBool(value) {
  const v = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(v);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const query = req.query || {};
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const onlySource = pickParam(query.onlySource || body.onlySource, '').toLowerCase();
    const bo3TestUrl = pickParam(
      query.testUrl || query.bo3Url || query.url || body.testUrl || body.bo3Url || body.url,
      ''
    );
    const purgeBo3 = toBool(query.purgeBo3 || body.purgeBo3);
    const translateLimitRaw = pickParam(query.translateLimit || body.translateLimit, '');
    const translateLimit = translateLimitRaw ? Number(translateLimitRaw) : undefined;

    const result = await syncNewsToDb({
      onlySource: onlySource === 'bo3' || onlySource === 'hawk' ? onlySource : undefined,
      bo3TestUrl: bo3TestUrl || undefined,
      purgeBo3,
      translateLimit: Number.isFinite(translateLimit) ? translateLimit : undefined,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'sync failed',
    });
  }
}
