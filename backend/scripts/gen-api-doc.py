#!/usr/bin/env python3
"""
Regenerates docs/api-reference-fa.md from the real source tree.

Usage:  python3 backend/scripts/gen-api-doc.py > docs/api-reference-fa.md

Why this exists: the API contract must never drift from the code. This reads
the controllers and DTO classes directly, so adding a route or a validated
field shows up here without anyone remembering to update a doc by hand.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
SRC = os.path.join(ROOT, 'src')

VALIDATORS = {
    'IsString', 'IsInt', 'IsUUID', 'IsIn', 'IsBoolean', 'IsArray', 'IsOptional',
    'Matches', 'Min', 'Max', 'MinLength', 'MaxLength', 'IsISO8601', 'IsBooleanString',
}
DECORATOR_ONLY = {'ApiProperty', 'ApiPropertyOptional', 'IsOptional', 'Type', 'ApiHideProperty'}


def infer_type(default):
    """Best-effort TS type for a field declared without an annotation."""
    if default == '':
        return 'unknown'
    if default in ('true', 'false'):
        return 'boolean'
    try:
        int(default)
        return 'number'
    except ValueError:
        pass
    if default.startswith(("'", '"', '`')):
        return 'string'
    if default.startswith('['):
        return 'array'
    if default.startswith('{'):
        return 'object'
    return 'unknown'


def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def slice_body(src, open_brace):
    """Returns the text between the brace at `open_brace` and its match."""
    depth, i = 0, open_brace
    while i < len(src):
        if src[i] == '{':
            depth += 1
        elif src[i] == '}':
            depth -= 1
            if depth == 0:
                return src[open_brace + 1:i]
        i += 1
    return ''


def parse_dtos():
    """
    Field declarations appear in two shapes, so decorators are accumulated
    across lines until the declaration itself is reached:

        @IsString() @MinLength(2) name!: string;        <- inline
        @IsOptional()
        @IsInt()
        page: number = 1;                               <- stacked
    """
    dtos = {}
    for dirpath, _, files in os.walk(SRC):
        for name in sorted(files):
            if not name.endswith('.ts') or name.endswith('.spec.ts'):
                continue
            path = os.path.join(dirpath, name)
            src = read(path)
            for m in re.finditer(r'(?:export\s+)?class\s+(\w+Dto)\b([^\n]*)\{', src):
                cls, tail = m.group(1), m.group(2)
                extends = re.search(r'extends\s+([\w.]+)', tail)
                body = slice_body(src, m.end() - 1)

                fields, pending = [], []
                for raw in body.split('\n'):
                    line = raw.strip()
                    if not line or line.startswith('//') or line.startswith('*') or line.startswith('/*'):
                        continue
                    pending += re.findall(r'@(\w+)', line)

                    # A declaration ends with ';'. The type annotation is
                    # OPTIONAL — `limit = 8;` infers its type from the default,
                    # and skipping those would silently drop a query param.
                    decl = re.search(r'(?:^|\s)(\w+)(\??)!?(?::\s*([^;=]+?))?\s*(?:=\s*([^;]+))?;', line)
                    if not decl or decl.group(1) in ('readonly', 'constructor'):
                        continue
                    fname = decl.group(1)
                    opt = decl.group(2)
                    ftype = (decl.group(3) or '').strip()
                    default = (decl.group(4) or '').strip()
                    if not ftype:
                        ftype = infer_type(default)

                    validators = [d for d in pending if d in VALIDATORS]
                    if not validators:
                        pending = []
                        continue
                    extra = [d for d in pending if d not in DECORATOR_ONLY and d not in VALIDATORS]
                    fields.append({
                        'name': fname,
                        'type': ftype + (f' = {default}' if default else ''),
                        'required': not ('IsOptional' in pending or opt),
                        'rules': [d for d in pending if d not in DECORATOR_ONLY],
                        'extra': extra,
                    })
                    pending = []

                if fields:
                    dtos[cls] = {'extends': extends.group(1) if extends else None, 'fields': fields}
    return dtos


def parse_routes():
    routes = []
    for dirpath, _, files in os.walk(SRC):
        for name in sorted(files):
            if not name.endswith('.controller.ts'):
                continue
            path = os.path.join(dirpath, name)
            src = read(path)
            for cm in re.finditer(r"@Controller\('([^']*)'\)", src):
                base = cm.group(1)
                start = cm.end()
                nxt = src.find('@Controller(', start)
                block = src[start: nxt if nxt > 0 else len(src)]

                starts = [m.start() for m in re.finditer(r'@(?:Get|Post|Patch|Put|Delete)\(', block)]
                for idx, pos in enumerate(starts):
                    end = starts[idx + 1] if idx + 1 < len(starts) else len(block)
                    chunk = block[pos:end]
                    vm = re.match(r"@(Get|Post|Patch|Put|Delete)\((?:'([^']*)')?\)", chunk)
                    if not vm:
                        continue
                    verb, sub = vm.group(1).upper(), vm.group(2) or ''
                    full = '/' + '/'.join(x for x in (base, sub) if x)
                    if full != '/':
                        full = full.rstrip('/')

                    def grab(pattern):
                        found = re.search(pattern, chunk)
                        return found.group(1) if found else None

                    handler = grab(r'\basync\s+(\w+)\s*\(')
                    routes.append({
                        'verb': verb,
                        'path': full,
                        'handler': handler or '?',
                        'file': os.path.relpath(path, ROOT),
                        'public': '@Public()' in chunk,
                        'perm': grab(r"@Permissions\('([^']+)'\)"),
                        'rate': grab(r"@RateLimit\('([^']+)'\)"),
                        'body': grab(r'@Body\(\)\s+\w+:\s*(\w+)'),
                        'query': grab(r'@Query\(\)\s+\w+:\s*(\w+)'),
                        'hasFile': '@UploadedFile(' in chunk,
                    })
    return routes


def field_table(dto, dtos, seen=None):
    """Renders a DTO's fields. Returns '' when the DTO was not parsed."""
    seen = seen if seen is not None else set()
    if not dto or dto not in dtos or dto in seen:
        return ''
    seen.add(dto)
    info = dtos[dto]

    out = ['| فیلد | نوع | لازم | قواعد اعتبارسنجی |', '|---|---|---|---|']
    for f in info['fields']:
        out.append('| `{}` | `{}` | {} | {} |'.format(
            f['name'], f['type'], '✅' if f['required'] else '—',
            ', '.join('`@{}`'.format(r) for r in f['rules']) or '—'))
    return '\n'.join(out)


