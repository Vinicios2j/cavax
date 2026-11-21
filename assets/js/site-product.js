// Página do produto no site estático: /loja/produto/?p=slug, carregada da API.
import { api, escapeHtml, assetUrl, categoryUrl } from './lib/api.js';
import { priceHtml, breadcrumbsHtml, setMeta, errorBox } from './lib/render.js';

const root = document.querySelector('[data-product-root]');
const slug = (new URLSearchParams(location.search).get('p') || '').trim().toLowerCase();

const DELIVERY_ICON = { digital: '⚡', servico: '🛠️' };

function render(p) {
  const images = (p.images || []).map((img) => ({ ...img, url: assetUrl(img.url) }));
  const crumbs = [{ name: 'Início', path: '/' }, { name: 'Loja', path: '/loja/' }];
  if (p.category) crumbs.push({ name: p.category.name, path: categoryUrl(p.category.slug) });
  crumbs.push({ name: p.name, path: location.pathname + location.search });
  const max = Math.min(99, Number(p.stock) || 0);
  root.innerHTML = `
    ${breadcrumbsHtml(crumbs)}
    <div class="product-detail">
      <div class="gallery" data-gallery>
        <div class="gallery-main">
          ${images.length
            ? `<img src="${escapeHtml(images[0].url)}" alt="${escapeHtml(images[0].alt || p.name)}" width="${Number(images[0].width) || 800}" height="${Number(images[0].height) || 800}" data-gallery-main fetchpriority="high">`
            : '<span class="product-placeholder large">CAVAX</span>'}
        </div>
        ${images.length > 1 ? `<div class="gallery-thumbs" role="list">${images
          .map((img, i) => `<button type="button" role="listitem" class="gallery-thumb" data-src="${escapeHtml(img.url)}" data-alt="${escapeHtml(img.alt || '')}" aria-label="Ver imagem ${i + 1} de ${images.length}"${i === 0 ? ' aria-current="true"' : ''}><img src="${escapeHtml(img.url)}" alt="" loading="lazy" width="96" height="96"></button>`)
          .join('')}</div>` : ''}
      </div>
      <div class="product-info">
        ${p.category ? `<a class="product-category" href="${categoryUrl(p.category.slug)}">${escapeHtml(p.category.name)}</a>` : ''}
        <h1>${escapeHtml(p.name)}</h1>
        <p class="product-sku">SKU: ${escapeHtml(p.sku)}</p>
        ${priceHtml(p)}
        ${p.shortDescription ? `<p class="product-lead">${escapeHtml(p.shortDescription)}</p>` : ''}
        <p class="availability ${p.inStock ? 'in' : 'out'}">${p.inStock ? (p.stock <= 5 ? `Disponível — últimas ${Number(p.stock)} unidade(s)` : 'Disponível em estoque') : 'Esgotado no momento'}</p>
        ${p.inStock ? `<form class="add-form" data-add-form data-product-id="${Number(p.id)}" data-name="${escapeHtml(p.name)}" data-max="${max}">
          <div class="qty"><label for="qty">Quantidade</label>
            <div class="qty-control"><button type="button" data-qty="-1" aria-label="Diminuir quantidade">−</button><input id="qty" name="quantity" type="number" inputmode="numeric" min="1" max="${max}" value="1"><button type="button" data-qty="1" aria-label="Aumentar quantidade">+</button></div>
          </div>
          <button class="btn btn-primary" type="submit">Adicionar ao carrinho <span aria-hidden="true">↗</span></button>
        </form>` : '<a class="btn btn-outline" href="/#contato">Avise-me / falar com a equipe</a>'}
        ${p.deliveryInfo ? `<p class="delivery-info"><span aria-hidden="true">${DELIVERY_ICON[p.productType] || '📦'}</span> ${escapeHtml(p.deliveryInfo)}</p>` : ''}
        <p class="product-note">O preço e a disponibilidade são confirmados no momento do pedido.</p>
      </div>
    </div>
    ${p.description ? `<section class="product-description" aria-labelledby="descTitle"><h2 id="descTitle">Descrição</h2>${p.description
      .split(/\n{2,}/)
      .map((par) => `<p>${escapeHtml(par)}</p>`)
      .join('')}</section>` : ''}`;
  setMeta({
    title: p.seoTitle || p.name,
    description: (p.seoDescription || p.shortDescription || `${p.name} — Loja CAVAX`).slice(0, 160),
    canonical: `${location.origin}/loja/produto/?p=${encodeURIComponent(p.slug)}`
  });
}

async function load() {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) {
    root.innerHTML = errorBox('Produto não encontrado.');
    return;
  }
  try {
    const { data } = await api(`/products/${slug}`);
    render(data);
    // Galeria e "adicionar ao carrinho" (mesmo script das páginas do servidor).
    await import('./product.js');
  } catch (error) {
    root.innerHTML = errorBox(error.status === 404 ? 'Produto não encontrado.' : error.message);
    document.title = 'Produto não encontrado | CAVAX';
  }
}

load();
