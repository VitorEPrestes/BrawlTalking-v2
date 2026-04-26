const app = document.getElementById('app');

const STORAGE = {
  userName: 'brawltalkie:userName',
  adminToken: 'brawltalkie:adminToken',
  chatSession: 'brawltalkie:chatSession'
};

const SESSION = {
  humanNoticeSeen: 'brawltalkie:humanNoticeSeen'
};

const REACTIONS = ['⭐', '🔥', '💥', '😂', '👊', '🌵'];

const brawlers = [
  {
    id: 'spike',
    name: 'Spike',
    tagline: '...',
    image: '/portraits/spike_portrait.png',
    bgColor: '#f5c800'
  },
  {
    id: 'colt',
    name: 'Colt',
    tagline: 'Beldade.',
    image: '/portraits/colt_portrait.png',
    bgColor: '#1a3a6b'
  },
  {
    id: 'shelly',
    name: 'Shelly',
    tagline: 'Bling bling.',
    image: '/portraits/Shelly_portrait.png',
    bgColor: '#a8d8ea'
  },
  {
    id: 'bull',
    name: 'Bull',
    tagline: 'Bull bravo.',
    image: '/portraits/bull_portrait.png',
    bgColor: '#1a5c2a'
  },
  {
    id: 'brock',
    name: 'Brock',
    tagline: 'Faz o L.',
    image: '/portraits/brock_portrait.png',
    bgColor: '#1a5c2a'
  },
  {
    id: 'el-primo',
    name: 'El Primo',
    tagline: 'EEELLL PRIMOOOO.',
    image: '/portraits/elprimo_portrait.png',
    bgColor: '#1a5c2a'
  },
  {
    id: 'angelo',
    name: 'Angelo',
    tagline: 'Eu sou o Drama.',
    image: '/portraits/angelo_portrait.png',
    bgColor: '#4a1a7a'
  },
  {
    id: 'mina',
    name: 'Mina',
    tagline: 'Nascida em São Paulo.',
    image: '/portraits/Mina_portrait.png',
    bgColor: '#7a1a1a'
  },
  {
    id: 'jessie',
    name: 'Jessie',
    tagline: 'Diz oi pro meu amiguinho.',
    image: '/portraits/jessie_portrait.png',
    bgColor: '#1a3a6b'
  },
  {
    id: 'nita',
    name: 'Nita',
    tagline: 'NITAAAA.',
    image: '/portraits/nita_portrait.png',
    bgColor: '#1a5c2a'
  }
];

const state = {
  view: '',
  ranking: {},
  featuredBrawlerId: '',
  rankingLoaded: false,
  chatConfig: null,
  chat: null,
  userEvents: null,
  adminEvents: null,
  admin: {
    token: localStorage.getItem(STORAGE.adminToken) || '',
    started: false,
    tab: 'chats',
    conversations: [],
    loadingConversations: false,
    conversationsError: '',
    details: {},
    detailLoadingId: '',
    detailError: { convId: '', message: '' },
    activeConvId: '',
    replyDraft: '',
    shouldStickToBottom: true,
    typingTimer: 0,
    reconnectTimer: 0,
    pendingRender: false,
    sendingReply: false,
    revealedMessages: {},
    metrics: null,
    metricsLoading: false,
    metricsError: '',
    moderation: null,
    moderationLoading: false,
    moderationError: ''
  }
};

const DEFAULT_CHAT_CONFIG = {
  welcomeMessages: [
    'Ola, {userName}! Voce esta conversando com {brawlerName}. Como posso te ajudar hoje?'
  ],
  statusTexts: ['esta pensando']
};

let toastTimer = 0;
let adminClock = 0;
let rankingTimer = 0;
let chatConfigPromise = null;

function purgeLegacyChatStorage() {
  const prefixes = [
    'brawltalkie:history:',
    'brawltalkie:session:',
    'brawlChat_history_',
    'brawlChat_session_'
  ];
  const toRemove = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
      toRemove.push(key);
    }
  }
  toRemove.forEach((key) => localStorage.removeItem(key));
}

const icons = {
  back: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 19 8 12l7-7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 12 16-7-7 16-2-7-7-2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 4 5 5-4 4v5l-2 2-5-5-4 4-1-1 4-4-5-5 2-2h5l5-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.7-4M4 5v5h5M4 13a8 8 0 0 0 14.7 4M20 19v-5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function getBrawler(id) {
  return brawlers.find((brawler) => brawler.id === id) || null;
}

function pickRandomItem(items, fallback) {
  if (!Array.isArray(items) || !items.length) return fallback;
  return items[Math.floor(Math.random() * items.length)] || fallback;
}

function resolveChatConfigForBrawler(brawlerId) {
  const config = state.chatConfig || {};
  const base = config.default || {};
  const custom = config.brawlers?.[brawlerId] || {};
  const welcomeMessages = Array.isArray(custom.welcomeMessages) && custom.welcomeMessages.length
    ? custom.welcomeMessages
    : Array.isArray(base.welcomeMessages) && base.welcomeMessages.length
      ? base.welcomeMessages
      : DEFAULT_CHAT_CONFIG.welcomeMessages;
  const statusTexts = Array.isArray(custom.statusTexts) && custom.statusTexts.length
    ? custom.statusTexts
    : Array.isArray(base.statusTexts) && base.statusTexts.length
      ? base.statusTexts
      : DEFAULT_CHAT_CONFIG.statusTexts;

  return { welcomeMessages, statusTexts };
}

function randomTypingText(brawlerId) {
  return pickRandomItem(
    resolveChatConfigForBrawler(brawlerId).statusTexts,
    DEFAULT_CHAT_CONFIG.statusTexts[0]
  );
}

async function ensureChatConfigLoaded() {
  if (state.chatConfig) return state.chatConfig;
  if (!chatConfigPromise) {
    chatConfigPromise = api('/api/chat-config')
      .then((data) => {
        state.chatConfig = data;
        return data;
      })
      .catch(() => {
        const fallback = { default: DEFAULT_CHAT_CONFIG, brawlers: {} };
        state.chatConfig = fallback;
        return fallback;
      })
      .finally(() => {
        chatConfigPromise = null;
      });
  }
  return chatConfigPromise;
}

function brawlerPayload(brawler) {
  return { id: brawler.id, name: brawler.name };
}

function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  return fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  }).then(async (response) => {
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = new Error(data.error || 'Erro de comunicação.');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  });
}

