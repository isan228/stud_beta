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

        if (groupId && questionIdx !== -1) {
            const questionText = raw.slice(questionIdx + QUESTION_MARKER.length).trim();
            return {
                isLinked: Boolean(questionText),
                groupId,
                vignette: null,
                questionText: questionText || raw.trim()
            };
        }

        // Старые записи с виньеткой — берём только текст вопроса
        if (vignetteIdx !== -1 && questionIdx !== -1 && questionIdx > vignetteIdx) {
            const questionText = raw.slice(questionIdx + QUESTION_MARKER.length).trim();
            return {
                isLinked: Boolean(questionText || groupId),
                groupId,
                vignette: null,
                questionText: questionText || raw.trim()
            };
        }

        if (groupId) {
            return {
                isLinked: true,
                groupId,
                vignette: null,
                questionText: raw.replace(GROUP_MARKER + groupId, '').trim() || raw.trim()
            };
        }

        return { isLinked: false, groupId: null, vignette: null, questionText: raw.trim() };
    }

    function getLinkedClusterKey(text) {
        const parsed = parseUsmleLinkedQuestionText(text);
        if (parsed.groupId) return `g:${parsed.groupId}`;
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
        const questionHtml = `<h3 class="question-text">${escapeHtmlStr(parsed.questionText).replace(/\n/g, '<br>')}</h3>`;

        if (!parsed.isLinked) return questionHtml;
        if (!isFirstInLinkedGroup) return questionHtml;

        return `
            <div class="usmle-linked-notice">Связанный вопрос: далее несколько вопросов идут подряд в одной связке.</div>
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
