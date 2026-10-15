import path from "node:path";

/** Host-only verification arguments; no renderer capability or model task is introduced. */
export function parsePackagedSmokeArguments(argv: readonly string[]): { resultPath: string; userDataPath: string } | undefined {
  const index = argv.indexOf("--ans-packaged-smoke");
  if (index < 0) return undefined;
  const resultPath = argv[index + 1];
  const switchValue = argv.find(value => value.startsWith("--user-data-dir="))?.slice("--user-data-dir=".length);
  const separate = argv.indexOf("--user-data-dir");
  const userDataPath = switchValue ?? (separate >= 0 ? argv[separate + 1] : undefined);
  if (!resultPath || !path.isAbsolute(resultPath) || !userDataPath || !path.isAbsolute(userDataPath)) {
    throw new Error("Packaged smoke requires absolute result and isolated userData paths.");
  }
  return { resultPath, userDataPath };
}

/** Runs against the actual packaged window's DOM, preload and existing IPC, without importing a project or saving. */
export function packagedSmokeScript(expectedEnvPath: string): string {
  return `(async () => {
    const expectedEnvPath = ${JSON.stringify(expectedEnvPath)};
    const bridge = window.desktop;
    const dom = !!document.querySelector('.app') && !!document.getElementById('runtime-select');
    const preload = !!bridge && typeof bridge.getRecoveryState === 'function' && typeof bridge.getRuntimeConfig === 'function';
    if (!preload) return {checks:{dom,preload,ipc:false,importDisabled:false,missingConfiguration:false,settings:false,envPathMatches:false},missingKeys:{}};
    const recovery = await bridge.getRecoveryState();
    const configs = await Promise.all(['pi','codex','claude'].map(runtime => bridge.getRuntimeConfig(runtime)));
    const ipc = !!recovery && configs.every((view,index) => view.runtime === ['pi','codex','claude'][index] && Array.isArray(view.missingKeys));
    const importDisabled = recovery.projectRoot == null && document.getElementById('runtime-select').disabled === true;
    const missingConfiguration = configs.every(view => view.missingKeys.length > 0);
    const envPathMatches = configs.every(view => view.path === expectedEnvPath);
    const trigger = document.getElementById('tab-pi'), drawer = document.getElementById('right-drawer'), close = document.getElementById('drawer-close');
    let opened = false, closed = false;
    if (trigger && drawer && close) {
      trigger.click(); opened = drawer.getAttribute('aria-hidden') === 'false';
      close.click(); closed = drawer.getAttribute('aria-hidden') === 'true';
    }
    return {checks:{dom,preload,ipc,importDisabled,missingConfiguration,settings:opened && closed,envPathMatches},missingKeys:Object.fromEntries(configs.map(view => [view.runtime,view.missingKeys]))};
  })()`;
}