function showToast(message, type = '') {
  clearTimeout(toastTimer);
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  document.body.appendChild(node);
  toastTimer = window.setTimeout(() => node.remove(), 3600);
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return 'N/A';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function waitInfo(waitingSince) {
  if (!waitingSince) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - Number(waitingSince)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return {
    label: seconds < 60 ? `${seconds}s` : `${minutes}m`,
    level: minutes >= 5 ? 'urgent' : minutes >= 2 ? 'warning' : ''
  };
}

function remainingSeconds(until) {
  if (!until) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

function clientId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function chatSessionStorageKey(brawlerId, userName) {
  return `${STORAGE.chatSession}:${brawlerId}:${encodeURIComponent(userName)}`;
}

function getOrCreateChatSessionId(brawlerId, userName) {
  const key = chatSessionStorageKey(brawlerId, userName);
  try {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    const created = clientId();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return clientId();
  }
}

function renderEmptyState({ icon = '💬', title = '', description = '', actionLabel = '', actionAttr = '' } = {}) {
  const action = actionLabel && actionAttr
    ? `<div class="empty-actions"><button class="secondary-button" type="button" ${actionAttr}>${escapeHtml(actionLabel)}</button></div>`
    : '';
  return `
    <div class="empty-state">
      <div class="empty-card">
        <div class="empty-icon" aria-hidden="true">${escapeHtml(icon)}</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(description)}</p>
        ${action}
      </div>
    </div>
  `;
}

function renderConversationSkeleton(rows = 5) {
  return Array.from({ length: rows }, () => `
    <div class="conversation-skeleton" aria-hidden="true">
      <span class="skeleton skeleton-avatar"></span>
      <span class="skeleton-stack">
        <span class="skeleton skeleton-line"></span>
        <span class="skeleton skeleton-line short"></span>
      </span>
      <span class="skeleton skeleton-badge"></span>
    </div>
  `).join('');
}

function renderMessageSkeleton(rows = 4) {
  return Array.from({ length: rows }, (_, index) => `
    <div class="message-skeleton ${index % 2 === 0 ? 'is-user' : ''}" aria-hidden="true">
      ${index % 2 === 0 ? '' : '<span class="skeleton skeleton-avatar small"></span>'}
      <span class="message-stack">
        <span class="skeleton skeleton-line ${index % 2 === 0 ? 'medium' : ''}"></span>
        <span class="skeleton skeleton-line short"></span>
      </span>
    </div>
  `).join('');
}

function renderMetricSkeleton(cards = 6) {
  return `
    <div class="metrics-grid" aria-hidden="true">
      ${Array.from({ length: cards }, () => `
        <article class="metric-card">
          <p class="skeleton skeleton-line short"></p>
          <div class="metric-value skeleton skeleton-line"></div>
          <p class="metric-sub skeleton skeleton-line medium"></p>
        </article>
      `).join('')}
    </div>
    <section class="ranking-panel" aria-hidden="true">
      <p class="skeleton skeleton-line short"></p>
      ${Array.from({ length: 4 }, () => `
        <div class="bar-row skeleton-bar-row">
          <span class="skeleton skeleton-line short"></span>
          <span class="bar-track"><span class="bar-fill skeleton-fill" style="width: 100%"></span></span>
          <span class="skeleton skeleton-line short"></span>
        </div>
      `).join('')}
    </section>
  `;
}

function renderModerationSkeleton() {
  return `
    <div class="settings-grid" aria-hidden="true">
      <div class="metric-card"><p class="skeleton skeleton-line short"></p><div class="skeleton skeleton-line"></div></div>
      <div class="metric-card"><p class="skeleton skeleton-line short"></p><div class="skeleton skeleton-line"></div></div>
    </div>
    <div class="editors-grid" aria-hidden="true">
      ${Array.from({ length: 2 }, () => `
        <section class="editor">
          <p class="skeleton skeleton-line short"></p>
          <p class="skeleton skeleton-line medium"></p>
          <div class="editor-form">
            <span class="skeleton skeleton-line"></span>
            <span class="skeleton skeleton-line short"></span>
          </div>
          <div class="chip-list">
            <span class="skeleton skeleton-chip"></span>
            <span class="skeleton skeleton-chip"></span>
            <span class="skeleton skeleton-chip"></span>
          </div>
        </section>
      `).join('')}
    </div>
  `;
}

function closeUserEvents() {
  if (state.chat?.rateLimitTimer) clearInterval(state.chat.rateLimitTimer);
  state.userEvents?.close();
  state.userEvents = null;
  state.chat = null;
}

function closeAdminEvents() {
  clearTimeout(state.admin.reconnectTimer);
  state.admin.reconnectTimer = 0;
  state.adminEvents?.close();
  state.adminEvents = null;
  state.admin.started = false;
}

function scheduleAdminReconnect() {
  if (!state.admin.token || state.admin.reconnectTimer) return;
  state.admin.reconnectTimer = window.setTimeout(() => {
    state.admin.reconnectTimer = 0;
    if (!state.admin.token || state.view !== 'admin') return;
    state.admin.started = false;
    startAdmin();
  }, 1500);
}

function startAdminClock() {
  clearInterval(adminClock);
  adminClock = window.setInterval(() => {
    if (state.view !== 'admin' || !state.admin.token || state.admin.tab !== 'chats') return;
    refreshConversationWaitBadges();
  }, 1000);
}

function stopAdminClock() {
  clearInterval(adminClock);
  adminClock = 0;
}

function isAdminReplyFocused() {
  return document.activeElement?.id === 'reply-input';
}

function refreshConversationWaitBadges() {
  const items = app.querySelectorAll('[data-select-conv]');
  if (!items.length) return;
  items.forEach((node) => {
    const id = node.dataset.selectConv;
    const conv = state.admin.conversations.find((item) => item.id === id);
    if (!conv) return;
    const wait = waitInfo(conv.waitingSince);
    node.classList.remove('warn', 'danger');
    if (wait?.level) node.classList.add(wait.level);
    let badge = node.querySelector('.wait-badge');
    if (wait) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = `badge wait-badge ${wait.level}`;
        const meta = node.querySelector('.conversation-meta');
        meta?.insertBefore(badge, meta.firstChild);
      } else {
        badge.className = `badge wait-badge ${wait.level}`;
      }
      badge.textContent = wait.label;
    } else if (badge) {
      badge.remove();
    }
  });
}

function renderAdminWhenSafe() {
  if (state.view !== 'admin') return;
  if (isAdminReplyFocused()) {
    state.admin.pendingRender = true;
    return;
  }
  state.admin.pendingRender = false;
  renderAdmin();
}

function renderAdminAndFocusReply() {
  renderAdmin({ scrollToBottom: true });
  requestAnimationFrame(() => {
    const reply = document.getElementById('reply-input');
    if (!reply) return;
    reply.focus();
    const end = reply.value.length;
    reply.setSelectionRange(end, end);
  });
}

function startRankingPolling() {
  clearInterval(rankingTimer);
  rankingTimer = window.setInterval(() => {
    if (state.view === 'home') loadRanking();
  }, 30_000);
}

function stopRankingPolling() {
  clearInterval(rankingTimer);
  rankingTimer = 0;
}

function currentRoutePath() {
  const hashPath = (location.hash || '').replace(/^#/, '');
  if (hashPath && hashPath !== '/') return hashPath;
  return location.pathname || '/';
}

function navigateTo(path) {
  history.pushState(null, '', path);
  route();
}

function route() {
  const routePath = currentRoutePath();
  if (routePath.startsWith('/chat/')) {
    closeAdminEvents();
    stopAdminClock();
    stopRankingPolling();
    const id = decodeURIComponent(routePath.replace('/chat/', ''));
    renderChatRoute(id);
    return;
  }

  if (routePath === '/admin') {
    if (state.view !== 'admin') closeUserEvents();
    stopRankingPolling();
    document.body.classList.remove('view-chat');
    renderAdminRoute();
    return;
  }

  if (state.view !== 'home') {
    closeUserEvents();
    closeAdminEvents();
    stopAdminClock();
  }
  document.body.classList.remove('view-chat');
  renderHomeRoute();
}

function renderHomeRoute() {
  state.view = 'home';
  void ensureChatConfigLoaded();
  renderHome();
  document.body.classList.remove('view-chat');
  if (!hasSeenHumanNotice()) {
    openHumanNoticeModal();
  }
  loadRanking();
  startRankingPolling();
}

function hasSeenHumanNotice() {
  try {
    return sessionStorage.getItem(SESSION.humanNoticeSeen) === '1';
  } catch {
    return false;
  }
}

function markHumanNoticeSeen() {
  try {
    sessionStorage.setItem(SESSION.humanNoticeSeen, '1');
  } catch {
    // Ignore blocked storage environments and keep app usable.
  }
}

async function loadRanking() {
  try {
    const data = await api('/api/ranking');
    state.ranking = data.ranking || {};
    state.featuredBrawlerId = data.featuredBrawlerId || '';
    state.rankingLoaded = true;
    if (state.view === 'home') renderHome();
  } catch {
    state.rankingLoaded = true;
  }
}

function sortedBrawlers() {
  return [...brawlers].sort((a, b) => {
    if (state.featuredBrawlerId) {
      if (a.id === state.featuredBrawlerId) return -1;
      if (b.id === state.featuredBrawlerId) return 1;
    }
    const ca = state.ranking[a.id]?.conversations || 0;
    const cb = state.ranking[b.id]?.conversations || 0;
    if (cb !== ca) return cb - ca;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

function renderHome() {
  const userName = localStorage.getItem(STORAGE.userName) || '';
  const totalConversations = Object.values(state.ranking).reduce(
    (sum, item) => sum + (item.conversations || 0),
    0
  );
  const topId = state.featuredBrawlerId || sortedBrawlers().find(
    (brawler) => (state.ranking[brawler.id]?.conversations || 0) > 0
  )?.id || '';

  app.innerHTML = `
    <div class="app home">
      <aside class="home-rail">
        <div>
          <h1 class="brand">Brawl Talk<span class="brand-ing">ing</span></h1>
          <p>Converse em tempo real com seus Brawlers favoritos.</p>
        </div>
        <div class="rail-status" aria-label="Resumo">
          <div class="status-item"><span>Conversas</span><strong>${totalConversations}</strong></div>
          <div class="status-item"><span>Brawlers</span><strong>${brawlers.length}</strong></div>
          <div class="status-item"><span>Apelido</span><strong>${userName ? escapeHtml(userName) : 'Novo'}</strong></div>
        </div>
        <p class="soft">Este conteúdo é não oficial e não é endossado pela Supercell. Saiba mais em <a class="soft" href="https://supercell.com/fan-content-policy" target="_blank" rel="noopener noreferrer">supercell.com/fan-content-policy</a>.</p>
      </aside>
      <main class="home-main">
        <div class="home-top">
          <div>
            <h2>Escolha um Brawler</h2>
          </div>
          <div class="home-actions">
            ${userName ? `<button class="secondary-button" data-change-name>Trocar apelido</button>` : ''}
          </div>
        </div>
        <section class="brawler-grid" aria-label="Lista de Brawlers">
          ${sortedBrawlers().map((brawler) => {
            const count = state.ranking[brawler.id]?.conversations || 0;
            const isTop = brawler.id === topId;
            return `
              <button class="brawler-card" data-brawler="${escapeAttr(brawler.id)}" aria-label="Conversar com ${escapeAttr(brawler.name)}" style="background-color:${escapeAttr(brawler.bgColor || '')};">
                ${isTop ? `<span class="badge card-badge">${state.featuredBrawlerId === brawler.id ? 'Destaque' : 'Popular'}</span>` : ''}
                <span class="badge count-badge">${count}</span>
                <img src="${escapeAttr(brawler.image)}" alt="Retrato de ${escapeAttr(brawler.name)}" draggable="false" decoding="async" />
                <span class="brawler-card-content">
                  <h3>${escapeHtml(brawler.name)}</h3>
                  <p>${escapeHtml(brawler.tagline)}</p>
                </span>
              </button>
            `;
          }).join('')}
        </section>
      </main>
    </div>
  `;

  bindHome();
}

function bindHome() {
  app.querySelectorAll('[data-brawler]').forEach((button) => {
    button.addEventListener('click', () => {
      const brawler = getBrawler(button.dataset.brawler);
      if (brawler) openNicknameModal(brawler);
    });
  });
  app.querySelector('[data-change-name]')?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE.userName);
    showToast('Apelido removido. Escolha um personagem para entrar novamente.', 'success');
    renderHome();
  });
}

function closeModal() {
  document.querySelector('.modal-backdrop')?.remove();
}

function openHumanNoticeModal() {
  closeModal();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="human-notice-title">
      <header class="modal-header">
        <div class="modal-avatar notice-avatar" aria-hidden="true">!</div>
        <div>
          <h2 class="modal-title" id="human-notice-title">Aviso Importante</h2>
          <div class="muted">Antes de iniciar, leia este aviso.</div>
        </div>
        <button class="close-button" data-ack-human-notice aria-label="Fechar aviso">${icons.close}</button>
      </header>
      <div class="modal-body">
        <div class="form-stack">
          <p class="muted">As mensagens trocadas nesta plataforma podem ser lidas por humanos para moderacao, seguranca e melhoria da experiencia.</p>
          <p class="muted">Nao compartilhe senhas, codigos ou dados pessoais sensiveis.</p>
          <button class="primary-button" type="button" data-ack-human-notice>Entendi, continuar</button>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-ack-human-notice]').forEach((button) => {
    button.addEventListener('click', () => {
      markHumanNoticeSeen();
      closeModal();
    });
  });
}

