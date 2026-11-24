# Integração com o Google Search Console (somente leitura)

**Status:** ainda **não conectado**. A propriedade já existe, mas não foi possível confirmar daqui se ela é `sc-domain:cavax.com.br` (propriedade de domínio) ou `https://cavax.com.br/` (prefixo de URL). O passo 1 resolve isso.

## Por que conta de serviço
- Não exige compartilhar a senha do Google nem fazer login interativo.
- Recebe **apenas** a permissão "Restrita" na propriedade, que é de leitura.
- O escopo usado pelo script é `https://www.googleapis.com/auth/webmasters.readonly`.
- A chave fica **fora** do repositório. O script se recusa a rodar se o arquivo estiver dentro da pasta do projeto.

Avaliei a opção de usar um servidor MCP de terceiros, mas não instalei nenhum. O cliente local (`scripts/seo/gsc-report.mjs`) usa só a API oficial, tem cerca de 300 linhas revisáveis e não tem dependências. Isso evita dar acesso aos dados a um código que ninguém revisou.

## Passo a passo (feito pelo proprietário)

1. **Confirme o tipo da propriedade:** no Search Console, abra o seletor de propriedades no canto superior esquerdo.
   - Se aparecer só `cavax.com.br`, é uma **propriedade de domínio** e o valor no script é `sc-domain:cavax.com.br`.
   - Se aparecer `https://cavax.com.br/`, é **prefixo de URL** e o valor é exatamente esse.
2. **Crie um projeto no Google Cloud:** acesse https://console.cloud.google.com/, clique em "Selecionar projeto", depois em "Novo projeto", e use um nome como `cavax-seo`.
3. **Ative a API:** em "APIs e serviços › Biblioteca", procure **Google Search Console API** e clique em **Ativar**.
4. **Crie a conta de serviço:**
   1. Vá em "IAM e administrador › Contas de serviço" e clique em **Criar conta de serviço**, com um nome como `cavax-seo-leitura`.
   2. **Não** atribua papéis do Cloud: a permissão vem do Search Console.
   3. Abra a conta, entre em **Chaves**, clique em **Adicionar chave**, depois em **Criar nova chave** e escolha **JSON**.
   4. Salve o arquivo **fora** do repositório (ex.: `~/.config/cavax/gsc-leitura.json`).
   5. Não envie esse arquivo por chat, e-mail ou Git.
   6. Se a sua organização bloquear a criação de chaves, use o OAuth de app desktop. Peça um ajuste no script para esse fluxo.
5. **Dê acesso de leitura no Search Console:**
   1. Vá em "Configurações › Usuários e permissões" e clique em **Adicionar usuário**.
   2. Cole o e-mail da conta de serviço (algo como `cavax-seo-leitura@cavax-seo.iam.gserviceaccount.com`).
   3. Escolha a permissão **Restrita**.
6. **Teste na sua máquina**, dentro da pasta do repositório:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=~/.config/cavax/gsc-leitura.json
   node scripts/seo/gsc-report.mjs --sites
   node scripts/seo/gsc-report.mjs --property sc-domain:cavax.com.br
   node scripts/seo/gsc-report.mjs --property sc-domain:cavax.com.br --inspect https://cavax.com.br/criacao-de-sites/
   ```
   O relatório é salvo em `reports/gsc-AAAA-MM-DD.md` (pasta ignorada pelo Git). Requer o Node 18 ou mais novo.
7. **Revogar o acesso** quando quiser: remova o usuário no Search Console e apague a chave no Google Cloud.

## Alternativa temporária sem API (CSV)
1. No Search Console, vá em **Desempenho › Resultados da pesquisa**.
2. Escolha o período (ex.: últimos 3 meses) e, se quiser, filtre o país Brasil.
3. Clique em **Exportar** e escolha **Fazer o download do CSV**.
4. Descompacte o arquivo e rode:
   ```bash
   node scripts/seo/gsc-report.mjs --csv ~/Downloads/cavax.com.br-Performance-on-Search-2026-11-24
   ```
   A interface exporta no máximo 1.000 linhas por tabela, e esse modo não compara períodos automaticamente.

## Sitemap e indexação manual (depois da publicação)
1. **Sitemap:** no Search Console, vá em **Sitemaps**, informe `https://cavax.com.br/sitemap.xml` e clique em **Enviar**.
2. **Páginas novas:** use a **Inspeção de URL** na barra do topo. Cole cada URL e clique em **Solicitar indexação**:
   - https://cavax.com.br/criacao-de-sites/
   - https://cavax.com.br/automacao-whatsapp/
   - https://cavax.com.br/desenvolvimento-de-sistemas/
   - https://cavax.com.br/cavax-atendimento/
3. Solicitar a indexação **não garante** que a página será indexada nem define um prazo.
4. **Não use a Indexing API.** Ela é só para vagas de emprego e transmissões ao vivo.

## Limites dos dados (sempre citar nos relatórios)
- Há um atraso de cerca de 2 a 3 dias. As datas seguem o fuso do Pacífico (padrão do Search Console).
- Consultas raras são **anonimizadas**: não aparecem nas tabelas, mas entram nos totais sem filtro de consulta.
- A API devolve as linhas principais (até 25.000 por chamada e 50.000 por dia por tipo de pesquisa).
- O Search Console mostra apenas as buscas em que o site **já apareceu**. Ele não mede o mercado nem o volume de busca.
