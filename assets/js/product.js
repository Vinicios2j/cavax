import { cart } from './lib/cart.js';
import { toast } from './lib/api.js';
import { emit } from './lib/track.js';

// Produto desta página (para os eventos de analytics consentidos; só slug e id).
function productRef() {
  const slug = (location.pathname.match(/\/loja\/produto\/([a-z0-9-]{1,90})/) || [])[1] || new URLSearchParams(location.search).get('p') || '';
  return /^[a-z0-9-]{1,90}$/.test(slug) ? { product: slug } : {};
}
{
  const ref = productRef();
  const id = Number(document.querySelector('[data-add-form]')?.dataset.productId) || undefined;
  if (ref.product) emit('product_view', { ...ref, ...(id ? { id } : {}) });
}

// Galeria
const gallery = document.querySelector('[data-gallery]');
const main = gallery?.querySelector('[data-gallery-main]');
gallery?.querySelectorAll('.gallery-thumb').forEach((thumb) => {
  thumb.addEventListener('click', () => {
    if (!main) return;
    main.src = thumb.dataset.src;
    emit('image_open', { ...productRef(), idx: Math.min(50, [...gallery.querySelectorAll('.gallery-thumb')].indexOf(thumb)) });
    main.alt = thumb.dataset.alt;
    gallery.querySelectorAll('.gallery-thumb').forEach((t) => t.removeAttribute('aria-current'));
    thumb.setAttribute('aria-current', 'true');
  });
});

// Quantidade + adicionar ao carrinho
const form = document.querySelector('[data-add-form]');
if (form) {
  const input = form.querySelector('input[name="quantity"]');
  const max = Number(form.dataset.max) || 99;
  const clamp = (v) => Math.max(1, Math.min(max, Number.parseInt(v, 10) || 1));
  form.querySelectorAll('[data-qty]').forEach((btn) =>
    btn.addEventListener('click', () => {
      input.value = clamp(Number(input.value) + Number(btn.dataset.qty));
    })
  );
  input.addEventListener('change', () => {
    input.value = clamp(input.value);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    cart.add(Number(form.dataset.productId), clamp(input.value));
    toast(`"${form.dataset.name}" foi adicionado ao carrinho.`, { href: '/loja/carrinho/', label: 'Ver carrinho' });
  });
}
