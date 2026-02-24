/**
 * 简单测试
 */
export default async function handler(req, res) {
  const REDIS_URL = process.env.REDIS_URL;
  
  return res.status(200).json({ 
    hello: 'world',
    redisUrl: REDIS_URL ? 'set (' + REDIS_URL.length + ' chars)' : 'NOT SET'
  });
}
