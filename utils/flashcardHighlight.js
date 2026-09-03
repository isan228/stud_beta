/**
 * Подсветка ответов на обороте карточки по пропускам ______ и (a/b) во frontText.
 */
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function normalizeChoiceSegment(segment) {
  const m = String(segment || '').trim().match(/^\(([^)]+)\)$/);
  if (!m) return segment;
  return `(${m[1].split('/').map((s) => s.trim()).join('/')})`;
}

/** Лицевая сторона: ______ и (a/b) — синим, как в UWorld */
function buildFrontHtml(frontText) {
  const front = String(frontText || '');
  if (!front) return '';
  return escapeHtml(front)
    .replace(/_{2,}/g, '<span class="fc-blank">______</span>')
    .replace(/\(([^)]+)\)/g, (_m, inner) => {
      const cleaned = String(inner).split('/').map((s) => s.trim()).join('/');
      return `<span class="fc-choice">(${escapeHtml(cleaned)})</span>`;
    });
}

function buildHighlightHtml(frontText, backText) {
  const front = String(frontText || '');
  const back = String(backText || '');
  if (!front || !back) return escapeHtml(back);

  const blankRe = /_{2,}|\([^)]+\)/g;
  const tokens = [];
  let last = 0;
  let match;

  while ((match = blankRe.exec(front)) !== null) {
    if (match.index > last) {
      tokens.push({ type: 'text', value: front.slice(last, match.index) });
    }
    tokens.push({ type: 'blank', value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < front.length) {
    tokens.push({ type: 'text', value: front.slice(last) });
  }

  let backPos = 0;
  let html = '';

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === 'text') {
      const idx = back.indexOf(token.value, backPos);
      if (idx === -1) {
        return `<span class="flashcard-answer-highlight">${escapeHtml(back)}</span>`;
      }
      html += escapeHtml(back.slice(backPos, idx));
      backPos = idx + token.value.length;
      continue;
    }

    const nextText = tokens.slice(i + 1).find((t) => t.type === 'text');
    if (!nextText) {
      const answer = back.slice(backPos).trim();
      html += `<span class="flashcard-answer-highlight">${escapeHtml(answer)}</span>`;
      backPos = back.length;
      break;
    }

    const nextIdx = back.indexOf(nextText.value, backPos);
    if (nextIdx === -1) {
      return `<span class="flashcard-answer-highlight">${escapeHtml(back)}</span>`;
    }

    const answer = back.slice(backPos, nextIdx);
    html += `<span class="flashcard-answer-highlight">${escapeHtml(answer)}</span>`;
    backPos = nextIdx;
  }

  if (backPos < back.length) {
    html += escapeHtml(back.slice(backPos));
  }

  return html;
}

module.exports = {
  escapeHtml,
  buildFrontHtml,
  buildHighlightHtml,
  normalizeChoiceSegment
};
