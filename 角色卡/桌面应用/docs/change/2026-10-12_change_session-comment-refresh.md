---
id: session-comment-refresh
type: change
title: 更正 app/desktop/session.ts 的会话路径注释（T32 后理由已过时）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [cli-govern-finalize-wiring]
events:
  - date: "2026-10-12"
    kind: created
    summary: 独立核实事后确认——session.ts 会话路径注释的理由述过时（骨架预建已删、空 writeSet 已被引擎收窄、行号 121 漂移）；给出替换文案与 app/** 有界扫描结果，待客户确认后实施
  - date: "2026-10-12"
    kind: implemented
    summary: 客户批准 M1+O1 后实施——session.ts:287-295 注释块按成稿文案替换（行号 121→170、新增「更正」段指向 govern-session.ts 的 effectiveScope 处）；changelog/memo 的 T30 条目各加「更正见…」指针；「统一入口评估」本次未派、未做
  - date: "2026-10-12"
    kind: verified
    summary: npm run typecheck exit 0 / 0 错；node --test "test/桌面应用/*.test.ts" 95 计 / 94 过 / 1 红——与改动前基线逐项一致，1 红为既有环境红（pi-config 断言检出目录名 ans-cli、本机为 ans-runtime），未动、未修
---

# 更正 `app/desktop/session.ts` 的会话路径注释（T32 后理由已过时）

**来源**：编排角色在 2026-10-12 的 fix 文档「跨角色影响」第 2 条如实指出本处注释可能过时（见
`角色卡/编排/docs/fix/2026-10-12_fix_cli-govern-finalize-wiring.md:138`）。**本页不采信该转述**——以下
核实结论全部来自本角色对**当前工作区源码**的独立逐行核对（证据的行号见各条）。

> **状态：已实施、已验证（2026-10-12；客户批准 M1+O1 后照本文成稿文案实施）。** 本次改动只有**一段代码
> 注释的文案**与两处历史条目指针，代码行为一字未变（会话仍经 `openRoleSession` + `scope: undefined`）。
> 命令与实测见文末「实施与证据」。

## 这次改的是一段注释：行为零变化

改前：以后维护这段代码的人读到的是**已经失效的理由**（引擎早已改完、注释没跟上），据此可能得出错误结论
（例如以为「桌面不能改走治理会话入口」仍成立）。

改后：注释只讲**现在真实成立的事**，并把「引擎当前行为」指向唯一权威处（引擎源码），本层不复制它的描述。

**程序行为、参数、分支、界面文案一字不动**——本层仍经 `openRoleSession` + `scope: undefined` 开会话
（`app/desktop/session.ts:296-311`），用户体验没有任何变化。

## 核实结论（逐句对照现状）

对象：`app/desktop/session.ts:285-295`（`SessionManager.open` 内、`openRoleSession` 调用前的注释块）。
逐句判定如下（「保留」＝现文仍准确；「过时」＝与现状不符，需改）：

| 行 | 原句要点 | 对照现状（证据） | 判定 |
| --- | --- | --- | --- |
| 287 | 「会话路径裁决（T30）：沿用 `openRoleSession` + `scope: undefined`，不改走 `openGovernanceSession`」 | 代码事实仍如此：`session.ts:296-311` 经 `this.deps.openRoleSession(...)` 开会话、未传 `scope`（=undefined） | **保留** |
| 288-289 前半 | 理由（§12.2）：创世门口在**边界选择层**（`genesisBootstrap`，由 `buildProjectConfig` 按 `hasRoles` 设） | 属实：`app/desktop/project.ts:110-115` 在 `listing.hasRoles === false` 时设 `genesisBootstrap`；门禁引擎侧种子条目为三处普通 `directory`（`src/common/门禁引擎/governance-seed.ts:9,18,33`） | **保留** |
| 289 后半-290 前半 | 「`openGovernanceSession` 现仍在**内部**用 `buildGovernScope(boundary, roleIds)` 造 scope」 | 机制仍在（`src/pipeline/orchestration/govern-session.ts:157-158`），但「现仍…」引出的后果结论已不成立（见下两行）——整句的暗示（障碍尚在）过时 | **改写** |
| 290 后半-291 前半 | 「（且开会话前先经 `writeGovernanceSkeleton` 落骨架，属 T32 待退役面）」 | **过时**。T32 已落地：预建骨架逻辑已删（`govern-session.ts:21-25` 文件头「不再预建骨架（T32）」），骨架模块 `src/common/编排/bootstrap.ts` **整文件已删**（现目录无此文件），`writeGovernanceSkeleton` 全仓无代码存在（见下节） | **删/更正** |
| 291 后半-292 前半 | 「——对空项目它会产出 `writeSet: []`，F4 精确匹配下**拒一切写**，与 §12.2「`scope: undefined`」相悖」 | **过时**。现行引擎在 `conditions` 与 `writeSet` 均空时（正是创世种子 + 无目标角色）把 scope 收窄为 `undefined`：`govern-session.ts:159-164`（`effectiveScope`）。即：对空项目它**不再**产出空 writeSet 拒一切写，恰好表达出 `scope: undefined` | **更正** |
| 292 后半-293 前半 | 「要让它表达 `scope: undefined` 须改它本身，而它属**编排**边界（`src/pipeline/orchestration/`），非本角色可动」 | 前半**过时**（它已被改，现就表达 `scope: undefined`，证据同上行）；后半（归属编排边界）仍属实 | **更正前半、保留归属说明** |
| 293 后半-295 | 「沿用 `openRoleSession`——它本就是 `openGovernanceSession` 内部**同样经其开启会话**的**同一底层会话入口**（govern-session.ts:121）…不是第二套会话机制；只把「未 bootstrap」经 `genesisBootstrap` 交给门禁引擎」 | 实质结论**仍属实**：`openGovernanceSession` 内部确经 `openRoleSession` 开会话（现 `govern-session.ts:170` 调用）。**行号过时**：121 行现是 finalize 接口注释正文；且该行号从未对应当前提交形态（最初提交 `c263d87` 中该调用在第 171 行，现 170 行） | **改行号 121→170** |

一句话结论：**裁决本身与「同一底层入口」的结论仍成立；过时的是它所依赖的两个事实（预建骨架未退役 / 空
writeSet 会拒一切写 → 「须改它本身」）以及一个行号（121→170）。**

### `writeGovernanceSkeleton` 全仓搜索结果（是否真的已不存在）

- **代码引用/导入：零。** 全仓 grep（`src/**`、`app/**`、`test/**`）：无任何 `import`/调用；
  `src/common/编排/bootstrap.ts` 已不存在。`app/**` 内唯一命中就是**本处注释自身**
  （`app/desktop/session.ts:290`）——**没有待处理的导入面**，改这句注释无编译/运行时影响。
- 其余命中全部是**历史文档/注释的提及**（非代码）：`test/编排/govern-engine.test.ts:12,33`、
  `test/编排/govern.test.ts:13,39`（「已退役」注解）；`角色卡/编排/changelog.md`（T16/T32 历史）、
  `角色卡/编排/memo.md:14,17`；`角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md`
  （§12 各处）；`角色卡/桌面应用/changelog.md:589`、`memo.md:36`（本角色，见「相邻发现」）；
  `govern-session.ts:22` 头注释与 `src/common/门禁引擎/{governance-seed.ts:5,boundary-core.ts:14}`
  的「§6 违规已修复」说明。**这些提及无需改**（历史记录或准确的现状说明）。

## 拟改动（位置 → 替换文本）

**位置**：`app/desktop/session.ts`，仅替换 **287-295 行**注释块（285-286 行「`scope 传 undefined`…」那两行
保持不动）；无任何代码改动。

**替换文本（建议文案，逐行照插）**：

```ts
      // **会话路径裁决（T30）：沿用 `openRoleSession` + `scope: undefined`，不改走 `openGovernanceSession`。**
      // 理由（§12.2）：创世的门口放在**边界选择层**（`genesisBootstrap`，由 `buildProjectConfig` 按
      // `hasRoles` 设），`scope` 保持 `undefined`（普通聊天）——本层只把「未 bootstrap」这一授权事实经
      // `genesisBootstrap` 交给门禁引擎。`openRoleSession` 本就是 `openGovernanceSession` 内部**同样经其
      // 开启会话**的**同一底层会话入口**（`govern-session.ts:170`），**不是第二套会话机制**。
      //
      // 更正（2026-10-12）：原 T30 理由已过时——「对空项目产出 `writeSet: []`、F4 精确匹配拒一切写，
      // 要让它表达 `scope: undefined` 须改它本身；且开会话前先经 `writeGovernanceSkeleton` 落骨架
      // （属 T32 待退役面）」**已全部失效**：预建骨架随 T32 退役（模块 `src/common/编排/bootstrap.ts`
      // 已删），引擎现于 `conditions`/`writeSet` 均空时把 scope 收窄为 `undefined`（权威表述见
      // `src/pipeline/orchestration/govern-session.ts` 的 `effectiveScope` 处，本层不复制）。
      // 桌面是否统一改走该入口：另行评估（更正记录见
      // `角色卡/桌面应用/docs/change/2026-10-12_change_session-comment-refresh.md`）。
```

**单一来源纪律说明**：替换文案不展开引擎收窄的实现细节（那是编排源码处注释的职责），只给
「指向它」的路径；「更正」段保留，是为了让读到过 T30 旧文（以及同理由仍留在 changelog/memo 历史条目里）
的人知道**障碍已被移除、裁决未变**，不会误把旧理由当现行依据。

## 有界扫描：`app/**` 里还有没有描述同一行为的过时处

扫描方法：在 `app/**` 全量 grep「骨架 / writeSet / openGovernanceSession / writeGovernanceSkeleton /
bootstrap.ts / SCAFFOLD / F4 / 拒一切 / 落骨架 / 预建 / T32」，并人工抽查创世/finalize 相关注释与界面文案。
**逐条结果**：

1. **`app/desktop/session.ts:287-295`——即本提案对象（唯一命中），过时，本次改。**
2. 无其它同行为引用：`app/**` 内没有第二处提到治理骨架或空 writeSet 的注释/文案（负结果，grep 证据）。
3. 同词异义、**不属**同一行为（已排查、无需改）：`app/renderer/styles.css:56,123` 的「三栏骨架」指
   **界面布局**（CSS 注释），与治理骨架无关。
4. 相邻行为（创世/收口）文案抽查**均与现状一致**、无需改：`app/desktop/project.ts:92-124`（genesisBootstrap
   触发与切换条件）、`app/desktop/interface.ts:66-67,147-156`、`app/main.ts:125-165,226-229`、
   `app/preload.cjs:29-39`、`app/renderer/index.html:82-87`、`app/renderer/renderer.js:79-89,225-267`
   （「项目尚未 bootstrap：与 <主入口> 对话，让它创建角色」一句在 T30 接线后为真，现仍真）。

## 相邻发现（扫描边界之外，仅登记、本次不改）

同一过时理由还在本角色**历史记录**里（以及他角色文档中）：

- `角色卡/桌面应用/changelog.md:589-590`（T30 条目正文与「govern-session.ts:121」行号）与
  `:614`（「需 T32 先把它改为不预建骨架且接受 scope: undefined…当前它做不到」——**T32 已落地，该前置
  已满足**）。
- `角色卡/桌面应用/memo.md:36`（T30 条目，同理由、同行号）。
- `角色卡/编排/docs/fix/2026-10-12_fix_cli-govern-finalize-wiring.md:138`（编排如实指出本问题之处，无需动）。

这些是**带日期的历史记录**（当时所述属实），按文档纪律**不倒填、不改写成现状**；是否加一行「更正见…」
指针，见选装 O1。

## 必做项 / 选装

**必做（本提案的全部代码面改动）：**

- [x] **M1：替换 `app/desktop/session.ts:287-295` 注释块**（替换文本见上；含行号 121→170 修正）。
  **客户 2026-10-12 批准，已实施**（见「实施与证据」）。
  不做的后果（提案期）：注释继续误导后续维护者（三处旧理由与现状相反）。

**选装：**

- [x] **O1：在历史条目处加一行「更正」指针**（`角色卡/桌面应用/changelog.md` 的 T30 条目 +
  `memo.md` 的 T30 行各加一句「2026-10-12 更正：…见
  `docs/change/2026-10-12_change_session-comment-refresh.md`」）。
  **客户 2026-10-12 批准，已实施**（落点：changelog T30 条目「边界登记」节末尾 + memo T30 行末；
  只加指针，历史正文未改写）。
  好处：从 changelog/memo 读到旧理由的人能一步找到现状（注释改在代码里，历史记录里没有线索指过去）。
  代价：轻触两条历史条目（只加指针、不改写原记录）；不加也不影响任何行为，只是线索少一环。

（**没有其它选装**。「桌面是否统一改走 `openGovernanceSession`」不列为选装——它是行为变更，见下节。）

## 拟跑证据（提案期拟定的验证计划；实测结果见文末「实施与证据」）

- `npm run typecheck` → 预期 **0 错**（纯注释改动不参与类型；当前工作区它角色在制品是否已清零另行如实记录）。
- `node --test "test/桌面应用/*.test.ts"` → 提案时按本角色 changelog 记录写「基线 95 过 / 0 红」；
  **实施时实测本机基线为 95 计 / 94 过 / 1 红（那 1 红是既有环境红，见文末）**——本改动的预期改为
  「**与改动前基线逐项一致**」（注释改动不影响用例）。已核对：`test/桌面应用/**` 无用例断言该注释文本
  （唯一「源码不变式」测试 `renderer.test.ts` 读的是 `app/renderer/**`、`app/preload.cjs`、`app/main.ts`，
  **不读 `session.ts`**）。
- **不跑 e2e**：无行为/界面变化（本角色惯例 e2e 用于界面与行为变更）。
- 若另跑全量 `node --test "test/**/*.test.ts"`：工作区现有他角色未提交改动（`src/index.ts`、
  `src/interface/cli/govern.ts`、`test/装配/**`、`test/编排/**`），计数可能波动——届时另附如实说明。
