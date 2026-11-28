# Histórico de testes

## 2026-11-28 — Baseline (antes do redesign)
- Capturas 15 rotas × 1440/390 com API mockada: 0 erros de console, 0 overflow horizontal.
- `scripts/seo/audit.py`: 0 erros, 3 avisos (preexistentes). `asset-versions.py --check`: OK. `gsc-report.test.mjs`: 6/6. `node --check` em todos os JS: OK.

## 2026-11-28 — Durante o desenvolvimento
- Capturas por seção após cada etapa (home, serviços, loja/conta/404) em 1440, 1024, 768 e 390.
- 1ª execução de `qa/e2e.cjs`: 161 aprovados, 7 reprovados (BUG-003, BUG-004 e 1 falso positivo de console no 422 simulado, ajustado no teste com justificativa).
- 2ª execução: 168/168.

## 2026-11-28 — Validação final
- Rodada 1 (funcionalidades): `qa/e2e.cjs` seções 1–5.
- Rodada 2 (jornadas): serviço → orçamento → envio (mock); loja → adicionar ao carrinho → carrinho. **176 aprovados, 0 reprovados.**
- Rodada 3 (segurança/build/regressão): SEO 0 erros/3 avisos preexistentes; versões de cache OK; 6/6 testes; JS válido; nenhum `style=""` inline; CSP idêntica ao commit anterior em todas as páginas; `cavax-back` sem alterações (`git status` vazio, HEAD a2129df); nenhuma requisição a terceiros.
- Métricas locais (localhost, Chromium headless, sem throttling): LCP desktop 120ms / mobile 108ms; CLS 0,0072 / 0,0016.
