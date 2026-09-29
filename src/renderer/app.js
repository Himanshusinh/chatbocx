'use strict';

/* global api */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICON = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  users: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  groupAdd: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  clip: svg('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'),
  send: svg('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>'),
  smile: svg('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>'),
  search: svg('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>'),
  reply: svg('<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>'),
  trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  folder: svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
  open: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'),
  x: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  retry: svg('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
  hash: svg('<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>'),
  wifi: svg('<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  down: svg('<polyline points="6 9 12 15 18 9"/>'),
  upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 'width="40" height="40"'),
  pin: svg('<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1V4H8v2h1z"/>'),
  mute: svg('<path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'),
  unmute: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>'),
  forward: svg('<polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>'),
  copyAddr: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  help: svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
};
const TICK_ONE = '<svg viewBox="0 0 16 11" width="16" height="11"><path d="M1 6l3.5 3.5L11 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TICK_TWO = '<svg viewBox="0 0 20 11" width="20" height="11"><path d="M1 6l3.5 3.5L11 2M8 8.5l1 1L16 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '✅'];
const EMOJIS = (
  '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🤯 🥳 😎 🤓 🧐 😕 😟 😮 😲 😳 🥺 😦 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 😤 😡 😠 🤬 ' +
  '👍 👎 👌 ✌️ 🤞 🤝 🙏 👏 🙌 👐 💪 👋 🤙 👉 👈 👆 👇 ☝️ ✋ 🤚 🖐️ ✍️ 👀 🧠 ' +
  '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💯 💥 🔥 ✨ ⭐ 🌟 ⚡ 🎉 🎊 🎁 🏆 🥇 ✅ ❌ ⚠️ ❓ ❗ 💡 📌 📎 📁 📄 📊 📈 📉 🗓️ ⏰ ☕ 🍕 🍰 🚀 💻 🖥️ 📱 🔒 🔑 📣 💬'
).split(' ');

const S = {
  state: null,
  active: 'general',
  messages: [],
  hasMore: false,
  loadingOlder: false,
  stickBottom: true,
  unreadMarker: null,
  typing: new Map(),
  replyTo: null,
  editing: null,
  transfers: new Map(),
  filter: '',
  focused: true,
  lastTypingSent: 0,
  update: null,
};

// ------------------------------------------------------------------ helpers

const me = () => S.state.me;
const netAddrs = (st = S.state) =>
  (st?.addresses || []).map((a) => (typeof a === 'string' ? { ip: a, kind: '' } : a)).filter((a) => a && a.ip);
const addrLabel = (a) => (a.kind && a.kind !== 'Network' ? `${a.kind} ${a.ip}` : a.ip);
const peerById = (id) => S.state.peers.find((p) => p.id === id);
const groupById = (id) => S.state.groups.find((g) => g.id === id);
const dmId = (a, b) => `dm:${[a, b].sort().join(':')}`;
const peerOfDm = (convId) => convId.slice(3).split(':').find((id) => id !== me().id);

function nameOf(id) {
  if (id === me().id) return 'You';
  return peerById(id)?.name || 'Unknown';
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function avatar(name, color, { size = 36, status = null, square = false } = {}) {
  const dot = status ? `<span class="status-dot ${status}"></span>` : '';
  return `<span class="avatar${square ? ' square' : ''}" style="--size:${size}px;background:${esc(color || '#64748b')}">${esc(initials(name))}${dot}</span>`;
}

function peerStatus(p) {
  if (!p || !p.online) return 'offline';
  return p.status || 'online';
}

function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  if (sec < 60) return `${Math.ceil(sec)}s left`;
  if (sec < 3600) return `${Math.ceil(sec / 60)} min left`;
  return `${(sec / 3600).toFixed(1)} h left`;
}

