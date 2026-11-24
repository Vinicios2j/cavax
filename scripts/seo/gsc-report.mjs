#!/usr/bin/env node
/**
 * Relatório de SEO da CAVAX a partir do Google Search Console — SOMENTE LEITURA.
 *
 * Modos:
 *   node scripts/seo/gsc-report.mjs --sites
 *       Lista as propriedades que a credencial enxerga (confirma se é sc-domain:cavax.com.br ou https://cavax.com.br/).
 *   node scripts/seo/gsc-report.mjs --property sc-domain:cavax.com.br
 *       Relatório completo: últimos 28 e 90 dias × períodos anteriores equivalentes, marca × não marca,
 *       consultas, páginas, dispositivos, países (prioridade Brasil) e oportunidades.
 *   node scripts/seo/gsc-report.mjs --property sc-domain:cavax.com.br --inspect https://cavax.com.br/criacao-de-sites/
 *       Diagnóstico de uma URL (URL Inspection API).
 *   node scripts/seo/gsc-report.mjs --csv caminho/da/pasta-exportada
 *       Sem API: lê os CSVs exportados em Search Console › Desempenho › Exportar (Consultas.csv, Páginas.csv...).
 *
 * Credencial (nunca dentro do repositório):
 *   --credentials /caminho/fora/do/repo/conta-servico.json   ou   GOOGLE_APPLICATION_CREDENTIALS=/caminho/...
 *   Escopo usado: https://www.googleapis.com/auth/webmasters.readonly (somente leitura).
 *
 * Saída: reports/gsc-AAAA-MM-DD.md (a pasta reports/ está no .gitignore). Nenhum token é impresso.
 * Sem dependências: usa apenas módulos nativos do Node 18+.
 */
import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/webmasters/v3';
const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_BRAND = 'cavax|cavx|cavaxx|vatec|vatec os';

// ---------------------------------------------------------------- utilitários
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else out[key] = true;
  }
  return out;
}

const b64url = (input) => Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** JWT assinado (RS256) para a conta de serviço trocar por um access token. */
export function buildJwt(credentials, now = Math.floor(Date.now() / 1000)) {
  if (!credentials?.client_email || !credentials?.private_key) throw new Error('Credencial inválida: precisa de client_email e private_key (JSON de conta de serviço).');
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: credentials.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(credentials.private_key))}`;
}

async function getToken(credentials, fetchImpl = fetch) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: buildJwt(credentials) })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Falha na autenticação (${res.status}): ${data.error_description || data.error || 'sem detalhes'}`);
  return data.access_token; // nunca é impresso nem gravado
}

async function call(token, url, body, fetchImpl = fetch) {
  const res = await fetchImpl(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    if (res.status === 403) throw new Error(`Sem permissão (403): adicione o e-mail da conta de serviço como usuário "Restrito" da propriedade no Search Console. Detalhe: ${msg}`);
    throw new Error(`Erro da API (${res.status}): ${msg}`);
  }
  return data;
}

/** Datas em America/Sao_Paulo. Os dados do Search Console atrasam ~2-3 dias, então o fim padrão é hoje − 3. */
export function isoDay(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function periods(endIso, days) {
  const end = new Date(`${endIso}T12:00:00Z`);
  const day = 86400000;
  const s = new Date(end - (days - 1) * day);
  const pe = new Date(s - day);
  const ps = new Date(pe - (days - 1) * day);
  const f = (d) => d.toISOString().slice(0, 10);
  return { current: { start: f(s), end: f(end) }, previous: { start: f(ps), end: f(pe) } };
}

export function brandMatcher(pattern = DEFAULT_BRAND) {
  const re = new RegExp(`(^|\\b)(${pattern})`, 'i');
  return (q) => re.test(String(q || '').normalize('NFD').replace(/[̀-ͯ]/g, ''));
}

export function summarize(rows) {
  const clicks = rows.reduce((s, r) => s + (r.clicks || 0), 0);
  const impressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
  const position = impressions ? rows.reduce((s, r) => s + (r.position || 0) * (r.impressions || 0), 0) / impressions : 0;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
}

/** Oportunidades: intenção possivelmente comercial, impressões relevantes e CTR baixo ou posição 5–20. */
export function opportunities(rows, isBrand, { minImpressions = 20 } = {}) {
  const commercial = /(criar|cria[cç][aã]o|desenvolv|site|sistema|software|loja|e-?commerce|automa|whatsapp|chatbot|bot|api|integra|seguran|hospedag|manuten|landing|or[cç]amento|empresa|pre[cç]o|quanto custa|contratar)/i;
  return rows
    .filter((r) => !isBrand(r.keys[0]) && r.impressions >= minImpressions)
    .map((r) => ({ ...r, commercial: commercial.test(r.keys[0]) }))
    .filter((r) => (r.position >= 5 && r.position <= 20) || r.ctr < 0.02)
    .sort((a, b) => Number(b.commercial) - Number(a.commercial) || b.impressions - a.impressions)
    .slice(0, 25);
}

const pct = (v) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
const num = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(v));
const pos = (v) => (v ? v.toFixed(1).replace('.', ',') : '—');
const delta = (a, b) => (b ? `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(0)}%` : 'sem base');
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(rows, cols) {
  const head = `| ${cols.map((c) => c[0]).join(' | ')} |\n|${cols.map(() => '---').join('|')}|`;
  return [head, ...rows.map((r) => `| ${cols.map((c) => c[1](r)).join(' | ')} |`)].join('\n');
}

