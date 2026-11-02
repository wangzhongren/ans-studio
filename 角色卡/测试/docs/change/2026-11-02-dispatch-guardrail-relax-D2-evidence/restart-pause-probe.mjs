import path from "node:path";
import { pathToFileURL } from "node:url";
import { app } from "electron";
app.setPath("userData", "C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\flow-improvements-wave1\\角色卡\\测试\\docs\\change\\2026-11-02-dispatch-guardrail-relax-D2-evidence\\userData-restart-probe");
app.whenReady().then(async () => {
  try {
    const mod = await import(pathToFileURL("C:\\Users\\51054\\Desktop\\work\\ans-studio\\.claude\\worktrees\\flow-improvements-wave1\\app\\desktop\\interface.ts").href);
    const pause = mod.createShellSessionPauseState();
    const initial = pause.isPaused();
    console.log("RESTART_PAUSED_INITIAL=" + initial);
    console.log("RESTART_SET_RESULT=" + JSON.stringify(pause.set({ paused: true })));
    app.exit(initial === false ? 0 : 4);
  } catch (error) {
    console.log("RESTART_ERROR=" + (error && error.stack ? error.stack : String(error)));
    app.exit(2);
  }
});