const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function fmtDay(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function fmtListTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString()) return fmtTime(ts);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtAgo(ts) {
  if (!ts) return 'never';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

const FILE_KINDS = [
  [/\.(pdf)$/i, 'PDF', '#ef4444'],
  [/\.(docx?|odt|rtf|pages)$/i, 'DOC', '#3b82f6'],
  [/\.(xlsx?|csv|ods|numbers)$/i, 'XLS', '#16a34a'],
  [/\.(pptx?|odp|key)$/i, 'PPT', '#f97316'],
  [/\.(zip|rar|7z|tar|gz|tgz|bz2|xz|dmg|iso)$/i, 'ZIP', '#a855f7'],
  [/\.(png|jpe?g|gif|webp|bmp|heic|svg|tiff?)$/i, 'IMG', '#ec4899'],
  [/\.(mp4|mov|avi|mkv|webm|m4v|wmv)$/i, 'VID', '#8b5cf6'],
  [/\.(mp3|wav|aac|flac|m4a|ogg)$/i, 'AUD', '#14b8a6'],
  [/\.(txt|md|log|json|xml|ya?ml|js|ts|py|java|c|cpp|cs|go|rs|html|css|sql)$/i, 'TXT', '#64748b'],
  [/\.(exe|msi|pkg|app|apk)$/i, 'APP', '#0ea5e9'],
];
function fileKind(name) {
  for (const [re, label, color] of FILE_KINDS) if (re.test(name)) return { label, color };
  const ext = (name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase();
  return { label: name.includes('.') ? ext : 'FILE', color: '#64748b' };
}

function formatText(raw) {
  const tokens = [];
  const hold = (html) => `\u0000${tokens.push(html) - 1}\u0000`;
  let s = esc(raw);
  s = s.replace(/```\n?([\s\S]*?)```/g, (_, c) => hold(`<pre>${c}</pre>`));
  s = s.replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${c}</code>`));
  s = s.replace(/https?:\/\/[^\s<]+[^\s<.,:;"')\]]/g, (u) => hold(`<a href="#" data-url="${u}">${u}</a>`));
  const people = S.state ? [me(), ...S.state.peers] : [];
  people.sort((a, b) => String(b.name).length - String(a.name).length);
  for (const p of people) {
    if (!p?.name) continue;
    const re = new RegExp(`@(?:${esc(p.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
    s = s.replace(re, (m) => hold(`<span class="mention">${m}</span>`));
  }
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<b>$2</b>');
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>');
  s = s.replace(/(^|[\s(])~([^~\n]+)~(?=[\s).,!?:;]|$)/g, '$1<s>$2</s>');
  s = s.replace(/\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]);
}

const isJumbo = (t) => t && t.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s|\u200d|\ufe0f)+$/u.test(t);

function toast(text, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.classList.add('hide'), 3500);
  setTimeout(() => el.remove(), 4000);
}

const errText = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

async function call(method, ...args) {
  try {
    return await api.call(method, ...args);
  } catch (err) {
    toast(errText(err), 'error');
    throw err;
  }
}

// ---------------------------------------------------------- conversations

function convTitle(convId) {
  if (convId === 'general') return 'general';
  if (convId.startsWith('dm:')) return peerById(peerOfDm(convId))?.name || 'Unknown';
  return groupById(convId)?.name || 'Group';
}

function recipientsCount(convId) {
  if (convId === 'general') return S.state.peers.length;
  if (convId.startsWith('dm:')) return 1;
  return Math.max(0, (groupById(convId)?.members.length || 1) - 1);
}

function convIcon(convId, size = 36) {
  if (convId === 'general') return `<span class="avatar square hash" style="--size:${size}px">${ICON.hash}</span>`;
  if (convId.startsWith('dm:')) {
    const p = peerById(peerOfDm(convId));
    return avatar(p?.name, p?.color, { size, status: peerStatus(p) });
  }
  const g = groupById(convId);
  let hash = 0;
  for (const ch of convId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return avatar(g?.name, COLORS[hash % COLORS.length], { size, square: true });
}

function typingNames(convId) {
  const map = S.typing.get(convId);
  if (!map) return [];
  return [...map.keys()].map(nameOf);
}

function convExists(convId) {
  if (convId === 'general') return true;
  if (convId.startsWith('dm:')) return !!peerById(peerOfDm(convId));
  return !!groupById(convId);
}

function isPinned(convId) {
  return (S.state.pinned || []).includes(convId);
}

function isMuted(convId) {
  return (S.state.muted || []).includes(convId);
}

function renderSidebar() {
  const st = S.state;
  const status = st.me.status || 'online';
  $('#me-btn').innerHTML = `${avatar(st.me.name, st.me.color, { size: 34, status })}
    <span class="me-text"><span class="me-name">${esc(st.me.name)}</span><span class="me-status">${esc(status === 'busy' ? 'Do not disturb' : status === 'away' ? 'Away' : 'Available')}</span></span>`;

  const f = S.filter.trim().toLowerCase();
  const match = (name) => !f || name.toLowerCase().includes(f);
  const activity = (id) => st.convs[id]?.lastActivity || 0;

  const item = (convId, name, preview, extraClass = '') => {
    const c = st.convs[convId] || {};
    const typing = typingNames(convId);
    const previewHtml = typing.length ? `<span class="typing-preview">typing…</span>` : esc(preview);
    const flags = `${isMuted(convId) ? `<span class="conv-flag" title="Muted">${ICON.mute}</span>` : ''}${isPinned(convId) ? `<span class="conv-flag" title="Pinned">${ICON.pin}</span>` : ''}`;
    return `<button class="conv-item ${convId === S.active ? 'active' : ''} ${c.unread ? 'unread' : ''} ${extraClass}" data-conv="${esc(convId)}">
      ${convIcon(convId, 36)}
      <span class="conv-text">
        <span class="conv-row"><span class="conv-name">${esc(name)}</span>${flags}<span class="conv-time">${fmtListTime(c.last?.ts)}</span></span>
        <span class="conv-row"><span class="conv-preview">${previewHtml}</span>${c.unread ? `<span class="badge">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}</span>
      </span>
    </button>`;
  };
  const preview = (convId, fallback) => {
    const last = st.convs[convId]?.last;
    if (!last) return fallback;
    if (last.system) return last.text;
    const who = last.from === st.me.id ? 'You: ' : convId.startsWith('dm:') ? '' : `${nameOf(last.from).split(' ')[0]}: `;
    return who + last.text;
  };

  const onlineCount = st.peers.filter((p) => p.online).length;
  let html = '';
  const pinned = (st.pinned || []).filter((id) => convExists(id) && match(convTitle(id)));
  if (pinned.length) {
    html += '<div class="section-title">Pinned</div>';
    for (const id of pinned) {
      const name = id === 'general' ? '# general' : convTitle(id);
      html += item(id, name, preview(id, id === 'general' ? `Everyone · ${onlineCount + 1} online` : ''), 'pinned');
    }
  }
  html += '<div class="section-title">Channels</div>';
  const skip = new Set(pinned);
  if (match('general') && !skip.has('general')) html += item('general', '# general', preview('general', `Everyone · ${onlineCount + 1} online`));
  const groups = st.groups.filter((g) => match(g.name) && !skip.has(g.id)).sort((a, b) => activity(b.id) - activity(a.id));
  for (const g of groups) html += item(g.id, g.name, preview(g.id, `${g.members.length} members`));

  const peers = st.peers.filter((p) => match(p.name));
  html += `<div class="section-title">Direct messages <span class="section-count">${onlineCount} online</span></div>`;
  if (!st.peers.length) {
    const macHint = st.platform === 'darwin' && (st.lookingForPeers || (st.uptimeMs || 0) > 2500);
    html += `<div class="empty-peers">
      <div>${ICON.wifi}</div>
      <p>Looking for colleagues on your network…</p>
      <p class="muted">${
        macHint
          ? 'On a Mac, OfficeLink must be allowed to use the local network or new people will not appear.'
          : 'Anyone running OfficeLink on the same Wi-Fi or LAN shows up here automatically.'
      }</p>
      ${
        macHint
          ? `<button type="button" class="primary-btn" id="mac-privacy-btn">Allow local network</button>
             <p class="muted">System Settings → Privacy &amp; Security → Local Network → turn OfficeLink on. If macOS asks to accept incoming connections, click Allow. Then quit OfficeLink and open it again.</p>`
          : ''
      }
    </div>`;
  }
  peers
    .map((p) => ({ p, id: dmId(st.me.id, p.id) }))
    .filter(({ id }) => !skip.has(id))
    .sort((a, b) => activity(b.id) - activity(a.id) || Number(b.p.online) - Number(a.p.online) || a.p.name.localeCompare(b.p.name))
    .forEach(({ p, id }) => {
      const fallback = p.online ? (p.status === 'busy' ? 'Do not disturb' : p.status === 'away' ? 'Away' : 'Online') : `Last seen ${fmtAgo(p.lastSeen)}`;
      html += item(id, p.name, preview(id, fallback), p.online ? '' : 'offline');
    });
  $('#conv-list').innerHTML = html;

  const addrs = netAddrs(st);
  $('#net-status').innerHTML = addrs.length
    ? `<span class="net-dot ok"></span><span title="${esc(addrs.map((a) => `${addrLabel(a)}:${st.port}`).join('\n'))}">${esc(addrs.map((a) => addrLabel(a)).join(' · '))}:${st.port}</span>`
    : `<span class="net-dot bad"></span><span>No network connection</span>`;
  const copyBtn = $('#copy-addr-btn');
  copyBtn.hidden = !addrs.length;
  copyBtn.title = addrs.length ? `Copy ${addrs.map((a) => `${a.ip}:${st.port}`).join(', ')}` : '';

  const unread = Object.values(st.convs).reduce((n, c) => n + (c.unread || 0), 0);
  document.title = unread ? `(${unread}) OfficeLink` : 'OfficeLink';
}

function renderHeader() {
  const id = S.active;
  let subtitle = '';
  let actions = `<button class="icon-btn no-drag" data-head="search" title="Search in chat (Ctrl/Cmd+F)">${ICON.search}</button>
    <button class="icon-btn no-drag ${isPinned(id) ? 'on' : ''}" data-head="pin" title="${isPinned(id) ? 'Unpin chat' : 'Pin chat'}">${ICON.pin}</button>
    <button class="icon-btn no-drag ${isMuted(id) ? 'on' : ''}" data-head="mute" title="${isMuted(id) ? 'Unmute notifications' : 'Mute notifications'}">${isMuted(id) ? ICON.mute : ICON.unmute}</button>`;
  if (id === 'general') {
    const online = S.state.peers.filter((p) => p.online).length + 1;
    subtitle = `${online} online · Wi-Fi and LAN`;
  } else if (id.startsWith('dm:')) {
    const p = peerById(peerOfDm(id));
    const st = peerStatus(p);
    subtitle =
      st === 'offline' ? `Offline · last seen ${fmtAgo(p?.lastSeen)}` : st === 'busy' ? 'Do not disturb' : st === 'away' ? 'Away' : 'Online';
    if (p?.ip) subtitle += ` · ${p.ip}`;
    actions += `<button class="icon-btn no-drag" data-head="peer-info" title="Details">${ICON.info}</button>`;
  } else {
    const g = groupById(id);
    subtitle = g ? g.members.map(nameOf).join(', ') : '';
    actions += `<button class="icon-btn no-drag" data-head="group" title="Group settings">${ICON.users}</button>`;
  }
  const typing = typingNames(id);
  if (typing.length) subtitle = `<span class="typing-preview">${esc(typing.join(', '))} typing…</span>`;
  else subtitle = esc(subtitle);
  $('#chat-head').innerHTML = `
    <div class="head-info">${convIcon(id, 38)}
      <div class="head-text"><div class="head-title">${esc(id === 'general' ? '# general' : convTitle(id))}</div><div class="head-sub">${subtitle}</div></div>
    </div>
    <div class="head-actions">${actions}</div>`;
  $('#input').placeholder = `Message ${id === 'general' ? '#general' : convTitle(id)}`;
  $('#drop-sub').textContent = `Files go straight to ${id === 'general' ? 'everyone in #general' : convTitle(id)} — any size`;
}

function renderTyping() {
  const names = typingNames(S.active);
  const el = $('#typing');
  if (!names.length) {
    el.innerHTML = '';
    return;
  }
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : 'Several people';
  el.innerHTML = `<span class="dots"><i></i><i></i><i></i></span> ${esc(who)} ${names.length === 1 ? 'is' : 'are'} typing…`;
}

// ---------------------------------------------------------------- messages

function ticks(m) {
  const recips = recipientsCount(m.convId);
  const d = (m.deliveredTo || []).length;
  const r = (m.readBy || []).length;
  const title = recips ? `Delivered to ${d} of ${recips} · Read by ${r}` : 'Sent';
  let cls = 'sent';
  let icon = TICK_ONE;
  if (recips && (m.convId === 'general' ? r > 0 : r >= recips)) {
    cls = 'read';
    icon = TICK_TWO;
  } else if (d > 0) {
    cls = 'delivered';
    icon = TICK_TWO;
  }
  return `<span class="ticks ${cls}" title="${esc(title)}">${icon}</span>`;
}

function fileCard(m) {
  const f = m.file;
  const own = m.from === me().id;
  const kind = fileKind(f.name);
  const tr = S.transfers.get(f.id);
  const hasLocal = own || f.state === 'done';
  let sub = fmtSize(f.size);
  let buttons = '';
  let progress = '';
  const btn = (action, icon, label) => `<button class="file-btn" data-action="${action}" title="${label}">${icon}<span>${label}</span></button>`;

  if (own) {
    const n = (f.downloadedBy || []).length;
    if (n) sub += ` · downloaded by ${n === 1 ? nameOf(f.downloadedBy[0]) : `${n} people`}`;
    buttons = btn('open', ICON.open, 'Open') + btn('folder', ICON.folder, 'Show');
  } else if (f.state === 'downloading') {
    const received = tr?.received ?? f.received ?? 0;
    const pct = f.size ? Math.min(100, (received / f.size) * 100) : 0;
    sub = transferText(received, f.size, tr?.speed);
    buttons = btn('cancel', ICON.x, 'Cancel');
    progress = `<div class="progress"><div class="bar" style="width:${pct.toFixed(1)}%"></div></div>`;
  } else if (f.state === 'done') {
    sub += ' · saved';
    buttons = btn('open', ICON.open, 'Open') + btn('folder', ICON.folder, 'Show');
  } else if (f.state === 'failed') {
    sub = `<span class="err">${esc(f.error || 'Download failed')}</span>`;
    buttons = btn('download', ICON.retry, 'Retry');
  } else {
    buttons = btn('download', ICON.download, 'Download');
  }

  const thumb = f.thumb
    ? `<button class="thumb-btn" data-action="preview"><img class="thumb" src="${esc(f.thumb)}" alt="" draggable="false" /></button>`
    : '';
  return `<div class="file-card ${hasLocal ? 'local' : ''}" data-file-id="${esc(f.id)}">
    ${thumb}
    <div class="file-row">
      <span class="file-icon" style="background:${kind.color}">${kind.label}</span>
      <span class="file-info"><span class="file-name" title="${esc(f.name)}">${esc(f.name)}</span><span class="file-sub">${sub}</span></span>
      <span class="file-actions">${buttons}</span>
    </div>
    ${progress}
  </div>`;
}

function transferText(received, total, speed) {
  const pct = total ? Math.floor((received / total) * 100) : 0;
  let s = `${fmtSize(received)} of ${fmtSize(total)} · ${pct}%`;
  if (speed) s += ` · ${fmtSize(speed)}/s · ${fmtDuration((total - received) / speed)}`;
  return s;
}

function messageHtml(m, grouped) {
  if (m.system) return `<div class="sys-msg" data-id="${esc(m.id)}"><span>${esc(m.text)}</span></div>`;
  const own = m.from === me().id;
  const isDm = m.convId.startsWith('dm:');
  const p = peerById(m.from);
  const showAvatar = !own && !isDm;
  const avatarHtml = showAvatar ? (grouped ? '<span class="avatar-space"></span>' : avatar(p?.name, p?.color, { size: 34 })) : '';
  const author = !own && !isDm && !grouped ? `<div class="author" style="color:${esc(p?.color || '#64748b')}">${esc(p?.name || 'Unknown')}</div>` : '';

  let content = '';
  if (m.deleted) {
    content = `<div class="bubble deleted"><span>This message was deleted</span><span class="meta">${fmtTime(m.ts)}</span></div>`;
  } else {
    const reply = m.replyTo
      ? `<button class="quote" data-action="jump" data-target="${esc(m.replyTo.id)}"><span class="quote-author">${esc(nameOf(m.replyTo.from))}</span><span class="quote-text">${esc(m.replyTo.text)}</span></button>`
      : '';
    const fwd = m.forwarded
      ? `<div class="forwarded">Forwarded from ${esc(m.forwarded.name || nameOf(m.forwarded.from))}</div>`
      : '';
    const body = m.file ? fileCard(m) : `<div class="text ${isJumbo(m.text) ? 'jumbo' : ''}">${formatText(m.text)}</div>`;
    const meta = `<span class="meta">${m.edited ? '<span class="edited">edited</span>' : ''}${fmtTime(m.ts)}${own ? ticks(m) : ''}</span>`;
    content = `<div class="bubble ${m.file ? 'has-file' : ''}">${fwd}${reply}${body}${meta}</div>`;
  }

  const reactions = Object.entries(m.reactions || {})
    .filter(([, users]) => users.length)
    .map(([emoji, users]) => {
      const mine = users.includes(me().id);
      return `<button class="reaction ${mine ? 'mine' : ''}" data-action="react-toggle" data-emoji="${esc(emoji)}" title="${esc(users.map(nameOf).join(', '))}">${esc(emoji)} <b>${users.length}</b></button>`;
    })
    .join('');

  const tools = m.deleted
    ? own
      ? ''
      : `<button data-action="delete" title="Remove from this computer">${ICON.trash}</button>`
    : [
        `<button data-action="react" title="React">${ICON.smile}</button>`,
        `<button data-action="reply" title="Reply">${ICON.reply}</button>`,
        `<button data-action="forward" title="Forward">${ICON.forward}</button>`,
        own && !m.file ? `<button data-action="edit" title="Edit">${ICON.edit}</button>` : '',
        m.text ? `<button data-action="copy" title="Copy text">${ICON.copy}</button>` : '',
        `<button data-action="delete" title="${own ? 'Delete for everyone' : 'Remove from this computer'}">${ICON.trash}</button>`,
      ].join('');

  return `<div class="msg ${own ? 'own' : ''} ${grouped ? 'grouped' : ''} ${S.editing === m.id ? 'editing' : ''}" data-id="${esc(m.id)}">
    ${avatarHtml}
    <div class="msg-body">
      ${author}
      <div class="bubble-wrap">${content}${tools ? `<div class="tools">${tools}</div>` : ''}</div>
      ${reactions ? `<div class="reactions">${reactions}</div>` : ''}
    </div>
  </div>`;
}

function welcomeHtml() {
  const id = S.active;
  let title;
  let text;
  if (id === 'general') {
    title = 'Welcome to #general';
    text = 'Everyone running OfficeLink on this network can read and share files here. Nothing leaves your office network.';
  } else if (id.startsWith('dm:')) {
    title = convTitle(id);
    text = `This is the start of your conversation with ${esc(convTitle(id))}. Messages and files travel directly between your two computers.`;
  } else {
    title = convTitle(id);
    text = 'This is the start of the group. Only members see these messages and files.';
  }
  return `<div class="welcome">${convIcon(id, 64)}<h2>${esc(title)}</h2><p>${text}</p></div>`;
}

function renderMessages(mode) {
  const box = $('#messages');
  const prevHeight = box.scrollHeight;
  const prevTop = box.scrollTop;
  let html = S.hasMore ? '<div class="load-more">Scroll up for older messages</div>' : welcomeHtml();
  let prev = null;
  for (const m of S.messages) {
    const newDay = !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString();
    if (newDay) html += `<div class="day-sep"><span>${fmtDay(m.ts)}</span></div>`;
    if (m.id === S.unreadMarker) html += '<div class="unread-sep"><span>New messages</span></div>';
    const grouped =
      !newDay && prev && !prev.system && !m.system && prev.from === m.from && m.ts - prev.ts < 5 * 60 * 1000 && m.id !== S.unreadMarker;
    html += messageHtml(m, grouped);
    prev = m;
  }
  box.innerHTML = html;
  if (mode === 'bottom' || (mode !== 'prepend' && S.stickBottom)) {
    box.scrollTop = box.scrollHeight;
    S.stickBottom = true;
  } else if (mode === 'prepend') {
    box.scrollTop = box.scrollHeight - prevHeight + prevTop;
  } else {
    box.scrollTop = prevTop;
  }
  updateJumpButton();
}

function updateJumpButton() {
  $('#jump-latest').hidden = S.stickBottom;
  if (S.stickBottom) $('#jump-latest').classList.remove('has-new');
}

function upsertMessages(list) {
  for (const m of list) {
    const i = S.messages.findIndex((x) => x.id === m.id);
    if (i >= 0) S.messages[i] = m;
    else {
      let j = S.messages.length;
      while (j > 0 && S.messages[j - 1].ts > m.ts) j--;
      S.messages.splice(j, 0, m);
    }
  }
}

async function openConv(convId) {
  if (!convId) return;
  S.active = convId;
  S.replyTo = null;
  S.editing = null;
  S.stickBottom = true;
  closeSearch();
  renderBanner();
  const unread = S.state.convs[convId]?.unread || 0;
  const res = await api.call('getMessages', convId, {});
  if (S.active !== convId) return;
  S.messages = res.messages;
  S.hasMore = res.hasMore;
  S.unreadMarker = null;
  if (unread) {
    let count = 0;
    for (let i = S.messages.length - 1; i >= 0; i--) {
      if (S.messages[i].from !== me().id && !S.messages[i].system && ++count === unread) {
        S.unreadMarker = S.messages[i].id;
        break;
      }
    }
  }
  renderHeader();
  renderSidebar();
  renderMessages('bottom');
  renderTyping();
  api.call('setActive', convId, S.focused);
  $('#input').value = drafts.get(convId) || '';
  autoResize();
  $('#input').focus();
}

async function loadOlder() {
  if (!S.hasMore || S.loadingOlder || !S.messages.length) return;
  S.loadingOlder = true;
  const convId = S.active;
  try {
    const res = await api.call('getMessages', convId, { before: S.messages[0].id });
    if (S.active !== convId) return;
    S.messages = [...res.messages, ...S.messages];
    S.hasMore = res.hasMore;
    renderMessages('prepend');
  } finally {
    S.loadingOlder = false;
  }
}

async function jumpTo(msgId) {
  let el = $(`.msg[data-id="${CSS.escape(msgId)}"]`);
  if (!el) {
    const res = await api.call('getMessages', S.active, { fromId: msgId, limit: 150 });
    S.messages = res.messages;
    S.hasMore = res.hasMore;
    S.stickBottom = false;
    renderMessages('keep');
    el = $(`.msg[data-id="${CSS.escape(msgId)}"]`);
  }
  if (!el) return toast('That message is no longer available');
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
}

// ----------------------------------------------------------------- composer

const drafts = new Map();

function autoResize() {
  const el = $('#input');
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  el.style.overflowY = el.scrollHeight > 200 ? 'auto' : 'hidden';
}

function renderBanner() {
  const el = $('#compose-banner');
  if (S.editing) {
    el.hidden = false;
    el.innerHTML = `<span class="banner-icon">${ICON.edit}</span><span class="banner-text"><b>Editing message</b><span>Press Esc to cancel</span></span><button class="icon-btn" data-banner="close">${ICON.x}</button>`;
  } else if (S.replyTo) {
    const m = S.replyTo;
    const text = m.text || (m.file ? `📎 ${m.file.name}` : '');
    el.hidden = false;
    el.innerHTML = `<span class="banner-icon">${ICON.reply}</span><span class="banner-text"><b>Replying to ${esc(nameOf(m.from))}</b><span>${esc(text.slice(0, 140))}</span></span><button class="icon-btn" data-banner="close">${ICON.x}</button>`;
  } else {
    el.hidden = true;
    el.innerHTML = '';
  }
}

function cancelCompose() {
  if (S.editing) {
    $('#input').value = drafts.get(S.active) || '';
    autoResize();
  }
  S.editing = null;
  S.replyTo = null;
  renderBanner();
  renderMessages('keep');
}

async function submit() {
  const input = $('#input');
  const text = input.value.trim();
  if (!text) return;
  if (S.editing) {
    await call('editMessage', S.active, S.editing, text);
    S.editing = null;
    input.value = drafts.get(S.active) || '';
  } else {
    await call('sendText', S.active, text, S.replyTo?.id || null);
    S.replyTo = null;
    input.value = '';
    drafts.delete(S.active);
    S.stickBottom = true;
  }
  renderBanner();
  autoResize();
}

async function shareFiles(paths) {
  paths = paths.filter(Boolean);
  if (!paths.length) return;
  S.stickBottom = true;
  const n = await call('sendFiles', S.active, paths, S.replyTo?.id || null);
  S.replyTo = null;
  renderBanner();
  if (!n) toast('Folders cannot be shared directly. Zip the folder or select the files inside it.', 'error');
  else if (n < paths.length) toast('Some items were skipped (folders are not supported).');
}

function confirmLarge(items) {
  const big = items.filter((i) => (i.size || 0) >= 100 * 1024 * 1024);
  if (!big.length) return true;
  const list = big.map((i) => `• ${i.name || 'file'} (${fmtSize(i.size)})`).join('\n');
  return confirm(
    `These files are large and stay on this computer. Colleagues download them over Wi-Fi while OfficeLink is open:\n\n${list}\n\nShare now?`
  );
}

async function shareFileObjects(files) {
  const list = [...files];
  if (!confirmLarge(list.map((f) => ({ name: f.name, size: f.size })))) return;
  const paths = [];
  for (const file of files) {
    const p = api.pathForFile(file);
    if (p) paths.push(p);
    else if (file.size < 200 * 1024 * 1024) {
      const buf = new Uint8Array(await file.arrayBuffer());
      const ext = (file.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
      const name = file.name && file.name !== 'image.png' ? file.name : `Pasted ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${ext}`;
      await call('sendBuffer', S.active, name, buf);
    }
  }
  if (paths.length) await shareFiles(paths);
}

function insertAtCursor(text) {
  const el = $('#input');
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + text.length;
  el.focus();
  autoResize();
}

// ---------------------------------------------------------------- popovers

let popoverCleanup = null;

function closePopover() {
  if (popoverCleanup) popoverCleanup();
  popoverCleanup = null;
  $('#popover-root').innerHTML = '';
}

function showPopover(anchor, html, onClick, { align = 'top' } = {}) {
  closePopover();
  const root = $('#popover-root');
  root.innerHTML = `<div class="popover">${html}</div>`;
  const pop = root.firstElementChild;
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  let left = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), window.innerWidth - pw - 8);
  let top = align === 'top' ? r.top - ph - 8 : r.bottom + 8;
  if (top < 8) top = r.bottom + 8;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.addEventListener('click', (e) => onClick(e, pop));
  const outside = (e) => {
    if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopover();
  };
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  popoverCleanup = () => document.removeEventListener('mousedown', outside);
}

function showEmojiPicker(anchor, onPick, { quick = false } = {}) {
  const list = quick ? QUICK_REACTIONS : EMOJIS;
  const html = `<div class="emoji-grid ${quick ? 'quick' : ''}">${list.map((e) => `<button data-emoji="${esc(e)}">${e}</button>`).join('')}</div>`;
  showPopover(anchor, html, (e) => {
    const b = e.target.closest('[data-emoji]');
    if (!b) return;
    onPick(b.dataset.emoji);
    if (quick) closePopover();
  });
}

// ------------------------------------------------------------------- modals

function openModal(html, { onClose, wide = false } = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`;
  const backdrop = root.firstElementChild;
  const close = () => {
    root.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  const first = backdrop.querySelector('input:not([type=checkbox]), textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return { el: backdrop.firstElementChild, close };
}

const COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b'];
const colorPicker = (current) =>
  `<div class="color-row">${COLORS.map((c) => `<button type="button" class="swatch ${c === current ? 'sel' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div>`;

function wireColorPicker(el, onPick) {
  el.querySelectorAll('.swatch').forEach((s) =>
    s.addEventListener('click', () => {
      el.querySelectorAll('.swatch').forEach((x) => x.classList.remove('sel'));
      s.classList.add('sel');
      onPick(s.dataset.color);
    })
  );
}

function showOnboarding() {
  let color = me().color;
  const { el, close } = openModal(`
    <div class="onboard">
      <div class="onboard-logo">${ICON.link}</div>
      <h2>Welcome to OfficeLink</h2>
      <p class="muted">Chat and share files of any size with colleagues on the same Wi-Fi or office network. Nothing is uploaded to the internet — messages stay on your computers.</p>
      <label class="field"><span>Your name</span><input id="ob-name" maxlength="64" value="${esc(me().name)}" placeholder="e.g. Priya Sharma" /></label>
      <label class="field"><span>Avatar colour</span>${colorPicker(color)}</label>
      <ul class="onboard-points">
        <li>Install OfficeLink on each office computer (Mac or Windows).</li>
        <li>People on the same Wi-Fi appear automatically.</li>
        <li>Drop PDFs, zips, videos — any size. Keep the app open so others can download.</li>
      </ul>
      <div class="modal-actions"><button class="primary-btn" id="ob-go">Get started</button></div>
    </div>`);
  wireColorPicker(el, (c) => (color = c));
  const go = async () => {
    const name = $('#ob-name', el).value.trim();
    if (!name) return $('#ob-name', el).focus();
    await call('updateProfile', { name, color });
    close();
  };
  $('#ob-go', el).addEventListener('click', go);
  $('#ob-name', el).addEventListener('keydown', (e) => e.key === 'Enter' && go());
}

function showSettings() {
  const st = S.state;
  let color = st.me.color;
  const addrs = netAddrs(st).length
    ? netAddrs(st)
        .map((a) => `<code>${esc(addrLabel(a))}:${st.port}</code>`)
        .join(' ')
    : '<span class="err">Not connected</span>';
  const { el, close } = openModal(
    `
    <div class="modal-head"><h3>Settings</h3><button class="icon-btn" data-close>${ICON.x}</button></div>
    <div class="modal-body settings">
      <section>
        <h4>Profile</h4>
        <label class="field"><span>Display name</span><input id="st-name" maxlength="64" value="${esc(st.me.name)}" /></label>
        <label class="field"><span>Status</span>
          <select id="st-status">
            <option value="online" ${st.me.status === 'online' ? 'selected' : ''}>🟢 Available</option>
            <option value="away" ${st.me.status === 'away' ? 'selected' : ''}>🟡 Away</option>
            <option value="busy" ${st.me.status === 'busy' ? 'selected' : ''}>🔴 Do not disturb</option>
          </select>
        </label>
        <label class="field"><span>Avatar colour</span>${colorPicker(color)}</label>
      </section>
      <section>
        <h4>Network</h4>
        <div class="field"><span>Your address</span><div class="addr">${addrs}</div>
          <small class="muted">Wi-Fi and cable (LAN) both work when they share the same office router. Colleagues usually appear automatically. If someone is missing, they can add you with any of these addresses using “Add by IP”.</small></div>
        <label class="field"><span>Workspace name <small class="muted">(optional)</small></span>
          <input id="st-ws" maxlength="40" value="${esc(st.settings.workspace)}" placeholder="Leave empty to see everyone on the network" />
          <small class="muted">Only people using the same workspace name can see each other. Useful to keep teams or departments separate on a shared network.</small></label>
      </section>
      <section>
        <h4>Files</h4>
        <div class="field"><span>Save received files to</span>
          <div class="dir-row"><code id="st-dir">${esc(st.settings.downloadDir)}</code><button class="ghost-btn" id="st-dir-btn">Change…</button><button class="ghost-btn" id="st-dir-open">Open</button></div></div>
        <label class="field"><span>Download automatically if smaller than</span>
          <div class="inline"><input id="st-auto" type="number" min="0" max="100000" value="${esc(st.settings.autoDownloadMB)}" /> MB</div>
          <small class="muted">Larger files wait until you click Download. Set to 0 to never download automatically.</small></label>
      </section>
      <section>
        <h4>App</h4>
        <div class="field"><span>App version</span>
          <div class="dir-row">
            <code id="st-version" class="version-value">${esc(st.appVersion || '—')}</code>
            <button class="ghost-btn" id="st-version-copy" type="button">Copy</button>
          </div>
          <small class="muted" id="st-version-note">This is the code currently running on this computer.</small>
        </div>
        <label class="field"><span>Theme</span>
          <select id="st-theme">
            <option value="system" ${st.settings.theme === 'system' ? 'selected' : ''}>Match system</option>
            <option value="light" ${st.settings.theme === 'light' ? 'selected' : ''}>Light</option>
            <option value="dark" ${st.settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
          </select></label>
        <label class="check"><input type="checkbox" id="st-notify" ${st.settings.notifications ? 'checked' : ''} /> Show desktop notifications for new messages</label>
        ${
          st.platform === 'darwin'
            ? ''
            : `<label class="check"><input type="checkbox" id="st-bg" ${st.settings.runInBackground ? 'checked' : ''} /> Keep running in the system tray when the window is closed (so colleagues can still download your files)</label>`
        }
      </section>
      <section>
        <h4>Updates</h4>
        <p class="muted">Change the code, push it to git (or keep this app open on the computer that has the new code). Then click <b>Update</b> on each PC. OfficeLink fetches the new code and restarts.</p>
        <label class="field"><span>Git repository <small class="muted">(optional)</small></span>
          <input id="st-repo" value="${esc(st.settings.updateRepo || '')}" placeholder="https://github.com/you/officelink.git" />
          <small class="muted">If you set this, Update pulls the latest code from that repo. If you leave it empty, Update fetches new code from a colleague on this Wi-Fi.</small></label>
        <label class="field"><span>Branch</span>
          <input id="st-branch" value="${esc(st.settings.updateBranch || 'main')}" placeholder="main" />
        </label>
        <label class="check"><input type="checkbox" id="st-autoup" ${st.settings.autoUpdate ? 'checked' : ''} /> Check for new code in the background and show a banner</label>
        <p id="st-update-status" class="update-status muted">${esc((S.update && S.update.message) || '')}</p>
        <div class="modal-actions" style="padding-left:0">
          <button type="button" class="primary-btn" id="st-update">Update</button>
        </div>
        <p class="muted pad-top"><button type="button" class="ghost-btn" id="st-help">${ICON.help}<span>How OfficeLink works</span></button></p>
      </section>
    </div>
    <div class="modal-actions"><button class="ghost-btn" data-close>Cancel</button><button class="primary-btn" id="st-save">Save</button></div>`,
    { wide: true }
  );
  wireColorPicker(el, (c) => (color = c));
  let dir = st.settings.downloadDir;
  $('#st-dir-btn', el).addEventListener('click', async () => {
    const picked = await api.pickFolder(dir);
    if (picked) {
      dir = picked;
      $('#st-dir', el).textContent = picked;
    }
  });
  $('#st-dir-open', el).addEventListener('click', () => api.openFolder(st.settings.downloadDir));
  $('#st-version-copy', el).addEventListener('click', async () => {
    await api.copyText(st.appVersion || '');
    toast('Version copied', 'success');
  });
  $('#st-update', el).addEventListener('click', async () => {
    const btn = $('#st-update', el);
    btn.disabled = true;
    btn.textContent = 'Updating…';
    try {
      await call('updateSettings', {
        updateRepo: $('#st-repo', el).value.trim(),
        updateBranch: $('#st-branch', el).value.trim() || 'main',
        autoUpdate: $('#st-autoup', el).checked,
      });
      await api.update('apply');
    } catch (err) {
      toast(errText(err), 'error');
      btn.disabled = false;
      btn.textContent = 'Update';
    }
  });
  $('#st-help', el).addEventListener('click', () => {
    close();
    showHelp();
  });
  $('#st-save', el).addEventListener('click', async () => {
    const name = $('#st-name', el).value.trim();
    await call('updateProfile', { name, status: $('#st-status', el).value, color });
    await call('updateSettings', {
      workspace: $('#st-ws', el).value.trim(),
      downloadDir: dir,
      autoDownloadMB: Number($('#st-auto', el).value),
      theme: $('#st-theme', el).value,
      notifications: $('#st-notify', el).checked,
      autoUpdate: $('#st-autoup', el).checked,
      updateRepo: $('#st-repo', el).value.trim(),
      updateBranch: $('#st-branch', el).value.trim() || 'main',
      ...($('#st-bg', el) ? { runInBackground: $('#st-bg', el).checked } : {}),
    });
    close();
    toast('Settings saved', 'success');
  });
}

function showStatusMenu(anchor) {
  const cur = me().status;
  const opt = (v, label) => `<button class="menu-item ${cur === v ? 'sel' : ''}" data-status="${v}">${label}</button>`;
  showPopover(
    anchor,
    `<div class="menu">${opt('online', '🟢 Available')}${opt('away', '🟡 Away')}${opt('busy', '🔴 Do not disturb')}<div class="menu-sep"></div><button class="menu-item" data-status="settings">⚙️ Settings…</button></div>`,
    (e) => {
      const b = e.target.closest('[data-status]');
      if (!b) return;
      closePopover();
      if (b.dataset.status === 'settings') showSettings();
      else call('updateProfile', { status: b.dataset.status });
    },
    { align: 'bottom' }
  );
}

function showAddPeer() {
  const { el, close } = openModal(`
    <div class="modal-head"><h3>Add colleague by IP address</h3><button class="icon-btn" data-close>${ICON.x}</button></div>
    <div class="modal-body">
      <p class="muted">Colleagues on the same network normally appear automatically. If they don't (some office Wi-Fi blocks discovery), ask them for the address shown at the bottom left of their OfficeLink window.</p>
      <div class="inline">
        <label class="field grow"><span>IP address</span><input id="ap-ip" placeholder="192.168.1.25" /></label>
        <label class="field port"><span>Port</span><input id="ap-port" type="number" value="45321" /></label>
      </div>
      <div id="ap-err" class="err"></div>
    </div>
    <div class="modal-actions"><button class="ghost-btn" data-close>Cancel</button><button class="primary-btn" id="ap-go">Connect</button></div>`);
  const go = async () => {
    let ip = $('#ap-ip', el).value.trim();
    let port = Number($('#ap-port', el).value) || 45321;
    const m = ip.match(/^(.+):(\d+)$/);
    if (m) {
      ip = m[1];
      port = Number(m[2]);
    }
    $('#ap-go', el).disabled = true;
    $('#ap-err', el).textContent = '';
    try {
      const peer = await api.call('addPeerByAddress', ip, port);
      close();
      toast(`Connected to ${peer.name}`, 'success');
      openConv(dmId(me().id, peer.id));
    } catch (err) {
      $('#ap-err', el).textContent = errText(err);
      $('#ap-go', el).disabled = false;
    }
  };
  $('#ap-go', el).addEventListener('click', go);
  el.addEventListener('keydown', (e) => e.key === 'Enter' && go());
}

function showGroupModal(groupId) {
  const g = groupId ? groupById(groupId) : null;
  const selected = new Set(g ? g.members.filter((id) => id !== me().id) : []);
  const peers = [...S.state.peers];
  for (const id of selected) if (!peers.find((p) => p.id === id)) peers.push({ id, name: 'Unknown', color: '#64748b', online: false });
  const { el, close } = openModal(`
    <div class="modal-head"><h3>${g ? 'Group settings' : 'New group'}</h3><button class="icon-btn" data-close>${ICON.x}</button></div>
    <div class="modal-body">
      <label class="field"><span>Group name</span><input id="gr-name" maxlength="80" value="${esc(g?.name || '')}" placeholder="e.g. Design team" /></label>
      <div class="field"><span>Members</span>
        <input id="gr-filter" type="search" placeholder="Filter people" />
        <div class="member-list">
          ${
            peers.length
              ? peers
                  .map(
                    (p) => `<label class="member" data-name="${esc(p.name.toLowerCase())}"><input type="checkbox" value="${esc(p.id)}" ${selected.has(p.id) ? 'checked' : ''} />
                ${avatar(p.name, p.color, { size: 28, status: peerStatus(p) })}<span>${esc(p.name)}</span></label>`
                  )
                  .join('')
              : '<p class="muted">No colleagues found on the network yet.</p>'
          }
        </div>
      </div>
      <div id="gr-err" class="err"></div>
    </div>
    <div class="modal-actions">
      ${g ? '<button class="danger-btn" id="gr-leave">Leave group</button><span class="grow"></span>' : ''}
      <button class="ghost-btn" data-close>Cancel</button><button class="primary-btn" id="gr-save">${g ? 'Save' : 'Create group'}</button>
    </div>`);
  $('#gr-filter', el).addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    el.querySelectorAll('.member').forEach((m) => (m.hidden = !m.dataset.name.includes(q)));
  });
  $('#gr-save', el).addEventListener('click', async () => {
    const name = $('#gr-name', el).value.trim();
    const members = [...el.querySelectorAll('.member input:checked')].map((i) => i.value);
    if (!name) return ($('#gr-err', el).textContent = 'Please enter a group name.');
    if (!members.length) return ($('#gr-err', el).textContent = 'Pick at least one member.');
    if (g) {
      await call('updateGroup', g.id, { name, members });
      close();
    } else {
      const id = await call('createGroup', name, members);
      close();
      S.state.groups.push({ id, name, members: [me().id, ...members] });
      openConv(id);
    }
  });
  $('#gr-leave', el)?.addEventListener('click', async () => {
    if (!confirm(`Leave "${g.name}"? You will stop receiving its messages.`)) return;
    await call('leaveGroup', g.id);
    close();
    openConv('general');
  });
}

function showPeerInfo(peerId) {
  const p = peerById(peerId);
  if (!p) return;
  const { el, close } = openModal(`
    <div class="modal-head"><h3>Contact details</h3><button class="icon-btn" data-close>${ICON.x}</button></div>
    <div class="modal-body peer-info">
      ${avatar(p.name, p.color, { size: 72, status: peerStatus(p) })}
      <h2>${esc(p.name)}</h2>
      <dl>
        <dt>Status</dt><dd>${esc(peerStatus(p) === 'offline' ? `Offline · last seen ${fmtAgo(p.lastSeen)}` : peerStatus(p))}</dd>
        <dt>Address</dt><dd>${[p.ip, ...(p.ips || [])]
          .filter((ip, i, all) => ip && all.indexOf(ip) === i)
          .map((ip) => `<code>${esc(ip)}:${esc(p.port)}</code>`)
          .join('<br>')}</dd>
        <dt>Found via</dt><dd>${p.manual ? 'Added by IP address' : 'Automatic network discovery'}</dd>
      </dl>
    </div>
    <div class="modal-actions">${p.online ? '' : '<button class="danger-btn" id="pi-forget">Remove from list</button><span class="grow"></span>'}<button class="primary-btn" data-close>Close</button></div>`);
  $('#pi-forget', el)?.addEventListener('click', async () => {
    await call('removePeer', p.id);
    close();
    openConv('general');
  });
}

function showHelp() {
  openModal(
    `
    <div class="modal-head"><h3>How OfficeLink works</h3><button class="icon-btn" data-close>${ICON.x}</button></div>
    <div class="modal-body help-body">
      <p>OfficeLink is a local office chat. It never uses the internet. Everyone installs the app on their Mac or Windows PC. It works over <b>Wi-Fi and LAN (ethernet cable)</b> as long as the computers share the same office router.</p>
      <h4>Find colleagues</h4>
      <p>People on Wi-Fi and people plugged into the router appear automatically, and #general shows when someone new joins. If someone is missing, copy the address at the bottom left and send it to them — they tap <b>Add by IP</b>.</p>
      <h4>Mac: allow local network</h4>
      <p>On a Mac, open <b>System Settings → Privacy &amp; Security → Local Network</b> and turn <b>OfficeLink</b> on. Quit and reopen the app after that. If a firewall prompt appears, choose <b>Allow</b>. Without those, Windows PCs will chat with each other but will not show up on the Mac.</p>
      <h4>Share large files</h4>
      <p>Drop a PDF, zip, video, or any document into the chat. Files stay on the sender’s computer. Recipients click <b>Download</b>. Keep OfficeLink open so others can fetch files you shared.</p>
      <h4>Chat features</h4>
      <ul>
        <li><b># general</b> — everyone on this network (or workspace)</li>
        <li>Direct messages and groups</li>
        <li>Reply, edit, delete, emoji reactions, forwarding</li>
        <li><code>@Name</code> mentions, typing indicators, read receipts</li>
        <li>Pin chats, mute notifications, search (Ctrl/Cmd+F)</li>
        <li>Status: Available, Away, Do not disturb</li>
      </ul>
      <h4>Optional workspace name</h4>
      <p>In Settings, set the same workspace name on every computer in a team if several groups share one network and should not see each other.</p>
      <h4>Updates</h4>
      <p>Open <b>Settings</b> and click <b>Update</b>. OfficeLink fetches the latest code and restarts.</p>
      <p>The usual pipeline: change the code on your computer, <b>git push</b> to the repository URL in Settings, then everyone else clicks Update. If you have not set a git URL, Update copies the new code over Wi-Fi from a colleague who already has it (keep OfficeLink open on that computer).</p>
      <h4>Shortcuts</h4>
      <p><b>Enter</b> send · <b>Shift+Enter</b> new line · <b>Ctrl/Cmd+F</b> search this chat · <b>Ctrl/Cmd+K</b> find people · <b>↑</b> edit last message</p>
    </div>
    <div class="modal-actions"><button class="primary-btn" data-close>Got it</button></div>`,
    { wide: true }
  );
}

function showForward(m) {
  const st = S.state;
  const options = [];
  options.push({ id: 'general', name: '# general' });
  for (const g of st.groups) options.push({ id: g.id, name: g.name });
  for (const p of st.peers) options.push({ id: dmId(st.me.id, p.id), name: p.name });
  const filtered = options.filter((o) => o.id !== S.active);
  const { el, close } = openModal(`
    <div class="modal-head"><h3>Forward message</h3><button class="icon-btn" data-close>${ICON.x}</button></div>
    <div class="modal-body">
      <p class="muted">Send a copy to another chat. Files must already be downloaded on this computer.</p>
      <input id="fw-filter" type="search" placeholder="Filter chats" />
      <div class="member-list" id="fw-list">
        ${
          filtered.length
            ? filtered
                .map(
                  (o) =>
                    `<button class="member fw-item" data-conv="${esc(o.id)}" data-name="${esc(o.name.toLowerCase())}">${convIcon(o.id, 28)}<span>${esc(o.name)}</span></button>`
                )
                .join('')
            : '<p class="muted">No other chats yet.</p>'
        }
      </div>
    </div>
    <div class="modal-actions"><button class="ghost-btn" data-close>Cancel</button></div>`);
  $('#fw-filter', el).addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    el.querySelectorAll('.fw-item').forEach((row) => (row.hidden = !row.dataset.name.includes(q)));
  });
  $('#fw-list', el).addEventListener('click', async (e) => {
    const row = e.target.closest('[data-conv]');
    if (!row) return;
    await call('forwardMessage', m.convId, m.id, row.dataset.conv);
    close();
    toast('Forwarded', 'success');
    openConv(row.dataset.conv);
  });
}