// ---------------------------------------------------------------- CSV (exportação do Search Console)
export function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const split = (line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else q = !q;
      } else if (ch === ',' && !q) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (re) => header.findIndex((h) => re.test(h));
  const iKey = 0;
  const iClicks = idx(/^(cliques|clicks)/);
  const iImpr = idx(/^(impress)/);
  const iCtr = idx(/^ctr/);
  const iPos = idx(/^(posi)/);
  const n = (v) => {
    const s = String(v ?? '').trim().replace('%', '');
    if (!s) return 0;
    const normalized = /,\d+$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    return Number(normalized) || 0;
  };
  return lines.slice(1).map((line) => {
    const c = split(line);
    const ctrRaw = n(c[iCtr]);
    return { keys: [c[iKey]], clicks: n(c[iClicks]), impressions: n(c[iImpr]), ctr: String(c[iCtr]).includes('%') ? ctrRaw / 100 : ctrRaw, position: n(c[iPos]) };
  });
}

function findCsv(dir, names) {
  const files = readdirSync(dir);
  const hit = files.find((f) => names.some((n) => f.toLowerCase().startsWith(n)));
  return hit ? join(dir, hit) : null;
}

// ---------------------------------------------------------------- relatório
export function renderReport({ source, property, generatedAt, notes, compare, queries, pages, devices, countries, brandPattern }) {
  const isBrand = brandMatcher(brandPattern);
  const brandRows = queries.filter((r) => isBrand(r.keys[0]));
  const nonBrandRows = queries.filter((r) => !isBrand(r.keys[0]));
  const b = summarize(brandRows);
  const nb = summarize(nonBrandRows);
  const out = [];
  out.push(`# Relatório de SEO — CAVAX`, '', `- Fonte: ${source}`, `- Propriedade: ${property || 'não informada (CSV)'}`, `- Gerado em: ${generatedAt}`, `- Regra de marca: \`/${brandPattern}/i\``, '');
  out.push('## Avisos sobre os dados', ...notes.map((n) => `- ${n}`), '');
  if (compare?.length) {
    out.push('## Comparação de períodos (Brasil e total)');
    out.push(
      table(compare, [
        ['Período', (r) => r.label],
        ['Datas', (r) => `${r.current.start} a ${r.current.end} × ${r.previous.start} a ${r.previous.end}`],
        ['Cliques', (r) => `${num(r.now.clicks)} (${delta(r.now.clicks, r.before.clicks)})`],
        ['Impressões', (r) => `${num(r.now.impressions)} (${delta(r.now.impressions, r.before.impressions)})`],
        ['CTR', (r) => `${pct(r.now.ctr)} × ${pct(r.before.ctr)}`],
        ['Posição média', (r) => `${pos(r.now.position)} × ${pos(r.before.position)}`]
      ]),
      ''
    );
  }
  out.push('## Marca × não marca (consultas listadas)', 'Calculado só com as consultas que o Search Console lista — consultas anonimizadas ficam de fora.', '');
  out.push(
    table(
      [
        { label: 'Marca (CAVAX, VATEC…)', ...b, n: brandRows.length },
        { label: 'Não marca', ...nb, n: nonBrandRows.length }
      ],
      [
        ['Grupo', (r) => r.label],
        ['Consultas', (r) => num(r.n)],
        ['Cliques', (r) => num(r.clicks)],
        ['Impressões', (r) => num(r.impressions)],
        ['CTR', (r) => pct(r.ctr)],
        ['Posição', (r) => pos(r.position)]
      ]
    ),
    ''
  );
  const qCols = [
    ['Consulta', (r) => esc(r.keys[0])],
    ['Cliques', (r) => num(r.clicks)],
    ['Impressões', (r) => num(r.impressions)],
    ['CTR', (r) => pct(r.ctr)],
    ['Posição', (r) => pos(r.position)]
  ];
  out.push('## Principais consultas não marca', nonBrandRows.length ? table([...nonBrandRows].sort((a, z) => z.impressions - a.impressions).slice(0, 30), qCols) : '_Sem consultas não marca listadas no período._', '');
  const opp = opportunities(queries, isBrand);
  out.push(
    '## Oportunidades (preliminar)',
    'Critério: não marca, ≥ 20 impressões e (posição 5–20 ou CTR < 2%). Intenção comercial estimada por palavras-chave — revise manualmente.',
    '',
    opp.length ? table(opp, [...qCols, ['Comercial?', (r) => (r.commercial ? 'provável' : '—')]]) : '_Nenhuma oportunidade com dados suficientes. Use como baseline e repita em 4 semanas._',
    ''
  );
  if (pages?.length) out.push('## Páginas', table([...pages].sort((a, z) => z.impressions - a.impressions).slice(0, 30), [['Página', (r) => esc(r.keys[0])], ...qCols.slice(1)]), '');
  if (devices?.length) out.push('## Dispositivos', table(devices, [['Dispositivo', (r) => r.keys[0]], ...qCols.slice(1)]), '');
  if (countries?.length) out.push('## Países (top 10)', table([...countries].sort((a, z) => z.clicks - a.clicks || z.impressions - a.impressions).slice(0, 10), [['País', (r) => r.keys[0]], ...qCols.slice(1)]), '');
  out.push(
    '## Ações sugeridas (revisar antes de aplicar)',
    '- Consultas com muitas impressões e CTR baixo: revisar title/description da página que aparece para elas.',
    '- Posições 5–20 com intenção comercial: fortalecer a página certa (conteúdo, FAQ, links internos) — sem criar página duplicada.',
    '- Consultas comerciais sem página dedicada: avaliar nova página no mapa de palavras-chave (docs/seo/mapa-palavras-chave.md).',
    '- Conclusões com poucos dados são preliminares; repetir a análise com 28 dias a mais.',
    ''
  );
  return out.join('\n');
}