function openNicknameModal(brawler) {
  closeModal();
  const saved = localStorage.getItem(STORAGE.userName) || '';
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="nickname-title">
      <header class="modal-header">
        <div class="modal-avatar" style="background-color:${escapeAttr(brawler.bgColor || '')};"><img src="${escapeAttr(brawler.image)}" alt="${escapeAttr(brawler.name)}" /></div>
        <div>
          <h2 class="modal-title" id="nickname-title">Conversar com ${escapeHtml(brawler.name)}</h2>
          <div class="muted">Como devo te chamar?</div>
        </div>
        <button class="close-button" data-close-modal aria-label="Fechar">${icons.close}</button>
      </header>
      <div class="modal-body">
        <form class="form-stack" data-nickname-form>
          <label class="sr-only" for="nickname">Apelido</label>
          <input class="field" id="nickname" name="nickname" maxlength="30" autocomplete="off" placeholder="Seu apelido" value="${escapeAttr(saved)}" />
          <div class="field-meta"><span class="soft">Use um apelido curto para aparecer no painel.</span><span class="soft" data-nickname-count>${saved.length}/30</span></div>
          <div class="form-error" data-modal-error></div>
          <button class="primary-button" type="submit" data-submit-nickname>Entrar no chat</button>
        </form>
      </div>
    </section>
  `;
  document.body.appendChild(modal);

  const input = modal.querySelector('#nickname');
  const error = modal.querySelector('[data-modal-error]');
  const submit = modal.querySelector('[data-submit-nickname]');
  const counter = modal.querySelector('[data-nickname-count]');
  window.setTimeout(() => input.focus(), 30);

  const syncNicknameState = (submitting = false) => {
    const value = input.value.trim();
    counter.textContent = `${value.length}/30`;
    submit.disabled = submitting || !value;
    submit.textContent = submitting ? 'Validando...' : 'Entrar no chat';
  };

  input.addEventListener('input', () => {
    error.textContent = '';
    syncNicknameState();
  });
  syncNicknameState();

  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-close-modal]')) {
      closeModal();
      if (currentRoutePath() !== '/') navigateTo('/');
    }
  });

  modal.querySelector('[data-nickname-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    error.textContent = '';
    syncNicknameState(true);
    try {
      const data = await api('/api/validate-nickname', {
        method: 'POST',
        body: { nickname: name }
      });
      if (data.blocked) {
        error.textContent = data.message || 'Este nome não é permitido.';
        return;
      }
      localStorage.setItem(STORAGE.userName, name);
      closeModal();
      navigateTo(`/chat/${encodeURIComponent(brawler.id)}`);
    } catch (err) {
      error.textContent = err.message || 'Não foi possível validar o apelido.';
      syncNicknameState();
    }
  });
}

async function renderChatRoute(brawlerId) {
  const brawler = getBrawler(brawlerId);
  if (!brawler) {
    navigateTo('/');
    return;
  }

  const userName = localStorage.getItem(STORAGE.userName) || '';
  if (!userName) {
    renderHomeRoute();
    openNicknameModal(brawler);
    return;
  }

  await ensureChatConfigLoaded();

  closeUserEvents();
  const sessionId = getOrCreateChatSessionId(brawler.id, userName);
  state.view = 'chat';
  state.chat = {
    sessionId,
    brawler,
    userName,
    messages: [],
    draft: '',
    notice: '',
    rateLimitUntil: 0,
    rateLimitTimer: 0,
    sending: false,
    connected: false,
    loading: true,
    isThinking: false,
    typingText: '',
    hasSentMessage: false,
    shouldStickToBottom: true,
    openReactionFor: '',
    headerAnimated: false
  };
  document.body.classList.add('view-chat');
  renderChat();

  try {
    const data = await api('/api/user/join', {
      method: 'POST',
      body: { userName, brawler: brawlerPayload(brawler), sessionId }
    });
    if (!state.chat || state.chat.sessionId !== sessionId) return;
    state.chat.messages = data.messages || [];
    state.chat.loading = false;
    state.chat.connected = true;
    openUserEvents(sessionId);
    renderChat();
  } catch (err) {
    if (err.status === 403) {
      localStorage.removeItem(STORAGE.userName);
      showToast(err.message, 'error');
      navigateTo('/');
      return;
    }
    state.chat.loading = false;
    state.chat.notice = 'Falha ao conectar. Verifique se o servidor está rodando.';
    renderChat();
  }
}

function openUserEvents(sessionId) {
  state.userEvents?.close();
  const source = new EventSource(`/api/events?role=user&sessionId=${encodeURIComponent(sessionId)}`);
  state.userEvents = source;

  source.onopen = () => {
    if (!state.chat || state.chat.sessionId !== sessionId) return;
    state.chat.connected = true;
    if (state.chat.notice === 'Conexão em tempo real instável. Tentando reconectar...') {
      state.chat.notice = '';
    }
    renderChat();
  };

  source.onerror = () => {
    if (!state.chat || state.chat.sessionId !== sessionId) return;
    state.chat.connected = false;
    if (!state.chat.loading) {
      state.chat.notice = state.chat.messages.length
        ? 'Conexão em tempo real instável. Tentando reconectar...'
        : (state.chat.notice || 'Falha ao abrir o chat em tempo real.');
    }
    renderChat({ preserveScroll: true, keepScrollTop: true });
  };

  source.addEventListener('message', (event) => {
    const { message } = JSON.parse(event.data);
    appendChatMessage(message);
  });

  source.addEventListener('reaction-update', (event) => {
    const payload = JSON.parse(event.data);
    updateChatReactions(payload.messageId, payload.reactions);
  });

  source.addEventListener('typing', (event) => {
    const payload = JSON.parse(event.data);
    if (!state.chat) return;
    const nextThinking = Boolean(payload.typing && state.chat.hasSentMessage);
    if (nextThinking && !state.chat.isThinking) {
      state.chat.typingText = randomTypingText(state.chat.brawler.id);
    }
    if (!nextThinking) {
      state.chat.typingText = '';
    }
    if (state.chat.isThinking === nextThinking) return;
    state.chat.isThinking = nextThinking;
    renderChat({ keepScrollTop: true });
  });
}

function appendChatMessage(message) {
  if (!state.chat) return;
  if (!state.chat.messages.some((item) => item.id === message.id)) {
    state.chat.messages.push(message);
  }
  if (message.type === 'brawler') {
    state.chat.isThinking = false;
    state.chat.typingText = '';
  }
  renderChat();
}

function updateChatReactions(messageId, reactions) {
  if (!state.chat) return;
  state.chat.messages = state.chat.messages.map((message) => (
    message.id === messageId ? { ...message, reactions } : message
  ));
  renderChat({ preserveScroll: true });
}

function chatRateLimitRemaining() {
  return remainingSeconds(state.chat?.rateLimitUntil || 0);
}

function startChatRateLimit(retryAfterMs) {
  if (!state.chat) return;
  const ms = Number.isFinite(Number(retryAfterMs)) ? Number(retryAfterMs) : 60_000;
  state.chat.rateLimitUntil = Date.now() + Math.max(1000, ms);
  clearInterval(state.chat.rateLimitTimer);
  state.chat.rateLimitTimer = window.setInterval(() => {
    if (!state.chat) return;
    if (chatRateLimitRemaining() > 0) {
      renderChat({ preserveScroll: true, keepScrollTop: true });
      return;
    }
    clearInterval(state.chat.rateLimitTimer);
    state.chat.rateLimitTimer = 0;
    state.chat.rateLimitUntil = 0;
    state.chat.notice = '';
    renderChat({ preserveScroll: true, keepScrollTop: true });
  }, 1000);
  renderChat({ preserveScroll: true, keepScrollTop: true });
}

function renderChat(options = {}) {
  if (!state.chat) return;
  const previousList = app.querySelector('[data-messages]');
  const previousScroll = previousList ? {
    top: previousList.scrollTop,
    stickToBottom: state.chat.shouldStickToBottom || previousList.scrollTop + previousList.clientHeight >= previousList.scrollHeight - 8
  } : null;
  const { brawler, userName, messages, connected, loading, notice, draft, isThinking, sending } = state.chat;
  const avatarClass = state.chat.headerAnimated ? 'avatar' : 'avatar avatar-enter';
  state.chat.headerAnimated = true;
  const rateLimitRemaining = chatRateLimitRemaining();
  const isRateLimited = rateLimitRemaining > 0;
  const visibleNotice = isRateLimited
    ? `Você está enviando mensagens muito rapidamente. Tente novamente em ${rateLimitRemaining}s.`
    : notice;
  const showRetry = !loading && !connected;
  const chatStatePanel = loading && !messages.length
    ? renderEmptyState({
      icon: '⏳',
      title: 'Conectando ao chat',
      description: 'Estamos preparando a conversa com o personagem.'
    })
    : (!messages.length && showRetry
      ? renderEmptyState({
        icon: '📡',
        title: 'Não foi possível abrir o chat',
        description: visibleNotice || 'Tente novamente agora.',
        actionLabel: 'Tentar novamente',
        actionAttr: 'data-chat-retry'
      })
      : '');
  app.innerHTML = `
    <div class="app chat">
      <header class="chat-header">
        <button class="icon-button" data-chat-back aria-label="Voltar">${icons.back}</button>
        <div class="${avatarClass}" style="background-color:${escapeAttr(brawler.bgColor || '')};"><img src="${escapeAttr(brawler.image)}" alt="Avatar de ${escapeAttr(brawler.name)}" /></div>
        <div class="chat-title">
          <h1>${escapeHtml(brawler.name)}</h1>
          <span class="online"><span class="dot"></span>${connected ? 'Online' : loading ? 'Conectando' : 'Reconectando'}</span>
        </div>
      </header>
      <main class="messages" data-messages>
        ${chatStatePanel || `${messages.map((message) => renderChatMessage(message, brawler, userName)).join('')}${isThinking ? renderTyping(brawler) : ''}`}
      </main>
      <footer class="composer">
        ${visibleNotice ? `<div class="notice">${escapeHtml(visibleNotice)}</div>` : ''}
        ${showRetry && messages.length ? '<div class="notice-actions"><button class="pill-button" type="button" data-chat-retry>Reconectar agora</button></div>' : ''}
        <div class="human-notice-inline">👁 Mensagens podem ser lidas por humanos</div>
        <form class="composer-form" data-chat-form>
          <label class="sr-only" for="chat-input">Mensagem</label>
          <textarea class="textarea" id="chat-input" rows="1" maxlength="1000" placeholder="${isRateLimited ? `Aguarde ${rateLimitRemaining}s...` : 'Digite sua mensagem...'}" ${connected && !isRateLimited && !sending ? '' : 'disabled'}>${escapeHtml(draft)}</textarea>
          <button class="send-button" type="submit" aria-label="Enviar mensagem" ${connected && draft.trim() && !isRateLimited && !sending ? '' : 'disabled'}>${icons.send}</button>
        </form>
      </footer>
    </div>
  `;
  bindChat();
  applyChatScroll(options, previousScroll);
}

function applyChatScroll(options, previousScroll) {
  const list = app.querySelector('[data-messages]');
  if (!list) return;
  const restore = () => {
    if (options.keepScrollTop && previousScroll) {
      list.scrollTop = previousScroll.top;
      return;
    }
    if (options.scrollToBottom === true || !previousScroll || previousScroll.stickToBottom) {
      list.scrollTop = list.scrollHeight;
      if (state.chat) state.chat.shouldStickToBottom = true;
      return;
    }
    list.scrollTop = previousScroll.top;
  };
  restore();
  requestAnimationFrame(restore);
}

function renderChatMessage(message, brawler, userName) {
  const isUser = message.type === 'user';
  const reactions = message.reactions || {};
  const hasReactions = Object.values(reactions).some((users) => users.length > 0);
  const open = state.chat?.openReactionFor === message.id;
  if (isUser) {
    return `
      <article class="message-row user">
        <div class="message-stack">
          <div class="bubble">${escapeHtml(message.text)}</div>
          <div class="message-time">${formatTime(message.timestamp)}</div>
        </div>
      </article>
    `;
  }

  return `
    <article class="message-row brawler" data-brawler-message="${escapeAttr(message.id)}">
      <div class="message-avatar" style="background-color:${escapeAttr(brawler.bgColor || '')};"><img src="${escapeAttr(brawler.image)}" alt="${escapeAttr(brawler.name)}" /></div>
      <div class="message-stack">
        <div class="message-name">${escapeHtml(brawler.name)}</div>
        <div class="bubble-wrap">
          <div class="reaction-menu ${open ? 'is-open' : ''}">
            ${REACTIONS.map((emoji) => `
              <button type="button" data-react-message="${escapeAttr(message.id)}" data-emoji="${escapeAttr(emoji)}" aria-label="Reagir com ${escapeAttr(emoji)}">${emoji}</button>
            `).join('')}
          </div>
          <div class="bubble">${escapeHtml(message.text)}</div>
          <button class="icon-button reaction-toggle ${open ? 'is-open' : ''}" type="button" data-toggle-reactions="${escapeAttr(message.id)}" aria-label="Reagir">+</button>
        </div>
        ${hasReactions ? renderReactions(message.id, reactions, userName) : ''}
        <div class="message-time">${formatTime(message.timestamp)}</div>
      </div>
    </article>
  `;
}

function renderReactions(messageId, reactions, userName) {
  return `
    <div class="reactions">
      ${Object.entries(reactions).map(([emoji, users]) => {
        if (!users.length) return '';
        const active = users.includes(userName);
        return `
          <button class="reaction-pill ${active ? 'active' : ''}" type="button" data-react-message="${escapeAttr(messageId)}" data-emoji="${escapeAttr(emoji)}">
            <span>${emoji}</span><span>${users.length}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderTyping(brawler) {
  const typingText = state.chat?.typingText || DEFAULT_CHAT_CONFIG.statusTexts[0];
  return `
    <div class="message-row brawler">
      <div class="message-avatar" style="background-color:${escapeAttr(brawler.bgColor || '')};"><img src="${escapeAttr(brawler.image)}" alt="${escapeAttr(brawler.name)}" /></div>
      <div class="typing">
        <span>${escapeHtml(brawler.name)} ${escapeHtml(typingText)}</span>
        <span class="typing-dots"><span></span><span></span><span></span></span>
      </div>
    </div>
  `;
}

function bindChat() {
  app.querySelector('[data-chat-back]')?.addEventListener('click', () => {
    navigateTo('/');
  });

  app.querySelectorAll('[data-chat-retry]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!state.chat) return;
      await renderChatRoute(state.chat.brawler.id);
    });
  });

  const list = app.querySelector('[data-messages]');
  list?.addEventListener('scroll', () => {
    if (!state.chat) return;
    state.chat.shouldStickToBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
  });

  const textarea = app.querySelector('#chat-input');
  const sendButton = app.querySelector('.send-button');
  textarea?.addEventListener('input', () => {
    state.chat.draft = textarea.value;
    sendButton.disabled = !state.chat.connected || !textarea.value.trim() || chatRateLimitRemaining() > 0 || state.chat.sending;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  });
  textarea?.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await sendChatMessage();
    }
  });

  app.querySelector('[data-chat-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendChatMessage();
  });

  app.querySelectorAll('[data-toggle-reactions]').forEach((button) => {
    button.addEventListener('click', () => {
      state.chat.openReactionFor = state.chat.openReactionFor === button.dataset.toggleReactions
        ? ''
        : button.dataset.toggleReactions;
      renderChat({ preserveScroll: true });
    });
  });

  app.querySelectorAll('[data-react-message]').forEach((button) => {
    button.addEventListener('click', async () => {
      await reactToMessage(button.dataset.reactMessage, button.dataset.emoji);
    });
  });

  app.querySelectorAll('[data-brawler-message]').forEach((node) => {
    let timer = 0;
    node.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') return;
      timer = window.setTimeout(() => {
        state.chat.openReactionFor = node.dataset.brawlerMessage;
        renderChat({ preserveScroll: true });
      }, 460);
    });
    node.addEventListener('pointerup', () => clearTimeout(timer));
    node.addEventListener('pointercancel', () => clearTimeout(timer));
    node.addEventListener('pointerleave', () => clearTimeout(timer));
  });
}

async function sendChatMessage() {
  if (!state.chat) return;
  const text = (app.querySelector('#chat-input')?.value || '').trim();
  if (!text || !state.chat.connected || state.chat.sending || chatRateLimitRemaining() > 0) return;

  try {
    state.chat.sending = true;
    const data = await api('/api/user/message', {
      method: 'POST',
      body: { sessionId: state.chat.sessionId, text }
    });
    state.chat.draft = '';
    state.chat.notice = '';
    state.chat.hasSentMessage = true;
    state.chat.isThinking = true;
    state.chat.typingText = randomTypingText(state.chat.brawler.id);
    state.chat.sending = false;
    appendChatMessage(data.message);
  } catch (err) {
    state.chat.sending = false;
    if (err.status === 429) {
      startChatRateLimit(err.data?.retryAfterMs);
      return;
    }
    state.chat.notice = err.message || 'Não foi possível enviar sua mensagem.';
    renderChat({ preserveScroll: true, keepScrollTop: true });
  }
}

async function reactToMessage(messageId, emoji) {
  if (!state.chat) return;
  try {
    const payload = await api('/api/user/reaction', {
      method: 'POST',
      body: {
        sessionId: state.chat.sessionId,
        messageId,
        emoji,
        userName: state.chat.userName
      }
    });
    state.chat.openReactionFor = '';
    updateChatReactions(payload.messageId, payload.reactions);
  } catch (err) {
    showToast(err.message || 'Não foi possível reagir.', 'error');
  }
}

function renderAdminRoute() {
  state.view = 'admin';
  if (!state.admin.token) {
    stopAdminClock();
    renderLogin();
    return;
  }
  startAdminClock();
  if (!state.admin.started && !state.admin.conversations.length) {
    state.admin.loadingConversations = true;
  }
  renderAdmin();
  startAdmin();
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-screen">
      <section class="login-card">
        <h1 class="brand">Brawl Talk<span class="brand-ing">ing</span></h1>
        <div class="muted">Painel do Operador</div>
        <form data-login-form>
          <label class="sr-only" for="admin-password">Senha</label>
          <input class="field" id="admin-password" type="password" placeholder="Senha de acesso" autocomplete="current-password" />
          <div class="form-error" data-login-error></div>
          <button class="primary-button" type="submit">Entrar</button>
          <a class="secondary-button" href="/">Voltar</a>
        </form>
      </section>
    </main>
  `;

  app.querySelector('[data-login-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = app.querySelector('#admin-password').value;
    const error = app.querySelector('[data-login-error]');
    error.textContent = '';
    try {
      const data = await api('/api/admin/login', {
        method: 'POST',
        body: { password }
      });
      state.admin.token = data.token;
      localStorage.setItem(STORAGE.adminToken, data.token);
      state.admin.started = false;
      renderAdminRoute();
    } catch (err) {
      error.textContent = err.message || 'Erro ao entrar.';
    }
  });
}

function startAdmin() {
  if (state.admin.started) return;
  state.admin.started = true;
  loadAdminConversations();
  void openAdminEvents();
  if (state.admin.tab === 'metrics') loadMetrics();
  if (state.admin.tab === 'mod') loadModeration();
}

async function openAdminEvents() {
  state.adminEvents?.close();
  clearTimeout(state.admin.reconnectTimer);
  state.admin.reconnectTimer = 0;
  let ticket = '';
  try {
    const data = await adminApi('/api/admin/events-ticket', { method: 'POST' });
    ticket = data.ticket || '';
  } catch {
    scheduleAdminReconnect();
    return;
  }

  if (!ticket) {
    scheduleAdminReconnect();
    return;
  }

  const source = new EventSource(`/api/events?role=admin&ticket=${encodeURIComponent(ticket)}`);
  state.adminEvents = source;

  source.onopen = () => {
    clearTimeout(state.admin.reconnectTimer);
    state.admin.reconnectTimer = 0;
  };

  source.onerror = () => {
    if (state.adminEvents !== source || !state.admin.token) return;
    source.close();
    state.adminEvents = null;
    state.admin.started = false;
    scheduleAdminReconnect();
  };

  source.addEventListener('unauthorized', () => {
    if (state.adminEvents !== source || !state.admin.token) return;
    source.close();
    state.adminEvents = null;
    state.admin.started = false;
    scheduleAdminReconnect();
  });
  source.addEventListener('conversation-upsert', (event) => {
    const { conversation } = JSON.parse(event.data);
    upsertConversation(conversation);
    renderAdminWhenSafe();
  });
  source.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);
    upsertConversation(payload.conversation);
    appendAdminDetailMessage(payload.convId, payload.message);
    renderAdminWhenSafe();
  });
  source.addEventListener('reaction-update', (event) => {
    const payload = JSON.parse(event.data);
    updateAdminReactions(payload.convId, payload.messageId, payload.reactions);
    renderAdminWhenSafe();
  });
  source.addEventListener('conversations-reset', () => {
    state.admin.conversations = [];
    state.admin.details = {};
    state.admin.activeConvId = '';
    state.admin.revealedMessages = {};
    state.admin.metrics = null;
    renderAdminWhenSafe();
  });
  source.addEventListener('conversation-closed', (event) => {
    const { convId } = JSON.parse(event.data);
    state.admin.conversations = state.admin.conversations.filter((item) => item.id !== convId);
    delete state.admin.details[convId];
    if (state.admin.activeConvId === convId) {
      state.admin.activeConvId = '';
      state.admin.replyDraft = '';
    }
    renderAdminWhenSafe();
  });
}

