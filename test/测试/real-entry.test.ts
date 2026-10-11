// 测试角色:通过**真实入口** node bin/ans.js 验证完整流程、退出码与 §7 演示输出。
// 归属:test/测试/。这些用例只驱动产品入口,不复制门禁引擎的单测。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runCli, REPO_ROOT } from "./helpers.ts";

// —————————————————————— 成功路径(§7 演示应看到什么) ——————————————————————

test("真实入口:ans role run 编排 --task T-1 以 0 结束", () => {
  const r = runCli(["role", "run", "编排", "--task", "T-1"]);
  assert.equal(r.status, 0, `stderr=${r.stderr}`);
});

test("真实入口:演示输出含角色/边界来源、两笔写入、按根分组、settled", () => {
  const r = runCli(["role", "run", "编排", "--task", "T-1"]);
  const out = r.stdout;
  assert.match(out, /已解析角色 编排/);
  assert.match(out, /已解析边界/);
  assert.match(out, /角色卡\/编排\/boundary\.yaml/);
  // 两笔写入,且都在写入之前先过 gate(工具集已建立 + 两次 runtime 请求)
  assert.match(out, /runtime 请求 write_file -> src\/evil\.ts/);
  assert.match(out, /runtime 请求 write_file -> src\/common\/编排\/output\.ts/);
  // 第一笔:越界拒绝,按根分组(skill: / project:)
  assert.match(out, /拒绝写入 src\/evil\.ts/);
  assert.match(out, /skill:/);
  assert.match(out, /project:/);
  // 第二笔:边界内但 writeSet 外(F4)
  assert.match(out, /F4/);
  // 以 settled 结束
  assert.match(out, /\[settled\]/);
});

test("真实入口:演示**不产生** docs/scheduling 记录(F3)", () => {
  const schedulingDir = path.join(REPO_ROOT, "docs", "scheduling");
  runCli(["role", "run", "编排", "--task", "T-1"]);
  assert.equal(existsSync(schedulingDir), false, "不应存在 docs/scheduling/");
});

// —————————————————————— 失败路径必须非 0 ——————————————————————
//
// 退出码约定（src/common/编排/exit-codes.ts）：0=成功；2=用法/参数错误；1=运行时失败。
// 契约判定（本角色判断，理由见 changelog）：
//   · 具体码 **2** 属**稳定契约**——只由 argv 决定（同一非法 argv 在任何环境都得到 2）：
//     未知角色/未知参数/多余参数/缺少必需参数。故这些用例**逐条断言 ===2**（「用法错误必须是 2」有明确语义）。
//   · 具体码 **1**（运行时失败）**依赖运行时/环境**——同一 argv 在不同环境可能得到不同码
//     （如 `ans govern` 的失败取决于真实 Pi 适配器所需 provider 配置是否存在）。断言其具体码属
//     **过度约束**：每次环境/上游行为一变即连带失败。故此类用例（未给 code）**只断言「非 0」**。
//   · 两类都**必须非 0**：失败路径绝不静默成功。

const FAIL_CASES: Array<{ name: string; argv: string[]; code?: number }> = [
  { name: "未知角色", argv: ["role", "run", "不存在的角色", "--task", "T-1"], code: 2 },
  { name: "缺角色 id", argv: ["role", "run", "--task", "T-1"], code: 2 },
  { name: "缺 --task", argv: ["role", "run", "编排"], code: 2 },
  { name: "--task 缺值", argv: ["role", "run", "编排", "--task"], code: 2 },
  { name: "多余参数", argv: ["role", "run", "编排", "--task", "T-1", "多余"], code: 2 },
  { name: "未知命令", argv: ["bogus"], code: 2 },
  { name: "未知 role 子命令", argv: ["role", "frobnicate", "编排"], code: 2 },
  // govern 已从占位改为**真治理会话**（接收装配注入的配置、走真实 Pi 适配器）。无参调用**有**配置通道了，
  // 真实失败原因改为「真实 Pi 适配器缺 provider 配置」——构造会话适配器时缺 base URL。这是**运行时**失败，
  // 具体码取决于环境（此处不给 code，只断言非 0）。实测 `node bin/ans.js govern` → 退出码 1，stderr 含
  // 「缺少 base URL：…请通过 opts.baseUrl 或环境变量 ANS_PI_BASE_URL 显式提供」。
  { name: "govern 缺真实 Pi 适配器 provider 配置（ANS_PI_BASE_URL 等未设）", argv: ["govern"] },
];

for (const c of FAIL_CASES) {
  test(`真实入口失败路径非 0:${c.name}`, () => {
    const r = runCli(c.argv);
    assert.notEqual(r.status, 0, "失败路径必须以非 0 结束");
    if (c.code !== undefined) {
      assert.equal(r.status, c.code, `用法错误契约：期望退出码 ${c.code}；stderr=${r.stderr}`);
    }
  });
}

// —————————————————————— 成功但占位的 command ——————————————————————

test("真实入口:help/doctor 以 0 结束", () => {
  assert.equal(runCli(["--help"]).status, 0);
  assert.equal(runCli(["doctor"]).status, 0);
});

// `ans init` 命令已**废除**(客户:改为「导入空文件夹 → 与内置治理角色 su 对话 → su 建角色」;
// 编排 T16 删除 src/interface/cli/init.ts,装配 cli-parse 去掉 init 分支 → 归 unknown)。
//
// 故此处**不再**断言 init 的退出码/产出:那是**已不存在的命令**,为它保留断言只会让人以为它还在。
// 仅钉住一点回归——`ans init` 不得再静默成功,且不再生成骨架(骨架写入能力已保留为 su 的写路径)。
// **不写死具体码**:2 只是「未知命令」这条既有分支的返回值,不是 init 的契约(该分支已由上方
// FAIL_CASES「未知命令」覆盖)。
// 实测(测试角色):`node bin/ans.js init` 与 `node bin/ans.js init <临时目录>` 均 → 2,
// stderr「错误:未知命令:init」,且不生成任何骨架。
test("真实入口:ans init 已废除(作为未知命令以非 0 结束,且不再生成骨架)", () => {
  // 无参:归「未知命令」分支。
  const r = runCli(["init"]);
  assert.notEqual(r.status, 0, "已废除的命令不得静默成功");
  assert.match(r.stderr, /未知命令/);

  // 带目录:即便给了目录也不再生成骨架(用系统临时目录,结束即清理,不在仓库留文件)。
  const dir = mkdtempSync(path.join(tmpdir(), "ans-init-"));
  try {
    const rd = runCli(["init", dir]);
    assert.notEqual(rd.status, 0, "已废除的命令不得静默成功");
    assert.equal(existsSync(path.join(dir, ".ans", "project.json")), false, "不应生成骨架 .ans/project.json");
    assert.equal(existsSync(path.join(dir, "docs")), false, "不应生成骨架 docs/");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("真实入口:doctor 打印装配自检与六个角色", () => {
  const r = runCli(["doctor"]);
  assert.match(r.stdout, /== ans doctor/);
  assert.match(r.stdout, /边界接受来源:/);
  for (const role of ["项目管理", "编排", "门禁引擎", "Pi适配器", "装配", "测试"]) {
    assert.match(r.stdout, new RegExp(`- ${role}:`));
  }
});
