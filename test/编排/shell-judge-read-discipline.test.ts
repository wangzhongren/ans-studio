// test/编排/shell-judge-read-discipline.test.ts
// shell 判断 agent 系统提示的**读取纪律**（真机：Proof 复核连续跑 shell，判断 agent
// 报「读取预算已用尽」回落手动）。本文件只钉提示词内容，不触碰规则层/审批语义/工具面。
//
// 覆盖：先列目录再定点读、只读与「系统风险审查」直接相关的证据、大文件范围参数
// （offset/limit 或 startLine/endLine）、不读 data/** 与日志/构建产物/会话审计目录、
// 同一文件不重复读、预算耗尽如实 manual 不猜测、curl/测试脚本优先看命令与上下文。

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildShellJudgeSystemPrompt } from "../../src/common/编排/shell-judge-prompt.ts";

test("读取纪律：先 judge_list_dir 了解结构，只读与系统风险审查直接相关的证据", () => {
  const system = buildShellJudgeSystemPrompt();
  assert.match(system, /【读取纪律/);
  assert.match(system, /先 judge_list_dir 了解结构/);
  // 2026-10-19 定位修正：判断 agent 不再是「业务必要性审查」，而是系统风险审查；
  // 本断言随语义从「是否必要」改为「是否存在系统风险」，覆盖强度不变。
  assert.match(system, /只读与「这条命令是否存在系统风险」直接相关的证据/);
  assert.match(system, /不做全项目扫描/);
  // 判断依据优先是命令本身，而不是项目全貌。
  assert.match(system, /命令原文、规范化 argv、cwd、来源档位与当前轮任务文本/);
  assert.match(system, /不要为了「了解项目」而通读源码/);
});

test("读取纪律：大文件用范围参数定点抽查，不整文件反复读", () => {
  const system = buildShellJudgeSystemPrompt();
  assert.match(system, /定点抽查/);
  assert.match(system, /offset\/limit/);
  assert.match(system, /startLine\/endLine/);
  assert.match(system, /不整文件反复读/);
  // 工具描述同步暴露范围参数（工具面本身不变：仍是同一只读工具）。
  assert.match(system, /judge_read_file：读取项目内文本/);
  assert.match(system, /两种模式二选一/);
});

test("读取纪律：不读 data/**、日志、构建产物、会话/审计目录（除非命令直接操作且必须核对）", () => {
  const system = buildShellJudgeSystemPrompt();
  assert.match(system, /不读 data\/\*\*/);
  assert.match(system, /日志/);
  assert.match(system, /\*\.log/);
  assert.match(system, /构建产物/);
  assert.match(system, /会话\/审计目录/);
  assert.match(system, /除非命令本身直接操作它们且必须核对内容/);
});

test("读取纪律：同一文件不重复读，预算耗尽如实 manual、不猜测", () => {
  const system = buildShellJudgeSystemPrompt();
  assert.match(system, /同一文件不要重复读取/);
  assert.match(system, /已读过的同一路径视为已知/);
  assert.match(system, /读取预算耗尽/);
  assert.match(system, /如实交回 manual/);
  assert.match(system, /不得猜测未读取的内容/);
  assert.match(system, /更不得据此 allow/);
});

test("读取纪律：本地服务 curl/测试脚本优先看命令、cwd、argv 与角色任务上下文", () => {
  const system = buildShellJudgeSystemPrompt();
  assert.match(system, /本地服务的 curl\/测试脚本/);
  assert.match(system, /优先依据命令、cwd、argv 和角色任务上下文判断/);
  assert.match(system, /不要为了「了解项目」通读服务源码或测试源码/);
});

test("既有语义不变：工具面与输出契约仍在，系统提示稳定可复现", () => {
  const first = buildShellJudgeSystemPrompt();
  const second = buildShellJudgeSystemPrompt();
  assert.equal(first, second, "系统提示在请求之间稳定");
  assert.match(first, /judge_list_dir/);
  assert.match(first, /judge_read_file/);
  assert.match(first, /report_shell_judgement/);
  assert.match(first, /不可信数据/);
  assert.match(first, /你没有写文件、执行命令、网络、抓取或客户交互工具/);
  assert.match(first, /manual：仅限判断无法发生/);
});
