#!/usr/bin/env node
// R4 测试债治理：B0 61 名缺口逐名现状明细（Windows 首次完整覆盖后）。
// 对 19-b0-b7-closure.tsv 中 B0 的 61 名，逐名判定：
//   - 名称是否仍以字面量存在于仓库 test/**/*.test.ts；
//   - 若否，是否可由模板生成（把运行时/命令占位符替换后匹配）；
//   - 文件级条目（.test.ts 路径）对应文件是否存在；
//   - 在 R4 三平台工件中是否出现 skip（﹣ 行）。
// 输出：23-b0-closure-detail.tsv

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['closure', 'tests-root', 'artifacts', 'out']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (extname(entry.name) === '.ts' && /\.test\.ts$/.test(entry.name)) out.push(p);
  }
  return out;
}
const testFiles = walk(args['tests-root']).map((f) => [f.replaceAll('\\', '/'), readFileSync(f, 'utf8')]);
const artifactTexts = ['mac-arm64', 'mac-x64', 'win-x64'].map((d) => [d, readFileSync(join(args.artifacts, `test-logs-${d}`, 'test-ci-output.log'), 'utf8')]);

const rows = readFileSync(args.closure, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split('\t'));
const out = [];
for (const r of rows) {
  if (r[0] !== 'B0') continue;
  const name = r[1];
  let category = 'unknown';
  let foundIn = '';
  if (/\.test\.ts$/.test(name)) {
    category = 'file-level-entry';
    const norm = name.replaceAll('\\', '/');
    const hit = testFiles.find(([f]) => f.endsWith(norm.replace(/^.*?test\//, 'test/')));
    if (hit) foundIn = hit[0];
    if (!hit) {
      // B0 使用反斜杠相对路径（test\测试\…），按 basename 再找一次
      const base = norm.split('/').pop();
      const hit2 = testFiles.find(([f]) => f.endsWith('/' + base));
      if (hit2) foundIn = hit2[0];
    }
  } else {
    const hit = testFiles.find(([, text]) => text.includes(name));
    if (hit) {
      category = 'literal';
      foundIn = hit[0];
    } else {
      // 模板生成名：把常见宿主 token 替换为 ${...} 难以通用化，这里按可辨识前缀判类。
      const isTemplate =
        /^(root flag and env reach (claude|codex|demo|pi) through actual)/.test(name) ||
        /^actual bin default (claude|codex|pi) Provider/.test(name) ||
        /^T1 actual bin role\/\w+: actual adapter/.test(name) ||
        /^真实入口失败路径非 0:/.test(name);
      category = isTemplate ? 'template-generated' : 'not-found';
      if (isTemplate) {
        // 记录命中模板的源文件（按稳定前缀搜索）
        const prefix = name.startsWith('真实入口失败路径非 0:')
          ? '真实入口失败路径非 0:'
          : name.startsWith('root flag and env reach')
            ? 'root flag and env reach ${runtime}'
            : name.startsWith('actual bin default')
              ? 'actual bin default ${runtime}'
              : 'T1 actual bin ${command}/${runtime}';
        const hitT = testFiles.find(([, text]) => text.includes(prefix));
        if (hitT) foundIn = hitT[0];
      }
    }
  }
  const skipped = artifactTexts
    .filter(([, text]) => text.split(/\r?\n/).some((l) => /^\s*﹣ /.test(l) && l.includes(name)))
    .map(([d]) => d);
  out.push({
    name,
    category,
    foundIn,
    skippedInR4: skipped.join('+') || '',
    inR4Universe: r[5],
    status: r[7],
  });
}

const tsv = [
  ['name', 'category', 'foundIn', 'skippedInR4', 'inR4Universe', 'status'].join('\t'),
  ...out.map((x) => [x.name, x.category, x.foundIn, x.skippedInR4, x.inR4Universe, x.status].join('\t')),
].join('\n');
writeFileSync(args.out, tsv + '\n', 'utf8');

const counts = out.reduce((m, x) => { m[x.category] = (m[x.category] ?? 0) + 1; return m; }, {});
console.log('B0 closure detail:', JSON.stringify(counts), 'total=' + out.length, 'skipped=' + out.filter((x) => x.skippedInR4).length);
console.log(`wrote ${args.out}`);
