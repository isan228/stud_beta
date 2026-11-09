// Корпоративная почта (IMAP/SMTP через /api/admin/mail)

const MAIL_API_URL = '/api/admin/mail';
const MAIL_POLL_MS = 60000;
const MAIL_BADGE_POLL_MS = 120000;
const MAIL_MAX_FILES = 10;
const MAIL_MAX_FILE_BYTES = 20 * 1024 * 1024;

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
    pollTimer: null,
    composeFiles: []
};

const MAIL_ICONS = {
    inbox: '<path d="M4 13h4l1.5 3h5L16 13h4M5 5h14l1 8v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5l1-8Z"/>',
    sent: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z"/>',
    drafts: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/>',
    junk: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
    trash: '<path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    archive: '<path d="M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
    folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z"/>',
    reply: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v4"/>',
    replyAll: '<path d="M7 14 2 9l5-5"/><path d="M12 14 7 9l5-5"/><path d="M7 9h8a6 6 0 0 1 6 6v4"/>',
    forward: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0-6 6v4"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    mailUnread: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    mailRead: '<path d="M3 10 12 4l9 6v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9Z"/><path d="m4 10.5 8 5.5 8-5.5"/>',
    back: '<path d="M15 18 9 12l6-6"/>',
    clip: '<path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z"/>',
    expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    envelope: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>'
};

function mailIcon(name, cls = '') {
    return `<svg class="mail-svg ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${MAIL_ICONS[name] || MAIL_ICONS.folder}</svg>`;
}

const FOLDER_ICON_BY_USE = {
    '\\Inbox': 'inbox',
    '\\Sent': 'sent',
    '\\Drafts': 'drafts',
    '\\Junk': 'junk',
    '\\Trash': 'trash',
    '\\Archive': 'archive'
};

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0891b2', '#4f46e5'];

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

// ---------- Форматирование ----------

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

