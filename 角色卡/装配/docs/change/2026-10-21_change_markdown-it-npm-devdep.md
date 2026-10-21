---
id: markdown-it-npm-devdep-20261021
type: change
title: markdown-it 改 npm 精确版依赖落盘（安全修正至 15.0.3，devDependencies）；vendor UMD 迁移期保留至 Phase 5
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-unverified
related: [ui-platform-round, ui-platform-round-review]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按产品 revision 2 §4.1/§六 Phase 3 与 PM Q9，把 markdown-it 与类型包精确装入 devDependencies
  - date: "2026-10-21"
    kind: implemented
    summary: 初装 markdown-it@15.0.2 + @types/markdown-it@14.2.0；npm ls 单版本、lock 仅新增、根 tsc exit 0；vendor 未删（Phase 5 再删）
  - date: "2026-10-21"
    kind: corrected
    summary: 安全修正——audit 命中 15.0.2 两条 advisory（GHSA-gfr2-rv44-r23c high、GHSA-vfgh-jcmw-g37q low），经协调方指示升 markdown-it@15.0.3；两条 advisory 消失；同时按依赖宪法把 typescript ^7.0.2 锁为实际安装的 7.0.2
---

# markdown-it 改 npm 精确版：依赖落盘（安全修正至 15.0.3），迁移期与 vendor 并存

按产品提案 revision 2 §4.1「Markdown 唯一选择」与 §六 Phase 3、项目管理评审 Q9（2026-10-21 已答复）执行：markdown-it 从 vendored UMD 改为 **npm 精确版本**（`devDependencies`）＋ `@types/markdown-it`。评审口径明确「封装与测试归桌面UI，**依赖落盘归装配**」——本次只做依赖落盘与登记，不改渲染层封装。

**安全修正（优先于原计划 15.0.2）**：初装 15.0.2 后 npm audit 命中两条 advisory（`GHSA-gfr2-rv44-r23c` high、`GHSA-vfgh-jcmw-g37q` low，均修于 15.0.3），经协调方指示升到 **`markdown-it@15.0.3`**；advisory 消失。同轮按依赖宪法 §4.3 把 `typescript` 从 `^7.0.2` 锁为实际安装的精确版 `7.0.2`。

## 改在哪里

| 位置 | 改动 |
| --- | --- |
| `package.json` | `devDependencies` 新增 `"markdown-it": "15.0.3"`、`"@types/markdown-it": "14.2.0"`；`"typescript"` 由 `"^7.0.2"` 改为 `"7.0.2"`（其余既有依赖逐字未变） |
| `package-lock.json` | 新增 10 个条目（`markdown-it@15.0.3` 及其传递依赖 `argparse`（嵌套 3.0.3）/`mdurl`/`linkify-it`/`entities`/`punycode.js`/`uc.micro`，`@types/markdown-it` 及 `@types/mdurl`/`@types/linkify-it`）；`typescript` 包条目仍为 7.0.2（仅根 devDependencies 规格去 `^`）；**既有依赖零删除、零版本变化**（脚本逐键比对；根条目变更仅上述三项） |
| **未改** | `app/`（含 `app/renderer/vendor/`）、`src/`、`test/`、`vite.config.ts`、其他角色文件 |

## 版本选择

- `markdown-it@15.0.3`：**安全修正后的最终版本**。初装按原计划钉 15.0.2（与 vendored UMD 同版本），audit 确认两条 advisory 后按协调方指示升级到 15.0.3（见下「审计前后对比」）。
- `@types/markdown-it@14.2.0`：npm `dist-tags.latest`（DefinitelyTyped 无 15.x 线，14.2.0 即当前最新精确版）。补充事实：markdown-it 15.x 自身已带 `types: ./dist/markdown-it.d.cts`，TS 模块解析会优先使用包内声明；`@types` 包按 PM 决定照装，供声明面统一/兜底，不构成第二套实现。
- 两包均装 `devDependencies`：Vite 打包进 `app/renderer/dist/`，安装包不携带 `node_modules` 副本；构建工具、类型包与「从 vendor 改 npm 的 markdown-it」按 Q11 不计入 ≤12 运行时新增预算。
- `typescript@7.0.2`：去掉 `^` 精确锁定，落实依赖宪法 §4.3「所有版本精确锁定（无 `^`/`~`）」与 PM 评审 §2.6 的「实施中确认」项；实际安装版本与 lock 条目均为 7.0.2，版本本身未变，仅声明面收敛。

