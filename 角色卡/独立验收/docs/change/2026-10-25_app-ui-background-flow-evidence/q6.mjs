import { connect, reload } from "./cdp.mjs";

const outDir =
  "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/角色卡/独立验收/docs/change/2026-10-25_app-ui-background-flow-evidence";
const client = await connect();
try {
  // 1) 输入框聚焦：实际 focus 后读 capsule 计算样式（冷色）
  const focus = await client.eval(`(async () => {
    const input = document.querySelector("#inp-message");
    if (!input) return null;
    input.focus();
    await new Promise((r) => setTimeout(r, 120));
    const capsule = input.closest(".capsule");
    const cs = capsule ? getComputedStyle(capsule) : null;
    return {
      activeElement: document.activeElement && document.activeElement.id,
      capsuleBorder: cs ? cs.borderColor : null,
      capsuleShadow: cs ? cs.boxShadow : null,
      inputOutline: getComputedStyle(input).outlineStyle,
      infoToken: getComputedStyle(document.documentElement).getPropertyValue("--info").trim(),
      infoBorderToken: getComputedStyle(document.documentElement).getPropertyValue("--info-border").trim(),
    };
  })()`);
  console.log("FOCUS=" + JSON.stringify(focus, null, 2));
  await client.screenshot(outDir + "/03_composer_focus.png");

  // 2) 工作态样式探针：临时节点（测量后移除，不改应用状态）
  const working = await client.eval(`(() => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;top:0;display:flex;";
    const avatar = document.createElement("span");
    avatar.className = "ti-avatar is-working";
    const chip = document.createElement("span");
    chip.className = "ti-status role-status-chip is-working";
    chip.textContent = "工作中";
    const row = document.createElement("div");
    row.className = "tree-item is-working";
    const chatChip = document.createElement("span");
    chatChip.className = "chat-role-working role-status-chip is-working";
    chatChip.textContent = "工作中";
    host.append(avatar, chip, row, chatChip);
    document.body.appendChild(host);
    const s = (el, props) => {
      const cs = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
    };
    const result = {
      avatar: s(avatar, ["border-color", "box-shadow", "animation-name", "animation-duration"]),
      chip: s(chip, ["color", "background-color", "border-color", "font-size", "height"]),
      row: s(row, ["background-color", "box-shadow", "border-left-width"]),
      chatChip: s(chatChip, ["color", "background-color", "border-color", "height"]),
      workingRulesForTreeItem: (() => {
        const found = [];
        for (const sheet of document.styleSheets) {
          let rules; try { rules = sheet.cssRules; } catch { continue; }
          for (const rule of rules) {
            if (rule.selectorText && /tree-item\\.is-working|tree-item\\[data-status=["']working/.test(rule.selectorText)) {
              found.push(rule.cssText.slice(0, 300));
            }
          }
        }
        return found;
      })(),
    };
    host.remove();
    return result;
  })()`);
  console.log("WORKING_STYLE=" + JSON.stringify(working, null, 2));

  // 3) 点击工作概览入口（只开抽屉，不触发写操作）
  const drawer = await client.eval(`(async () => {
    const tab = document.querySelector("#tab-work");
    if (!tab) return { error: "no #tab-work" };
    tab.click();
    await new Promise((r) => setTimeout(r, 2500));
    const flow = document.querySelector(".flow-status");
    const bg = document.querySelector(".background-tasks");
    const sectionText = (el) => el ? el.innerText.replace(/\\n/g, " | ").slice(0, 700) : null;
    return {
      drawerOpen: !!document.querySelector(".app.drawer-open"),
      flowSection: sectionText(flow),
      flowUnavailable: !!document.querySelector(".flow-unavailable"),
      flowError: document.querySelector(".flow-load-error")?.innerText || null,
      bgSection: sectionText(bg),
      bgUnavailable: !!document.querySelector(".background-unavailable"),
      bgError: document.querySelector(".background-load-error")?.innerText || null,
    };
  })()`);
  console.log("DRAWER=" + JSON.stringify(drawer, null, 2));
  await client.screenshot(outDir + "/04_work_overview_panels.png");

  // 4) 关闭抽屉，恢复初始视图
  await client.eval(`(() => { const b = document.querySelector("#drawer-close"); if (b) b.click(); })()`);
} finally {
  client.close();
}
