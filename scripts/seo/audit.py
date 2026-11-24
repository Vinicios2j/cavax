#!/usr/bin/env python3
"""Auditoria SEO local do site estático da CAVAX (sem rede, só leitura).

Uso:  python3 scripts/seo/audit.py            # relatório no terminal
      python3 scripts/seo/audit.py --strict   # sai com código 1 se houver ERRO (útil antes de publicar)

Verifica: título, description, canonical (barra final), og:url, meta robots, H1, JSON-LD válido,
imagens sem alt/dimensões, links internos quebrados, coerência do sitemap.xml e do robots.txt.
"""
import html
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urlparse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SITE = 'https://cavax.com.br'
IGNORE_DIRS = {'.git', '.claude', 'docs', 'scripts', 'reports', 'node_modules'}
PRIVATE = ('/conta/', '/loja/carrinho/', '/loja/checkout/', '/loja/pedido/', '/404.html')


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ''
        self._in = None
        self.meta = {}
        self.links = []
        self.canonical = None
        self.h1 = []
        self._h1buf = None
        self.imgs = []
        self.jsonld = []
        self._script = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title':
            self._in = 'title'
        elif tag == 'meta':
            key = a.get('name') or a.get('property')
            if key:
                self.meta[key.lower()] = a.get('content', '')
        elif tag == 'link' and a.get('rel') == 'canonical':
            self.canonical = a.get('href')
        elif tag == 'a' and a.get('href'):
            self.links.append(a['href'])
        elif tag == 'h1':
            self._h1buf = ''
        elif tag == 'img':
            self.imgs.append(a)
        elif tag == 'script' and a.get('type') == 'application/ld+json':
            self._script = ''

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in = None
        elif tag == 'h1' and self._h1buf is not None:
            self.h1.append(re.sub(r'\s+', ' ', self._h1buf).strip())
            self._h1buf = None
        elif tag == 'script' and self._script is not None:
            self.jsonld.append(self._script)
            self._script = None

    def handle_data(self, data):
        if self._in == 'title':
            self.title += data
        if self._h1buf is not None:
            self._h1buf += data
        if self._script is not None:
            self._script += data


def html_files():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]
        for f in files:
            if f.endswith('.html'):
                yield os.path.join(base, f)


def url_for(path):
    rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
    if rel == 'index.html':
        return '/'
    if rel.endswith('/index.html'):
        return '/' + rel[: -len('index.html')]
    return '/' + rel


def exists(url_path):
    p = url_path.split('#')[0].split('?')[0]
    if not p or p == '/':
        return os.path.exists(os.path.join(ROOT, 'index.html'))
    local = os.path.join(ROOT, p.lstrip('/'))
    return os.path.isfile(local) or os.path.isfile(os.path.join(local, 'index.html'))


