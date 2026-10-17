// test/测试/su-shell-approval-verify/fixture.ts
// 测试角色：su 命令审批策略独立验证夹具（2026-10-17）。
//
// 纪律：**独立构造**——只读导入产品公开面，自建桩 operator/分类器/临时项目；不复用实施方测试断言。
// 不跑真实破坏性命令：零执行哨兵只用 `process.execPath -e` 写临时目录文件（无 sh -c/rm）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { OperatorChannelFn, OperatorOutcome, OperatorPrompt } from "../../../src/model/runtime.ts";
import type { ClassifyShellFn, ShellClass, ShellRules } from "../../../src/common/编排/shell-gate.ts";

/** 空规则集：分类器由测试注入（判定面与规则数据解耦）。 */
export const EMPTY_RULES: ShellRules = { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] };

/** 固定档位分类器（argv[0] → decision；其余落 review）。 */
export function classifierFor(map: Record<string, ShellClass>): ClassifyShellFn {
  return (argv) => {
    const decision = map[argv[0] ?? ""] ?? "review";
    return { decision, ruleId: `test:${decision}` };
  };
}

/** 单档位分类器。 */
export function classifier(decision: ShellClass, ruleId = `test:${decision}`, reason?: string): ClassifyShellFn {
  return () => (reason === undefined ? { decision, ruleId } : { decision, ruleId, reason });
}

/** 记录调用次数的 operator 桩：outcome 固定或按调用返回。 */
export function operatorStub(
  outcome: OperatorOutcome | (() => Promise<OperatorOutcome>),
  prompts: OperatorPrompt[] = [],
): OperatorChannelFn {
  return async (prompt) => {
    prompts.push(prompt);
    return typeof outcome === "function" ? outcome() : outcome;
  };
}

/** 永不返回的 operator（用于确认超时）。 */
export function hangingOperator(prompts: OperatorPrompt[] = []): OperatorChannelFn {
  return (prompt) => {
    prompts.push(prompt);
    return new Promise<OperatorOutcome>(() => {});
  };
}

export interface TempProject {
  root: string;
  cleanup(): void;
}

/** 临时项目：角色 X + 真实可解析边界（治理边界文档用同一份，供审计边界解析）。 */
export function makeTempProject(): TempProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-su-shell-verify-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n", "utf8");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/thing.ts\n    purpose: 独立验证夹具\n",
    "utf8",
  );
  return {
    root,
    cleanup: () => {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* 忽略清理失败 */
      }
    },
  };
}
