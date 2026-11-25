// Analytics first-party da CAVAX. SÓ é iniciado depois que o visitante aceita "medição de audiência".
//
// O que É registrado: páginas vistas (rota sem query string), origem (UTM/referência), categoria do
// dispositivo, profundidade de rolagem, cliques em botões/links marcados, produtos vistos, carrinho e
// checkout, e cliques em posição relativa para o mapa de calor.
// O que NUNCA é registrado: texto digitado, campos de formulário, senhas, dados de cartão, tokens,
// parâmetros da URL (exceto utm_*), conteúdo da tela, IP (o servidor não grava) ou "impressão digital".
//
// Identificadores pseudônimos aleatórios ficam no localStorage deste navegador e são apagados ao
// revogar o consentimento (o servidor também apaga os eventos deles: POST /analytics/forget).
import { apiUrl } from './api.js';
import { drain } from './track.js';

const K = { vid: 'cavax_aid_v', sess: 'cavax_aid_s', ft: 'cavax_aid_ft' };
const SESSION_MS = 30 * 60 * 1000;
const UTM = ['source', 'medium', 'campaign', 'content', 'term'];

let started = false;
let queue = [];
let timer = null;
let heatmap = true;
let test = false;

const rid = (n = 24) => {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'[b & 63]).join('');
};

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* modo privado: segue sem persistir */
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
};

function visitorId() {
  let v = store.get(K.vid);
  if (!/^[A-Za-z0-9_-]{24}$/.test(v || '')) {
    v = `v${rid(23)}`;
    store.set(K.vid, v);
  }
  return v;
}

/** Sessão: termina após 30 min sem atividade. Retorna { sid, isNew }. */
function session() {
  const now = Date.now();
  let s = null;
  try {
    s = JSON.parse(store.get(K.sess) || 'null');
  } catch {
    s = null;
  }
  const isNew = !s || !/^[A-Za-z0-9_-]{24}$/.test(s.sid || '') || now - Number(s.last || 0) > SESSION_MS;
  if (isNew) s = { sid: `s${rid(23)}`, last: now };
  s.last = now;
  store.set(K.sess, JSON.stringify(s));
  return { sid: s.sid, isNew };
}

const clip = (v, n = 100) => (v ? String(v).slice(0, n) : undefined);

function utmFromUrl() {
  const q = new URLSearchParams(location.search);
  const out = {};
  for (const k of UTM) if (q.get(`utm_${k}`)) out[k] = clip(q.get(`utm_${k}`));
  return Object.keys(out).length ? out : null;
}

function refUrl() {
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    return r && r.host !== location.host ? `${r.protocol}//${r.host}/` : undefined;
  } catch {
    return undefined;
  }
}

function send(useBeacon = false) {
  clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const { sid } = session();
  const events = queue.splice(0, 50);
  const body = JSON.stringify({ v: 1, vid: visitorId(), sid, ...(test ? { test: true } : {}), ...(navigator.webdriver ? { wd: true } : {}), events });
  const url = apiUrl('/analytics/collect');
  // text/plain: requisição "simples" (sem preflight de CORS); o servidor lê o JSON.
  const blob = new Blob([body], { type: 'text/plain' });
  if (useBeacon && navigator.sendBeacon && navigator.sendBeacon(url, blob)) return;
  fetch(url, { method: 'POST', body: blob, keepalive: true, credentials: 'include', mode: 'cors' }).catch(() => {});
  if (queue.length) send(useBeacon);
}

/** Enfileira um evento (lote enviado a cada 5 s, ao sair da página ou ao juntar 20). */
export function track(name, props) {
  if (!started) return;
  const s = session();
  if (s.isNew && name !== 'session_start') startSession();
  queue.push({ id: `e${rid(23)}`, n: name, t: Date.now(), path: location.pathname, ...(props && Object.keys(props).length ? { p: props } : {}) });
  if (queue.length >= 20) send();
  else if (!timer) timer = setTimeout(send, 5000);
}

function startSession() {
  const utm = utmFromUrl();
  const touch = utm ? { s: utm.source, m: utm.medium, c: utm.campaign } : null;
  if (touch && !store.get(K.ft)) store.set(K.ft, JSON.stringify(touch));
  let ft = null;
  try {
    ft = JSON.parse(store.get(K.ft) || 'null');
  } catch {
    ft = null;
  }
  const p = {};
  if (ft) p.ft = { s: clip(ft.s), m: clip(ft.m), c: clip(ft.c) };
  if (touch) p.lt = touch;
  queue.push({ id: `e${rid(23)}`, n: 'session_start', t: Date.now(), path: location.pathname, ...(refUrl() ? { ref: refUrl() } : {}), ...(utm ? { utm } : {}), ...(Object.keys(p).length ? { p } : {}) });
}

