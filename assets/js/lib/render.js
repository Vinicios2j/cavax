// Componentes do site montados no navegador (mesma marcação das páginas geradas no servidor).
import { escapeHtml, formatBRL, assetUrl, productUrl, categoryUrl } from './api.js';

export function priceHtml(p) {
  return `<div class="price">
    ${p.onSale ? `<s class="price-old"><span class="sr-only">De </span>${formatBRL(p.originalPriceCents)}</s>` : ''}
    <strong class="price-now">${p.onSale ? '<span class="sr-only">Por </span>' : ''}${formatBRL(p.priceCents)}</strong>
    ${p.pixPriceCents ? `<span class="price-pix">${formatBRL(p.pixPriceCents)} no PIX <small>(-${escapeHtml(p.pixDiscountPercent)}%)</small></span>` : ''}
  </div>`;
}

export function productCardHtml(p) {
  const url = productUrl(p.slug);
  return `<article class="product-card">
    <a class="product-media" href="${url}" tabindex="-1" aria-hidden="true">
      ${p.image ? `<img src="${escapeHtml(assetUrl(p.image.url))}" alt="" loading="lazy" decoding="async" width="600" height="600">` : '<span class="product-placeholder">CAVAX</span>'}
      ${p.onSale ? '<span class="badge badge-sale">Promoção</span>' : ''}
      ${!p.inStock ? '<span class="badge badge-out">Esgotado</span>' : ''}
    </a>
    <div class="product-body">
      ${p.category ? `<a class="product-category" href="${categoryUrl(p.category.slug)}">${escapeHtml(p.category.name)}</a>` : ''}
      <h3 class="product-title"><a href="${url}">${escapeHtml(p.name)}</a></h3>
      ${p.shortDescription ? `<p class="product-excerpt">${escapeHtml(p.shortDescription)}</p>` : ''}
      <div class="product-foot">
        ${priceHtml(p)}
        ${p.inStock
          ? `<button type="button" class="btn btn-primary btn-small" data-add-to-cart="${Number(p.id)}" data-name="${escapeHtml(p.name)}">Adicionar <span aria-hidden="true">+</span></button>`
          : '<span class="stock-out">Indisponível</span>'}
      </div>
    </div>
  </article>`;
}

export function breadcrumbsHtml(items) {
  return `<nav class="breadcrumbs" aria-label="Você está em"><ol>${items
    .map((it, i) => (i === items.length - 1 ? `<li aria-current="page">${escapeHtml(it.name)}</li>` : `<li><a href="${escapeHtml(it.path)}">${escapeHtml(it.name)}</a></li>`))
    .join('')}</ol></nav>`;
}

/** Atualiza título, descrição e canonical (SEO das páginas montadas no navegador). */
export function setMeta({ title, description, canonical }) {
  if (title) document.title = title.includes('CAVAX') ? title : `${title} | CAVAX`;
  if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  if (canonical) document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical);
}

export function errorBox(message, link = { href: '/loja/', label: 'Voltar à loja' }) {
  return `<div class="empty-state"><h2>${escapeHtml(message)}</h2><a class="btn btn-outline" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></div>`;
}

/** Ativa a animação de entrada dos elementos recém-inseridos. */
export function reveal(root) {
  root.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible', 'visible', 'in'));
}
