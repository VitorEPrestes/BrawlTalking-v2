const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const DEFAULT_TOKEN_SECRET = 'brawltalkie-reborn-dev-secret';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
const TOKEN_SECRET = process.env.TOKEN_SECRET || DEFAULT_TOKEN_SECRET;

const PUBLIC_DIR = path.join(__dirname, 'public');
const PRIMARY_PORTRAITS_DIR = path.join(__dirname, 'Portraits');
const LEGACY_PORTRAITS_DIR = path.join(__dirname, 'BrawlTalking', 'portraits');
const PORTRAITS_DIR = fs.existsSync(PRIMARY_PORTRAITS_DIR) ? PRIMARY_PORTRAITS_DIR : LEGACY_PORTRAITS_DIR;
const CHAT_CONFIG_PATH = path.join(__dirname, 'chat-config.json');
const MODERATION_CONFIG_PATH = path.join(__dirname, 'moderation-config.json');

const MAX_BODY_BYTES = 1_000_000;
const MESSAGE_LIMIT = 5;
const MESSAGE_WINDOW_MS = 60_000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_STREAM_TICKET_TTL_MS = 2 * 60 * 1000;
const CONVERSATION_RETENTION_MS = 10 * 60 * 1000;

const brawlers = [
  { id: 'spike', name: 'Spike', image: 'spike_portrait.png' },
  { id: 'colt', name: 'Colt', image: 'colt_portrait.png' },
  { id: 'shelly', name: 'Shelly', image: 'Shelly_portrait.png' },
  { id: 'bull', name: 'Bull', image: 'bull_portrait.png' },
  { id: 'brock', name: 'Brock', image: 'brock_portrait.png' },
  { id: 'el-primo', name: 'El Primo', image: 'elprimo_portrait.png' },
  { id: 'angelo', name: 'Angelo', image: 'angelo_portrait.png' },
  { id: 'mina', name: 'Mina', image: 'Mina_portrait.png' },
  { id: 'jessie', name: 'Jessie', image: 'jessie_portrait.png' },
  { id: 'nita', name: 'Nita', image: 'nita_portrait.png' }
];

const conversations = new Map();
const rankingCounts = new Map();
const adminStreams = new Set();
const userStreams = new Map();
const messageWindows = new Map();
const loginAttempts = new Map();
const nicknameValidationAttempts = new Map();
const adminStreamTickets = new Map();
const conversationCloseTimers = new Map();

const metrics = {
  totalJoins: 0,
  returnJoins: 0,
  activeSessions: new Map(),
  responseTimes: [],
  sessionDurations: [],
  pendingResponses: new Map()
};

const DEFAULT_PROFANITY_WORDS = [
  'porra',
  'merda',
  'caralho',
  'puta',
  'viado',
  'idiota',
  'imbecil',
  'otario',
  'fodase',
  'vsf',
  'fdp',
  'pqp'
];

const DEFAULT_NICKNAME_BLACKLIST = [
  'admin',
  'moderador',
  'sistema',
  'bot',
  'operador',
  'suporte',
  'staff',
  'brawlstars',
  'supercell'
];

const DEFAULT_CHAT_CONFIG = {
  welcomeMessages: [
    'Ola, {userName}! Voce esta conversando com {brawlerName}. Como posso te ajudar hoje?'
  ],
  statusTexts: ['esta pensando']
};

const DEFAULT_MODERATION_CONFIG = {
  words: DEFAULT_PROFANITY_WORDS,
  nicknameBlacklist: DEFAULT_NICKNAME_BLACKLIST,
  moderationMode: 'flag',
  featuredBrawlerId: ''
};

const initialModerationConfig = readModerationConfig();

let profanityWords = new Set(initialModerationConfig.words);
let nicknameBlacklist = new Set(initialModerationConfig.nicknameBlacklist);
let moderationMode = initialModerationConfig.moderationMode;
let featuredBrawlerId = initialModerationConfig.featuredBrawlerId;

function nowIso() {
  return new Date().toISOString();
}

