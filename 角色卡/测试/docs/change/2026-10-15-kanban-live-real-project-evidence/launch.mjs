// 独立真实项目测试轮（看板）：隔离用户目录 + 放宽轮次超时 + CDP 调试端口启动公开 v1.0.0 运行包。
// 凭据只从仓库 .env 单次读取注入子进程环境；值不出现在日志与证据里。
import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {readEnvFile} from '/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/src/common/shared/env-file.ts';

const repo='/Users/wangzhongren/code/vibeingcode/解压/ans-runtime';
const round='/private/tmp/ans-kanban-live-7ae6156b';
const workspace='/Users/wangzhongren/code/vibeingcode/ans-testbed/kanban-live';
const envFile=path.join(repo,'.env');
const before=createHash('sha256').update(await readFile(envFile)).digest('hex');
const values=await readEnvFile(envFile);
const keys=['ANTHROPIC_AUTH_TOKEN','ANS_PI_BASE_URL','ANS_PI_MODEL','ANS_PI_CONTEXT_WINDOW'];
if(keys.some(k=>!values[k]?.trim()))throw Error('Required Pi configuration incomplete; values withheld');
const extraEnv={ANS_PI_PROMPT_TIMEOUT_MS:'900000',ANS_PI_CONSTRUCT_TIMEOUT_MS:'300000',ANS_PI_SHELL_REVIEW_TIMEOUT_MS:'300000'};
const defaults=[];
for(const name of ['ANS Studio','ans-cli']){
 const p=path.join(os.homedir(),'Library','Application Support',name,'.env');
 let exists=false,config={};
 try{await stat(p);exists=true;config=await readEnvFile(p);}catch(e){if(e.code!=='ENOENT')throw Error('Cannot inspect default config safely');}
 defaults.push({path:p,exists,keys:keys.map(key=>({key,present:config[key]!==undefined,nonempty:!!config[key]?.trim(),equalsRepo:config[key]===values[key]}))});
}
const isolated=path.join(round,'userdata');
await mkdir(isolated,{recursive:true});
let absent=false;try{await stat(path.join(isolated,'.env'));}catch(e){if(e.code==='ENOENT')absent=true;else throw e;}
if(!absent)throw Error('Isolated .env unexpectedly exists');
const childEnv={};
for(const key of ['PATH','HOME','USER','LOGNAME','SHELL','TMPDIR','LANG','LC_ALL','LC_CTYPE','__CF_USER_TEXT_ENCODING'])if(process.env[key])childEnv[key]=process.env[key];
for(const key of keys)childEnv[key]=values[key];
for(const [k,v] of Object.entries(extraEnv))childEnv[k]=v;
const executable='/private/tmp/ans-taskboard-release-kn7tg1vm/extracted/ANS Studio.app/Contents/MacOS/ANS Studio';
const log=path.join(round,'app.log');
await writeFile(log,'');
const secrets=[...keys.map(k=>values[k]),...Object.values(extraEnv)];
const child=spawn(executable,['--user-data-dir='+isolated,'--remote-debugging-port=9444'],{cwd:workspace,env:childEnv,stdio:['ignore','pipe','pipe']});
let logText='';
function append(data){let text=data.toString();for(const s of secrets)text=text.split(s).join('[redacted]');logText=(logText+text).slice(-500000);void writeFile(log,logText);}
child.stdout.on('data',append);child.stderr.on('data',append);
await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
const evidence={pid:child.pid,executable,args:['--user-data-dir='+isolated,'--remote-debugging-port=9444'],workspace,isolatedUserData:isolated,isolatedEnvAbsentBefore:absent,injectedKeys:keys,extraEnv,repoEnvSha256:before,repoEnvUnchanged:before===createHash('sha256').update(await readFile(envFile)).digest('hex'),defaults,log};
await writeFile(path.join(round,'launch-facts.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({pid:child.pid,workspace,isolatedUserData:isolated,repoEnvUnchanged:evidence.repoEnvUnchanged}));
child.on('exit',(code,signal)=>{console.log(JSON.stringify({exit:code,signal}));});
