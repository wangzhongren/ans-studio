import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

await import(new URL("../../app/renderer/runtime-ui.js", import.meta.url).href);
await import(new URL("../../app/renderer/role-status.js", import.meta.url).href);
await import(new URL("../../app/renderer/tool-rows.js", import.meta.url).href);
const Rt = (globalThis as any).ANSRuntimeUI;
const St = (globalThis as any).ANSRoleStatus;
const Tr = (globalThis as any).ANSToolRows;
const renderer = fs.readFileSync(new URL("../../app/renderer/renderer.js", import.meta.url), "utf8");

test("三元视图身份不串项目或引擎，旧缺身份只兼容 Pi", () => {
  assert.notEqual(Rt.viewKey("project-a", "pi"), Rt.viewKey("project-a", "codex"));
  assert.notEqual(Rt.viewKey("project-a", "pi"), Rt.viewKey("project-b", "pi"));
  assert.equal(Rt.matchesView({ projectRoot: "a", runtime: "pi" }, "a", "pi"), true);
  assert.equal(Rt.matchesView({ projectRoot: "b", runtime: "pi" }, "a", "pi"), false);
  assert.equal(Rt.matchesView({ projectRoot: "a", runtime: "claude" }, "a", "codex"), false);
  assert.equal(Rt.matchesView({}, "a", "pi"), true);
  assert.equal(Rt.matchesView({}, "a", "codex"), false);
});

test("只按 IPC 组摘要分组：组长置前、未知职责原文保留、缺组不推权限", () => {
  const roles = [{ roleId: "member", group: "运行时接入组", groupDuty: "组员" }, { roleId: "unknown", group: "运行时接入组", groupDuty: "<script>x</script>" }, { roleId: "lead", group: "运行时接入组", groupDuty: "组长" }, { roleId: "loose", groupDuty: "组长" }];
  const groups = Rt.roleGroups(roles);
  assert.deepEqual(groups[0].roles.map((r: any) => r.roleId), ["lead", "member", "unknown"]);
  assert.equal(groups[0].roles[2].groupDuty, "<script>x</script>");
  assert.equal(groups[1].name, "其他角色（查看/调试）");
  assert.deepEqual(groups[1].roles, [roles[3]]);
  assert.deepEqual(roles.map(r => r.roleId), ["member", "unknown", "lead", "loose"]);
});

test("设置来源和应用时点只呈现窗口实际字段", () => {
  assert.equal(Rt.sourceLabel({ source: "fallback", fallbackKey: "OPENAI_API_KEY" }), "回退（OPENAI_API_KEY）");
  assert.equal(Rt.sourceLabel({ source: "environment" }), "环境");
  assert.equal(Rt.sourceLabel({ source: "unrecognized" }), "来源未报告");
  assert.match(Rt.applicationLabel("after-active-turn"), /当前轮次继续使用原配置/);
  assert.match(Rt.applicationLabel("next-session"), /下一次开启/);
  assert.equal(Rt.applicationLabel(undefined), "配置应用时点未报告。");
});

test("上下文未知/只读历史不冒充原生恢复；重建原因准确呈现", () => {
  assert.equal(St.sessionContextNotice({ hadHistory: true }).text, "");
  assert.match(St.sessionContextNotice({ contextSource: "recovered" }).text, /模型上下文一并恢复/);
  const notice = St.sessionContextNotice({ contextSource: "fresh", contextWarning: "原生恢复失败，已重建上下文。" });
  assert.match(notice.text, /已重建上下文/);
  assert.doesNotMatch(notice.text, /文件损坏|一并恢复/);
});

test("实际工具元数据保留 turn/call/runtime；未报告结果不称完成", () => {
  const row = Tr.activityOf({ runtime: "codex", turnId: "turn-1", kind: "accepted", summary: "工具返回", detail: { toolName: "read_file", callId: "call-1", status: "unreported" } });
  assert.equal(row.runtime, "codex"); assert.equal(row.turnId, "turn-1"); assert.equal(row.callId, "call-1");
  assert.equal(row.status, "unknown"); assert.equal(row.label, "状态未记录");
});

test("实际 Codex args/ok 和 Core call/result 消费明确目标与结果，Claude未报告继续未知", () => {
  const call = Tr.activityOf({kind:"tool_call",runtime:"codex",turnId:"t",summary:"read_file",detail:{toolName:"read_file",toolCallId:"c",args:{path:"actual.md"}}});
  assert.equal(call.fullTarget,"actual.md"); assert.equal(call.callId,"c"); assert.equal(call.status,"call");
  assert.equal(Tr.activityOf({kind:"accepted",summary:"read_file 返回",detail:{toolName:"read_file",ok:true}}).status,"completed");
  const result = Tr.activityOf({kind:"accepted",turnId:"t",summary:"实际结果",detail:{call:{name:"run_shell",toolCallId:"nested",args:{command:"echo literal"}},result:{ok:false}}});
  assert.equal(result.toolName,"run_shell"); assert.equal(result.callId,"nested"); assert.equal(result.fullTarget,"echo literal"); assert.equal(result.status,"failed");
  assert.equal(Tr.activityOf({kind:"accepted",summary:"read_file 返回",detail:{toolName:"read_file",toolCallId:"claude-c"}}).status,"unknown");
});

test("renderer 仅消费 IPC，机密为空且无持久化，切引擎不停止后台任务", () => {
  const switchBody = renderer.slice(renderer.indexOf("  async function selectRuntime("), renderer.indexOf("  function captureChatReading("));
  assert.doesNotMatch(switchBody, /d\.(?:stopSession|abortSession)/);
  assert.match(renderer, /inp\.value = ""; \/\/ 绝不回显值/);
  assert.doesNotMatch(renderer, /localStorage|sessionStorage|node:fs|require\("fs"\)|import\(/);
  assert.match(renderer, /onOperatorExpired/);
  assert.match(renderer, /entry\.runtime !== state\.runtime/);
});

test("权威turn/event/完整文本与逐次出现计数：不同轮同文、同轮重复、未知legacy不混", () => {
  const row = {kind:"assistant",eventKind:"message",turnId:"one",text:"相同回答"};
  const another = {...row,turnId:"two"};
  assert.notEqual(Rt.replayKey(row),Rt.replayKey(another));
  assert.notEqual(Rt.replayKey(row),Rt.replayKey({...row,eventKind:"denied"}));
  assert.equal(Rt.replayKey({kind:"assistant",text:"相同回答"}),null);
  assert.equal(Rt.replayKey({kind:"assistant",turnId:"one",text:"相同回答"}),null);
  assert.equal(Rt.replayCounts([row,row,another])[Rt.replayKey(row)],2);
  assert.equal(Rt.replayCounts([row,row,another])[Rt.replayKey(another)],1);
  assert.notEqual(Rt.tokenId({key:Rt.replayKey(row),occurrence:1}),Rt.tokenId({key:Rt.replayKey(row),occurrence:2}));
});

test("客户端气泡只按窗口clientMessageId与真实turnId绑定，不猜最新/同文", () => {
  const bind = renderer.slice(renderer.indexOf("  function bindManualTurn("),renderer.indexOf("  function renderOneEvent("));
  assert.match(bind,/manualMessages\[env\.clientMessageId\]/);
  assert.match(bind,/typeof ev\.turnId !== "string"/);
  assert.match(bind,/message\.roleId !== env\.roleId/);
  assert.doesNotMatch(bind,/lastManualSend|lastRuntime|latest|find\(.*text/);
  assert.match(renderer,/window\.crypto\.randomUUID\(\)/);
});
