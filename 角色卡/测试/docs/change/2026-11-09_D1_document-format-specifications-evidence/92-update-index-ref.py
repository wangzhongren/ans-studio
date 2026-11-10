# Update the evidence index hash and add a v1.1 artifacts row in §6.
import io

p = '角色卡/测试/docs/change/2026-11-09_D1_document-format-specifications.md'
s = io.open(p, encoding='utf-8').read()

old = '21141c0d0ceafae4a16489833798f453a33bc78d0262255842056747306703af'
new = '2be581bc2c09487880961fdd6b14d7e418a3e8285e1f37897549762c31ed7aa9'
assert old in s
s = s.replace(old, new)

anchor = '| 批次证据抽查 | `60-batch-evidence-spotcheck.txt`、`64-batch-evidence-spotcheck-2.txt` |'
assert anchor in s
s = s.replace(anchor, anchor + '\n| v1.1 增量（2026-11-10） | `10b-verify-candidate-v11.mjs`、`80-v11-candidate-hashes.txt`、`81-v11-manifest-listing.txt`、`82-v11-manifest-and-budget.txt`、`84-v11-writeset-external.txt`、`85-v11-import-graph.txt`、`86-v11-quick-diffs.txt`、`89-v11-registry-reference-graph.txt`、`v11-*.tap.txt`、`v11-dir-*.tap.txt`、`v11-diff-dir-*.txt`、`15b-v11-final-snapshot.txt`、`87-update-record-v11.py`、`88-append-v11-section.py`、`91-finalize-v11.py` |')

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('index hash updated')