let lastPath = null;
let scrollMarks = new Set();

/** Visualização de página (chamada também em navegação sem recarregar). */
export function pageView(extra = {}) {
  if (!started || location.pathname === lastPath) return;
  lastPath = location.pathname;
  scrollMarks = new Set();
  const s = session();
  if (s.isNew) startSession();
  const utm = utmFromUrl();
  queue.push({ id: `e${rid(23)}`, n: 'page_view', t: Date.now(), path: location.pathname, vw: Math.min(10000, window.innerWidth || 0), ...(refUrl() ? { ref: refUrl() } : {}), ...(utm ? { utm } : {}), ...(Object.keys(extra).length ? { p: extra } : {}) });
  if (!timer) timer = setTimeout(send, 1500);
}

function onScroll() {
  const doc = document.documentElement;
  const max = Math.max(1, doc.scrollHeight - window.innerHeight);
  const pct = Math.round((window.scrollY / max) * 100);
  for (const mark of [25, 50, 75, 90, 100]) {
    if (pct >= mark && !scrollMarks.has(mark)) {
      scrollMarks.add(mark);
      track('scroll_depth', { pct: mark });
    }
  }
}

/** Nome seguro do elemento: data-track, id ou tag — nunca o texto do elemento. */
function elementKey(el) {
  const k = el.dataset?.track || (el.id ? `#${el.id}` : '') || el.tagName.toLowerCase();
  return String(k).toLowerCase().replace(/[^a-z0-9_.:/#-]/g, '').slice(0, 80);
}

function onClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest('input, textarea, select, [contenteditable], [data-no-track]')) return;
  const el = target.closest('a, button, [data-track]');
  if (el) {
    const href = el.tagName === 'A' ? el.getAttribute('href') || '' : '';
    if (/^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(href)) track('whatsapp_click', { el: elementKey(el) });
    else if (el.dataset.track || el.classList.contains('btn')) {
      const safeHref = href.startsWith('/') ? href.split(/[?#]/)[0].slice(0, 120) : undefined;
      track('cta_click', { el: elementKey(el), ...(safeHref ? { href: safeHref } : {}) });
    }
  }
  if (heatmap && Math.random() < 0.5) {
    const doc = document.documentElement;
    const x = Math.min(1, Math.max(0, event.pageX / Math.max(1, doc.scrollWidth)));
    const y = Math.min(1, Math.max(0, event.pageY / Math.max(1, doc.scrollHeight)));
    track('click', { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, ...(el ? { el: elementKey(el) } : {}) });
  }
}

/** Liga o rastreamento (somente após consentimento). */
export function start(options = {}) {
  if (started) return;
  started = true;
  heatmap = options.heatmap !== false;
  test = new URLSearchParams(location.search).get('cavax_test') === '1' || sessionStorage.getItem('cavax_test') === '1';
  if (test) sessionStorage.setItem('cavax_test', '1');
  window.__cavaxAid = () => {
    const raw = store.get(K.sess);
    try {
      const s = JSON.parse(raw || 'null');
      return s?.sid ? `${visitorId()}.${s.sid}` : null;
    } catch {
      return null;
    }
  };
  pageView(options.page || {});
  window.cavaxTrack = track;
  const queued = drain();
  if (options.flush) queued.forEach(([n, p]) => track(n, p));
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      onScroll();
    });
  }, { passive: true });
  document.addEventListener('click', onClick, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && send(true));
  window.addEventListener('pagehide', () => send(true));
  // Navegação sem recarregar (history API).
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    history[m] = function patched(...args) {
      const r = orig.apply(this, args);
      setTimeout(() => pageView(), 0);
      return r;
    };
  }
  window.addEventListener('popstate', () => pageView());
}

/** Revoga: para de coletar, pede ao servidor para apagar os eventos e limpa os identificadores. */
export function revoke() {
  const vid = store.get(K.vid);
  started = false;
  queue = [];
  delete window.__cavaxAid;
  delete window.cavaxTrack;
  if (vid) {
    const blob = new Blob([JSON.stringify({ vid })], { type: 'text/plain' });
    if (!(navigator.sendBeacon && navigator.sendBeacon(apiUrl('/analytics/forget'), blob))) {
      fetch(apiUrl('/analytics/forget'), { method: 'POST', body: blob, keepalive: true, credentials: 'include', mode: 'cors' }).catch(() => {});
    }
  }
  Object.values(K).forEach((k) => store.del(k));
}

export const isActive = () => started;