function showConvMenu(anchor, convId) {
  const pinLabel = isPinned(convId) ? 'Unpin chat' : 'Pin chat';
  const muteLabel = isMuted(convId) ? 'Unmute notifications' : 'Mute notifications';
  showPopover(
    anchor,
    `<div class="menu">
      <button class="menu-item" data-act="pin">${ICON.pin}<span>${pinLabel}</span></button>
      <button class="menu-item" data-act="mute">${isMuted(convId) ? ICON.unmute : ICON.mute}<span>${muteLabel}</span></button>
    </div>`,
    (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      closePopover();
      if (b.dataset.act === 'pin') call('togglePin', convId);
      if (b.dataset.act === 'mute') call('toggleMute', convId);
    },
    { align: 'bottom' }
  );
}

function mentionQuery() {
  const el = $('#input');
  const pos = el.selectionStart ?? el.value.length;
  const before = el.value.slice(0, pos);
  const m = before.match(/(^|\s)@([^\s@]*)$/);
  if (!m) return null;
  return { start: pos - m[2].length - 1, query: m[2].toLowerCase() };
}

function mentionCandidates(query) {
  const people = [me(), ...S.state.peers];
  return people.filter((p) => p.name.toLowerCase().includes(query)).slice(0, 8);
}

function renderMentions() {
  const box = $('#mention-list');
  const q = mentionQuery();
  if (!q) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const list = mentionCandidates(q.query);
  if (!list.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = list
    .map(
      (p, i) =>
        `<button class="mention-item ${i === 0 ? 'sel' : ''}" data-name="${esc(p.name)}">${avatar(p.name, p.color, { size: 24, status: p.id === me().id ? me().status : peerStatus(p) })}<span>${esc(p.name)}</span></button>`
    )
    .join('');
}

function insertMention(name) {
  const el = $('#input');
  const q = mentionQuery();
  if (!q) return insertAtCursor(`@${name} `);
  el.value = `${el.value.slice(0, q.start)}@${name} ${el.value.slice(el.selectionStart)}`;
  const pos = q.start + name.length + 2;
  el.selectionStart = el.selectionEnd = pos;
  el.focus();
  autoResize();
  renderMentions();
}

function showLightbox(m) {
  const f = m.file;
  const local = m.from === me().id || f.state === 'done';
  const src = local ? `olfile://file/${encodeURIComponent(f.id)}` : f.thumb;
  const { el, close } = openModal(
    `<div class="lightbox">
      <div class="lightbox-head"><span class="file-name">${esc(f.name)} · ${fmtSize(f.size)}</span>
        <span class="grow"></span>
        ${local ? `<button class="ghost-btn" id="lb-open">${ICON.open} Open</button><button class="ghost-btn" id="lb-folder">${ICON.folder} Show in folder</button>` : `<button class="ghost-btn" id="lb-dl">${ICON.download} Download</button>`}
        <button class="icon-btn" data-close>${ICON.x}</button></div>
      <div class="lightbox-body"><img src="${esc(src)}" alt="" /></div>
    </div>`,
    { wide: true }
  );
  el.classList.add('lightbox-modal');
  const img = $('.lightbox-body img', el);
  img.addEventListener('error', () => {
    if (img.src !== f.thumb && f.thumb) img.src = f.thumb;
  });
  $('#lb-open', el)?.addEventListener('click', () => api.openFile(f.id));
  $('#lb-folder', el)?.addEventListener('click', () => api.showInFolder(f.id));
  $('#lb-dl', el)?.addEventListener('click', () => {
    call('downloadFile', m.convId, m.id);
    close();
  });
}

// ------------------------------------------------------------------ search

function openSearch() {
  $('#search-panel').hidden = false;
  $('#search-input').focus();
  $('#search-input').select();
}

function closeSearch() {
  $('#search-panel').hidden = true;
  $('#search-input').value = '';
  $('#search-results').innerHTML = '';
}

let searchTimer = null;
function runSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const q = $('#search-input').value.trim();
    if (!q) return ($('#search-results').innerHTML = '');
    const results = await api.call('search', S.active, q);
    const hl = (t) => {
      const i = t.toLowerCase().indexOf(q.toLowerCase());
      if (i < 0) return esc(t.slice(0, 120));
      const start = Math.max(0, i - 40);
      return `${start ? '…' : ''}${esc(t.slice(start, i))}<mark>${esc(t.slice(i, i + q.length))}</mark>${esc(t.slice(i + q.length, i + q.length + 80))}`;
    };
    $('#search-results').innerHTML = results.length
      ? results
          .map(
            (m) => `<button class="search-hit" data-target="${esc(m.id)}"><span class="hit-head"><b>${esc(nameOf(m.from))}</b><span>${fmtDay(m.ts)} ${fmtTime(m.ts)}</span></span>
              <span class="hit-text">${m.file ? `📎 ${hl(m.file.name)}` : hl(m.text)}</span></button>`
          )
          .join('')
      : '<div class="muted pad">No matches</div>';
  }, 150);
}

