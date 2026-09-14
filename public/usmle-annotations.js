/**
 * Persistent USMLE notes + text highlights (localStorage).
 * Shared by test session and review.
 */
(function (global) {
  const NOTE_PREFIX = 'usmleNote:';
  const MARK_PREFIX = 'usmleMarks:';

  function notesKey(questionId) {
    return NOTE_PREFIX + String(questionId);
  }

  function marksKey(questionId) {
    return MARK_PREFIX + String(questionId);
  }

  function getNotes(questionId) {
    if (questionId == null) return '';
    try {
      return localStorage.getItem(notesKey(questionId)) || '';
    } catch (_) {
      return '';
    }
  }

  function setNotes(questionId, text) {
    if (questionId == null) return false;
    try {
      const value = String(text || '');
      if (!value.trim()) localStorage.removeItem(notesKey(questionId));
      else localStorage.setItem(notesKey(questionId), value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function hasNotes(questionId) {
    return !!String(getNotes(questionId) || '').trim();
  }

  function getMarks(questionId) {
    if (questionId == null) return null;
    try {
      const raw = localStorage.getItem(marksKey(questionId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function setMarks(questionId, payload) {
    if (questionId == null) return false;
    try {
      const stem = payload?.stem || [];
      const answers = payload?.answers || {};
      const hasStem = Array.isArray(stem) && stem.length > 0;
      const hasAnswers = answers && Object.keys(answers).some((k) => Array.isArray(answers[k]) && answers[k].length);
      if (!hasStem && !hasAnswers) {
        localStorage.removeItem(marksKey(questionId));
      } else {
        localStorage.setItem(marksKey(questionId), JSON.stringify({ stem, answers }));
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function getTextNodes(root) {
    const nodes = [];
    if (!root) return nodes;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('script, style, .uworld-review-choice-pct, .answer-option-letter, .uworld-review-choice-letter, .uworld-review-choice-mark')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  function offsetFromRoot(root, targetNode, targetOffset) {
    let offset = 0;
    for (const node of getTextNodes(root)) {
      if (node === targetNode) return offset + targetOffset;
      offset += node.nodeValue.length;
    }
    return -1;
  }

  function rangeFromOffsets(root, start, end) {
    const nodes = getTextNodes(root);
    let pos = 0;
    let startNode = null;
    let startOff = 0;
    let endNode = null;
    let endOff = 0;
    for (const node of nodes) {
      const len = node.nodeValue.length;
      if (startNode == null && start <= pos + len) {
        startNode = node;
        startOff = Math.max(0, start - pos);
      }
      if (end <= pos + len) {
        endNode = node;
        endOff = Math.max(0, end - pos);
        break;
      }
      pos += len;
    }
    if (!startNode || !endNode || end <= start) return null;
    const range = document.createRange();
    range.setStart(startNode, Math.min(startOff, startNode.nodeValue.length));
    range.setEnd(endNode, Math.min(endOff, endNode.nodeValue.length));
    return range;
  }

  function serializeContainer(el) {
    if (!el) return [];
    return [...el.querySelectorAll('mark.usmle-marker-hl')].map((mark) => {
      const texts = getTextNodes(mark);
      if (!texts.length) return null;
      const first = texts[0];
      const last = texts[texts.length - 1];
      const start = offsetFromRoot(el, first, 0);
      const end = offsetFromRoot(el, last, last.nodeValue.length);
      if (start < 0 || end < 0 || end <= start) return null;
      return {
        start,
        end,
        color: mark.style.background || mark.getAttribute('data-color') || '#ffe566'
      };
    }).filter(Boolean);
  }

  function unwrapMarks(root) {
    if (!root) return;
    [...root.querySelectorAll('mark.usmle-marker-hl')].forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize?.();
    });
  }

  function applyHighlights(el, highlights) {
    if (!el || !Array.isArray(highlights) || !highlights.length) return;
    const sorted = [...highlights].sort((a, b) => b.start - a.start);
    for (const h of sorted) {
      if (h == null || h.end <= h.start) continue;
      try {
        const range = rangeFromOffsets(el, h.start, h.end);
        if (!range || range.collapsed) continue;
        const mark = document.createElement('mark');
        mark.className = 'usmle-marker-hl';
        if (h.color) {
          mark.style.background = h.color;
          mark.setAttribute('data-color', h.color);
        }
        try {
          range.surroundContents(mark);
        } catch (_) {
          const frag = range.extractContents();
          mark.appendChild(frag);
          range.insertNode(mark);
        }
      } catch (_) {
        /* skip broken range */
      }
    }
  }

  function findStemEl(root) {
    if (!root) return null;
    return root.querySelector('.usmle-question-stem, .question-text');
  }

  function findAnswerTextEls(root) {
    const map = {};
    if (!root) return map;
    root.querySelectorAll('.answer-item[data-answer-id] .answer-option-text').forEach((el) => {
      const id = el.closest('.answer-item')?.getAttribute('data-answer-id');
      if (id) map[id] = el;
    });
    root.querySelectorAll('.uworld-review-choice[data-answer-id] .uworld-review-choice-text, .uworld-review-choice[data-answer-id] .answer-option-text').forEach((el) => {
      const id = el.closest('.uworld-review-choice')?.getAttribute('data-answer-id');
      if (id) map[id] = el;
    });
    return map;
  }

  function saveMarksFromRoot(questionId, root) {
    if (questionId == null || !root) return false;
    const stemEl = findStemEl(root);
    const answerEls = findAnswerTextEls(root);
    const stem = serializeContainer(stemEl);
    const answers = {};
    Object.keys(answerEls).forEach((id) => {
      const list = serializeContainer(answerEls[id]);
      if (list.length) answers[id] = list;
    });
    return setMarks(questionId, { stem, answers });
  }

  function restoreMarksToRoot(questionId, root) {
    if (questionId == null || !root) return false;
    const data = getMarks(questionId);
    if (!data) return false;
    const stemEl = findStemEl(root);
    const answerEls = findAnswerTextEls(root);
    if (stemEl) {
      unwrapMarks(stemEl);
      applyHighlights(stemEl, data.stem || []);
    }
    Object.keys(answerEls).forEach((id) => {
      unwrapMarks(answerEls[id]);
      applyHighlights(answerEls[id], (data.answers && data.answers[id]) || []);
    });
    return true;
  }

  function isHighlightTarget(node) {
    if (!node) return false;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return false;
    return !!(
      el.closest('.question-text, .usmle-question-stem, .answer-option-text, .uworld-review-choice-text')
    );
  }

  function wrapSelection(range, color) {
    const mark = document.createElement('mark');
    mark.className = 'usmle-marker-hl';
    if (color) {
      mark.style.background = color;
      mark.setAttribute('data-color', color);
    }
    try {
      range.surroundContents(mark);
    } catch (_) {
      const frag = range.extractContents();
      mark.appendChild(frag);
      range.insertNode(mark);
    }
    return mark;
  }

  function applyMarkerSelection(color, root) {
    const sel = global.getSelection?.();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!root || !root.contains(range.commonAncestorContainer)) return false;
    if (!isHighlightTarget(range.commonAncestorContainer)) return false;
    try {
      wrapSelection(range, color);
      sel.removeAllRanges();
      return true;
    } catch (_) {
      return false;
    }
  }

  global.UsmleAnnotations = {
    getNotes,
    setNotes,
    hasNotes,
    getMarks,
    setMarks,
    saveMarksFromRoot,
    restoreMarksToRoot,
    applyMarkerSelection,
    isHighlightTarget
  };
})(typeof window !== 'undefined' ? window : globalThis);
