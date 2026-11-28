#!/usr/bin/env python3
"""Gera as páginas comerciais (serviços/produtos) do site estático da CAVAX.

Uso:  python3 scripts/seo/build_service_pages.py

- Cabeçalho, rodapé, banner de cookies e scripts são copiados do index.html (fonte única),
  então qualquer ajuste feito na home aparece nas páginas novas ao rodar de novo.
- O conteúdo de cada página fica em scripts/seo/pages.py (texto editável, sem HTML solto).
- Tudo que vem do conteúdo é escapado; nada de script inline além de JSON-LD (permitido pelo CSP).
"""
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pages import PAGES, RELATED_LABELS  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SITE = 'https://cavax.com.br'
ORG_ID = f'{SITE}/#organizacao'
WHATSAPP = '5521999287921'  # número oficial já publicado no site (não alterar sem aprovação)
CSS_SERVICES = '/assets/css/services.css'

e = html.escape


def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as fh:
        return fh.read()


def between(text, start, end, include_end=True):
    i = text.index(start)
    j = text.index(end, i)
    return text[i : j + (len(end) if include_end else 0)]


HOME = read('index.html')
HEAD_COMMON = between(HOME, '  <link rel="icon"', '<script type="application/ld+json">', include_end=False).rstrip()
HEADER = between(HOME, '<a class="skip-link"', '</header>')
FOOTER = between(HOME, '<footer class="footer">', '<script type="module"', include_end=False).rstrip()
SCRIPTS = '<script type="module" src="' + re.search(r'<script type="module" src="(/assets/js/main\.js[^"]*)"', HOME).group(1) + '"></script>'
CSP = re.search(r'(<meta http-equiv="Content-Security-Policy"[^>]*>)', HOME).group(1)
SERVICES_CSS_TAG = f'<link rel="stylesheet" href="{CSS_SERVICES}?v={{v}}">'


# Diagrama do hero de cada página: mesma geometria do diagrama interativo da home (assets/js/lib/motion.js).
# Rótulos tirados do próprio conteúdo da página (pages.py).
HERO_DIAGRAM = {
    'criacao-de-sites': ('hub', 'Site', ['Site institucional', 'Landing page', 'Recursos próprios', 'Publicação']),
    'automacao-whatsapp': ('flow', 'Automação', ['WhatsApp', 'Respostas imediatas', 'Passagem para humano', 'Integração com sistemas']),
    'desenvolvimento-de-sistemas': ('ring', 'Sistema', ['Gestão', 'Painéis administrativos', 'Portais', 'Integrações e APIs']),
    'cavax-atendimento': ('flow', 'Atendimento', ['WhatsApp', 'Central de conversas', 'Contatos', 'Editor de fluxos']),
}
SHAPES = {
    'hub': [(240, 74), (406, 240), (240, 406), (74, 240)],
    'flow': [(66, 240), (414, 104), (414, 240), (414, 376)],
    'ring': [(112, 112), (368, 112), (368, 368), (112, 368)],
}
ARROW = '<svg class="i i-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 11.5l7-7M6 4.5h5.5V10"/></svg>'


def curve(shape, x, y, i):
    if shape == 'flow':
        if i == 0:
            return f'M {x} {y} C {x + 60} {y}, 180 240, 240 240'
        return f'M 240 240 C 330 240, {x - 90} {y}, {x} {y}'
    mx, my = (240 + x) / 2, (240 + y) / 2
    return f'M 240 240 C {mx:g} {my:g}, {mx:g} {my:g}, {x} {y}'


