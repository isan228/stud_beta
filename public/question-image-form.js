/**
 * UI загрузки изображения к вопросу (админка и редакторы).
 */
(function (global) {
    function normalizeImageUrls(value) {
        if (Array.isArray(value)) {
            return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
        }
        if (typeof value !== 'string') return [];
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return [...new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean))];
                }
            } catch (_) { /* ignore */ }
        }
        return [trimmed];
    }

    function renderPreviewImages(urls, altBase) {
        const items = normalizeImageUrls(urls);
        return items.map((url, index) =>
            `<img src="${url}" alt="${altBase} ${index + 1}" class="question-image-preview-img">`
        ).join('');
    }

    let objectUrl = null;

    function revokeObjectUrl() {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
        }
    }

    function resetQuestionImageUI() {
        const input = document.getElementById('questionImageFile');
        const preview = document.getElementById('questionImagePreview');
        const removeBtn = document.getElementById('questionImageRemoveBtn');
        const pending = document.getElementById('questionImagePendingRemove');
        if (input) input.value = '';
        if (pending) pending.value = '0';
        if (removeBtn) removeBtn.style.display = 'none';
        if (preview) {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }
        revokeObjectUrl();
    }

    function showQuestionImagePreview(imageUrl) {
        const preview = document.getElementById('questionImagePreview');
        const removeBtn = document.getElementById('questionImageRemoveBtn');
        const pending = document.getElementById('questionImagePendingRemove');
        if (!preview) return;
        revokeObjectUrl();
        if (pending) pending.value = '0';
        const urls = normalizeImageUrls(imageUrl);
        if (urls.length) {
            preview.innerHTML = renderPreviewImages(urls, 'Изображение к вопросу');
            preview.style.display = 'block';
            if (removeBtn) removeBtn.style.display = 'inline-block';
        } else {
            preview.innerHTML = '';
            preview.style.display = 'none';
            if (removeBtn) removeBtn.style.display = 'none';
        }
    }

    function bindQuestionImageFileInput() {
        const input = document.getElementById('questionImageFile');
        if (!input || input.dataset.bound === '1') return;
        input.dataset.bound = '1';
        input.addEventListener('change', () => {
            const files = Array.from(input.files || []);
            const pending = document.getElementById('questionImagePendingRemove');
            if (!files.length) return;
            if (pending) pending.value = '0';
            revokeObjectUrl();
            const preview = document.getElementById('questionImagePreview');
            const removeBtn = document.getElementById('questionImageRemoveBtn');
            if (preview) {
                preview.innerHTML = files.map((file) => {
                    const url = URL.createObjectURL(file);
                    objectUrl = url;
                    return `<img src="${url}" alt="Предпросмотр" class="question-image-preview-img">`;
                }).join('');
                preview.style.display = 'block';
            }
            if (removeBtn) removeBtn.style.display = 'inline-block';
        });
    }

  function bindQuestionImageRemoveBtn() {
        const btn = document.getElementById('questionImageRemoveBtn');
        if (!btn || btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            const input = document.getElementById('questionImageFile');
            const pending = document.getElementById('questionImagePendingRemove');
            if (input) input.value = '';
            if (pending) pending.value = '1';
            showQuestionImagePreview(null);
        });
    }

    function initQuestionImageForm() {
        bindQuestionImageFileInput();
        bindQuestionImageRemoveBtn();
        const pickBtn = document.getElementById('questionImagePickBtn');
        const input = document.getElementById('questionImageFile');
        if (pickBtn && input && pickBtn.dataset.bound !== '1') {
            pickBtn.dataset.bound = '1';
            pickBtn.addEventListener('click', () => input.click());
        }
        initExplanationImageForm();
    }

    /**
     * @param {number|string} questionId
     * @param {{ apiBase: string, getAuthHeaders: () => object }} opts
     */
    async function syncQuestionImageAfterSave(questionId, opts) {
        const pending = document.getElementById('questionImagePendingRemove');
        const input = document.getElementById('questionImageFile');
        const shouldRemove = pending && pending.value === '1';
        const files = Array.from(input?.files || []);

        if (!shouldRemove && !files.length) return { ok: true };

        const headers = opts.getAuthHeaders() || {};
        const authOnly = {};
        if (headers.Authorization) authOnly.Authorization = headers.Authorization;

        if (shouldRemove) {
            const res = await fetch(`${opts.apiBase}/questions/${questionId}/image`, {
                method: 'DELETE',
                headers: authOnly
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                return { ok: false, error: data.error || 'Не удалось удалить изображение' };
            }
            return { ok: true };
        }

        for (let i = 0; i < files.length; i++) {
            const formData = new FormData();
            formData.append('image', files[i]);
            const res = await fetch(`${opts.apiBase}/questions/${questionId}/image${i > 0 ? '?append=true' : ''}`, {
                method: 'POST',
                headers: authOnly,
                body: formData
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                return { ok: false, error: data.error || 'Не удалось загрузить изображение' };
            }
        }
        return { ok: true };
    }

    let explanationObjectUrl = null;

    function revokeExplanationObjectUrl() {
        if (explanationObjectUrl) {
            URL.revokeObjectURL(explanationObjectUrl);
            explanationObjectUrl = null;
        }
    }

    function resetExplanationImageUI() {
        const input = document.getElementById('explanationImageFile');
        const preview = document.getElementById('explanationImagePreview');
        const removeBtn = document.getElementById('explanationImageRemoveBtn');
        const pending = document.getElementById('explanationImagePendingRemove');
        if (input) input.value = '';
        if (pending) pending.value = '0';
        if (removeBtn) removeBtn.style.display = 'none';
        if (preview) {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }
        revokeExplanationObjectUrl();
    }

    function showExplanationImagePreview(imageUrl) {
        const preview = document.getElementById('explanationImagePreview');
        const removeBtn = document.getElementById('explanationImageRemoveBtn');
        const pending = document.getElementById('explanationImagePendingRemove');
        if (!preview) return;
        revokeExplanationObjectUrl();
        if (pending) pending.value = '0';
        const urls = normalizeImageUrls(imageUrl);
        if (urls.length) {
            preview.innerHTML = renderPreviewImages(urls, 'Картинка в объяснении');
            preview.style.display = 'block';
            if (removeBtn) removeBtn.style.display = 'inline-block';
        } else {
            preview.innerHTML = '';
            preview.style.display = 'none';
            if (removeBtn) removeBtn.style.display = 'none';
        }
    }

    function updateQuestionExplanationBlockVisibility() {
        const cb = document.getElementById('questionTestWithExplanations');
        const block = document.getElementById('questionExplanationBlock');
        if (block) block.style.display = cb && cb.checked ? 'block' : 'none';
    }

    function bindExplanationImageControls() {
        const input = document.getElementById('explanationImageFile');
        if (input && input.dataset.bound !== '1') {
            input.dataset.bound = '1';
            input.addEventListener('change', () => {
                const files = Array.from(input.files || []);
                const pending = document.getElementById('explanationImagePendingRemove');
                if (!files.length) return;
                if (pending) pending.value = '0';
                revokeExplanationObjectUrl();
                const preview = document.getElementById('explanationImagePreview');
                const removeBtn = document.getElementById('explanationImageRemoveBtn');
                if (preview) {
                    preview.innerHTML = files.map((file) => {
                        const url = URL.createObjectURL(file);
                        explanationObjectUrl = url;
                        return `<img src="${url}" alt="Предпросмотр" class="question-image-preview-img">`;
                    }).join('');
                    preview.style.display = 'block';
                }
                if (removeBtn) removeBtn.style.display = 'inline-block';
            });
        }

        const removeBtn = document.getElementById('explanationImageRemoveBtn');
        if (removeBtn && removeBtn.dataset.bound !== '1') {
            removeBtn.dataset.bound = '1';
            removeBtn.addEventListener('click', () => {
                const pending = document.getElementById('explanationImagePendingRemove');
                if (input) input.value = '';
                if (pending) pending.value = '1';
                showExplanationImagePreview(null);
            });
        }

        const pickBtn = document.getElementById('explanationImagePickBtn');
        if (pickBtn && input && pickBtn.dataset.bound !== '1') {
            pickBtn.dataset.bound = '1';
            pickBtn.addEventListener('click', () => input.click());
        }

        const explCb = document.getElementById('questionTestWithExplanations');
        if (explCb && explCb.dataset.bound !== '1') {
            explCb.dataset.bound = '1';
            explCb.addEventListener('change', updateQuestionExplanationBlockVisibility);
        }
    }

    function initExplanationImageForm() {
        bindExplanationImageControls();
        updateQuestionExplanationBlockVisibility();
    }

    function resetQuestionExplanationForm() {
        const cb = document.getElementById('questionTestWithExplanations');
        if (cb) cb.checked = false;
        const explanationEl = document.getElementById('questionExplanation');
        if (explanationEl) explanationEl.value = '';
        resetExplanationImageUI();
        updateQuestionExplanationBlockVisibility();
    }

    function setQuestionExplanationFormState(opts) {
        const { testHasExplanations, explanation, explanationImageUrl } = opts || {};
        const cb = document.getElementById('questionTestWithExplanations');
        const hasContent = !!(explanation && String(explanation).trim()) || !!(explanationImageUrl && String(explanationImageUrl).trim());
        if (cb) cb.checked = Boolean(testHasExplanations) || hasContent;
        const explanationEl = document.getElementById('questionExplanation');
        if (explanationEl) explanationEl.value = explanation || '';
        showExplanationImagePreview(explanationImageUrl || null);
        updateQuestionExplanationBlockVisibility();
    }

    async function syncExplanationImageAfterSave(questionId, opts) {
        const withExpl = document.getElementById('questionTestWithExplanations')?.checked;
        const pending = document.getElementById('explanationImagePendingRemove');
        const input = document.getElementById('explanationImageFile');
        const shouldRemove = !withExpl || (pending && pending.value === '1');
        const files = Array.from(input?.files || []);

        if (!shouldRemove && !files.length) return { ok: true };

        const headers = opts.getAuthHeaders() || {};
        const authOnly = {};
        if (headers.Authorization) authOnly.Authorization = headers.Authorization;
        const path = `${opts.apiBase}/questions/${questionId}/explanation-image`;

        if (shouldRemove) {
            const res = await fetch(path, { method: 'DELETE', headers: authOnly });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                return { ok: false, error: data.error || 'Не удалось удалить картинку объяснения' };
            }
            return { ok: true };
        }

        for (let i = 0; i < files.length; i++) {
            const formData = new FormData();
            formData.append('image', files[i]);
            const res = await fetch(`${path}${i > 0 ? '?append=true' : ''}`, { method: 'POST', headers: authOnly, body: formData });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                return { ok: false, error: data.error || 'Не удалось загрузить картинку объяснения' };
            }
        }
        return { ok: true };
    }

    global.resetQuestionImageUI = resetQuestionImageUI;
    global.showQuestionImagePreview = showQuestionImagePreview;
    global.initQuestionImageForm = initQuestionImageForm;
    global.syncQuestionImageAfterSave = syncQuestionImageAfterSave;
    global.resetExplanationImageUI = resetExplanationImageUI;
    global.showExplanationImagePreview = showExplanationImagePreview;
    global.initExplanationImageForm = initExplanationImageForm;
    global.resetQuestionExplanationForm = resetQuestionExplanationForm;
    global.setQuestionExplanationFormState = setQuestionExplanationFormState;
    global.updateQuestionExplanationBlockVisibility = updateQuestionExplanationBlockVisibility;
    global.syncExplanationImageAfterSave = syncExplanationImageAfterSave;
})(typeof window !== 'undefined' ? window : global);
