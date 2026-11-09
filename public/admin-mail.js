// Корпоративная почта (IMAP/SMTP через /api/admin/mail)

const MAIL_API_URL = '/api/admin/mail';
const MAIL_POLL_MS = 60000;
const MAIL_BADGE_POLL_MS = 120000;

const mailState = {
    initialized: false,
    accounts: [],
    summary: {},
    account: null,
    folders: [],
    folder: 'INBOX',
    page: 1,
    search: '',
    unseenOnly: false,
    list: null,
    current: null,
    listRequestId: 0,
    pollTimer: null
};

async function mailApi(path, { method = 'GET', json, body } = {}) {
    const headers = { ...adminAuthHeaders() };
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${MAIL_API_URL}${path}`, {
        method,
        headers,
        body: json !== undefined ? JSON.stringify(json) : body
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
    return data;
}

function mailAccountPath() {
    return `/${encodeURIComponent(mailState.account)}`;
}

function mailFormatAddress(a) {
    if (!a) return '';
    return a.name ? `${a.name} <${a.address}>` : a.address;
}

function mailFormatAddressList(list) {
    return (list || []).map(mailFormatAddress).join(', ');
}

function mailShortName(list) {
    const a = (list || [])[0];
    if (!a) return '—';
    return a.name || a.address;
}

function mailFormatDate(value, full = false) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    if (full) {
        return d.toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    if (d.getFullYear() === now.getFullYear()) {
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function mailFormatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} Б`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КБ`;
    return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

function currentMailFolder() {
    return mailState.folders.find((f) => f.path === mailState.folder) || null;
}

function isSentLikeFolder() {
    const f = currentMailFolder();
    return !!f && (f.specialUse === '\\Sent' || f.specialUse === '\\Drafts');
}

// ---------- Ящики ----------

function renderMailAccounts() {
    const box = document.getElementById('mailAccounts');
    if (!box) return;
    if (!mailState.accounts.length) {
        box.innerHTML = '<div class="mail-empty">Ящики не настроены</div>';
        return;
    }
    box.innerHTML = mailState.accounts.map((a) => {
        const s = mailState.summary[a.id];
        const unseen = s && s.unseen ? `<span class="mail-account-badge">${s.unseen}</span>` : '';
        const err = !a.configured ? 'Пароль не задан в .env' : (s && s.error ? s.error : '');
        return `
            <button type="button" class="mail-account ${a.id === mailState.account ? 'active' : ''} ${err ? 'has-error' : ''}"
                data-mail-account="${escapeHtml(a.id)}" ${a.configured ? '' : 'disabled'} title="${escapeHtml(err || a.email)}">
                <span class="mail-account-label">${escapeHtml(a.label)}${unseen}</span>
                <span class="mail-account-email">${escapeHtml(a.email)}</span>
            </button>`;
    }).join('');
}

function updateMailNavBadge() {
    const badge = document.getElementById('mailNavBadge');
    if (!badge) return;
    const total = Object.values(mailState.summary).reduce((sum, s) => sum + (Number(s.unseen) || 0), 0);
    badge.hidden = total <= 0;
    badge.textContent = total > 99 ? '99+' : String(total);
}

async function refreshMailSummary() {
    try {
        const data = await mailApi('/summary');
        mailState.summary = {};
        (data.accounts || []).forEach((a) => { mailState.summary[a.id] = a; });
        updateMailNavBadge();
        renderMailAccounts();
    } catch (e) {
        console.warn('Почта: сводка не загружена', e.message);
    }
}

async function selectMailAccount(id) {
    if (!id || id === mailState.account) return;
    mailState.account = id;
    mailState.folder = 'INBOX';
    mailState.page = 1;
    mailState.current = null;
    renderMailAccounts();
    renderMailViewEmpty();
    await Promise.all([loadMailFolders(), loadMailMessages()]);
}

// ---------- Папки ----------

async function loadMailFolders({ silent = false } = {}) {
    const box = document.getElementById('mailFolders');
    if (!box || !mailState.account) return;
    if (!silent) box.innerHTML = '<div class="mail-loading">Загрузка...</div>';
    try {
        const data = await mailApi(`${mailAccountPath()}/folders`);
        mailState.folders = data.folders || [];
        renderMailFolders();
    } catch (e) {
        if (!silent) box.innerHTML = `<div class="mail-error">${escapeHtml(e.message)}</div>`;
    }
}

function renderMailFolders() {
    const box = document.getElementById('mailFolders');
    if (!box) return;
    if (!mailState.folders.length) {
        box.innerHTML = '<div class="mail-empty">Папок нет</div>';
        return;
    }
    box.innerHTML = mailState.folders.map((f) => `
        <button type="button" class="mail-folder ${f.path === mailState.folder ? 'active' : ''}" data-mail-folder="${escapeHtml(f.path)}">
            <span class="mail-folder-name">${escapeHtml(f.name)}</span>
            ${f.unseen ? `<span class="mail-folder-count">${f.unseen}</span>` : ''}
        </button>`).join('');
}

function selectMailFolder(path) {
    if (!path) return;
    mailState.folder = path;
    mailState.page = 1;
    mailState.current = null;
    renderMailFolders();
    renderMailViewEmpty();
    loadMailMessages();
}

// ---------- Список писем ----------

async function loadMailMessages({ silent = false } = {}) {
    const box = document.getElementById('mailList');
    if (!box || !mailState.account) return;
    const requestId = ++mailState.listRequestId;
    if (!silent) box.innerHTML = '<div class="mail-loading">Загрузка писем...</div>';
    const params = new URLSearchParams({
        folder: mailState.folder,
        page: String(mailState.page),
        limit: '30'
    });
    if (mailState.search) params.set('search', mailState.search);
    if (mailState.unseenOnly) params.set('unseen', '1');
    try {
        const data = await mailApi(`${mailAccountPath()}/messages?${params}`);
        if (requestId !== mailState.listRequestId) return;
        mailState.list = data;
        renderMailList();
    } catch (e) {
        if (requestId !== mailState.listRequestId) return;
        if (!silent) {
            box.innerHTML = `<div class="mail-error">${escapeHtml(e.message)}</div>`;
            document.getElementById('mailPagination').innerHTML = '';
        }
    }
}

function renderMailList() {
    const box = document.getElementById('mailList');
    const pag = document.getElementById('mailPagination');
    if (!box) return;
    const data = mailState.list;
    const messages = data?.messages || [];
    if (!messages.length) {
        box.innerHTML = `<div class="mail-empty">${mailState.search || mailState.unseenOnly ? 'Ничего не найдено' : 'Писем нет'}</div>`;
        if (pag) pag.innerHTML = '';
        return;
    }
    const sentLike = isSentLikeFolder();
    box.innerHTML = messages.map((m) => {
        const who = sentLike ? `Кому: ${mailShortName(m.to)}` : mailShortName(m.from);
        const classes = [
            'mail-item',
            m.seen ? '' : 'is-unread',
            mailState.current && mailState.current.uid === m.uid ? 'active' : ''
        ].join(' ');
        return `
            <button type="button" class="${classes}" data-mail-uid="${m.uid}">
                <div class="mail-item-row">
                    <span class="mail-item-from">${escapeHtml(who)}</span>
                    <span class="mail-item-date">${escapeHtml(mailFormatDate(m.date))}</span>
                </div>
                <div class="mail-item-row">
                    <span class="mail-item-subject">${escapeHtml(m.subject || '(без темы)')}</span>
                    <span class="mail-item-icons">
                        ${m.answered ? '<span title="Отвечено">↩</span>' : ''}
                        ${m.hasAttachments ? '<span title="Есть вложения">📎</span>' : ''}
                        ${m.flagged ? '<span class="mail-item-flag" title="Помечено">★</span>' : ''}
                    </span>
                </div>
            </button>`;
    }).join('');

    if (pag) {
        const { page, totalPages, total } = data;
        pag.innerHTML = totalPages > 1 ? `
            <button type="button" class="btn btn-secondary btn-sm" data-mail-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>←</button>
            <span>${page} / ${totalPages} · ${total} писем</span>
            <button type="button" class="btn btn-secondary btn-sm" data-mail-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>→</button>
        ` : `<span>${total} писем</span>`;
    }
}

// ---------- Просмотр письма ----------

function renderMailViewEmpty() {
    const view = document.getElementById('mailView');
    if (view) view.innerHTML = '<div class="mail-empty">Выберите письмо</div>';
    document.getElementById('mailLayout')?.classList.remove('is-viewing');
}

function buildMailFrameDoc(message) {
    const content = message.html
        ? message.html
        : `<pre>${escapeHtml(message.text || '')}</pre>`;
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; frame-src 'none'">
<base target="_blank">
<style>
body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;margin:14px;color:#111;background:#fff;word-wrap:break-word;overflow-wrap:anywhere}
img{max-width:100%;height:auto}
pre{white-space:pre-wrap;font-family:inherit;margin:0}
blockquote{margin:0 0 0 .5rem;padding-left:.75rem;border-left:3px solid #ddd;color:#555}
table{max-width:100%}
</style></head><body>${content}</body></html>`;
}

