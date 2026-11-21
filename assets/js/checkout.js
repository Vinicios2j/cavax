import { api, setCsrf, formatBRL, escapeHtml, showFieldErrors, setStatus, orderUrl, IS_STATIC } from './lib/api.js';
import { cart } from './lib/cart.js';

const form = document.getElementById('checkoutForm');
const itemsEl = document.querySelector('[data-checkout-items]');
const summaryEl = document.querySelector('[data-cart-summary]');
const submit = form.querySelector('button[type="submit"]');

let lastCart = null;

/** Mostra o total conforme a forma de pagamento (PIX com desconto). O servidor recalcula ao criar o pedido. */
function renderTotals() {
  if (!lastCart) return;
  const pix = form.querySelector('input[name="paymentMethod"]:checked')?.value === 'pix';
  const discount = pix ? lastCart.pix.discountCents : 0;
  const total = pix ? lastCart.pix.totalCents : lastCart.totalCents;
  summaryEl.innerHTML = `<dt>Subtotal</dt><dd>${formatBRL(lastCart.subtotalCents)}</dd>
    ${discount ? `<dt>Desconto PIX (${lastCart.pix.percent}%)</dt><dd class="discount">− ${formatBRL(discount)}</dd>` : ''}
    <dt>Frete</dt><dd>${lastCart.shipping.mode === 'a_combinar' ? 'A combinar' : formatBRL(lastCart.shipping.cents)}</dd>
    <dt class="total">Total</dt><dd class="total">${formatBRL(total)}</dd>
    ${!pix && lastCart.pix.discountCents ? `<dt class="pix-hint">No PIX</dt><dd class="pix-hint">${formatBRL(lastCart.pix.totalCents)}</dd>` : ''}`;
}

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
    acceptTerms: form.acceptTerms.checked
  };
  submit.disabled = true;
  setStatus(form, 'Registrando seu pedido…');
  try {
    const { data } = await api('/orders', { method: 'POST', body: payload });
    cart.clear();
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

// Site estático: avisa se o pagamento online ainda não estiver ativo no servidor.
if (IS_STATIC) {
  api('/site/settings')
    .then(({ data }) => {
      const off = document.querySelector('[data-payments-off]');
      if (off) off.hidden = Boolean(data.payments?.mercadoPago);
    })
    .catch(() => {});
}
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