- 实施后：更新本页（status/事件）并按本角色惯例在 `changelog.md` 追加条目。

## 不在本次范围内（逐条与归属）

1. **任何代码行为**：`session.ts` 的参数/分支/接口一字不动（含不要「顺手统一到治理入口」）。
2. **`test/**`**：无需改动（无用例触及该注释）。
3. **桌面统一改走 `openGovernanceSession` 的评估/实施**：引擎侧障碍（无法表达 `scope: undefined`、预建骨架）
   现已被移除，T30 当时「理想形态＝统一入口」的前置条件发生变化；但那是**行为变更**，影响 su 会话的边界
   解析/收口接线等面，须**另立提案**并单独评审（客户可另行派发）。
4. **改写历史记录正文**：changelog/memo 的 T30 条目保持原文（除 O1 获批的指针外）。
5. **他角色文件**：`src/**`、`test/测试/**`、`角色卡/编排|装配|测试/**` 只读、不动。
6. **本轮纪律**：不启动 Electron、不发真实模型请求、不读 `.env`。

## 本提案的边界落点

- 本页落点 `角色卡/桌面应用/docs/change/`（Section 1 已授权目录，本角色首个 change 记录）。
- 实施面：`app/desktop/session.ts`（注释）、本页、`changelog.md`（+ O1 获批时的 `memo.md`）——均在白名单内。

