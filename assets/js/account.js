import { api, setCsrf, formatBRL, escapeHtml, showFieldErrors, setStatus, toast, assetUrl, productUrl, orderUrl, apiUrl } from './lib/api.js';
import { cart } from './lib/cart.js';
import { legalVersions, preloadLegal } from './lib/legal.js';

preloadLegal();

const guest = document.querySelector('[data-guest]');
const logged = document.querySelector('[data-logged]');
const params = new URLSearchParams(location.search);
const back = params.get('voltar');
const safeBack = back && back.startsWith('/') && !back.startsWith('//') ? back : null;

let me = null;
let dashboard = null;
let currentTicket = null;
let botContext = {};
let ticketTimer = null;

const formatDate = (iso) => new Date(iso).toLocaleDateString('pt-BR');
const formatTime = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const $ = (sel) => document.querySelector(sel);

// ---------------- Abas ----------------
const tabs = [...document.querySelectorAll('[data-tab]')];
function openTab(name, { focus = false } = {}) {
  if (!tabs.some((t) => t.dataset.tab === name)) name = 'inicio';
  for (const tab of tabs) {
    const active = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.querySelector(`[data-panel="${tab.dataset.tab}"]`).hidden = !active;
    if (active && focus) tab.focus();
  }
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  if (name === 'pedidos') loadOrders();
  if (name === 'seguranca') loadPasswordChannels();
  window.scrollTo({ top: Math.min(window.scrollY, document.querySelector('[data-logged]').offsetTop - 90), behavior: 'smooth' });
  if (name === 'atendimento') loadTickets();
  if (name !== 'atendimento') stopTicketPolling();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => openTab(tab.dataset.tab));
  tab.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const next = tabs[(index + (forward ? 1 : tabs.length - 1)) % tabs.length];
    openTab(next.dataset.tab, { focus: true });
  });
});