// ------------------------------------------------------------------- theme

function applyTheme() {
  const pref = S.state?.settings.theme || 'system';
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ------------------------------------------------------------------ wiring

function messageFromEvent(e) {
  const el = e.target.closest('.msg');
  if (!el) return null;
  return S.messages.find((m) => m.id === el.dataset.id) || null;
}

function wireUi() {
  document.body.classList.toggle('mac', api.platform === 'darwin');
  $('#new-group-btn').innerHTML = ICON.groupAdd;
  $('#settings-btn').innerHTML = ICON.settings;
  $('#help-btn').innerHTML = ICON.help;
  $('#copy-addr-btn').innerHTML = ICON.copyAddr;
  $('#add-peer-btn').innerHTML = `${ICON.plus}<span>Add by IP</span>`;
  $('#attach-btn').innerHTML = ICON.clip;
  $('#emoji-btn').innerHTML = ICON.smile;
  $('#send-btn').innerHTML = ICON.send;
  $('#jump-latest').innerHTML = ICON.down;
  $('.drop-icon').innerHTML = ICON.upload;

  $('#me-btn').addEventListener('click', (e) => showStatusMenu(e.currentTarget));
  $('#settings-btn').addEventListener('click', showSettings);
  $('#help-btn').addEventListener('click', showHelp);
  $('#update-banner').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-up]');
    if (!b) return;
    if (b.dataset.up === 'apply' || b.dataset.up === 'download' || b.dataset.up === 'install') await api.update('apply');
    if (b.dataset.up === 'cancel') await api.update('cancel');
    if (b.dataset.up === 'check') await api.update('check');
  });
  $('#copy-addr-btn').addEventListener('click', async () => {
    const st = S.state;
    if (!st?.addresses?.length) return;
    const lines = netAddrs(st).map((a) => `${a.ip}:${st.port}`).join('\n');
    await api.copyText(lines);
    toast(netAddrs(st).length > 1 ? 'Wi-Fi and LAN addresses copied' : 'Address copied — send it to a colleague to Add by IP', 'success');
  });
  $('#add-peer-btn').addEventListener('click', showAddPeer);
  $('#new-group-btn').addEventListener('click', () => showGroupModal(null));
  $('#side-filter').addEventListener('input', (e) => {
    S.filter = e.target.value;
    renderSidebar();
  });
  $('#conv-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-conv]');
    if (item) openConv(item.dataset.conv);
    if (e.target.closest('#mac-privacy-btn')) api.openMacPrivacy();
  });
  $('#conv-list').addEventListener('contextmenu', (e) => {
    const item = e.target.closest('[data-conv]');
    if (!item) return;
    e.preventDefault();
    showConvMenu(item, item.dataset.conv);
  });

  $('#chat-head').addEventListener('click', (e) => {
    const b = e.target.closest('[data-head]');
    if (!b) return;
    if (b.dataset.head === 'search') ($('#search-panel').hidden ? openSearch() : closeSearch());
    if (b.dataset.head === 'group') showGroupModal(S.active);
    if (b.dataset.head === 'peer-info') showPeerInfo(peerOfDm(S.active));
    if (b.dataset.head === 'pin') call('togglePin', S.active);
    if (b.dataset.head === 'mute') call('toggleMute', S.active);
  });
  $('#search-input').addEventListener('input', runSearch);
  $('#search-input').addEventListener('keydown', (e) => e.key === 'Escape' && closeSearch());
  $('#search-results').addEventListener('click', (e) => {
    const hit = e.target.closest('[data-target]');
    if (hit) jumpTo(hit.dataset.target);
  });

  const box = $('#messages');
  box.addEventListener('scroll', () => {
    S.stickBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    updateJumpButton();
    if (box.scrollTop < 80) loadOlder();
  });
  box.addEventListener(
    'load',
    () => {
      if (S.stickBottom) box.scrollTop = box.scrollHeight;
    },
    true
  );
  $('#jump-latest').addEventListener('click', async () => {
    if (S.hasMore && S.messages.length && S.state.convs[S.active]?.last?.ts !== S.messages[S.messages.length - 1].ts) {
      const res = await api.call('getMessages', S.active, {});
      S.messages = res.messages;
      S.hasMore = res.hasMore;
    }
    S.stickBottom = true;
    renderMessages('bottom');
  });

  box.addEventListener('click', async (e) => {
    const link = e.target.closest('a[data-url]');
    if (link) {
      e.preventDefault();
      return api.openExternal(link.dataset.url);
    }
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const m = messageFromEvent(e);
    if (!m) return;
    const action = target.dataset.action;
    const fileId = m.file?.id;
    switch (action) {
      case 'download':
        return call('downloadFile', m.convId, m.id);
      case 'cancel':
        return call('cancelDownload', fileId);
      case 'open': {
        const err = await api.openFile(fileId);
        if (err) toast(`Could not open file: ${err}`, 'error');
        return;
      }
      case 'folder':
        return api.showInFolder(fileId);
      case 'preview':
        return showLightbox(m);
      case 'jump':
        return jumpTo(target.dataset.target);
      case 'reply':
        S.replyTo = m;
        S.editing = null;
        renderBanner();
        return $('#input').focus();
      case 'forward':
        return showForward(m);
      case 'edit':
        return startEdit(m);
      case 'copy':
        await navigator.clipboard.writeText(m.text);
        return toast('Copied');
      case 'delete': {
        const own = m.from === me().id;
        const q = own ? 'Delete this message for everyone?' : 'Remove this message from this computer?';
        if (confirm(q)) call('deleteMessage', m.convId, m.id);
        return;
      }
      case 'react':
        return showEmojiPicker(target, (emoji) => call('react', m.convId, m.id, emoji), { quick: true });
      case 'react-toggle':
        return call('react', m.convId, m.id, target.dataset.emoji);
      default:
    }
  });
  box.addEventListener('dblclick', (e) => {
    if (e.target.closest('.file-card, a, .tools, .reactions')) return;
    const m = messageFromEvent(e);
    if (m && !m.deleted && !m.system) {
      S.replyTo = m;
      renderBanner();
      $('#input').focus();
    }
  });

  const input = $('#input');
  input.addEventListener('input', () => {
    autoResize();
    renderMentions();
    if (!S.editing) drafts.set(S.active, input.value);
    const now = Date.now();
    if (input.value.trim() && now - S.lastTypingSent > 2500) {
      S.lastTypingSent = now;
      api.call('typing', S.active);
    }
  });
  input.addEventListener('keydown', (e) => {
    const mentionOpen = !$('#mention-list').hidden;
    if (mentionOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab')) {
      const items = [...$('#mention-list').querySelectorAll('.mention-item')];
      if (items.length) {
        e.preventDefault();
        if (e.key === 'Enter' || e.key === 'Tab') {
          const sel = $('#mention-list .mention-item.sel') || items[0];
          insertMention(sel.dataset.name);
          return;
        }
        const i = items.findIndex((x) => x.classList.contains('sel'));
        const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items.forEach((x) => x.classList.remove('sel'));
        items[next].classList.add('sel');
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && (S.editing || S.replyTo || mentionOpen)) {
      $('#mention-list').hidden = true;
      if (S.editing || S.replyTo) cancelCompose();
    } else if (e.key === 'ArrowUp' && !input.value) {
      const last = [...S.messages].reverse().find((m) => m.from === me().id && !m.deleted && !m.file && !m.system);
      if (last) {
        e.preventDefault();
        startEdit(last);
      }
    }
  });
  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      shareFileObjects(files);
    }
  });
  $('#send-btn').addEventListener('click', submit);
  $('#attach-btn').addEventListener('click', async () => {
    const picked = await api.pickFiles();
    if (!picked.length) return;
    if (!confirmLarge(picked)) return;
    await shareFiles(picked.map((p) => p.path));
  });
  $('#emoji-btn').addEventListener('click', (e) => showEmojiPicker(e.currentTarget, insertAtCursor));
  $('#compose-banner').addEventListener('click', (e) => e.target.closest('[data-banner]') && cancelCompose());
  $('#mention-list').addEventListener('mousedown', (e) => {
    const item = e.target.closest('[data-name]');
    if (!item) return;
    e.preventDefault();
    insertMention(item.dataset.name);
  });

  // Drag and drop anywhere in the chat area
  const main = $('#main');
  const overlay = $('#drop-overlay');
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  main.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    overlay.hidden = false;
  });
  main.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  main.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) overlay.hidden = true;
  });
  main.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    overlay.hidden = true;
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) shareFileObjects(files);
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openSearch();
    } else if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#side-filter').focus();
    } else if (e.key === 'Escape') {
      closePopover();
    }
  });
}

