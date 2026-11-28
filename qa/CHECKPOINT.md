# Checkpoint
- [x] Inspeção, baseline — 15 rotas × 2 viewports, 0 erros, 0 overflow.
- [x] Sistema visual (tokens, tipografia, botões, nav, rodapé) — assets/css/main.css
- [x] Home + hero 3D + diagrama de soluções + manifesto + linha do tempo — index.html, assets/js/lib/motion.js
- [x] Páginas de serviço (gerador + services.css)
- [x] Loja / conta / legais / 404 (store.css + cabeçalho/rodapé unificados)
- [x] Revisão (Impeccable/Taste/Emil) + validação final (3 rodadas) — 176/176
Retomada: servir com `python3 -m http.server 8090 --bind 127.0.0.1` e rodar `NODE_PATH=../cavax-back/node_modules node qa/e2e.cjs`.
Ao mudar o cabeçalho/rodapé da home: `python3 scripts/seo/build_service_pages.py && python3 scripts/asset-versions.py`.
