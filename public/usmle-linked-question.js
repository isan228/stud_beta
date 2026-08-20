(function () {
    const GROUP_MARKER = '<<<USMLE_GROUP>>>';
    const VIGNETTE_MARKER = '<<<USMLE_VIGNETTE>>>';
    const QUESTION_MARKER = '<<<USMLE_QUESTION>>>';

    function escapeHtmlStr(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function parseUsmleLinkedQuestionText(text) {
        const raw = String(text || '');
        const vignetteIdx = raw.indexOf(VIGNETTE_MARKER);
        const questionIdx = raw.indexOf(QUESTION_MARKER);

        let groupId = null;
        const groupIdx = raw.indexOf(GROUP_MARKER);
        if (groupIdx !== -1) {
            const after = raw.slice(groupIdx + GROUP_MARKER.length);
            const end = after.search(/[\r\n<]/);
            groupId = (end === -1 ? after : after.slice(0, end)).trim() || null;
        }

        if (vignetteIdx === -1 || questionIdx === -1 || questionIdx < vignetteIdx) {
            return { isLinked: false, groupId, vignette: null, questionText: raw.trim() };
        }

        const vignette = raw.slice(vignetteIdx + VIGNETTE_MARKER.length, questionIdx).trim();
        const questionText = raw.slice(questionIdx + QUESTION_MARKER.length).trim();
        if (!vignette || !questionText) {
            return { isLinked: false, groupId, vignette: null, questionText: raw.trim() };
        }

        return { isLinked: true, groupId, vignette, questionText };
    }

    function getLinkedClusterKey(text) {
        const parsed = parseUsmleLinkedQuestionText(text);
        if (parsed.groupId) return `g:${parsed.groupId}`;
        if (parsed.isLinked && parsed.vignette) return `v:${parsed.vignette}`;
        return null;
    }

    function isFirstLinkedQuestionInList(questions, index) {
        const q = questions && questions[index];
        const key = getLinkedClusterKey(q && (q.text ?? q));
        if (!key) return false;
        if (index <= 0) return true;
        const prev = questions[index - 1];
        const prevKey = getLinkedClusterKey(prev && (prev.text ?? prev));
        return prevKey !== key;
    }

    function renderUsmleQuestionBodyHtml(text, options = {}) {
        const { isFirstInLinkedGroup = false } = options;
        const parsed = parseUsmleLinkedQuestionText(text);

        if (!parsed.isLinked) {
            return `<h3 class="question-text">${escapeHtmlStr(parsed.questionText).replace(/\n/g, '<br>')}</h3>`;
        }

        const questionHtml = `<h3 class="question-text">${escapeHtmlStr(parsed.questionText).replace(/\n/g, '<br>')}</h3>`;

        if (!isFirstInLinkedGroup) {
            return questionHtml;
        }

        return `
            <div class="usmle-linked-notice">Связанный вопрос: далее несколько вопросов по одному клиническому случаю.</div>
            <div class="usmle-vignette-box">
                <div class="usmle-vignette-label">Клинический случай</div>
                <div class="usmle-vignette-text question-text">${escapeHtmlStr(parsed.vignette).replace(/\n/g, '<br>')}</div>
            </div>
            ${questionHtml}
        `;
    }

    window.UsmleLinkedQuestion = {
        parseUsmleLinkedQuestionText,
        getLinkedClusterKey,
        isFirstLinkedQuestionInList,
        renderUsmleQuestionBodyHtml
    };
})();
