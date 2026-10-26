import { readFileSync } from "node:fs";
import { render, diagramKind } from "file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/node_modules/grok-mermaid/dist/index.js";
import { parseGraph } from "file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/node_modules/grok-mermaid/dist/parse.js";

const root = "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination";
for (const file of ["README.md", "README.en.md"]) {
  const text = readFileSync(`${root}/${file}`, "utf8");
  const fences = (text.match(/^```/gm) ?? []).length;
  const blocks = [...text.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
  console.log(`${file}: fences=${fences} (even=${fences % 2 === 0}) mermaidBlocks=${blocks.length}`);
  blocks.forEach((block, i) => {
    const kind = diagramKind(block);
    const graph = kind === "flowchart" ? parseGraph(block) : null;
    const art = render(block);
    console.log(`  block#${i}: kind=${kind} parseGraph=${graph === null ? "null" : "ok"} render=${art === null ? "null" : "ok"}`);
    if (art !== null && art.warnings.length > 0) {
      console.log(`  warnings(${art.warnings.length}):`);
      for (const warning of art.warnings.slice(0, 20)) console.log(`    - ${warning}`);
    }
  });
}
