/* Anime365 TV-local maintenance. No account data, shell or general filesystem API. */
(function () {
 'use strict';
 function createMaintenance(options) {
  options=options||{};
  var fs=options.fs||require('fs'),http=require('http'),crypto=require('crypto'),parse=require('url').parse;
  var root=options.root||'/home/owner/share',app=root+'/anime365.html',previous=root+'/anime365.previous.html',next=root+'/anime365.update.tmp',keyPath=root+'/anime365-maintenance.key';
  var started=Date.now(),logs=[],commands=[],last=null,lastSeen=0,visible=false,max=512*1024;
  function bytes(v){return typeof v==='string'?(Buffer.from?Buffer.from(v,'utf8'):new Buffer(v,'utf8')):v;}
  function sha(v){return crypto.createHash('sha256').update(v).digest('hex');}
  if((!fs.existsSync(app)||fs.statSync(app).size<1000)&&fs.existsSync(root+'/tmp/sdk_tools/anime365.html'))fs.writeFileSync(app,fs.readFileSync(root+'/tmp/sdk_tools/anime365.html'));
  if(!fs.existsSync(keyPath))fs.writeFileSync(keyPath,crypto.randomBytes(32).toString('hex'),{mode:384,flag:'wx'});
  var key=fs.readFileSync(keyPath,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(key))throw Error('Invalid local maintenance key');
  function equal(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;var n=0;for(var i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
  function log(event,result){logs.push({at:Date.now(),event:event,result:result});if(logs.length>30)logs.shift();}
  function safe(v,depth){if(depth>5)return null;if(typeof v==='string')return v.replace(/https?:\/\/\S+/g,'[url]').replace(/Bearer\s+\S+/gi,'[credential]').slice(0,1000);if(v===null||typeof v==='number'||typeof v==='boolean')return v;if(Array.isArray(v))return v.slice(0,200).map(function(x){return safe(x,depth+1);});if(v&&typeof v==='object'){var out={};Object.keys(v).slice(0,50).forEach(function(k){if(!/token|password|authorization|cookie|url|src|secret/i.test(k))out[k]=safe(v[k],depth+1);});return out;}return null;}
  function cleanStatus(v){var out={};['version','mode','picker','controls','seriesId','episodeId','translationId','time','duration','paused','native','busy','cues','subtitle','focus','error','cards','rows'].forEach(function(k){if(v&&v[k]!==undefined)out[k]=safe(v[k],0);});return out;}
  function digest(path){return fs.existsSync(path)?sha(fs.readFileSync(path)):null;}
  function health(){return {serviceVersion:'0.2.0',uptime:Math.floor((Date.now()-started)/1000),sha256:digest(app),bytes:fs.existsSync(app)?fs.statSync(app).size:0,backupSha256:digest(previous),stagingExists:fs.existsSync(next)};}
  function ours(ref){return /^gh\/NeiKos497\/neikos497\.github\.io@[a-f0-9]{40}\/anime365-launcher$/.test(ref||'');}
  function moduleState(){var c=fs.existsSync(root+'/tizenbrewConfig.json')?JSON.parse(fs.readFileSync(root+'/tizenbrewConfig.json','utf8')):{modules:[]};return {config:c,moduleRef:(c.modules||[]).filter(ours)[0]||null};}
  function updateModule(v){if(!v||!/^[a-f0-9]{40}$/.test(v.commit||'')||!ours(v.expectedRef))return {code:400,data:{error:'Owned module commit and expected reference required'}};var current=moduleState();if(current.moduleRef!==v.expectedRef)return {code:409,data:{error:'Module reference changed'}};var ref='gh/NeiKos497/neikos497.github.io@'+v.commit+'/anime365-launcher',c=current.config,stage=root+'/anime365-module-config.tmp';c.modules=(c.modules||[]).filter(function(m){return !ours(m);});c.modules.push(ref);if(ours(c.autoLaunchModule))c.autoLaunchModule=ref;c.autoLaunchServiceList=(c.autoLaunchServiceList||[]).filter(function(m){return !ours('gh/'+m);});c.autoLaunchServiceList.push(ref.substring(3));try{fs.writeFileSync(stage,JSON.stringify(c,null,2));fs.writeFileSync(root+'/anime365-module-config.previous.json',fs.readFileSync(root+'/tizenbrewConfig.json'));fs.renameSync(stage,root+'/tizenbrewConfig.json');return {code:200,data:{moduleRef:ref,restartRequired:true}};}finally{if(fs.existsSync(stage))fs.unlinkSync(stage);}}
  function validHtml(body){var s=body.toString('utf8');return body.length>=1000&&body.length<=max&&/<!doctype html>/i.test(s.slice(0,256))&&s.indexOf('window.Anime365=')>=0&&s.indexOf('anime365-root')>=0&&s.indexOf('</html>')>=0;}
  function replace(body,expected){if(digest(app)!==expected)return {code:409,error:'Current version changed'};if(!validHtml(body))return {code:422,error:'Invalid Anime365 HTML'};try{fs.writeFileSync(next,body);if(sha(fs.readFileSync(next))!==sha(body))throw Error('Staging hash differs');if(fs.existsSync(app))fs.writeFileSync(previous,fs.readFileSync(app));fs.renameSync(next,app);log('app-update','ok');return {code:200,data:health()};}finally{if(fs.existsSync(next))fs.unlinkSync(next);}}
  function read(req,res,done){var chunks=[],size=0,over=false;req.on('data',function(b){if(over)return;size+=b.length;if(size>max){over=true;answer(res,413,{error:'Body too large'});return;}chunks.push(b);});req.on('end',function(){if(!over)done(Buffer.concat(chunks));});req.on('error',function(){});}
  function answer(res,code,data){if(res.headersSent)return;res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data===undefined?'':JSON.stringify(data));}
  function json(body){try{return JSON.parse(body.toString('utf8')||'{}');}catch(e){return null;}}
  var server=http.createServer(function(req,res){
   var path=parse(req.url).pathname,origin=req.headers.origin,address=String(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
   var local=/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
   if(!local)return answer(res,403,{error:'Local network only'});
   if(origin){if(path!=='/bridge'||(origin!=='null'&&origin!=='file://'))return answer(res,403,{error:'Browser origin rejected'});res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'&&path==='/bridge'&&(origin==='null'||origin==='file://')){res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');return answer(res,204);}
   if(!equal(req.headers.authorization,'Bearer '+key))return answer(res,401,{error:'Authentication required'});
   try{
    if(req.method==='GET'&&path==='/health')return answer(res,200,health());
    if(req.method==='GET'&&path==='/status')return answer(res,200,{connected:Date.now()-lastSeen<6000,lastSeen:lastSeen,visible:visible,status:last,service:health()});
    if(req.method==='GET'&&path==='/logs')return answer(res,200,logs);
    if(req.method==='GET'&&path==='/module'){var ms=moduleState();return answer(res,200,{moduleRef:ms.moduleRef,autoLaunchModule:ms.config.autoLaunchModule,services:ms.config.autoLaunchServiceList});}
    if(req.method==='POST'&&path==='/module-ref')return read(req,res,function(body){try{var r=updateModule(json(body));answer(res,r.code,r.data);}catch(e){answer(res,500,{error:'Module configuration update failed'});}});
    if(req.method==='GET'&&/^\/commands\/[a-f0-9]+$/.test(path)){var id=path.split('/')[2],c=commands.filter(function(x){return x.id===id;})[0];return answer(res,c?200:404,c||{error:'Command not found'});}
    if(req.method==='POST'&&path==='/app')return read(req,res,function(body){try{if(!/^[a-f0-9]{64}$/.test(req.headers['x-content-sha256']||'')||sha(body)!==req.headers['x-content-sha256'])return answer(res,422,{error:'Upload hash differs'});var r=replace(body,req.headers['x-current-sha256']);answer(res,r.code,r.data||{error:r.error});}catch(e){log('app-update','failed');answer(res,500,{error:'Update failed; current app retained'});}});
    if(req.method==='POST'&&path==='/rollback')return read(req,res,function(body){try{var v=json(body);if(!v||!/^[a-f0-9]{64}$/.test(v.expectedSha256||''))return answer(res,400,{error:'Expected current hash required'});if(!fs.existsSync(previous))return answer(res,404,{error:'Backup missing'});var b=fs.readFileSync(previous),r=replace(b,v.expectedSha256);answer(res,r.code,r.data||{error:r.error});}catch(e){answer(res,500,{error:'Rollback failed'});}});
    if(req.method==='POST'&&path==='/command')return read(req,res,function(body){var v=json(body);if(!v||['key','reload','inspect','open'].indexOf(v.action)<0)return answer(res,400,{error:'Unsupported command'});if(v.action==='open'){var launch=options.launch||function(done){try{tizen.application.launch('xvvl3S1bvH.TizenBrewStandalone',function(){done();},function(){done(Error('Launch failed'));});}catch(e){done(e);}};return launch(function(e){answer(res,e?500:200,e?{error:'Could not open TizenBrew'}:{opened:true});});}if(v.action==='key'&&[13,37,38,39,40,10009,10252,415,19,413,412,417].indexOf(v.code)<0)return answer(res,400,{error:'Unsupported key'});if(Date.now()-lastSeen>6000||!visible)return answer(res,409,{error:'Open Anime365 on TV first'});var c={id:crypto.randomBytes(8).toString('hex'),action:v.action,created:Date.now(),state:'queued'};if(v.action==='key')c.code=v.code;commands.push(c);if(commands.length>30)commands.shift();answer(res,200,{id:c.id,state:c.state});});
    if(req.method==='POST'&&path==='/bridge')return read(req,res,function(body){var v=json(body);if(!v)return answer(res,400,{error:'Invalid state'});last=cleanStatus(v.status);lastSeen=Date.now();visible=!!v.visible;(v.ack||[]).slice(0,20).forEach(function(a){var c=commands.filter(function(x){return x.id===a.id;})[0];if(c&&c.state==='sent'){c.state='done';c.result=safe(a.result,0);}});var pending=[];commands.forEach(function(c){if((c.state==='queued'||c.state==='sent')&&Date.now()-c.created>30000)c.state='expired';if((c.state==='queued'||c.state==='sent')&&visible){c.state='sent';pending.push({id:c.id,action:c.action,code:c.code});}});answer(res,200,{commands:pending});});
    answer(res,404,{error:'Unknown endpoint'});
   }catch(e){log('request','failed');answer(res,500,{error:'Maintenance request failed'});}
  });
  server.setTimeout(15000);return {server:server,health:health};
 }
 if(typeof module!=='undefined')module.exports=createMaintenance;
 if(typeof tizen!=='undefined'){
  var service=createMaintenance();
  function listen(){service.server.on('error',function(e){console.log('Anime365 maintenance listen error: '+e.code);});service.server.listen(8096,'0.0.0.0');process.__anime365MaintenanceServer=service.server;}
  if(process.__anime365MaintenanceServer)process.__anime365MaintenanceServer.close(listen);else listen();
 }
})();
