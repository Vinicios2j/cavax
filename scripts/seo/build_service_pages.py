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
WHATSAPP = '5511910428607'  # número oficial já publicado no site (não alterar sem aprovação)
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
      <div class="wrap">
        <nav class="breadcrumbs" aria-label="Você está em"><ol><li><a href="/">Início</a></li><li aria-current="page">{e(page['breadcrumb'])}</li></ol></nav>
        <div class="eyebrow"><i></i> {e(page['eyebrow'])}</div>
        <h1 id="pageTitle">{e(page['h1'])}</h1>
        <p class="page-lead">{para(page['lead'])}</p>
        {status}
        <div class="hero-actions">
          <a class="btn btn-primary" href="{e(quote_url)}">{e(page.get('cta_label', 'Solicitar orçamento'))} <span aria-hidden="true">↗</span></a>
          <a class="text-link" href="{e(wa_link(page['whatsapp_text']))}" target="_blank" rel="noopener">Conversar no WhatsApp <span aria-hidden="true">→</span></a>
        </div>
      </div>
    </section>''')

    # ---------- Seções ----------
    for i, sec in enumerate(page['sections']):
        alt = ' alt' if i % 2 else ''
        sid = sec['id']
        body = [f'<div class="section-label"><span>{e(sec["label"])}</span><i></i></div>', f'<h2 id="{sid}Title">{para(sec["title"])}</h2>']
        for p in sec.get('intro', []):
            body.append(f'<p class="service-intro">{para(p)}</p>')
        if sec.get('cards'):
            cards = ''.join(
                f'<article class="service-card"><span>{e(c.get("tag", f"{n:02d}"))}</span><h3>{e(c["title"])}</h3><p>{para(c["text"])}</p></article>'
                for n, c in enumerate(sec['cards'], 1)
            )
            body.append(f'<div class="service-cards">{cards}</div>')
        if sec.get('list'):
            items = ''.join(f'<li>{para(item)}</li>' for item in sec['list'])
            body.append(f'<ul class="service-list">{items}</ul>')
        if sec.get('steps'):
            steps = ''.join(
                f'<li class="method-item"><span class="method-number">{n:02d}</span><div><h3>{e(s["title"])}</h3><p>{para(s["text"])}</p></div><span class="method-arrow" aria-hidden="true">↗</span></li>'
                for n, s in enumerate(sec['steps'], 1)
            )
            body.append(f'<ol class="method-list">{steps}</ol>')
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
    related = ''.join(f'<a href="/{slug}/"><strong>{e(RELATED_LABELS[slug][0])}</strong><span>{e(RELATED_LABELS[slug][1])}</span></a>' for slug in page['related'])
    parts.append(f'''    <section class="service-cta" aria-labelledby="ctaTitle">
      <div class="wrap">
        <div class="service-cta-box">
          <div>
            <div class="section-label"><span>PRÓXIMO PASSO</span><i></i></div>
            <h2 id="ctaTitle" class="service-section-title">{para(page['cta_title'])}</h2>
            <p class="service-intro">{para(page['cta_text'])}</p>
          </div>
          <div class="hero-actions">
            <a class="btn btn-primary" href="{e(quote_url)}">{e(page.get('cta_label', 'Solicitar orçamento'))} <span aria-hidden="true">↗</span></a>
            <a class="btn btn-outline" href="{e(wa_link(page['whatsapp_text']))}" target="_blank" rel="noopener">Falar pelo WhatsApp <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <h2 class="related-title">Veja também</h2>
        <div class="related-services">{related}<a href="/#solucoes"><strong>Todas as soluções</strong><span>Segurança, APIs, hospedagem, manutenção e consultoria.</span></a></div>
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
  {SERVICES_CSS_TAG.format(v=css_version())}
  {lds}
</head>
<body class="page-service">
  <div class="noise" aria-hidden="true"></div>

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
