// Site estático: converte endereços antigos/compartilhados para o formato do GitHub Pages.
//   /loja/produto/slug      → /loja/produto/?p=slug
//   /loja/categoria/slug    → /loja/?categoria=slug
//   /loja/pedido/CODIGO?t=… → /loja/pedido/?c=CODIGO&t=… (inclusive o retorno do Mercado Pago)
const path = location.pathname;
const qs = new URLSearchParams(location.search);
let target = null;
let m = path.match(/^\/loja\/produto\/([a-z0-9-]{1,90})\/?$/);
if (m) {
  qs.set('p', m[1]);
  target = `/loja/produto/?${qs}`;
}
m = path.match(/^\/loja\/categoria\/([a-z0-9-]{1,90})\/?$/);
if (m) {
  qs.set('categoria', m[1]);
  target = `/loja/?${qs}`;
}
m = path.match(/^\/loja\/pedido\/([A-Za-z0-9-]{1,40})\/?$/);
if (m) {
  qs.set('c', m[1]);
  target = `/loja/pedido/?${qs}`;
}
if (target) location.replace(target + location.hash);
