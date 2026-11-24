// Testes do relatório do Search Console (sem rede, dados FICTÍCIOS só para teste).
// Rodar: node --test scripts/seo/gsc-report.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { buildJwt, parseCsv, periods, brandMatcher, summarize, opportunities, renderReport, parseArgs } from './gsc-report.mjs';

test('JWT da conta de serviço é assinado com RS256 e escopo somente leitura', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwt = buildJwt({ client_email: 'teste@projeto.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }, 1_700_000_000);
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.strictEqual(claims.scope, 'https://www.googleapis.com/auth/webmasters.readonly');
  assert.strictEqual(claims.exp - claims.iat, 3600);
  const v = createVerify('RSA-SHA256');
  v.update(`${h}.${c}`);
  assert.ok(v.verify(publicKey, Buffer.from(s, 'base64url')));
});

test('períodos equivalentes sem sobreposição', () => {
  const p = periods('2026-11-21', 28);
  assert.deepStrictEqual(p.current, { start: '2026-10-25', end: '2026-11-21' });
  assert.deepStrictEqual(p.previous, { start: '2026-09-27', end: '2026-10-24' });
});

test('CSV em português da exportação do Search Console', () => {
  const csv = '﻿Principais consultas,Cliques,Impressões,CTR,Posição\n"criação de sites",3,120,"2,5%","8,4"\ncavax,10,40,25%,1.2\n"site, profissional",0,30,0%,14\n';
  const rows = parseCsv(csv);
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows[0], { keys: ['criação de sites'], clicks: 3, impressions: 120, ctr: 0.025, position: 8.4 });
  assert.strictEqual(rows[1].position, 1.2);
  assert.strictEqual(rows[2].keys[0], 'site, profissional');
});

test('marca × não marca e oportunidades', () => {
  const isBrand = brandMatcher();
  assert.ok(isBrand('CAVAX site') && isBrand('vatec os login') && !isBrand('criação de sites'));
  const rows = [
    { keys: ['cavax'], clicks: 10, impressions: 40, ctr: 0.25, position: 1.2 },
    { keys: ['criação de sites'], clicks: 1, impressions: 200, ctr: 0.005, position: 12 },
    { keys: ['receita de bolo'], clicks: 0, impressions: 25, ctr: 0, position: 40 }
  ];
  const s = summarize(rows.slice(1));
  assert.strictEqual(s.impressions, 225);
  const opp = opportunities(rows, isBrand);
  assert.strictEqual(opp[0].keys[0], 'criação de sites');
  assert.ok(opp[0].commercial);
  const md = renderReport({ source: 'teste', property: 'sc-domain:exemplo', generatedAt: 'agora', notes: ['dados fictícios'], compare: [], queries: rows, brandPattern: 'cavax|vatec' });
  assert.match(md, /Marca × não marca/);
  assert.match(md, /criação de sites/);
});

test('argumentos da linha de comando', () => {
  assert.deepStrictEqual(parseArgs(['--property', 'sc-domain:cavax.com.br', '--sites']), { property: 'sc-domain:cavax.com.br', sites: true });
});

test('relatório completo via API (respostas simuladas, sem rede)', async () => {
  const { writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { apiReport } = await import('./gsc-report.mjs');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cred = join(tmpdir(), `cred-teste-${process.pid}.json`);
  writeFileSync(cred, JSON.stringify({ client_email: 'teste@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, body: opts.body && String(opts.body) });
    if (url.includes('oauth2')) return { ok: true, status: 200, json: async () => ({ access_token: 'token-falso' }) };
    const body = JSON.parse(opts.body);
    const dim = body.dimensions?.[0];
    const rows = !dim
      ? [{ clicks: 5, impressions: 300, ctr: 5 / 300, position: 11.2 }]
      : [{ keys: [dim === 'query' ? 'criação de sites' : dim === 'page' ? 'https://cavax.com.br/' : dim === 'device' ? 'MOBILE' : 'bra'], clicks: 2, impressions: 150, ctr: 2 / 150, position: 9.5 }];
    return { ok: true, status: 200, json: async () => ({ rows }) };
  };
  const md = await apiReport({ property: 'sc-domain:cavax.com.br', credentials: cred, end: '2026-11-21' }, fakeFetch);
  assert.match(md, /Brasil — 28 dias/);
  assert.match(md, /2026-10-25 a 2026-11-21/);
  assert.ok(!md.includes('token-falso'), 'o token nunca aparece no relatório');
  const queryCall = calls.find((c) => c.body && c.body.includes('"query"'));
  assert.match(queryCall.body, /"expression":"bra"/);
  assert.match(queryCall.url, /sc-domain%3Acavax\.com\.br/);
});