export async function apiReport(args, fetchImpl = fetch) {
  const credPath = args.credentials || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) throw new Error('Informe --credentials ou GOOGLE_APPLICATION_CREDENTIALS (JSON da conta de serviço, FORA do repositório).');
  const abs = resolve(credPath);
  if (abs.startsWith(ROOT)) throw new Error('Por segurança, a credencial não pode ficar dentro da pasta do repositório. Mova o arquivo para fora (ex.: ~/.config/cavax/).');
  const credentials = JSON.parse(readFileSync(abs, 'utf8'));
  const token = await getToken(credentials, fetchImpl);

  if (args.sites) {
    const data = await call(token, `${API}/sites`, null, fetchImpl);
    const list = (data.siteEntry || []).map((s) => `- ${s.siteUrl} (${s.permissionLevel})`);
    console.log(list.length ? `Propriedades visíveis para esta credencial:\n${list.join('\n')}` : 'Nenhuma propriedade visível. Adicione o e-mail da conta de serviço no Search Console (Configurações › Usuários e permissões, permissão Restrita).');
    return;
  }
  const property = args.property;
  if (!property) throw new Error('Informe --property sc-domain:cavax.com.br (ou https://cavax.com.br/). Use --sites para descobrir.');
  const site = encodeURIComponent(property);

  if (args.inspect) {
    const data = await call(token, INSPECT_URL, { inspectionUrl: args.inspect, siteUrl: property, languageCode: 'pt-BR' }, fetchImpl);
    const r = data.inspectionResult || {};
    const idx = r.indexStatusResult || {};
    console.log(
      [
        `URL: ${args.inspect}`,
        `Veredito: ${idx.verdict || '—'} | Cobertura: ${idx.coverageState || '—'}`,
        `Robots: ${idx.robotsTxtState || '—'} | Indexação permitida: ${idx.indexingState || '—'}`,
        `Último rastreamento: ${idx.lastCrawlTime || '—'} | Página buscada: ${idx.pageFetchState || '—'}`,
        `Canonical declarado: ${idx.userCanonical || '—'} | Canonical escolhido pelo Google: ${idx.googleCanonical || '—'}`,
        `Link no Search Console: ${r.inspectionResultLink || '—'}`
      ].join('\n')
    );
    return;
  }

  const end = args.end || isoDay(new Date(Date.now() - 3 * 86400000));
  const q = (body) => call(token, `${API}/sites/${site}/searchAnalytics/query`, { type: 'web', dataState: 'final', ...body }, fetchImpl).then((d) => d.rows || []);
  const brazil = [{ filters: [{ dimension: 'country', operator: 'equals', expression: 'bra' }] }];
  const compare = [];
  for (const [label, days] of [
    ['Brasil — 28 dias', 28],
    ['Brasil — 90 dias', 90],
    ['Total — 28 dias', 28]
  ]) {
    const p = periods(end, days);
    const filter = label.startsWith('Brasil') ? { dimensionFilterGroups: brazil } : {};
    const [now] = await q({ startDate: p.current.start, endDate: p.current.end, ...filter });
    const [before] = await q({ startDate: p.previous.start, endDate: p.previous.end, ...filter });
    compare.push({ label, ...p, now: summarize(now ? [now] : []), before: summarize(before ? [before] : []) });
  }
  const p28 = periods(end, 28).current;
  const base = { startDate: p28.start, endDate: p28.end, rowLimit: 25000 };
  const [queries, pages, devices, countries] = await Promise.all([
    q({ ...base, dimensions: ['query'], dimensionFilterGroups: brazil }),
    q({ ...base, dimensions: ['page'], dimensionFilterGroups: brazil }),
    q({ ...base, dimensions: ['device'], dimensionFilterGroups: brazil }),
    q({ ...base, dimensions: ['country'] })
  ]);
  return renderReport({
    source: 'Search Console API (searchAnalytics.query, dataState=final, type=web)',
    property,
    generatedAt: new Date().toISOString(),
    brandPattern: args.brand || DEFAULT_BRAND,
    notes: [
      `Consultas, páginas e dispositivos: Brasil, ${p28.start} a ${p28.end} (datas no fuso do Pacífico, padrão do Search Console).`,
      'Os dados mais recentes atrasam cerca de 2–3 dias; por isso o período termina 3 dias antes de hoje.',
      'Consultas anonimizadas (raras, por privacidade) não aparecem nas tabelas, mas entram nos totais sem filtro de consulta.',
      'A API devolve as linhas principais (até 25.000 por chamada); sites pequenos raramente atingem esse limite.',
      'O Search Console mostra apenas buscas em que o site já apareceu — não mede todo o mercado nem volume de busca.'
    ],
    compare,
    queries,
    pages,
    devices,
    countries
  });
}

