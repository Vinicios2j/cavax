import { api, setCsrf, setStatus, toast, escapeHtml, formatBRL, productUrl, IS_STATIC } from './lib/api.js';

// Sessão do cliente (para o token CSRF das ações).
const ready = api('/customers/me')
  .then(({ data }) => setCsrf(data.csrfToken))
  .catch(() => {});

// ---------- Site estático: o pedido é montado no navegador (?c=código&t=token) ----------
function pixBlock(pix) {
  const expires = pix.expiresAt ? new Date(pix.expiresAt) : null;
  return `<section class="pix-box" aria-labelledby="pixTitle">
    <h2 id="pixTitle">Pague com PIX</h2>
    <ol class="pix-steps"><li>Abra o app do seu banco e escolha pagar com PIX.</li><li>Escaneie o QR Code ou cole o código abaixo.</li><li>Pronto! Esta página atualiza sozinha quando o pagamento for confirmado.</li></ol>
    <div class="pix-grid">
      ${pix.qrCodeImage && /^data:image\/(png|jpeg);base64,/.test(pix.qrCodeImage) ? `<img class="pix-qr" src="${escapeHtml(pix.qrCodeImage)}" alt="QR Code PIX para pagamento do pedido" width="220" height="220">` : ''}
      <div class="pix-code">
        <label for="pixCode">PIX copia e cola</label>
        <textarea id="pixCode" readonly rows="4">${escapeHtml(pix.qrCode)}</textarea>
        <button type="button" class="btn btn-primary" data-copy-pix>Copiar código PIX</button>
        ${expires ? `<p class="pix-expires">Válido até <strong>${expires.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</strong> de ${expires.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</p>` : ''}
        ${/^https:\/\//.test(pix.ticketUrl || '') ? `<a class="text-link" href="${escapeHtml(pix.ticketUrl)}" target="_blank" rel="noopener">Abrir no Mercado Pago ↗</a>` : ''}
      </div>
    </div>
  </section>`;
}

async function renderStaticOrder(root) {
  const qs = new URLSearchParams(location.search);
  const code = (qs.get('c') || '').trim().toUpperCase();
  const token = qs.get('t') || '';
  const paymentId = qs.get('payment_id') || qs.get('collection_id') || '';
  const title = document.querySelector('[data-order-title]');
  if (!/^[A-Z0-9-]{4,40}$/.test(code)) {
    title.textContent = 'Pedido não encontrado.';
    root.innerHTML = '<p><a class="btn btn-outline" href="/loja/">Voltar à loja</a></p>';
    return;
  }
  await ready;
  const q = new URLSearchParams();
  if (token) q.set('t', token);
  if (/^\d{1,20}$/.test(paymentId)) q.set('payment_id', paymentId);
  let order;
  let settings;
  try {
    [{ data: order }, { data: settings }] = await Promise.all([api(`/orders/${encodeURIComponent(code)}${q.toString() ? `?${q}` : ''}`), api('/site/settings')]);
  } catch (error) {
    title.textContent = error.status === 404 || error.status === 403 ? 'Pedido não encontrado.' : 'Não foi possível carregar o pedido.';
    root.innerHTML = `<p class="muted-line">${error.status === 404 || error.status === 403 ? 'Entre na sua conta para ver os seus pedidos.' : escapeHtml(error.message)}</p><p><a class="btn btn-outline" href="/conta/">Minha conta</a></p>`;
    return;
  }
  const paymentsEnabled = Boolean(settings.payments?.mercadoPago);
  const pending = order.status === 'pendente';
  const pix = order.pix;
  document.querySelector('[data-order-kicker]').textContent = `PEDIDO ${order.code}`;
  title.textContent = pending ? 'Pedido recebido!' : order.statusLabel;
  document.querySelector('[data-order-lead]').textContent = `Obrigado, ${String(order.customerName || '').split(' ')[0]}. Guarde o código ${order.code} para acompanhar seu pedido.`;
  document.title = `Pedido ${order.code} | CAVAX`;
  root.innerHTML = `
    <div class="order-status">
      <p><span class="status-pill status-${escapeHtml(order.status)}">${escapeHtml(order.statusLabel)}</span> <span class="status-pill">${escapeHtml(order.paymentLabel)}</span></p>
      ${paymentId && pending ? '<p class="notice">Estamos aguardando a confirmação do Mercado Pago. Esta página atualiza sozinha.</p>' : ''}
      <p class="muted-line">Forma de pagamento escolhida: <strong>${escapeHtml(order.paymentChoiceLabel)}</strong></p>
      ${pending && pix ? pixBlock(pix) : ''}
      ${pending && paymentsEnabled && !pix ? `<form data-pay-form data-code="${escapeHtml(order.code)}" data-token="${escapeHtml(token)}">
          <button class="btn btn-primary" type="submit">${order.paymentChoice === 'pix' ? 'Gerar PIX para pagamento' : 'Pagar agora com Mercado Pago'} <span aria-hidden="true">↗</span></button>
          <p class="form-status" role="status" aria-live="polite"></p>
        </form>` : ''}
      ${pending ? `<div data-order-poll data-code="${escapeHtml(order.code)}" data-token="${escapeHtml(token)}" hidden></div>` : ''}
      ${pending && !paymentsEnabled && !pix ? '<p class="notice notice-warning">O pagamento online ainda não está disponível. Nossa equipe entrará em contato pelo e-mail ou telefone informados para combinar o pagamento.</p>' : ''}
    </div>
    <table class="order-table">
      <caption class="sr-only">Itens do pedido ${escapeHtml(order.code)}</caption>
      <thead><tr><th scope="col">Produto</th><th scope="col">Qtd.</th><th scope="col">Unitário</th><th scope="col">Total</th></tr></thead>
      <tbody>${order.items
        .map((i) => `<tr><td>${i.slug ? `<a href="${productUrl(i.slug)}">${escapeHtml(i.name)}</a>` : escapeHtml(i.name)}<small>SKU ${escapeHtml(i.sku)}</small></td><td>${Number(i.quantity)}</td><td>${formatBRL(i.unitPriceCents)}</td><td>${formatBRL(i.totalCents)}</td></tr>`)
        .join('')}</tbody>
      <tfoot>
        <tr><th scope="row" colspan="3">Subtotal</th><td>${formatBRL(order.subtotalCents)}</td></tr>
        ${order.discountCents ? `<tr><th scope="row" colspan="3">Desconto PIX</th><td class="discount">− ${formatBRL(order.discountCents)}</td></tr>` : ''}
        <tr><th scope="row" colspan="3">Frete</th><td>${order.shippingMode === 'a_combinar' ? 'A combinar' : formatBRL(order.shippingCents)}</td></tr>
        <tr><th scope="row" colspan="3">Total</th><td><strong>${formatBRL(order.totalCents)}</strong></td></tr>
      </tfoot>
    </table>
    <p><a class="btn btn-outline" href="/loja/">Voltar à loja</a> <a class="text-link" href="/conta/">Minha conta</a></p>`;
}

function wire() {
  // Gerar PIX / ir para o Mercado Pago
  const form = document.querySelector('[data-pay-form]');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await ready;
    const button = form.querySelector('button');
    button.disabled = true;
    setStatus(form, 'Gerando pagamento…');
    try {
      const { data } = await api(`/orders/${encodeURIComponent(form.dataset.code)}/pay`, { method: 'POST', body: { t: form.dataset.token || undefined } });
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else window.location.reload();
    } catch (error) {
      button.disabled = false;
      setStatus(form, error.message, 'error');
    }
  });

  // Copiar código PIX
  document.querySelector('[data-copy-pix]')?.addEventListener('click', async () => {
    const field = document.getElementById('pixCode');
    try {
      await navigator.clipboard.writeText(field.value);
    } catch {
      field.select();
      document.execCommand('copy');
    }
    toast('Código PIX copiado! Cole no app do seu banco.');
  });

  // Acompanha o pagamento: quando o status mudar, recarrega a página.
  const poll = document.querySelector('[data-order-poll]');
  if (poll) {
    const qs = poll.dataset.token ? `?t=${encodeURIComponent(poll.dataset.token)}` : '';
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      if (tries > 120 || document.hidden) {
        if (tries > 120) clearInterval(timer);
        return;
      }
      try {
        const { data } = await api(`/orders/${encodeURIComponent(poll.dataset.code)}${qs}`);
        if (data.status !== 'pendente') {
          clearInterval(timer);
          window.location.reload();
        }
      } catch {
        /* tenta novamente no próximo ciclo */
      }
    }, 8000);
  }
}

const staticRoot = document.querySelector('[data-order-root]');
if (IS_STATIC && staticRoot) renderStaticOrder(staticRoot).then(wire);
else wire();