function readChatConfig() {
  try {
    const raw = fs.readFileSync(CHAT_CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { default: DEFAULT_CHAT_CONFIG, brawlers: {} };
  }
}

function resolveChatConfig(brawlerId) {
  const config = readChatConfig();
  const base = config?.default || {};
  const custom = config?.brawlers?.[brawlerId] || {};
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

function randomItem(items, fallback) {
  if (!Array.isArray(items) || !items.length) return fallback;
  return items[Math.floor(Math.random() * items.length)] || fallback;
}

function applyChatTemplate(template, { userName, brawlerName }) {
  return String(template || '')
    .replaceAll('{userName}', userName)
    .replaceAll('{brawlerName}', brawlerName);
}

function buildWelcomeMessage(userName, brawler) {
  const config = resolveChatConfig(brawler.id);
  const template = randomItem(config.welcomeMessages, DEFAULT_CHAT_CONFIG.welcomeMessages[0]);
  return applyChatTemplate(template, { userName, brawlerName: brawler.name });
}

function generateId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function sanitizeText(value, max = 1000) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function sanitizeMessageText(value, max = 1000) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max);
}

function sanitizeModerationEntries(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => sanitizeText(value, 60).toLowerCase()).filter(Boolean))).sort();
}

function sanitizeModerationMode(value) {
  return value === 'block' ? 'block' : 'flag';
}

function sanitizeFeaturedBrawlerId(value) {
  return typeof value === 'string' && isValidBrawler(value) ? value : '';
}