// ---------------- Visão geral ----------------
const STEPS = [
  ['pendente', 'Pedido feito'],
  ['pago', 'Pagamento aprovado'],
  ['em_preparacao', 'Em preparação'],
  ['enviado', 'Enviado'],
  ['entregue', 'Entregue']
];
const ICONS = {
  bag: '<path d="M5 7h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8zM9 7V5.5a3 3 0 0 1 6 0V7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17.5" cy="17.5" r="1.6"/>',
  wallet: '<path d="M4 7h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 7l11-3v3M16 13h2"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
  store: '<path d="M4 9.5 5.5 5h13L20 9.5M4 9.5V19h16V9.5M4 9.5c0 1.4 1.1 2.5 2.7 2.5S9.3 10.9 9.3 9.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1.1 2.5 2.6 2.5S20 10.9 20 9.5"/>',
  wa: '<path d="M5 19l1.2-3.5A7.5 7.5 0 1 1 9 18.3z"/><path d="M9.5 9.5c.3 2 2.2 3.9 4.2 4.3l1-1.1 1.6.8"/>',
  mail: '<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="m4 7 8 6 8-6"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/>'
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

function statusPill(o) {
  return `<span class="status-pill status-${escapeHtml(o.status)}">${escapeHtml(o.statusLabel)}</span>`;
}

function progress(o) {
  if (o.step < 0) return '<p class="cdash-cancel">Este pedido foi cancelado. Nada foi cobrado se o pagamento não tinha sido aprovado.</p>';
  return `<ol class="cdash-steps" aria-label="Andamento do pedido">${STEPS.map(
    ([, label], i) => `<li class="${i < o.step ? 'done' : i === o.step ? 'current' : ''}"${i === o.step ? ' aria-current="step"' : ''}><span class="dot" aria-hidden="true">${i < o.step ? '✓' : i + 1}</span><span class="lbl">${label}</span></li>`
  ).join('')}</ol>`;
}

function itemsLine(o) {
  const names = o.items.map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${escapeHtml(i.name)}`);
  const more = o.itemCount - o.items.length;
  return names.join(' · ') + (more > 0 ? ` · +${more}` : '');
}

function orderActions(o) {
  const href = orderUrl(o.code);
  return `<div class="cdash-order-actions">
    ${o.status === 'pendente' ? `<a class="btn btn-primary btn-small" href="${href}">Pagar agora</a>` : ''}
    <a class="btn btn-outline btn-small" href="${href}">Ver detalhes</a>
    <button type="button" class="text-link" data-help-order="${escapeHtml(o.code)}">Preciso de ajuda</button>
  </div>`;
}

function orderCard(o) {
  return `<article class="cdash-order">
    <header><div><strong>${escapeHtml(o.code)}</strong><small>${formatDate(o.createdAt)} · ${escapeHtml(o.paymentChoiceLabel)}</small></div>${statusPill(o)}</header>
    <p class="cdash-items">${itemsLine(o)}</p>
    ${progress(o)}
    <footer><span class="cdash-total">${formatBRL(o.totalCents)}</span>${orderActions(o)}</footer>
  </article>`;
}

function contactLinks(prefill = '') {
  const c = dashboard?.contact || {};
  const text = encodeURIComponent(`Olá, CAVAX! Sou ${me?.name || ''} (${me?.email || ''}). ${prefill}`.trim());
  const links = [];
  if (c.whatsapp) links.push(`<a class="channel wa" href="https://wa.me/${escapeHtml(c.whatsapp)}?text=${text}" target="_blank" rel="noopener"><span aria-hidden="true">◉</span> WhatsApp</a>`);
  if (c.email) links.push(`<a class="channel mail" href="mailto:${escapeHtml(c.email)}?subject=${encodeURIComponent('Atendimento - Minha conta')}&body=${text}"><span aria-hidden="true">✉</span> E-mail</a>`);
  return links.join('');
}

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }));
  return h < 12 ? 'BOM DIA' : h < 18 ? 'BOA TARDE' : 'BOA NOITE';
}

function heroSummary(s, last) {
  if (!s.orders) return 'Que bom ter você aqui! Explore a loja — pagando no PIX você ganha desconto.';
  const parts = [];
  if (s.pending) parts.push(`<strong>${s.pending}</strong> pedido(s) aguardando pagamento`);
  if (s.inProgress) parts.push(`<strong>${s.inProgress}</strong> em andamento`);
  if (s.unreadSupport) parts.push(`<strong>${s.unreadSupport}</strong> resposta(s) nova(s) da equipe`);
  if (!parts.length) return `Tudo em dia por aqui. Seu último pedido (${escapeHtml(last.code)}) está: ${escapeHtml(last.statusLabel.toLowerCase())}.`;
  return `Você tem ${parts.join(', ')}.`;
}

function shortcut(iconName, label, desc, attrs) {
  return `<${attrs.href ? 'a' : 'button type="button"'} class="cdash-shortcut" ${Object.entries(attrs).map(([k, v]) => `${k}="${escapeHtml(v)}"`).join(' ')}>
    <span class="ic">${icon(iconName)}</span><span><strong>${label}</strong><small>${desc}</small></span></${attrs.href ? 'a' : 'button'}>`;
}

function recoCard(p) {
  return `<article class="cdash-product">
    <a href="${escapeHtml(productUrl(p.url))}" class="cdash-product-img">${p.image ? `<img src="${escapeHtml(assetUrl(p.image.url))}" alt="" loading="lazy">` : '<span>CAVAX</span>'}</a>
    <div><a href="${escapeHtml(productUrl(p.url))}"><strong>${escapeHtml(p.name)}</strong></a>
      <span class="price">${p.originalPriceCents ? `<s>${formatBRL(p.originalPriceCents)}</s> ` : ''}${formatBRL(p.priceCents)}</span>
      ${p.pixPriceCents ? `<span class="price-pix">${formatBRL(p.pixPriceCents)} no PIX</span>` : ''}
      <button type="button" class="btn btn-outline btn-small" data-reco-add="${p.id}">Adicionar ao carrinho</button></div>
  </article>`;
}

async function loadDashboard() {
  const { data } = await api('/customers/me/dashboard');
  dashboard = data;
  const s = data.stats;
  $('[data-greeting]').textContent = `${greeting()} · PAINEL DO CLIENTE`;
  $('[data-hero-summary]').innerHTML = heroSummary(s, data.lastOrder);
  $('[data-hero-actions]').innerHTML = `<a class="btn btn-primary" href="/loja">Ir para a loja</a>${s.pending && data.lastOrder?.status === 'pendente' ? `<a class="btn btn-outline" href="${orderUrl(data.lastOrder.code)}">Pagar pedido</a>` : ''}`;
  if (data.memberSince) $('[data-member-since]').textContent = `Cliente desde ${new Date(data.memberSince).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
  const stat = (ic, label, value, cls = '', tab = '') =>
    `<button type="button" class="cdash-stat ${cls}" ${tab ? `data-open-tab="${tab}"` : 'tabindex="-1"'}><span class="ic">${icon(ic)}</span><span><small>${label}</small><strong>${value}</strong></span></button>`;
  $('[data-stats]').innerHTML = [
    stat('bag', 'Pedidos', s.orders, '', 'pedidos'),
    stat('clock', 'Aguardando pagamento', s.pending, s.pending ? 'alert' : '', 'pedidos'),
    stat('truck', 'Em andamento', s.inProgress, '', 'pedidos'),
    stat('wallet', 'Total em compras', formatBRL(s.totalSpentCents)),
    stat('chat', 'Respostas novas', s.unreadSupport, s.unreadSupport ? 'alert' : '', 'atendimento')
  ].join('');
  $('[data-last-order]').innerHTML = data.lastOrder
    ? orderCard(data.lastOrder)
    : `<div class="cdash-empty">${icon('bag')}<p>Você ainda não fez pedidos.</p><a class="btn btn-outline btn-small" href="/loja">Conhecer a loja</a></div>`;
  $('[data-help-actions]').innerHTML = [
    shortcut('bot', 'Assistente virtual', 'Respostas na hora, 24h', { 'data-go': 'bot' }),
    shortcut('chat', 'Chat com a equipe', s.openTickets ? `${s.openTickets} atendimento(s) aberto(s)` : 'Fale com uma pessoa', { 'data-go': 'human' }),
    data.contact.whatsapp ? shortcut('wa', 'WhatsApp', 'Atendimento rápido', { href: `https://wa.me/${data.contact.whatsapp}?text=${encodeURIComponent(`Olá, CAVAX! Sou ${me.name} (${me.email}).`)}`, target: '_blank', rel: 'noopener' }) : '',
    data.contact.email ? shortcut('mail', 'E-mail', data.contact.email, { href: `mailto:${data.contact.email}` }) : '',
    shortcut('shield', 'Segurança', 'Senha e aparelhos', { 'data-open-tab': 'seguranca' })
  ].join('');
  if (data.pixDiscountPercent) $('[data-help-actions]').insertAdjacentHTML('beforeend', `<p class="cdash-pix">⚡ Pagando no PIX você ganha <strong>${data.pixDiscountPercent}% de desconto</strong>.</p>`);
  $('[data-reco-wrap]').hidden = !data.recommended.length;
  $('[data-reco]').innerHTML = data.recommended.map(recoCard).join('');
  $('[data-channels]').innerHTML = contactLinks('Preciso de ajuda.');
  if (data.contact.businessHours) $('[data-hours]').textContent = `Horário de atendimento: ${data.contact.businessHours}`;
  const sessions = data.security.activeSessions;
  $('[data-sessions-info]').textContent = sessions > 1 ? `Sua conta está conectada em ${sessions} aparelhos/navegadores.` : 'Sua conta está conectada só neste aparelho.';
  $('[data-logout-others]').hidden = sessions <= 1;
  loadPrivacy();
  const ordersBadge = $('[data-orders-badge]');
  ordersBadge.textContent = s.pending;
  ordersBadge.hidden = !s.pending;
  updateSupportBadge(s.unreadSupport);
  renderSuggestions(data.botSuggestions);
}

function updateSupportBadge(count) {
  const badge = $('[data-support-badge]');
  badge.textContent = count;
  badge.hidden = !count;
}

document.addEventListener('click', async (e) => {
  const go = e.target.closest('[data-go]');
  const tabLink = e.target.closest('[data-open-tab]');
  const helpOrder = e.target.closest('[data-help-order]');
  const recoAdd = e.target.closest('[data-reco-add]');
  if (go) {
    openTab('atendimento');
    if (go.dataset.go === 'bot') $('#botInput').focus();
    else showNewTicket();
  }
  if (tabLink) openTab(tabLink.dataset.openTab, { focus: true });
  if (helpOrder) {
    await showNewTicket({ subject: `Ajuda com o pedido ${helpOrder.dataset.helpOrder}`, orderCode: helpOrder.dataset.helpOrder });
  }
  if (recoAdd) {
    cart.add(Number(recoAdd.dataset.recoAdd), 1);
    toast('Produto adicionado ao carrinho.', { href: '/loja/carrinho/', label: 'Ver carrinho' });
  }
  if (e.target.closest('[data-logout-others]')) {
    const status = $('[data-sessions-status]');
    try {
      const { data } = await api('/customers/me/sessions/logout-others', { method: 'POST', body: {} });
      status.textContent = data.ended ? `Pronto! ${data.ended} outro(s) aparelho(s) desconectado(s).` : 'Nenhum outro aparelho conectado.';
      status.className = 'form-status is-success';
      $('[data-sessions-info]').textContent = 'Sua conta está conectada só neste aparelho.';
      $('[data-logout-others]').hidden = true;
    } catch (error) {
      status.textContent = error.message;
      status.className = 'form-status is-error';
    }
  }
});

// ---------------- LGPD: pedidos do titular e comprovantes de aceite ----------------
const PRIVACY_STATUS = { aberto: 'Aberto', em_andamento: 'Em andamento', concluido: 'Concluído', recusado: 'Recusado' };
const DOC_SOURCE = { cadastro: 'no cadastro', checkout: 'na compra' };

async function loadPrivacy() {
  const box = $('[data-privacy-requests]');
  const acc = $('[data-legal-acceptances]');
  if (!box || !acc) return;
  try {
    const [{ data: req }, { data: accepted }] = await Promise.all([api('/customers/me/privacy-requests'), api('/customers/me/legal-acceptances')]);
    box.innerHTML = req.requests.length
      ? `<ul class="lgpd-list">${req.requests
          .map(
            (r) => `<li><strong>${escapeHtml(r.typeLabel)}</strong> · protocolo ${escapeHtml(r.protocol)}<br><small>${escapeHtml(PRIVACY_STATUS[r.status] || r.status)} · aberto em ${formatDate(r.createdAt)}${r.status === 'aberto' || r.status === 'em_andamento' ? ` · resposta até ${formatDate(r.dueAt)}` : ''}</small>${r.response ? `<p>${escapeHtml(r.response)}</p>` : ''}</li>`
          )
          .join('')}</ul>`
      : '';
    acc.innerHTML = accepted.length
      ? `<ul class="lgpd-list">${accepted
          .map((a) => `<li>${escapeHtml(a.title)} — versão ${escapeHtml(a.version)}, aceita ${escapeHtml(DOC_SOURCE[a.source] || a.source)} em ${formatDate(a.acceptedAt)}<br><small class="mono">ref. ${escapeHtml(a.sha256.slice(0, 16))}…</small></li>`)
          .join('')}</ul>`
      : '<p class="muted-line">Sua conta foi criada antes do registro de aceites. Os documentos atuais estão no rodapé do site.</p>';
  } catch {
    acc.innerHTML = '<p class="muted-line">Não foi possível carregar agora.</p>';
  }
}

const privacyForm = $('[data-privacy-form]');
if (privacyForm) {
  privacyForm.type.addEventListener('change', () => {
    $('[data-privacy-exclusao]').hidden = privacyForm.type.value !== 'exclusao';
  });
  privacyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFieldErrors(privacyForm, []);
    if (!privacyForm.type.value) {
      showFieldErrors(privacyForm, [{ field: 'type', message: 'Escolha o tipo de pedido.' }]);
      return;
    }
    const button = privacyForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus(privacyForm, 'Enviando…');
    try {
      const { data } = await api('/customers/me/privacy-requests', { method: 'POST', body: { type: privacyForm.type.value, message: privacyForm.message.value.trim() || null } });
      setStatus(
        privacyForm,
        data.duplicate ? `Você já tem um pedido desse tipo em andamento (protocolo ${data.request.protocol}).` : `Pedido registrado. Protocolo ${data.request.protocol}. Responderemos até ${formatDate(data.request.dueAt)}.`,
        'success'
      );
      privacyForm.reset();
      $('[data-privacy-exclusao]').hidden = true;
      loadPrivacy();
    } catch (error) {
      if (!showFieldErrors(privacyForm, error.details)) setStatus(privacyForm, error.message, 'error');
      else setStatus(privacyForm, '');
    } finally {
      button.disabled = false;
    }
  });
}

