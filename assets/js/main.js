import { api, setCsrf, showFieldErrors, setStatus, toast } from './lib/api.js';
import { cart, updateBadge, enableServerSync } from './lib/cart.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Navegação ----------
const nav = document.getElementById('nav');
const toggle = document.getElementById('menuToggle');
const links = document.getElementById('navLinks');

const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 20);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

function setMenu(open) {
  links?.classList.toggle('open', open);
  toggle?.setAttribute('aria-expanded', String(open));
  toggle?.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
}
toggle?.addEventListener('click', () => setMenu(!links.classList.contains('open')));
links?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && links?.classList.contains('open')) {
    setMenu(false);
    toggle?.focus();
  }
});

// ---------- Animações de entrada ----------
const reveals = document.querySelectorAll('.reveal');
if (reduceMotion || !('IntersectionObserver' in window)) {
  reveals.forEach((el) => el.classList.add('visible'));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  reveals.forEach((el) => observer.observe(el));
}

// ---------- Vídeo do VATEC OS: toca (sem som) quando a seção está visível ----------
const productVideo = document.getElementById('cavaxProductVideo');
if (productVideo) {
  productVideo.volume = 0.1;
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const videoObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            productVideo.play().catch(() => {});
          } else {
            productVideo.pause();
          }
        });
      },
      { threshold: [0, 0.6, 1] }
    );
    videoObserver.observe(productVideo);
  }
}

// ---------- Vídeo de apresentação do YouTube: carrega o player só ao clicar ----------
document.querySelectorAll('[data-youtube-id]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const id = btn.dataset.youtubeId;
    if (!/^[\w-]{11}$/.test(id)) return;
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    iframe.title = 'Vídeo de apresentação da CAVAX';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    btn.replaceWith(iframe);
  })
);

// ---------- Carrinho: contador e botões "Adicionar" ----------
updateBadge();

// Conta no cabeçalho: mostra o nome de quem está logado (a sessão fica salva por cookie HttpOnly).
export function setAccountHeader(customer) {
  const link = document.querySelector('[data-account-link]');
  if (!link) return;
  const label = link.querySelector('[data-account-label]');
  if (customer) {
    const first = String(customer.name || '').trim().split(/\s+/)[0] || 'Minha conta';
    label.textContent = first;
    link.title = `Minha conta (${customer.email})`;
    link.setAttribute('aria-label', `Minha conta — ${first}`);
    link.classList.add('is-logged');
  } else {
    label.textContent = 'Entrar';
    link.title = 'Entrar ou criar conta';
    link.setAttribute('aria-label', 'Entrar ou criar conta');
    link.classList.remove('is-logged');
  }
}
window.addEventListener('cavax:account', (e) => setAccountHeader(e.detail));
if (document.querySelector('[data-account-link]')) {
  api('/customers/me')
    .then(({ data }) => {
      setAccountHeader(data.customer);
      if (!data.customer || !data.csrfToken) return;
      // Cliente logado: guarda o carrinho na conta (operacional; o lembrete por e-mail depende do aceite de novidades).
      setCsrf(data.csrfToken);
      const save = (items) => api('/customers/me/cart', { method: 'PUT', body: { items } }).catch(() => {});
      enableServerSync(save);
      if (cart.items().length) save(cart.items());
    })
    .catch(() => {});
}
document.addEventListener('cart:change', updateBadge);
window.addEventListener('storage', updateBadge);
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-to-cart]');
  if (!button) return;
  const id = Number(button.dataset.addToCart);
  if (!Number.isInteger(id)) return;
  cart.add(id, 1);
  toast(`"${button.dataset.name}" foi adicionado ao carrinho.`, { href: '/loja/carrinho/', label: 'Ver carrinho' });
});

// ---------- Formulário de contato (registrado na API) ----------
const form = document.getElementById('contactForm');
if (form) {
  // Vindo de uma página de serviço (/?servico=...#contato): já deixa o serviço selecionado.
  // Só aceita um valor que exista exatamente na lista de opções do formulário.
  const preset = new URLSearchParams(location.search).get('servico');
  if (preset && form.service) {
    const option = Array.from(form.service.options).find((o) => !o.disabled && o.value === preset);
    if (option) form.service.value = option.value;
  }
  let channel = 'site';
  form.querySelectorAll('[data-channel]').forEach((btn) => btn.addEventListener('click', () => {
    channel = btn.dataset.channel;
  }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const payload = {
      name: data.name?.trim(),
      email: data.email?.trim(),
      phone: data.phone?.trim() || null,
      service: data.service || '',
      message: data.message?.trim() || null,
      privacyConsent: form.privacyConsent.checked,
      website: data.website || ''
    };
    const buttons = form.querySelectorAll('button[type="submit"]');
    buttons.forEach((b) => {
      b.disabled = true;
    });
    // Abre a janela já no clique (evita bloqueio de pop-up) e só preenche depois do envio.
    const whatsappNumber = form.dataset.whatsapp;
    const popup = channel === 'whatsapp' && whatsappNumber ? window.open('', '_blank') : null;
    setStatus(form, 'Enviando…');
    try {
      await api('/contact', { method: 'POST', body: payload });
      showFieldErrors(form, []);
      setStatus(form, 'Mensagem enviada! Nossa equipe retornará assim que possível.', 'success');
      if (popup) {
        const text = [
          'Olá, CAVAX! Gostaria de conversar sobre um projeto.',
          '',
          `Nome: ${payload.name}`,
          `E-mail: ${payload.email}`,
          `Serviço: ${payload.service}`,
          `Mensagem: ${payload.message || 'Não informado'}`
        ].join('\n');
        popup.opener = null;
        popup.location.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
      }
      form.reset();
    } catch (error) {
      popup?.close();
      if (!showFieldErrors(form, error.details)) setStatus(form, error.message, 'error');
      else setStatus(form, 'Revise os campos destacados.', 'error');
    } finally {
      buttons.forEach((b) => {
        b.disabled = false;
      });
      channel = 'site';
    }
  });
}

