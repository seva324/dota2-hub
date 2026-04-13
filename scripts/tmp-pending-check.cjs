const { neon } = require('@neondatabase/serverless');
const db = neon(process.env.DATABASE_URL);
(async () => {
  const [pending, latest] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS pending_count FROM news_articles WHERE COALESCE(translation_status, 'pending') <> 'completed' OR COALESCE(title_zh,'')='' OR COALESCE(summary_zh,'')='' OR COALESCE(content_zh,'')='' OR COALESCE(content_markdown_zh,'')=''"),
    db.query("SELECT id, translation_provider, translated_at FROM news_articles WHERE translated_at IS NOT NULL ORDER BY translated_at DESC LIMIT 5")
  ]);
  console.log(JSON.stringify({pending, latest}, null, 2));
})().catch(err => { console.error(err); process.exit(1); });