// ---------------- Pedidos ----------------
let allOrders = [];
let orderFilter = 'todos';
const FILTERS = {
  todos: () => true,
  pendente: (o) => o.status === 'pendente',
  andamento: (o) => ['pago', 'em_preparacao', 'enviado'].includes(o.status),
  entregue: (o) => o.status === 'entregue',
  cancelado: (o) => o.status === 'cancelado'
};

function renderOrders() {
  const el = $('[data-orders]');
  if (!allOrders.length) {
    el.innerHTML = `<div class="cdash-empty">${icon('bag')}<p>Você ainda não fez pedidos com esta conta.</p><a class="btn btn-outline btn-small" href="/loja">Ir para a loja</a></div>`;
    return;
  }
  const list = allOrders.filter(FILTERS[orderFilter]);
  el.innerHTML = list.length ? `<div class="cdash-orders">${list.map(orderCard).join('')}</div>` : '<p class="cdash-none">Nenhum pedido neste filtro.</p>';
  for (const chip of document.querySelectorAll('[data-filter]')) {
    const count = allOrders.filter(FILTERS[chip.dataset.filter]).length;
    chip.dataset.count = count;
    chip.classList.toggle('is-active', chip.dataset.filter === orderFilter);
    chip.setAttribute('aria-pressed', String(chip.dataset.filter === orderFilter));
  }
}

document.querySelector('[data-order-filters]').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-filter]');
  if (!chip) return;
  orderFilter = chip.dataset.filter;
  renderOrders();
});

async function loadOrders() {
  const el = $('[data-orders]');
  try {
    const { data } = await api('/customers/me/orders');
    allOrders = data;
    renderOrders();
  } catch (error) {
    el.innerHTML = `<p class="notice notice-warning">${escapeHtml(error.message)}</p>`;
  }
}