async function adminApi(path, options = {}) {
  try {
    return await api(path, { ...options, token: state.admin.token });
  } catch (err) {
    if (err.status === 401) logoutAdmin();
    throw err;
  }
}

function logoutAdmin() {
  localStorage.removeItem(STORAGE.adminToken);
  state.admin.token = '';
  state.admin.started = false;
  state.admin.revealedMessages = {};
  closeAdminEvents();
  if (state.view === 'admin') renderLogin();
}

async function loadAdminConversations() {
  state.admin.loadingConversations = true;
  state.admin.conversationsError = '';
  if (state.view === 'admin' && state.admin.tab === 'chats') renderAdmin();
  try {
    const data = await adminApi('/api/admin/conversations');
    state.admin.conversations = data.conversations || [];
    state.admin.loadingConversations = false;
    if (state.view === 'admin') renderAdmin();
  } catch (err) {
    state.admin.loadingConversations = false;
    state.admin.conversationsError = err.message || 'Erro ao carregar conversas.';
    if (state.view === 'admin') renderAdmin();
  }
}

function upsertConversation(conversation) {
  const index = state.admin.conversations.findIndex((item) => item.id === conversation.id);
  if (index >= 0) {
    state.admin.conversations[index] = { ...state.admin.conversations[index], ...conversation };
  } else {
    state.admin.conversations.push(conversation);
  }
}

