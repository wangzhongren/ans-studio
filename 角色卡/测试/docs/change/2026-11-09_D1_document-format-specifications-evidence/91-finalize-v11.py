# Finalize the D1 v1.1 section: fill dir placeholders and add v1.1 notes.
import io

p = '角色卡/测试/docs/change/2026-11-09_D1_document-format-specifications.md'
s = io.open(p, encoding='utf-8').read()

def rep(a, b):
    global s
    assert a in s, 'MISSING: ' + a[:80]
    s = s.replace(a, b)

rep('`编排` DIR_编排；`runtime-core` DIR_RUNTIME；`门禁引擎` DIR_GATE。日志见',
    '`编排` **1164/1140/22/0/2**（exit 1，200s；+1 新 pinned-literal 用例，22 fail/2 skip 与 before 同名同数，diff 空）；`runtime-core` **554/517/33/0/4**（exit 1，49s；diff 空）；`门禁引擎` **472/466/5/0/1**（exit 1，107s；diff 空）。日志见')

rep('未在测试 `allowedConsumers`）；②',
    '未在测试 `allowedConsumers`；**v1.1 已修复消除，见文末**）；②')

rep('**0/1 fail（确定性复现，offender=doc-format-specs.ts）**；',
    '**0/1 fail（确定性复现，offender=doc-format-specs.ts；v1.1 已消除）**；')

rep('| typecheck | `npm run typecheck` **exit 0**（before 副本 2s / after 候选 2s） |',
    '| typecheck | `npm run typecheck` **exit 0**（before 副本 2s / after 候选 2s；v1.1 增量复跑亦 exit 0） |')

rep('`test/测试` 689/629/41/1/18→695/635/41/1/18（+5 新用例；总数 +6 因 after 侧 1 个文件级失败包装按 2 计；after-only 3 项中 1 项确定性新增，见下） |',
    '`test/测试` 689/629/41/1/18→695/635/41/1/18（+5 新用例；总数 +6 因 after 侧 1 个文件级失败包装按 2 计；after-only 3 项中 1 项确定性新增，见下）；**v1.1 增量复验**：请求 6 套件 + 3 目录重跑与基线同名同数、该确定性项消除（见文末） |')

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('v1.1 finalized')
