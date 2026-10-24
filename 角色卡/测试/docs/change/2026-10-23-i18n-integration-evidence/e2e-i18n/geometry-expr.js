(async()=>{
  await window.__ansRenderer.openPiPanel("pi");
  await new Promise((r)=>setTimeout(r,700));
  const sidebarState = window.__ansRenderer.sidebar.setWidth(208);
  await new Promise((r)=>setTimeout(r,350));
  const sels=["#titlebar","#sidebar","#main","#pi-panel","#pi-save","#pi-status","#role-tree","#pi-language-section"];
  const geom=sels.map((sel)=>{
    const el=document.querySelector(sel);
    if(!el)return{sel,missing:true};
    const r=el.getBoundingClientRect(); const cs=getComputedStyle(el);
    return{sel,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width*100)/100,h:Math.round(r.height*100)/100,
      sw:el.scrollWidth,cw:el.clientWidth,hOverflow:el.scrollWidth>el.clientWidth+1,overflowX:cs.overflowX,
      visible:r.width>0&&r.height>0,rBottom:Math.round(r.bottom),inViewportY:r.top>=0&&r.bottom<=innerHeight+1};
  });
  const clickable=["#win-close","#pi-save","#pi-language-select"].map((id)=>{
    const el=document.querySelector(id);
    if(!el)return{id,missing:true};
    const r=el.getBoundingClientRect();
    const center={x:r.left+r.width/2,y:r.top+r.height/2};
    const inside=center.x>=0&&center.y>=0&&center.x<=innerWidth&&center.y<=innerHeight;
    const hit=inside?document.elementFromPoint(center.x,center.y):null;
    return{id,visible:r.width>0&&r.height>0,centerInsideViewport:inside,
      hit:!!(hit&&(el===hit||el.contains(hit))),rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
  });
  const trunc=[...document.querySelectorAll("#titlebar *, #sidebar *, #pi-panel *")].filter((el)=>{
    const cs=getComputedStyle(el);
    return cs.display!=="none"&&cs.visibility!=="hidden"&&el.clientWidth>0&&el.scrollWidth>el.clientWidth+1&&(el.textContent||"").trim()!=="";
  }).slice(0,30).map((el)=>({tag:el.tagName,id:el.id,cls:String(el.className).slice(0,40),
    title:el.getAttribute("title"),aria:el.getAttribute("aria-label"),sw:el.scrollWidth,cw:el.clientWidth,
    text:(el.textContent||"").trim().slice(0,30)}));
  return JSON.stringify({vw:innerWidth,vh:innerHeight,dpr:devicePixelRatio,lang:document.documentElement.lang,
    sidebarState,doc:{sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth},
    bodyScrollTop:document.body.scrollTop,geom,clickable,trunc},null,1);
})()
