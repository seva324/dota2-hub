/**
 * LLM 自审翻译：翻译完成后对「原文 EN + 译文 ZH + 词表」做一次审核，
 * 由 LLM 决策发现问题并就地修正，消除术语错译、专有名词幻觉、事实编造。
 *
 * 纯函数 + 注入 callJson 回调，本地翻译脚本（scripts/translate-news-style-zh.mjs）
 * 与生产路径（lib/server/news-translation.js）共用；不 import 具体 LLM。
 */

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    needs_review: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    fixes: {
      type: 'object',
      properties: {
        title_zh: { type: 'string' },
        summary_zh: { type: 'string' },
      },
      additionalProperties: false,
    },
    body_corrections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          en: { type: 'string' },
          zh: { type: 'string' },
          corrected_zh: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['zh', 'corrected_zh'],
        additionalProperties: false,
      },
    },
  },
  required: ['needs_review', 'issues'],
  additionalProperties: false,
};

const DEFAULT_MAX_CHARS = 8000;

function truncate(text = '', maxChars) {
  const value = String(text || '');
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n…[截断，原文共 ${value.length} 字符]`;
}

export function buildReviewPrompt({ source = {}, zh = {}, glossaryPrompt = '', maxChars = DEFAULT_MAX_CHARS }) {
  const titleEn = String(source?.title_en || source?.title || '').trim();
  const summaryEn = String(source?.summary_en || source?.summary || '').trim();
  const bodyEn = truncate(String(source?.content_markdown_en || source?.content || ''), maxChars);
  const titleZh = String(zh?.title_zh || '').trim();
  const summaryZh = String(zh?.summary_zh || '').trim();
  const bodyZh = truncate(String(zh?.content_markdown_zh || zh?.content_zh || ''), maxChars);

  return [
    '你是 Dota2 新闻翻译的审校。下面是官方英文新闻的标题/摘要/正文，以及 LLM 已翻译的中文译文。',
    '请对照原文逐项核查译文，找出会误导读者的翻译错误，重点是：',
    '1. 术语译法：原文出现的 Dota2 术语，译文是否用了官方/主流中文名（参考词表）。',
    '2. 专有名词：英雄、战队、选手、物品、赛事名是否保留原文或使用官方译名；有无凭空发明、张冠李戴。',
    '3. 内容保真：数字、日期、金额、事实是否与原文一致；有无增删、编造原文没有的信息。',
    '4. 语义：有无明显错译、漏译整段、前后矛盾。',
    '5. 摘要保真（重点）：摘要必须只翻译英文摘要原文，不得把正文里的细节/数据/评价提前进摘要，不得编造原文没有的信息。',
    glossaryPrompt ? `\n词表（强约束，术语必须用词表中文名）：\n${glossaryPrompt}` : '',
    `\n【英文标题】\n${titleEn || '（无）'}`,
    `【中文标题】\n${titleZh || '（无）'}`,
    `【英文摘要】\n${summaryEn || '（无）'}`,
    `【中文摘要】\n${summaryZh || '（无）'}`,
    `【英文正文】\n${bodyEn || '（无）'}`,
    `【中文正文】\n${bodyZh || '（无）'}`,
    '',
    '输出规则：',
    '- 只报告真实、确凿的问题；语气/用词等小瑕疵不要报。',
    '- 标题或摘要有问题且能确定正确译法 → 在 fixes.title_zh / fixes.summary_zh 给出完整正确值（不要引号、不要字段标签）。',
    '- 正文有问题且能确定正确改法 → 在 body_corrections 逐条给出：zh=译文中出错的片段（必须与【中文正文】逐字一致），corrected_zh=修正后的片段。',
    '- 若某个问题无法确定正确改法，或正文片段无法精确对应 → 不要乱改，把原因写进 issues，并把 needs_review 设为 true。',
    '- 只要存在未解决的实质问题，needs_review 就为 true；全部干净则 false。',
  ].filter(Boolean).join('\n');
}

/**
 * 把 zh 替换为审核后的修正版（不可变，返回新对象）。
 * body_corrections 只做精确匹配替换；未匹配的片段归入 unresolved（供上层置 needs_review）。
 * 正文被修改时用注入的 mdToText 重算 content_zh。
 */
export function applyReviewFixes(zh = {}, review = {}, mdToText = (text) => text) {
  const next = { ...zh };
  const fixes = review?.fixes || {};
  if (typeof fixes.title_zh === 'string' && fixes.title_zh.trim()) next.title_zh = fixes.title_zh.trim();
  if (typeof fixes.summary_zh === 'string' && fixes.summary_zh.trim()) next.summary_zh = fixes.summary_zh.trim();

  const corrections = Array.isArray(review?.body_corrections) ? review.body_corrections : [];
  const unresolved = [];
  let bodyChanged = false;
  let bodyText = String(next.content_markdown_zh ?? next.content_zh ?? '');

  for (const item of corrections) {
    const from = String(item?.zh || '').trim();
    const to = String(item?.corrected_zh || '').trim();
    if (!from || !to) continue;
    if (bodyText.includes(from)) {
      bodyText = bodyText.replace(from, to);
      bodyChanged = true;
    } else {
      unresolved.push({ zh: from, corrected_zh: to, reason: String(item?.reason || '').trim() });
    }
  }

  if (bodyChanged) {
    next.content_markdown_zh = bodyText;
    next.content_zh = mdToText(bodyText);
  }

  return { zh: next, unresolved };
}

/**
 * 审核编排：buildReviewPrompt → callJson(prompt, REVIEW_SCHEMA, timeoutMs) → applyReviewFixes。
 * 返回 { zh, needs_review, issues, confidence, review_error }。
 * 调用失败/无 callJson 时返回原 zh + review_error，绝不抛错、不阻塞翻译管线。
 */
export async function reviewTranslation({ source = {}, zh = {}, glossaryPrompt = '', callJson, mdToText, opts = {} }) {
  if (typeof callJson !== 'function') {
    return { zh, needs_review: false, issues: [], confidence: null, review_error: 'no callJson' };
  }
  try {
    const prompt = buildReviewPrompt({ source, zh, glossaryPrompt, maxChars: opts.maxChars });
    const data = await callJson(prompt, REVIEW_SCHEMA, opts.timeoutMs || 60000);
    const review = data && typeof data === 'object' ? data : {};
    const needsReview = Boolean(review.needs_review);
    const issues = Array.isArray(review.issues) ? review.issues.map(String) : [];
    const confidence = Number.isFinite(Number(review.confidence)) ? Number(review.confidence) : null;
    const { zh: fixedZh, unresolved } = applyReviewFixes(zh, review, mdToText);
    const finalIssues = unresolved.length
      ? [...issues, ...unresolved.map((u) => `正文片段未定位，未修正：${u.zh} → ${u.corrected_zh}${u.reason ? `（${u.reason}）` : ''}`)]
      : issues;
    return {
      zh: fixedZh,
      needs_review: needsReview || unresolved.length > 0,
      issues: finalIssues,
      confidence,
      review_error: null,
    };
  } catch (error) {
    return {
      zh,
      needs_review: false,
      issues: [],
      confidence: null,
      review_error: error instanceof Error ? error.message : String(error),
    };
  }
}
