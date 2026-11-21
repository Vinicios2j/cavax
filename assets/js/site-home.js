// Página inicial do site estático: produtos em destaque e portfólio carregados da API (sempre atualizados).
import { api, escapeHtml, assetUrl } from './lib/api.js';
import { productCardHtml, reveal } from './lib/render.js';

const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

function portfolioCard(p) {
  const img = p.imageUrl
    ? `<img src="${escapeHtml(assetUrl(p.imageUrl))}" alt="Projeto ${escapeHtml(p.title || '')} — ${escapeHtml(p.client)}" loading="lazy" decoding="async">`
    : `<span class="portfolio-initial" aria-hidden="true">${escapeHtml(p.client.slice(0, 1).toUpperCase())}</span>`;
  const link = /^https:\/\//.test(p.linkUrl || '')
    ? `<a class="portfolio-link" href="${escapeHtml(p.linkUrl)}" target="_blank" rel="noopener noreferrer">Visitar ${escapeHtml(host(p.linkUrl) || 'projeto')} <span aria-hidden="true">↗</span></a>`
    : '';
  return `<article class="portfolio-card reveal">
    <div class="portfolio-media">${img}${p.category ? `<span class="portfolio-tag">${escapeHtml(p.category)}</span>` : ''}</div>
    <div class="portfolio-body">
      <span class="portfolio-client">${escapeHtml(p.client)}${p.year ? ` <small>· ${escapeHtml(p.year)}</small>` : ''}</span>
      ${p.title ? `<h3>${escapeHtml(p.title)}</h3>` : ''}
      ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ''}
      ${link}
    </div>
  </article>`;
}

async function loadPortfolio() {
  const section = document.querySelector('[data-dynamic="portfolio"]');
  if (!section) return;
  try {
    const { data } = await api('/portfolio');
    if (!data.length) return;
    section.querySelector('[data-portfolio-grid]').innerHTML = data.map(portfolioCard).join('');
    section.hidden = false;
    document.querySelectorAll('[data-portfolio-link]').forEach((a) => (a.hidden = false));
    reveal(section);
    if (location.hash === '#portfolio') section.scrollIntoView();
  } catch {
    /* sem portfólio: a seção continua escondida */
  }
}

async function loadFeatured() {
  const section = document.querySelector('[data-dynamic="featured"]');
  if (!section) return;
  try {
    const { data } = await api('/products?featured=true&perPage=4&sort=destaque');
    if (!data.length) return;
    section.querySelector('[data-featured-grid]').innerHTML = data.map(productCardHtml).join('');
    section.hidden = false;
    reveal(section);
  } catch {
    /* sem destaques */
  }
}

loadPortfolio();
loadFeatured();
