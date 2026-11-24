# SEO da CAVAX — documentação interna

Esta pasta **não é publicada** no site (`_config.yml` a exclui do GitHub Pages).

| Arquivo | Conteúdo |
|---|---|
| [auditoria.md](auditoria.md) | Situação inicial, problemas comprovados e hipóteses, o que foi corrigido |
| [mapa-palavras-chave.md](mapa-palavras-chave.md) | Intenção e URL de cada página, regras contra canibalização |
| [plano.md](plano.md) | Próximos passos priorizados |
| [integracao-search-console.md](integracao-search-console.md) | Como conectar o Search Console em modo somente leitura, enviar o sitemap e pedir indexação |
| [acompanhamento.md](acompanhamento.md) | Baseline e modelo de relatório mensal |

## Comandos
```bash
python3 scripts/seo/audit.py                      # auditoria local (sem rede)
python3 scripts/seo/audit.py --strict             # falha se houver erro (antes de publicar)
python3 scripts/seo/build_service_pages.py        # regera as páginas de serviço a partir de scripts/seo/pages.py
node --test scripts/seo/gsc-report.test.mjs       # testes do relatório (sem rede)
node scripts/seo/gsc-report.mjs --help            # relatório do Search Console (API ou CSV)
```

## Skill do Claude Code
`.claude/skills/cavax-seo/`: use `/cavax-seo auditoria`, `/cavax-seo nova-pagina <slug>`, `/cavax-seo relatorio` ou `/cavax-seo revisar <arquivo>`. Detalhes em `.claude/skills/cavax-seo/references/uso.md`.