function startEdit(m) {
  S.editing = m.id;
  S.replyTo = null;
  const input = $('#input');
  input.value = m.text;
  autoResize();
  input.focus();
  input.selectionStart = input.selectionEnd = input.value.length;
  renderBanner();
  renderMessages('keep');
}

function wireEvents() {
  api.on('state', (state) => {
    const prev = S.state;
    const firstGroupDrop = S.active.startsWith('group:') && !state.groups.find((g) => g.id === S.active);
    const namesChanged =
      prev &&
      (prev.me.name !== state.me.name ||
        prev.me.color !== state.me.color ||
        state.peers.some((p) => {
          const old = prev.peers.find((o) => o.id === p.id);
          return old && (old.name !== p.name || old.color !== p.color || old.online !== p.online);
        }));
    S.state = state;
    applyTheme();
    renderSidebar();
    renderHeader();
    if (namesChanged) renderMessages('keep');
    if (firstGroupDrop) openConv('general');
  });

  api.on('messages', ({ convId, messages, isNew }) => {
    if (convId !== S.active) return;
    const wasAtBottom = S.stickBottom;
    upsertMessages(messages);
    for (const m of messages) if (m.file && m.file.state !== 'downloading') S.transfers.delete(m.file.id);
    const ownNew = isNew && messages.some((m) => m.from === me().id);
    renderMessages(ownNew || wasAtBottom ? 'bottom' : 'keep');
    if (isNew && !wasAtBottom && !ownNew) $('#jump-latest').classList.add('has-new');
  });

  api.on('removed', ({ convId, msgId }) => {
    if (convId !== S.active) return;
    S.messages = S.messages.filter((m) => m.id !== msgId);
    renderMessages('keep');
  });

  api.on('transfer', (t) => {
    S.transfers.set(t.fileId, t);
    const card = document.querySelector(`.file-card[data-file-id="${CSS.escape(t.fileId)}"]`);
    if (!card) return;
    const bar = card.querySelector('.bar');
    if (bar) bar.style.width = `${t.total ? Math.min(100, (t.received / t.total) * 100).toFixed(1) : 0}%`;
    const sub = card.querySelector('.file-sub');
    if (sub) sub.textContent = transferText(t.received, t.total, t.speed);
  });

  const typingTimers = new Map();
  api.on('typing', ({ convId, userId }) => {
    if (!S.typing.has(convId)) S.typing.set(convId, new Map());
    S.typing.get(convId).set(userId, true);
    const key = `${convId}|${userId}`;
    clearTimeout(typingTimers.get(key));
    typingTimers.set(
      key,
      setTimeout(() => {
        S.typing.get(convId)?.delete(userId);
        refreshTyping(convId);
      }, 4000)
    );
    refreshTyping(convId);
  });
  api.on('messages', ({ convId, messages, isNew }) => {
    if (!isNew) return;
    const map = S.typing.get(convId);
    let changed = false;
    for (const m of messages) if (map?.delete(m.from)) changed = true;
    if (changed) refreshTyping(convId);
  });

  api.on('focus', (focused) => {
    S.focused = focused;
    api.call('setActive', S.active, focused);
    if (focused) $('#jump-latest').classList.remove('has-new');
  });

  api.on('open-conv', (convId) => openConv(convId));
  api.on('open-help', () => showHelp());
  api.on('update', renderUpdate);
}