function mailAvatar(person, size = '') {
    const source = (person && (person.name || person.address)) || '?';
    const parts = String(source).replace(/[<>"']/g, '').split(/[\s@._-]+/).filter(Boolean);
    const initials = ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    const key = String((person && person.address) || source).toLowerCase();
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
    return `<span class="mail-avatar ${size}" style="background:${color}">${escapeHtml(initials)}</span>`;
}

function mailFormatDate(value, full = false) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    if (full) {
        return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

function mailDateGroup(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Ранее';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - day) / 86400000);
    if (diffDays <= 0) return 'Сегодня';
    if (diffDays === 1) return 'Вчера';
    if (diffDays < 7) return 'На этой неделе';
    if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) return 'В этом месяце';
    return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());
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

function currentMailAccount() {
    return mailState.accounts.find((a) => a.id === mailState.account) || null;
}

// ---------- Ящики ----------

function renderMailAccounts() {
    const box = document.getElementById('mailAccounts');
    if (!box) return;
    if (!mailState.accounts.length) {
        box.innerHTML = '<div class="mail-side-empty">Ящиков нет</div>';
        return;
    }
    box.innerHTML = mailState.accounts.map((a) => {
        const s = mailState.summary[a.id];
        const unseen = s && s.unseen ? `<span class="mail-count">${s.unseen > 99 ? '99+' : s.unseen}</span>` : '';
        let hint = a.email;
        let state = '';
        if (!a.configured) {
            hint = 'Пароль не задан — нажмите, чтобы указать';
            state = 'is-unconfigured';
        } else if (s && s.error) {
            hint = s.error;
            state = 'has-error';
        }
        return `
            <button type="button" class="mail-account ${a.id === mailState.account ? 'active' : ''} ${state}"
                data-mail-account="${escapeHtml(a.id)}" title="${escapeHtml(hint)}">
                ${mailAvatar({ name: a.label, address: a.email }, 'is-sm')}
                <span class="mail-account-text">
                    <span class="mail-account-label">${escapeHtml(a.label)}</span>
                    <span class="mail-account-email">${escapeHtml(a.configured ? a.email : 'нужен пароль')}</span>
                </span>
                ${unseen}
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
    mailState.folders = [];
    renderMailAccounts();
    renderMailViewEmpty();
    await Promise.all([loadMailFolders(), loadMailMessages()]);
}

// ---------- Папки ----------

async function loadMailFolders({ silent = false } = {}) {
    const box = document.getElementById('mailFolders');
    if (!box || !mailState.account) return;
    if (!silent) box.innerHTML = '<div class="mail-side-empty">Загрузка...</div>';
    try {
        const data = await mailApi(`${mailAccountPath()}/folders`);
        mailState.folders = data.folders || [];
        renderMailFolders();
    } catch (e) {
        if (!silent) box.innerHTML = `<div class="mail-side-empty is-error">${escapeHtml(e.message)}</div>`;
    }
}

function renderMailFolders() {
    const box = document.getElementById('mailFolders');
    if (!box) return;
    if (!mailState.folders.length) {
        box.innerHTML = '<div class="mail-side-empty">Папок нет</div>';
        return;
    }
    box.innerHTML = mailState.folders.map((f) => `
        <button type="button" class="mail-folder ${f.path === mailState.folder ? 'active' : ''}" data-mail-folder="${escapeHtml(f.path)}">
            ${mailIcon(FOLDER_ICON_BY_USE[f.specialUse] || 'folder')}
            <span class="mail-folder-name">${escapeHtml(f.name)}</span>
            ${f.unseen ? `<span class="mail-count">${f.unseen > 999 ? '999+' : f.unseen}</span>` : ''}
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

function renderMailListSkeleton() {
    return Array.from({ length: 7 }, () => `
        <div class="mail-item is-skeleton">
            <span class="mail-avatar mail-skel"></span>
            <div class="mail-item-main">
                <span class="mail-skel mail-skel-line" style="width:45%"></span>
                <span class="mail-skel mail-skel-line" style="width:80%"></span>
            </div>
        </div>`).join('');
}

async function loadMailMessages({ silent = false } = {}) {
    const box = document.getElementById('mailList');
    if (!box || !mailState.account) return;
    const requestId = ++mailState.listRequestId;
    if (!silent) box.innerHTML = renderMailListSkeleton();
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
            box.innerHTML = `<div class="mail-placeholder is-error">${mailIcon('junk', 'is-xl')}<p>${escapeHtml(e.message)}</p></div>`;
            document.getElementById('mailPagination').innerHTML = '';
            document.getElementById('mailListCount').textContent = '';
        }
    }
}

function renderMailList() {
    const box = document.getElementById('mailList');
    const pag = document.getElementById('mailPagination');
    const countEl = document.getElementById('mailListCount');
    if (!box) return;
    const data = mailState.list;
    const messages = data?.messages || [];
    if (countEl) countEl.textContent = data?.total ? `${data.total}` : '';

    if (!messages.length) {
        const text = mailState.search || mailState.unseenOnly ? 'Ничего не найдено' : 'В этой папке пусто';
        box.innerHTML = `<div class="mail-placeholder">${mailIcon('envelope', 'is-xl')}<p>${text}</p></div>`;
        if (pag) pag.innerHTML = '';
        return;
    }

    const sentLike = isSentLikeFolder();
    let lastGroup = null;
    box.innerHTML = messages.map((m) => {
        const group = mailDateGroup(m.date);
        const groupHeader = group !== lastGroup ? `<div class="mail-group">${escapeHtml(group)}</div>` : '';
        lastGroup = group;
        const person = sentLike ? (m.to || [])[0] : (m.from || [])[0];
        const who = sentLike ? `Кому: ${mailShortName(m.to)}` : mailShortName(m.from);
        const classes = [
            'mail-item',
            m.seen ? '' : 'is-unread',
            mailState.current && mailState.current.uid === m.uid ? 'active' : ''
        ].join(' ');
        return `${groupHeader}
            <div class="${classes}" data-mail-uid="${m.uid}" role="button" tabindex="0">
                ${mailAvatar(person)}
                <div class="mail-item-main">
                    <div class="mail-item-row">
                        <span class="mail-item-from">${escapeHtml(who)}</span>
                        <span class="mail-item-date">${escapeHtml(mailFormatDate(m.date))}</span>
                    </div>
                    <div class="mail-item-row">
                        <span class="mail-item-subject">${escapeHtml(m.subject || '(без темы)')}</span>
                        <span class="mail-item-icons">
                            ${m.answered ? `<span title="Отвечено">${mailIcon('reply')}</span>` : ''}
                            ${m.hasAttachments ? `<span title="Есть вложения">${mailIcon('clip')}</span>` : ''}
                            ${m.flagged ? `<span class="is-flag" title="Помечено">${mailIcon('star', 'is-filled')}</span>` : ''}
                        </span>
                    </div>
                </div>
                <div class="mail-item-hover">
                    <button type="button" class="mail-icon-btn is-sm" data-mail-quick="flag" title="${m.flagged ? 'Снять пометку' : 'Пометить'}">${mailIcon('star', m.flagged ? 'is-filled' : '')}</button>
                    <button type="button" class="mail-icon-btn is-sm" data-mail-quick="toggleSeen" title="${m.seen ? 'Сделать непрочитанным' : 'Прочитано'}">${mailIcon(m.seen ? 'mailUnread' : 'mailRead')}</button>
                    <button type="button" class="mail-icon-btn is-sm is-danger" data-mail-quick="delete" title="Удалить">${mailIcon('trash')}</button>
                </div>
            </div>`;
    }).join('');

    if (pag) {
        const { page, totalPages, total, limit } = data;
        if (totalPages > 1) {
            const from = (page - 1) * limit + 1;
            const to = Math.min(page * limit, total);
            pag.innerHTML = `
                <span>${from}–${to} из ${total}</span>
                <button type="button" class="mail-icon-btn is-sm" data-mail-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} title="Новее">${mailIcon('back')}</button>
                <button type="button" class="mail-icon-btn is-sm is-flip" data-mail-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} title="Старее">${mailIcon('back')}</button>`;
        } else {
            pag.innerHTML = '';
        }
    }
}

function findListMessage(uid) {
    return mailState.list?.messages?.find((m) => m.uid === Number(uid)) || null;
}

async function handleMailQuickAction(uid, action) {
    const item = findListMessage(uid);
    if (!item) return;
    try {
        if (action === 'flag') {
            const flagged = !item.flagged;
            await mailApi(`${mailAccountPath()}/messages/${uid}`, { method: 'PATCH', json: { folder: mailState.folder, flagged } });
            item.flagged = flagged;
            if (mailState.current && mailState.current.uid === item.uid) {
                mailState.current.flagged = flagged;
                renderMailMessage(mailState.current);
            }
            renderMailList();
        } else if (action === 'toggleSeen') {
            const seen = !item.seen;
            await mailApi(`${mailAccountPath()}/messages/${uid}`, { method: 'PATCH', json: { folder: mailState.folder, seen } });
            item.seen = seen;
            renderMailList();
            loadMailFolders({ silent: true });
            refreshMailSummary();
        } else if (action === 'delete') {
            await deleteMailMessage(item.uid, mailState.folder);
        }
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

async function deleteMailMessage(uid, folder) {
    await mailApi(`${mailAccountPath()}/messages/${uid}?folder=${encodeURIComponent(folder)}`, { method: 'DELETE' });
    if (mailState.list?.messages) {
        mailState.list.messages = mailState.list.messages.filter((m) => m.uid !== Number(uid));
        mailState.list.total = Math.max(0, (mailState.list.total || 1) - 1);
    }
    if (mailState.current && mailState.current.uid === Number(uid)) {
        mailState.current = null;
        renderMailViewEmpty();
    }
    renderMailList();
    showNotification('Письмо перемещено в корзину', 'success');
    loadMailFolders({ silent: true });
    refreshMailSummary();
}

// ---------- Просмотр письма ----------

function renderMailViewEmpty() {
    const view = document.getElementById('mailView');
    if (view) {
        view.innerHTML = `
            <div class="mail-placeholder">
                ${mailIcon('envelope', 'is-xl')}
                <p>Выберите письмо, чтобы прочитать</p>
                <small>Горячие клавиши: <kbd>C</kbd> написать · <kbd>J</kbd>/<kbd>K</kbd> следующее/предыдущее · <kbd>R</kbd> ответить · <kbd>/</kbd> поиск</small>
            </div>`;
    }
    document.getElementById('mailLayout')?.classList.remove('is-viewing');
}

function buildMailFrameDoc(message) {
    const content = message.html
        ? message.html
        : `<pre>${escapeHtml(message.text || '')}</pre>`;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark'
        || document.body.classList.contains('dark-theme');
    const padding = dark ? '14px 16px 18px' : '4px 2px 20px';
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; frame-src 'none'">
<base target="_blank">
<style>
html{overflow-y:hidden;overflow-x:auto}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;font-size:14.5px;line-height:1.6;margin:0;padding:${padding};color:#1f2937;background:#fff;word-wrap:break-word;overflow-wrap:anywhere}
img{max-width:100%;height:auto}
a{color:#2563eb}
pre{white-space:pre-wrap;font-family:inherit;margin:0}
blockquote{margin:0 0 0 .5rem;padding-left:.75rem;border-left:3px solid #e5e7eb;color:#6b7280}
table{max-width:100%}
</style></head><body>${content}</body></html>`;
}

function fitMailFrame(frame) {
    if (!frame) return;
    const resize = () => {
        try {
            const doc = frame.contentDocument;
            if (!doc || !doc.body) return;
            // documentElement.scrollHeight не меньше высоты iframe — меряем только содержимое body
            const style = doc.defaultView.getComputedStyle(doc.body);
            const h = doc.body.getBoundingClientRect().height
                + parseFloat(style.marginTop || 0) + parseFloat(style.marginBottom || 0);
            frame.style.height = `${Math.max(Math.ceil(h) + 4, 120)}px`;
        } catch (_) { /* документ недоступен — остаётся высота по умолчанию */ }
    };
    frame.addEventListener('load', () => {
        resize();
        try {
            Array.from(frame.contentDocument?.images || []).forEach((img) => {
                if (!img.complete) img.addEventListener('load', resize, { once: true });
            });
        } catch (_) { /* ignore */ }
        setTimeout(resize, 400);
        setTimeout(resize, 1500);
    });
}

async function openMailMessage(uid) {
    const view = document.getElementById('mailView');
    if (!view) return;
    document.getElementById('mailLayout')?.classList.add('is-viewing');
    view.innerHTML = `
        <div class="mail-reader is-loading">
            <div class="mail-skel mail-skel-line" style="width:60%;height:22px"></div>
            <div class="mail-reader-sender">
                <span class="mail-avatar is-lg mail-skel"></span>
                <div style="flex:1"><span class="mail-skel mail-skel-line" style="width:40%"></span><span class="mail-skel mail-skel-line" style="width:25%"></span></div>
            </div>
            <div class="mail-skel" style="height:240px;border-radius:12px"></div>
        </div>`;
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
        view.innerHTML = `<div class="mail-placeholder is-error">${mailIcon('junk', 'is-xl')}<p>${escapeHtml(e.message)}</p></div>`;
    }
}

function markMailListItemSeen(uid) {
    const item = findListMessage(uid);
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
    const sender = (m.from || [])[0] || {};
    const attachments = (m.attachments || []).map((a) => `
        <button type="button" class="mail-attachment" data-mail-attachment="${a.index}" title="Скачать ${escapeHtml(a.filename)}">
            <span class="mail-attachment-icon">${mailIcon('clip')}</span>
            <span class="mail-attachment-text">
                <span class="mail-attachment-name">${escapeHtml(a.filename)}</span>
                <small>${escapeHtml(mailFormatSize(a.size))}</small>
            </span>
            <span class="mail-attachment-dl">${mailIcon('download')}</span>
        </button>`).join('');

    const recipients = [
        `кому: ${escapeHtml(mailFormatAddressList(m.to) || '—')}`,
        m.cc && m.cc.length ? `копия: ${escapeHtml(mailFormatAddressList(m.cc))}` : ''
    ].filter(Boolean).join(' · ');

    const account = currentMailAccount();
    view.innerHTML = `
        <div class="mail-reader">
            <div class="mail-reader-toolbar">
                <button type="button" class="mail-icon-btn mail-back-btn" data-mail-action="back" title="К списку">${mailIcon('back')}</button>
                <button type="button" class="mail-icon-btn" data-mail-action="reply" title="Ответить (R)">${mailIcon('reply')}</button>
                <button type="button" class="mail-icon-btn" data-mail-action="replyAll" title="Ответить всем (A)">${mailIcon('replyAll')}</button>
                <button type="button" class="mail-icon-btn" data-mail-action="forward" title="Переслать (F)">${mailIcon('forward')}</button>
                <span class="mail-toolbar-sep"></span>
                <button type="button" class="mail-icon-btn ${m.flagged ? 'is-on' : ''}" data-mail-action="flag" title="${m.flagged ? 'Снять пометку' : 'Пометить (S)'}">${mailIcon('star', m.flagged ? 'is-filled' : '')}</button>
                <button type="button" class="mail-icon-btn" data-mail-action="unread" title="Сделать непрочитанным (U)">${mailIcon('mailUnread')}</button>
                <button type="button" class="mail-icon-btn is-danger" data-mail-action="delete" title="Удалить (Delete)">${mailIcon('trash')}</button>
            </div>
            <div class="mail-reader-scroll">
                <h2 class="mail-reader-subject">${escapeHtml(m.subject || '(без темы)')}</h2>
                <div class="mail-reader-sender">
                    ${mailAvatar(sender, 'is-lg')}
                    <div class="mail-reader-who">
                        <div class="mail-reader-name">
                            <b>${escapeHtml(sender.name || sender.address || '—')}</b>
                            ${sender.name ? `<span>&lt;${escapeHtml(sender.address)}&gt;</span>` : ''}
                        </div>
                        <div class="mail-reader-to">${recipients}</div>
                    </div>
                    <time class="mail-reader-date">${escapeHtml(mailFormatDate(m.date, true))}</time>
                </div>
                ${attachments ? `<div class="mail-attachments">${attachments}</div>` : ''}
                <iframe class="mail-body-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="Текст письма"></iframe>
                <form class="mail-quick-reply" id="mailQuickReply">
                    <div class="mail-quick-reply-head">
                        ${mailIcon('reply')}
                        <span>Ответить ${escapeHtml(sender.name || sender.address || '')}${account ? ` от <b>${escapeHtml(account.email)}</b>` : ''}</span>
                    </div>
                    <textarea id="mailQuickReplyText" rows="3" placeholder="Напишите ответ… (Ctrl + Enter — отправить)"></textarea>
                    <div class="mail-quick-reply-actions">
                        <button type="submit" class="btn btn-primary btn-sm mail-send-btn">${mailIcon('send')} Отправить</button>
                        <button type="button" class="mail-link-btn" data-mail-action="reply">${mailIcon('expand')} Открыть в полном окне</button>
                    </div>
                </form>
            </div>
        </div>`;
    const frame = view.querySelector('.mail-body-frame');
    if (frame) {
        fitMailFrame(frame);
        frame.srcdoc = buildMailFrameDoc(m);
    }
}

function mailMessagePlainText(m) {
    if (m.text) return m.text;
    if (!m.html) return '';
    const doc = new DOMParser().parseFromString(m.html, 'text/html');
    doc.querySelectorAll('style, script, head, title').forEach((n) => n.remove());
    doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote, table').forEach((el) => el.append('\n'));
    return (doc.body?.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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
        mailState.current = null;
        renderMailViewEmpty();
        document.querySelectorAll('.mail-item.active').forEach((el) => el.classList.remove('active'));
        return;
    }
    if (!m) return;

    if (action === 'reply' || action === 'replyAll' || action === 'forward') {
        const draft = document.getElementById('mailQuickReplyText')?.value || '';
        openMailCompose(action, m, draft);
        return;
    }

    try {
        if (action === 'unread') {
            await mailApi(`${mailAccountPath()}/messages/${m.uid}`, { method: 'PATCH', json: { folder: m.folder, seen: false } });
            const item = findListMessage(m.uid);
            if (item) item.seen = false;
            mailState.current = null;
            renderMailViewEmpty();
            renderMailList();
            loadMailFolders({ silent: true });
            refreshMailSummary();
        } else if (action === 'flag') {
            const flagged = !m.flagged;
            await mailApi(`${mailAccountPath()}/messages/${m.uid}`, { method: 'PATCH', json: { folder: m.folder, flagged } });
            m.flagged = flagged;
            const item = findListMessage(m.uid);
            if (item) item.flagged = flagged;
            const toolbarBtn = document.querySelector('.mail-reader-toolbar [data-mail-action="flag"]');
            if (toolbarBtn) {
                toolbarBtn.classList.toggle('is-on', flagged);
                toolbarBtn.innerHTML = mailIcon('star', flagged ? 'is-filled' : '');
            }
            renderMailList();
        } else if (action === 'delete') {
            await deleteMailMessage(m.uid, m.folder);
        }
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

function buildReplyPayload(source, mode) {
    const ownEmails = new Set(mailState.accounts.map((a) => a.email.toLowerCase()));
    const replyTargets = (source.replyTo && source.replyTo.length) ? source.replyTo : (source.from || []);
    let cc = [];
    if (mode === 'replyAll') {
        const seen = new Set(replyTargets.map((a) => String(a.address || '').toLowerCase()));
        cc = [...(source.to || []), ...(source.cc || [])].filter((a) => {
            const addr = String(a.address || '').toLowerCase();
            if (!addr || ownEmails.has(addr) || seen.has(addr)) return false;
            seen.add(addr);
            return true;
        });
    }
    const plain = mailMessagePlainText(source);
    const quoteHeader = `${mailFormatDate(source.date, true)}, ${mailFormatAddressList(source.from)} пишет:`;
    const quoted = plain.split(/\r?\n/).map((line) => `> ${line}`).join('\n');
    return {
        to: mailFormatAddressList(replyTargets),
        cc: mailFormatAddressList(cc),
        subject: prefixSubject('Re', source.subject),
        quote: `${quoteHeader}\n${quoted}`,
        inReplyTo: source.messageId || '',
        references: source.messageId ? [...(source.references || []), source.messageId].join(' ') : ''
    };
}

async function submitMailQuickReply(e) {
    e.preventDefault();
    const m = mailState.current;
    const textarea = document.getElementById('mailQuickReplyText');
    const btn = e.target.querySelector('button[type="submit"]');
    if (!m || !textarea) return;
    const text = textarea.value.trim();
    if (!text) {
        textarea.focus();
        return;
    }
    const reply = buildReplyPayload(m, 'reply');
    if (!reply.to) {
        showNotification('Не удалось определить адрес получателя', 'error');
        return;
    }
    const fd = new FormData();
    fd.append('to', reply.to);
    fd.append('subject', reply.subject);
    fd.append('text', `${text}\n\n${reply.quote}`);
    if (reply.inReplyTo) fd.append('inReplyTo', reply.inReplyTo);
    if (reply.references) fd.append('references', reply.references);
    fd.append('replyToUid', String(m.uid));
    fd.append('replyFolder', m.folder);

    btn.disabled = true;
    try {
        await mailApi(`${mailAccountPath()}/send`, { method: 'POST', body: fd });
        textarea.value = '';
        showNotification('Ответ отправлен', 'success');
        const item = findListMessage(m.uid);
        if (item) item.answered = true;
        renderMailList();
        loadMailFolders({ silent: true });
    } catch (err) {
        showNotification(err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

// ---------- Написать / ответить ----------

function fillMailComposeFrom(selectedId) {
    const select = document.getElementById('mailComposeFrom');
    if (!select) return;
    select.innerHTML = mailState.accounts
        .filter((a) => a.configured)
        .map((a) => `<option value="${escapeHtml(a.id)}" ${a.id === selectedId ? 'selected' : ''}>${escapeHtml(a.fromName)} &lt;${escapeHtml(a.email)}&gt; — ${escapeHtml(a.label)}</option>`)
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

function renderMailComposeFiles() {
    const box = document.getElementById('mailComposeFileList');
    if (!box) return;
    box.innerHTML = mailState.composeFiles.map((f, i) => `
        <span class="mail-file-chip">
            ${mailIcon('clip')}
            <span class="mail-file-chip-name">${escapeHtml(f.name)}</span>
            <small>${escapeHtml(mailFormatSize(f.size))}</small>
            <button type="button" data-mail-file-remove="${i}" title="Убрать">&times;</button>
        </span>`).join('');
}

function addMailComposeFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const f of files) {
        if (mailState.composeFiles.length >= MAIL_MAX_FILES) {
            showNotification(`Не больше ${MAIL_MAX_FILES} файлов`, 'error');
            break;
        }
        if (f.size > MAIL_MAX_FILE_BYTES) {
            showNotification(`«${f.name}» больше 20 МБ`, 'error');
            continue;
        }
        mailState.composeFiles.push(f);
    }
    renderMailComposeFiles();
}

function openMailCompose(mode = 'new', source = null, draftText = '') {
    const modal = document.getElementById('mailComposeModal');
    const form = document.getElementById('mailComposeForm');
    if (!modal || !form) return;
    if (!mailState.accounts.some((a) => a.configured)) {
        openMailSettings();
        return;
    }
    form.reset();
    mailState.composeFiles = [];
    renderMailComposeFiles();

    fillMailComposeFrom(mailState.account);
    setMailComposeRow('mailComposeCcRow', false);
    setMailComposeRow('mailComposeBccRow', false);
    ['mailComposeInReplyTo', 'mailComposeReferences', 'mailComposeReplyUid', 'mailComposeReplyFolder'].forEach((id) => {
        document.getElementById(id).value = '';
    });

    let title = 'Новое письмо';
    if (source && mode !== 'new') {
        if (mode === 'forward') {
            title = 'Пересылка';
            document.getElementById('mailComposeSubject').value = prefixSubject('Fwd', source.subject);
            document.getElementById('mailComposeBody').value = [
                draftText, '',
                '---------- Пересланное сообщение ----------',
                `От: ${mailFormatAddressList(source.from)}`,
                `Дата: ${mailFormatDate(source.date, true)}`,
                `Тема: ${source.subject || ''}`,
                `Кому: ${mailFormatAddressList(source.to)}`,
                '',
                mailMessagePlainText(source)
            ].join('\n');
        } else {
            title = mode === 'replyAll' ? 'Ответ всем' : 'Ответ';
            const reply = buildReplyPayload(source, mode);
            document.getElementById('mailComposeTo').value = reply.to;
            if (reply.cc) {
                document.getElementById('mailComposeCc').value = reply.cc;
                setMailComposeRow('mailComposeCcRow', true);
            }
            document.getElementById('mailComposeSubject').value = reply.subject;
            document.getElementById('mailComposeBody').value = `${draftText}\n\n${reply.quote}`;
            document.getElementById('mailComposeInReplyTo').value = reply.inReplyTo;
            document.getElementById('mailComposeReferences').value = reply.references;
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
        if (focusId === 'mailComposeBody') {
            const pos = draftText.length;
            focusEl.setSelectionRange(pos, pos);
            focusEl.scrollTop = 0;
        }
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
    mailState.composeFiles.forEach((f) => fd.append('attachments', f));

    btn.disabled = true;
    btn.textContent = 'Отправка...';
    try {
        const result = await mailApi(`/${encodeURIComponent(from)}/send`, { method: 'POST', body: fd });
        document.getElementById('mailComposeModal').style.display = 'none';
        mailState.composeFiles = [];
        if (result.rejected && result.rejected.length) {
            showNotification(`Отправлено, но отклонены адреса: ${result.rejected.join(', ')}`, 'error');
        } else if (!result.savedToSent) {
            showNotification('Письмо отправлено, но копия не сохранилась в «Отправленные»', 'info');
        } else {
            showNotification('Письмо отправлено', 'success');
        }
        const replyUid = Number(document.getElementById('mailComposeReplyUid').value);
        if (replyUid) {
            const item = findListMessage(replyUid);
            if (item) item.answered = true;
            renderMailList();
        }
        if (from === mailState.account) {
            loadMailFolders({ silent: true });
            if (isSentLikeFolder()) loadMailMessages({ silent: true });
        }
    } catch (err) {
        showNotification(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Отправить';
    }
}

// ---------- Настройки ящиков ----------

function mailPasswordStatus(a) {
    if (a.passwordSource === 'admin') return '<span class="mail-settings-status ok">Пароль задан</span>';
    if (a.passwordSource === 'env') return '<span class="mail-settings-status ok">Пароль из .env</span>';
    return '<span class="mail-settings-status missing">Пароль не задан</span>';
}

function renderMailSettings() {
    const box = document.getElementById('mailSettingsList');
    if (!box) return;
    if (!mailState.accounts.length) {
        box.innerHTML = '<div class="mail-side-empty">Ящиков нет — добавьте первый ниже</div>';
        return;
    }
    box.innerHTML = mailState.accounts.map((a) => `
        <form class="mail-settings-item" data-mail-settings-id="${escapeHtml(a.id)}">
            <div class="mail-settings-item-head">
                <span class="mail-settings-title">
                    ${mailAvatar({ name: a.label, address: a.email }, 'is-sm')}
                    <b>${escapeHtml(a.email)}</b>
                </span>
                ${mailPasswordStatus(a)}
            </div>
            <div class="mail-settings-grid">
                <label>Название
                    <input type="text" name="label" value="${escapeHtml(a.label)}" maxlength="60">
                </label>
                <label>Имя отправителя
                    <input type="text" name="fromName" value="${escapeHtml(a.customFromName || '')}" placeholder="${escapeHtml(a.fromName || 'stud.kg')}" maxlength="100">
                </label>
                <label>${a.configured ? 'Новый пароль' : 'Пароль'}
                    <input type="password" name="password" placeholder="${a.configured ? 'Оставьте пустым, чтобы не менять' : 'Пароль ящика'}" autocomplete="new-password">
                </label>
            </div>
            <div class="mail-settings-actions">
                <button type="submit" class="btn btn-primary btn-sm">Сохранить</button>
                <button type="button" class="btn btn-secondary btn-sm" data-mail-settings-act="test" ${a.configured ? '' : 'disabled'}>Проверить вход</button>
                ${a.passwordSource === 'admin' ? '<button type="button" class="btn btn-secondary btn-sm" data-mail-settings-act="clear">Удалить пароль</button>' : ''}
                <button type="button" class="btn btn-danger btn-sm" data-mail-settings-act="remove">Убрать ящик</button>
                <span class="mail-settings-result"></span>
            </div>
        </form>`).join('');
}

async function reloadMailAccounts() {
    const data = await mailApi('/accounts');
    mailState.accounts = data.accounts || [];
    const current = mailState.accounts.find((a) => a.id === mailState.account);
    if (!current || !current.configured) {
        mailState.account = null;
        mailState.folder = 'INBOX';
        mailState.page = 1;
        mailState.current = null;
    }
    renderMailSettings();
    await openAdminMail();
}

async function openMailSettings() {
    const modal = document.getElementById('mailSettingsModal');
    if (!modal) return;
    renderMailSettings();
    modal.style.display = 'block';
    try {
        const data = await mailApi('/accounts');
        mailState.accounts = data.accounts || [];
        renderMailSettings();
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

function setMailSettingsResult(form, text, ok) {
    const el = form.querySelector('.mail-settings-result');
    if (!el) return;
    el.textContent = text;
    el.className = `mail-settings-result ${ok === true ? 'ok' : ok === false ? 'fail' : ''}`;
}

async function submitMailAccountSettings(e) {
    const form = e.target.closest('[data-mail-settings-id]');
    if (!form) return;
    e.preventDefault();
    const id = form.dataset.mailSettingsId;
    const payload = {
        label: form.elements.label.value,
        fromName: form.elements.fromName.value
    };
    const password = form.elements.password.value;
    if (password) payload.password = password;

    setMailSettingsResult(form, 'Сохранение...');
    try {
        await mailApi(`/accounts/${encodeURIComponent(id)}`, { method: 'PUT', json: payload });
        showNotification('Настройки ящика сохранены', 'success');
        await reloadMailAccounts();
        if (password) {
            const fresh = document.querySelector(`.mail-settings-item[data-mail-settings-id="${CSS.escape(id)}"]`);
            if (fresh) await testMailAccountFromSettings(fresh, id);
        }
    } catch (err) {
        setMailSettingsResult(form, err.message, false);
    }
}

async function testMailAccountFromSettings(form, id) {
    setMailSettingsResult(form, 'Проверяем вход...');
    try {
        const r = await mailApi(`/accounts/${encodeURIComponent(id)}/test`, { method: 'POST' });
        if (r.imap && r.smtp) {
            setMailSettingsResult(form, '✓ Вход работает (чтение и отправка)', true);
        } else {
            setMailSettingsResult(form, `✗ ${(r.errors || []).join('; ') || 'Не удалось войти'}`, false);
        }
    } catch (err) {
        setMailSettingsResult(form, `✗ ${err.message}`, false);
    }
}

async function handleMailSettingsClick(e) {
    const btn = e.target.closest('[data-mail-settings-act]');
    if (!btn) return;
    const form = btn.closest('[data-mail-settings-id]');
    const id = form?.dataset.mailSettingsId;
    if (!id) return;
    const act = btn.dataset.mailSettingsAct;

    try {
        if (act === 'test') {
            await testMailAccountFromSettings(form, id);
        } else if (act === 'clear') {
            if (!confirm('Удалить сохранённый пароль этого ящика?')) return;
            await mailApi(`/accounts/${encodeURIComponent(id)}`, { method: 'PUT', json: { clearPassword: true } });
            showNotification('Пароль удалён', 'success');
            await reloadMailAccounts();
        } else if (act === 'remove') {
            if (!confirm('Убрать ящик из админки? Сами письма на сервере не удалятся.')) return;
            await mailApi(`/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
            showNotification('Ящик убран из админки', 'success');
            await reloadMailAccounts();
        }
    } catch (err) {
        setMailSettingsResult(form, err.message, false);
    }
}

async function submitMailAddAccount(e) {
    e.preventDefault();
    const email = document.getElementById('mailAddEmail').value.trim();
    const label = document.getElementById('mailAddLabel').value.trim();
    const password = document.getElementById('mailAddPassword').value;
    try {
        const data = await mailApi('/accounts', { method: 'POST', json: { email, label, password: password || undefined } });
        e.target.reset();
        showNotification('Ящик добавлен', 'success');
        await reloadMailAccounts();
        if (password && data.account) {
            const fresh = document.querySelector(`.mail-settings-item[data-mail-settings-id="${CSS.escape(data.account.id)}"]`);
            if (fresh) await testMailAccountFromSettings(fresh, data.account.id);
        }
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

// ---------- Горячие клавиши ----------

function isMailTabActive() {
    return !!document.getElementById('mailTab')?.classList.contains('active');
}

function isAnyModalOpen() {
    return Array.from(document.querySelectorAll('.modal')).some((m) => m.style.display && m.style.display !== 'none');
}

function moveMailSelection(step) {
    const messages = mailState.list?.messages || [];
    if (!messages.length) return;
    const idx = mailState.current ? messages.findIndex((m) => m.uid === mailState.current.uid) : -1;
    const next = messages[Math.min(Math.max(idx + step, 0), messages.length - 1)];
    if (next && (!mailState.current || next.uid !== mailState.current.uid)) {
        openMailMessage(next.uid);
        document.querySelector(`.mail-item[data-mail-uid="${next.uid}"]`)?.scrollIntoView({ block: 'nearest' });
    }
}

function handleMailKeydown(e) {
    if (!isMailTabActive()) return;

    const composeOpen = document.getElementById('mailComposeModal')?.style.display === 'block';
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (composeOpen) {
            e.preventDefault();
            document.getElementById('mailComposeForm')?.requestSubmit();
        } else if (document.activeElement?.id === 'mailQuickReplyText') {
            e.preventDefault();
            document.getElementById('mailQuickReply')?.requestSubmit();
        }
        return;
    }

    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || document.activeElement?.isContentEditable) return;
    if (isAnyModalOpen() || e.ctrlKey || e.metaKey || e.altKey) return;

    // e.code — физическая клавиша, поэтому работает и в русской раскладке
    const map = {
        KeyC: () => openMailCompose('new'),
        KeyJ: () => moveMailSelection(1),
        ArrowDown: () => moveMailSelection(1),
        KeyK: () => moveMailSelection(-1),
        ArrowUp: () => moveMailSelection(-1),
        KeyR: () => handleMailAction('reply'),
        KeyA: () => handleMailAction('replyAll'),
        KeyF: () => handleMailAction('forward'),
        KeyS: () => handleMailAction('flag'),
        KeyU: () => handleMailAction('unread'),
        Delete: () => handleMailAction('delete'),
        Escape: () => handleMailAction('back'),
        Slash: () => document.getElementById('mailSearch')?.focus()
    };
    const fn = map[e.code];
    if (fn) {
        e.preventDefault();
        fn();
    }
}

// ---------- Инициализация ----------

function setMailFilter(filter) {
    mailState.unseenOnly = filter === 'unread';
    mailState.page = 1;
    document.querySelectorAll('[data-mail-filter]').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.mailFilter === filter);
    });
    loadMailMessages();
}

function initAdminMailEvents() {
    if (mailState.initialized) return;
    mailState.initialized = true;

    document.getElementById('mailAccounts')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mail-account]');
        if (!btn) return;
        const account = mailState.accounts.find((a) => a.id === btn.dataset.mailAccount);
        if (account && !account.configured) {
            openMailSettings();
            return;
        }
        selectMailAccount(btn.dataset.mailAccount);
    });
    document.getElementById('mailFolders')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mail-folder]');
        if (btn) selectMailFolder(btn.dataset.mailFolder);
    });

    const list = document.getElementById('mailList');
    list?.addEventListener('click', (e) => {
        if (e.target.closest('[data-mail-open-settings]')) {
            openMailSettings();
            return;
        }
        const row = e.target.closest('[data-mail-uid]');
        if (!row) return;
        const quick = e.target.closest('[data-mail-quick]');
        if (quick) {
            e.stopPropagation();
            handleMailQuickAction(Number(row.dataset.mailUid), quick.dataset.mailQuick);
            return;
        }
        openMailMessage(Number(row.dataset.mailUid));
    });
    list?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const row = e.target.closest('[data-mail-uid]');
        if (!row || e.target.closest('[data-mail-quick]')) return;
        e.preventDefault();
        openMailMessage(Number(row.dataset.mailUid));
    });

    document.getElementById('mailPagination')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mail-page]');
        if (!btn || btn.disabled) return;
        mailState.page = Math.max(1, Number(btn.dataset.mailPage) || 1);
        loadMailMessages();
        document.getElementById('mailList')?.scrollTo({ top: 0 });
    });

    const view = document.getElementById('mailView');
    view?.addEventListener('click', (e) => {
        const att = e.target.closest('[data-mail-attachment]');
        if (att) {
            downloadMailAttachment(att.dataset.mailAttachment);
            return;
        }
        const btn = e.target.closest('[data-mail-action]');
        if (btn) handleMailAction(btn.dataset.mailAction);
    });
    view?.addEventListener('submit', (e) => {
        if (e.target.id === 'mailQuickReply') submitMailQuickReply(e);
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
    document.getElementById('mailSearch')?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.target.value = '';
            e.target.blur();
            if (mailState.search) {
                mailState.search = '';
                mailState.page = 1;
                loadMailMessages();
            }
        }
    });
    document.querySelectorAll('[data-mail-filter]').forEach((chip) => {
        chip.addEventListener('click', () => setMailFilter(chip.dataset.mailFilter));
    });
    document.getElementById('mailRefreshBtn')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        btn.classList.add('is-spinning');
        setTimeout(() => btn.classList.remove('is-spinning'), 800);
        loadMailFolders({ silent: true });
        loadMailMessages();
        refreshMailSummary();
    });

    document.getElementById('mailComposeBtn')?.addEventListener('click', () => openMailCompose('new'));
    document.getElementById('mailFabCompose')?.addEventListener('click', () => openMailCompose('new'));
    document.getElementById('mailSettingsBtn')?.addEventListener('click', openMailSettings);
    document.getElementById('mailSettingsList')?.addEventListener('submit', submitMailAccountSettings);
    document.getElementById('mailSettingsList')?.addEventListener('click', handleMailSettingsClick);
    document.getElementById('mailAddAccountForm')?.addEventListener('submit', submitMailAddAccount);
    document.getElementById('mailComposeForm')?.addEventListener('submit', submitMailCompose);
    document.getElementById('mailComposeShowCc')?.addEventListener('click', () => {
        setMailComposeRow('mailComposeCcRow', true);
        document.getElementById('mailComposeCc')?.focus();
    });
    document.getElementById('mailComposeShowBcc')?.addEventListener('click', () => {
        setMailComposeRow('mailComposeBccRow', true);
        document.getElementById('mailComposeBcc')?.focus();
    });
    document.getElementById('mailComposeFiles')?.addEventListener('change', (e) => {
        addMailComposeFiles(e.target.files);
        e.target.value = '';
    });
    document.getElementById('mailComposeFileList')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mail-file-remove]');
        if (!btn) return;
        mailState.composeFiles.splice(Number(btn.dataset.mailFileRemove), 1);
        renderMailComposeFiles();
    });

    const composeContent = document.querySelector('#mailComposeModal .mail-compose-modal');
    composeContent?.addEventListener('dragover', (e) => {
        e.preventDefault();
        composeContent.classList.add('is-dragover');
    });
    composeContent?.addEventListener('dragleave', (e) => {
        if (!composeContent.contains(e.relatedTarget)) composeContent.classList.remove('is-dragover');
    });
    composeContent?.addEventListener('drop', (e) => {
        e.preventDefault();
        composeContent.classList.remove('is-dragover');
        addMailComposeFiles(e.dataTransfer?.files);
    });

    document.addEventListener('keydown', handleMailKeydown);
}

async function openAdminMail() {
    initAdminMailEvents();
    try {
        if (!mailState.accounts.length) {
            const data = await mailApi('/accounts');
            mailState.accounts = data.accounts || [];
        }
    } catch (e) {
        document.getElementById('mailAccounts').innerHTML = `<div class="mail-side-empty is-error">${escapeHtml(e.message)}</div>`;
        return;
    }

    if (!mailState.account) {
        const first = mailState.accounts.find((a) => a.configured);
        mailState.account = first ? first.id : null;
    }
    renderMailAccounts();

    if (!mailState.account) {
        document.getElementById('mailFolders').innerHTML = '';
        document.getElementById('mailPagination').innerHTML = '';
        document.getElementById('mailListCount').textContent = '';
        renderMailViewEmpty();
        document.getElementById('mailList').innerHTML = `
            <div class="mail-placeholder">
                ${mailIcon('envelope', 'is-xl')}
                <p>Ни для одного ящика не задан пароль</p>
                <button type="button" class="btn btn-primary btn-sm" data-mail-open-settings>Указать пароли</button>
            </div>`;
        return;
    }

    if (!mailState.current) renderMailViewEmpty();
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
