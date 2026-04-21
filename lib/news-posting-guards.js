export const TRANSLATION_STATUS_COMPLETED = 'completed';

function normalizeText(value = '') {
  return String(value || '').trim();
}

export function isLocalLlmProvider(provider = '') {
  return normalizeText(provider).toLowerCase() === 'local-lm';
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
  localTranslationTriggered = false,
} = {}) {
  if (!autoPostEnabled) return { ok: false, reason: 'auto_post_disabled' };
  if (!translationCompleted) return { ok: false, reason: 'translation_incomplete' };
  if (!localTranslationTriggered) return { ok: false, reason: 'local_model_not_triggered' };
  return { ok: true, reason: 'ready' };
}
