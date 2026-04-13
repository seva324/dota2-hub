export const TRANSLATION_STATUS_COMPLETED = 'completed';

const GEMMA4_MODEL_IDS = new Set([
  'gemma4',
  'gemma-4',
  'gemma-4-31b',
  'google/gemma-4',
  'google/gemma-4-31b-it',
]);

function normalizeText(value = '') {
  return String(value || '').trim();
}

export function isGemma4Model(model = '') {
  return GEMMA4_MODEL_IDS.has(normalizeText(model).toLowerCase());
}

export function hasCompleteTranslatedNewsRow(row = {}) {
  const titleZh = normalizeText(row?.title_zh);
  const summaryZh = normalizeText(row?.summary_zh);
  const bodyZh = normalizeText(row?.content_markdown_zh || row?.content_zh);
  const status = normalizeText(row?.translation_status).toLowerCase();
  return Boolean(titleZh && summaryZh && bodyZh && status == TRANSLATION_STATUS_COMPLETED);
}

export function evaluateAutoPostSafety({
  autoPostEnabled = false,
  translationCompleted = false,
  gemmaTranslationTriggered = false,
} = {}) {
  if (!autoPostEnabled) return { ok: false, reason: 'auto_post_disabled' };
  if (!translationCompleted) return { ok: false, reason: 'translation_incomplete' };
  if (!gemmaTranslationTriggered) return { ok: false, reason: 'gemma4_not_triggered' };
  return { ok: true, reason: 'ready' };
}
