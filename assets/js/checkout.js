import { api, setCsrf, formatBRL, escapeHtml, showFieldErrors, setStatus, orderUrl, IS_STATIC } from './lib/api.js';
import { cart } from './lib/cart.js';
import { emit } from './lib/track.js';

const form = document.getElementById('checkoutForm');
const itemsEl = document.querySelector('[data-checkout-items]');
const summaryEl = document.querySelector('[data-cart-summary]');
const submit = form.querySelector('button[type="submit"]');

let lastCart = null;
// Cupom: o navegador só mostra a estimativa; o servidor valida dono, validade, uso único e recalcula.
let coupon = null; // { code, percent, discountCents }
const COUPON_KEY = 'cavax_coupon';

/** Mostra o total conforme a forma de pagamento (PIX com desconto). O servidor recalcula ao criar o pedido. */
function renderTotals() {
  if (!lastCart) return;
  const pix = form.querySelector('input[name="paymentMethod"]:checked')?.value === 'pix';
  const pixCents = pix ? lastCart.pix.discountCents : 0;
  const couponCents = coupon ? coupon.discountCents : 0;
  // Não acumulam: vale o maior (mesma regra do servidor).
  const useCoupon = couponCents > 0 && couponCents >= pixCents;
  const discount = useCoupon ? couponCents : pixCents;
  const shipping = lastCart.shipping.mode === 'a_combinar' ? 0 : lastCart.shipping.cents;
  const total = lastCart.subtotalCents - discount + shipping;
  summaryEl.innerHTML = `<dt>Subtotal</dt><dd>${formatBRL(lastCart.subtotalCents)}</dd>
    ${discount ? `<dt>${useCoupon ? `Cupom ${escapeHtml(coupon.code)} (${coupon.percent}%)` : `Desconto PIX (${lastCart.pix.percent}%)`}</dt><dd class="discount">− ${formatBRL(discount)}</dd>` : ''}
    <dt>Frete</dt><dd>${lastCart.shipping.mode === 'a_combinar' ? 'A combinar' : formatBRL(lastCart.shipping.cents)}</dd>
    <dt class="total">Total</dt><dd class="total">${formatBRL(total)}</dd>
    ${coupon && pix && !useCoupon ? `<dt class="pix-hint">Cupom</dt><dd class="pix-hint">não aplicado: o desconto do PIX é maior</dd>` : ''}
    ${!pix && !useCoupon && lastCart.pix.discountCents ? `<dt class="pix-hint">No PIX</dt><dd class="pix-hint">${formatBRL(lastCart.pix.totalCents)}</dd>` : ''}`;
}

// Campo de cupom (inserido aqui para servir às páginas do servidor e do site estático).
const couponBox = document.createElement('div');
couponBox.className = 'coupon-form';
couponBox.innerHTML = `<label for="couponCode">Cupom de desconto</label>
  <div class="coupon-row"><input id="couponCode" name="couponCode" maxlength="30" autocomplete="off" spellcheck="false" inputmode="latin" data-no-track>
  <button class="btn btn-outline" type="button" data-coupon-apply>Aplicar</button></div>
  <small class="coupon-status" aria-live="polite"></small>`;
summaryEl.insertAdjacentElement('afterend', couponBox);
const couponStatus = couponBox.querySelector('.coupon-status');
async function applyCoupon(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) {
    coupon = null;
    sessionStorage.removeItem(COUPON_KEY);
    couponStatus.textContent = '';
    renderTotals();
    return;
  }
  if (!/^[A-Z0-9-]{6,30}$/.test(clean)) {
    couponStatus.textContent = 'Cupom inválido.';
    return;
  }
  await sessionReady;
  try {
    const paymentMethod = form.querySelector('input[name="paymentMethod"]:checked')?.value || 'mercadopago';
    const { data } = await api('/customers/me/coupon/check', { method: 'POST', body: { code: clean, items: cart.items(), paymentMethod } });
    coupon = { code: data.code, percent: data.percent, discountCents: data.discountCents };
    sessionStorage.setItem(COUPON_KEY, data.code);
    couponStatus.textContent = `Cupom de ${data.percent}% válido até ${new Date(data.expiresAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Não acumula com o desconto do PIX: vale o maior.`;
  } catch (error) {
    coupon = null;
    sessionStorage.removeItem(COUPON_KEY);
    couponStatus.textContent = error.message;
  }
  renderTotals();
}
const couponInput = couponBox.querySelector('#couponCode');
couponBox.querySelector('[data-coupon-apply]').addEventListener('click', () => applyCoupon(couponInput.value));
couponInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault(); // não envia o formulário do pedido
  applyCoupon(couponInput.value);
});

async function loadSummary() {
  const items = cart.items();
  if (!items.length) {
    window.location.replace('/loja/carrinho/');
    return;
  }
  try {
    const { data } = await api('/cart/validate', { method: 'POST', body: { items } });
    cart.syncFrom(data.lines);
    if (!data.lines.length) {
      window.location.replace('/loja/carrinho/');
      return;
    }
    itemsEl.innerHTML = data.lines.map((l) => `<div><span>${l.quantity}× ${escapeHtml(l.name)}</span><span>${formatBRL(l.totalCents)}</span></div>`).join('');
    lastCart = data;
    renderTotals();
    emit('checkout_start', { items: Math.min(50, data.lines.length) });
    const saved = sessionStorage.getItem(COUPON_KEY);
    if (saved && !coupon) {
      couponInput.value = saved;
      applyCoupon(saved);
    }
    if (data.issues.length) setStatus(form, data.issues.map((i) => i.message).join(' '), 'error');
  } catch (error) {
    setStatus(form, error.message, 'error');
  }
}

