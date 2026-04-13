export function countHanChars(text = '') {
  const matches = String(text || '').match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
}

function isLabelLine(line = '') {
  return Boolean(parseLabelLine(line));
}

function parseLabelLine(line = '') {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\*{1,2}\s*/, '')
    .replace(/\*{1,2}\s*$/, '')
    .trim();
  const match = normalized.match(/^(标题|正文|总结|点评|简评|话题|topics?)[:：]\s*(.*)$/i);
  if (!match) return null;
  return {
    label: String(match[1] || '').toLowerCase(),
    inline: String(match[2] || '').trim(),
  };
}

function normalizeParagraphs(text = '') {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function maybeDropInjectedLeadParagraph(paragraphs = [], sourceChunk = '') {
  if (paragraphs.length < 2) return paragraphs;
  const sourceFirst = String(sourceChunk || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) || '';
  if (/^#\s+/.test(sourceFirst)) return paragraphs;

  const [first, second, ...rest] = paragraphs;
  const firstHan = countHanChars(first);
  const secondHan = countHanChars(second);
  const looksInjectedTitle =
    firstHan >= 6 &&
    first.length <= 42 &&
    second.length >= 36 &&
    secondHan >= Math.max(18, Math.floor(firstHan * 2)) &&
    !/[。！？!?]$/.test(first);

  return looksInjectedTitle ? [second, ...rest] : paragraphs;
}

function isModelRefusalParagraph(paragraph = '') {
  return /抱歉|请提供|请把完整|无法保证|没有看到正文|只看到了标题|not enough|provide the full|由于.*没有提供.*(?:英文|正文|素材)|请发送.*(?:英文|内容|正文)|没有提供需要翻译|缺乏具体.*(?:正文|新闻)|无法为您翻译完整/i.test(String(paragraph || ''));
}

function dropModelRefusalParagraphs(paragraphs = []) {
  return paragraphs.filter((paragraph) => !isModelRefusalParagraph(paragraph));
}

export function sanitizeTranslatedChunkMarkdown(text = '', sourceChunk = '') {
  const normalized = normalizeParagraphs(text);
  if (!normalized) return '';

  const lines = normalized.split('\n');
  const hasLabels = lines.some((line) => isLabelLine(line));

  if (hasLabels) {
    const kept = [];
    let section = 'skip';
    let sawBodyLabel = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const parsed = parseLabelLine(line);
      if (parsed) {
        const { label, inline } = parsed;
        if (label === '正文') {
          sawBodyLabel = true;
          section = 'body';
          if (inline) kept.push(inline);
        } else {
          section = 'skip';
        }
        continue;
      }

      if (sawBodyLabel) {
        if (section === 'body') kept.push(rawLine);
        continue;
      }

      if (!line) {
        if (kept.length && kept[kept.length - 1] !== '') kept.push('');
        continue;
      }

      if (/^#\s+/.test(line)) continue;
      kept.push(rawLine);
    }

    const body = normalizeParagraphs(kept.join('\n'));
    if (!body) return '';
    return dropModelRefusalParagraphs(maybeDropInjectedLeadParagraph(body.split('\n\n'), sourceChunk)).join('\n\n').trim();
  }

  const paragraphs = normalized.split('\n\n').map((item) => item.trim()).filter(Boolean);
  return dropModelRefusalParagraphs(maybeDropInjectedLeadParagraph(paragraphs, sourceChunk)).join('\n\n').trim();
}
