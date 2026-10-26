import { connect } from "./cdp.mjs";

const outDir =
  "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/角色卡/独立验收/docs/change/2026-10-25_app-ui-background-flow-evidence";
const client = await connect();
try {
  // 1) 打开一个 deny 判断卡的详情，读取结构与命令出现次数
  const deny = await client.eval(`(() => {
    const row = document.querySelector(".shell-judge-row.is-deny");
    if (!row) return null;
    const details = row.querySelector("details.sj-details");
    details.open = true;
    const labels = [...details.querySelectorAll(".sj-d-label")].map((el) => el.innerText.trim());
    const sections = [...details.querySelectorAll(".sj-detail-section")].map((el) => el.innerText.trim().slice(0, 200));
    const full = row.innerText;
    const cmdEl = details.querySelector(".sj-pre code");
    const cmd = cmdEl ? cmdEl.innerText.trim() : "";
    return {
      labels,
      sectionCount: sections.length,
      sections,
      command: cmd,
      commandOccurrencesInRow: cmd ? full.split(cmd).length - 1 : 0,
      commandPreCount: details.querySelectorAll(".sj-pre code").length,
      evidenceListCount: details.querySelectorAll(".sj-list li").length,
      tierText: row.querySelector(".sj-tier-badge")?.innerText || null,
      detailsOpen: details.open,
    };
  })()`);
  console.log("DENY_DETAILS=" + JSON.stringify(deny, null, 2));

  await client.eval(`(() => {
    const row = document.querySelector(".shell-judge-row.is-deny");
    row.scrollIntoView({ block: "center" });
  })()`);
  await new Promise((r) => setTimeout(r, 400));
  await client.screenshot(outDir + "/01_judge_deny_details.png");

  // 2) 找一个带 stdout/stderr/长输出的工具行，打开并读取
  const tools = await client.eval(`(() => {
    const records = [...document.querySelectorAll(".tool-call-record")];
    const chosen = records.find((el) => {
      const text = el.innerText || "";
      return /run_shell|findstr|playwright/.test(text);
    }) || records[0];
    if (!chosen) return null;
    chosen.open = true;
    const details = chosen.querySelector(".tool-call-details");
    const model = details ? details.innerText : "";
    const outputSections = [...chosen.querySelectorAll(".tool-output")].map((el) => ({
      stream: el.getAttribute("data-stream"),
      lines: el.getAttribute("data-lines"),
      label: el.querySelector(".sj-d-label")?.innerText.trim(),
      more: !!el.querySelector(".tool-output-more"),
      moreCount: el.querySelector(".tool-output-more-count")?.innerText || null,
      preview: el.querySelector(".sj-pre")?.innerText.slice(0, 160),
    }));
    const commands = [...chosen.querySelectorAll(".tool-details-structured > .sj-detail-section .sj-pre code")]
      .map((el) => el.innerText.trim());
    const summaryText = chosen.querySelector("summary")?.innerText || "";
    const summaryRect = chosen.querySelector("summary")?.getBoundingClientRect();
    return {
      summary: summaryText.replace(/\\n/g, " | ").slice(0, 200),
      summaryHeight: summaryRect ? Math.round(summaryRect.height) : null,
      structured: !!chosen.querySelector(".tool-details-structured"),
      timeline: chosen.querySelector(".tool-detail-timeline")?.innerText.slice(0, 240) || null,
      processMeta: chosen.querySelector(".tool-process-meta")?.innerText || null,
      commandBlocks: commands,
      commandBlockCount: commands.length,
      outputSections,
      errorBlock: !!chosen.querySelector(".tool-error-block"),
    };
  })()`);
  console.log("TOOL_DETAILS=" + JSON.stringify(tools, null, 2));

  await client.eval(`(() => {
    const records = [...document.querySelectorAll(".tool-call-record")];
    const chosen = records.find((el) => el.open) || records[0];
    chosen.scrollIntoView({ block: "center" });
  })()`);
  await new Promise((r) => setTimeout(r, 400));
  await client.screenshot(outDir + "/02_tool_details_structured.png");
} finally {
  client.close();
}
