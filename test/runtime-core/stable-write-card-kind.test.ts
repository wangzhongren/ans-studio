// 运行时核心 C1b 契约测试：app-owned `stable-write` 卡种收口（关闭 C1 冻结遗留 F2）。
// 基线：P1.6 §4.5.1/§4.10 + PM 复审 §4.5/§13 F2 + P1 r2 §3.3-1 + C1 冻结记录 §六.1 + C2c 冻结记录 §六。
// 编译期断言由 `npm run typecheck` 覆盖（tsconfig include 含 test/）；运行时断言用 node --test。
import test from "node:test";
import assert from "node:assert/strict";
import {
  GOVERNANCE_APP_OWNED_CARD_KINDS,
  GOVERNANCE_CARD_GROUP,
  GOVERNANCE_CARD_KINDS,
  governanceCardGroup,
  type AppOwnedGovernanceCardKind,
  type GovernanceCardKind,
  type GovernanceChoiceCardKind,
  type GovernanceConfirmCardKind,
  type RequestCreatedEvent,
  type RequestResolvedEvent,
} from "../../src/model/runtime.ts";

const OLD_CHOICE_KINDS = ["proposal", "appointment", "acceptance", "intent-confirm", "decision"] as const;
const OLD_GROUP_KEYS = [
  "acceptance",
  "appointment",
  "appointment-write",
  "decision",
  "download",
  "intent-confirm",
  "proposal",
] as const;

test("卡种联合（F2）：GovernanceCardKind 接受 app-owned stable-write；两交互工具联合均不含它", () => {
  const kind: GovernanceCardKind = "stable-write";
  assert.equal(kind, "stable-write");
  const appOwned: AppOwnedGovernanceCardKind = "stable-write";
  assert.equal(appOwned, "stable-write");

  // 旧卡种仍全部合法（加法不改变既有成员）
  const oldKinds: GovernanceCardKind[] = [...OLD_CHOICE_KINDS, "appointment-write", "download"];
  assert.equal(oldKinds.length, 7);

  // `stable-write` 不是 request_choice / request_confirmation 可发卡种（类型侧拒绝；工具层不可发）
  // @ts-expect-error stable-write 不属于 GovernanceChoiceCardKind
  const choice: GovernanceChoiceCardKind = "stable-write";
  // @ts-expect-error stable-write 不属于 GovernanceConfirmCardKind
  const confirm: GovernanceConfirmCardKind = "stable-write";
  assert.equal(choice as string, "stable-write");
  assert.equal(confirm as string, "stable-write");

  // 账本 request.created/resolved 的 cardKind 可携带 stable-write（D1/S4 记账消费）
  const created: Pick<RequestCreatedEvent, "cardKind"> = { cardKind: "stable-write" };
  const resolved: Pick<RequestResolvedEvent, "cardKind"> = { cardKind: "stable-write" };
  assert.equal(created.cardKind, "stable-write");
  assert.equal(resolved.cardKind, "stable-write");
});

test("request_confirmation 卡种不变：GovernanceConfirmCardKind 仍仅 appointment-write", () => {
  const only: GovernanceConfirmCardKind = "appointment-write";
  assert.equal(only, "appointment-write");
  // @ts-expect-error download 仍不是 confirm 卡种
  const download: GovernanceConfirmCardKind = "download";
  // @ts-expect-error stable-write 不是 confirm 卡种
  const stable: GovernanceConfirmCardKind = "stable-write";
  assert.equal(download as string, "download");
  assert.equal(stable as string, "stable-write");
});

test("document-revision 由应用呈现，保留账本身份并排除通用工具卡种", () => {
  const kind: AppOwnedGovernanceCardKind = "document-revision";
  const created: Pick<RequestCreatedEvent, "cardKind"> = { cardKind: kind };
  const resolved: Pick<RequestResolvedEvent, "cardKind"> = { cardKind: kind };
  assert.equal(created.cardKind, "document-revision");
  assert.equal(resolved.cardKind, "document-revision");
  // @ts-expect-error 内置文件修订卡仅由应用呈现
  const choice: GovernanceChoiceCardKind = "document-revision";
  // @ts-expect-error 内置文件修订卡仅由应用呈现
  const confirm: GovernanceConfirmCardKind = "document-revision";
  assert.equal(choice, kind);
  assert.equal(confirm, kind);
  assert.equal(governanceCardGroup(kind), undefined);
});