function appendAdminDetailMessage(convId, message) {
  const detail = state.admin.details[convId];
  if (!detail) return;
  if (!detail.messages.some((item) => item.id === message.id)) {
    detail.messages.push(message);
  }
}

function isAdminMessageRevealed(messageId) {
  return Boolean(state.admin.revealedMessages[messageId]);
}

function toggleAdminMessageReveal(messageId) {
  if (!messageId) return;
  state.admin.revealedMessages[messageId] = !state.admin.revealedMessages[messageId];
  renderAdminAndMaintainScroll();
}

function updateAdminReactions(convId, messageId, reactions) {
  const detail = state.admin.details[convId];
  if (!detail) return;
  detail.messages = detail.messages.map((message) => (
    message.id === messageId ? { ...message, reactions } : message
  ));
}

function sortedConversations() {
  return [...state.admin.conversations].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.waitingSince && b.waitingSince) return a.waitingSince - b.waitingSince;
    if (a.waitingSince) return -1;
    if (b.waitingSince) return 1;
    return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
  });
}

function renderAdmin(options = {}) {
  if (!state.admin.token) {
    renderLogin();
    return;
  }

  const conversationCountLabel = state.admin.loadingConversations
    ? 'Carregando conversas...'
    : `${state.admin.conversations.length} conversa${state.admin.conversations.length === 1 ? '' : 's'}`;
  const adminModeClass = state.admin.tab === 'chats'
    ? (state.admin.activeConvId ? 'admin-chat-focus' : 'admin-chat-list')
    : '';

  const previousList = app.querySelector('.admin-main .messages');
  const previousScroll = previousList ? {
    top: previousList.scrollTop,
    stickToBottom: state.admin.shouldStickToBottom || previousList.scrollTop + previousList.clientHeight >= previousList.scrollHeight - 8
  } : null;

  app.innerHTML = `
    <div class="app admin ${adminModeClass}">
      <aside class="admin-sidebar">
        <header class="admin-head">
          <div class="admin-head-copy">
            <div class="admin-kicker">Acesso restrito</div>
            <h1 class="brand">Brawl Talk<span class="brand-ing">ing</span></h1>
            <div class="soft">Operação em tempo real</div>
          </div>
          <button class="icon-button" data-admin-logout aria-label="Sair">${icons.close}</button>
        </header>
        <nav class="tabs" aria-label="Painel">
          ${[
            ['chats', 'Chats'],
            ['metrics', 'Métricas'],
            ['mod', 'Moderação']
          ].map(([id, label]) => `
            <button class="tab ${state.admin.tab === id ? 'active' : ''}" data-admin-tab="${id}">${label}</button>
          `).join('')}
        </nav>
        <div class="conversation-count">${conversationCountLabel}</div>
        <div class="conversation-list">
          ${state.admin.tab === 'chats' ? renderConversationList() : ''}
        </div>
      </aside>
      ${renderAdminMain()}
    </div>
  `;

  bindAdmin();
  applyAdminScroll(options, previousScroll);
}

