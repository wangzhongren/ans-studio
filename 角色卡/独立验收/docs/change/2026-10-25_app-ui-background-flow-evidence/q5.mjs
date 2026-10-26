import { connect } from "./cdp.mjs";

const client = await connect();
try {
  const r = await client.eval(`(() => {
    const chosen = [...document.querySelectorAll(".tool-call-record")].find((el) => el.open);
    if (!chosen) return null;
    const details = chosen.querySelector(".tool-call-details");
    const sections = [...details.querySelectorAll(".sj-detail-section")].map((el) => ({
      label: el.querySelector(".sj-d-label")?.innerText.replace(/\\n/g, " / ") || "",
      cls: el.className,
      preCount: el.querySelectorAll(".sj-pre").length,
      dataStream: el.getAttribute("data-stream"),
      dataLines: el.getAttribute("data-lines"),
      textLen: el.innerText.length,
      first40: el.innerText.slice(0, 40).replace(/\\n/g, " | "),
    }));
    const direct = [...details.querySelectorAll(":scope > p")].map((el) => ({ cls: el.className, text: el.innerText.slice(0, 160) }));
    return {
      summary: chosen.querySelector("summary").innerText.replace(/\\n/g, " | "),
      topLevelClasses: [...details.children].map((el) => el.tagName + "." + el.className),
      sections,
      direct,
      totalSections: sections.length,
    };
  })()`);
  console.log(JSON.stringify(r, null, 2));
} finally { client.close(); }
