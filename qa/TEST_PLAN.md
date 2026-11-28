# Plano de testes — Redesign premium CAVAX (cavax-site)

Data: 2026-11-28 · Escopo: somente `cavax-site` (site estático, GitHub Pages). `cavax-back` é somente leitura.

## Arquitetura mapeada
- HTML estático por rota (`/`, 4 páginas de serviço geradas por `scripts/seo/build_service_pages.py`, loja, conta, legais, 404).
- CSS: `assets/css/main.css` (sistema + home), `store.css` (loja/conta/legais), `services.css` (serviços).
- JS ES modules sem build: `main.js` (nav, formulário de contato, cookies, vídeos), scripts por página, `lib/api.js` (API em `https://api.cavax.com.br`).
- CSP rígida: `script-src 'self'; style-src 'self'` (sem style inline em atributos; CSSOM via JS permitido).
- Cache busting: `scripts/asset-versions.py` (`?v=<sha1>`).

## Riscos
- Quebrar ganchos de JS (ids, `data-*`, classes `form-status`, `field-error`, `reveal`, `open`, `scrolled`).
- Divergência entre páginas geradas e o gerador (rodar o gerador após mudar a home).
- Animações bloqueando leitura/cliques; custo de GPU; reduced-motion.
- Requisições reais à API durante os testes → todas interceptadas com mocks no Playwright.

## Testes
1. Build/consistência: `python3 scripts/asset-versions.py --check`, `python3 scripts/seo/audit.py`, `node --test scripts/seo/gsc-report.test.mjs`, `node --check` em todos os JS.
2. E2E (Playwright, API mockada): 15 rotas × 1440/390 — erros de console, overflow horizontal, capturas.
3. Responsividade: 320, 390, 768, 1024, 1440, 1920.
4. Formulário de contato: validação de erros por campo (mock 422), sucesso (mock 200), honeypot preservado, nenhum envio real.
5. Navegação: menu mobile (aria-expanded, Esc), skip link, foco visível, âncoras.
6. Acessibilidade: hierarquia de títulos, nomes acessíveis, contraste dos tokens, `prefers-reduced-motion`.
7. Desempenho: LCP/CLS medidos localmente no Chromium do Playwright (condições: localhost, sem throttling — reportado como tal).
8. Segurança: CSP inalterada, sem scripts/estilos inline novos, sem dependências novas, `cavax-back` intacto (`git status`).