// ---------------- Assistente virtual (bot) ----------------
const botLog = $('[data-bot-log]');
function productCards(products) {
  const wrap = document.createElement('div');
  wrap.className = 'chat-products';
  for (const p of products) {
    const card = document.createElement('div');
    card.className = 'chat-product';
    card.innerHTML = `
      ${p.image ? `<img src="${escapeHtml(assetUrl(p.image.url))}" alt="" loading="lazy">` : '<span class="chat-product-ph">CAVAX</span>'}
      <div class="chat-product-body">
        <strong>${escapeHtml(p.name)}</strong>
        <span class="chat-product-price">${p.originalPriceCents ? `<s>${formatBRL(p.originalPriceCents)}</s> ` : ''}${formatBRL(p.priceCents)}</span>
        ${p.pixPriceCents ? `<span class="price-pix">${formatBRL(p.pixPriceCents)} no PIX</span>` : ''}
        <small>${{ digital: 'Produto digital', servico: 'Serviço / projeto' }[p.productType] || 'Produto físico'} · ${p.inStock ? 'Disponível' : 'Esgotado'}</small>
        <div class="chat-product-actions">
          <a class="chip" href="${escapeHtml(productUrl(p.url))}">Ver produto</a>
          ${p.inStock ? `<button type="button" class="chip chip-solid" data-chat-add="${p.id}">Adicionar ao carrinho</button>` : ''}
          <button type="button" class="chip" data-chat-ask="${p.id}" data-name="${escapeHtml(p.name)}">Perguntar</button>
        </div>
      </div>`;
    wrap.appendChild(card);
  }
  wrap.addEventListener('click', (e) => {
    const add = e.target.closest('[data-chat-add]');
    const ask = e.target.closest('[data-chat-ask]');
    if (add) {
      cart.add(Number(add.dataset.chatAdd), 1);
      toast('Produto adicionado ao carrinho.', { href: '/loja/carrinho/', label: 'Ver carrinho' });
    }
    if (ask) {
      botContext = { productId: Number(ask.dataset.chatAsk) };
      renderSuggestions(['Quanto custa?', 'Qual o prazo de entrega?', 'Tem em estoque?', 'Quanto fica no PIX?']);
      const input = $('#botInput');
      input.placeholder = `Pergunte sobre ${ask.dataset.name}…`;
      input.focus();
    }
  });
  return wrap;
}

