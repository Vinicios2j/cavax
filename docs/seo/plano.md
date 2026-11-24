# Plano de SEO priorizado — CAVAX

Ordem sugerida: o que tem mais impacto com menos risco vem primeiro. Nada aqui garante posição no Google. Indexação e ranqueamento dependem de concorrência, conteúdo e tempo.

## Agora (antes ou junto da publicação)

1. **Revisar o texto das 4 páginas novas.** O conteúdo está em `scripts/seo/pages.py`. Confirme especialmente:
   - CAVAX Atendimento: os recursos "em desenvolvimento" estão corretos (central de conversas, contatos, editor visual, Cloud API)? Pode-se oferecer "Quero ser avisado"?
   - Criação de sites: vocês oferecem "área para editar conteúdo" quando o projeto pede?
   - Sistemas: a lista de tecnologias (Node.js, Java, Spring Boot, bancos relacionais, APIs REST) está certa? A menção ao VATEC OS como "plataforma de gestão em evolução" está correta?
   - Todas: o atendimento é para todo o Brasil? **As páginas não citam cobertura geográfica** até você confirmar.
   - Depois de editar, rode `python3 scripts/seo/build_service_pages.py`.
2. **Não use o botão "Publicar no GitHub" do painel** até portar estas mudanças para o servidor (item 6). Ele apaga as páginas novas, `docs/` e `.claude/`.
3. **Publicar** (com sua autorização): faça merge da branch `seo/paginas-comerciais` na `main`.
4. **Search Console** (veja [integracao-search-console.md](integracao-search-console.md)):
   - Envie o `sitemap.xml`.
   - Peça a indexação manual das 4 URLs novas pela Inspeção de URL.
   - Configure o acesso somente leitura para os relatórios.

## Próximas 4 semanas

5. **Baseline:** rode `node scripts/seo/gsc-report.mjs` (ou o modo `--csv`) e registre os números em [acompanhamento.md](acompanhamento.md).
6. **Portar para o servidor:** levar as páginas de serviço, o rodapé, o `services.css`, os canonicals com barra e o `robots.txt` para `cavax-back/src/views` e para o `static-site.service.js`. Também é preciso fazer o `publishToGitHub` preservar os arquivos que não foram gerados por ele (`base_tree`). Só depois disso o botão do painel volta a ser seguro.
7. **Vídeo da home:** avaliar a troca do iframe com autoplay pelo "carregar ao clicar" (`data-youtube-id`), que já é suportado pelo `main.js`. É melhor para o desempenho e a privacidade, mas a decisão é sua.
8. **Produtos da loja:** cada produto deveria ter URL e canonical próprios no HTML inicial (hoje tudo é `/loja/produto/?p=` com canonical fixo). Resolver no servidor (item 6) antes de colocar produtos no sitemap.

## Depois, guiado por dados

9. **Expandir as páginas** do mapa (`/criacao-de-lojas-virtuais/`, `/criacao-de-landing-pages/`, `/seguranca-digital/`, `/manutencao-de-sites/`, `/integracao-de-apis/`, `/hospedagem-de-sites/`), começando pelas que aparecerem no Search Console com impressões. Use `/cavax-seo nova-pagina <slug>`.
10. **Portfólio real:** casos com autorização do cliente, imagens reais e sem dados pessoais. Isso reforça a confiança nas páginas de serviço.
11. **Descriptions curtas** das páginas legais e da loja: melhorar quando mexer nelas.
12. **Revisar títulos e descriptions** das páginas com muitas impressões e CTR baixo, a cada ciclo de relatório.

## O que **não** fazer
- Indexing API (é só para vagas de emprego e transmissões ao vivo).
- Páginas por cidade sem conteúdo próprio.
- Comprar backlinks, publicar texto em massa ou inventar avaliações e clientes.
- Publicar recurso do CAVAX Atendimento que ainda não exista.
