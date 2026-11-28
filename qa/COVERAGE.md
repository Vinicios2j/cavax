# Cobertura

Cobertura de código **não foi medida** (site estático sem instrumentação). Cobertura funcional exercida pela suíte `qa/e2e.cjs`:

| Área | Coberto | Como |
|---|---|---|
| 18 rotas públicas/internas | Sim | console, overflow, semântica (1440), alvos de toque (390) |
| Larguras 320/390/768/1024/1440/1920 | Sim | home, criação de sites, loja, 404 em todas; demais em 390 e 1440 |
| Contraste AA | Sim | home, automação de WhatsApp, loja, 404 |
| Formulário de contato | Sim | erro 422 por campo, aria-invalid + foco, sucesso, payload/honeypot, pré-seleção por link e por `?servico=` |
| Navegação | Sim | skip link, menu mobile (abrir, Esc, foco, fechar ao clicar) |
| Diagrama de soluções | Sim | hover e foco por teclado trocam estado |
| Hero 3D | Parcial | montagem verificada; parallax só visualmente (requer ponteiro real) |
| Reduced motion | Sim | nada oculto, nenhuma animação infinita |
| Loja/carrinho | Parcial | catálogo com produto fictício, adicionar ao carrinho, página do carrinho; checkout, pagamento e conta logada **não** exercitados (exigem backend) |
| Desempenho | Parcial | LCP/CLS locais; INP não medido |