function refreshTyping(convId) {
  renderSidebar();
  if (convId === S.active) {
    renderTyping();
    renderHeader();
  }
}

function renderUpdate(u) {
  S.update = u;
  const statusEl = $('#st-update-status');
  if (statusEl) {
    statusEl.textContent = (u && u.message) || '';
    statusEl.classList.toggle('err', u?.status === 'error');
  }
  const btn = $('#st-update');
  if (btn) {
    const busy = u && (u.status === 'checking' || u.status === 'downloading' || u.status === 'restarting');
    btn.disabled = !!busy;
    btn.textContent = busy ? 'Updating…' : 'Update';
  }
  const el = $('#update-banner');
  if (!u || !u.status || u.status === 'idle') {
    el.hidden = true;
    el.innerHTML = '';
    if (u?.message && u.message.includes('latest')) toast(u.message, 'success');
    return;
  }
  el.hidden = false;
  if (u.status === 'available') {
    el.innerHTML = `<span>${esc(u.message || 'New code is available')}</span><span class="grow"></span><button class="primary-btn" data-up="apply">Update</button>`;
  } else if (u.status === 'checking' || u.status === 'downloading') {
    el.innerHTML = `<span>${esc(u.message || 'Fetching latest code…')}</span>`;
  } else if (u.status === 'restarting') {
    el.innerHTML = `<span>Restarting with the new code…</span>`;
  } else if (u.status === 'error') {
    el.innerHTML = `<span class="err">${esc(u.message || 'Update failed')}</span><span class="grow"></span><button class="ghost-btn" data-up="apply">Retry</button>`;
  } else {
    el.hidden = true;
  }
}

async function init() {
  wireUi();
  wireEvents();
  S.state = await api.call('getState');
  applyTheme();
  renderSidebar();
  await openConv('general');
  if (!S.state.onboarded) showOnboarding();
  setInterval(() => S.state && renderSidebar(), 4000);
}

init();
