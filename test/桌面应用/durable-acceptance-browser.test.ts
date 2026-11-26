import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const source = (file: string) => readFile(new URL(`../../app/${file}`, import.meta.url), "utf8");

test("the desktop keeps ANS native windows while retiring the acceptance window and execution wiring", async () => {
  const [main, opening, desktop, workspaces] = await Promise.all([
    source("main.ts"), source("desktop/session/lifecycle/open.ts"), source("desktop/durable-workflow.ts"),
    source("desktop/durable-acceptance-workspace.ts"),
  ]);
  assert.match(main, /function createWindow\(\): BrowserWindow[\s\S]*?new BrowserWindow\(/);
  await assert.rejects(access(new URL("../../app/desktop/durable-acceptance-browser.ts", import.meta.url)), { code: "ENOENT" });
  for (const content of [main, opening, desktop, workspaces]) {
    assert.doesNotMatch(content, /electronAcceptanceBrowser|exerciseAcceptanceBrowser|runAcceptanceWorkspace|createServer\(|\.listen\(|sendInputEvent|capturePage/);
  }
  assert.match(opening, /evidenceAuditAccess/);
});