async function openMailMessage(uid) {
    const view = document.getElementById('mailView');
    if (!view) return;
    document.getElementById('mailLayout')?.classList.add('is-viewing');
    view.innerHTML = '<div class="mail-loading">Открываем письмо...</div>';
    document.querySelectorAll('.mail-item').forEach((el) => {
        el.classList.toggle('active', Number(el.dataset.mailUid) === Number(uid));
    });

    try {
        const params = new URLSearchParams({ folder: mailState.folder });
        const message = await mailApi(`${mailAccountPath()}/messages/${uid}?${params}`);
        mailState.current = message;
        markMailListItemSeen(uid);
        renderMailMessage(message);
    } catch (e) {
        view.innerHTML = `<div class="mail-error">${escapeHtml(e.message)}</div>`;
    }
}

function markMailListItemSeen(uid) {
    const item = mailState.list?.messages?.find((m) => m.uid === Number(uid));
    if (!item || item.seen) return;
    item.seen = true;
    document.querySelector(`.mail-item[data-mail-uid="${uid}"]`)?.classList.remove('is-unread');
    const folder = currentMailFolder();
    if (folder && folder.unseen) {
        folder.unseen -= 1;
        renderMailFolders();
    }
    const s = mailState.summary[mailState.account];
    if (s && s.unseen && folder && folder.specialUse === '\\Inbox') {
        s.unseen -= 1;
        renderMailAccounts();
        updateMailNavBadge();
    }
}

