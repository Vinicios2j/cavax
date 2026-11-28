#!/usr/bin/env python3
"""Atualiza o ?v=<hash> dos CSS/JS referenciados nos HTML do site.

O hash é o SHA-1 do arquivo (10 primeiros caracteres), o mesmo critério do servidor da CAVAX.
Assim, quando um CSS/JS muda, o navegador baixa a versão nova em vez de usar o cache.

Uso:  python3 scripts/asset-versions.py          (aplica)
      python3 scripts/asset-versions.py --check  (só confere; sai com 1 se algo estiver desatualizado)
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF = re.compile(r'(/assets/[\w./-]+\.(?:css|js))\?v=([a-f0-9]+)')


def sha1_10(path: pathlib.Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:10]


def main() -> int:
    check = '--check' in sys.argv
    stale = 0
    for html in sorted(ROOT.rglob('*.html')):
        if '.git' in html.parts:
            continue
        text = html.read_text(encoding='utf-8')

        def fix(match: re.Match) -> str:
            nonlocal stale
            url, current = match.group(1), match.group(2)
            target = ROOT / url.lstrip('/')
            if not target.exists():
                print(f'AVISO {html.relative_to(ROOT)}: {url} não existe')
                return match.group(0)
            wanted = sha1_10(target)
            if wanted != current:
                stale += 1
                print(f'{"DESATUALIZADO" if check else "atualizado"} {html.relative_to(ROOT)}: {url} {current} -> {wanted}')
            return f'{url}?v={wanted}'

        new = REF.sub(fix, text)
        if new != text and not check:
            html.write_text(new, encoding='utf-8')
    if check and stale:
        return 1
    print('OK' if not stale else f'{stale} referência(s) {"desatualizada(s)" if check else "atualizada(s)"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
