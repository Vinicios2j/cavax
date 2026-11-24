# Acompanhamento de SEO

Registre aqui só **números agregados, conclusões e ações**. Os relatórios completos ficam em `reports/` (fora do Git).

## Baseline — 24/11/2026 (preliminar)

- **Search Console:** ainda não conectado. **Não há números** de cliques, impressões ou posição.
- **Situação técnica:** 18 páginas HTML, 12 URLs no sitemap. Tem 4 páginas comerciais novas, prontas para publicar.
- **O que medir no primeiro relatório:**
  - Cliques e impressões (Brasil) dos últimos 28 e 90 dias, comparados aos períodos anteriores
  - Divisão entre marca (CAVAX, VATEC) e não marca
  - Consultas em que a home aparece com intenção de serviço: são as candidatas a migrar para as páginas novas
  - Status de indexação das 4 URLs novas (`--inspect`)

## Modelo para cada ciclo (a cada 4 semanas)

```
### Ciclo AAAA-MM-DD
Fonte: API | CSV   Propriedade: sc-domain:cavax.com.br   Período: AAAA-MM-DD a AAAA-MM-DD (Brasil)
- Cliques: X (Δ % vs. 28 dias anteriores) | Impressões: X (Δ %) | CTR: X% | Posição: X
- Marca: X cliques / X impressões | Não marca: X cliques / X impressões
- Páginas novas indexadas: X de 4
- Principais oportunidades (não marca, posição 5–20 ou CTR < 2%): ...
- Ações decididas: ...
- Observações: (mudanças no site, campanhas, atrasos de dados)
```
