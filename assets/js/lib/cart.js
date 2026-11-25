// Carrinho guardado no navegador: apenas IDs e quantidades.
// Preços e totais SEMPRE vêm do servidor (/api/v1/cart/validate).
import { emit } from './track.js';

const KEY = 'cavax_cart_v1';

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(data)
      ? data.filter((i) => Number.isInteger(i.productId) && i.productId > 0 && Number.isInteger(i.quantity) && i.quantity > 0).slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

function write(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* armazenamento indisponível (modo privado) */
  }
  document.dispatchEvent(new CustomEvent('cart:change', { detail: { items } }));
  scheduleServerSync(items);
}

// Cliente logado: o carrinho também é salvo na conta (retomar em outro aparelho e, se ele aceitou
// receber novidades, o lembrete de carrinho). Visitante sem login: nada vai para o servidor.
let syncTimer = null;
let syncFn = null;
export function enableServerSync(fn) {
  syncFn = fn;
}
function scheduleServerSync(items) {
  if (!syncFn) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncFn(items.map((i) => ({ productId: i.productId, quantity: i.quantity }))), 1500);
}

export const cart = {
  items: read,
  count() {
    return read().reduce((sum, item) => sum + item.quantity, 0);
  },
  add(productId, quantity = 1) {
    const items = read();
    const existing = items.find((i) => i.productId === productId);
    if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
    else items.push({ productId, quantity: Math.min(99, quantity) });
    write(items);
    emit('add_to_cart', { id: productId, qty: Math.min(99, Math.max(1, quantity)) });
  },
  set(productId, quantity) {
    let items = read();
    const before = items.find((i) => i.productId === productId)?.quantity || 0;
    const next = Math.max(0, Math.min(99, quantity));
    if (next < before) emit('remove_from_cart', { id: productId, qty: next });
    else if (next > before) emit('add_to_cart', { id: productId, qty: next - before });
    if (quantity <= 0) items = items.filter((i) => i.productId !== productId);
    else items.forEach((i) => {
      if (i.productId === productId) i.quantity = Math.min(99, quantity);
    });
    write(items);
  },
  /** Sincroniza com a resposta do servidor (remove indisponíveis, ajusta quantidades). */
  syncFrom(lines) {
    write(lines.map((l) => ({ productId: l.productId, quantity: l.quantity })));
  },
  clear() {
    write([]);
  }
};

export function updateBadge() {
  const count = cart.count();
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = count > 99 ? '99+' : String(count);
    el.hidden = count === 0;
  });
  document.querySelectorAll('.nav-cart').forEach((el) => el.setAttribute('aria-label', `Carrinho de compras (${count} ${count === 1 ? 'item' : 'itens'})`));
}
