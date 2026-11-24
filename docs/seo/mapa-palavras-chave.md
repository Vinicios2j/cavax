# Mapa de palavras-chave por intenção e URL

> **Importante:** não há dados de volume de busca nem de concorrência neste documento. Os termos são **hipóteses de intenção**, montadas a partir dos serviços que a CAVAX realmente oferece. Confirme ou descarte cada uma com:
> 1. **Search Console** (consultas em que o site já aparece): `node scripts/seo/gsc-report.mjs`
> 2. **Google Trends** ou **Keyword Planner** (só com autorização; registre a fonte e a data)

## Regras contra canibalização
- **Uma intenção principal por URL.** Quando duas páginas disputam o mesmo termo, uma delas precisa mudar de foco ou ser fundida com a outra.
- **Serviço × produto:** `/automacao-whatsapp/` é o **projeto sob medida** (disponível hoje). `/cavax-atendimento/` é a **plataforma própria** (marca e produto, em desenvolvimento). Elas se citam com links, mas não competem pelo mesmo termo genérico.
- **Home:** é a página da marca e a visão geral dos serviços ("empresa de tecnologia", "criação de sites, sistemas e automações"). Ela leva às páginas específicas.
- **Sem páginas por cidade** enquanto não houver cobertura geográfica confirmada e conteúdo realmente diferente para cada local.

## Mapa atual

| URL | Intenção principal | Termos-alvo (hipóteses) | Variações naturais no texto | Status |
|---|---|---|---|---|
| `/` | Navegacional/marca e visão geral | cavax, cavax tecnologia, empresa de tecnologia para empresas | criação de sites, sistemas e automações | publicada |
| `/criacao-de-sites/` | Comercial: contratar site | criação de sites, criação de site profissional, site institucional, empresa de criação de sites | site para empresa, fazer site, refazer site, site responsivo | **nova** |
| `/automacao-whatsapp/` | Comercial: automatizar atendimento | automação de whatsapp, automação de atendimento whatsapp, chatbot para whatsapp | api oficial do whatsapp, whatsapp business api, atendimento automático | **nova** |
| `/desenvolvimento-de-sistemas/` | Comercial: software sob medida | desenvolvimento de sistemas, sistema sob medida, software personalizado para empresas | sistema web, painel administrativo, sistema de gestão | **nova** |
| `/cavax-atendimento/` | Marca/produto | cavax atendimento, plataforma de atendimento whatsapp, central de atendimento whatsapp | editor de fluxos, central de conversas | **nova** (produto em desenvolvimento) |
| `/criacao-de-lojas-virtuais/` | Comercial: e-commerce | criação de loja virtual, loja virtual para empresas | e-commerce sob medida, loja com mercado pago | planejada |
| `/criacao-de-landing-pages/` | Comercial: página de vendas | criação de landing page, página de vendas | landing page para anúncios | planejada |
| `/seguranca-digital/` | Comercial: proteção de sites | segurança de sites, proteção de site contra ataques | hardening, https, waf | planejada (hoje é a âncora `/#seguranca`) |
| `/manutencao-de-sites/` | Comercial: suporte | manutenção de sites, suporte para site | atualização de site, correção de erros | planejada |
| `/integracao-de-apis/` | Comercial: integrações | integração de sistemas, integração de api | integração com mercado pago, webhooks | planejada |
| `/hospedagem-de-sites/` | Comercial: hospedagem | hospedagem de sites, publicação de site | domínio, ssl, deploy | planejada |

## Como decidir a próxima página
1. A consulta aparece no Search Console com impressões, mas o clique cai na home ou numa página que não responde bem → **forte candidata**.
2. O serviço é real, está ativo e tem conteúdo suficiente para uma página útil (escopo, processo, FAQ próprios) → pode criar.
3. Se o conteúdo for basicamente igual ao de outra página → **não crie**; aprofunde a página existente.