def main():
    strict = '--strict' in sys.argv
    errors, warns = [], []
    pages = {}
    titles, descs = {}, {}
    for path in sorted(html_files()):
        url = url_for(path)
        p = Page()
        with open(path, encoding='utf-8') as fh:
            p.feed(fh.read())
        pages[url] = p
        robots = p.meta.get('robots', '')
        noindex = 'noindex' in robots
        title = html.unescape(p.title.strip())
        desc = p.meta.get('description', '')
        tag = f'{url:32}'
        if not title:
            errors.append(f'{tag} sem <title>')
        elif not noindex:
            if len(title) > 65:
                warns.append(f'{tag} título longo ({len(title)}): {title}')
            titles.setdefault(title, []).append(url)
        if not noindex:
            if not desc:
                errors.append(f'{tag} sem meta description')
            else:
                if len(desc) > 160 or len(desc) < 70:
                    warns.append(f'{tag} description com {len(desc)} caracteres')
                descs.setdefault(desc, []).append(url)
            if not p.canonical:
                errors.append(f'{tag} sem canonical')
            else:
                expected = SITE + url
                if p.canonical != expected and not url.startswith('/loja/produto/'):
                    errors.append(f'{tag} canonical {p.canonical} ≠ URL servida {expected}')
                og = p.meta.get('og:url')
                if og and og != p.canonical:
                    warns.append(f'{tag} og:url {og} ≠ canonical')
            if len(p.h1) != 1:
                errors.append(f'{tag} {len(p.h1)} H1 (esperado 1)')
        elif url not in PRIVATE and not url.endswith('404.html'):
            warns.append(f'{tag} página com noindex: {robots}')
        for raw in p.jsonld:
            try:
                data = json.loads(raw)
                for key in ('aggregateRating', 'review'):
                    if key in json.dumps(data):
                        warns.append(f'{tag} JSON-LD contém {key} — confirme que é real e visível')
            except json.JSONDecodeError as e:
                errors.append(f'{tag} JSON-LD inválido: {e}')
        for img in p.imgs:
            if 'alt' not in img:
                errors.append(f'{tag} imagem sem alt: {img.get("src")}')
            if not (img.get('width') and img.get('height')):
                warns.append(f'{tag} imagem sem width/height: {img.get("src")}')
        for href in p.links:
            u = urlparse(href)
            if u.scheme in ('mailto', 'tel', 'javascript') or (u.netloc and u.netloc != 'cavax.com.br'):
                continue
            if href.startswith('#') or href.startswith('/api/'):
                continue
            target = u.path or '/'
            if not exists(target):
                errors.append(f'{tag} link interno quebrado: {href}')

    for title, urls in titles.items():
        if len(urls) > 1:
            errors.append(f'título duplicado em {urls}: {title}')
    for desc, urls in descs.items():
        if len(urls) > 1:
            warns.append(f'description duplicada em {urls}')

    # sitemap
    sm_path = os.path.join(ROOT, 'sitemap.xml')
    sm_urls = []
    try:
        tree = ET.parse(sm_path)
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        sm_urls = [e.text.strip() for e in tree.getroot().findall('s:url/s:loc', ns)]
    except Exception as e:  # noqa: BLE001
        errors.append(f'sitemap.xml inválido: {e}')
    for loc in sm_urls:
        path = loc.replace(SITE, '') or '/'
        p = pages.get(path)
        if not p:
            errors.append(f'sitemap: {loc} não existe como página')
        elif 'noindex' in p.meta.get('robots', ''):
            errors.append(f'sitemap: {loc} tem noindex')
        elif p.canonical and p.canonical != loc:
            errors.append(f'sitemap: {loc} ≠ canonical {p.canonical}')
    for url, p in pages.items():
        if 'noindex' not in p.meta.get('robots', '') and p.canonical == SITE + url and SITE + url not in sm_urls:
            warns.append(f'{url:32} indexável mas fora do sitemap')

    # robots.txt
    try:
        robots = open(os.path.join(ROOT, 'robots.txt'), encoding='utf-8').read()
        disallowed = re.findall(r'^Disallow:\s*(\S+)', robots, re.M)
        for d in disallowed:
            for url, p in pages.items():
                if url.startswith(d) and 'noindex' in p.meta.get('robots', ''):
                    warns.append(f'robots.txt bloqueia {url} que tem noindex (o Google não verá o noindex)')
            for loc in sm_urls:
                if (loc.replace(SITE, '') or '/').startswith(d):
                    errors.append(f'robots.txt bloqueia URL do sitemap: {loc}')
        if 'Sitemap:' not in robots:
            warns.append('robots.txt sem linha Sitemap:')
    except FileNotFoundError:
        errors.append('robots.txt ausente')

    print(f'Páginas HTML analisadas: {len(pages)} | URLs no sitemap: {len(sm_urls)}\n')
    print(f'ERROS ({len(errors)})')
    for e in errors:
        print('  ✗', e)
    print(f'\nAVISOS ({len(warns)})')
    for w in warns:
        print('  !', w)
    if not errors and not warns:
        print('Tudo certo.')
    sys.exit(1 if strict and errors else 0)


if __name__ == '__main__':
    main()