def hero_diagram(slug):
    if slug not in HERO_DIAGRAM:
        return ''
    shape, core, labels = HERO_DIAGRAM[slug]
    links, flows, nodes = [], [], []
    for i, (x, y) in enumerate(SHAPES[shape]):
        d = curve(shape, x, y, i)
        links.append(f'<path class="link" pathLength="100" d="{d}"/>')
        flows.append(f'<path class="flow" pathLength="100" d="{d}"/>')
        anchor = 'start' if x < 150 else 'end' if x > 330 else 'middle'
        tx = -12 if anchor == 'start' else 12 if anchor == 'end' else 0
        ty = -18 if y < 150 else 32 if y > 330 or anchor == 'middle' else -46  # laterais: acima do núcleo
        nodes.append(f'<g class="n" transform="translate({x} {y})"><circle r="9"/><circle class="dot" r="3.5"/><text x="{tx}" y="{ty}" text-anchor="{anchor}">{e(labels[i])}</text></g>')
    cyc = '<rect class="cyc" x="112" y="112" width="256" height="256" rx="20"/>' if shape == 'ring' else ''
    return f'''<div class="service-diagram solutions-diagram" aria-hidden="true">
          <svg class="diagram" data-shape="{shape}" viewBox="0 0 480 480" focusable="false">
            <defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6E5A26"/><stop offset=".35" stop-color="#E6CD86"/><stop offset=".55" stop-color="#C9A54C"/><stop offset="1" stop-color="#7A6329"/></linearGradient></defs>
            {cyc}{''.join(links)}{''.join(flows)}{''.join(nodes)}
            <g class="core"><rect x="170" y="200" width="140" height="80" rx="12"/><text class="core-label" x="240" y="246" text-anchor="middle">{e(core)}</text><text class="core-sub" x="240" y="266" text-anchor="middle">CAVAX</text></g>
          </svg>
        </div>'''


def css_version():
    import hashlib

    data = read(CSS_SERVICES.lstrip('/')).encode()
    return hashlib.sha1(data).hexdigest()[:10]


def para(text):
    """Texto com **negrito** e [link](url) controlados por nós; o resto é escapado."""
    out = e(text).replace('&lt;em&gt;', '<em>').replace('&lt;/em&gt;', '</em>')
    out = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', out)
    out = re.sub(r'\[(.+?)\]\((/[^)\s]*)\)', r'<a class="text-link-inline" href="\2">\1</a>', out)
    return out


def jsonld(data):
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    return raw.replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')


def wa_link(text):
    from urllib.parse import quote

    return f'https://wa.me/{WHATSAPP}?text={quote(text)}'


