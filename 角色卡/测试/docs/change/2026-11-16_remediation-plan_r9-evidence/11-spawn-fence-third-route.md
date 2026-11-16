# spawn fence：plat 两路分类之外的第三路（arm64）

## 1. R9 事实

- 测试：`test/编排/git-command.test.ts:45`；失败：`:88:12`
  `assert.equal(cancelled.length, 1, "The never-launched path must record exactly one explicit pre-spawn cancellation")`
- 耗时 227.4ms；`launched.length === 0`（进入路 A 分支）；`cancelled.length === 0`；
  `:80` 的 `cancelled.length + launched.length === processFacts.length` 已通过 ⇒ **processFacts.length = 0**（`.git/ans/processes` 内没有任何进程记录）。
- 同轮 x64（1,511.4ms）与 Windows（1,200.4ms）通过（路 B：至少一条 started 记录）。

## 2. R8 对照（旧测试版，证明消息与路径）

R8（run 43867573699）arm64 与 x64 均在同测试失败，错误体逐字为：

```text
AssertionError: The input did not match the regular expression /git-command-failed:null:unknown/. Input:
'Error: git-host-lease-invalid-before-command'
    at executeGit (file:///.../src/provider/trunk/impl/git-command.ts:728:137)
```

- arm64 栈：`executeGit:728` ← `git-candidate-store.ts:188`（`prepare` 的首个 mutating 命令）；
- x64 栈：`executeGit:728` ← `git-candidate-store.ts:204/201/206`（`writeTree` 的后续命令）。
- 产品代码 `git-command.ts:728`：
  `if (options.hostLeaseId && !checkGitHostAction(...).ok) throw new Error("git-host-lease-invalid-before-command");`
  该分支发生在 `pending` 进程记录写入（`:749-750`）之前，因此**不会**产生任何进程记录。

## 3. 定性

- fs.watch 的中断观察在 arm64（APFS/FSEvents）上先于首个 mutating 命令的 lease 预检到达：
  - 产品在 `:728` 直接以 `git-host-lease-invalid-before-command` fail-closed 拒绝；
  - 没有任何 owned 进程被创建，也没有可写的 `cancelled-before-spawn` 记录；
  - 这是**安全的第三路**（ref 未发布、`update-ref` 未启动、无进程启动），但 plat 的“路 A（无 started ⇒ 恰好 1 条 cancelled）”与“路 B（有 started）”二分未覆盖它。
- 不是产品缺陷：产品在无进程可取消时不会伪造取消记录（这与“No fake successful OS exit is invented”原则一致）。
- 也不是 plat 修复失效：plat 让 x64/Windows 与旧路 B 转绿；arm64 暴露的是分类缺口。

## 4. 最小修复建议（测试侧，plat follow-up）

在 `git-command.test.ts:86-95` 的三分支上增加“路 C”优先分支：

```ts
if (processFacts.length === 0) {
  // 路 C：中断在首个 mutating 命令的 lease 预检前被观察到；无任何 owned 进程记录。
  assert.match(message, /^git-host-lease-invalid-before-command$/, "The pre-record path must still reject through the host lease fence");
  // 共享不变量已覆盖：candidateRef 为 null（:71）；无记录 ⇒ update-ref 必然未启动。
} else if (launched.length === 0) {
  // 路 A（原样保留）
} else {
  // 路 B（原样保留）
}
```

- 不放宽任何安全不变量：`processFacts.length === 0` 天然满足“无 started/unknown 记录、update-ref 未启动”，`objects.readRef(candidateRef) === null` 仍在 `:71` 断言；
- 建议同时把失败断言携带 `message`（诊断），便于下一轮确认路 C 的消息；
- 若 owner 更希望保持“必须有 cancelled 记录”的口径，可选另一条最小修：夹具在 `watch(dir)` 前等待目录创建事件落定（如 `await tick(50)` / 先创建再 `fs.watch` 并丢弃首个目录自身事件），避免 FSEvents 早期事件；但这依赖平台时序，鲁棒性不如路 C 分类。

## 5. 属主与批次

- 属主：测试（plat 批 follow-up；`git-command.test.ts` 单文件）。
- 批次：与 chief-workflow / pending-card-restart 批次可并行（互不重叠）。