test("workflow-blocked-scope 由应用呈现并保留账本卡种", () => {
  const kind: AppOwnedGovernanceCardKind = "workflow-blocked-scope";
  const created: Pick<RequestCreatedEvent, "cardKind"> = { cardKind: kind };
  const resolved: Pick<RequestResolvedEvent, "cardKind"> = { cardKind: kind };
  assert.equal(created.cardKind, "workflow-blocked-scope");
  assert.equal(resolved.cardKind, "workflow-blocked-scope");
  // @ts-expect-error 工作流卡点选择仅由应用呈现
  const choice: GovernanceChoiceCardKind = "workflow-blocked-scope";
  // @ts-expect-error 工作流卡点选择仅由应用呈现
  const confirm: GovernanceConfirmCardKind = "workflow-blocked-scope";
  assert.equal(choice, kind);
  assert.equal(confirm, kind);
  assert.equal(governanceCardGroup(kind), undefined);
});

test("判断分组不变：GROUP 精确键集不变；stable-write 永不判断/代选", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(GOVERNANCE_CARD_GROUP, "stable-write"), false);
  assert.equal(governanceCardGroup("stable-write"), undefined);
  assert.equal(governanceCardGroup("stable-write" as never), undefined);
  assert.deepEqual(Object.keys(GOVERNANCE_CARD_GROUP).sort(), [...OLD_GROUP_KEYS]);
  for (const [oldKind, group] of [
    ["appointment-write", "approval"],
    ["download", "approval"],
    ["proposal", "decision"],
    ["appointment", "decision"],
    ["acceptance", "decision"],
    ["intent-confirm", "decision"],
    ["decision", "decision"],
  ] as const) {
    assert.equal(governanceCardGroup(oldKind), group, `旧卡种 ${oldKind} 分组不变`);
  }
  assert.equal(governanceCardGroup(undefined), undefined);
  assert.equal(governanceCardGroup("write" as never), undefined);
});

test("白名单单一来源：GOVERNANCE_CARD_KINDS = GROUP 键集 ∪ app-owned 非判断卡种，无重复无遗漏", () => {
  const appOwned = ["stable-write", "merge-main", "workflow-start", "document-revision", "workflow-blocked-scope"] as const;
  assert.deepEqual([...GOVERNANCE_APP_OWNED_CARD_KINDS], appOwned);
  assert.equal(Object.isFrozen(GOVERNANCE_APP_OWNED_CARD_KINDS), true);
  assert.equal(Object.isFrozen(GOVERNANCE_CARD_KINDS), true);
  assert.equal(Object.isFrozen(GOVERNANCE_CARD_GROUP), true);
  assert.deepEqual([...GOVERNANCE_CARD_KINDS].sort(), [...OLD_GROUP_KEYS, ...appOwned].sort());
  assert.equal(GOVERNANCE_CARD_KINDS.length, 12, "GROUP 7 键 + app-owned 5 键");
  assert.equal(new Set(GOVERNANCE_CARD_KINDS).size, GOVERNANCE_CARD_KINDS.length, "白名单不得重复");
  assert.equal(GOVERNANCE_CARD_KINDS.includes("stable-write"), true);
  assert.equal(GOVERNANCE_CARD_KINDS.includes("merge-main"), true);
  assert.equal(GOVERNANCE_CARD_KINDS.includes("workflow-start"), true);
  for (const key of Object.keys(GOVERNANCE_CARD_GROUP) as GovernanceCardKind[]) {
    assert.equal(GOVERNANCE_CARD_KINDS.includes(key), true, `GROUP 键 ${key} 必须在白名单内`);
  }
  for (const kind of appOwned) {
    assert.equal(Object.prototype.hasOwnProperty.call(GOVERNANCE_CARD_GROUP, kind), false, `${kind} 必须在 GROUP 外`);
    assert.equal(governanceCardGroup(kind), undefined);
  }
});
