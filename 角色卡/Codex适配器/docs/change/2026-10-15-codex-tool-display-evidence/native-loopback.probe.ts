import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCodexRuntimeAdapter} from '/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/src/provider/codex/session.ts';
import {role,interactionGate} from '/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/test/codex-adapter/fixtures.ts';
const requests:any[]=[]; const facts:any[]=[]; let registered=false; let calls=0;
const server=createServer(async(req,res)=>{
 let raw='';for await(const part of req)raw+=part;
 try{
 const body=JSON.parse(raw);requests.push(body); const index=requests.length;
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
 const item=index===1?{type:'function_call',id:'fc_loopback',call_id:'loopback-call',name:'ans_probe',arguments:JSON.stringify({cmd:'echo controlled'})}:{type:'message',id:'msg_loopback',role:'assistant',status:'completed',content:[{type:'output_text',text:'controlled done',annotations:[]}]};
 const response={id:`resp_${index}`,object:'response',created_at:1,status:'in_progress',model:'gpt-5.4',output:[]};
 const send=(type:string,data:any)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
 send('response.created',{response});
 send('response.output_item.added',{output_index:0,item:{...item,arguments:''}});
 send('response.output_item.done',{output_index:0,item});
 send('response.completed',{response:{...response,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});res.end();
 }catch{res.writeHead(500);res.end('controlled invalid request');}
});
await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});
const address=server.address();assert.ok(address&&typeof address!=='string');
let session:any;const events:any[]=[];let collecting:Promise<void>|undefined;
try{
 session=await createCodexRuntimeAdapter({runtime:'codex',projectRoot:'/private/tmp',skillRoot:'/private/tmp',modelId:'gpt-5.4',baseUrl:`http://127.0.0.1:${address.port}/v1`,env:{CODEX_API_KEY:'fake-loopback-only',PATH:process.env.PATH},interactionGate:interactionGate(),currentTurnId:()=> 'loopback-actual-turn',toolDisplayMode:'required-v1',registerToolDisplayProfile(profile){assert.equal(profile.credentials[0].value,'fake-loopback-only');registered=true;},projectToolEvent(source){assert.ok(registered);assert.ok('phase'in source);facts.push(source);return {runtime:'codex',roleId:role.id,turnId:source.turnId,kind:source.phase==='start'?'tool_call':'accepted',summary:'controlled display',detail:{toolName:source.toolName,toolCallId:source.toolCallId,turnId:source.turnId,phase:source.phase}};},tools:[{name:'probe',description:'controlled fixture',displayInputRule:'core-command-v1',inputSchema:{type:'object',properties:{cmd:{type:'string'}},required:['cmd'],additionalProperties:false},async handler(call){calls++;assert.equal(call.args.cmd,'echo controlled');return {ok:true,message:'original response sentinel',execution:{exitCode:0,stdout:'stdout sentinel'}};}}],promptTimeoutMs:15000,constructTimeoutMs:15000}).bindRole(role);
 collecting=(async()=>{for await(const event of session.events())events.push(event);})();
 await session.prompt('exact model input sentinel');
 assert.equal(calls,1);assert.equal(requests.length,2);assert.equal(facts.length,2);assert.deepEqual(facts.map(source=>source.origin),['handler-start','handler-result']);assert.equal(facts[0].toolCallId,facts[1].toolCallId);assert.equal(facts[1].result.execution.exitCode,0);
 assert.ok(JSON.stringify(requests[0]).includes('exact model input sentinel'));assert.ok(JSON.stringify(requests[1]).includes('original response sentinel'));assert.equal(JSON.stringify(requests).includes('stdout sentinel'),false);
 console.log(JSON.stringify({pinnedCLI:'0.162.1',httpRequests:requests.length,handlerCalls:calls,projectedPhases:facts.map(source=>source.phase),toolCallIdentityPreserved:true,modelTextPreserved:true,executionSidecarSentToModel:false,externalModelCalls:0,credentials:'fake only'}));
}finally{await session?.dispose();await collecting;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