function csvReport(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`Pasta não encontrada: ${dir}`);
  const read = (names) => {
    const f = findCsv(dir, names);
    return f ? parseCsv(readFileSync(f, 'utf8')) : [];
  };
  const queries = read(['consultas', 'queries']);
  if (!queries.length) throw new Error('Não achei Consultas.csv (ou Queries.csv) na pasta. Exporte em Search Console › Desempenho › Exportar › CSV e descompacte.');
  return renderReport({
    source: `CSV exportado do Search Console (${dir})`,
    property: null,
    generatedAt: new Date().toISOString(),
    brandPattern: DEFAULT_BRAND,
    notes: [
      'Período, país e tipo de pesquisa são os filtros aplicados na exportação (veja Filtros.csv na mesma pasta).',
      'A exportação pela interface traz no máximo 1.000 linhas por tabela.',
      'Sem comparação automática de períodos no modo CSV: exporte dois períodos e compare, ou use a API.',
      'O Search Console mostra apenas buscas em que o site já apareceu — não mede todo o mercado.'
    ],
    compare: [],
    queries,
    pages: read(['páginas', 'paginas', 'pages']),
    devices: read(['dispositivos', 'devices']),
    countries: read(['países', 'paises', 'countries'])
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || Object.keys(args).length === 0) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
    return;
  }
  const report = args.csv ? csvReport(resolve(args.csv)) : await apiReport(args);
  if (!report) return;
  const outDir = resolve(args.out || join(ROOT, 'reports'));
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `gsc-${isoDay(new Date())}.md`);
  writeFileSync(file, report);
  console.log(`Relatório salvo em ${file} (pasta ignorada pelo Git).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Erro: ${error.message}`);
    process.exit(1);
  });
}
