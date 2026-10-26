import { boundaryChangePathIsGovernanceCritical } from "file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/app/desktop/boundary-change.ts";

const oldPattern = /^(?:vite|vitest|playwright|electron-builder|forge|webpack|rollup|eslint|prettier)\.config\.[^/]+$/i;
const newPattern = /^(?:vite|vitest|playwright|forge|webpack|rollup|eslint|prettier)\.config\.[^/]+$/i;
const ymlPattern = /^electron-builder\.ya?ml$/i;

for (const p of ["electron-builder.config.ts", "electron-builder.config.js", "electron-builder.config.mjs", "electron-builder.yml", "electron-builder.yaml", "electron-builder.json", "vite.config.ts"]) {
  console.log(p, JSON.stringify({
    currentFunction: boundaryChangePathIsGovernanceCritical(p),
    oldConfigPattern: oldPattern.test(p),
    newConfigPattern: newPattern.test(p),
    ymlPattern: ymlPattern.test(p),
  }));
}
