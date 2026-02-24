/**
 * 简单测试
 */
export default async function handler(req, res) {
  const REDIS_URL = process.env.REDIS_URL;
  
  if (!REDIS_URL) {
    return res.status(200).json({ error: 'REDIS_URL not set' });
  }
  
  // 解析 URL
  const match = REDIS_URL.match(/redis:\/\/default:([^@]+)@(.+):(\d+)/);
  if (!match) {
    return res.status(200).json({ error: 'Invalid URL format', url: REDIS_URL });
  }
  
  const token = match[1];
  const host = match[2];
  
  try {
    // 测试 Redis 连接 - 使用 Redis Labs REST API
    const response = await fetch(`https://${host}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(['PING'])
    });
    
    const text = await response.text();
    
    return res.status(200).json({ 
      success: true, 
      status: response.status,
      result: text,
      host: host
    });
  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
