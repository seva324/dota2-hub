/**
 * 测试 KV 连接
 */
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 尝试写入测试数据
    const testKey = 'test:' + Date.now();
    await kv.set(testKey, { hello: 'world', time: new Date().toISOString() });
    
    // 读取测试数据
    const result = await kv.get(testKey);
    
    // 删除测试数据
    await kv.del(testKey);
    
    return res.status(200).json({ 
      success: true, 
      message: 'KV is working!',
      readWriteTest: result 
    });
  } catch (error) {
    console.error('KV Error:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
}