// ---------- Consentimento de cookies (LGPD) ----------
// Duas finalidades separadas: essenciais (sempre ativos: sessão, carrinho, CSRF) e medição de audiência
// (opcional: analytics first-party da CAVAX e, se configurado, Google Analytics). Nada opcional roda antes do "sim".
const CONSENT_COOKIE = 'cavax_consent';
const CONSENT_VERSION = 2; // muda quando a finalidade/descrição muda → pede de novo
const analyticsId = document.body.dataset.analyticsId;
let firstParty = { enabled: false, heatmap: true };

function readConsent() {
  const match = document.cookie.match(/(?:^|;\s*)cavax_consent=([^;]+)/);
  if (!match) return null;
  try {
    const c = JSON.parse(decodeURIComponent(match[1]));
    return c && c.v === CONSENT_VERSION ? c : null;
  } catch {
    return null;
  }
}

function saveConsent(consent) {
  const value = encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, analytics: Boolean(consent.analytics), date: new Date().toISOString().slice(0, 10) }));
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${secure}`;
}

/** Google Analytics só é carregado após consentimento explícito. */
function loadGoogleAnalytics() {
  if (!analyticsId || window.__cavaxAnalytics) return;
  window.__cavaxAnalytics = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(analyticsId)}`;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments); // eslint-disable-line prefer-rest-params
  };
  window.gtag('js', new Date());
  window.gtag('config', analyticsId, { anonymize_ip: true });
}

function pageContext() {
  const product = document.querySelector('[data-product-slug]')?.dataset.productSlug;
  return product && /^[a-z0-9-]{1,90}$/.test(product) ? { product } : {};
}

async function loadAnalytics({ flush = false } = {}) {
  loadGoogleAnalytics();
  if (!firstParty.enabled) return;
  const tracker = await import('./lib/analytics.js');
  // flush: eventos desta página antes do carregamento só valem se o consentimento já existia.
  tracker.start({ heatmap: firstParty.heatmap, page: pageContext(), flush });
  document.dispatchEvent(new CustomEvent('analytics:ready', { detail: tracker }));
}

async function revokeAnalytics() {
  try {
    const tracker = await import('./lib/analytics.js');
    tracker.revoke();
  } catch {
    /* ignore */
  }
}

const banner = document.getElementById('cookieBanner');
function openBanner(customize = false) {
  if (!banner) return;
  const consent = readConsent();
  banner.hidden = false;
  const options = banner.querySelector('#cookieOptions');
  options.hidden = !customize;
  options.analytics.checked = Boolean(consent?.analytics);
  banner.querySelector('[data-cookie-action="save"]').hidden = !customize;
  banner.querySelector('[data-cookie-action="customize"]').hidden = customize;
  banner.querySelector('button')?.focus();
}
function closeBanner() {
  if (banner) banner.hidden = true;
}

banner?.addEventListener('click', (event) => {
  const action = event.target.closest('[data-cookie-action]')?.dataset.cookieAction;
  if (!action) return;
  if (action === 'customize') return openBanner(true);
  const before = readConsent();
  const analytics = action === 'accept' ? true : action === 'reject' ? false : banner.querySelector('#cookieOptions').analytics.checked;
  saveConsent({ analytics });
  closeBanner();
  if (analytics) loadAnalytics();
  else {
    // Revogação: apaga identificadores e pede ao servidor para apagar os eventos deste navegador.
    revokeAnalytics();
    if (window.__cavaxAnalytics || before?.analytics) setTimeout(() => location.reload(), 300);
  }
});
document.querySelectorAll('[data-cookie-preferences]').forEach((btn) => btn.addEventListener('click', () => openBanner(true)));

const consent = readConsent();
if (consent?.analytics) loadGoogleAnalytics();
// O banner só aparece quando existe medição opcional configurada (Google Analytics ou o analytics da CAVAX).
api('/site/settings')
  .then(({ data }) => {
    firstParty = { enabled: Boolean(data.analytics?.enabled), heatmap: data.analytics?.heatmap !== false };
  })
  .catch(() => {})
  .finally(() => {
    const c = readConsent();
    if (c?.analytics) loadAnalytics({ flush: true });
    else if (!c && (analyticsId || firstParty.enabled)) openBanner(false);
  });

// ---------- Vídeo "clique para carregar" ----------
// Nada é baixado do YouTube (nem o IP do visitante é enviado ao Google) até a pessoa clicar em assistir.
document.querySelectorAll('[data-video-embed]').forEach((box) => {
  const button = box.querySelector('button');
  if (!button) return;
  button.addEventListener('click', () => {
    const id = box.dataset.videoEmbed;
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return;
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
    iframe.title = box.dataset.videoTitle || 'Vídeo';
    iframe.width = '1920';
    iframe.height = '1080';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allowFullscreen = true;
    box.replaceChildren(iframe);
  });
});
