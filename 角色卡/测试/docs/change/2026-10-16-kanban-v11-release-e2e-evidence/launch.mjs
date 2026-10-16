// run-5：公开 v1.1.0 正式运行包真机测试轮。隔离用户目录 + 放宽超时 + CDP。
// 凭据只从仓库 .env 单次读取注入子进程环境；值不出现在日志与证据里。
import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {readEnvFile} from '/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/src/common/shared/env-file.ts';

const repo='/Users/wangzhongren/code/vibeingcode/解压/ans-runtime';
const round='/private/tmp/ans-kanban-v11-9d2e5c41';
const workspace='/Users/wangzhongren/code/vibeingcode/ans-testbed/kanban-live-5';
const envFile=path.join(repo,'.env');
const before=createHash('sha256').update(await readFile(envFile)).digest('hex');
const values=await readEnvFile(envFile);
const keys=['ANTHROPIC_AUTH_TOKEN','ANS_PI_BASE_URL','ANS_PI_MODEL','ANS_PI_CONTEXT_WINDOW'];
if(keys.some(k=>!values[k]?.trim()))throw Error('Required Pi configuration incomplete; values withheld');
const extraEnv={ANS_PI_PROMPT_TIMEOUT_MS:'900000',ANS_PI_CONSTRUCT_TIMEOUT_MS:'300000',ANS_PI_SHELL_REVIEW_TIMEOUT_MS:'300000',ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS:'300000',ANS_PI_SHELL_EXEC_TIMEOUT_MS:'180000'};
const isolated=path.join(round,'userdata');
await mkdir(isolated,{recursive:true});
let absent=false;try{await stat(path.join(isolated,'.env'));}catch(e){if(e.code==='ENOENT')absent=true;else throw e;}
if(!absent)throw Error('Isolated .env unexpectedly exists');
const childEnv={};
for(const key of ['PATH','HOME','USER','LOGNAME','SHELL','TMPDIR','LANG','LC_ALL','LC_CTYPE','__CF_USER_TEXT_ENCODING'])if(process.env[key])childEnv[key]=process.env[key];
for(const key of keys)childEnv[key]=values[key];
for(const [k,v] of Object.entries(extraEnv))childEnv[k]=v;
const executable='/private/tmp/ans-v11-release-run/extracted/ANS Studio.app/Contents/MacOS/ANS Studio';
const log=path.join(round,'app.log');
await writeFile(log,'');
const secrets=[...keys.map(k=>values[k]),...Object.values(extraEnv)];
const child=spawn(executable,['--user-data-dir='+isolated,'--remote-debugging-port=9444'],{cwd:workspace,env:childEnv,stdio:['ignore','pipe','pipe']});
let logText='';
function append(data){let text=data.toString();for(const s of secrets)text=text.split(s).join('[redacted]');logText=(logText+text).slice(-500000);void writeFile(log,logText);}
child.stdout.on('data',append);child.stderr.on('data',append);
await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
const artifact={zip:'/private/tmp/ans-v11-release-run/ANS-Studio-1.1.0-mac-arm64.zip',sha256:'baed9f84cb5dba0594c35804ee3bd33756bd90c9e52f89c33661fa18e3e81eaa (verified against SHA256SUMS-darwin-arm64.txt + GitHub digest)'};
const evidence={run:5,mode:'public v1.1.0 release package (mac-arm64)',artifact,pid:child.pid,executable,args:['--user-data-dir='+isolated,'--remote-debugging-port=9444'],workspace,isolatedUserData:isolated,isolatedEnvAbsentBefore:absent,injectedKeys:keys,extraEnv,repoEnvSha256:before,repoEnvUnchanged:before===createHash('sha256').update(await readFile(envFile)).digest('hex'),log};
await writeFile(path.join(round,'launch-facts.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({pid:child.pid,workspace,isolatedUserData:isolated,repoEnvUnchanged:evidence.repoEnvUnchanged}));
child.on('exit',(code,signal)=>{console.log(JSON.stringify({exit:code,signal}));});
