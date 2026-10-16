// run-3（带修复的开发版）启动器：electron app/main.ts + CDP + 隔离 user-data + 放宽超时。
// 开发版配置直接读仓库根 .env（公开的既有开发路径）；本启动器不做凭据注入，只在日志里对 .env 值做脱敏。
import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {readEnvFile} from '/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/src/common/shared/env-file.ts';

const repo='/Users/wangzhongren/code/vibeingcode/解压/ans-runtime';
const round='/private/tmp/ans-kanban-dev3-ad1bdf3b';
const envFile=path.join(repo,'.env');
const before=createHash('sha256').update(await readFile(envFile)).digest('hex');
const values=await readEnvFile(envFile);
const extraEnv={ANS_PI_PROMPT_TIMEOUT_MS:'900000',ANS_PI_CONSTRUCT_TIMEOUT_MS:'300000',ANS_PI_SHELL_REVIEW_TIMEOUT_MS:'300000',ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS:'300000'};
const isolated=path.join(round,'userdata');
await mkdir(isolated,{recursive:true});
const childEnv={};
for(const key of ['PATH','HOME','USER','LOGNAME','SHELL','TMPDIR','LANG','LC_ALL','LC_CTYPE','__CF_USER_TEXT_ENCODING'])if(process.env[key])childEnv[key]=process.env[key];
for(const [k,v] of Object.entries(extraEnv))childEnv[k]=v;
const executable=path.join(repo,'node_modules','.bin','electron');
const log=path.join(round,'app.log');
await writeFile(log,'');
const secrets=[...Object.values(values).filter(v=>typeof v==='string'&&v.trim()),...Object.values(extraEnv)];
const child=spawn(executable,['--remote-debugging-port=9444','--user-data-dir='+isolated,'app/main.ts'],{cwd:repo,env:childEnv,stdio:['ignore','pipe','pipe']});
let logText='';
function append(data){let text=data.toString();for(const s of secrets)text=text.split(s).join('[redacted]');logText=(logText+text).slice(-500000);void writeFile(log,logText);}
child.stdout.on('data',append);child.stderr.on('data',append);
await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
const evidence={run:3,mode:'dev-build (electron app/main.ts) with fixes',pid:child.pid,executable,args:['--remote-debugging-port=9444','--user-data-dir='+isolated,'app/main.ts'],cwd:repo,extraEnv,repoEnvSha256:before,repoEnvUnchanged:before===createHash('sha256').update(await readFile(envFile)).digest('hex'),log};
await writeFile(path.join(round,'launch-facts.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({pid:child.pid,repoEnvUnchanged:evidence.repoEnvUnchanged}));
child.on('exit',(code,signal)=>{console.log(JSON.stringify({exit:code,signal}));});
