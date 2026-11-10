# Update the D1 record to v1.1 final candidate values (run with python -I).
import io

p = '角色卡/测试/docs/change/2026-11-09_D1_document-format-specifications.md'
s = io.open(p, encoding='utf-8').read()

def rep(a, b):
    global s
    assert a in s, 'MISSING: ' + a[:70]
    s = s.replace(a, b)

rep(
    '| 组合候选 | `git status --porcelain -- src app test` 恰 **11 项**：5 M + 6 新（??）；无删除/重命名；逐文件 raw SHA-256 与 W1/W2/W3/W4a/W4b/W5 批次记录 after 值 **11/11 全等** |',
    '| 组合候选 | `git status --porcelain -- src app test` 恰 **11 项**：5 M + 6 新（??）；无删除/重命名；**v1.1 终态**逐文件 raw SHA-256 **11/11 全等**（9 文件对原批记录 after；2 文件对 W1 v1.1 §9.5 修复值；v1.0 原值见 §1.2 注） |')

rep(
    '| 聚合 | **`d08009461a8fffeeab662a6917b434972319c7f3d4a89560148562724d91b53c`**（定义：按路径排序后 `path + "\\0" + sha256` 串联的 SHA-256；分批聚合对记录值 5/5 复算命中，B4a 单文件无记录值） |',
    '| 聚合 | **v1.1 终态 `bcd3255392fb0e5e311c6dcec81bdfa2a0a0158af3573ac1d47f186ca4fef5b3`**（v1.0 为 `d0800946…`；定义：按路径排序后 `path + "\\0" + sha256` 串联的 SHA-256；B1 两文件聚合 `f6d4475c…` 与 W1 v1.1 §9.5 一致，其余分批聚合对原记录 4/4 命中） |')

rep(
    '| manifest | `src app test`（tracked 1,107 + 非忽略 untracked 6 = **1,113** 文件）聚合 **`4535a943aaa4a0767ad1c2e299d3a408a1ba4723495b7d0df415022d6410bbae`**；另记 on-disk（含 ignored `app/renderer/dist` 4 文件）1,117 文件聚合 `5142fe1d…`；运行前/后逐字节相同（1,113 与 1,117 文件聚合复取一致） |',
    '| manifest | **v1.1 终态**：`src app test`（tracked 1,107 + 非忽略 untracked 6 = **1,113** 文件 / 25,907,278 bytes）聚合 **`fc296e9582c3a7cfd759cb7844f90778d79847afcf696ccc1146e8cd852c532f`**；on-disk 1,117 文件聚合 `b2bb60d621d3130fbb4f23065fb134389e17abf7431bb1855a24591c8f47e82e`（v1.0 为 `4535a943…`/`5142fe1d…`）；运行前/后复取一致 |')

rep(
    '| 新增确定性失败 | **1**（确定性：`test/测试/governance-matrix-integration.test.ts` T1-20/21 导入扫描——`src/common/编排/doc-format-specs.ts` 导入 `model/governance-matrix.ts` 未在测试授权消费方清单；全量与隔离复跑均复现，见 §2.4/§2.5。其余 after-only 项均经隔离复跑归因环境/抖动） |',
    '| 新增确定性失败 | **0（v1.1 终态）**。v1.0 曾发现 1 项：`governance-matrix-integration` T1-20/21 导入扫描（`doc-format-specs.ts` 导入 `model/governance-matrix.ts`）；编排 2026-11-10 修复后 v1.1 复验 **18/18 pass**，该失败消除（见文末「D1 v1.1 增量复验」）。其余 after-only 项均经隔离复跑归因环境/抖动 |')

rep(
    '11/11 与各批记录 after 值**逐字节相等**（raw = 工作树磁盘字节；本 worktree `core.autocrlf=true`，候选行尾为混合 CRLF/LF，逐文件 hash 见下）：',
    '**v1.1 终态** 11/11 与预期值**逐字节相等**（9 文件对原批记录 after；2 文件对 W1 v1.1 §9.5 修复值，下表以 v1.1 为准；raw = 工作树磁盘字节；本 worktree `core.autocrlf=true`，候选行尾为混合 CRLF/LF）：')

rep(
    '| `src/common/编排/doc-format-specs.ts` | B1/W1 | 100,105 | `f141e4ba3314f3a67673f83fa70daf8a80ac5fca7270b214eb30aeeba1008871` |',
    '| `src/common/编排/doc-format-specs.ts` | B1/W1（v1.1 修复） | 100,605 | `3c0c9c63ba99ad09adb379858595618b833ff20406429d46bc8160514e49bf86`（v1.0 原值 `f141e4ba…` / 100,105 B） |')

rep(
    '| `test/编排/doc-format-specs.test.ts` | B1/W1 | 99,507 | `f9abe8f35fbe920cf14c53c4fb9f2e9df5017f03741200bf2b2050753e1395c4` |',
    '| `test/编排/doc-format-specs.test.ts` | B1/W1（v1.1 修复） | 101,313 | `54e5b01ab47c59f091ec2c9617b5209b6e3b254fe2aa757ec211455166aa2e94`（v1.0 原值 `f9abe8f3…` / 99,507 B） |')

rep(
    '- 新文件行数：registry 2,291；编排测试 1,672；runtime pin 281；门禁 pin 678；桌面 session 588；测试跨角色 724 —— 与批次记录一致。',
    '- 新文件行数（v1.1）：registry 2,294；编排测试 1,693（v1.0 为 2,291/1,672；与 W1 v1.1 §9.5 记录一致）；runtime pin 281；门禁 pin 678；桌面 session 588；测试跨角色 724。')

rep(
    '- 组合候选聚合：**`d08009461a8fffeeab662a6917b434972319c7f3d4a89560148562724d91b53c`**。',
    '- 组合候选聚合：v1.0 **`d08009461a8fffeeab662a6917b434972319c7f3d4a89560148562724d91b53c`**；**v1.1 终态 `bcd3255392fb0e5e311c6dcec81bdfa2a0a0158af3573ac1d47f186ca4fef5b3`**（见文末增量节）。')

rep(
    '- manifest（定义同聚合，覆盖 `git ls-files -co --exclude-standard -- src app test` = tracked 1,107 + 候选 untracked 6 = 1,113，合计 25,904,972 bytes）：**`4535a943aaa4a0767ad1c2e299d3a408a1ba4723495b7d0df415022d6410bbae`**（列表 `12-manifest-before-listing.txt`）。',
    '- manifest（定义同聚合，覆盖 `git ls-files -co --exclude-standard -- src app test` = tracked 1,107 + 候选 untracked 6 = 1,113）：v1.0 `4535a943…` / 25,904,972 bytes；**v1.1 终态 `fc296e9582c3a7cfd759cb7844f90778d79847afcf696ccc1146e8cd852c532f` / 25,907,278 bytes**（列表 `81-v11-manifest-listing.txt`）。')

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('record v1.1 base updated')
