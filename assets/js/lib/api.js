// Cliente HTTP da API pública. Cookies de sessão são HttpOnly; o token CSRF
// fica somente em memória (nunca em localStorage).
let csrfToken = null;

// Site estático (GitHub Pages): o endereço da API vem da <meta name="cavax-api">.
// Servido pelo próprio servidor, a API é o mesmo endereço (API_BASE vazio).
const apiMeta = typeof document !== 'undefined' ? document.querySelector('meta[name="cavax-api"]') : null;
export const API_BASE = (apiMeta?.content || '').replace(/\/$/, '');
export const IS_STATIC = Boolean(API_BASE);

export const apiUrl = (path) => `${API_BASE}/api/v1${path}`;

/** Imagens e vídeos enviados pelo painel ficam no servidor da API. */
export function assetUrl(url) {
  if (!url) return url;
  return IS_STATIC && String(url).startsWith('/uploads/') ? `${API_BASE}${url}` : url;
}

/** Link da página do produto (aceita slug ou "/loja/produto/slug"). */
export function productUrl(slugOrUrl) {
  const slug = String(slugOrUrl || '').replace(/^.*\/loja\/produto\//, '').replace(/[/?#].*$/, '');
  return IS_STATIC ? `/loja/produto/?p=${encodeURIComponent(slug)}` : `/loja/produto/${encodeURIComponent(slug)}`;
}

export function categoryUrl(slug) {
  return IS_STATIC ? `/loja/?categoria=${encodeURIComponent(slug)}` : `/loja/categoria/${encodeURIComponent(slug)}`;
}

/** Link da página do pedido (aceita código ou "/loja/pedido/CODIGO"). */
export function orderUrl(codeOrUrl, token) {
  const code = String(codeOrUrl || '').replace(/^.*\/loja\/pedido\//, '').replace(/[/?#].*$/, '');
  if (IS_STATIC) {
    const qs = new URLSearchParams({ c: code });
    if (token) qs.set('t', token);
    return `/loja/pedido/?${qs}`;
  }
  return `/loja/pedido/${encodeURIComponent(code)}${token ? `?t=${encodeURIComponent(token)}` : ''}`;
}

export function setCsrf(token) {
  csrfToken = token || null;
}

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message || 'Não foi possível concluir a operação.');
    this.status = status;
    this.code = payload?.error?.code;
    this.details = payload?.error?.details;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrfToken && method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  let response;
  try {
    response = await fetch(apiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: IS_STATIC ? 'include' : 'same-origin', mode: IS_STATIC ? 'cors' : 'same-origin' });
  } catch {
    throw new ApiError(0, { error: { message: 'Sem conexão. Verifique sua internet e tente novamente.' } });
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new ApiError(response.status, payload);
  return payload;
}

/** Exibe erros de validação ao lado de cada campo ([data-error-for]). */
export function showFieldErrors(form, details = []) {
  form.querySelectorAll('[data-error-for]').forEach((el) => {
    el.textContent = '';
  });
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  let first = null;
  for (const detail of details || []) {
    const key = detail.field || '';
    const target = form.querySelector(`[data-error-for="${CSS.escape(key)}"]`) || form.querySelector(`[data-error-for="${CSS.escape(key.split('.').pop())}"]`);
    if (target) {
      target.textContent = detail.message;
      const input = target.closest('.field')?.querySelector('input, select, textarea');
      if (input) {
        input.setAttribute('aria-invalid', 'true');
        first = first || input;
      }
    }
  }
  first?.focus();
  return Boolean(first);
}

export function setStatus(form, message, type = '') {
  const el = form.querySelector('.form-status');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('is-error', type === 'error');
  el.classList.toggle('is-success', type === 'success');
}

export function formatBRL(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function toast(message, link) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = `${escapeHtml(message)}${link ? ` <a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>` : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.hidden = true;
  }, 4500);
}