## 实施与证据（2026-10-12，客户批准 M1+O1 后）

**实际改动**（全部在 Section 1 内；`git diff` 已核对）：

- `app/desktop/session.ts`：287 起旧注释 9 行 → 成稿文案 13 行（285-286 未动）；**纯注释 diff，无任何
  代码行变化**（会话仍经 `openRoleSession` + `scope: undefined`）。
- `角色卡/桌面应用/changelog.md`：① T30 条目「边界登记」节末尾 +1 行「2026-10-12 更正」指针（历史正文
  未改写）；② 文件顶部新增 2026-10-12 条目（本角色惯例：落地变更入 changelog）。
- `角色卡/桌面应用/memo.md`：T30 行末追加同款更正指针（原文未改写）。
- 「桌面统一改走 `openGovernanceSession` 的评估」：协调方确认本次不派，**保持登记、未做**。

**实测（本机，2026-10-12；改动前后各跑一次）**：

- `npm run typecheck` → **exit 0、0 处 `error TS`**（改动前同样 0 错）。
- `node --test "test/桌面应用/*.test.ts"` → **95 计 / 94 过 / 1 红**；**与改动前基线逐项一致**
  （改动前：95 计 / 94 过 / 1 红）。那 1 红为**既有环境红**：`test/桌面应用/pi-config.test.ts:60` 断言
  `resolveRepoEnvPath()` 以 `path.join("ans-cli", ".env")` 结尾，而本机检出目录名为 `ans-runtime`——
  与本次注释改动无关，**未动、未修**（遵守协调方「不要动那条断言」）。
- **结论：注释改动对用例计数的影响 = 无**（与提案预期一致）。
- 未跑 e2e（无行为/界面变化）；未启动 Electron、未发真实模型请求、未读/打印 `.env`。
