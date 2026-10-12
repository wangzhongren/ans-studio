---
id: session-dir-restore-wiring
type: change
title: 会话自持目录接线（D-1 重启恢复的编排部分）：路径计算与传参
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [governed-interaction-and-chat-ux]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 设计稿 governed-interaction-and-chat-ux §D-1；客户已定存储＝项目内；契约钉死 `sessionDir?: string` 与路径 `<projectRoot>/.ans/sessions/<roleId>/`
  - date: "2026-10-12"
    kind: implemented
    summary: 编排实施——openRoleSession 计算路径并经常规能力面传参；目录创建归适配器（登记理由）；清理本轮不做（登记理由与建议）
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 146/146（+5）；typecheck 全仓零错；全量 731 计/728 过，仅剩 2 条既有环境红
---

# D-1 会话自持目录：编排侧接线

> 依据：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §D-1（重启恢复；客户已定**存储＝项目内**）。契约（钉死）：适配器新增可选 `sessionDir?: string`，约定路径 `<projectRoot>/.ans/sessions/<roleId>/`；适配器接线（SessionManager.create/open）归 **Pi适配器**，恢复流程与界面属**桌面应用**。

## 改在哪里（位置 → 改动）

**`src/pipeline/orchestration/run-role.ts`（唯一改动文件）**
- 新私有函数 `sessionDirFor(projectRoot, roleId)`：算出约定路径（`path.join(projectRoot, ".ans", "sessions", roleId)` + 尾分隔符）；`projectRoot` 为空、或 `roleId` 不安全（空、含 `/`、`\`、`..`）→ `undefined`（**不传，旧行为**）。
- `openRoleSession`：`sessionDir` 随**既有能力面**转交——`deps.createAdapter(gate, capabilities)` 的 `AdapterCapabilities.sessionDir`；`createPiAdapterFactory` 原样转发给 `createPiRuntimeAdapter`（未注入即 undefined，适配器走旧行为）。
- **一次性路径 `runRole`（`ans role run`）不传**（一局即止，无恢复语义）——测试钉住「第二参 capabilities === undefined」。

## 两个决策（写清「谁建、何时建」与清理）

### 1. 目录创建：**归适配器**（编排只算路径、不预建）

协调方建议「编排建会话前 mkdir -p」；我选**允许的备选**并给理由（已同步，见「同步结论」）：
- ① **保既有语义/断言**：目标项目的「不预建 `.ans`」是 T32 起钉住的语义（`test/编排/govern-engine.test.ts` 断言 `ans govern <空目录>` 后 `.ans` 不存在）——编排每次开会话就 mkdir `.ans/sessions/` 会把它打破，也让「创世态（无 `.ans/project.json`）→ 首次收尾才转正」的观感变浑。
- ② **谁落盘谁建目录**：适配器在真正创建会话文件（`SessionManager.create(cwd, sessionDir)`）时创建，避免「编排建了目录但会话从未写」的空目录；恢复路径 `open(path)` 不需要预建。
- ③ 测试本侧**反向断言**：`openRoleSession` 之后 `.ans` 目录**不存在**（钉住本决策）。
- **与 `.ans/project.json`（pin）互不干扰**（已核对，均为既有事实）：载入器只认 `.ans/project.json` 这一个**文件**（`ansProjectPath`），`isGenesisState` 只看它是否存在；pin 校验只读 pin 列出的路径；`listProject`/`repinIfBootstrapped` 只扫 `角色卡/`；finalize 的 manifest 只列 `角色卡//docs/`——都不列 `.ans/`，`sessions/` 的出现不改变任何治理判定。
- **同步结论**：**目录创建归 Pi适配器**。若其 `SessionManager.create` 不自动建父目录，请 Pi侧补一行 `mkdir -p`（本侧不预建）；桌面侧恢复只 `open(path)`，无需建目录。**待 Pi适配器确认后如与其实装不符，两边任一侧一行即可对齐（本侧也可改为预建）**——已如实登记。

### 2. 上限与清理：**本轮不做删除**（只登记待办 + 建议方向）

理由（风险优先）：
- **多进程并发是本项目真实场景**（桌面开着同一项目时跑 CLI `ans govern`；将来多窗口）——上位进程按 mtime「删最旧」可能删到**另一活会话正在追加写的文件**：POSIX 下 `unlink` 不报错、该会话数据静默变孤儿（无崩溃、无法察觉）；Windows 下直接删失败。
- 适配器可能**一个会话多文件**（压缩记录 / branch_summary），「按文件数」裁剪会切坏一个会话的内部一致性。
- mtime 粒度与时钟回拨让「最旧 N 个」的判定不严格。
- **建议方向（将来）**：由**适配器**在「创建新会话时清理**非当前会话**且超龄者」——它天然知道哪个文件是 live；或改为**按龄**清理（如 >30 天且近 N 分钟未修改）并只在项目静默时做。**登记为待办（归 Pi适配器/桌面，届时提方案）**。

## 不改什么

- 恢复流程本身（解析最近会话 → `open` → 喂给 `createAgentSession`；界面只读回放持久 entry）＝ Pi适配器/桌面应用；本层只传路径。
- 无 `sessionDir` 的一切旧行为逐字不变（含 `runRole`、`projectRoot` 为空等）。
- 能力集一致性坑（恢复时注入工具集需与首启一致，否则转录里声明的工具 pending）设计稿已登记，属适配器/桌面。

## 如何确认（实际结果）

- `test/编排/session-dir.test.ts` **5 例全绿**：路径=约定值（含尾分隔符）且**不预建目录**（反向断言）／su 会话同样拿到（「对每个角色」）／`projectRoot` 为空 → 不传／`roleId` 不安全（`su/../evil`）→ 不传且无目录／`runRole` 不传能力面。
- `test/编排/` **146/146**；`npm run typecheck` **全仓零错**；全量 `node --test "test/**/*.test.ts"`（引号带）**731 计 / 728 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）。
- 环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。真机重启恢复（关掉应用重开、记录与上下文都在）属**客户跑**。

## 待办登记（归他角色）

1. **`.gitignore` 建议补 `.ans/sessions/`**（现只忽略 `.ans/runtime/`）：会话 JSONL 含完整对话内容，不应入库——归**装配/pm**（本角色未动 `.gitignore`）。
2. **Pi适配器**：目录创建确认（见上「同步结论」）+ 会话文件命名/上限清理方案（清理机制本轮不做）。
3. **桌面应用**：恢复流程与「能力集变化」提示（设计稿已列）。
