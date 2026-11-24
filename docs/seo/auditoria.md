# Auditoria SEO inicial — cavax.com.br

- **Data:** 24/11/2026
- **Base:** commit `2c75d4e` ("Update index.html"), branch `main` do repositório `Vinicios2j/cavax`
- **Método:** leitura do código estático e uma consulta à página inicial publicada (o conteúdo bate com o repositório)
- **Sem dados do Search Console ainda:** a conexão depende de uma ação do proprietário (veja [integracao-search-console.md](integracao-search-console.md))
- **Legenda:** **[comprovado]** = verificado nos arquivos ou no site; **[hipótese]** = precisa de dados para confirmar

## 1. Situação inicial (antes das mudanças)

### Arquitetura
- O site público é estático e fica no GitHub Pages (`CNAME` = `cavax.com.br`). API, painel e loja dinâmica ficam em `api.cavax.com.br` (Square Cloud). **[comprovado]**
- As páginas são pastas com `index.html`, e o GitHub Pages as serve com barra final (`/privacidade/`). **[comprovado]**
- O HTML do site é gerado pelo servidor (`cavax-back/src/services/static-site.service.js`). O botão do painel "Publicar no GitHub" cria um commit com uma árvore nova, sem `base_tree`, e por isso **apaga do repositório todo arquivo que não foi gerado por ele**. Isso inclui as edições manuais da home, as páginas novas, `docs/`, `.claude/` e as imagens enviadas direto ao repositório. **[comprovado no código]**
- A home (`index.html`) recebeu edições manuais do proprietário (título, H1, FAQ e vídeo do YouTube), que não existem nas views do servidor. **[comprovado]**
- Não existe `.nojekyll`, então o GitHub Pages processa o site com Jekyll. Arquivos `.md` soltos virariam páginas públicas. **[comprovado]**

### Indexação
| Item | Situação | Status |
|---|---|---|
| Home: title, description, canonical, H1 | Bons e com intenção comercial ("Criação de Sites, Sistemas e Automações") | [comprovado] OK |
| Canonical das 6 páginas legais | Apontava para a URL **sem** barra (`/privacidade`), que redireciona; o sitemap e os links usam a versão **com** barra | [comprovado] **corrigido** |
| `og:url` e BreadcrumbList das páginas legais | Mesmo problema do canonical | [comprovado] **corrigido** |
| `sitemap.xml` | Tinha 8 URLs válidas, mas nenhuma página de serviço (não existiam) | [comprovado] **atualizado** |
| `robots.txt` | Bloqueava `/conta/` e `/loja/carrinho/`, que têm `noindex`: o Google não conseguia ler o noindex | [comprovado] **ajustado** |
| Páginas privadas | Conta, carrinho, checkout, pedido e 404 com `noindex, follow` | [comprovado] OK |
| `/loja/produto/` | Tem canonical fixo `/loja/produto/` para todos os produtos (`?p=slug`), sem H1 no HTML inicial; o conteúdo, o título e o canonical são trocados por JavaScript | [comprovado] risco: produtos podem não ser indexados individualmente — **pendente** |
| Descriptions curtas | `/lgpd/` (47), `/termos-de-uso/` (36), `/termos-de-compra/` (58), `/loja/` (50 caracteres) | [comprovado] baixa prioridade |
| JSON-LD | Organization, WebSite e WebPage na home; BreadcrumbList nas legais; todos válidos e sem avaliações inventadas | [comprovado] OK |
| Imagens | Todas com `alt`, `width` e `height` | [comprovado] OK |
| Links internos | Sem links quebrados. O único "quebrado" é o export de dados da conta, que o JavaScript reescreve para a API | [comprovado] OK |

### Conteúdo e intenção
- Os serviços apareciam só como cards na home, com link para `#contato`. **Não havia nenhuma página dedicada a um serviço**, o que limita o site a competir por uma única URL (a home) em várias buscas diferentes. **[comprovado]**
- O FAQ da home é útil, mas fica concentrado em uma só página. **[comprovado]**
- O CAVAX Atendimento era citado na home como "em desenvolvimento", sem página própria. **[comprovado]**

### Desempenho, privacidade e segurança
- O CSP está declarado via `<meta>` em todas as páginas, com `script-src 'self'`. **[comprovado]** Foi mantido intacto.
- O **vídeo do YouTube na home** é um `<iframe>` com `autoplay=1` (e `loading="lazy"`). Isso carrega o player do YouTube assim que a seção aparece na tela. **[hipótese]** Pode afetar o desempenho em celulares e conflitar com a política de cookies, porque o modo `nocookie` reduz o rastreamento, mas não o elimina na reprodução. Sugestão: voltar ao "carregar ao clicar", que o `main.js` já suporta (`data-youtube-id`). **Não foi alterado**, porque é uma decisão do proprietário.
- Fontes do Google carregadas de domínio externo. **[hipótese]** Têm impacto pequeno no LCP.
- Core Web Vitals: **sem dados de campo**. Confirme no relatório "Principais métricas da Web" do Search Console quando houver tráfego.

## 2. O que foi feito nesta etapa

1. **Quatro páginas comerciais**, cada uma com title, description, H1, canonical com barra, BreadcrumbList e `Service` ou `WebPage` próprios:
   - `/criacao-de-sites/`
   - `/automacao-whatsapp/`
   - `/desenvolvimento-de-sistemas/`
   - `/cavax-atendimento/`, marcada como "em desenvolvimento", sem vender recurso inexistente
2. **Links internos rastreáveis:** os cards da home levam às páginas, a seção de produtos leva ao CAVAX Atendimento, e todas as páginas ganharam uma coluna "Serviços" no rodapé. As páginas de serviço também se ligam entre si.
3. **Conversão:** os CTAs abrem o formulário da home já com o serviço certo (`/?servico=...#contato`), além do WhatsApp oficial com mensagem pré-preenchida.
4. **Correções técnicas:** canonical, `og:url` e breadcrumb das páginas legais; `sitemap.xml` com as URLs canônicas; `robots.txt` liberando as páginas com noindex.
5. **Pastas internas fora do ar:** `_config.yml` exclui `docs/`, `scripts/` e `reports/` da publicação, e o `.gitignore` bloqueia credenciais e relatórios.
6. **Ferramentas:**
   - `scripts/seo/audit.py`: auditoria local
   - `scripts/seo/build_service_pages.py` e `pages.py`: gerador das páginas a partir do cabeçalho e rodapé da home
   - `scripts/seo/gsc-report.mjs`: relatório somente leitura do Search Console

## 3. Resultado da auditoria local após as mudanças

```
python3 scripts/seo/audit.py
Páginas HTML analisadas: 18 | URLs no sitemap: 12
ERROS (1)   /loja/produto/ sem H1 no HTML inicial (montado por JS) — pendente, ver plano
AVISOS (7)  4 descriptions curtas; /loja/produto/ fora do sitemap; checkout e pedido bloqueados no robots (intencional)
```
