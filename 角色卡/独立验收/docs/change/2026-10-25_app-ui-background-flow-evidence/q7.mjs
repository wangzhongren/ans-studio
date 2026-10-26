import { connect } from "./cdp.mjs";

const outDir =
  "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/角色卡/独立验收/docs/change/2026-10-25_app-ui-background-flow-evidence";
const client = await connect();
try {
  const state = await client.eval(`(() => {
    const rows = [...document.querySelectorAll(".tree-item")].map((el) => {
      const avatar = el.querySelector(".ti-avatar");
      const chip = el.querySelector(".ti-status");
      const rect = el.getBoundingClientRect();
      return {
        role: el.querySelector(".ti-name")?.innerText,
        status: el.getAttribute("data-status"),
        classes: el.className,
        active: el.classList.contains("active"),
        rowStyle: (() => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, shadow: cs.boxShadow }; })(),
        avatarStyle: avatar ? (() => { const cs = getComputedStyle(avatar); return { border: cs.borderColor, shadow: cs.boxShadow, anim: cs.animationName }; })() : null,
        chipText: chip ? chip.innerText.trim() : null,
        chipStyle: chip ? (() => { const cs = getComputedStyle(chip); return { color: cs.color, bg: cs.backgroundColor, border: cs.borderColor }; })() : null,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      };
    });
    return rows.filter((r) => r.status === "working" || r.active);
  })()`);
  console.log(JSON.stringify(state, null, 2));
  await client.screenshot(outDir + "/05_working_state_sidebar.png");
  const clip = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    clip: { x: 0, y: 0, width: 420, height: 560, scale: 1 },
  });
  const fs = await import("node:fs");
  fs.writeFileSync(outDir + "/06_working_state_sidebar_clip.png", Buffer.from(clip.data, "base64"));
} finally { client.close(); }
