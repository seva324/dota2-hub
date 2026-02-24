/**
 * Test API
 */
export default async function handler(req, res) {
  return res.status(200).json({ 
    ok: true,
    redis: process.env.REDIS_URL ? 'SET' : 'NOT_SET'
  });
}
