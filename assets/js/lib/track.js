// Ponte leve para eventos de analytics. Nada é enviado sem consentimento: enquanto o rastreador
// (lib/analytics.js) não for iniciado, os eventos ficam só na memória desta página e são descartados
// se o visitante não aceitar. Nunca passe aqui textos digitados ou dados pessoais.
const pending = [];

export function emit(name, props) {
  if (typeof window === 'undefined') return;
  if (window.cavaxTrack) return window.cavaxTrack(name, props);
  if (pending.length < 30) pending.push([name, props, Date.now()]);
}

/** Usado pelo rastreador ao iniciar (somente quando o consentimento já existia ao abrir a página). */
export function drain(maxAgeMs = 60000) {
  const now = Date.now();
  return pending.splice(0).filter(([, , t]) => now - t <= maxAgeMs);
}