def render(page):
    url = f"{SITE}/{page['slug']}/"
    quote_url = f"/?servico={page['form_service'].replace(' ', '+')}#contato"
    head_ld = [
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Início', 'item': f'{SITE}/'},
                {'@type': 'ListItem', 'position': 2, 'name': page['breadcrumb'], 'item': url},
            ],
        }
    ]
    if page.get('schema') == 'Service':
        head_ld.append(
            {
                '@context': 'https://schema.org',
                '@type': 'Service',
                '@id': f'{url}#servico',
                'name': page['service_name'],
                'serviceType': page['service_name'],
                'description': page['description'],
                'url': url,
                'provider': {'@id': ORG_ID, '@type': 'Organization', 'name': 'CAVAX', 'url': SITE},
            }
        )
    else:
        head_ld.append(
            {
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                '@id': f'{url}#pagina',
                'url': url,
                'name': page['title'],
                'description': page['description'],
                'inLanguage': 'pt-BR',
                'publisher': {'@id': ORG_ID},
            }
        )

    parts = []
    # ---------- Hero ----------
    status = f'<p class="service-status">{e(page["status"])}</p>' if page.get('status') else ''
    parts.append(f'''    <section class="page-hero service-hero" aria-labelledby="pageTitle">
      <div class="hero-grid" aria-hidden="true"></div>
      <div class="wrap service-hero-layout">
        <div class="service-hero-copy">
          <nav class="breadcrumbs" aria-label="Você está em"><ol><li><a href="/">Início</a></li><li aria-current="page">{e(page['breadcrumb'])}</li></ol></nav>
          <h1 id="pageTitle">{e(page['h1'])}</h1>
          <p class="page-lead">{para(page['lead'])}</p>
          {status}
          <div class="hero-actions">
            <a class="btn btn-primary" href="{e(quote_url)}">{e(page.get('cta_label', 'Solicitar orçamento'))} {ARROW}</a>
            <a class="text-link" href="{e(wa_link(page['whatsapp_text']))}" target="_blank" rel="noopener">Conversar no WhatsApp {ARROW}<span class="sr-only"> (abre em nova aba)</span></a>
          </div>
        </div>
        {hero_diagram(page['slug'])}
      </div>
    </section>''')

    # ---------- Seções ----------
    for i, sec in enumerate(page['sections']):
        alt = ' alt' if i % 2 else ''
        sid = sec['id']
        # O rótulo (sec["label"]) continua nos dados, mas não é exibido: o título já carrega a seção.
        body = [f'<h2 id="{sid}Title">{para(sec["title"])}</h2>']
        for p in sec.get('intro', []):
            body.append(f'<p class="service-intro">{para(p)}</p>')
        if sec.get('cards'):
            cards = ''.join(
                f'<article class="service-card">{f"<span>{e(c['tag'])}</span>" if c.get("tag") else ""}<h3>{e(c["title"])}</h3><p>{para(c["text"])}</p></article>'
                for n, c in enumerate(sec['cards'], 1)
            )
            body.append(f'<div class="service-cards" data-reveal>{cards}</div>')
        if sec.get('list'):
            items = ''.join(f'<li>{para(item)}</li>' for item in sec['list'])
            body.append(f'<ul class="service-list">{items}</ul>')
        if sec.get('steps'):
            steps = ''.join(
                f'<li class="method-item"><span class="method-number">{n:02d}</span><div><h3>{e(s["title"])}</h3><p>{para(s["text"])}</p></div></li>'
                for n, s in enumerate(sec['steps'], 1)
            )
            body.append(f'<ol class="method-list" data-reveal>{steps}</ol>')
        if sec.get('roadmap'):
            cols = ''.join(f'<div><h3>{e(col["title"])}</h3><ul>{"".join(f"<li>{para(x)}</li>" for x in col["items"])}</ul></div>' for col in sec['roadmap'])
            body.append(f'<div class="roadmap">{cols}</div>')
        if sec.get('faq'):
            qa = ''.join(f'<details><summary>{e(q)}</summary><p>{para(a)}</p></details>' for q, a in sec['faq'])
            body.append(f'<div class="faq-list">{qa}</div>')
        if sec.get('note'):
            body.append(f'<p class="service-note">{para(sec["note"])}</p>')
        joined = '\n        '.join(body)
        parts.append(f'''    <section class="service-section{alt}" id="{sid}" aria-labelledby="{sid}Title">
      <div class="wrap">
        {joined}
      </div>
    </section>''')

    # ---------- CTA + relacionados ----------
    related = ''.join(f'<a href="/{slug}/"><strong>{e(RELATED_LABELS[slug][0])}</strong><span>{e(RELATED_LABELS[slug][1])}</span>{ARROW}</a>' for slug in page['related'])
    parts.append(f'''    <section class="service-cta" aria-labelledby="ctaTitle">
      <div class="wrap">
        <div class="service-cta-box">
          <div>
            <h2 id="ctaTitle" class="service-section-title">{para(page['cta_title'])}</h2>
            <p class="service-intro">{para(page['cta_text'])}</p>
          </div>
          <div class="hero-actions">
            <a class="btn btn-primary" href="{e(quote_url)}">{e(page.get('cta_label', 'Solicitar orçamento'))} {ARROW}</a>
            <a class="btn btn-outline" href="{e(wa_link(page['whatsapp_text']))}" target="_blank" rel="noopener">Falar pelo WhatsApp<span class="sr-only"> (abre em nova aba)</span></a>
          </div>
        </div>
        <h2 class="related-title">Veja também</h2>
        <div class="related-services">{related}<a href="/#solucoes"><strong>Todas as soluções</strong><span>Segurança, APIs, hospedagem, manutenção e consultoria.</span>{ARROW}</a></div>
      </div>
    </section>''')

    main = '\n'.join(parts)
    lds = '\n  '.join(f'<script type="application/ld+json">{jsonld(d)}</script>' for d in head_ld)
    head = f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#090909">
  <meta name="cavax-api" content="https://api.cavax.com.br">
  {CSP}
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>{e(page['title'])}</title>
  <meta name="description" content="{e(page['description'])}">
  <link rel="canonical" href="{url}">

  <meta property="og:locale" content="pt_BR">
  <meta property="og:site_name" content="CAVAX">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{e(page['title'])}">
  <meta property="og:description" content="{e(page['description'])}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{SITE}/assets/images/cavax-og-image.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(page['title'])}">
  <meta name="twitter:description" content="{e(page['description'])}">
  <meta name="twitter:image" content="{SITE}/assets/images/cavax-og-image.jpg">

{HEAD_COMMON}
  {lds}
</head>
<body class="page-service">

  {HEADER}
  <main id="conteudo" tabindex="-1">
{main}
  </main>

  {FOOTER}
  {SCRIPTS}
</body>
</html>
'''
    return head


def main():
    for page in PAGES:
        out_dir = os.path.join(ROOT, page['slug'])
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as fh:
            fh.write(render(page))
        print(f"gerado /{page['slug']}/  título({len(page['title'])})  description({len(page['description'])})")


if __name__ == '__main__':
    main()
