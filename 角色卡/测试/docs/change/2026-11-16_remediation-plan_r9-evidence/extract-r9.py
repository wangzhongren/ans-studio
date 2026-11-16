#!/usr/bin/env python3
# R9 evidence extractor (read-only).
# Usage:
#   python -I extract-r9.py <artifacts-root> <outdir> [<knownred-dir>]
# artifacts-root contains test-logs-mac-arm64/, test-logs-mac-x64/, test-logs-win-x64/.
# Raw CI artifacts must not be committed; this script only emits summaries.
import json, re, os, sys, csv

def load(path):
    text = open(path, encoding='utf-8', errors='replace').read()
    lines = text.splitlines()
    summ = {}
    for ln in lines:
        m = re.match(r'^ℹ (tests|pass|fail|cancelled|skipped|todo|duration_ms) (.+)$', ln)
        if m:
            summ[m.group(1)] = m.group(2)
    sect = [i for i, ln in enumerate(lines) if ln.strip() == '✖ failing tests:']
    fails, cur = [], None
    if sect:
        for ln in lines[max(sect) + 1:]:
            m = re.match(r'^test at (.+?):(\d+):(\d+)$', ln)
            if m:
                if cur:
                    fails.append(cur)
                cur = {'file': m.group(1).replace('\\', '/'), 'line': int(m.group(2)), 'name': None, 'dur': None, 'error': []}
                continue
            if cur is None:
                continue
            m2 = re.match(r'^✖ (.+?) \(([0-9.]+)ms\)$', ln)
            if m2 and cur['name'] is None:
                cur['name'] = m2.group(1)
                cur['dur'] = float(m2.group(2))
            cur['error'].append(ln)
        if cur:
            fails.append(cur)
    out = []
    for f in fails:
        err = ' '.join(x.strip() for x in f['error'] if x.strip())
        kind = 'timeout' if 'test timed out after' in err else ('file-level' if f['name'] is None else 'assertion')
        out.append({'name': f['name'], 'file': f['file'], 'line': f['line'], 'dur': f['dur'], 'kind': kind, 'error': err[:400]})
    return summ, out

def main():
    root, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    tags = [('mac-arm64', 'arm64'), ('mac-x64', 'x64'), ('win-x64', 'windows')]
    data, names = {}, {}
    for tag, plat in tags:
        summ, fails = load(os.path.join(root, 'test-logs-%s' % tag, 'test-ci-output.log'))
        data[plat] = {'summary': summ, 'fails': fails}
        for f in fails:
            n = f['name'] or '(file-level)'
            names.setdefault(n, {'name': n, 'platforms': [], 'by': {}})
            names[n]['platforms'].append(plat)
            names[n]['by'][plat] = f
    union = sorted(names.values(), key=lambda x: x['name'])
    with open(os.path.join(outdir, '01-ci-summary-and-unique-names.json'), 'w', encoding='utf-8') as fh:
        json.dump({'platforms': data, 'union': union}, fh, ensure_ascii=False, indent=1)
    with open(os.path.join(outdir, '02-platform-matrix.tsv'), 'w', encoding='utf-8', newline='') as fh:
        w = csv.writer(fh, delimiter='\t')
        w.writerow(['#', 'residual', 'arm64', 'x64', 'windows', 'file:line', 'kind', 'error head'])
        for i, u in enumerate(union, 1):
            cells = ['%sms %s' % (u['by'][p]['dur'], u['by'][p]['kind']) if p in u['by'] else '-' for p in ('arm64', 'x64', 'windows')]
            first = next(iter(u['by'].values()))
            head = first['error']
            if 'AssertionError [ERR_ASSERTION]: ' in head:
                head = head.split('AssertionError [ERR_ASSERTION]: ', 1)[1]
            w.writerow([i, u['name']] + cells + ['%s:%s' % (first['file'], first['line'])] + [head[:180]])
    if len(sys.argv) > 3:
        kr = {}
        for fn in ('runtime-core-33.txt', 'gates-5.txt', 'orchestration-24.txt'):
            p = os.path.join(sys.argv[3], fn)
            frozen = [ln.strip() for ln in open(p, encoding='utf-8') if ln.strip()]
            hit = [row for row in frozen for n in (u['name'] for u in union)
                   if n and (n == row or n.startswith(row) or row.startswith(n))]
            kr[fn] = {'total': len(frozen), 'matched': hit}
        with open(os.path.join(outdir, '07-knownred-r9.json'), 'w', encoding='utf-8') as fh:
            json.dump(kr, fh, ensure_ascii=False, indent=1)
    print('union', len(union))

if __name__ == '__main__':
    main()
