/**
 * 测试 Redis 连接
 */
import { Redis } from '@upstash/redis';

const REDIS_URL = process.env.REDIS_URL;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 检查环境变量
    const envVars = Object.keys(process.env).filter(k => k.includes('REDIS') || k.includes('KV'));
    console.log('Environment variables:', envVars);
    console.log('REDIS_URL:', REDIS_URL ? 'set' : 'NOT SET');
    
    if (!REDIS_URL) {
      return res.status(500).json({ error: 'REDIS_URL not set in environment' });
    }

    // 解析 URL
    const match = REDIS_URL.match(/redis:\/\/default:([^@]+)@(.+):(\d+)/);
    if (!match) {
      return res.status(500).json({ error: 'Invalid REDIS_URL format' });
    }
    
    const token = match[1];
    const host = match[2];
    
    console.log('Host:', host);
    console.log('Token:', token.slice(0, 5) + '...');
    
    // 测试连接
    const redis = new Redis({ url: `https://${host}`, token });
    const ping = await redis.ping();
    
    return res.status(200).json({ 
      success: true, 
      ping: ping,
      message: 'Redis connected!'
    });
  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}