def main():
    dtos = parse_dtos()
    routes = parse_routes()

    groups = {}
    for r in routes:
        groups.setdefault(r['path'].split('/')[1] or 'root', []).append(r)

    o = []
    o.append('# قرارداد API — مرجع فرانت‌اند\n')
    o.append('> تولیدشده از سورس واقعی با `python3 backend/scripts/gen-api-doc.py`.\n')
    o.append('> **Base URL:** `{ORIGIN}/api/v1` · **Auth:** `Authorization: Bearer <accessToken>`\n')
    o.append('> **پول:** همیشه Integer **تومان** (`IRT`) — هرگز اعشار نفرستید.\n')
    o.append(f'\n**{len(routes)} endpoint · {len(groups)} گروه · {len(dtos)} DTO**\n')

    o.append('## فهرست\n')
    for seg in sorted(groups):
        o.append(f'- **/{seg}** — {len(groups[seg])} endpoint')

    rendered = set()
    for seg in sorted(groups):
        o.append(f'\n---\n\n## `/{seg}`\n')
        o.append('| متد | مسیر | دسترسی | body | query | rate limit | handler |')
        o.append('|---|---|---|---|---|---|---|')
        for r in sorted(groups[seg], key=lambda x: (x['path'], x['verb'])):
            auth = '🔓 public' if r['public'] else (f"🔐 `{r['perm']}`" if r['perm'] else '🔑 JWT')
            body = f"`{r['body']}`" if r['body'] else ('`multipart: file`' if r['hasFile'] else '—')
            o.append('| `{}` | `{}` | {} | {} | {} | {} | `{}` |'.format(
                r['verb'], r['path'], auth, body,
                f"`{r['query']}`" if r['query'] else '—',
                f"`{r['rate']}`" if r['rate'] else '—', r['handler']))
            for key in (r['body'], r['query']):
                if key:
                    rendered.add(key)

    o.append('\n---\n\n## شکل DTOها\n')
    o.append('> «لازم» یعنی بدون `@IsOptional`. قواعد، decoratorهای class-validator هستند.\n')
    # Follow nested DTOs (e.g. `items!: ReturnItemDto[]`) — a client cannot
    # build the request body without the shape of the array elements.
    nested = set()
    for name in list(rendered):
        if name not in dtos:
            continue
        for f in dtos[name]['fields']:
            for ref in re.findall(r'(\w+Dto)\[\]', f['type']):
                if ref in dtos:
                    nested.add(ref)
    rendered |= nested

    for dto in sorted(x for x in rendered if x in dtos):
        parent = dtos[dto]['extends']
        # Inherited fields matter to a client, so render the parent too.
        if parent and parent in dtos and parent not in rendered:
            o.append(f"\n### `{parent}`  ⟵ پایهٔ DTOهای صفحه‌بندی\n")
            o.append(field_table(parent, dtos))
            rendered.add(parent)
        tag = '  ⟵ extends `{}`'.format(parent) if parent else ('  ⟵ عنصر آرایه' if dto in nested else '')
        o.append('\n### `{}`'.format(dto) + tag + '\n')
        o.append(field_table(dto, dtos))

    # Anything referenced but not parsed is a gap worth surfacing, not hiding.
    missing = sorted(x for x in rendered if x and x not in dtos)
    if missing:
        o.append('\n### DTOهای یافت‌نشده (باید دستی بررسی شوند)\n')
        o.append(', '.join(f'`{m}`' for m in missing))

    print('\n'.join(o))


if __name__ == '__main__':
    sys.exit(main())