function applyAdminScroll(options, previousScroll) {
  const list = app.querySelector('.admin-main .messages');
  if (!list) return;
  const restore = () => {
    if (options.scrollToBottom === true || !previousScroll || previousScroll.stickToBottom || isAdminReplyFocused()) {
      list.scrollTop = list.scrollHeight;
      state.admin.shouldStickToBottom = true;
      return;
    }
    list.scrollTop = previousScroll.top;
  };
  restore();
  requestAnimationFrame(restore);
}

function renderConversationList() {
  const list = sortedConversations();
  if (state.admin.loadingConversations && !list.length) {
    return renderConversationSkeleton();
  }
  if (state.admin.conversationsError && !list.length) {
    return renderEmptyState({
      icon: '⚠️',
      title: 'Falha ao carregar conversas',
      description: state.admin.conversationsError,
      actionLabel: 'Tentar novamente',
      actionAttr: 'data-retry-conversations'
    });
  }
  if (!list.length) {
    return renderEmptyState({
      icon: '💬',
      title: 'Nenhuma conversa ativa',
      description: 'Quando um visitante iniciar um chat, ele aparecerá aqui automaticamente.'
    });
  }
  return list.map((conv) => {
    const brawler = getBrawler(conv.brawler?.id);
    const wait = waitInfo(conv.waitingSince);
    const active = conv.id === state.admin.activeConvId;
    const previewText = conv.lastMessage
      ? conv.lastMessage.flagged
        ? ' · mensagem moderada'
        : ` · ${escapeHtml(conv.lastMessage.text)}`
      : '';
    return `
      <div class="conversation-row ${active ? 'active' : ''}">
        <button class="conversation-item ${active ? 'active' : ''} ${wait?.level || ''}" type="button" data-select-conv="${escapeAttr(conv.id)}">
          <span class="conversation-avatar" style="${brawler ? `background-color:${escapeAttr(brawler.bgColor || '')};` : ''}">${brawler ? `<img src="${escapeAttr(brawler.image)}" alt="Avatar de ${escapeAttr(brawler.name)}" />` : ''}</span>
          <span class="conversation-main">
            <span class="conversation-title">
              ${conv.pinned ? '<span title="Fixado">📌</span>' : ''}
              <span class="truncate">${escapeHtml(conv.userName)}</span>
            </span>
            <span class="conversation-preview truncate">${escapeHtml(conv.brawler?.name || '')}${previewText}</span>
          </span>
          <span class="conversation-meta">
            ${wait ? `<span class="badge wait-badge ${wait.level}">${wait.label}</span>` : ''}
            ${conv.unread ? `<span class="badge unread-badge">${conv.unread > 9 ? '9+' : conv.unread}</span>` : `<span class="soft">${formatTime(conv.lastMessage?.timestamp || conv.createdAt)}</span>`}
          </span>
        </button>
        <button class="icon-button conversation-pin ${conv.pinned ? 'is-pinned' : ''}" type="button" data-pin-conv="${escapeAttr(conv.id)}" title="${conv.pinned ? 'Desafixar conversa' : 'Fixar conversa'}" aria-label="${conv.pinned ? 'Desafixar conversa' : 'Fixar conversa'}">${icons.pin}</button>
      </div>
    `;
  }).join('');
}

