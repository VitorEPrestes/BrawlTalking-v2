import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { getBrawlerById } from '../data/brawlers.js';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatWaitTime(waitingSince) {
  if (!waitingSince) return null;
  const secs = Math.floor((Date.now() - waitingSince) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

function fmtDuration(ms) {
  if (ms === null || ms === undefined) return 'N/A';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function fmtResponseTime(ms) {
  if (ms === null || ms === undefined) return 'N/A';
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Metrics View ─────────────────────────────────────────────────────────────
function MetricsView({ token, onLogout, paused, setPaused }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pausedRef = useRef(paused);

  const load = useCallback(async () => {
    if (pausedRef.current) return; // Check pause status every time load is called
    setLoading(true);
    setError('');
    try {
      const { data: d } = await axios.get(`${BACKEND_URL}/api/admin/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(d);
    } catch (err) {
      if (err.response?.status === 401) { onLogout(); return; }
      setError('Erro ao carregar métricas.');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  // Update pausedRef whenever paused changes
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!pausedRef.current) load();
    const interval = setInterval(() => {
      if (!pausedRef.current) load();
    }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    if (!window.confirm('Isso vai zerar todas as métricas E apagar todas as conversas. Confirmar?')) return;
    setResetting(true);
    try {
      await axios.post(`${BACKEND_URL}/api/admin/metrics/reset`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(null);
      load();
    } catch (err) {
      if (err.response?.status === 401) onLogout();
    } finally {
      setResetting(false);
    }
  }

  function togglePause() {
    const next = !paused;
    setPaused(next);
    if (!next) {
      // When resuming, load immediately
      load();
    }
  }

  if (loading && !data && !paused) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
        Carregando métricas...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-red-400 text-sm">
        <p>{error}</p>
        <button onClick={load} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors">
          Tentar novamente
        </button>
      </div>
    );
  }

  const cards = [
    {
      label: 'Sessões Ativas',
      value: data.activeSessionsCount,
      sub: 'agora',
      color: 'text-green-400',
      icon: '🟢',
    },
    {
      label: 'Total de Conversas',
      value: data.totalConversations,
      sub: `${data.totalJoins} acessos totais`,
      color: 'text-blue-300',
      icon: '💬',
    },
    {
      label: 'Taxa de Engajamento',
      value: `${data.engagementRate}%`,
      sub: `${data.engagedConversations} conv. com 3+ msgs`,
      color: 'text-yellow-400',
      icon: '🎯',
    },
    {
      label: 'Taxa de Retorno',
      value: `${data.returnRate}%`,
      sub: `${data.returnJoins} retornos de ${data.totalJoins} acessos`,
      color: 'text-purple-400',
      icon: '🔄',
    },
    {
      label: 'Tempo Médio de Resposta',
      value: fmtResponseTime(data.avgResponseTimeMs),
      sub: `${data.totalResponsesSampled} respostas amostradas`,
      color: 'text-orange-400',
      icon: '⚡',
    },
    {
      label: 'Duração Média de Sessão',
      value: fmtDuration(data.avgSessionDurationMs),
      sub: `${data.totalSessionsSampled} sessões amostradas`,
      color: 'text-teal-400',
      icon: '⏱️',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-brawl text-2xl text-yellow-400">Métricas de Sucesso</h2>
          {paused && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-400 mt-0.5">
              ⏸ Coleta pausada — novos acessos não são contabilizados
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={togglePause}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              paused
                ? 'bg-amber-400/20 border border-amber-400/40 text-amber-300 hover:bg-amber-400/30'
                : 'bg-white/10 border border-white/10 text-white/60 hover:bg-white/20 hover:text-white'
            }`}
          >
            {paused ? '▶ Retomar' : '⏸ Pausar'}
          </button>
          <button
            onClick={load}
            disabled={loading || paused}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? '↻ Atualizando...' : '↻ Atualizar'}
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🔄 Zerar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-white/50 text-xs uppercase tracking-wider leading-tight">{card.label}</p>
              <span className="text-xl">{card.icon}</span>
            </div>
            <p className={`font-brawl text-4xl ${card.color} leading-none mb-1`}>{card.value}</p>
            <p className="text-white/30 text-xs">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Brawler breakdown */}
      {data.brawlerStats && data.brawlerStats.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-brawl text-lg text-white/80 mb-4">Conversas por Personagem</h3>
          <div className="space-y-2">
            {data.brawlerStats.map((b) => {
              const brawler = getBrawlerById(b.name.toLowerCase().replace(' ', '-'));
              const maxConvs = data.brawlerStats[0]?.conversations || 1;
              const pct = Math.round((b.conversations / maxConvs) * 100);
              return (
                <div key={b.name} className="flex items-center gap-3">
                  {brawler && (
                    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${brawler.gradient} flex items-center justify-center text-xs flex-shrink-0`}>
                      {brawler.emoji}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-white/70">{b.name}</span>
                      <span className="text-white/40">{b.conversations} conv. · {b.messages} msgs</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-white/15 text-xs text-center mt-6">Atualização automática a cada 30s · Meta de resposta: &lt; 30s</p>
    </div>
  );
}

// ─── Moderation View (F-05 / F-06) ───────────────────────────────────────────
function ModerationView({ token, onLogout }) {
  const [words, setWords] = useState([]);
  const [terms, setTerms] = useState([]);
  const [newWord, setNewWord] = useState('');
  const [newTerm, setNewTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [wRes, bRes] = await Promise.all([
        axios.get(`${BACKEND_URL}/api/admin/word-filter`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${BACKEND_URL}/api/admin/nickname-blacklist`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setWords(wRes.data.words.sort());
      setTerms(bRes.data.terms.sort());
    } catch (err) {
      if (err.response?.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function saveWords(updated) {
    setSaving(true);
    try {
      const { data } = await axios.put(
        `${BACKEND_URL}/api/admin/word-filter`,
        { words: updated },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setWords(data.words.sort());
    } catch (err) { if (err.response?.status === 401) onLogout(); }
    finally { setSaving(false); }
  }

  async function saveTerms(updated) {
    setSaving(true);
    try {
      const { data } = await axios.put(
        `${BACKEND_URL}/api/admin/nickname-blacklist`,
        { terms: updated },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTerms(data.terms.sort());
    } catch (err) { if (err.response?.status === 401) onLogout(); }
    finally { setSaving(false); }
  }

  function addWord() {
    const w = newWord.trim().toLowerCase();
    if (!w || words.includes(w)) return;
    const updated = [...words, w];
    setWords(updated.sort());
    setNewWord('');
    saveWords(updated);
  }

  function removeWord(w) { saveWords(words.filter((x) => x !== w)); }

  function addTerm() {
    const t = newTerm.trim().toLowerCase();
    if (!t || terms.includes(t)) return;
    const updated = [...terms, t];
    setTerms(updated.sort());
    setNewTerm('');
    saveTerms(updated);
  }

  function removeTerm(t) { saveTerms(terms.filter((x) => x !== t)); }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
        Carregando moderação...
      </div>
    );
  }

  function ListEditor({ title, desc, items, newVal, onNewVal, onAdd, onRemove, placeholder }) {
    const inputRef = useRef(null);

    const handleAdd = () => {
      onAdd();
      // Keep focus on input after adding
      setTimeout(() => inputRef.current?.focus(), 0);
    };

    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-5">
        <h3 className="font-brawl text-lg text-white/80 mb-1">{title}</h3>
        <p className="text-white/35 text-xs mb-4">{desc}</p>
        <div className="flex gap-2 mb-3">
          <input
            ref={inputRef}
            type="text"
            value={newVal}
            onChange={(e) => onNewVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }}}
            placeholder={placeholder}
            className="flex-1 bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-yellow-400/60"
            autoFocus
          />
          <button
            onClick={handleAdd}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-yellow-400 text-gray-900 text-sm font-medium hover:bg-yellow-300 transition-colors disabled:opacity-50"
          >
            + Adicionar
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-white/20 text-xs text-center py-3">Nenhuma entrada.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5 bg-white/10 border border-white/10 rounded-full px-3 py-1 text-xs text-white/70">
                {item}
                <button onClick={() => onRemove(item)} className="text-white/30 hover:text-red-400 transition-colors leading-none" aria-label={`Remover ${item}`}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="font-brawl text-2xl text-yellow-400 mb-6">Moderação</h2>
      <ListEditor
        title="🚨 Filtro de Palavras"
        desc="Mensagens com estas palavras serão sinalizadas no chat. Verificação ignora maiúsculas e espaços."
        items={words}
        newVal={newWord}
        onNewVal={setNewWord}
        onAdd={addWord}
        onRemove={removeWord}
        placeholder="Adicionar palavra..."
      />
      <ListEditor
        title="🚫 Blacklist de Nicknames"
        desc="Nicknames que contiverem estes termos (parcial) serão bloqueados no onboarding."
        items={terms}
        newVal={newTerm}
        onNewVal={setNewTerm}
        onAdd={addTerm}
        onRemove={removeTerm}
        placeholder="Adicionar termo..."
      />
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/admin/login`, { password });
      localStorage.setItem('brawlChat_adminToken', data.token);
      onLogin(data.token);
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao conectar. Verifique o servidor.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #1A1A2E, #0F3460)' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-brawl text-5xl text-yellow-400 drop-shadow-lg">BRAWL CHAT</h1>
          <p className="text-gray-400 mt-2 text-sm">Painel do Operador</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl"
        >
          <label className="block text-white/60 text-sm mb-2" htmlFor="admin-password">
            Senha de Acesso
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoFocus
            className="
              w-full bg-white/10 border border-white/20 rounded-xl
              px-4 py-3 text-white placeholder-white/30
              focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400
              transition-colors
            "
          />

          {error && (
            <p className="text-red-400 text-sm mt-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="
              mt-4 w-full py-3 rounded-xl bg-yellow-400 text-gray-900
              font-brawl text-lg tracking-wide
              hover:bg-yellow-300 transition-colors active:scale-95
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanel({ token, onLogout }) {
  const [activeTab, setActiveTab] = useState('chats'); // 'chats' | 'metrics' | 'mod'
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [convDetails, setConvDetails] = useState({});
  const [replyText, setReplyText] = useState('');
  const [, setTick] = useState(0); // force re-render every 30s for wait times
  const [metricsPaused, setMetricsPaused] = useState(false); // Persisted across tab changes

  const socketRef = useRef(null);
  const chatContainerRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const textareaRef = useRef(null);
  const typingTimerRef = useRef(null);

  // F-03: Tick every 15s to refresh wait time display
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(iv);
  }, []);

  // F-03: Sort — pinned first, then by oldest waitingSince (ascending), then unread, then newest last msg
  const sortedConversations = [...conversations].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aWait = a.waitingSince || 0;
    const bWait = b.waitingSince || 0;
    if (aWait && bWait) return aWait - bWait; // oldest wait first
    if (aWait && !bWait) return -1;
    if (!aWait && bWait) return 1;
    if (b.unread !== a.unread) return b.unread - a.unread;
    const timeA = a.lastMessage?.timestamp || a.createdAt || '';
    const timeB = b.lastMessage?.timestamp || b.createdAt || '';
    return timeB.localeCompare(timeA);
  });

  // ── Socket setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('admin:join', { token });
    });

    socket.on('admin:conversations', (list) => {
      setConversations(list);
    });

    socket.on('admin:new_conversation', (conv) => {
      setConversations((prev) => {
        if (prev.find((c) => c.id === conv.id)) return prev;
        return [conv, ...prev];
      });
    });

    socket.on('admin:new_message', ({ convId, message, summary }) => {
      // Update summary in sidebar
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, ...summary } : c))
      );
      // Append message if conversation is already loaded
      setConvDetails((prev) => {
        if (!prev[convId]) return prev;
        return {
          ...prev,
          [convId]: {
            ...prev[convId],
            messages: [...prev[convId].messages, message],
          },
        };
      });
    });

    socket.on('admin:conversation_detail', (detail) => {
      setConvDetails((prev) => ({
        ...prev,
        [detail.convId]: {
          messages: detail.messages,
          brawler: detail.brawler,
          userName: detail.userName,
        },
      }));
    });

    // F-02: Reaction updates
    socket.on('admin:reactions_update', ({ convId, msgId, reactions }) => {
      setConvDetails((prev) => {
        if (!prev[convId]) return prev;
        return {
          ...prev,
          [convId]: {
            ...prev[convId],
            messages: prev[convId].messages.map((m) =>
              m.id === msgId ? { ...m, reactions } : m
            ),
          },
        };
      });
    });

    // F-03: Pin/unpin update
    socket.on('admin:conversation_updated', (updated) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
    });

    socket.on('error', ({ message }) => {
      if (message === 'Unauthorized') {
        localStorage.removeItem('brawlChat_adminToken');
        onLogout();
      }
    });

    return () => socket.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-scroll only for the active conversation when the operator is pinned to the bottom or typing.
  useLayoutEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const inputFocused = document.activeElement === textareaRef.current;
    if (inputFocused || shouldAutoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeConvId, activeConv?.messages?.length]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleSelectConversation(convId) {
    setActiveConvId(convId);
    shouldAutoScrollRef.current = true;
    setReplyText('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Mark as read
    socketRef.current?.emit('admin:mark_read', { convId });
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, unread: 0 } : c))
    );

    // Fetch full history if not yet loaded
    if (!convDetails[convId]) {
      socketRef.current?.emit('admin:get_conversation', { convId });
    }
  }

  function handleReplyChange(e) {
    setReplyText(e.target.value);

    // Auto-resize textarea
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    // Typing indicator
    if (!activeConvId) return;
    socketRef.current?.emit('admin:typing', { convId: activeConvId, typing: true });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socketRef.current?.emit('admin:typing', { convId: activeConvId, typing: false });
    }, 2000);
  }

  function handleSendReply() {
    const text = replyText.trim();
    if (!text || !activeConvId) return;

    socketRef.current?.emit('admin:send_message', { convId: activeConvId, text });
    clearTimeout(typingTimerRef.current);
    setReplyText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleReplyKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  }

  function handleMessagesScroll() {
    const el = chatContainerRef.current;
    if (!el) return;
    shouldAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 8;
  }

  function handleLogout() {
    localStorage.removeItem('brawlChat_adminToken');
    onLogout();
  }

  // F-03: Pin a conversation
  function handlePin(e, convId) {
    e.stopPropagation();
    socketRef.current?.emit('admin:pin_conversation', { convId });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const activeConv = convDetails[activeConvId];
  const activeConvSummary = conversations.find((c) => c.id === activeConvId);

  function formatTime(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#1A1A2E' }}>
      {/* ── Sidebar ── */}
      <aside className="w-72 lg:w-80 flex-shrink-0 border-r border-white/10 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <div>
            <h2 className="font-brawl text-yellow-400 text-xl">BrawlTalkie</h2>
            <p className="text-white/30 text-xs">Painel do Operador</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-white/30 hover:text-white/70 text-xs transition-colors border border-white/10 px-2.5 py-1 rounded-lg hover:border-white/30"
          >
            Sair
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {[
            { id: 'chats', label: '💬' },
            { id: 'metrics', label: '📊' },
            { id: 'mod', label: '🛡️' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-yellow-400 border-b-2 border-yellow-400 bg-yellow-400/5'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Count (only on chats tab) */}
        {activeTab === 'chats' && (
          <div className="px-4 py-2 border-b border-white/5">
            <p className="text-white/30 text-xs">
              {conversations.length} conversa{conversations.length !== 1 ? 's' : ''} ativa{conversations.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}

        {/* List (only on chats tab) */}
        {activeTab === 'chats' && (
        <div className="flex-1 overflow-y-auto">
          {sortedConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/20 text-sm px-6 text-center gap-3">
              <span className="text-4xl">💬</span>
              <p>Nenhuma conversa ativa.</p>
              <p className="text-xs text-white/10">Aguardando usuários...</p>
            </div>
          ) : (
            sortedConversations.map((conv) => {
              const brawler = getBrawlerById(conv.brawler?.id);
              const isActive = conv.id === activeConvId;
              const waitSecs = conv.waitingSince ? Math.floor((Date.now() - conv.waitingSince) / 1000) : 0;
              const waitMins = Math.floor(waitSecs / 60);
              const waitLabel = conv.waitingSince ? (waitSecs < 60 ? `${waitSecs}s` : `${waitMins}m`) : null;
              const isUrgent = waitMins >= 5;
              const isWarning = waitMins >= 2 && waitMins < 5;

              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`
                    group w-full flex items-center gap-3 px-4 py-3 text-left
                    border-b border-white/5 transition-colors relative
                    ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}
                    ${isUrgent ? 'border-l-2 border-l-red-500' : isWarning ? 'border-l-2 border-l-orange-400' : ''}
                  `}
                >
                  {/* Portrait avatar */}
                  {brawler && (
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${brawler.gradient} overflow-hidden flex-shrink-0`}>
                      {brawler.image
                        ? <img src={brawler.image} alt={brawler.name} className="w-full h-full object-cover object-top" />
                        : <span className="w-full h-full flex items-center justify-center text-lg">{brawler.emoji}</span>
                      }
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-white text-sm font-medium truncate flex items-center gap-1">
                        {conv.pinned && <span title="Fixado" className="text-yellow-400">📌</span>}
                        {conv.userName}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {waitLabel && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            isUrgent
                              ? 'bg-red-500/20 text-red-400 animate-pulse'
                              : isWarning
                              ? 'bg-orange-400/20 text-orange-300'
                              : 'bg-white/10 text-white/40'
                          }`}>
                            {waitLabel}
                          </span>
                        )}
                        {conv.unread > 0 && (
                          <span className="bg-yellow-400 text-gray-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {conv.unread > 9 ? '9+' : conv.unread}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-white/35 text-xs truncate mt-0.5">
                      {conv.brawler?.name}
                      {conv.lastMessage ? ` · ${conv.lastMessage.text}` : ''}
                    </p>
                    <p className="text-white/20 text-xs mt-0.5">
                      {formatTime(conv.lastMessage?.timestamp || conv.createdAt)}
                    </p>
                  </div>
                  {/* Pin button — shown on hover */}
                  <button
                    onClick={(e) => handlePin(e, conv.id)}
                    title={conv.pinned ? 'Desafixar' : 'Fixar'}
                    className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-white/30 hover:text-yellow-400 transition-all text-xs p-1 rounded"
                  >
                    {conv.pinned ? '📌' : '📍'}
                  </button>
                </button>
              );
            })
          )}
        </div>
        )}
      </aside>

      {/* ── Main area ── */}
      {/* MetricsView is always mounted to preserve state (data + paused) across tab switches */}
      <div className={activeTab === 'metrics' ? 'flex flex-1 min-w-0' : 'hidden'}>
        <MetricsView token={token} onLogout={handleLogout} paused={metricsPaused} setPaused={setMetricsPaused} />
      </div>
      {activeTab === 'mod' ? (
        <ModerationView token={token} onLogout={handleLogout} />
      ) : activeTab !== 'metrics' ? (
      <main className="flex-1 flex flex-col min-w-0">
        {!activeConvId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-white/20 select-none">
            <span className="text-6xl mb-4">⚔️</span>
            <p className="font-brawl text-xl text-white/30">Selecione uma conversa</p>
            <p className="text-sm mt-1">para visualizar e responder</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-black/20 flex-shrink-0">
              {activeConvSummary && (() => {
                const brawler = getBrawlerById(activeConvSummary.brawler?.id);
                if (!brawler) return null;
                return (
                  <>
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${brawler.gradient} overflow-hidden flex-shrink-0`}>
                      {brawler.image
                        ? <img src={brawler.image} alt={brawler.name} className="w-full h-full object-cover object-top" />
                        : <span className="w-full h-full flex items-center justify-center text-lg">{brawler.emoji}</span>
                      }
                    </div>
                    <div>
                      <p className="text-white font-medium leading-tight">{activeConvSummary.userName}</p>
                      <p className="text-white/40 text-xs">conversando com {brawler.name}</p>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Messages */}
            <div
              ref={chatContainerRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
            >
              {!activeConv ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-white/30 text-sm">Carregando histórico...</p>
                </div>
              ) : (
                activeConv.messages.map((msg) => {
                  const brawler = getBrawlerById(activeConvSummary?.brawler?.id);
                  const isUser = msg.type === 'user';
                  // In admin view: admin (brawler) messages go RIGHT, user messages go LEFT
                  const isRight = !isUser;
                  const time = formatTime(msg.timestamp);
                  const reactions = msg.reactions || {};
                  const hasReactions = Object.values(reactions).some((r) => r.length > 0);

                  return (
                    <div key={msg.id} className={`flex items-end gap-2 ${isRight ? 'justify-end' : 'justify-start'}`}>
                      {!isRight && brawler && (
                        <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${brawler.gradient} overflow-hidden flex-shrink-0`}>
                          {brawler.image
                            ? <img src={brawler.image} alt={brawler.name} className="w-full h-full object-cover object-top" />
                            : <span className="w-full h-full flex items-center justify-center text-xs">{brawler.emoji}</span>
                          }
                        </div>
                      )}
                      <div className={`max-w-xs sm:max-w-sm md:max-w-md ${isRight ? 'items-end' : 'items-start'} flex flex-col`}>
                        {/* Flagged badge (F-05) */}
                        {msg.flagged && (
                          <span className="text-xs text-red-400 mb-1 ml-1 flex items-center gap-1">
                            🚨 mensagem sinalizada
                          </span>
                        )}
                        <div className={`
                          px-4 py-2.5 rounded-2xl text-sm break-words
                          ${isRight
                            ? 'bg-yellow-400 text-gray-900 rounded-tr-sm'
                            : 'bg-white/10 border border-white/10 text-white rounded-bl-sm'}
                          ${msg.flagged ? 'ring-1 ring-red-500/50' : ''}
                        `}>
                          {msg.text}
                        </div>
                        {/* Reactions display (F-02) */}
                        {hasReactions && (
                          <div className="flex flex-wrap gap-1 mt-1 ml-1">
                            {Object.entries(reactions).map(([emoji, users]) =>
                              users.length > 0 ? (
                                <span key={emoji} className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-white/60">
                                  {emoji} {users.length}
                                </span>
                              ) : null
                            )}
                          </div>
                        )}
                        <p className={`text-xs text-white/25 mt-1 ${isRight ? 'text-right mr-1' : 'ml-1'}`}>
                          {isUser ? `${activeConvSummary?.userName} · ` : `${activeConv.brawler?.name} · `}{time}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply input */}
            <div className="px-4 py-3 border-t border-white/10 bg-black/20 flex-shrink-0">
              <div className="flex items-end gap-2 bg-white/10 rounded-xl border border-white/20 px-3 py-2 focus-within:border-yellow-400/60 transition-colors">
                <textarea
                  ref={textareaRef}
                  value={replyText}
                  onChange={handleReplyChange}
                  onKeyDown={handleReplyKeyDown}
                  placeholder={`Responder como ${activeConvSummary?.brawler?.name || 'personagem'}...`}
                  maxLength={500}
                  rows={1}
                  className="flex-1 bg-transparent text-white placeholder-white/35 focus:outline-none text-sm resize-none leading-relaxed"
                  style={{ minHeight: '24px', maxHeight: '120px', overflowY: 'auto' }}
                />
                <button
                  onClick={handleSendReply}
                  disabled={!replyText.trim()}
                  className={`
                    w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all
                    ${replyText.trim()
                      ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-300 active:scale-95 cursor-pointer'
                      : 'bg-white/10 text-white/30 cursor-not-allowed'}
                  `}
                  aria-label="Enviar resposta"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                  </svg>
                </button>
              </div>
              <p className="text-white/15 text-xs mt-1.5 ml-1">Enter para enviar · Shift+Enter para nova linha</p>
            </div>
          </>
        )}
      </main>
      ) : null}
    </div>
  );
}

// ─── Page Entry ───────────────────────────────────────────────────────────────
export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem('brawlChat_adminToken'));

  if (!token) {
    return <LoginScreen onLogin={setToken} />;
  }

  return <AdminPanel token={token} onLogout={() => setToken(null)} />;
}
