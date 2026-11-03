import { openBrowser } from './browser-driver.mjs';
import { loopbackUrl } from './fault-proxy.mjs';
export const sizes = [{ name:'wide',width:1440,height:900 },{ name:'tablet',width:768,height:1024 },{ name:'compact',width:390,height:844 },{ name:'narrow',width:320,height:844 }];
export const sections = ['Introduction','Features','Docs','Playground','Tutorial','Examples'];

export async function openReviewBrowser(origin, executable) {
  loopbackUrl(origin);
  const browser = await openBrowser(executable);
  const network = [], errors = [], blocked = [];
  browser.on('Network.requestWillBeSent', event => network.push({ event:'request',id:event.requestId,url:event.request.url,method:event.request.method }));
  browser.on('Network.responseReceived', event => network.push({ event:'response',id:event.requestId,url:event.response.url,status:event.response.status,mimeType:event.response.mimeType }));
  browser.on('Network.loadingFailed', event => network.push({ event:'failed',id:event.requestId,error:event.errorText }));
  browser.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  browser.on('Runtime.consoleAPICalled', event => { if (event.type === 'error') errors.push(event.args.map(arg=>arg.value ?? arg.description).join(' ')); });
  browser.on('Fetch.requestPaused', async event => {
    const url = new URL(event.request.url);
    if (url.origin === new URL(origin).origin || ['data:','about:'].includes(url.protocol)) await browser.send('Fetch.continueRequest',{requestId:event.requestId});
    else {
      blocked.push({ url:url.href,reason:'External/different-origin request prevented before transmission' });
      await browser.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});
    }
  });
  await browser.send('Network.enable');
  await browser.send('Network.setCacheDisabled',{cacheDisabled:true});
  await browser.send('Network.setBypassServiceWorker',{bypass:true});
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  return { browser, network, errors, blocked };
}
export async function waitFor(browser, expression, description, timeout=6000) {
  const until = Date.now()+timeout;
  while(Date.now()<until) {
    if(await browser.evaluate(expression)) { await browser.settle(); return; }
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw new Error('Timed out: '+description);
}
export async function navigate(browser,url,size) {
  await browser.send('Emulation.setDeviceMetricsOverride',{width:size.width,height:size.height,deviceScaleFactor:1,mobile:false});
  const result=await browser.send('Page.navigate',{url});
  if(result.errorText) throw new Error(result.errorText);
  await waitFor(browser,'document.readyState === "complete" && !!document.querySelector("main")','real site document and main');
}
export async function key(browser,name,{shift=false,control=false}={}) {
  const codes={Tab:9,Enter:13,Escape:27,' ':32,Home:36,End:35};
  if(!(name in codes)) throw new Error('Unsupported review key');
  const params={key:name,code:name===' '?'Space':name,windowsVirtualKeyCode:codes[name],nativeVirtualKeyCode:codes[name],modifiers:(shift?8:0)|(control?2:0)};
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',...params,...(name==='Enter'?{text:'\r'}:{})});
  await browser.send('Input.dispatchKeyEvent',{type:'keyUp',...params});
  await browser.settle();
}
export async function tabTo(browser,selector,{limit=100,shift=false}={}) {
  for(let index=0;index<limit;index++) {
    if(await browser.evaluate('document.activeElement?.matches('+JSON.stringify(selector)+')')) return;
    await key(browser,'Tab',{shift});
  }
  throw new Error('Required control unreachable by keyboard: '+selector);
}
export async function typeText(browser,selector,value) {
  await tabTo(browser,selector);
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
  await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
  await browser.send('Input.insertText',{text:value});
  await browser.settle();
}
export async function armDomEvent(browser,selector,name) {
  await browser.evaluate('(() => { const target=document.querySelector('+JSON.stringify(selector)+'); if(!target) throw new Error("Required event target missing"); window.__undReviewEvent=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Missing '+name+'")),5000);target.addEventListener('+JSON.stringify(name)+',()=>{clearTimeout(timer);resolve(true)},{once:true});}); return true; })()');
}
export async function finishDomEvent(browser) { await browser.evaluate('window.__undReviewEvent'); }
export async function visible(browser,selector) {
  return browser.evaluate('(() => { const e=document.querySelector('+JSON.stringify(selector)+'); if(!e) return false; const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility==="visible"&&s.display!=="none"&&r.bottom>0&&r.right>0&&r.left<innerWidth&&r.top<innerHeight; })()');
}
