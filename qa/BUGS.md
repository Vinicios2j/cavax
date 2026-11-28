# Registro de bugs — cavax-site (redesign 2026-11-28)

Todos encontrados durante o redesign, reproduzidos com Playwright (API mockada) ou leitura de código.
Os itens marcados como "preexistente" já existiam antes desta alteração.

| ID | Título | Gravidade | Arquivo | Causa raiz | Correção | Reteste | Status |
|---|---|---|---|---|---|---|---|
| BUG-001 | Páginas de serviço carregavam `services.css` duas vezes (preexistente) | Baixa | scripts/seo/build_service_pages.py:267 | `HEAD_COMMON` (copiado da home) já trazia o CSS e o template adicionava de novo | Removida a segunda inclusão | `grep -c services.css` = 1 em cada página | Corrigido |
| BUG-002 | Conteúdo `.reveal` ficava invisível se o JS falhasse (preexistente) | Média | assets/css/main.css (antigo `.reveal{opacity:0}`) | Ocultação aplicada sem depender do JS | Oculta só sob `html.motion-ready`, adicionada pelo JS depois de marcar o que já está na tela | E2E reduced-motion: 0 elementos ocultos | Corrigido |
| BUG-003 | Alvos de toque de 22–24px (links "Solicitar projeto", "Esqueci minha senha", "Continuar comprando") | Média (WCAG 2.5.8) | assets/css/main.css (`.sol-more`, `.text-link`) | Links inline sem altura mínima | `min-height:32px` | E2E `[390] alvos de toque ≥ 24px` aprovado em 18 rotas | Corrigido |
| BUG-004 | Skip link animava ao receber foco e o teste o encontrava fora da tela | Baixa | assets/css/main.css (`.skip-link`) | Transição de 200ms numa ação de teclado | Transição removida (aparece instantaneamente) | E2E `[nav] primeiro Tab…` aprovado | Corrigido |
| BUG-005 | Rótulo do nó lateral do diagrama sobrepunha o núcleo ("Passagem para humano") | Baixa (visual) | assets/js/lib/motion.js, build_service_pages.py | Rótulo dos nós laterais na mesma altura do núcleo | Rótulo lateral sobe para fora da área do núcleo | Captura 1440 conferida | Corrigido |
| BUG-006 | `prefers-reduced-motion` zerava todas as transições (inclusive retorno de cor/opacidade) (preexistente) | Baixa | assets/css/main.css:576 | Regra global `transition-duration:.01ms` | Remove só deslocamento e animações contínuas | E2E reduced-motion aprovado | Corrigido |
| BUG-007 | Rodapé com textos diferentes entre páginas (preexistente) | Baixa | páginas legais/loja | Cópias manuais do rodapé | Rodapé unificado a partir da home | Inspeção das 18 páginas | Corrigido |

Pendências conhecidas (não são regressões): ver FINAL_REPORT.md, "Limitações".
