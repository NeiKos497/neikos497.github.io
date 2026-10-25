/* Load the TV-local page inside the native TizenBrew document origin. */
(function () {
 'use strict';
 if(window.Anime365||window.__anime365LocalBootstrap)return;
 window.__anime365LocalBootstrap=true;
 window.stop();
 function fail(){if(document.body)document.body.textContent='Anime365: не удалось прочитать локальную страницу приложения.';}
 var x=new XMLHttpRequest();x.open('GET','file:///home/owner/share/anime365.html');x.timeout=10000;
 x.onerror=x.ontimeout=fail;
 x.onload=function(){
  var html=String(x.responseText||'');
  if(html.indexOf('anime365-root')<0||html.indexOf('window.Anime365=')<0)return fail();
  try{var supported=tizen.tvinputdevice.getSupportedKeys().map(function(k){return k.name;});['MediaPlayPause','MediaPlay','MediaPause','MediaRewind','MediaFastForward','MediaStop'].forEach(function(k){if(supported.indexOf(k)>=0){try{tizen.tvinputdevice.registerKey(k);}catch(e){}}});}catch(e){}
  document.open();document.write(html);document.close();
 };
 try{x.send();}catch(e){fail();}
})();
