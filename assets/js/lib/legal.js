import { api } from './api.js';

// Versões dos documentos legais (módulo separado de api.js de propósito: páginas antigas em cache
// continuam funcionando).
// Carregadas uma vez e enviadas junto com o aceite (cadastro e compra). O servidor confere: se o texto
// mudou depois que a página abriu, ele recusa e pede para ler a versão nova. Se não carregar (sem rede),
// o aceite segue sem versão e o servidor grava a vigente.
let legalCache = null;
let legalLoading = null;

/** Busca as versões vigentes (só nas páginas com aceite: conta e checkout). */
export function preloadLegal() {
  legalLoading ||= api('/legal/versions')
    .then(({ data }) => {
      legalCache = Object.fromEntries(Object.entries(data || {}).map(([type, doc]) => [type, doc.version]));
    })
    .catch(() => {});
  return legalLoading;
}

/** Versões que esta página mostrou, só dos documentos pedidos (ou undefined se não carregaram). */
export function legalVersions(types) {
  if (!legalCache) return undefined;
  const picked = Object.fromEntries(types.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(legalCache[t] || '')).map((t) => [t, legalCache[t]]));
  return Object.keys(picked).length ? picked : undefined;
}