// Cliente logado: obtém o token CSRF da sessão.
const sessionReady = api('/customers/me')
  .then(({ data }) => {
    if (!data.customer) {
      window.location.replace('/conta/?voltar=/loja/checkout/&motivo=checkout');
      return;
    }
    setCsrf(data.csrfToken);
    // Site estático: os dados da conta são preenchidos aqui (no servidor eles já vêm no HTML).
    if (IS_STATIC) {
      const c = data.customer;
      document.querySelector('[data-buyer-name]').textContent = c.name;
      document.querySelector('[data-buyer-email]').textContent = c.email;
      if (!form.name.value) form.name.value = c.name || '';
      if (!form.phone.value) form.phone.value = c.phone || '';
      if (!form.document.value) form.document.value = c.document || '';
      const email = document.getElementById('c-email');
      if (email) email.value = c.email;
    }
  })
  .catch(() => {});

// CPF obrigatório somente para PIX
const cpfHint = form.querySelector('[data-cpf-hint]');
function updateCpfHint() {
  const pix = form.querySelector('input[name="paymentMethod"]:checked')?.value === 'pix';
  form.document.required = pix;
  if (cpfHint) cpfHint.textContent = pix ? '(obrigatório para PIX)' : '(opcional, para nota fiscal)';
}
form.querySelectorAll('input[name="paymentMethod"]').forEach((r) =>
  r.addEventListener('change', () => {
    updateCpfHint();
    renderTotals();
  })
);
updateCpfHint();

// CEP: máscara + preenchimento automático pela ViaCEP (consultada pelo nosso servidor)
const cepStatus = document.getElementById('cep-status');
let lastCep = '';
form.zip?.addEventListener('input', async () => {
  const d = form.zip.value.replace(/\D/g, '').slice(0, 8);
  form.zip.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  if (d.length !== 8 || d === lastCep) return;
  lastCep = d;
  cepStatus.textContent = 'Buscando endereço…';
  try {
    const { data } = await api(`/cep/${d}`);
    if (data.street) form.street.value = data.street;
    if (data.district) form.district.value = data.district;
    form.city.value = data.city;
    form.state.value = data.state;
    if (!form.complement.value && data.complement) form.complement.placeholder = data.complement;
    cepStatus.textContent = `Endereço encontrado: ${[data.street, data.district, `${data.city}/${data.state}`].filter(Boolean).join(', ')}. Informe o número.`;
    (data.street ? form.number : form.street).focus();
  } catch (error) {
    cepStatus.textContent = error.status === 404 ? 'CEP não encontrado. Confira o número ou preencha o endereço manualmente.' : error.message;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await sessionReady;
  const f = Object.fromEntries(new FormData(form));
  const hasAddress = form.dataset.needsAddress === '1' || [f.zip, f.street, f.number, f.city].some((v) => v && v.trim());
  const payload = {
    items: cart.items(),
    customer: { name: f.name, phone: f.phone, document: f.document || null },
    address: hasAddress
      ? { zip: f.zip || '', street: f.street || '', number: f.number || '', complement: f.complement || null, district: f.district || '', city: f.city || '', state: f.state || '' }
      : null,
    paymentMethod: f.paymentMethod || '',
    notes: f.notes || null,
    couponCode: coupon ? coupon.code : null,
    acceptTerms: form.acceptTerms.checked
  };
  submit.disabled = true;
  setStatus(form, 'Registrando seu pedido…');
  try {
    const { data } = await api('/orders', { method: 'POST', body: payload });
    cart.clear();
    sessionStorage.removeItem(COUPON_KEY);
    if (data.payment?.checkoutUrl) {
      setStatus(form, 'Pedido criado! Redirecionando para o pagamento seguro…', 'success');
      window.location.href = data.payment.checkoutUrl;
    } else {
      // PIX: o QR Code é exibido na página do pedido.
      setStatus(form, 'Pedido criado! Abrindo o pagamento…', 'success');
      window.location.href = orderUrl(data.orderUrl || data.code);
    }
  } catch (error) {
    submit.disabled = false;
    if (error.status === 401) {
      window.location.href = '/conta/?voltar=/loja/checkout/&motivo=checkout';
      return;
    }
    if (error.code === 'CONFLICT' && Array.isArray(error.details)) {
      setStatus(form, `${error.message} ${error.details.map((d) => d.message).join(' ')}`, 'error');
      loadSummary();
      return;
    }
    const shown = showFieldErrors(form, error.details);
    setStatus(form, shown ? 'Revise os campos destacados.' : error.message, 'error');
  }
});

loadSummary();

// Site estático: avisa se o pagamento online ainda não estiver ativo no servidor.
if (IS_STATIC) {
  api('/site/settings')
    .then(({ data }) => {
      const off = document.querySelector('[data-payments-off]');
      if (off) off.hidden = Boolean(data.payments?.mercadoPago);
    })
    .catch(() => {});
}
