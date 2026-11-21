import { api, formatBRL, escapeHtml, assetUrl, productUrl } from './lib/api.js';
import { cart } from './lib/cart.js';

const linesEl = document.querySelector('[data-cart-lines]');
const summaryEl = document.querySelector('[data-cart-summary]');
const checkoutLink = document.querySelector('[data-checkout-link]');

function renderSummary(data) {
  summaryEl.innerHTML = `
    <dt>Subtotal</dt><dd>${formatBRL(data.subtotalCents)}</dd>
    <dt>Frete</dt><dd>${data.shipping.mode === 'a_combinar' ? 'A combinar' : formatBRL(data.shipping.cents)}</dd>
    <dt class="total">Total</dt><dd class="total">${formatBRL(data.totalCents)}</dd>
    ${data.pix?.discountCents ? `<dt class="pix-hint">Pagando no PIX (-${data.pix.percent}%)</dt><dd class="pix-hint">${formatBRL(data.pix.totalCents)}</dd>` : ''}`;
}

function renderEmpty() {
  linesEl.innerHTML = `<div class="empty-state"><h2>Seu carrinho está vazio.</h2><p>Explore a loja e encontre a solução ideal para o seu negócio.</p><a class="btn btn-primary" href="/loja">Ir para a loja</a></div>`;
  summaryEl.innerHTML = '';
  checkoutLink.setAttribute('aria-disabled', 'true');
}

async function render() {
  const items = cart.items();
  if (!items.length) return renderEmpty();
  try {
    const { data } = await api('/cart/validate', { method: 'POST', body: { items } });
    cart.syncFrom(data.lines);
    if (!data.lines.length) {
      renderEmpty();
    } else {
      linesEl.innerHTML = `
        ${data.issues.length ? `<div class="notice notice-warning cart-issues" role="alert">${data.issues.map((i) => escapeHtml(i.message)).join('<br>')}</div>` : ''}
        ${data.lines
          .map(
            (line) => `<div class="cart-line">
          ${line.image ? `<img src="${escapeHtml(assetUrl(line.image.url))}" alt="" width="84" height="84" loading="lazy">` : '<span class="thumb" aria-hidden="true"></span>'}
          <div>
            <h3><a href="${productUrl(line.slug)}">${escapeHtml(line.name)}</a></h3>
            <small>${formatBRL(line.unitPriceCents)} cada${line.originalPriceCents ? ` · <s>${formatBRL(line.originalPriceCents)}</s>` : ''}</small>
            <div class="qty-control" role="group" aria-label="Quantidade de ${escapeHtml(line.name)}">
              <button type="button" data-step="-1" data-id="${line.productId}" aria-label="Diminuir">−</button>
              <input type="number" min="1" max="${Math.min(99, line.available)}" value="${line.quantity}" data-id="${line.productId}" aria-label="Quantidade">
              <button type="button" data-step="1" data-id="${line.productId}" aria-label="Aumentar"${line.quantity >= line.available ? ' disabled' : ''}>+</button>
            </div>
            <button type="button" class="remove" data-remove="${line.productId}">Remover</button>
          </div>
          <div class="line-total">${formatBRL(line.totalCents)}</div>
        </div>`
          )
          .join('')}`;
      renderSummary(data);
      checkoutLink.removeAttribute('aria-disabled');
    }
  } catch (error) {
    linesEl.innerHTML = `<div class="notice notice-warning" role="alert">${escapeHtml(error.message)}</div>`;
  }
}

linesEl.addEventListener('click', (event) => {
  const step = event.target.closest('[data-step]');
  const remove = event.target.closest('[data-remove]');
  if (step) {
    const id = Number(step.dataset.id);
    const current = cart.items().find((i) => i.productId === id)?.quantity || 0;
    cart.set(id, current + Number(step.dataset.step));
    render();
  } else if (remove) {
    cart.set(Number(remove.dataset.remove), 0);
    render();
  }
});
linesEl.addEventListener('change', (event) => {
  const input = event.target.closest('input[data-id]');
  if (!input) return;
  cart.set(Number(input.dataset.id), Math.max(1, Number.parseInt(input.value, 10) || 1));
  render();
});

render();
