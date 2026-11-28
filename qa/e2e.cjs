// Suíte E2E do site estático da CAVAX (Playwright + Chromium, API sempre mockada).
// Nenhuma requisição sai para a API real nem para terceiros: tudo fora de 127.0.0.1 é interceptado.
//
// Uso (na pasta cavax-site, com o site servido em 127.0.0.1:8090):
//   python3 -m http.server 8090 --bind 127.0.0.1 &
//   NODE_PATH=../cavax-back/node_modules node qa/e2e.cjs
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const PAGES = ['/', '/criacao-de-sites/', '/desenvolvimento-de-sistemas/', '/automacao-whatsapp/', '/cavax-atendimento/', '/loja/', '/loja/produto/?p=teste', '/loja/carrinho/', '/loja/checkout/', '/loja/pedido/?c=X', '/conta/', '/privacidade/', '/cookies/', '/termos-de-uso/', '/termos-de-compra/', '/trocas-e-devolucoes/', '/lgpd/', '/404.html'];
const WIDTHS = [320, 390, 768, 1024, 1440, 1920];

let pass = 0, fail = 0;
const failures = [];
const blocked = new Set();
const apiCalls = [];
function check(name, ok, detail = '') {
  if (ok) pass++;
  else { fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); }
}

async function newContext(browser, opts = {}, contactMode = { status: 200 }) {
  const ctx = await browser.newContext(opts);
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.hostname === '127.0.0.1') return route.continue();
    if (u.hostname === 'api.cavax.com.br') {
      apiCalls.push(`${req.method()} ${u.pathname}`);
      if (u.pathname.endsWith('/contact') && req.method() === 'POST') {
        contactMode.lastBody = req.postDataJSON();
        if (contactMode.status === 422) {
          return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Dados inválidos.', details: [{ field: 'name', message: 'Informe seu nome.' }, { field: 'email', message: 'Informe um e-mail válido.' }] } }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 1 } }) });
      }
      let data = u.pathname.endsWith('/customers/me') ? { customer: null } : u.pathname.endsWith('/site/settings') ? { analytics: { enabled: false } } : [];
      // Produto fictício (só quando o teste pede) para exercitar loja e carrinho sem dados reais.
      if (contactMode.products && u.pathname.endsWith('/products')) data = [{ id: 901, slug: 'produto-teste', name: 'Produto de teste', priceCents: 1990, inStock: true, category: null, image: null, shortDescription: 'Item fictício do teste automatizado.' }];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, meta: { total: 0, page: 1, totalPages: 1 } }) });
    }
    blocked.add(u.hostname);
    return route.abort();
  });
  return ctx;
}