function renderAdminMain() {
  if (state.admin.tab === 'metrics') return renderMetricsView();
  if (state.admin.tab === 'mod') return renderModerationView();

  if (state.admin.loadingConversations && !state.admin.conversations.length) {
    return `<main class="admin-main"><section class="messages">${renderMessageSkeleton()}</section></main>`;
  }

  const activeId = state.admin.activeConvId;
  const conv = state.admin.conversations.find((item) => item.id === activeId);
  const detail = state.admin.details[activeId];
  if (!activeId || !conv) {
    return `<main class="admin-main">${renderEmptyState({
      icon: state.admin.conversations.length ? '👉' : '💤',
      title: state.admin.conversations.length ? 'Selecione uma conversa' : 'Painel aguardando visitantes',
      description: state.admin.conversations.length ? 'Abra uma conversa na lista para responder em tempo real.' : 'Quando um visitante iniciar um chat, ele aparecerá aqui com atualização automática.'
    })}</main>`;
  }
  const brawler = getBrawler(conv.brawler?.id);
  const isDetailLoading = state.admin.detailLoadingId === activeId;
  const hasDetailError = state.admin.detailError.convId === activeId;
  const wait = waitInfo(conv.waitingSince);
  const totalMessages = detail?.messages.length || 0;
  const userMessages = detail ? detail.messages.filter((message) => message.type === 'user').length : 0;
  return `
    <main class="admin-main">
      <header class="admin-chat-head">
        <div class="admin-chat-profile">
          <span class="conversation-avatar" style="${brawler ? `background-color:${escapeAttr(brawler.bgColor || '')};` : ''}">${brawler ? `<img src="${escapeAttr(brawler.image)}" alt="Avatar de ${escapeAttr(brawler.name)}" />` : ''}</span>
          <div class="admin-chat-copy">
            <strong>${escapeHtml(conv.userName)}</strong>
            <div class="muted">conversando com ${escapeHtml(conv.brawler?.name || '')}</div>
            <div class="admin-chat-badges">
              <span class="badge subtle-badge">${totalMessages || 0} msg${totalMessages === 1 ? '' : 's'}</span>
              ${userMessages ? `<span class="badge subtle-badge">${userMessages} do visitante</span>` : ''}
              ${conv.pinned ? '<span class="badge pin-badge">Fixada</span>' : ''}
              ${wait ? `<span class="badge wait-badge ${wait.level}">${wait.label}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="admin-chat-status">
          <button class="pill-button admin-mobile-back" type="button" data-admin-back>Voltar à fila</button>
          <span class="status-pill ${wait ? (wait.level || 'warning') : 'success'}">${wait ? 'Na fila' : 'Em atendimento'}</span>
        </div>
      </header>
      <section class="messages">
        ${isDetailLoading
          ? renderMessageSkeleton()
          : hasDetailError
            ? renderEmptyState({
              icon: '⚠️',
              title: 'Não foi possível abrir a conversa',
              description: state.admin.detailError.message,
              actionLabel: 'Tentar novamente',
              actionAttr: 'data-retry-detail'
            })
            : detail
              ? detail.messages.map((message) => renderAdminMessage(message, conv)).join('')
              : renderMessageSkeleton(3)}
      </section>
      <footer class="composer admin-composer">
        <div class="composer-meta">
          <span class="soft">Respondendo como ${escapeHtml(conv.brawler?.name || 'personagem')}</span>
          <span class="soft">Enter envia · Shift+Enter quebra linha</span>
        </div>
        <form class="composer-form" data-admin-reply-form>
          <label class="sr-only" for="reply-input">Resposta</label>
          <textarea class="textarea" id="reply-input" rows="1" maxlength="1000" inputmode="text" autocomplete="off" spellcheck="true" placeholder="Responder como ${escapeAttr(conv.brawler?.name || 'personagem')}...">${escapeHtml(state.admin.replyDraft)}</textarea>
          <button class="send-button" type="submit" aria-label="Enviar resposta" ${state.admin.replyDraft.trim() && !state.admin.sendingReply ? '' : 'disabled'}>${icons.send}</button>
        </form>
      </footer>
    </main>
  `;
}

function renderAdminMessage(message, conv) {
  const isUser = message.type === 'user';
  const brawler = getBrawler(conv.brawler?.id);
  const reactions = message.reactions || {};
  const hasReactions = Object.values(reactions).some((users) => users.length > 0);
  const canRevealOriginal = Boolean(message.flagged && message.originalText && message.originalText !== message.text);
  const revealOriginal = canRevealOriginal && isAdminMessageRevealed(message.id);
  const displayedText = message.flagged
    ? revealOriginal
      ? message.originalText
      : 'Conteúdo moderado oculto.'
    : message.text;
  return `
    <article class="message-row ${isUser ? 'brawler' : 'user'}">
      ${isUser && brawler ? `<div class="message-avatar" style="background-color:${escapeAttr(brawler.bgColor || '')};"><img src="${escapeAttr(brawler.image)}" alt="${escapeAttr(brawler.name)}" /></div>` : ''}
      <div class="message-stack">
        ${message.flagged ? `
          <div class="flag-row">
            <span class="flag">⚠ mensagem moderada automaticamente</span>
            ${canRevealOriginal ? `<button class="pill-button moderation-toggle" type="button" data-toggle-moderated-message="${escapeAttr(message.id)}">${revealOriginal ? 'Ocultar mensagem' : 'Ver mensagem'}</button>` : ''}
          </div>
        ` : ''}
        <div class="bubble ${message.flagged ? 'flagged' : ''}">${escapeHtml(displayedText)}</div>
        ${hasReactions ? renderAdminReactions(reactions) : ''}
        <div class="message-time">${escapeHtml(isUser ? conv.userName : conv.brawler?.name || '')} · ${formatTime(message.timestamp)}</div>
      </div>
    </article>
  `;
}

function renderAdminReactions(reactions) {
  return `
    <div class="reactions">
      ${Object.entries(reactions).map(([emoji, users]) => (
        users.length ? `<span class="reaction-pill"><span>${emoji}</span><span>${users.length}</span></span>` : ''
      )).join('')}
    </div>
  `;
}

function bindAdmin() {
  app.querySelector('[data-admin-logout]')?.addEventListener('click', logoutAdmin);

  const list = app.querySelector('.admin-main .messages');
  list?.addEventListener('scroll', () => {
    state.admin.shouldStickToBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
  });

  app.querySelectorAll('[data-admin-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.admin.tab = button.dataset.adminTab;
      if (state.admin.tab === 'metrics') loadMetrics();
      if (state.admin.tab === 'mod') loadModeration();
      renderAdmin();
    });
  });

  app.querySelectorAll('[data-select-conv]').forEach((button) => {
    button.addEventListener('click', async () => {
      await selectConversation(button.dataset.selectConv);
    });
  });

  app.querySelectorAll('[data-pin-conv]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await pinConversation(button.dataset.pinConv);
    });
  });

  app.querySelectorAll('[data-toggle-moderated-message]').forEach((button) => {
    button.addEventListener('click', () => {
      toggleAdminMessageReveal(button.dataset.toggleModeratedMessage);
    });
  });

  app.querySelector('[data-admin-back]')?.addEventListener('click', () => {
    state.admin.activeConvId = '';
    state.admin.replyDraft = '';
    renderAdmin();
  });

  const reply = app.querySelector('#reply-input');
  const replyButton = app.querySelector('[data-admin-reply-form] .send-button');
  reply?.addEventListener('input', () => {
    state.admin.replyDraft = reply.value;
    replyButton.disabled = !reply.value.trim() || state.admin.sendingReply;
    reply.style.height = 'auto';
    reply.style.height = `${Math.min(reply.scrollHeight, 128)}px`;
    sendTyping(true);
  });
  reply?.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await sendAdminReply();
    }
  });
  reply?.addEventListener('blur', () => {
    if (!state.admin.pendingRender) return;
    state.admin.pendingRender = false;
    renderAdmin();
  });

  app.querySelector('[data-admin-reply-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendAdminReply();
  });

  app.querySelector('[data-refresh-metrics]')?.addEventListener('click', loadMetrics);
  app.querySelector('[data-reset-metrics]')?.addEventListener('click', resetMetrics);
  app.querySelector('[data-retry-conversations]')?.addEventListener('click', loadAdminConversations);
  app.querySelector('[data-retry-detail]')?.addEventListener('click', async () => {
    if (state.admin.activeConvId) await selectConversation(state.admin.activeConvId);
  });
  app.querySelector('[data-retry-metrics]')?.addEventListener('click', loadMetrics);
  app.querySelector('[data-retry-moderation]')?.addEventListener('click', loadModeration);

  app.querySelector('[data-word-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await addModerationItem('words');
  });
  app.querySelector('[data-term-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await addModerationItem('terms');
  });
  app.querySelectorAll('[data-remove-word]').forEach((button) => {
    button.addEventListener('click', () => removeModerationItem('words', button.dataset.removeWord));
  });
  app.querySelectorAll('[data-remove-term]').forEach((button) => {
    button.addEventListener('click', () => removeModerationItem('terms', button.dataset.removeTerm));
  });
  app.querySelector('[data-moderation-mode]')?.addEventListener('change', saveSettings);
  app.querySelector('[data-featured-brawler]')?.addEventListener('change', saveSettings);
}

async function selectConversation(convId) {
  state.admin.activeConvId = convId;
  state.admin.replyDraft = '';
  state.admin.shouldStickToBottom = true;
  state.admin.detailLoadingId = '';
  state.admin.detailError = { convId: '', message: '' };
  const conv = state.admin.conversations.find((item) => item.id === convId);
  if (conv) conv.unread = 0;
  renderAdmin({ scrollToBottom: true });
  try {
    await adminApi(`/api/admin/conversations/${encodeURIComponent(convId)}/read`, { method: 'POST' });
    if (!state.admin.details[convId]) {
      state.admin.detailLoadingId = convId;
      renderAdmin({ scrollToBottom: true });
      const data = await adminApi(`/api/admin/conversations/${encodeURIComponent(convId)}`);
      state.admin.details[convId] = {
        conversation: data.conversation,
        messages: data.messages || []
      };
    }
    state.admin.detailLoadingId = '';
    renderAdmin({ scrollToBottom: true });
  } catch (err) {
    state.admin.detailLoadingId = '';
    state.admin.detailError = {
      convId,
      message: err.message || 'Erro ao abrir conversa.'
    };
    renderAdmin({ scrollToBottom: true });
  }
}

async function pinConversation(convId) {
  try {
    const data = await adminApi(`/api/admin/conversations/${encodeURIComponent(convId)}/pin`, { method: 'POST' });
    upsertConversation(data.conversation);
    renderAdmin();
  } catch (err) {
    showToast(err.message || 'Erro ao fixar conversa.', 'error');
  }
}

function sendTyping(typing) {
  const convId = state.admin.activeConvId;
  if (!convId) return;
  clearTimeout(state.admin.typingTimer);
  adminApi(`/api/admin/conversations/${encodeURIComponent(convId)}/typing`, {
    method: 'POST',
    body: { typing }
  }).catch(() => {});
  if (typing) {
    state.admin.typingTimer = window.setTimeout(() => sendTyping(false), 1600);
  }
}

async function sendAdminReply() {
  const convId = state.admin.activeConvId;
  const text = (app.querySelector('#reply-input')?.value || '').trim();
  if (!convId || !text || state.admin.sendingReply) return;
  try {
    state.admin.sendingReply = true;
    clearTimeout(state.admin.typingTimer);
    const data = await adminApi(`/api/admin/conversations/${encodeURIComponent(convId)}/messages`, {
      method: 'POST',
      body: { text }
    });
    upsertConversation(data.conversation);
    appendAdminDetailMessage(convId, data.message);
    state.admin.replyDraft = '';
    state.admin.sendingReply = false;
    sendTyping(false);
    renderAdminAndFocusReply();
  } catch (err) {
    state.admin.sendingReply = false;
    showToast(err.message || 'Não foi possível responder.', 'error');
  }
}

async function loadMetrics() {
  state.admin.metricsLoading = true;
  state.admin.metricsError = '';
  if (state.view === 'admin' && state.admin.tab === 'metrics') renderAdmin();
  try {
    state.admin.metrics = await adminApi('/api/admin/metrics');
    state.admin.metricsLoading = false;
    if (state.view === 'admin' && state.admin.tab === 'metrics') renderAdmin();
  } catch (err) {
    state.admin.metricsLoading = false;
    state.admin.metricsError = err.message || 'Erro ao carregar métricas.';
    if (state.view === 'admin' && state.admin.tab === 'metrics') renderAdmin();
  }
}

function renderMetricsView() {
  const data = state.admin.metrics;
  if (!data && state.admin.metricsLoading) {
    return `
      <main class="admin-main">
        <section class="metrics">
          <div class="view-head">
            <h2>Métricas</h2>
            <button class="icon-button" data-refresh-metrics aria-label="Atualizar">${icons.refresh}</button>
          </div>
          ${renderMetricSkeleton()}
        </section>
      </main>
    `;
  }

  if (!data && state.admin.metricsError) {
    return `
      <main class="admin-main">
        <section class="metrics">
          <div class="view-head">
            <h2>Métricas</h2>
            <button class="icon-button" data-refresh-metrics aria-label="Atualizar">${icons.refresh}</button>
          </div>
          ${renderEmptyState({
            icon: '⚠️',
            title: 'Falha ao carregar métricas',
            description: state.admin.metricsError,
            actionLabel: 'Tentar novamente',
            actionAttr: 'data-retry-metrics'
          })}
        </section>
      </main>
    `;
  }

  const cards = [
    { label: 'Sessões ativas', value: data.activeSessionsCount, sub: 'agora', icon: '🟢', tone: 'success' },
    { label: 'Conversas', value: data.totalConversations, sub: `${data.totalJoins} acessos`, icon: '💬', tone: 'accent' },
    { label: 'Engajamento', value: `${data.engagementRate}%`, sub: `${data.engagedConversations} com 3+ mensagens`, icon: '🎯', tone: 'warning' },
    { label: 'Retorno', value: `${data.returnRate}%`, sub: `${data.returnJoins} retornos`, icon: '🔁', tone: 'neutral' },
    { label: 'Resposta média', value: formatDuration(data.avgResponseTimeMs), sub: `${data.totalResponsesSampled} respostas`, icon: '⚡', tone: 'warning' },
    { label: 'Sessão média', value: formatDuration(data.avgSessionDurationMs), sub: `${data.totalSessionsSampled} sessões`, icon: '⏱', tone: 'accent' }
  ];
  const max = Math.max(1, ...(data.brawlerStats || []).map((item) => item.conversations));

  return `
    <main class="admin-main">
      <section class="metrics">
        <div class="view-head view-head-rich">
          <div class="view-copy">
            <span class="view-kicker">Painel secreto</span>
            <h2>Métricas</h2>
            <p class="muted">Acompanhe volume, engajamento e velocidade de atendimento em tempo real.</p>
          </div>
          <div class="home-actions">
            <button class="icon-button" data-refresh-metrics aria-label="Atualizar">${icons.refresh}</button>
            <button class="danger-button" data-reset-metrics>Zerar</button>
          </div>
        </div>
        <div class="metrics-grid">
          ${cards.map((card) => `
            <article class="metric-card ${card.tone}">
              <div class="metric-card-top">
                <p class="muted">${escapeHtml(card.label)}</p>
                <span class="metric-icon" aria-hidden="true">${escapeHtml(card.icon)}</span>
              </div>
              <div class="metric-value">${escapeHtml(card.value)}</div>
              <p class="metric-sub">${escapeHtml(card.sub)}</p>
            </article>
          `).join('')}
        </div>
        <section class="ranking-panel">
          <h3>Conversas por personagem</h3>
          ${(data.brawlerStats || []).length ? data.brawlerStats.map((item) => `
            <div class="bar-row">
              <strong class="truncate">${escapeHtml(item.name)}</strong>
              <span class="bar-track"><span class="bar-fill" style="width: ${Math.round((item.conversations / max) * 100)}%"></span></span>
              <span class="muted">${item.conversations} · ${item.messages}</span>
            </div>
          `).join('') : '<p class="muted">Sem conversas ainda.</p>'}
        </section>
      </section>
    </main>
  `;
}

async function resetMetrics() {
  if (!window.confirm('Isso vai zerar métricas e conversas em memória. Confirmar?')) return;
  try {
    await adminApi('/api/admin/metrics/reset', { method: 'POST' });
    state.admin.metrics = null;
    await loadMetrics();
    showToast('Métricas zeradas.', 'success');
  } catch (err) {
    showToast(err.message || 'Erro ao zerar métricas.', 'error');
  }
}

async function loadModeration() {
  state.admin.moderationLoading = true;
  state.admin.moderationError = '';
  if (state.view === 'admin' && state.admin.tab === 'mod') renderAdmin();
  try {
    const [words, terms, settings] = await Promise.all([
      adminApi('/api/admin/word-filter'),
      adminApi('/api/admin/nickname-blacklist'),
      adminApi('/api/admin/settings')
    ]);
    state.admin.moderation = {
      words: words.words || [],
      terms: terms.terms || [],
      settings
    };
    state.admin.moderationLoading = false;
    if (state.view === 'admin' && state.admin.tab === 'mod') renderAdmin();
  } catch (err) {
    state.admin.moderationLoading = false;
    state.admin.moderationError = err.message || 'Erro ao carregar moderação.';
    if (state.view === 'admin' && state.admin.tab === 'mod') renderAdmin();
  }
}

function renderModerationView() {
  const data = state.admin.moderation;
  if (!data && state.admin.moderationLoading) {
    return `<main class="admin-main"><section class="moderation">${renderModerationSkeleton()}</section></main>`;
  }

  if (!data && state.admin.moderationError) {
    return `<main class="admin-main"><section class="moderation">${renderEmptyState({
      icon: '⚠️',
      title: 'Falha ao carregar moderação',
      description: state.admin.moderationError,
      actionLabel: 'Tentar novamente',
      actionAttr: 'data-retry-moderation'
    })}</section></main>`;
  }

  return `
    <main class="admin-main">
      <section class="moderation">
        <div class="view-head view-head-rich">
          <div class="view-copy">
            <span class="view-kicker">Controles</span>
            <h2>Moderação</h2>
            <p class="muted">Mascare palavras sensíveis na conversa ou bloqueie o envio antes que a mensagem chegue à fila.</p>
          </div>
        </div>
        <div class="settings-grid">
          <label>
            <span class="muted">Filtro de mensagens</span>
            <select class="select" data-moderation-mode>
              <option value="flag" ${data.settings.moderationMode === 'flag' ? 'selected' : ''}>Censurar e sinalizar</option>
              <option value="block" ${data.settings.moderationMode === 'block' ? 'selected' : ''}>Bloquear</option>
            </select>
          </label>
          <label>
            <span class="muted">Personagem em destaque</span>
            <select class="select" data-featured-brawler>
              <option value="">Ranking automático</option>
              ${brawlers.map((brawler) => `
                <option value="${escapeAttr(brawler.id)}" ${data.settings.featuredBrawlerId === brawler.id ? 'selected' : ''}>${escapeHtml(brawler.name)}</option>
              `).join('')}
            </select>
          </label>
        </div>
        <div class="editors-grid">
          ${renderListEditor('words', 'Filtro de palavras', data.words, 'Nova palavra', 'data-word-form', 'data-remove-word')}
          ${renderListEditor('terms', 'Blacklist de apelidos', data.terms, 'Novo termo', 'data-term-form', 'data-remove-term')}
        </div>
      </section>
    </main>
  `;
}

function renderListEditor(type, title, items, placeholder, formAttr, removeAttr) {
  return `
    <section class="editor">
      <h3>${escapeHtml(title)}</h3>
      <p class="muted">${type === 'words' ? 'Palavras filtradas são censuradas no chat e destacadas para o admin.' : 'Correspondência parcial, sem diferenciar maiúsculas.'}</p>
      <form class="editor-form" ${formAttr}>
        <input class="field" name="${type}" placeholder="${escapeAttr(placeholder)}" autocomplete="off" />
        <button class="primary-button" type="submit">Adicionar</button>
      </form>
      <div class="chip-list">
        ${items.length ? items.map((item) => `
          <span class="chip">${escapeHtml(item)} <button type="button" ${removeAttr}="${escapeAttr(item)}" aria-label="Remover ${escapeAttr(item)}">×</button></span>
        `).join('') : '<span class="soft">Nenhuma entrada.</span>'}
      </div>
    </section>
  `;
}

async function addModerationItem(type) {
  const input = app.querySelector(`input[name="${type}"]`);
  const value = input?.value.trim().toLowerCase();
  if (!value || !state.admin.moderation) return;
  const list = type === 'words' ? state.admin.moderation.words : state.admin.moderation.terms;
  if (list.includes(value)) return;
  await saveModerationList(type, [...list, value]);
  input.value = '';
}

async function removeModerationItem(type, value) {
  if (!state.admin.moderation) return;
  const list = type === 'words' ? state.admin.moderation.words : state.admin.moderation.terms;
  await saveModerationList(type, list.filter((item) => item !== value));
}

async function saveModerationList(type, list) {
  try {
    const endpoint = type === 'words' ? '/api/admin/word-filter' : '/api/admin/nickname-blacklist';
    const body = type === 'words' ? { words: list } : { terms: list };
    const data = await adminApi(endpoint, { method: 'PUT', body });
    if (type === 'words') state.admin.moderation.words = data.words;
    else state.admin.moderation.terms = data.terms;
    renderAdmin();
    showToast(type === 'words' ? 'Filtro de palavras salvo.' : 'Blacklist de apelidos salva.', 'success');
  } catch (err) {
    showToast(err.message || 'Erro ao salvar.', 'error');
  }
}

async function saveSettings() {
  if (!state.admin.moderation) return;
  const moderationMode = app.querySelector('[data-moderation-mode]')?.value || 'flag';
  const featuredBrawlerId = app.querySelector('[data-featured-brawler]')?.value || '';
  try {
    const data = await adminApi('/api/admin/settings', {
      method: 'PUT',
      body: { moderationMode, featuredBrawlerId }
    });
    state.admin.moderation.settings = data;
    showToast('Configurações salvas.', 'success');
  } catch (err) {
    showToast(err.message || 'Erro ao salvar configurações.', 'error');
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);
purgeLegacyChatStorage();
void ensureChatConfigLoaded();

(function injectHumanNoticeBadge() {
  if (document.querySelector('.human-notice-badge')) return;
  const badge = document.createElement('div');
  badge.className = 'human-notice-badge';
  badge.textContent = 'Mensagens podem ser lidas por humanos';
  document.body.appendChild(badge);
}());

route();
