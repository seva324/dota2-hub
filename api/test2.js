/**
 * Test API
 */
export default async function handler(response) {
  return response.status(200).json({ 
    ok: true,
    redis: process.env.REDIS_URL ? 'SET' : 'NOT_SET'
  });
}
