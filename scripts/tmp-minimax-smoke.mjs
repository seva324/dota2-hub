const apiKey = process.env.MINIMAX_API_KEY || process.env.MINIMAX_TEXT_API_KEY || '';
const apiUrl = process.env.MINIMAX_API_URL || 'https://api.minimax.io/anthropic/v1/messages';
const model = process.env.MINIMAX_MODEL || 'MiniMax-M2.5';
if (!apiKey) {
  console.log(JSON.stringify({ ok:false, reason:'missing_api_key' }, null, 2));
  process.exit(0);
}
const body = {
  model,
  max_tokens: 300,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Translate to Simplified Chinese: Team Liquid won the match.' }] }],
};
const res = await fetch(apiUrl, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(JSON.stringify({ ok: res.ok, status: res.status, apiUrl, model, body: text.slice(0, 800) }, null, 2));
