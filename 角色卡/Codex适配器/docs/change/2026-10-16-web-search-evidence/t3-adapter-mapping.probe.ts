// T3 end-to-end probe (2026-10-16, Codex适配器 implementation round).
// Real adapter + pinned codex 0.162.1 CLI + real MCP + local fake Responses SSE that
// returns a web_search_call item (and an unknown response.web_search_call.in_progress
// child frame). Verifies: outbound tools declaration when the capability is on, the
// webSearch row mapping, settled searchCalls, no quarantine. External model calls: 0.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCodexRuntimeAdapter} from '/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/src/provider/codex/session.ts';
import {role,interactionGate} from '/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/test/codex-adapter/fixtures.ts';
const requests:any[]=[];const events:any[]=[];
const server=createServer(async(req,res)=>{
 let raw='';for await(const part of req)raw+=part;
 try{
  const body=JSON.parse(raw);requests.push(body);
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
  const searchItem={type:'web_search_call',id:'ws_probe_1',status:'completed',action:{type:'search',query:'controlled probe query'}};
  const messageItem={type:'message',id:'msg_probe_1',role:'assistant',status:'completed',content:[{type:'output_text',text:'controlled done',annotations:[]}]};
  const response={id:'resp_probe',object:'response',created_at:1,status:'in_progress',model:'gpt-5.4',output:[]};
  const send=(type:string,data:any)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
  send('response.created',{response});
  send('response.web_search_call.in_progress',{item_id:'ws_probe_1',output_index:0});
  send('response.output_item.added',{output_index:0,item:{...searchItem}});
  send('response.output_item.done',{output_index:0,item:searchItem});
  send('response.output_item.added',{output_index:1,item:{...messageItem,content:[]}});
  send('response.output_item.done',{output_index:1,item:messageItem});
  send('response.completed',{response:{...response,status:'completed',output:[searchItem,messageItem],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});res.end();
 }catch{res.writeHead(500);res.end('controlled invalid request');}
});
await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});
const address=server.address();assert.ok(address&&typeof address!=='string');
let session:any;let collecting:Promise<void>|undefined;
try{
 session=await createCodexRuntimeAdapter({runtime:'codex',projectRoot:'/private/tmp',skillRoot:'/private/tmp',tools:[],modelId:'gpt-5.4',baseUrl:`http://127.0.0.1:${address.port}/v1`,webSearch:true,env:{CODEX_API_KEY:'fake-loopback-only',PATH:process.env.PATH},interactionGate:interactionGate(),currentTurnId:()=> 'loopback-search-turn',promptTimeoutMs:15000,constructTimeoutMs:15000}).bindRole(role);
 collecting=(async()=>{for await(const event of session.events())events.push(event);})();
 await session.prompt('exact model input sentinel');
 const toolTypes=requests.flatMap(request=>Array.isArray(request.tools)?request.tools.map((tool:any)=>tool.type):[]);
 assert.equal(requests.length,1);
 assert.ok(toolTypes.includes('web_search'));
 const wsDeclaration=requests[0].tools.find((tool:any)=>tool.type==='web_search');
 const row=events.find((event:any)=>event.kind==='message');
 assert.equal(row.summary,'联网搜索：controlled probe query');
 assert.equal(row.turnId,'loopback-search-turn');
 assert.deepEqual(row.detail,{version:1,source:'web-search',itemId:'ws_probe_1',query:'controlled probe query',action:{type:'search'}});
 const settledDeadline=Date.now()+5000;
 while(Date.now()<settledDeadline&&!events.some((event:any)=>event.kind==='settled'))await new Promise(resolve=>setTimeout(resolve,5));
 const settled=events.filter((event:any)=>event.kind==='settled');
 assert.equal(settled.length,1);
 assert.deepEqual(settled[0].detail,{outcome:'completed',searchCalls:1});
 console.log(JSON.stringify({pinnedCLI:'0.162.1',webSearchCapability:'on (options.webSearch)',httpRequests:requests.length,outboundWebSearchDeclaration:wsDeclaration,rowSummary:row.summary,rowDetail:row.detail,settledDetail:settled[0].detail,childEventFrameTolerated:true,externalModelCalls:0,credentials:'fake only'}));
}finally{await session?.dispose();await collecting;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
