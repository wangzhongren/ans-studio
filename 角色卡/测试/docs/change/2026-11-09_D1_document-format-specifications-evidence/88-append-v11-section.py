# Append the D1 v1.1 incremental section to the record (fill placeholders before running).
import io

p = '角色卡/测试/docs/change/2026-11-09_D1_document-format-specifications.md'
s = io.open(p, encoding='utf-8').read()

section = '''
## D1 v1.1 增量复验（2026-11-10，修复后终态）

- **触发**：v1.0 唯一新增确定性失败（`test/测试/governance-matrix-integration.test.ts` T1-20/21，`doc-format-specs.ts` 导入 `model/governance-matrix.ts`，见 §2.4/§2.5）由编排修复；修复记录 `角色卡/编排/docs/change/2026-11-09_W1_document-format-specifications.md`（170 行 / 21,097 B / `c6f9e90f7a4bca9c1724703c8ed749d849717e43f997b1ee56b40cfd6970ddea`）§9。
- **修复内容（D1 实测复核）**：删除 `GOVERNANCE_MATRIX_SCHEMA` import（模块内无该 import/常量引用）；B18 `schemaLiteral:"governance-matrix/v1"` 唯一字面量 + `schemaLiteralNote` + 注释（`:1852-1861`）；`test/编排/doc-format-specs.test.ts:849` 新增「TM-1/AC-3 pinned-literal 例外」用例（无 import/常量、字面量与 model 公共常量源码值相等、其它 21 个公共常量仍 import）。**文档瑕疵（如实）**：W1 记录 §2 的「公开常量直接 import」列表仍含 `GOVERNANCE_MATRIX_SCHEMA`，与 §9 修复说明不一致（仅文档陈述；以 §9 与候选 hash 为准；D1 不修改他角色文档）。
- **候选 v1.1 冻结**：11 项同集合；**11/11 raw SHA-256 全等**（9 文件对原批记录 + 2 文件对 W1 v1.1 §9.5：`doc-format-specs.ts` 2,294 行 / 100,605 B / `3c0c9c63…`；测试 1,693 行 / 101,313 B / `54e5b01a…`）；组合聚合 **`bcd3255392fb0e5e311c6dcec81bdfa2a0a0158af3573ac1d47f186ca4fef5b3`**；B1 两文件聚合 `f6d4475c…` 与修复记录 MATCH；manifest **1,113 文件 / 25,907,278 bytes / `fc296e9582c3a7cfd759cb7844f90778d79847afcf696ccc1146e8cd852c532f`**（on-disk 1,117 / `b2bb60d6…`）；status 11、staged 0、HEAD/tree/分支不变；写集外 diff=0（排除清单空、hash-object spot SAME、无新依赖）。
- **重跑（同候选、串行）**：`doc-format-specs` **25/25**；`governance-matrix-integration` **18/18**（v1.0 17/18 → 失败消除）；`runtime pin` 11/11；`gate pin` 19/19；`desktop session` 7/7；`all-roles` 5/5；`rejection-copy` 17/17；`run-pin` 20/9/11（11 同名基线红，diff 对 before 空）；`optional-acceptance` 6/2/1/3/0（4 同名，diff 空）；`npm run typecheck` **exit 0**。目录重跑（同一 node --test 命令）：`编排` DIR_编排；`runtime-core` DIR_RUNTIME；`门禁引擎` DIR_GATE。日志见 `v11-*.tap.txt` 与 `v11-dir-*.tap.txt`。
- **其余套件复用依据（逐文件 diff 依据）**：① 11 文件中仅 2 文件变更（其余 9 hash 与 v1 相同，`80-v11-candidate-hashes.txt`）；② 生产侧仅 `src/provider/runtime/tools.ts`（`docFormatKnownIds`）与 `app/desktop/session.ts`（`docFormatIndexText`/`docFormatSpecText`）消费注册表，二者 hash 未变（`89-v11-registry-reference-graph.txt`）；③ 索引文本逐字节不变：`docFormatIndexText()` 仅渲染 id/title/audience，B18 这些字段未变、54 id 不变（re-measure 5,223 B）；④ 仅 B18 详情文本新增一行 `schema 说明：…`（`schemaLiteral` 值与旧 import 常量相同，均为 `governance-matrix/v1`）；⑤ `test/测试/**` 与 `test/桌面应用/**` 中引用注册表文本/id 的文件仅 `doc-format-all-roles` 与 `session.test.ts`（均已重跑），`governance-matrix-integration` 为导入扫描（已重跑）；其余文件仅经未变的 tools.ts/session.ts 桥接且不断言注册表文本 ⇒ v1 的 desktop rest 605/529/76 与 test/测试 695/635/41/1/18 结果对本终态继续成立；B18 详情文本的消费断言均由注册表自身输出对照（自洽）。
- **判定（v1.1）**：新增确定性失败 **0**（v1.0 的 1 项已消除；本轮重跑无新增）；新 skip **0**（重跑套件 skip 与 v1 一致）；已知红不恶化（run-pin 11、optional 4、三目录集合 diff 空）。
- **结论**：D1 层面可进入 RR（不构成验收判定；B2 仍按 B1 v1 判定）。
'''

marker = '**（完）**'
assert marker in s
s = s.replace(marker, section.strip() + '\n\n' + marker)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('v1.1 section appended')