async function open(ctx, path) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. Todas as páginas: console, overflow, semântica ----------
  for (const width of WIDTHS) {
    const ctx = await newContext(browser, { viewport: { width, height: 900 } });
    for (const path of PAGES) {
      if (width !== 390 && width !== 1440 && !['/', '/criacao-de-sites/', '/loja/', '/404.html'].includes(path)) continue;
      const { page, errors } = await open(ctx, path);
      check(`[${width}] ${path} sem erros de console`, errors.length === 0, errors.join(' | '));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`[${width}] ${path} sem overflow horizontal`, overflow <= 0, `${overflow}px`);
      if (width === 1440) {
        const sem = await page.evaluate(() => {
          const out = [];
          const hs = [...document.querySelectorAll('h1,h2,h3,h4')].filter((h) => h.offsetParent !== null);
          if (document.querySelectorAll('h1').length !== 1) out.push(`h1=${document.querySelectorAll('h1').length}`);
          let prev = 1;
          for (const h of hs) { const lvl = +h.tagName[1]; if (lvl > prev + 1) out.push(`salto ${h.tagName} "${h.textContent.trim().slice(0, 40)}"`); prev = lvl; }
          document.querySelectorAll('img:not([alt])').forEach((i) => out.push(`img sem alt ${i.src}`));
          document.querySelectorAll('a,button').forEach((el) => {
            if (el.closest('[hidden]') || el.offsetParent === null) return;
            const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
            if (!name) out.push(`controle sem nome ${el.outerHTML.slice(0, 80)}`);
          });
          const ids = {};
          document.querySelectorAll('[id]').forEach((el) => { ids[el.id] = (ids[el.id] || 0) + 1; });
          Object.entries(ids).filter(([, n]) => n > 1).forEach(([id]) => out.push(`id duplicado #${id}`));
          if (!document.documentElement.lang) out.push('sem lang');
          if (!document.querySelector('meta[name="description"]')?.content) out.push('sem description');
          return out;
        });
        check(`[sem] ${path} semântica (h1 único, ordem de títulos, alt, nomes, ids)`, sem.length === 0, sem.join('; '));
      }
      if (width === 390) {
        // Alvos de toque fora de texto corrido: ≥ 24px (WCAG 2.5.8); registra os < 44px como aviso.
        const small = await page.evaluate(() => [...document.querySelectorAll('a,button,input,select,textarea,summary')]
          .filter((el) => el.offsetParent !== null && !el.closest('p, li p, .legal-content, .field-check label, .cookie-inner p, .form-privacy, .breadcrumbs, .service-intro, .service-list, .faq-list p, .page-lead, .notice') && !el.matches('.hp-field *') && !(el.matches('input[type=checkbox],input[type=radio]') && (el.labels?.length)))
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.height < 24 || r.width < 24))
          .map(({ el, r }) => `${el.tagName.toLowerCase()}.${el.className || ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`));
        check(`[390] ${path} alvos de toque ≥ 24px`, small.length === 0, small.slice(0, 6).join('; '));
      }
      await page.close();
    }
    await ctx.close();
  }

  // ---------- 2. Contraste dos textos visíveis na home e numa página de serviço ----------
  {
    const ctx = await newContext(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    for (const path of ['/', '/automacao-whatsapp/', '/loja/', '/404.html']) {
      const { page } = await open(ctx, path);
      const low = await page.evaluate(() => {
        const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
        const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.length < 4 || c[3] > 0.5) return c; } return [10, 10, 10]; };
        const out = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        while (walker.nextNode()) {
          const el = walker.currentNode.parentElement;
          if (!el || seen.has(el) || !walker.currentNode.textContent.trim()) continue;
          seen.add(el);
          if (el.closest('[aria-hidden="true"],[hidden],.sr-only,svg,option,.skip-link')) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || +cs.opacity === 0 || el.offsetParent === null) continue;
          const fg = parse(cs.color); if (fg.length === 4 && fg[3] < 0.1) continue;
          const L1 = lum(fg), L2 = lum(bgOf(el));
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const size = parseFloat(cs.fontSize); const bold = +cs.fontWeight >= 700;
          const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
          if (ratio < need) out.push(`"${walker.currentNode.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1`);
        }
        return out;
      });
      check(`[contraste] ${path} textos ≥ AA`, low.length === 0, low.slice(0, 8).join('; '));
      await page.close();
    }
    await ctx.close();
  }

  // ---------- 3. Formulário de contato (mock): erros por campo, sucesso, honeypot, pré-seleção ----------
  {
    const mode = { status: 422 };
    const ctx = await newContext(browser, { viewport: { width: 1440, height: 900 } }, mode);
    const { page, errors } = await open(ctx, '/');
    await page.click('a.sol-more[data-servico="Automação e inteligência artificial"]');
    check('[form] link data-servico pré-seleciona o serviço', (await page.inputValue('#service')) === 'Automação e inteligência artificial');
    await page.check('#privacyConsent');
    await page.click('button[data-channel="site"]');
    await page.waitForSelector('#name[aria-invalid="true"]', { timeout: 3000 }).catch(() => {});
    check('[form] erro da API aparece sob o campo nome', (await page.textContent('#name-error')).includes('Informe seu nome'));
    check('[form] campo com erro recebe aria-invalid e foco', await page.evaluate(() => document.activeElement?.id === 'name' && document.getElementById('name').getAttribute('aria-invalid') === 'true'));
    check('[form] status de erro anunciado', (await page.textContent('.form-status')).length > 0);
    mode.status = 200;
    await page.fill('#name', 'Pessoa Teste');
    await page.fill('#email', 'teste@exemplo.invalid');
    await page.fill('#message', 'Mensagem fictícia de teste automatizado.');
    await page.click('button[data-channel="site"]');
    await page.waitForFunction(() => document.querySelector('.form-status')?.classList.contains('is-success'), null, { timeout: 3000 }).catch(() => {});
    check('[form] sucesso exibido após envio (mock)', await page.evaluate(() => document.querySelector('.form-status').classList.contains('is-success')));
    check('[form] payload mantém contrato (nome, e-mail, serviço, consentimento, honeypot)', mode.lastBody && mode.lastBody.name === 'Pessoa Teste' && mode.lastBody.privacyConsent === true && mode.lastBody.website === '' && 'service' in mode.lastBody, JSON.stringify(mode.lastBody));
    check('[form] formulário limpo após sucesso', (await page.inputValue('#name')) === '');
    // O 422 simulado gera o aviso de rede "Failed to load resource" (esperado); qualquer outro erro reprova.
    const realErrors = errors.filter((e) => !/status of 422/.test(e));
    check('[form] sem erros de console', realErrors.length === 0, realErrors.join(' | '));
    await ctx.close();
  }

  // ---------- 4. Navegação: skip link, menu mobile, Esc, diagrama ----------
  {
    const ctx = await newContext(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const { page } = await open(ctx, '/');
    await page.keyboard.press('Tab');
    const skip = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { cls: a.className, top: r.top, bottom: r.bottom }; });
    check('[nav] primeiro Tab foca o link "Pular para o conteúdo" visível', skip.cls === 'skip-link' && skip.top >= 0 && skip.bottom < 120, JSON.stringify(skip));
    await page.click('#menuToggle');
    check('[nav] menu abre com aria-expanded=true', (await page.getAttribute('#menuToggle', 'aria-expanded')) === 'true');
    check('[nav] links do menu visíveis', await page.isVisible('#navLinks a[href="/#solucoes"]'));
    await page.keyboard.press('Escape');
    check('[nav] Esc fecha o menu e devolve o foco ao botão', (await page.getAttribute('#menuToggle', 'aria-expanded')) === 'false' && (await page.evaluate(() => document.activeElement.id)) === 'menuToggle');
    await page.click('#menuToggle');
    await page.click('#navLinks a[href="/#metodo"]');
    check('[nav] clicar num link fecha o menu', (await page.getAttribute('#menuToggle', 'aria-expanded')) === 'false');
    await ctx.close();

    const desk = await newContext(browser, { viewport: { width: 1440, height: 900 } });
    const d = await open(desk, '/');
    await d.page.hover('.sol-item:nth-child(3)');
    await d.page.waitForTimeout(500);
    check('[diagrama] passar o mouse no serviço 3 muda o núcleo para "Automação"', (await d.page.textContent('.core-label')) === 'Automação');
    check('[diagrama] forma muda para fluxo', (await d.page.getAttribute('.diagram', 'data-shape')) === 'flow');
    await d.page.focus('.sol-item:nth-child(5) h3 a');
    await d.page.waitForTimeout(500);
    check('[diagrama] foco por teclado também troca o estado', (await d.page.textContent('.core-label')) === 'Proteção');
    check('[hero] cena montada após o carregamento', (await d.page.getAttribute('.hero-stage', 'data-scene')) === 'in');
    await desk.close();
  }

  // ---------- 5. prefers-reduced-motion: nada escondido, nada se move ----------
  {
    const ctx = await newContext(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const { page } = await open(ctx, '/');
    const r = await page.evaluate(() => ({
      ready: document.documentElement.classList.contains('motion-ready'),
      hidden: [...document.querySelectorAll('.reveal,.w')].filter((e) => +getComputedStyle(e).opacity < 1).length,
      anim: document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length
    }));
    check('[reduced-motion] nenhum conteúdo fica oculto', r.hidden === 0, JSON.stringify(r));
    check('[reduced-motion] nenhuma animação infinita rodando', r.anim === 0, JSON.stringify(r));
    await ctx.close();
  }

  // ---------- 5b. Jornadas completas (Rodada 2) ----------
  {
    const mode = { status: 200, products: true };
    const ctx = await newContext(browser, { viewport: { width: 1440, height: 900 } }, mode);
    const { page, errors } = await open(ctx, '/automacao-whatsapp/');
    await page.click('.service-hero .btn-primary');
    await page.waitForURL(/servico=/);
    await page.waitForLoadState('networkidle');
    check('[jornada] serviço → orçamento abre a home com o serviço pré-selecionado', (await page.inputValue('#service')) === 'Automação e inteligência artificial');
    await page.fill('#name', 'Pessoa Teste');
    await page.fill('#email', 'teste@exemplo.invalid');
    await page.check('#privacyConsent');
    await page.click('button[data-channel="site"]');
    await page.waitForFunction(() => document.querySelector('.form-status')?.classList.contains('is-success'), null, { timeout: 3000 }).catch(() => {});
    check('[jornada] envio do orçamento (mock) conclui com sucesso', await page.evaluate(() => document.querySelector('.form-status').classList.contains('is-success')));
    check('[jornada] serviço enviado no payload', mode.lastBody?.service === 'Automação e inteligência artificial', JSON.stringify(mode.lastBody));

    const loja = await open(ctx, '/loja/');
    await loja.page.waitForSelector('[data-add-to-cart="901"]', { timeout: 4000 }).catch(() => {});
    const hasCard = await loja.page.$('[data-add-to-cart="901"]');
    check('[jornada] catálogo renderiza o produto (mock)', Boolean(hasCard));
    if (hasCard) {
      await hasCard.click();
      check('[jornada] adicionar ao carrinho atualiza o contador', (await loja.page.textContent('[data-cart-count]')).trim() === '1');
      check('[jornada] aviso "adicionado ao carrinho" aparece', await loja.page.isVisible('#toast'));
    }
    const cart = await open(ctx, '/loja/carrinho/');
    await cart.page.waitForTimeout(800);
    check('[jornada] carrinho abre sem erros', cart.errors.length === 0, cart.errors.join(' | '));
    check('[jornada] sem erros de console nas jornadas', errors.length === 0 && loja.errors.length === 0, [...errors, ...loja.errors].join(' | '));
    await ctx.close();
  }

  // ---------- 6. Desempenho medido localmente (localhost, sem throttling) ----------
  for (const [label, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const ctx = await newContext(browser, { viewport: vp });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__lcp = 0; window.__cls = 0;
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__lcp = e.startTime; })).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.mouse.wheel(0, 2500); await page.waitForTimeout(800); await page.mouse.wheel(0, 2500); await page.waitForTimeout(800);
    const m = await page.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: +window.__cls.toFixed(4) }));
    console.log(`  métricas ${label}: LCP=${m.lcp}ms CLS=${m.cls}`);
    check(`[perf] ${label} LCP ≤ 2500ms (local)`, m.lcp <= 2500, `${m.lcp}ms`);
    check(`[perf] ${label} CLS ≤ 0.1`, m.cls <= 0.1, `${m.cls}`);
    await ctx.close();
  }

  await browser.close();
  check('[segurança] nenhuma requisição a terceiros além da API mockada', blocked.size === 0, [...blocked].join(', '));
  console.log(`\nChamadas à API (todas mockadas): ${apiCalls.length}`);
  console.log(`RESULTADO: ${pass} aprovados, ${fail} reprovados`);
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})();