function renderMailMessage(m) {
    const view = document.getElementById('mailView');
    if (!view) return;
    const attachments = (m.attachments || []).map((a) => `
        <button type="button" class="mail-attachment" data-mail-attachment="${a.index}" title="Скачать">
            📎 <span>${escapeHtml(a.filename)}</span> <small>${escapeHtml(mailFormatSize(a.size))}</small>
        </button>`).join('');

    view.innerHTML = `
        <div class="mail-view-header">
            <button type="button" class="mail-link-btn mail-back-btn" data-mail-action="back">← К списку</button>
            <h3 class="mail-view-subject">${escapeHtml(m.subject || '(без темы)')}</h3>
            <div class="mail-view-meta">
                <div><b>От:</b> ${escapeHtml(mailFormatAddressList(m.from))}</div>
                <div><b>Кому:</b> ${escapeHtml(mailFormatAddressList(m.to))}</div>
                ${m.cc && m.cc.length ? `<div><b>Копия:</b> ${escapeHtml(mailFormatAddressList(m.cc))}</div>` : ''}
                <div class="mail-view-date">${escapeHtml(mailFormatDate(m.date, true))}</div>
            </div>
            <div class="mail-view-actions">
                <button type="button" class="btn btn-primary btn-sm" data-mail-action="reply">Ответить</button>
                <button type="button" class="btn btn-secondary btn-sm" data-mail-action="replyAll">Ответить всем</button>
                <button type="button" class="btn btn-secondary btn-sm" data-mail-action="forward">Переслать</button>
                <button type="button" class="btn btn-secondary btn-sm" data-mail-action="unread">Непрочитано</button>
                <button type="button" class="btn btn-secondary btn-sm" data-mail-action="flag">${m.flagged ? '★ Снять пометку' : '☆ Пометить'}</button>
                <button type="button" class="btn btn-danger btn-sm" data-mail-action="delete">Удалить</button>
            </div>
        </div>
        ${attachments ? `<div class="mail-attachments">${attachments}</div>` : ''}
        <iframe class="mail-body-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="Текст письма"></iframe>
    `;
    const frame = view.querySelector('.mail-body-frame');
    if (frame) frame.srcdoc = buildMailFrameDoc(m);
}

