// RR4 proposal-card draft-run real-run launcher (outside repo): isolated userData, then the real worktree app/main.ts unchanged.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { app } from "electron";
const userData = process.env.ANS_RR_USERDATA;
if (!userData) throw new Error("ANS_RR_USERDATA is required");
fs.mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);
delete process.env.ANS_DEV_SERVER_URL;
const repoMain = process.env.RR_REPO_MAIN || "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment/app/main.ts";
await import(pathToFileURL(repoMain).href);
