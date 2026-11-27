const CACHE='otaku-eclipse-v2.8';const FILES=['./','./index.html','./auth.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('otaku-eclipse-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('./index.html'):Response.error()))))});

self.addEventListener('notificationclick',event=>{event.notification.close();const url=new URL('./index.html',self.registration.scope).href;event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async list=>{const existing=list.find(c=>c.url===url||c.url===self.registration.scope);if(existing&&'focus' in existing)return existing.focus();return self.clients.openWindow(url);}));});

self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const title=typeof data.title==='string'?data.title.slice(0,80):'Otaku Eclipse';
 const body=typeof data.body==='string'?data.body.slice(0,240):'Tienes un nuevo aviso.';
 event.waitUntil(self.registration.showNotification(title,{body,icon:'./icon-192.png',badge:'./icon-192.png',tag:'eclipse-push'}));
});
