/**
 * OpenDota 数据同步 - 极简版
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    console.log('=== Sync Start ===');
    
    const REDIS_URL = process.env.REDIS_URL;
    console.log('REDIS_URL set:', !!REDIS_URL);
    
    if (!REDIS_URL) {
      return res.status(200).json({ error: 'REDIS_URL not set' });
    }
    
    // 解析 Redis URL
    const match = REDIS_URL.match(/redis:\/\/default:([^@]+)@(.+):(\d+)/);
    if (!match) {
      return res.status(200).json({ error: 'Invalid REDIS_URL format' });
    }
    
    const token = match[1];
    const host = match[2];
    
    // 测试 Redis
    const redisRes = await fetch(`https://${host}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(['PING'])
    });
    
    const pingResult = await redisRes.text();
    console.log('Redis ping:', pingResult);
    
    // 获取 OpenDota 数据
    const odRes = await fetch('https://api.opendota.com/api/proMatches?limit=10');
    const matches = await odRes.json();
    console.log('OpenDota matches:', matches.length);
    
    return res.status(200).json({ 
      success: true, 
      redis: pingResult,
      matches: matches.length,
      message: 'Basic test passed!'
    });
  } catch (error) {
    console.error('Error:', error.message);
    return res.status(200).json({ error: error.message });
  }
}
