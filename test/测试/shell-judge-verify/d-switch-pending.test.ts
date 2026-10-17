// test/测试/shell-judge-verify/d-switch-pending.test.ts
// 测试角色：已挂起卡与开关切换的时点语义独立验证（2026-10-17）。
//
// 覆盖（PM 评审 §12.2-8 与 §12.1 A15/R20）：
//   · 卡已挂起后勾选开关：该卡不受影响（不被交给判断 agent），只影响之后新到的请求；
//   · 判断进行中关闭开关：以通道调用时点为准（本次判断结果仍生效），之后的新请求回手动；
//   · 手动批准后审计归人工（不带 judge）。
//
// 全部离线；假 presenter（挂起/放行）/假适配器；不触真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";

import type { OperatorPresenter } from "../../../app/desktop/operator-channel.ts";
import {
  lastAudit,
  makeChain,
  makeJudge,
  makeTempProject,
  REQUEST,
  setJudgeEnabled,
} from "./fixture.ts";

function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (predicate()) return resolve();
      if (Date.now() > deadline) return reject(new Error("fixture wait timed out"));
      setTimeout(tick, 2);
    };
    tick();
  });
}

test("已挂起卡：勾选开关不影响该卡，判断 agent 0 次调用；随后新请求才走判断", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "claude",
      script: { report: { verdict: "allow", reason: "任务需要运行测试" } },
    });
    let entered = 0;
    let release!: (allow: boolean) => void;
    const pending = new Promise<boolean>((resolve) => { release = resolve; });
    const presenter: OperatorPresenter = {
      async present() {
        entered += 1;
        const allow = await pending;
        return { allow };
      },
    };
    const chain = makeChain({
      root: project.root,
      runtime: "claude",
      judge,
      classify: "risky",
      operatorOnly: true,
      presenter,
    });

    const first = chain.gate(REQUEST("pending-card-1"));
    await until(() => entered === 1);
    setJudgeEnabled(chain, true); // 卡已挂起后才开启
    assert.equal(chain.switchState.isEnabled(), true);
    release(true);
    const firstResult = await first;
    assert.equal(firstResult.allow, true);
    assert.equal(entered, 1, "已挂起卡只出现一次（未被交给判断 agent）");
    assert.equal(fake.seen.binds, 0, "已挂起卡不得调用判断 agent");
    const firstRecord = lastAudit(chain);
    assert.ok(firstRecord.by.endsWith("→ operator:客户"), "手批后审计人工");
    assert.equal("judge" in firstRecord, false);

    // 之后的新请求才按开启态走判断。
    const second = await chain.gate(REQUEST("pending-card-2"));
    assert.equal(second.allow, true);
    assert.equal(entered, 1, "新请求不得再弹卡");
    assert.equal(fake.seen.binds, 1);
    assert.equal(chain.rows.length, 1);
    const secondRecord = lastAudit(chain);
    assert.ok(secondRecord.by.endsWith("→ operator:judge:claude"));
    assert.ok(secondRecord.judge !== undefined);
  } finally {
    await project.cleanup();
  }
});

test("判断进行中关闭开关：以通道调用时点为准，本次结果仍生效；之后恢复手动", async () => {
  const project = await makeTempProject();
  try {
    let reportEntered = false;
    let release!: () => void;
    const gatePromise = new Promise<void>((resolve) => { release = resolve; });
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "pi",
      script: {
        report: async () => {
          reportEntered = true;
          await gatePromise;
          return { verdict: "allow", reason: "任务明确要求该命令" };
        },
      },
    });
    const chain = makeChain({
      root: project.root,
      runtime: "pi",
      judge,
      classify: "risky",
      operatorOnly: true,
    });
    setJudgeEnabled(chain, true);

    const pending = chain.gate(REQUEST("mid-flight-1"));
    await until(() => reportEntered);
    setJudgeEnabled(chain, false); // 判断已开始后才关闭
    release();
    const result = await pending;
    assert.equal(result.allow, true, "本次判断（调用时点已开启）仍生效");
    assert.equal(chain.displays.length, 0, "不得弹卡");
    assert.equal(chain.rows.length, 1);
    assert.equal(fake.seen.binds, 1);

    // 之后的新请求回手动。
    const next = await chain.gate(REQUEST("mid-flight-2")).catch(() => undefined);
    assert.ok(next !== undefined);
    assert.equal(next!.allow, false, "默认 presenter 拒绝");
    assert.equal(chain.displays.length, 1, "后续请求恢复手动确认卡");
    assert.equal(fake.seen.binds, 1, "关闭后判断 agent 不再调用");
    const record = lastAudit(chain);
    assert.ok(record.by.endsWith("→ operator:客户"));
    assert.equal("judge" in record, false);
  } finally {
    await project.cleanup();
  }
});
