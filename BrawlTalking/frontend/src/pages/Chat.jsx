import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getBrawlerById } from '../data/brawlers.js';
import MessageBubble from '../components/MessageBubble.jsx';
import TypingIndicator from '../components/TypingIndicator.jsx';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// F-04: rate limit constants
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

// F-05: Profanity filter words (same as backend)
const PROFANITY_WORDS = new Set([
  'porra', 'merda', 'caralho', 'puta', 'viado', 'idiota', 'imbecil', 'otário',
  'fodase', 'fodarse', 'vsf', 'fdp', 'pqp', 'buceta', 'cu', 'cuzao',
]);

function containsProfanity(text) {
  const normalized = text.toLowerCase().replace(/\s+/g, '');
  for (const word of PROFANITY_WORDS) {
    if (normalized.includes(word)) return true;
  }
  return false;
}

function censorProfanity(text) {
  let result = text;
  for (const word of PROFANITY_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, '*'.repeat(word.length));
  }
  return result;
}

export default function Chat() {
  const { brawlerId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const brawler = getBrawlerById(brawlerId);
  const userName = location.state?.userName || localStorage.getItem('brawlChat_userName');

  // ── Stable sessionId per brawler+nickname pair ────────────────────────────
  const sessionIdRef = useRef(null);
  if (!sessionIdRef.current && brawler && userName) {
    const key = `brawlChat_session_${brawlerId}_${encodeURIComponent(userName)}`;
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    sessionIdRef.current = id;
  }

  // ── localStorage history key ──────────────────────────────────────────────
  const historyKey = `brawlChat_history_${brawlerId}_${encodeURIComponent(userName || '')}`;

  const [messages, setMessages] = useState(() => {
    if (!brawler || !userName) return [];
    try {
      const saved = localStorage.getItem(historyKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const hasLocalHistoryRef = useRef(messages.length > 0);

  // ── Typing indicator state ────────────────────────────────────────────────
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const [inputText, setInputText] = useState('');
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [profanityWarning, setProfanityWarning] = useState(false);

  // F-04: Rate limiting state
  const [rateLimited, setRateLimited] = useState(false);
  const msgTimestampsRef = useRef([]);
  const rateLimitTimerRef = useRef(null);

  // F-01: Entry animation state
  const [avatarAnimated, setAvatarAnimated] = useState(false);

  const socketRef = useRef(null);
  const chatContainerRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    if (!brawler || !userName) navigate('/');
  }, [brawler, userName, navigate]);

  // F-01: Trigger animation shortly after mount
  useEffect(() => {
    const t = setTimeout(() => setAvatarAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(historyKey, JSON.stringify(messages));
      } catch {
        // localStorage quota exceeded — ignore
      }
    }
  }, [messages, historyKey]);

  useEffect(() => {
    if (!brawler || !userName || !sessionIdRef.current) return;

    const socket = io(BACKEND_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setConnectionError(false);
      socket.emit('user:join', {
        userName,
        brawler: { id: brawler.id, name: brawler.name },
        sessionId: sessionIdRef.current,
      });
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnectionError(true));

    socket.on('error:nickname_blocked', ({ message: errMsg }) => {
      // Nickname was blocked server-side — redirect to home with error
      navigate('/', { state: { nicknameError: errMsg } });
    });

    socket.on('chat:welcome', ({ message }) => {
      if (!hasLocalHistoryRef.current) {
        setMessages([message]);
      }
    });

    socket.on('chat:history', ({ messages: history }) => {
      setMessages(history);
      hasLocalHistoryRef.current = true;
    });

    socket.on('chat:message', (message) => {
      setMessages((prev) => [...prev, message]);
      if (message.type === 'brawler') setIsTyping(false);
    });

    socket.on('chat:typing', ({ typing }) => {
      setIsTyping(Boolean(typing));
    });

    // F-02: Reaction updates from server
    socket.on('chat:reactions_update', ({ msgId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, reactions } : m))
      );
    });

    return () => socket.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brawler?.id, userName]);

  useLayoutEffect(() => {
    const el = chatContainerRef.current;
    if (!el || !shouldAutoScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isTyping]);

  // ── Rate limit cleanup ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
    };
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  // F-02: React to a message
  function handleReact(msgId, emoji) {
    if (!socketRef.current) return;
    socketRef.current.emit('user:react', { msgId, emoji });
  }

  function handleSend() {
    const text = inputText.trim();
    if (!text || !socketRef.current || rateLimited) return;

    // F-05: Check for profanity and censor if needed
    let messageText = text;
    if (containsProfanity(text)) {
      messageText = censorProfanity(text);
      setProfanityWarning(true);
      setTimeout(() => setProfanityWarning(false), 4000);
    }

    // F-04: Rate limiting check
    const now = Date.now();
    msgTimestampsRef.current = msgTimestampsRef.current.filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS
    );
    msgTimestampsRef.current.push(now);

    if (msgTimestampsRef.current.length >= RATE_LIMIT_MAX) {
      setRateLimited(true);
      const oldestInWindow = msgTimestampsRef.current[0];
      const msUntilRelease = RATE_LIMIT_WINDOW_MS - (now - oldestInWindow);
      rateLimitTimerRef.current = setTimeout(() => {
        setRateLimited(false);
        msgTimestampsRef.current = [];
      }, msUntilRelease);
      return;
    }

    shouldAutoScrollRef.current = true;
    socketRef.current.emit('user:message', { text: messageText });
    setInputText('');

    setHasUserSentMessage(true);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleMessagesScroll() {
    const el = chatContainerRef.current;
    if (!el) return;
    shouldAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 8;
  }

  if (!brawler || !userName) return null;

  return (
    <div
      className="flex flex-col h-screen relative bg-noise"
      style={{ background: 'linear-gradient(180deg, #1A1A2E 0%, #0F1A30 50%, #16213E 100%)' }}
    >
      {/* Subtle ambient glow orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-20"
          style={{ background: brawler.gradient ? undefined : '#6C3483' }}
        />
        <div className="absolute bottom-1/4 -left-20 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      {/* ── Header ── */}
      <header className="relative z-20 flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-black/30 backdrop-blur-md flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="text-white/50 hover:text-white transition-all duration-200 p-1.5 rounded-lg hover:bg-white/10 mr-1 active:scale-90"
          aria-label="Voltar à seleção de personagens"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>

        {/* F-01: Avatar with pop-in animation */}
        <div className="relative">
          <div
            className={`w-11 h-11 rounded-full bg-gradient-to-br ${brawler.gradient} overflow-hidden shadow-lg flex-shrink-0 transition-all duration-500 ring-2 ring-white/10 ${
              avatarAnimated ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            }`}
            aria-hidden="true"
            style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            {brawler.image
              ? <img src={brawler.image} alt={brawler.name} className="w-full h-full object-cover object-top" />
              : <span className="w-full h-full flex items-center justify-center text-lg">{brawler.emoji}</span>
            }
          </div>
          {/* Online indicator dot */}
          {connected && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-[#1A1A2E] animate-pulse-ring" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="font-brawl text-white text-lg leading-tight">{brawler.name}</h1>
          <p className="text-xs leading-tight mt-0.5">
            {connectionError ? (
              <span className="text-red-400 flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" /> Sem conexão</span>
            ) : connected ? (
              <span className="text-green-400/80">Online</span>
            ) : (
              <span className="text-yellow-400 flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" /> Conectando...</span>
            )}
          </p>
        </div>
      </header>

      {/* ── Messages ── */}
      <div
        ref={chatContainerRef}
        onScroll={handleMessagesScroll}
        className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {connectionError && (
          <div className="text-center py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm backdrop-blur-sm animate-fade-slide-up">
            Falha na conexão. Tentando reconectar...
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            brawler={brawler}
            userName={userName}
            onReact={handleReact}
          />
        ))}

        {isTyping && <TypingIndicator brawler={brawler} />}
      </div>

      {/* F-04: Rate limit warning */}
      {rateLimited && (
        <div className="relative z-10 mx-4 mb-2 px-4 py-2 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-300 text-xs text-center backdrop-blur-sm animate-fade-slide-up">
          Você está enviando mensagens muito rapidamente. Aguarde alguns segundos.
        </div>
      )}

      {/* F-05: Profanity warning */}
      {profanityWarning && (
        <div className="relative z-10 mx-4 mb-2 px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs text-center backdrop-blur-sm animate-fade-slide-up">
          Sua mensagem continha linguagem inadequada e foi censurada. 🚫
        </div>
      )}

      {/* ── Input ── */}
      <div className="relative z-20 px-4 py-3 border-t border-white/10 bg-black/30 backdrop-blur-md flex-shrink-0">
        <div className={`flex items-center gap-2 bg-white/10 rounded-2xl border px-4 py-2.5 transition-all duration-300 ${
          rateLimited ? 'border-orange-500/40 opacity-60' : 'border-white/15 focus-within:border-yellow-400/50 focus-within:bg-white/[0.12] focus-within:shadow-lg focus-within:shadow-yellow-400/5'
        }`}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={rateLimited ? 'Aguarde...' : 'Digite sua mensagem...'}
            maxLength={500}
            autoComplete="off"
            disabled={rateLimited}
            className="flex-1 bg-transparent text-white placeholder-white/40 focus:outline-none text-sm disabled:cursor-not-allowed"
            aria-label="Mensagem"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || !connected || rateLimited}
            className={`
              w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200
              ${inputText.trim() && connected && !rateLimited
                ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-300 active:scale-90 cursor-pointer shadow-md shadow-yellow-400/25 animate-send-pulse'
                : 'bg-white/10 text-white/30 cursor-not-allowed'}
            `}
            aria-label="Enviar mensagem"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
