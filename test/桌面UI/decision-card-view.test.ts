// test/桌面UI/decision-card-view.test.ts
// E 批：decision 卡在独立对话框中的视图（标题/选项/推荐/来源），不再投到聊天流。

import assert from "node:assert/strict";
import { test } from "node:test";

import { decisionView } from "../../app/renderer/src/chat/decision-dialog.ts";

const payload = {
  id: "op-1",
  roleId: "rapporteur",
  request: {
    kind: "choice",
    title: "是否接受提案？",
    cardKind: "proposal",
    options: [
      { id: "accept", label: "接受" },
      { id: "revise", label: "修改" },
    ],
  },
};

test("decision 卡视图：标题/来源/选项逐项可见；无推荐项时不伪造", () => {
  const view = decisionView(payload);
  assert.equal(view.title, "是否接受提案？");
  assert.equal(view.sourceRoleId, "rapporteur");
  assert.equal(view.cardKind, "proposal");
  assert.deepEqual(view.options.map((option) => option.id), ["accept", "revise"]);
  assert.equal(view.recommendedId, null);
  assert.equal(view.answerable, true);
});

test("唯一推荐项进入 recommendedId，但不自动提交", () => {
  const view = decisionView({
    ...payload,
    request: { ...payload.request, options: [{ id: "a", label: "A" }, { id: "b", label: "B", recommended: true }] },
  });
  assert.equal(view.recommendedId, "b");
});