function addBubble(log, { author, text, actions = [], meta = '', products = [] }) {
  const div = document.createElement('div');
  div.className = `bubble ${author}`;
  div.innerHTML = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>${meta ? `<small>${escapeHtml(meta)}</small>` : ''}`;
  if (products.length) div.appendChild(productCards(products));
  if (actions.length) {
    const wrap = document.createElement('div');
    wrap.className = 'bubble-actions';
    for (const a of actions) {
      if (a.type === 'link' && /^(\/|https:\/\/wa\.me\/|mailto:)/.test(a.href)) {
        const link = document.createElement('a');
        link.className = 'chip';
        link.href = a.href;
        link.textContent = a.label;
        if (!a.href.startsWith('/')) {
          link.target = '_blank';
          link.rel = 'noopener';
        }
        wrap.appendChild(link);
      } else if (a.type === 'open_chat' || a.type === 'tab') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip';
        btn.textContent = a.label;
        btn.addEventListener('click', () => (a.type === 'tab' ? openTab(a.tab) : showNewTicket()));
        wrap.appendChild(btn);
      }
    }
    div.appendChild(wrap);
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function renderSuggestions(list = []) {
  const el = $('[data-bot-suggestions]');
  el.innerHTML = '';
  for (const text of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = text;
    btn.addEventListener('click', () => askBot(text));
    el.appendChild(btn);
  }
}

async function askBot(message) {
  addBubble(botLog, { author: 'me', text: message });
  const typing = document.createElement('div');
  typing.className = 'bubble bot typing';
  typing.innerHTML = '<p><span class="dots"><i></i><i></i><i></i></span></p>';
  botLog.appendChild(typing);
  try {
    const { data } = await api('/customers/me/bot', { method: 'POST', body: { message, context: botContext } });
    typing.remove();
    botContext = data.context || {};
    $('#botInput').placeholder = 'Digite sua dúvida…';
    addBubble(botLog, { author: 'bot', text: data.reply, actions: data.actions || [], products: data.products || [] });
    if (data.suggestions?.length) renderSuggestions(data.suggestions);
  } catch (error) {
    typing.remove();
    addBubble(botLog, { author: 'bot', text: error.message });
  }
}

$('[data-bot-form]').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#botInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  askBot(text);
});

// ---------------- Atendimento humano ----------------
const ticketList = $('[data-ticket-list]');
const ticketView = $('[data-ticket-view]');
const newTicket = $('[data-new-ticket]');

function stopTicketPolling() {
  clearInterval(ticketTimer);
  ticketTimer = null;
}

async function loadTickets() {
  stopTicketPolling();
  currentTicket = null;
  ticketView.hidden = true;
  newTicket.hidden = true;
  ticketList.hidden = false;
  try {
    const { data } = await api('/customers/me/support');
    ticketList.innerHTML = `
      <button type="button" class="btn btn-primary btn-small" data-new>+ Novo atendimento</button>
      ${
        data.length
          ? `<ul class="ticket-list">${data
              .map(
                (t) => `<li><button type="button" data-open-ticket="${t.id}">
            <span><strong>${escapeHtml(t.subject)}</strong>${t.orderCode ? `<small>Pedido ${escapeHtml(t.orderCode)}</small>` : ''}</span>
            <span class="ticket-meta"><span class="status-pill">${escapeHtml(t.statusLabel)}</span>${t.unread ? `<span class="tab-badge">${t.unread}</span>` : ''}<small>${formatTime(t.lastMessageAt)}</small></span>
          </button></li>`
              )
              .join('')}</ul>`
          : '<p class="muted-line">Nenhum atendimento ainda. Abra um para conversar com a nossa equipe.</p>'
      }`;
    updateSupportBadge(data.reduce((sum, t) => sum + t.unread, 0));
  } catch (error) {
    ticketList.innerHTML = `<p class="notice notice-warning">${escapeHtml(error.message)}</p>`;
  }
}

ticketList.addEventListener('click', (e) => {
  if (e.target.closest('[data-new]')) return showNewTicket();
  const btn = e.target.closest('[data-open-ticket]');
  if (btn) openTicket(Number(btn.dataset.openTicket));
});

async function showNewTicket(prefill = {}) {
  openTabSilently();
  stopTicketPolling();
  ticketList.hidden = true;
  ticketView.hidden = true;
  newTicket.hidden = false;
  const select = newTicket.orderCode;
  try {
    const { data } = await api('/customers/me/orders');
    select.innerHTML = '<option value="">Nenhum</option>' + data.map((o) => `<option value="${escapeHtml(o.code)}">${escapeHtml(o.code)} — ${escapeHtml(o.statusLabel)}</option>`).join('');
  } catch {
    /* sem pedidos */
  }
  if (prefill.subject) newTicket.subject.value = prefill.subject;
  if (prefill.orderCode) newTicket.orderCode.value = prefill.orderCode;
  if (prefill.message) newTicket.message.value = prefill.message;
  (prefill.subject ? newTicket.message : newTicket.subject).focus();
}

function openTabSilently() {
  if ($('[data-panel="atendimento"]').hidden) {
    for (const tab of tabs) {
      const active = tab.dataset.tab === 'atendimento';
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.querySelector(`[data-panel="${tab.dataset.tab}"]`).hidden = !active;
    }
    history.replaceState(null, '', '#atendimento');
  }
}

$('[data-cancel-ticket]').addEventListener('click', loadTickets);
$('[data-ticket-back]').addEventListener('click', loadTickets);

newTicket.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { subject: newTicket.subject.value.trim(), message: newTicket.message.value.trim(), orderCode: newTicket.orderCode.value || null };
  const button = newTicket.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { data } = await api('/customers/me/support', { method: 'POST', body });
    newTicket.reset();
    showFieldErrors(newTicket, []);
    setStatus(newTicket, '');
    toast('Atendimento aberto! Nossa equipe responderá por aqui.');
    renderThread(data);
  } catch (error) {
    const shown = showFieldErrors(newTicket, error.details);
    setStatus(newTicket, shown ? 'Revise os campos destacados.' : error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

function renderThread({ ticket, messages }) {
  currentTicket = ticket;
  ticketList.hidden = true;
  newTicket.hidden = true;
  ticketView.hidden = false;
  $('[data-ticket-subject]').textContent = ticket.subject + (ticket.orderCode ? ` · ${ticket.orderCode}` : '');
  $('[data-ticket-status]').textContent = ticket.statusLabel;
  $('[data-ticket-close]').hidden = ticket.status === 'encerrado';
  const log = $('[data-ticket-log]');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.innerHTML = '';
  for (const m of messages) {
    addBubble(log, {
      author: m.author === 'cliente' ? 'me' : 'team',
      text: m.body,
      meta: `${m.author === 'cliente' ? 'Você' : m.authorName || 'Equipe CAVAX'} · ${formatTime(m.createdAt)}`
    });
  }
  if (!atBottom) log.scrollTop = log.scrollHeight;
  if (ticket.status === 'encerrado') {
    const note = document.createElement('p');
    note.className = 'muted-line';
    note.textContent = 'Atendimento encerrado. Envie uma mensagem para reabrir.';
    log.appendChild(note);
  }
  if (!ticketTimer) ticketTimer = setInterval(() => !document.hidden && currentTicket && refreshThread(), 10000);
}

async function openTicket(id) {
  try {
    const { data } = await api(`/customers/me/support/${id}`);
    renderThread(data);
    $('#ticketInput').focus();
  } catch (error) {
    toast(error.message);
  }
}

async function refreshThread() {
  try {
    const { data } = await api(`/customers/me/support/${currentTicket.id}`);
    renderThread(data);
  } catch {
    /* tenta novamente */
  }
}

$('[data-ticket-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#ticketInput');
  const body = input.value.trim();
  if (!body || !currentTicket) return;
  input.disabled = true;
  try {
    const { data } = await api(`/customers/me/support/${currentTicket.id}/messages`, { method: 'POST', body: { body } });
    input.value = '';
    renderThread(data);
  } catch (error) {
    toast(error.message);
  } finally {
    input.disabled = false;
    input.focus();
  }
});
$('#ticketInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('[data-ticket-form]').requestSubmit();
  }
});

$('[data-ticket-close]').addEventListener('click', async () => {
  if (!currentTicket) return;
  const { data } = await api(`/customers/me/support/${currentTicket.id}/close`, { method: 'POST', body: {} });
  renderThread(data);
  toast('Atendimento encerrado.');
});

// ---------------- Meus dados ----------------
const profile = document.getElementById('profileForm');
profile.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { data } = await api('/customers/me', { method: 'PUT', body: { name: profile.name.value.trim(), phone: onlyDigits(profile.phone.value), marketingConsent: profile.marketingConsent.checked } });
    me = data.customer;
    window.dispatchEvent(new CustomEvent('cavax:account', { detail: me }));
    fillProfileHeader(me);
    $('[data-customer-name]').textContent = me.name.split(' ')[0];
    showFieldErrors(profile, []);
    setStatus(profile, 'Dados atualizados.', 'success');
    loadPasswordChannels();
  } catch (error) {
    const shown = showFieldErrors(profile, error.details);
    setStatus(profile, shown ? 'Revise os campos destacados.' : error.message, 'error');
  }
});

// ---------------- Alterar senha (com código) ----------------
const pwForm = document.getElementById('passwordForm');
const CHANNEL_LABEL = { email: 'E-mail', whatsapp: 'WhatsApp' };
let resendTimer = null;

async function loadPasswordChannels() {
  const box = pwForm.querySelector('[data-channel-options]');
  try {
    const { data } = await api('/customers/me/password/channels');
    const options = ['email', 'whatsapp'].filter((c) => data[c].destination);
    box.innerHTML = options.length
      ? options
          .map(
            (c, i) => `<label class="channel-option${data[c].available ? '' : ' disabled'}">
              <input type="radio" name="channel" value="${c}"${data[c].available && !pwForm.querySelector('input[name=channel]:checked') && i === options.findIndex((o) => data[o].available) ? ' checked' : ''}${data[c].available ? '' : ' disabled'}>
              <span><strong>${CHANNEL_LABEL[c]}</strong><small>${escapeHtml(data[c].destination)}${data[c].available ? '' : ' · indisponível'}</small></span></label>`
          )
          .join('') + (data.whatsapp.destination ? '' : '<p class="hint">Cadastre seu WhatsApp acima para receber o código por lá.</p>')
      : '<p class="hint">Nenhum canal disponível. Fale com o atendimento.</p>';
    if (data.simulated) box.insertAdjacentHTML('beforeend', '<p class="hint">Ambiente de testes: alguns envios aparecem só no terminal do servidor.</p>');
  } catch (error) {
    box.innerHTML = `<p class="hint">${escapeHtml(error.message)}</p>`;
  }
}

function startResendCountdown(seconds) {
  const btn = pwForm.querySelector('[data-resend]');
  clearInterval(resendTimer);
  let left = seconds;
  btn.disabled = true;
  btn.textContent = `Reenviar código (${left}s)`;
  resendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(resendTimer);
      btn.disabled = false;
      btn.textContent = 'Reenviar código';
    } else btn.textContent = `Reenviar código (${left}s)`;
  }, 1000);
}

async function requestCode() {
  const channel = pwForm.querySelector('input[name=channel]:checked')?.value;
  if (!channel) return setStatus(pwForm, 'Escolha onde receber o código.', 'error');
  const btn = pwForm.querySelector('[data-send-code]');
  btn.disabled = true;
  try {
    const { data } = await api('/customers/me/password/code', { method: 'POST', body: { channel } });
    pwForm.querySelector('[data-step="code"]').hidden = false;
    pwForm.querySelector('[data-code-sent]').textContent = `Enviamos um código por ${CHANNEL_LABEL[data.channel]} para ${data.sentTo}. Ele vale por ${data.expiresInMinutes} minutos.`;
    setStatus(pwForm, '', '');
    startResendCountdown(data.resendInSeconds);
    pwForm.code.focus();
  } catch (error) {
    setStatus(pwForm, error.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

pwForm.querySelector('[data-send-code]').addEventListener('click', requestCode);
pwForm.querySelector('[data-resend]').addEventListener('click', requestCode);
pwForm.code.addEventListener('input', () => (pwForm.code.value = pwForm.code.value.replace(/\D/g, '').slice(0, 6)));
pwForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { data } = await api('/customers/me/password', {
      method: 'PUT',
      body: { code: pwForm.code.value, password: pwForm.password.value, passwordConfirm: pwForm.passwordConfirm.value }
    });
    showFieldErrors(pwForm, []);
    pwForm.reset();
    pwForm.querySelector('[data-step="code"]').hidden = true;
    clearInterval(resendTimer);
    setStatus(pwForm, `Senha alterada com sucesso!${data.otherSessionsEnded ? ' Por segurança, desconectamos sua conta dos outros aparelhos.' : ''}`, 'success');
    loadPasswordChannels();
  } catch (error) {
    const shown = showFieldErrors(pwForm, error.details);
    setStatus(pwForm, shown ? 'Revise os campos destacados.' : error.message, 'error');
  }
});

function fillProfileHeader(customer) {
  const parts = customer.name.trim().split(/\s+/);
  $('[data-customer-initials]').textContent = (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  $('[data-customer-fullname]').textContent = customer.name;
  $('[data-customer-email]').textContent = customer.email;
}

// Site estático: o download dos dados (LGPD) vem do servidor da API.
document.querySelectorAll('a[href="/api/v1/customers/me/export"]').forEach((a) => (a.href = apiUrl('/customers/me/export')));

// ---------------- Sessão ----------------
// Aviso "confirme seu e-mail" (some depois da confirmação).
const verifyBox = document.querySelector('[data-email-verify]');
function updateEmailVerify(customer) {
  if (!verifyBox) return;
  verifyBox.hidden = !customer || customer.emailVerified !== false;
  const target = verifyBox.querySelector('[data-verify-email]');
  if (target && customer) target.textContent = customer.email;
}
verifyBox?.querySelector('[data-resend-confirm]')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const { data } = await api('/customers/me/email/confirm', { method: 'POST', body: {} });
    if (data.alreadyVerified) {
      me = { ...me, emailVerified: true };
      updateEmailVerify(me);
      toast('Seu e-mail já está confirmado.');
      return;
    }
    toast('Enviamos um novo link de confirmação. Confira sua caixa de entrada e o spam.');
    let left = data.resendInSeconds || 120;
    btn.textContent = `Reenviar (${left}s)`;
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0 || !me) {
        clearInterval(timer);
        btn.disabled = false;
        btn.textContent = 'Reenviar e-mail';
      } else btn.textContent = `Reenviar (${left}s)`;
    }, 1000);
    return;
  } catch (error) {
    toast(error.message);
  }
  btn.disabled = false;
});

async function showLogged(customer) {
  me = customer;
  linkState = null;
  window.dispatchEvent(new CustomEvent('cavax:account', { detail: customer }));
  guest.hidden = true;
  logged.hidden = false;
  $('[data-customer-name]').textContent = customer.name.split(' ')[0];
  fillProfileHeader(customer);
  document.body.classList.add('is-logged');
  profile.name.value = customer.name;
  profile.phone.value = maskPhone(customer.phone || '');
  document.getElementById('p-document').value = customer.document ? maskCpf(customer.document).replace(/^(\d{3})\.\d{3}\.(\d{3})/, '$1.***.$2') : 'Não informado';
  document.getElementById('p-email').value = customer.email;
  profile.marketingConsent.checked = Boolean(customer.marketingConsent);
  updateEmailVerify(customer);
  loadPasswordChannels();
  if (!botLog.childElementCount) {
    addBubble(botLog, { author: 'bot', text: `Olá, ${customer.name.split(' ')[0]}! Sou o assistente virtual da CAVAX. Escolha um assunto abaixo ou digite sua dúvida.` });
  }
  try {
    await loadDashboard();
  } catch (error) {
    toast(error.message);
  }
  openTab(location.hash.slice(1) || 'inicio');
}

// ---------------- Login, cadastro e "Esqueci minha senha" ----------------
const authShell = document.querySelector('[data-auth-shell]');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
/** Data mais recente permitida (quem nasceu até hoje há 18 anos). */
function adultLimit() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
document.querySelectorAll('[data-adult-date]').forEach((input) => input.setAttribute('max', adultLimit()));
const forgotForm = document.getElementById('forgotForm');
const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

function maskPhone(v) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function maskCpf(v) {
  const d = onlyDigits(v).slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(cpf[i]) * (len + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(cpf[len])) return false;
  }
  return true;
}
const MASKS = { phone: maskPhone, cpf: maskCpf };
document.querySelectorAll('[data-mask]').forEach((input) => {
  input.addEventListener('input', () => (input.value = MASKS[input.dataset.mask](input.value)));
});

// Olho para mostrar/ocultar a senha em todos os campos de senha da página.
const EYE = '<svg class="eye-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.1 6.2C3.5 8 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function hidePasswords(scope = document) {
  scope.querySelectorAll('.pw-toggle[aria-pressed="true"]').forEach((btn) => btn.click());
}
document.querySelectorAll('input[type="password"]').forEach((input) => {
  const wrap = document.createElement('span');
  wrap.className = 'pw-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pw-toggle';
  btn.setAttribute('aria-label', 'Mostrar senha');
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = EYE;
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  });
  wrap.appendChild(btn);
  if (input.hasAttribute('data-strength')) {
    const meter = document.createElement('div');
    meter.className = 'pw-meter';
    meter.setAttribute('aria-hidden', 'true');
    meter.innerHTML = '<i></i><i></i><i></i><i></i>';
    wrap.after(meter);
    input.addEventListener('input', () => {
      const v = input.value;
      let level = 0;
      if (v.length) level = 1;
      if (v.length >= 10 && /[A-Za-z]/.test(v) && /\d/.test(v)) level = 2;
      if (level === 2 && (v.length >= 12 || /[^A-Za-z0-9]/.test(v))) level = 3;
      if (level >= 2 && v.length >= 14 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /[^A-Za-z0-9]/.test(v)) level = 4;
      meter.dataset.level = String(level);
    });
  }
});

/** Deixa um formulário em branco: valores, erros, mensagens, senhas ocultas e medidor zerado. */
function clearForm(form) {
  if (!form) return;
  form.reset();
  form.querySelectorAll('input:not([type=checkbox]):not([type=radio])').forEach((i) => (i.value = ''));
  form.querySelectorAll('.pw-meter').forEach((m) => delete m.dataset.level);
  hidePasswords(form);
  showFieldErrors(form, []);
  setStatus(form, '');
}

let forgotTimer = null;
function resetForgot() {
  clearInterval(forgotTimer);
  clearForm(forgotForm);
  forgotForm.querySelector('[data-forgot-step="request"]').hidden = false;
  forgotForm.querySelector('[data-forgot-step="reset"]').hidden = true;
  const resend = forgotForm.querySelector('[data-forgot-resend]');
  resend.disabled = true;
  resend.textContent = 'Reenviar código';
}

function clearAuthForms() {
  clearForm(loginForm);
  clearForm(registerForm);
  resetForgot();
}

function setAuthMode(mode, { focus = true } = {}) {
  const register = mode === 'register';
  authShell.dataset.mode = register ? 'register' : 'login';
  loginForm.hidden = mode === 'forgot';
  forgotForm.hidden = mode !== 'forgot';
  if (mode !== 'forgot') resetForgot();
  // Campos do painel escondido saem da navegação por teclado e leitores de tela.
  authShell.querySelector('[data-pane="login"]').inert = register;
  authShell.querySelector('[data-pane="register"]').inert = !register;
  if (focus) {
    const target = register ? registerForm.name : mode === 'forgot' ? forgotForm.email : loginForm.email;
    setTimeout(() => target.focus({ preventScroll: true }), register ? 450 : 50);
  }
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-auth-go]');
  if (!go) return;
  e.preventDefault();
  const mode = go.dataset.authGo;
  if (mode === 'forgot' && loginForm.email.value.trim()) forgotForm.email.value = loginForm.email.value.trim();
  setAuthMode(mode);
});
setAuthMode(params.get('modo') === 'cadastro' ? 'register' : 'login', { focus: false });

// Retorno dos links enviados por e-mail (?email=confirmado|invalido, ?seguranca=redefinir).
let linkState = null;
(function readEmailLinks() {
  const email = params.get('email');
  const seguranca = params.get('seguranca');
  if (!email && !seguranca) return;
  linkState = { email, seguranca };
  if (email === 'confirmado') toast('E-mail confirmado com sucesso! Obrigado.');
  else if (email === 'invalido') toast('Este link de confirmação já foi usado ou expirou. Entre na sua conta e peça um novo.');
  params.delete('email');
  params.delete('seguranca');
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
})();

/** Aplicado quando a tela de login aparece (depois que os formulários são limpos). */
function applyLinkState() {
  if (!linkState) return;
  const state = linkState;
  linkState = null;
  if (state.seguranca === 'redefinir') {
    setAuthMode('forgot', { focus: false });
    setStatus(forgotForm, 'Por segurança, crie uma nova senha para voltar a acessar sua conta.', 'error');
  } else if (state.email === 'confirmado') {
    setStatus(loginForm, 'E-mail confirmado! Entre com seu e-mail e senha.', 'success');
  }
}

function handleAuth(form, path, build, check) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const local = check ? check(form) : [];
    if (local.length) {
      showFieldErrors(form, local);
      setStatus(form, 'Revise os campos destacados.', 'error');
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus(form, 'Aguarde…');
    try {
      const { data } = await api(path, { method: 'POST', body: build(form) });
      setCsrf(data.csrfToken);
      clearAuthForms();
      if (safeBack) {
        window.location.href = safeBack;
        return;
      }
      showLogged(data.customer);
    } catch (error) {
      if (error.code === 'PASSWORD_RESET_REQUIRED') {
        // Conta bloqueada pelo "Não fui eu": leva direto para criar uma nova senha.
        const email = loginForm.email.value.trim();
        setAuthMode('forgot');
        forgotForm.email.value = email;
        setStatus(forgotForm, error.message, 'error');
        return;
      }
      const shown = showFieldErrors(form, error.details);
      setStatus(form, shown ? 'Revise os campos destacados.' : error.message, 'error');
      if (form === loginForm) form.password.value = '';
    } finally {
      button.disabled = false;
    }
  });
}

handleAuth(
  loginForm,
  '/customers/login',
  (f) => ({ email: f.email.value.trim(), password: f.password.value }),
  (f) => {
    const errs = [];
    if (!f.email.value.trim()) errs.push({ field: 'email', message: 'Informe o e-mail.' });
    if (!f.password.value) errs.push({ field: 'password', message: 'Informe a senha.' });
    return errs;
  }
);

function passwordIssues(pw, confirm) {
  const errs = [];
  if (pw.length < 10) errs.push({ field: 'password', message: 'A senha deve ter pelo menos 10 caracteres.' });
  else if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) errs.push({ field: 'password', message: 'A senha deve conter letras e números.' });
  if (!confirm) errs.push({ field: 'passwordConfirm', message: 'Confirme a senha.' });
  else if (pw !== confirm) errs.push({ field: 'passwordConfirm', message: 'As senhas não conferem.' });
  return errs;
}

handleAuth(
  registerForm,
  '/customers/register',
  (f) => ({
    name: f.name.value.trim(),
    email: f.email.value.trim(),
    phone: onlyDigits(f.phone.value),
    document: onlyDigits(f.document.value),
    password: f.password.value,
    passwordConfirm: f.passwordConfirm.value,
    birthDate: f.birthDate.value,
    acceptPrivacy: f.acceptPrivacy.checked,
    legalVersions: legalVersions(['terms_of_use', 'privacy']),
    marketingConsent: f.marketingConsent.checked
  }),
  (f) => {
    const errs = [];
    const name = f.name.value.trim();
    if (name.length < 3) errs.push({ field: 'name', message: 'Informe seu nome completo.' });
    else if (name.split(/\s+/).length < 2) errs.push({ field: 'name', message: 'Informe nome e sobrenome.' });
    if (!/^\S+@\S+\.\S+$/.test(f.email.value.trim())) errs.push({ field: 'email', message: 'Informe um e-mail válido.' });
    // Só maiores de 18 anos (o servidor confere de novo).
    const birth = f.birthDate.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) errs.push({ field: 'birthDate', message: 'Informe sua data de nascimento.' });
    else if (birth > adultLimit()) errs.push({ field: 'birthDate', message: 'É preciso ter 18 anos ou mais para criar uma conta.' });
    const phone = onlyDigits(f.phone.value);
    if (!phone) errs.push({ field: 'phone', message: 'Informe o telefone/WhatsApp.' });
    else if (phone.length < 10 || phone.length > 11) errs.push({ field: 'phone', message: 'Telefone inválido (inclua o DDD).' });
    if (!onlyDigits(f.document.value)) errs.push({ field: 'document', message: 'Informe o CPF.' });
    else if (!isValidCpf(f.document.value)) errs.push({ field: 'document', message: 'CPF inválido.' });
    errs.push(...passwordIssues(f.password.value, f.passwordConfirm.value));
    if (!f.acceptPrivacy.checked) errs.push({ field: 'acceptPrivacy', message: 'É necessário aceitar os Termos de Uso e a Política de Privacidade.' });
    return errs;
  }
);

// Esqueci minha senha
const FORGOT_LABEL = { email: 'e-mail', whatsapp: 'WhatsApp' };
function forgotCountdown(seconds) {
  const btn = forgotForm.querySelector('[data-forgot-resend]');
  clearInterval(forgotTimer);
  let left = seconds;
  btn.disabled = true;
  btn.textContent = `Reenviar código (${left}s)`;
  forgotTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(forgotTimer);
      btn.disabled = false;
      btn.textContent = 'Reenviar código';
    } else btn.textContent = `Reenviar código (${left}s)`;
  }, 1000);
}

async function requestForgotCode() {
  const email = forgotForm.email.value.trim();
  const channel = forgotForm.querySelector('input[name=channel]:checked')?.value;
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    forgotForm.querySelector('[data-forgot-step="request"]').hidden = false;
    forgotForm.querySelector('[data-forgot-step="reset"]').hidden = true;
    showFieldErrors(forgotForm, [{ field: 'email', message: 'Informe um e-mail válido.' }]);
    return;
  }
  const sendBtn = forgotForm.querySelector('[data-forgot-send]');
  sendBtn.disabled = true;
  setStatus(forgotForm, 'Enviando…');
  try {
    const { data } = await api('/customers/password/forgot', { method: 'POST', body: { email, channel } });
    showFieldErrors(forgotForm, []);
    setStatus(forgotForm, '');
    forgotForm.querySelector('[data-forgot-step="request"]').hidden = true;
    forgotForm.querySelector('[data-forgot-step="reset"]').hidden = false;
    forgotForm.querySelector('[data-forgot-sent]').textContent =
      `Se ${email} tiver uma conta na CAVAX, enviamos um código por ${FORGOT_LABEL[data.channel]}. Ele vale por ${data.expiresInMinutes} minutos. Não recebeu? Confira o spam ou peça pelo outro canal.`;
    forgotCountdown(data.resendInSeconds);
    forgotForm.code.focus();
  } catch (error) {
    const shown = showFieldErrors(forgotForm, error.details);
    setStatus(forgotForm, shown ? 'Revise os campos destacados.' : error.message, 'error');
  } finally {
    sendBtn.disabled = false;
  }
}
forgotForm.querySelector('[data-forgot-send]').addEventListener('click', requestForgotCode);
forgotForm.querySelector('[data-forgot-resend]').addEventListener('click', requestForgotCode);
forgotForm.querySelector('[data-forgot-change]').addEventListener('click', () => {
  forgotForm.querySelector('[data-forgot-step="request"]').hidden = false;
  forgotForm.querySelector('[data-forgot-step="reset"]').hidden = true;
  setStatus(forgotForm, '');
  forgotForm.email.focus();
});
forgotForm.email.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    requestForgotCode();
  }
});
forgotForm.code.addEventListener('input', () => (forgotForm.code.value = forgotForm.code.value.replace(/\D/g, '').slice(0, 6)));
forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (forgotForm.querySelector('[data-forgot-step="reset"]').hidden) return requestForgotCode();
  const errs = [];
  if (!/^\d{6}$/.test(forgotForm.code.value)) errs.push({ field: 'code', message: 'Digite o código de 6 números.' });
  errs.push(...passwordIssues(forgotForm.password.value, forgotForm.passwordConfirm.value));
  if (errs.length) {
    showFieldErrors(forgotForm, errs);
    return setStatus(forgotForm, 'Revise os campos destacados.', 'error');
  }
  const button = forgotForm.querySelector('button[type="submit"]');
  button.disabled = true;
  setStatus(forgotForm, 'Aguarde…');
  try {
    const email = forgotForm.email.value.trim();
    await api('/customers/password/reset', {
      method: 'POST',
      body: { email, code: forgotForm.code.value, password: forgotForm.password.value, passwordConfirm: forgotForm.passwordConfirm.value }
    });
    setAuthMode('login', { focus: false });
    clearForm(loginForm);
    loginForm.email.value = email;
    setStatus(loginForm, 'Senha redefinida! Entre com a nova senha. Por segurança, desconectamos sua conta de todos os aparelhos.', 'success');
    loginForm.password.focus();
  } catch (error) {
    const shown = showFieldErrors(forgotForm, error.details);
    setStatus(forgotForm, shown ? 'Revise os campos destacados.' : error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

// Ao voltar pelo botão "voltar" do navegador (cache de página), nada digitado fica na tela.
window.addEventListener('pageshow', (e) => {
  if (e.persisted && !me) clearAuthForms();
});

function showGuest() {
  me = null;
  dashboard = null;
  currentTicket = null;
  botContext = {};
  document.body.classList.remove('is-logged');
  window.dispatchEvent(new CustomEvent('cavax:account', { detail: null }));
  logged.hidden = true;
  guest.hidden = false;
  stopTicketPolling();
  clearInterval(resendTimer);
  // Nada da conta anterior fica na página (formulários, conversa com o assistente, dados).
  clearAuthForms();
  setAuthMode('login', { focus: false });
  ['profileForm', 'passwordForm'].forEach((id) => clearForm(document.getElementById(id)));
  const pwCode = document.querySelector('#passwordForm [data-step="code"]');
  if (pwCode) pwCode.hidden = true;
  if (botLog) botLog.innerHTML = '';
  updateEmailVerify(null);
  ['[data-customer-name]', '[data-customer-fullname]', '[data-customer-email]', '[data-customer-initials]', '[data-member-since]'].forEach((sel) => {
    const el = $(sel);
    if (el) el.textContent = '';
  });
  if (params.get('motivo') === 'checkout') $('[data-checkout-notice]').hidden = false;
  applyLinkState();
}

document.querySelector('[data-logout]')?.addEventListener('click', async () => {
  try {
    await api('/customers/logout', { method: 'POST', body: {} });
  } catch {
    /* a sessão local é encerrada mesmo se a rede falhar */
  } finally {
    setCsrf(null);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    showGuest();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

(async () => {
  try {
    const { data } = await api('/customers/me');
    if (data.customer) {
      setCsrf(data.csrfToken);
      showLogged(data.customer);
    } else showGuest();
  } catch {
    showGuest();
  }
})();