## 审计前后对比

| 状态 | markdown-it 相关 | 全仓合计 |
| --- | --- | --- |
| 安装前 | 无（vendored，不进 npm 树） | 8 moderate（既有 electron-builder 传递链） |
| 初装 15.0.2 | **high `GHSA-gfr2-rv44-r23c`**（CVSS 7.5：单个多行 link reference definition 二次方渲染，14.0 起回归，**默认配置即触发**）＋ **low `GHSA-vfgh-jcmw-g37q`**（`html` 开启时内联 HTML 解析二次方 DoS；本项目封装 `html:false` 可缓解） | 9（8 moderate + 1 high） |
| 升 15.0.3 后 | **两条 advisory 均消失**（npm audit 中 `markdown-it` 不再出现） | **8 moderate**——全部为既有 electron-builder 传递链（`@electron/get`/`app-builder-lib`/`dmg-builder`/`electron-builder`/`electron-builder-squirrel-windows`/`global-agent`/`roarr`/`sprintf-js`），非本轮引入、不属本轮处置 |

**迁移期残留风险（如实登记）**：vendor `app/renderer/vendor/markdown-it.umd.min.js` 仍是 15.0.2——旧渲染器在 Phase 5 切换前继续使用它，因此上述两条 advisory 在**旧渲染器路径仍然存在**，npm 侧修复只覆盖新渲染器。若旧渲染器需长期使用，建议由 vendor 属主（桌面UI，按 `vendor/README.md` 升级流程）评估把 UMD 同步升到 15.0.3；否则按既定 Phase 5 删除 vendor 后风险随旧路径一起消失。

## 与 PM「Phase 3 删 vendor」的执行口径修正

PM 评审 §2.7/Q9 的方向（改 npm、删 vendor、受控渲染配置原样迁移、XSS 负例先绿再删）不变；但**删除时点按实际加载路径修正为 Phase 5**：

- 旧渲染器 `app/renderer/index.html` 在 Phase 5 切换前**仍加载** `app/renderer/vendor/markdown-it.umd.min.js`（`../markdown.js` 封装），Phase 3 若删 vendor 会直接打断旧渲染器。
- 故迁移期口径：**两处并存**；vendor 删除由 Phase 5 执行（vendor 在 `app/` 内，属桌面UI 边界；本角色不越界删除）。
- 版本口径随之更新：初拟「两处同版本 15.0.2、行为不分叉」因安全修正改为 **npm 15.0.3 / vendor 15.0.2 双版本并存**——安全优先；两版本差异仅安全修复，受控渲染配置与 XSS 负例验证仍由 Phase 3 桌面UI 封装迁移负责。Phase 5 切换判据仍按 e2e 逐 check 名对照执行。

## 验证

- `npm ls markdown-it --all` → **`markdown-it@15.0.3` 单版本、exit 0**，无重复；`npm ls @types/markdown-it` → `14.2.0` 单版本；`npm ls typescript` → `7.0.2` 单版本。
- `npx tsc --noEmit` → **exit 0**。
- `npm audit`：markdown-it 条目消失，全仓 8 moderate（既有 electron-builder 链，前后不变）。
- package.json 前后 diff：仅 `+markdown-it 15.0.3`、`+@types/markdown-it 14.2.0`、`typescript ^7.0.2 → 7.0.2` 三处；package-lock 既有条目零删除零版本变化（脚本比对 `packages` 全量键值）。
- **未验证**：真实渲染层 `import markdown-it` 的 Vite 打包与浏览器行为（封装与测试归桌面UI，Phase 3 随聊天流迁移；新入口尚未建立）。
