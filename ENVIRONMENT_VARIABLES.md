# Environment Variables

| Variable | Purpose | Local required | Production required | Sensitive | Example |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Primary Neon connection string | yes for APIs/scripts | yes | yes | `postgres://user:pass@host/db?sslmode=require` |
| `POSTGRES_URL` | Backward-compatible Neon connection alias | optional if `DATABASE_URL` exists | optional if `DATABASE_URL` exists | yes | `postgres://user:pass@host/db?sslmode=require` |
| `NEON_API_KEY` | Neon management API key for branch audit tooling | optional | optional | yes | `napi_...` |
| `NEON_PROJECT_ID` | Neon project id for branch audit tooling | optional | optional | no | `silent-sky-123456` |
| `NEON_INCLUDED_BRANCHES` | Included branch quota used by branch-cost estimate script | optional | optional | no | `10` |
| `NEON_PROTECTED_BRANCHES` | Comma-separated protected branch names for audit script | optional | optional | no | `main,production,dev` |
| `SITE_BASE_URL` | Canonical site URL used by asset mirror helpers | optional | recommended | no | `https://example.com` |
| `PUBLIC_SITE_URL` | Alternative canonical site URL override | optional | recommended | no | `https://example.com` |
| `NEXT_PUBLIC_SITE_URL` | Legacy fallback for base URL resolution | optional | optional | no | `https://example.com` |
| `OPENDOTA_API_KEY` | Raises OpenDota API limits for sync jobs | optional | recommended | yes | `opendota_key_here` |
| `MINIMAX_API_KEY` | News translation/content API key | optional | optional unless translation endpoints are used | yes | `minimax_key_here` |
| `MINIMAX_TEXT_API_KEY` | Alternate MiniMax key name supported by legacy code | optional | optional | yes | `minimax_key_here` |
| `MINIMAX_API_URL` | MiniMax API endpoint override | optional | optional | no | `https://api.minimax.io/anthropic/v1/messages` |
| `MINIMAX_MODEL` | MiniMax model name | optional | optional | no | `MiniMax-M2.5` |
| `FIRECRAWL_API_KEY` | Firecrawl integration for scraping scripts | optional | optional | yes | `fc_xxx` |
| `GPT_API_KEY` | Optional OpenAI/GPT integration key | optional | optional | yes | `sk-...` |
| `REDIS_URL` | Optional Redis integration for scripts | optional | optional | yes | `redis://user:pass@host:6379` |
| `TELEGRAM_BOT_TOKEN` | Telegram ops notifications | optional | optional | yes | `123456:bot-token` |
| `TELEGRAM_CHAT_ID` | Telegram chat target | optional | optional | yes | `123456789` |
| `TG_BOT_TOKEN` | Backward-compatible Telegram token alias | optional | optional | yes | `123456:bot-token` |
| `TG_CHAT_ID` | Backward-compatible Telegram chat alias | optional | optional | yes | `123456789` |
| `TELEGRAM_TIMEOUT_MS` | Telegram request timeout tuning | optional | optional | no | `30000` |
| `TELEGRAM_TEXT` | One-off Telegram text payload for utility scripts | optional | optional | no | `hello from cron` |
| `XHS_AUTO_POST` | Enables XHS auto-post pipeline | optional | optional | no | `false` |
| `XHS_AI_REWRITE` | Enables AI rewrite before XHS post | optional | optional | no | `true` |
| `XHS_POST_PRESET` | XHS posting preset name | optional | optional | no | `default` |
| `LOCAL_LLM_BASE_URL` | OpenAI-compatible LAN endpoint for LM Studio/local inference (the helper appends `/v1` automatically when needed) | optional | optional | no | `http://100.109.56.73:1234` |
| `LOCAL_LLM_MODEL` | Preferred LAN model id for translation and XHS rewrite/enhance; changing this switches both local workflows together | optional | optional | no | `google/gemma-4-e4b` |
| `LOCAL_LLM_TIMEOUT_MS` | Timeout for LAN model requests | optional | optional | no | `45000` |
| `XHS_REVERSE_CLI` | XHS CLI binary override | optional | optional | no | `xhs` |
| `XHS_CODEX_BIN` | Codex binary override for XHS scripts | optional | optional | no | `codex` |
| `XHS_CODEX_MODEL` | Codex model override for XHS scripts | optional | optional | no | `gpt-5.4-mini` |
| `XHS_REWRITE_MODEL` | Optional dedicated model override for `post-news-to-xhs`; defaults to `LOCAL_LLM_MODEL` before OpenRouter fallback | optional | optional | no | `google/gemma-4-e4b` |
| `XHS_REWRITE_TIMEOUT_MS` | XHS AI rewrite timeout | optional | optional | no | `45000` |
| `XHS_REWRITE_PROMPT_FILE` | Prompt file path for XHS rewrite | optional | optional | no | `docs/xhs-community-post-prompt.md` |
| `NEWS_TRANSLATE_CODEX_MODEL` | Codex model override when no LAN/OpenRouter provider is available | optional | optional | no | `gpt-5.4-mini` |
| `NEWS_TRANSLATE_OPENROUTER_MODEL` | OpenRouter fallback model for news translation when the LAN model fails | optional | optional | no | `google/gemma-4-31b-it` |
| `D2HUB_CRON_TOKEN` | Optional cron endpoint shared token (`x-cron-token`/Bearer) to prevent anonymous expensive runs | optional | recommended for public deployments | yes | `random-long-token` |
| `D2HUB_CRON_MIN_INTERVAL_MIN` | Minimum cron interval guardrail | optional | optional | no | `0` |
| `D2HUB_OPENDOTA_PIPELINE_MIN_INTERVAL_MIN` | Minimum OpenDota pipeline interval guardrail | optional | optional | no | `0` |
| `CRON_SECRET` | Legacy alias for `D2HUB_CRON_TOKEN` | optional | optional | yes | `random-long-token` |
| `CRON_MIN_INTERVAL_MIN` | Legacy cron interval guardrail | optional | optional | no | `0` |
| `TARO_APP_API_BASE_URL` | Mini program backend base URL | yes for production mini program builds | yes for mini program production | no | `https://example.com` |
