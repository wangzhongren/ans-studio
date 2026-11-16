# 04 — 本机验证原始日志索引（Windows 11 Pro x64, Node v24.22.1；CI 为 Node 24.14.0）

- 00-typecheck.txt：npm run typecheck（tsc --noEmit）；下图尾部 EXIT 行为准。
- 01-w29-w30-run{1,2,3}.txt：node --test --test-timeout=120000 --test-force-exit --test-name-pattern="W29 默认|W30 默认" test/桌面应用/chief-workflow.test.ts（3×）。
  run1 6 tests / 5 pass / 1 fail：W30「真实重启迁移后」在 :1949 报 'Actual draft product must be registered before version two is authored'（本机时序噪声候选，见下）；
  run2、run3 均 6/6 pass。该名单独隔离 3× 全绿（02-*），且与本调查的错误码无关（本机无 file-gate 拒绝）。
- 02-w30-restart-isolated-run{1,2,3}.txt：上述单名隔离 3×，均 1/1 pass。
- 03-junction-alias-w29-w30.txt：TEMP/TMP 指向目录 junction（C:\Users\51054\Desktop\work\ans-temp-alias → C:\Users\51054\AppData\Local\Temp，
  模拟 macOS '/var → /private/var' 符号链接祖先），同一 W29/W30 目标 1×：6/6 pass ⇒ 仅别名根拼写不触发本缺陷。
- 05-runtime-core-p0-canonicalization.txt：test/runtime-core/project-root-canonicalization.test.ts 1×：12/12 pass。
- 06-write-gate-context.txt：test/runtime-core/write-gate-context.test.ts 1×：11/11 pass。

## 精确结果行
### 00-typecheck.txt
EXIT=0
### 01-w29-w30-run1.txt
ℹ tests 6
ℹ pass 5
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
### 01-w29-w30-run2.txt
ℹ tests 6
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
### 01-w29-w30-run3.txt
ℹ tests 6
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
### 02-w30-restart-isolated-run1.txt
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
### 02-w30-restart-isolated-run2.txt
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
### 02-w30-restart-isolated-run3.txt
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
### 03-junction-alias-w29-w30.txt
ℹ tests 6
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
### 05-runtime-core-p0-canonicalization.txt
ℹ tests 12
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
### 06-write-gate-context.txt
ℹ tests 11
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
