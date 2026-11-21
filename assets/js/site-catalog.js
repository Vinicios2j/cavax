// Loja do site estático: filtros, categorias, resultados e paginação a partir da API.
import { api, escapeHtml, categoryUrl } from './lib/api.js';
import { productCardHtml, setMeta } from './lib/render.js';

const form = document.querySelector('[data-filter-form]');
const results = document.querySelector('[data-results]');
const catNav = document.querySelector('[data-category-list]');
const params = new URLSearchParams(location.search);
const category = (params.get('categoria') || '').trim();

// Preenche o formulário com os filtros da URL.
for (const key of ['q', 'sort', 'minPrice', 'maxPrice']) if (params.get(key)) form.elements[key].value = params.get(key);
form.elements.inStock.checked = params.get('inStock') === '1';
form.elements.categoria.value = category;
if (!category) form.elements.categoria.disabled = true;
const filtered = ['q', 'minPrice', 'maxPrice', 'inStock'].some((k) => params.get(k)) || (params.get('sort') && params.get('sort') !== 'destaque');
document.querySelector('[data-clear-filters]').hidden = !filtered;
document.querySelector('[data-clear-filters]').href = category ? categoryUrl(category) : '/loja/';
// Campos vazios não vão para a URL.
form.addEventListener('submit', () => {
  for (const el of form.elements) if (el.name && !el.value && el.type !== 'checkbox') el.disabled = true;
});

const money = (v) => {
  const n = Number(String(v || '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '';
};

function pageLink(page) {
  const qs = new URLSearchParams(location.search);
  if (page > 1) qs.set('page', page);
  else qs.delete('page');
  const s = qs.toString();
  return `/loja/${s ? `?${s}` : ''}`;
}

function pagination(meta) {
  if (!meta || meta.totalPages <= 1) return '';
  const pages = [];
  for (let p = Math.max(1, meta.page - 2); p <= Math.min(meta.totalPages, meta.page + 2); p += 1) pages.push(p);
  return `<nav class="pagination" aria-label="Paginação">
    ${meta.page > 1 ? `<a href="${pageLink(meta.page - 1)}" rel="prev">← Anterior</a>` : ''}
    ${pages.map((p) => (p === meta.page ? `<span aria-current="page">${p}</span>` : `<a href="${pageLink(p)}">${p}</a>`)).join('')}
    ${meta.page < meta.totalPages ? `<a href="${pageLink(meta.page + 1)}" rel="next">Próxima →</a>` : ''}
  </nav>`;
}

async function loadCategories() {
  try {
    const { data } = await api('/categories');
    if (!data.length) return;
    const current = data.find((c) => c.slug === category);
    catNav.innerHTML = `<span class="footer-heading">CATEGORIAS</span>
      <a href="/loja/"${!category ? ' aria-current="page"' : ''}>Todas</a>
      ${data.map((c) => `<a href="${categoryUrl(c.slug)}"${c.slug === category ? ' aria-current="page"' : ''}>${escapeHtml(c.name)} <small>(${Number(c.productCount) || 0})</small></a>`).join('')}`;
    catNav.hidden = false;
    if (current) {
      document.querySelector('.page-hero h1').textContent = current.name;
      if (current.description) document.querySelector('.page-hero .page-lead').textContent = current.description;
      setMeta({ title: current.name, description: current.description, canonical: `${location.origin}${categoryUrl(current.slug)}` });
    }
  } catch {
    /* sem categorias */
  }
}

async function loadProducts() {
  const qs = new URLSearchParams();
  if (params.get('q')) qs.set('q', params.get('q').slice(0, 100));
  if (params.get('sort')) qs.set('sort', params.get('sort'));
  if (params.get('inStock') === '1') qs.set('inStock', 'true');
  if (money(params.get('minPrice'))) qs.set('minPrice', money(params.get('minPrice')));
  if (money(params.get('maxPrice'))) qs.set('maxPrice', money(params.get('maxPrice')));
  if (category) qs.set('category', category);
  qs.set('page', Math.max(1, Number.parseInt(params.get('page'), 10) || 1));
  qs.set('perPage', '12');
  try {
    const { data, meta } = await api(`/products?${qs}`);
    const count = `<p class="results-count" role="status">${meta.total} ${meta.total === 1 ? 'produto encontrado' : 'produtos encontrados'}</p>`;
    results.innerHTML = data.length
      ? `${count}<div class="product-grid">${data.map(productCardHtml).join('')}</div>${pagination(meta)}`
      : `${count}<div class="empty-state"><h2>Nenhum produto por aqui ainda.</h2>
          <p>${filtered ? 'Tente ajustar os filtros da busca.' : 'Novos produtos serão publicados em breve. Enquanto isso, fale com a equipe CAVAX sobre seu projeto.'}</p>
          <a class="btn btn-outline" href="${filtered ? '/loja/' : '/#contato'}">${filtered ? 'Limpar filtros' : 'Falar com a CAVAX'}</a></div>`;
  } catch (error) {
    results.innerHTML = `<div class="notice notice-warning" role="alert">${escapeHtml(error.message)}</div>`;
  }
}

loadCategories();
loadProducts();