function readModerationConfig() {
  try {
    const raw = fs.readFileSync(MODERATION_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const nicknameSource = Array.isArray(parsed.nicknameBlacklist)
      ? parsed.nicknameBlacklist
      : Array.isArray(parsed.terms)
        ? parsed.terms
        : DEFAULT_MODERATION_CONFIG.nicknameBlacklist;

    return {
      words: sanitizeModerationEntries(Array.isArray(parsed.words) ? parsed.words : DEFAULT_MODERATION_CONFIG.words),
      nicknameBlacklist: sanitizeModerationEntries(nicknameSource),
      moderationMode: sanitizeModerationMode(parsed.moderationMode),
      featuredBrawlerId: sanitizeFeaturedBrawlerId(parsed.featuredBrawlerId)
    };
  } catch {
    return {
      words: [...DEFAULT_MODERATION_CONFIG.words],
      nicknameBlacklist: [...DEFAULT_MODERATION_CONFIG.nicknameBlacklist],
      moderationMode: DEFAULT_MODERATION_CONFIG.moderationMode,
      featuredBrawlerId: DEFAULT_MODERATION_CONFIG.featuredBrawlerId
    };
  }
}

function writeModerationConfig(config) {
  const normalized = {
    words: sanitizeModerationEntries(config.words),
    nicknameBlacklist: sanitizeModerationEntries(config.nicknameBlacklist),
    moderationMode: sanitizeModerationMode(config.moderationMode),
    featuredBrawlerId: sanitizeFeaturedBrawlerId(config.featuredBrawlerId)
  };

  fs.writeFileSync(MODERATION_CONFIG_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

function currentModerationConfig() {
  return {
    words: Array.from(profanityWords),
    nicknameBlacklist: Array.from(nicknameBlacklist),
    moderationMode,
    featuredBrawlerId
  };
}

function isValidBrawler(id) {
  return brawlers.some((brawler) => brawler.id === id);
}

function compactBrawler(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = sanitizeText(raw.id, 40);
  const known = brawlers.find((brawler) => brawler.id === id);
  if (!known) return null;
  return { id: known.id, name: known.name };
}

function normalizeModerationValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function createModerationSearchIndex(text) {
  const source = String(text || '');
  let normalized = '';
  const indexes = [];

  for (let index = 0; index < source.length; index += 1) {
    const normalizedChunk = String(source[index] || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    for (const char of normalizedChunk) {
      if (!/[a-z0-9]/.test(char)) continue;
      normalized += char;
      indexes.push(index);
    }
  }

  return { normalized, indexes };
}

function mergeRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const merged = [sorted[0]];

  for (const range of sorted.slice(1)) {
    const current = merged[merged.length - 1];
    if (range.start <= current.end) {
      current.end = Math.max(current.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }

  return merged;
}

function censorText(text, ranges) {
  const chars = String(text || '').split('');

  for (const range of ranges) {
    for (let index = range.start; index < range.end && index < chars.length; index += 1) {
      if (!/\s/.test(chars[index])) chars[index] = '*';
    }
  }

  return chars.join('');
}

function moderateMessageText(text) {
  const searchIndex = createModerationSearchIndex(text);
  const terms = new Set();
  const matches = [];

  for (const word of profanityWords) {
    const normalizedWord = normalizeModerationValue(word);
    if (!normalizedWord) continue;

    let cursor = searchIndex.normalized.indexOf(normalizedWord);
    while (cursor >= 0) {
      const start = searchIndex.indexes[cursor];
      const end = searchIndex.indexes[cursor + normalizedWord.length - 1] + 1;
      matches.push({ start, end });
      terms.add(word);
      cursor = searchIndex.normalized.indexOf(normalizedWord, cursor + normalizedWord.length);
    }
  }

  const flaggedTerms = Array.from(terms).sort();
  if (!flaggedTerms.length) {
    return {
      blocked: false,
      flagged: false,
      moderatedText: text,
      flaggedTerms,
      flaggedTerm: '',
      moderationAction: 'allow'
    };
  }

  if (moderationMode === 'block') {
    return {
      blocked: true,
      flagged: true,
      moderatedText: text,
      flaggedTerms,
      flaggedTerm: flaggedTerms[0] || '',
      moderationAction: 'block'
    };
  }

  return {
    blocked: false,
    flagged: true,
    moderatedText: censorText(text, mergeRanges(matches)),
    flaggedTerms,
    flaggedTerm: flaggedTerms[0] || '',
    moderationAction: 'censor'
  };
}

function isNicknameBlocked(name) {
  const normalized = normalizeText(name);
  for (const term of nicknameBlacklist) {
    const normalizedTerm = normalizeText(term);
    if (normalizedTerm && normalized.includes(normalizedTerm)) return true;
  }
  return false;
}

function hmac(value) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(value).digest('base64url');
}

function safeEqual(a, b) {
  try {
    return crypto.timingSafeEqual(Buffer.from(String(a)), Buffer.from(String(b)));
  } catch {
    return false;
  }
}

function issueToken() {
  const payload = Buffer.from(JSON.stringify({
    role: 'admin',
    exp: Date.now() + TOKEN_TTL_MS,
    nonce: generateId('token')
  })).toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, hmac(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.role === 'admin' && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function getAuthToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

function requireAdmin(req, res) {
  if (verifyToken(getAuthToken(req))) return true;
  sendJson(res, 401, { error: 'Unauthorized.' });
  return false;
}

function conversationSummary(conv) {
  return {
    id: conv.id,
    userName: conv.userName,
    brawler: conv.brawler,
    unread: conv.unread,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    waitingSince: conv.waitingSince,
    pinned: conv.pinned,
    lastMessage: conv.messages[conv.messages.length - 1] || null
  };
}

function broadcastAdmin(event, payload) {
  for (const stream of Array.from(adminStreams)) {
    writeEvent(stream, event, payload);
  }
}

function broadcastUser(convId, event, payload) {
  const streams = userStreams.get(convId);
  if (!streams) return;
  for (const stream of Array.from(streams)) {
    writeEvent(stream, event, payload);
  }
}

function writeEvent(res, event, payload) {
  if (res.destroyed) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function addUserStream(convId, res) {
  if (!userStreams.has(convId)) userStreams.set(convId, new Set());
  userStreams.get(convId).add(res);
}

function removeUserStream(convId, res) {
  const streams = userStreams.get(convId);
  if (!streams) return;
  streams.delete(res);
  if (streams.size === 0) userStreams.delete(convId);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let totalBytes = 0;
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        settled = true;
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (settled) return;
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function baseSecurityHeaders() {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  };
  if (NODE_ENV === 'production') {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  return headers;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...baseSecurityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendEmpty(res, status = 204) {
  res.writeHead(status, {
    ...baseSecurityHeaders(),
    'Cache-Control': 'no-store'
  });
  res.end();
}

function handleLoginAttempt(req, res) {
  const ip = req.socket.remoteAddress || 'local';
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  if (Date.now() > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = Date.now() + 15 * 60 * 1000;
  }
  if (entry.count >= 10) {
    sendJson(res, 429, { error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
    return false;
  }
  entry.count += 1;
  loginAttempts.set(ip, entry);
  return true;
}

function clearLoginAttempts(req) {
  loginAttempts.delete(req.socket.remoteAddress || 'local');
}

function checkMessageLimit(convId) {
  const now = Date.now();
  const kept = (messageWindows.get(convId) || []).filter((time) => now - time < MESSAGE_WINDOW_MS);
  if (kept.length >= MESSAGE_LIMIT) {
    const retryAfterMs = MESSAGE_WINDOW_MS - (now - kept[0]);
    messageWindows.set(convId, kept);
    return { allowed: false, retryAfterMs };
  }
  kept.push(now);
  messageWindows.set(convId, kept);
  return { allowed: true, retryAfterMs: 0 };
}

function checkNicknameValidationLimit(ip) {
  const now = Date.now();
  const entry = nicknameValidationAttempts.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 60_000;
  }
  if (entry.count >= 12) {
    return false;
  }
  entry.count += 1;
  nicknameValidationAttempts.set(ip, entry);
  return true;
}

function pruneAdminStreamTickets() {
  const now = Date.now();
  for (const [ticket, expiresAt] of adminStreamTickets.entries()) {
    if (expiresAt <= now) adminStreamTickets.delete(ticket);
  }
}

function issueAdminStreamTicket() {
  pruneAdminStreamTickets();
  const ticket = generateId('evt');
  adminStreamTickets.set(ticket, Date.now() + ADMIN_STREAM_TICKET_TTL_MS);
  return ticket;
}

function verifyAdminStreamTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return false;
  pruneAdminStreamTickets();
  const expiresAt = adminStreamTickets.get(ticket);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function collectMetrics(convList) {
  const totalConversations = convList.length;
  const engagedConversations = convList.filter(
    (conv) => conv.messages.filter((message) => message.type === 'user').length >= 3
  ).length;
  const avg = (items) => items.length ? Math.round(items.reduce((sum, item) => sum + item, 0) / items.length) : null;
  const brawlerStats = {};

  for (const conv of convList) {
    const id = conv.brawler.id;
    if (!brawlerStats[id]) {
      brawlerStats[id] = { id, name: conv.brawler.name, conversations: 0, messages: 0 };
    }
    brawlerStats[id].conversations += 1;
    brawlerStats[id].messages += conv.messages.filter((message) => message.type === 'user').length;
  }

  return {
    totalConversations,
    activeSessionsCount: metrics.activeSessions.size,
    engagementRate: totalConversations ? Math.round((engagedConversations / totalConversations) * 100) : 0,
    engagedConversations,
    returnRate: metrics.totalJoins ? Math.round((metrics.returnJoins / metrics.totalJoins) * 100) : 0,
    totalJoins: metrics.totalJoins,
    returnJoins: metrics.returnJoins,
    avgResponseTimeMs: avg(metrics.responseTimes),
    avgSessionDurationMs: avg(metrics.sessionDurations),
    totalResponsesSampled: metrics.responseTimes.length,
    totalSessionsSampled: metrics.sessionDurations.length,
    brawlerStats: Object.values(brawlerStats).sort((a, b) => {
      if (b.conversations !== a.conversations) return b.conversations - a.conversations;
      return a.name.localeCompare(b.name, 'pt-BR');
    })
  };
}

function rankingPayload() {
  const ranking = {};
  for (const [id, conversations] of rankingCounts.entries()) {
    ranking[id] = { id, conversations };
  }
  return { ranking, featuredBrawlerId };
}

function clearConversationCloseTimer(convId) {
  const timer = conversationCloseTimers.get(convId);
  if (!timer) return;
  clearTimeout(timer);
  conversationCloseTimers.delete(convId);
}

function scheduleConversationClose(convId) {
  clearConversationCloseTimer(convId);
  const timer = setTimeout(() => {
    conversationCloseTimers.delete(convId);
    if (!userStreams.has(convId)) closeConversation(convId);
  }, CONVERSATION_RETENTION_MS);
  conversationCloseTimers.set(convId, timer);
}

function closeConversation(convId) {
  if (!conversations.has(convId)) return;
  clearConversationCloseTimer(convId);
  conversations.delete(convId);
  messageWindows.delete(convId);
  metrics.pendingResponses.delete(convId);
  broadcastAdmin('conversation-closed', { convId });
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;

  if (req.method === 'GET' && pathname === '/api/events') {
    return handleEvents(req, res, searchParams);
  }

  if (req.method === 'GET' && pathname === '/api/brawlers') {
    return sendJson(res, 200, { brawlers });
  }

  if (req.method === 'GET' && pathname === '/api/chat-config') {
    return sendJson(res, 200, readChatConfig());
  }

  if (req.method === 'GET' && pathname === '/api/ranking') {
    return sendJson(res, 200, rankingPayload());
  }

  if (req.method === 'POST' && pathname === '/api/validate-nickname') {
    const ip = req.socket.remoteAddress || 'local';
    if (!checkNicknameValidationLimit(ip)) {
      return sendJson(res, 429, { blocked: false, message: 'Muitas validações. Tente novamente em instantes.' });
    }
    const body = await readJson(req);
    const nickname = sanitizeText(body.nickname, 30);
    if (!nickname) return sendJson(res, 400, { blocked: false, message: 'Informe um apelido.' });
    if (isNicknameBlocked(nickname)) {
      return sendJson(res, 200, {
        blocked: true,
        message: 'Este nome não é permitido. Por favor, escolha outro apelido.'
      });
    }
    return sendJson(res, 200, { blocked: false });
  }

  if (req.method === 'POST' && pathname === '/api/user/join') {
    const body = await readJson(req);
    const userName = sanitizeText(body.userName, 30);
    const brawler = compactBrawler(body.brawler);
    const sessionId = sanitizeText(body.sessionId, 120);

    if (!userName || !brawler || !sessionId) {
      return sendJson(res, 400, { error: 'Dados da conversa inválidos.' });
    }
    if (isNicknameBlocked(userName)) {
      return sendJson(res, 403, { error: 'Este nome não é permitido. Por favor, escolha outro apelido.' });
    }

    const isReturn = conversations.has(sessionId);
    metrics.totalJoins += 1;
    if (isReturn) metrics.returnJoins += 1;

    let conv = conversations.get(sessionId);
    if (!conv) {
      const welcome = {
        id: generateId('msg'),
        type: 'brawler',
        isWelcome: true,
        text: buildWelcomeMessage(userName, brawler),
        timestamp: nowIso(),
        reactions: {}
      };
      conv = {
        id: sessionId,
        userName,
        brawler,
        messages: [welcome],
        unread: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        waitingSince: null,
        pinned: false
      };
      conversations.set(sessionId, conv);
      rankingCounts.set(brawler.id, (rankingCounts.get(brawler.id) || 0) + 1);
      broadcastAdmin('conversation-upsert', { conversation: conversationSummary(conv) });
      broadcastAdmin('ranking-update', rankingPayload());
    }
    clearConversationCloseTimer(sessionId);

    return sendJson(res, 200, {
      conversation: conversationSummary(conv),
      messages: conv.messages,
      isReturn
    });
  }

  if (req.method === 'POST' && pathname === '/api/user/message') {
    const body = await readJson(req);
    const convId = sanitizeText(body.sessionId, 120);
    const conv = conversations.get(convId);
    const text = sanitizeMessageText(body.text, 1000);
    if (!conv || !text) return sendJson(res, 400, { error: 'Mensagem inválida.' });

    const limit = checkMessageLimit(convId);
    if (!limit.allowed) {
      return sendJson(res, 429, {
        error: 'Você está enviando mensagens muito rapidamente. Aguarde alguns segundos.',
        retryAfterMs: limit.retryAfterMs
      });
    }

    const moderation = moderateMessageText(text);
    if (moderation.blocked) {
      return sendJson(res, 422, {
        error: 'Sua mensagem não pôde ser enviada. Por favor, mantenha um tom respeitoso.'
      });
    }

    const message = {
      id: generateId('msg'),
      type: 'user',
      text: moderation.moderatedText,
      originalText: moderation.moderationAction === 'censor' ? text : '',
      timestamp: nowIso(),
      flagged: moderation.flagged,
      flaggedTerm: moderation.flaggedTerm,
      flaggedTerms: moderation.flaggedTerms,
      moderationAction: moderation.moderationAction,
      reactions: {}
    };

    conv.messages.push(message);
    conv.unread += 1;
    conv.updatedAt = nowIso();
    if (!conv.waitingSince) conv.waitingSince = Date.now();
    metrics.pendingResponses.set(convId, Date.now());

    broadcastUser(convId, 'message', { message });
    broadcastAdmin('message', { convId, message, conversation: conversationSummary(conv) });
    broadcastAdmin('conversation-upsert', { conversation: conversationSummary(conv) });

    return sendJson(res, 201, { message, conversation: conversationSummary(conv) });
  }

  if (req.method === 'POST' && pathname === '/api/user/reaction') {
    const body = await readJson(req);
    const convId = sanitizeText(body.sessionId, 120);
    const msgId = sanitizeText(body.messageId, 80);
    const emoji = String(body.emoji || '');
    const userName = sanitizeText(body.userName, 30) || 'visitante';
    const allowed = ['⭐', '🔥', '💥', '😂', '👊', '🌵'];
    const conv = conversations.get(convId);
    if (!conv || !msgId || !allowed.includes(emoji)) return sendJson(res, 400, { error: 'Reação inválida.' });

    const message = conv.messages.find((item) => item.id === msgId);
    if (!message || message.type !== 'brawler') {
      return sendJson(res, 403, { error: 'Reações só podem ser usadas em mensagens do personagem.' });
    }

    if (!message.reactions) message.reactions = {};
    if (!message.reactions[emoji]) message.reactions[emoji] = [];
    const index = message.reactions[emoji].indexOf(userName);
    if (index >= 0) {
      message.reactions[emoji].splice(index, 1);
      if (message.reactions[emoji].length === 0) delete message.reactions[emoji];
    } else {
      message.reactions[emoji].push(userName);
    }

    conv.updatedAt = nowIso();
    const payload = { convId, messageId: msgId, reactions: message.reactions };
    broadcastUser(convId, 'reaction-update', payload);
    broadcastAdmin('reaction-update', payload);
    return sendJson(res, 200, payload);
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    if (!handleLoginAttempt(req, res)) return;
    const body = await readJson(req);
    if (safeEqual(body.password || '', ADMIN_PASSWORD)) {
      clearLoginAttempts(req);
      return sendJson(res, 200, { token: issueToken() });
    }
    return sendJson(res, 401, { error: 'Senha incorreta.' });
  }

  if (pathname.startsWith('/api/admin/')) {
    if (!requireAdmin(req, res)) return;

    if (req.method === 'POST' && pathname === '/api/admin/events-ticket') {
      return sendJson(res, 200, {
        ticket: issueAdminStreamTicket(),
        expiresInMs: ADMIN_STREAM_TICKET_TTL_MS
      });
    }

    if (req.method === 'GET' && pathname === '/api/admin/conversations') {
      return sendJson(res, 200, {
        conversations: Array.from(conversations.values()).map(conversationSummary)
      });
    }

    const conversationDetailMatch = pathname.match(/^\/api\/admin\/conversations\/([^/]+)$/);
    if (req.method === 'GET' && conversationDetailMatch) {
      const conv = conversations.get(decodeURIComponent(conversationDetailMatch[1]));
      if (!conv) return sendJson(res, 404, { error: 'Conversa não encontrada.' });
      return sendJson(res, 200, {
        conversation: conversationSummary(conv),
        messages: conv.messages
      });
    }

    const conversationActionMatch = pathname.match(/^\/api\/admin\/conversations\/([^/]+)\/([^/]+)$/);
    if (conversationActionMatch) {
      const convId = decodeURIComponent(conversationActionMatch[1]);
      const action = conversationActionMatch[2];
      const conv = conversations.get(convId);
      if (!conv) return sendJson(res, 404, { error: 'Conversa não encontrada.' });

      if (req.method === 'POST' && action === 'messages') {
        const body = await readJson(req);
        const text = sanitizeMessageText(body.text, 1000);
        if (!text) return sendJson(res, 400, { error: 'Mensagem vazia.' });

        const pendingSince = metrics.pendingResponses.get(convId);
        if (pendingSince) {
          metrics.responseTimes.push(Date.now() - pendingSince);
          metrics.pendingResponses.delete(convId);
        }

        const message = {
          id: generateId('msg'),
          type: 'brawler',
          isAdminReply: true,
          text,
          timestamp: nowIso(),
          reactions: {}
        };

        conv.messages.push(message);
        conv.unread = 0;
        conv.waitingSince = null;
        conv.updatedAt = nowIso();

        broadcastUser(convId, 'message', { message });
        broadcastUser(convId, 'typing', { typing: false });
        broadcastAdmin('message', { convId, message, conversation: conversationSummary(conv) });
        broadcastAdmin('conversation-upsert', { conversation: conversationSummary(conv) });
        return sendJson(res, 201, { message, conversation: conversationSummary(conv) });
      }

      if (req.method === 'POST' && action === 'typing') {
        const body = await readJson(req);
        broadcastUser(convId, 'typing', { typing: Boolean(body.typing) });
        return sendEmpty(res);
      }

      if (req.method === 'POST' && action === 'read') {
        conv.unread = 0;
        broadcastAdmin('conversation-upsert', { conversation: conversationSummary(conv) });
        return sendJson(res, 200, { conversation: conversationSummary(conv) });
      }

      if (req.method === 'POST' && action === 'pin') {
        conv.pinned = !conv.pinned;
        conv.updatedAt = nowIso();
        broadcastAdmin('conversation-upsert', { conversation: conversationSummary(conv) });
        return sendJson(res, 200, { conversation: conversationSummary(conv) });
      }
    }

    if (req.method === 'GET' && pathname === '/api/admin/metrics') {
      return sendJson(res, 200, collectMetrics(Array.from(conversations.values())));
    }

    if (req.method === 'POST' && pathname === '/api/admin/metrics/reset') {
      for (const timer of conversationCloseTimers.values()) {
        clearTimeout(timer);
      }
      conversationCloseTimers.clear();
      conversations.clear();
      messageWindows.clear();
      metrics.totalJoins = 0;
      metrics.returnJoins = 0;
      metrics.responseTimes = [];
      metrics.sessionDurations = [];
      metrics.pendingResponses = new Map();
      rankingCounts.clear();
      broadcastAdmin('conversations-reset', {});
      broadcastAdmin('ranking-update', rankingPayload());
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/admin/word-filter') {
      return sendJson(res, 200, { words: Array.from(profanityWords).sort() });
    }

    if (req.method === 'PUT' && pathname === '/api/admin/word-filter') {
      const body = await readJson(req);
      if (!Array.isArray(body.words)) return sendJson(res, 400, { error: 'words deve ser um array.' });
      const nextConfig = writeModerationConfig({
        ...currentModerationConfig(),
        words: body.words
      });
      profanityWords = new Set(nextConfig.words);
      return sendJson(res, 200, { words: Array.from(profanityWords).sort() });
    }

    if (req.method === 'GET' && pathname === '/api/admin/nickname-blacklist') {
      return sendJson(res, 200, { terms: Array.from(nicknameBlacklist).sort() });
    }

    if (req.method === 'PUT' && pathname === '/api/admin/nickname-blacklist') {
      const body = await readJson(req);
      if (!Array.isArray(body.terms)) return sendJson(res, 400, { error: 'terms deve ser um array.' });
      const nextConfig = writeModerationConfig({
        ...currentModerationConfig(),
        nicknameBlacklist: body.terms
      });
      nicknameBlacklist = new Set(nextConfig.nicknameBlacklist);
      return sendJson(res, 200, { terms: Array.from(nicknameBlacklist).sort() });
    }

    if (req.method === 'GET' && pathname === '/api/admin/settings') {
      return sendJson(res, 200, { moderationMode, featuredBrawlerId });
    }

    if (req.method === 'PUT' && pathname === '/api/admin/settings') {
      const body = await readJson(req);
      const nextConfig = writeModerationConfig({
        ...currentModerationConfig(),
        moderationMode: body.moderationMode === 'flag' || body.moderationMode === 'block'
          ? body.moderationMode
          : moderationMode,
        featuredBrawlerId: typeof body.featuredBrawlerId === 'string'
          ? body.featuredBrawlerId
          : featuredBrawlerId
      });
      const featuredChanged = nextConfig.featuredBrawlerId !== featuredBrawlerId;
      moderationMode = nextConfig.moderationMode;
      featuredBrawlerId = nextConfig.featuredBrawlerId;
      if (featuredChanged) {
        broadcastAdmin('ranking-update', rankingPayload());
      }
      return sendJson(res, 200, { moderationMode, featuredBrawlerId });
    }
  }

  sendJson(res, 404, { error: 'Endpoint não encontrado.' });
}

function handleEvents(req, res, searchParams) {
  const role = searchParams.get('role');
  res.writeHead(200, {
    ...baseSecurityHeaders(),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': connected\n\n');

  const ping = setInterval(() => {
    if (!res.destroyed) res.write(': ping\n\n');
  }, 25_000);

  if (role === 'admin') {
    const ticket = sanitizeText(searchParams.get('ticket'), 80);
    if (!verifyAdminStreamTicket(ticket)) {
      writeEvent(res, 'unauthorized', { error: 'Unauthorized.' });
      res.end();
      clearInterval(ping);
      return;
    }
    adminStreams.add(res);
    req.on('close', () => {
      clearInterval(ping);
      adminStreams.delete(res);
    });
    return;
  }

  if (role === 'user') {
    const convId = sanitizeText(searchParams.get('sessionId'), 120);
    if (!convId || !conversations.has(convId)) {
      writeEvent(res, 'not-found', { error: 'Conversa não encontrada.' });
      res.end();
      clearInterval(ping);
      return;
    }
    const streamId = generateId('stream');
    metrics.activeSessions.set(streamId, { convId, joinedAt: Date.now() });
    addUserStream(convId, res);
    req.on('close', () => {
      const session = metrics.activeSessions.get(streamId);
      if (session) {
        metrics.sessionDurations.push(Date.now() - session.joinedAt);
        metrics.activeSessions.delete(streamId);
      }
      clearInterval(ping);
      removeUserStream(convId, res);
      if (!userStreams.has(convId)) scheduleConversationClose(convId);
    });
    return;
  }

  writeEvent(res, 'error', { error: 'Tipo de stream inválido.' });
  res.end();
  clearInterval(ping);
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.ico': 'image/x-icon'
  }[ext] || 'application/octet-stream';
}

function cacheHeaders(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.html', '.css', '.js'].includes(ext)) {
    return {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    };
  }
  return { 'Cache-Control': 'public, max-age=3600' };
}

function safeFilePath(baseDir, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(baseDir, normalized);
  if (!full.startsWith(baseDir)) return null;
  return full;
}

function serveStatic(req, res, url) {
  let filePath;
  if (url.pathname.startsWith('/portraits/')) {
    filePath = safeFilePath(PORTRAITS_DIR, url.pathname.replace('/portraits/', ''));
  } else {
    const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = safeFilePath(PUBLIC_DIR, requestPath);
  }

  if (!filePath) {
    res.writeHead(403, {
      ...baseSecurityHeaders(),
      'Cache-Control': 'no-store'
    });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statErr, stat) => {
    const fallback = path.join(PUBLIC_DIR, 'index.html');
    const target = statErr || !stat.isFile() ? fallback : filePath;
    fs.readFile(target, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, {
          ...baseSecurityHeaders(),
          'Cache-Control': 'no-store'
        });
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        ...baseSecurityHeaders(),
        'Content-Type': mimeType(target),
        ...cacheHeaders(target)
      });
      res.end(data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || 500;
    if (!res.headersSent) {
      sendJson(res, status, { error: status === 500 ? 'Erro interno do servidor.' : error.message });
    } else {
      res.end();
    }
  }
});

if (NODE_ENV === 'production') {
  if (ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD || TOKEN_SECRET === DEFAULT_TOKEN_SECRET) {
    throw new Error('Defina ADMIN_PASSWORD e TOKEN_SECRET no ambiente de produção antes de iniciar o servidor.');
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled Rejection:', reason);
  process.exitCode = 1;
});

process.on('uncaughtException', (error) => {
  console.error('[fatal] Uncaught Exception:', error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`BrawlTalkie Reborn rodando em http://${displayHost}:${PORT}`);
  console.log(`Painel admin: http://${displayHost}:${PORT}/admin`);
  if (NODE_ENV !== 'production' && ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD) {
    console.warn('Aviso: usando senha admin default em ambiente de desenvolvimento.');
  }
  if (TOKEN_SECRET === DEFAULT_TOKEN_SECRET) {
    console.warn('Aviso: TOKEN_SECRET padrao em uso. Defina um valor forte para ambientes compartilhados/producao.');
  }
});