function mailMessagePlainText(m) {
    if (m.text) return m.text;
    if (!m.html) return '';
    const doc = new DOMParser().parseFromString(m.html, 'text/html');
    return doc.body?.textContent || '';
}

async function downloadMailAttachment(index) {
    const m = mailState.current;
    if (!m) return;
    try {
        const params = new URLSearchParams({ folder: m.folder });
        const res = await fetch(`${MAIL_API_URL}${mailAccountPath()}/messages/${m.uid}/attachments/${index}?${params}`, {
            headers: adminAuthHeaders()
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Не удалось скачать вложение');
        }
        const blob = await res.blob();
        const att = (m.attachments || []).find((a) => a.index === Number(index));
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = att?.filename || 'attachment';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

async function handleMailAction(action) {
    const m = mailState.current;
    if (action === 'back') {
        renderMailViewEmpty();
        return;
    }
    if (!m) return;

    if (action === 'reply' || action === 'replyAll' || action === 'forward') {
        openMailCompose(action, m);
        return;
    }

    try {
        if (action === 'unread') {
            await mailApi(`${mailAccountPath()}/messages/${m.uid}`, { method: 'PATCH', json: { folder: m.folder, seen: false } });
            const item = mailState.list?.messages?.find((x) => x.uid === m.uid);
            if (item) item.seen = false;
            renderMailViewEmpty();
            mailState.current = null;
            renderMailList();
            loadMailFolders({ silent: true });
            refreshMailSummary();
        } else if (action === 'flag') {
            const flagged = !m.flagged;
            await mailApi(`${mailAccountPath()}/messages/${m.uid}`, { method: 'PATCH', json: { folder: m.folder, flagged } });
            m.flagged = flagged;
            const item = mailState.list?.messages?.find((x) => x.uid === m.uid);
            if (item) item.flagged = flagged;
            renderMailMessage(m);
            renderMailList();
        } else if (action === 'delete') {
            if (!confirm('Удалить письмо? Оно будет перемещено в корзину.')) return;
            await mailApi(`${mailAccountPath()}/messages/${m.uid}?folder=${encodeURIComponent(m.folder)}`, { method: 'DELETE' });
            showNotification('Письмо удалено', 'success');
            mailState.current = null;
            renderMailViewEmpty();
            loadMailMessages({ silent: true });
            loadMailFolders({ silent: true });
            refreshMailSummary();
        }
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

// ---------- Написать / ответить ----------

function fillMailComposeFrom(selectedId) {
    const select = document.getElementById('mailComposeFrom');
    if (!select) return;
    select.innerHTML = mailState.accounts
        .filter((a) => a.configured)
        .map((a) => `<option value="${escapeHtml(a.id)}" ${a.id === selectedId ? 'selected' : ''}>${escapeHtml(a.label)} — ${escapeHtml(a.email)}</option>`)
        .join('');
}

function setMailComposeRow(id, visible) {
    const row = document.getElementById(id);
    if (row) row.hidden = !visible;
}

function prefixSubject(prefix, subject) {
    const s = String(subject || '').trim();
    const re = new RegExp(`^${prefix}:`, 'i');
    return re.test(s) ? s : `${prefix}: ${s}`;
}

function openMailCompose(mode = 'new', source = null) {
    const modal = document.getElementById('mailComposeModal');
    const form = document.getElementById('mailComposeForm');
    if (!modal || !form) return;
    form.reset();

    const ownEmails = new Set(mailState.accounts.map((a) => a.email.toLowerCase()));
    fillMailComposeFrom(mailState.account);
    setMailComposeRow('mailComposeCcRow', false);
    setMailComposeRow('mailComposeBccRow', false);
    document.getElementById('mailComposeInReplyTo').value = '';
    document.getElementById('mailComposeReferences').value = '';
    document.getElementById('mailComposeReplyUid').value = '';
    document.getElementById('mailComposeReplyFolder').value = '';

    let title = 'Новое письмо';
    if (source && mode !== 'new') {
        const quoteHeader = `${mailFormatDate(source.date, true)}, ${mailFormatAddressList(source.from)}`;
        const plain = mailMessagePlainText(source);

        if (mode === 'forward') {
            title = 'Переслать письмо';
            document.getElementById('mailComposeSubject').value = prefixSubject('Fwd', source.subject);
            document.getElementById('mailComposeBody').value = [
                '', '',
                '---------- Пересланное сообщение ----------',
                `От: ${mailFormatAddressList(source.from)}`,
                `Дата: ${mailFormatDate(source.date, true)}`,
                `Тема: ${source.subject || ''}`,
                `Кому: ${mailFormatAddressList(source.to)}`,
                '',
                plain
            ].join('\n');
        } else {
            title = mode === 'replyAll' ? 'Ответить всем' : 'Ответить';
            const replyTargets = (source.replyTo && source.replyTo.length) ? source.replyTo : source.from;
            document.getElementById('mailComposeTo').value = mailFormatAddressList(replyTargets);
            if (mode === 'replyAll') {
                const seen = new Set(replyTargets.map((a) => a.address.toLowerCase()));
                const cc = [...(source.to || []), ...(source.cc || [])].filter((a) => {
                    const addr = String(a.address || '').toLowerCase();
                    if (!addr || ownEmails.has(addr) || seen.has(addr)) return false;
                    seen.add(addr);
                    return true;
                });
                if (cc.length) {
                    document.getElementById('mailComposeCc').value = mailFormatAddressList(cc);
                    setMailComposeRow('mailComposeCcRow', true);
                }
            }
            document.getElementById('mailComposeSubject').value = prefixSubject('Re', source.subject);
            const quoted = plain.split(/\r?\n/).map((line) => `> ${line}`).join('\n');
            document.getElementById('mailComposeBody').value = `\n\n${quoteHeader} пишет:\n${quoted}`;
            if (source.messageId) {
                document.getElementById('mailComposeInReplyTo').value = source.messageId;
                document.getElementById('mailComposeReferences').value = [...(source.references || []), source.messageId].join(' ');
            }
            document.getElementById('mailComposeReplyUid').value = String(source.uid || '');
            document.getElementById('mailComposeReplyFolder').value = source.folder || '';
        }
    }

    document.getElementById('mailComposeTitle').textContent = title;
    modal.style.display = 'block';
    const focusId = mode === 'new' || mode === 'forward' ? 'mailComposeTo' : 'mailComposeBody';
    const focusEl = document.getElementById(focusId);
    if (focusEl) {
        focusEl.focus();
        if (focusId === 'mailComposeBody') focusEl.setSelectionRange(0, 0);
    }
}

async function submitMailCompose(e) {
    e.preventDefault();
    const btn = document.getElementById('mailComposeSendBtn');
    const from = document.getElementById('mailComposeFrom').value;
    if (!from) {
        showNotification('Нет доступных ящиков для отправки', 'error');
        return;
    }
    const fd = new FormData();
    const fields = {
        to: 'mailComposeTo',
        cc: 'mailComposeCc',
        bcc: 'mailComposeBcc',
        subject: 'mailComposeSubject',
        text: 'mailComposeBody',
        inReplyTo: 'mailComposeInReplyTo',
        references: 'mailComposeReferences',
        replyToUid: 'mailComposeReplyUid',
        replyFolder: 'mailComposeReplyFolder'
    };
    Object.entries(fields).forEach(([key, id]) => {
        const value = document.getElementById(id)?.value || '';
        if (value.trim()) fd.append(key, value);
    });
    const files = document.getElementById('mailComposeFiles')?.files || [];
    Array.from(files).forEach((f) => fd.append('attachments', f));

    btn.disabled = true;
    btn.textContent = 'Отправка...';
    try {
        const result = await mailApi(`/${encodeURIComponent(from)}/send`, { method: 'POST', body: fd });
        document.getElementById('mailComposeModal').style.display = 'none';
        if (result.rejected && result.rejected.length) {
            showNotification(`Отправлено, но отклонены адреса: ${result.rejected.join(', ')}`, 'error');
        } else if (!result.savedToSent) {
            showNotification('Письмо отправлено, но копия не сохранилась в «Отправленные»', 'info');
        } else {
            showNotification('Письмо отправлено', 'success');
        }
        if (from === mailState.account) {
            loadMailFolders({ silent: true });
            loadMailMessages({ silent: true });
        }
    } catch (err) {
        showNotification(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Отправить';
    }
}

// ---------- Инициализация ----------

function initAdminMailEvents() {
    if (mailState.initialized) return;
    mailState.initialized = true;

    document.getElementById('mailAccounts')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mail-account]');
        if (btn && !btn.disabled) selectMailAccount(btn.dataset.mailAccount);
    });
    document.getElementById('mailFolders')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mail-folder]');
        if (btn) selectMailFolder(btn.dataset.mailFolder);
    });
    document.getElementById('mailList')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mail-uid]');
        if (btn) openMailMessage(Number(btn.dataset.mailUid));
    });
    document.getElementById('mailPagination')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mail-page]');
        if (!btn || btn.disabled) return;
        mailState.page = Math.max(1, Number(btn.dataset.mailPage) || 1);
        loadMailMessages();
    });
    document.getElementById('mailView')?.addEventListener('click', (e) => {
        const att = e.target.closest('[data-mail-attachment]');
        if (att) {
            downloadMailAttachment(att.dataset.mailAttachment);
            return;
        }
        const btn = e.target.closest('[data-mail-action]');
        if (btn) handleMailAction(btn.dataset.mailAction);
    });

    let searchTimer = null;
    document.getElementById('mailSearch')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            mailState.search = e.target.value.trim();
            mailState.page = 1;
            loadMailMessages();
        }, 500);
    });
    document.getElementById('mailUnreadOnly')?.addEventListener('change', (e) => {
        mailState.unseenOnly = e.target.checked;
        mailState.page = 1;
        loadMailMessages();
    });
    document.getElementById('mailRefreshBtn')?.addEventListener('click', () => {
        loadMailFolders({ silent: true });
        loadMailMessages();
        refreshMailSummary();
    });
    document.getElementById('mailComposeBtn')?.addEventListener('click', () => openMailCompose('new'));
    document.getElementById('mailComposeForm')?.addEventListener('submit', submitMailCompose);
    document.getElementById('mailComposeShowCc')?.addEventListener('click', () => setMailComposeRow('mailComposeCcRow', true));
    document.getElementById('mailComposeShowBcc')?.addEventListener('click', () => setMailComposeRow('mailComposeBccRow', true));
}

async function openAdminMail() {
    initAdminMailEvents();
    try {
        if (!mailState.accounts.length) {
            const data = await mailApi('/accounts');
            mailState.accounts = data.accounts || [];
        }
    } catch (e) {
        document.getElementById('mailAccounts').innerHTML = `<div class="mail-error">${escapeHtml(e.message)}</div>`;
        return;
    }

    if (!mailState.account) {
        const first = mailState.accounts.find((a) => a.configured);
        mailState.account = first ? first.id : null;
    }
    renderMailAccounts();

    if (!mailState.account) {
        document.getElementById('mailFolders').innerHTML = '';
        document.getElementById('mailList').innerHTML = '<div class="mail-error">Ни для одного ящика не задан пароль. Добавьте MAIL_PASS_SUPPORT, MAIL_PASS_INFO и т.д. в .env на сервере и перезапустите pm2.</div>';
        return;
    }

    loadMailFolders();
    loadMailMessages();
    refreshMailSummary();
    startAdminMailPolling();
}

function startAdminMailPolling() {
    stopAdminMailPolling();
    mailState.pollTimer = setInterval(() => {
        if (document.hidden || !mailState.account) return;
        refreshMailSummary();
        loadMailFolders({ silent: true });
        if (mailState.page === 1 && !mailState.search) loadMailMessages({ silent: true });
    }, MAIL_POLL_MS);
}

function stopAdminMailPolling() {
    if (mailState.pollTimer) {
        clearInterval(mailState.pollTimer);
        mailState.pollTimer = null;
    }
}

// Счётчик непрочитанных в меню, пока админка открыта на других вкладках
setInterval(() => {
    if (document.hidden || mailState.pollTimer) return;
    if (!currentAdminToken || currentActorType !== 'admin') return;
    refreshMailSummary();
}, MAIL_BADGE_POLL_MS);

setTimeout(() => {
    if (currentAdminToken && currentActorType === 'admin') refreshMailSummary();
}, 4000);
