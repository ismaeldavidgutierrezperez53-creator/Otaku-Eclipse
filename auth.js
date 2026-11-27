'use strict';
(() => {
  const el = id => document.getElementById(id);
  const dialog=el('accountDialog'), form=el('accountForm'), email=el('accountEmail'), password=el('accountPassword'), status=el('accountStatus'), submit=el('accountSubmit');
  const buttons=['accountLogin','accountSignup','accountRecover'];
  let client=null, session=null, mode='login', busy=false, recovery=false;
  let syncBusy=false,syncTimer=null,syncConflict=false,syncEpoch=0,applyingRemote=false;
  const syncKey=()=>eclipseStorageKey+'-autosync-v21';
  const syncEnabled=()=>!!session?.user&&!recovery&&localStorage.getItem(syncKey())==='1';
  const baseKey=()=>eclipseStorageKey+'-syncbase-v21';
  const syncMessage=t=>{el('syncStatus').textContent=t;};
  function message(text){status.textContent=text;}
  function switchLibrary(user){
    const next=user?'eclipse-library-user-'+user.id:'eclipse-library-v1';
    if(next===eclipseStorageKey)return;
    syncEpoch++;clearTimeout(syncTimer);syncConflict=false;syncMessage('Sincronización desactivada o esperando conexión.');
    if(el('editor').open)el('editor').close();
    eclipseStorageKey=next; adult=false; editMeta={};
    try{rows=JSON.parse(localStorage.getItem(next)||'[]').map(normalize).filter(Boolean)}catch{rows=[];}
    navigate('home');
  }
  function paint(){
    const signed=!!session&&!recovery;
    el('accountButton').textContent=signed?'♙ Mi cuenta · Conectado':'♙ Mi cuenta';
    el('accountInfo').textContent=signed?'Sesión iniciada: '+(session.user.email||'Cuenta Eclipse'):'Accede con tu correo electrónico.';
    form.hidden=signed;
    el('accountEmailLabel').hidden=mode==='update'; email.required=mode!=='update';
    el('accountPasswordLabel').hidden=mode==='recover';password.required=mode!=='recover';
    password.autocomplete=mode==='login'?'current-password':'new-password';
    submit.textContent={login:'Iniciar sesión',signup:'Crear cuenta',recover:'Enviar enlace de recuperación',update:'Guardar nueva contraseña'}[mode];
    buttons.forEach(id=>el(id).hidden=signed||recovery);el('accountLogout').hidden=!signed;
    el('cloudPanel').hidden=!signed;const enabled=syncEnabled();el('autoSync').checked=enabled;el('autoSync').disabled=busy||syncBusy||!client||!signed;el('syncNow').disabled=busy||syncBusy||!enabled;el('syncConflict').hidden=!enabled||!syncConflict;el('syncKeepLocal').disabled=busy||syncBusy;el('syncKeepCloud').disabled=busy||syncBusy;el('cloudSave').disabled=busy||syncBusy||enabled||!client;el('cloudRestore').disabled=busy||syncBusy||enabled||!client;submit.disabled=busy||!client;el('accountLogout').disabled=busy||syncBusy||!client;
  }
  function change(next){mode=next;password.value='';message('');paint();}
  el('accountButton').onclick=()=>{if(!dialog.open)dialog.showModal();paint();};
  el('accountClose').onclick=()=>{password.value='';dialog.close();};
  el('accountLogin').onclick=()=>change('login');el('accountSignup').onclick=()=>change('signup');el('accountRecover').onclick=()=>change('recover');
  if(!window.supabase||!/^https?:$/.test(location.protocol)){
    message('Para iniciar sesión, abre la aplicación desde un alojamiento HTTPS o localhost con conexión a internet.');paint();return;
  }
  client=window.supabase.createClient('https://ridfecvgpzsaamhnnhfy.supabase.co','sb_publishable_5ScS-aJE0ZhTOhR7Uqkmfw_DnIEzhe5',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const redirect=()=>location.origin+location.pathname;
  client.auth.onAuthStateChange((event,current)=>{
    session=current;
    if(event==='PASSWORD_RECOVERY'){recovery=true;change('update');if(!dialog.open)dialog.showModal();}
    else if(event==='SIGNED_OUT'){recovery=false;change('login');}
    switchLibrary(recovery?null:session?.user);paint();if(syncEnabled())scheduleSync(600);
  });
  form.onsubmit=async e=>{
    e.preventDefault();if(busy||!client)return;busy=true;paint();message('Conectando…');
    const address=email.value.trim(),secret=password.value;
    try{
      let result;
      if(mode==='login'){result=await client.auth.signInWithPassword({email:address,password:secret});}
      else if(mode==='signup'){result=await client.auth.signUp({email:address,password:secret,options:{emailRedirectTo:redirect()}});}
      else if(mode==='recover'){result=await client.auth.resetPasswordForEmail(address,{redirectTo:redirect()});}
      else{if(!recovery||!session)throw new Error('Abre primero el enlace de recuperación.');result=await client.auth.updateUser({password:secret});}
      if(result.error)throw result.error;
      if(mode==='update'){recovery=false;mode='login';switchLibrary(session?.user);message('Contraseña actualizada.');}
      else if(mode==='recover'){message('Si la cuenta existe y puede recibir correo, se enviará un enlace de recuperación.');}
      else if(mode==='signup'&&!result.data.session){message('Si el registro fue aceptado, revisa tu correo para confirmar la cuenta.');}
      else{message('Sesión iniciada.');}
    }catch(error){message('No se pudo completar la operación: '+(error.message||'Error de conexión'));}
    finally{password.value='';busy=false;paint();}
  };
  el('accountLogout').onclick=async()=>{if(busy)return;busy=true;paint();try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;message('Sesión cerrada.');}catch(e){message('No se pudo cerrar la sesión: '+e.message);}finally{busy=false;paint();}};
  const cloudMessage=t=>{el('cloudStatus').textContent=t;};
  async function cloudAction(upload){
    if(busy||syncBusy||syncEnabled()||!client||!session?.user||recovery)return;
    const userId=session.user.id, key=eclipseStorageKey;
    if(upload&&!confirm('Guardar la colección completa de esta cuenta en Supabase y sustituir la copia anterior, si existe? Incluye notas y archivo +18.'))return;
    busy=true;paint();cloudMessage('Conectando…');
    try{
      if(upload){
        const entries=rows.map(normalize).filter(Boolean);
        if(JSON.stringify(entries).length>4000000)throw Error('La copia supera el límite de 4 millones de caracteres. Exporta el JSON local.');
        const {error}=await client.from('eclipse_collection_backup').upsert({user_id:userId,entries,updated_at:new Date().toISOString()},{onConflict:'user_id'});
        if(error)throw error;
        if(session?.user?.id===userId){localStorage.removeItem(baseKey());cloudMessage('Copia guardada: '+entries.length+' títulos.');}
      }else{
        const {data,error}=await client.from('eclipse_collection_backup').select('entries,updated_at').eq('user_id',userId).maybeSingle();
        if(error)throw error;
        if(!data){cloudMessage('No hay una copia en la nube.');return;}
        if(!Array.isArray(data.entries))throw Error('Copia no válida.');
        const entries=data.entries.map(normalize).filter(Boolean);
        if(entries.length!==data.entries.length)throw Error('La copia contiene entradas no válidas.');
        if(session?.user?.id!==userId||eclipseStorageKey!==key)throw Error('La cuenta cambió.');
        if(!confirm('Restaurar '+entries.length+' títulos de la copia del '+new Date(data.updated_at).toLocaleString('es-ES')+'? Esto sustituye tu colección local. Exporta antes una copia JSON si quieres conservarla.')){cloudMessage('Restauración cancelada.');return;}
        if(!save(entries))throw Error('No se pudo guardar la copia local.');
        localStorage.removeItem(baseKey());adult=false;navigate('home');cloudMessage('Copia restaurada: '+entries.length+' títulos.');
      }
    }catch(error){cloudMessage('No se pudo completar: '+(error.message||'Error de conexión'));}
    finally{busy=false;paint();}
  }

  // Compare content, not client timestamps. A conditional write protects against races.
  function canonical(entries){return JSON.stringify(entries.map(normalize).filter(Boolean).sort((a,b)=>a.id.localeCompare(b.id)));}
  async function digest(value){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');}
  function decide(base,local,remote,localEmpty,remoteExists){
    if(remoteExists&&local===remote)return 'equal';
    if(!remoteExists)return base?'conflict':'push';
    if(!base)return localEmpty?'pull':'conflict';
    if(remote===base)return 'push';
    if(local===base)return 'pull';
    return 'conflict';
  }
  function scheduleSync(ms=1600){clearTimeout(syncTimer);if(syncEnabled())syncTimer=setTimeout(()=>runSync(),ms);}
  function storedMatches(key,snapshot){try{return canonical(JSON.parse(localStorage.getItem(key)||'[]'))===snapshot;}catch{return false;}}
  async function runSync(choice){
    if(syncBusy||busy||!client||!syncEnabled()||recovery)return;
    if(!navigator.onLine){syncMessage('Sin conexión. Se reintentará al volver a conectarte.');return;}
    if(el('editor').open){scheduleSync(3000);return;}
    const userId=session.user.id,key=eclipseStorageKey,epoch=syncEpoch,entries=rows.map(normalize).filter(Boolean),snapshot=canonical(entries);
    const valid=()=>epoch===syncEpoch&&session?.user?.id===userId&&eclipseStorageKey===key&&syncEnabled();
    const unchanged=()=>valid()&&canonical(rows)===snapshot&&storedMatches(key,snapshot)&&!el('editor').open;
    syncBusy=true;paint();syncMessage('Comprobando cambios…');
    try{
      if(!storedMatches(key,snapshot))throw Error('Otra pestaña cambió la colección local. Recarga esta página antes de sincronizar.');
      if(!globalThis.crypto?.subtle)throw Error('La sincronización requiere HTTPS o localhost.');
      const localHash=await digest(snapshot),base=localStorage.getItem(baseKey());
      const {data:remote,error}=await client.from('eclipse_collection_backup').select('entries,updated_at').eq('user_id',userId).maybeSingle();
      if(error)throw error;
      if(!unchanged())throw Error('La colección cambió durante la comprobación. Se reintentará.');
      if(remote&&(!Array.isArray(remote.entries)||remote.entries.some(x=>!x?.id||!normalize(x))))throw Error('La copia remota no es válida. No se ha sobrescrito.');
      const remoteHash=remote?await digest(canonical(remote.entries)):null;
      let action=decide(base,localHash,remoteHash,entries.length===0,!!remote);
      if(!unchanged())throw Error('La colección cambió durante la comprobación. Se reintentará.');
      if(action==='conflict'&&choice){
        if(choice==='pull'&&!remote)throw Error('No existe una copia remota para recuperar.');
        if(!confirm(choice==='push'?'¿Sustituir la copia remota de '+(remote?.entries.length||0)+' títulos por los '+entries.length+' títulos locales?':'¿Sustituir los '+entries.length+' títulos locales por los '+remote.entries.length+' títulos de la nube?')){syncMessage('Conflicto pendiente. No se ha cambiado nada.');return;}
        action=choice;
      }
      if(action==='conflict'){syncConflict=true;syncMessage('Conflicto: '+entries.length+' títulos locales y '+(remote?.entries.length||0)+' en la nube. Elige una copia.');return;}
      if(action==='pull'){
        // Save a recovery copy even when automatic local backups are disabled.
        localStorage.setItem(key+'-backup-v20',JSON.stringify({at:Date.now(),entries}));
        applyingRemote=true;
        try{if(!save(remote.entries.map(normalize)))throw Error('No se pudo guardar en el dispositivo.');}finally{applyingRemote=false;}
        localStorage.setItem(baseKey(),remoteHash);render();
      }else if(action==='push'){
        if(snapshot.length>4000000)throw Error('La colección supera el límite de 4 millones de caracteres. Usa la exportación JSON.');
        const stamp=new Date(Math.max(Date.now(),remote?Date.parse(remote.updated_at)+1:0)).toISOString();
        const request=remote?client.from('eclipse_collection_backup').update({entries,updated_at:stamp}).eq('user_id',userId).eq('updated_at',remote.updated_at):client.from('eclipse_collection_backup').insert({user_id:userId,entries,updated_at:stamp});
        const {data:written,error:writeError}=await request.select('updated_at').maybeSingle();
        if(writeError?.code==='23505'||(!writeError&&!written)){syncConflict=true;syncMessage('La nube cambió durante el guardado. Se volverá a comprobar.');scheduleSync(1000);return;}
        if(writeError)throw writeError;
        if(!valid())return;
        localStorage.setItem(baseKey(),localHash);
        if(!unchanged())scheduleSync(1000);
      }else localStorage.setItem(baseKey(),localHash);
      syncConflict=false;syncMessage('Sincronizada · '+new Date().toLocaleString('es-ES')+' · '+rows.length+' títulos.');
    }catch(e){if(valid())syncMessage('Sincronización pausada: '+(e.message||'Error de conexión'));}
    finally{syncBusy=false;paint();}
  }
  el('autoSync').onchange=()=>{
    if(!session?.user||recovery)return;
    if(el('autoSync').checked){
      if(!confirm('¿Activar sincronización automática en este dispositivo? Se guardará la colección completa, incluidas las notas y el archivo +18, en tu cuenta de Supabase. No está cifrada de extremo a extremo.')){paint();return;}
      localStorage.setItem(syncKey(),'1');syncMessage('Sincronización activada. Comprobando…');scheduleSync(0);
    }else{localStorage.removeItem(syncKey());syncEpoch++;clearTimeout(syncTimer);syncConflict=false;syncMessage('Desactivada. La copia remota se conserva.');}
    paint();
  };
  el('syncNow').onclick=()=>runSync();el('syncKeepLocal').onclick=()=>runSync('push');el('syncKeepCloud').onclick=()=>runSync('pull');
  window.addEventListener('eclipse-collection-change',()=>{if(!applyingRemote)scheduleSync();});
  window.addEventListener('online',()=>scheduleSync(100));
  window.addEventListener('focus',()=>scheduleSync(100));
  setInterval(()=>{if(syncEnabled()&&!document.hidden)runSync();},30000);

  el('cloudSave').onclick=()=>cloudAction(true);
  el('cloudRestore').onclick=()=>cloudAction(false);

  // V2.3 — authenticated Web Push test, per-device opt-in.
  const pushPanel=document.createElement('section');
  pushPanel.className='panel';pushPanel.style.marginTop='14px';
  pushPanel.innerHTML='<h3>Notificaciones push · V2.3</h3><p class="tiny">Activa los avisos en este dispositivo. Inicia sesión y permite las notificaciones. La prueba se envía desde Supabase.</p><div class="actions"><button type="button" id="eclipsePushOn">Activar dispositivo</button><button type="button" id="eclipsePushTest">Enviar prueba push</button><button type="button" id="eclipsePushOff">Desactivar dispositivo</button></div><p class="tiny" id="eclipsePushStatus" role="status" aria-live="polite"></p>';
  el('cloudPanel').appendChild(pushPanel);
  const pushMsg=t=>el('eclipsePushStatus').textContent=t;
  let pushBusy=false;
  async function pushCall(body){
    if(!session?.user||recovery)throw Error('Inicia sesión primero.');
    const {data,error}=await client.functions.invoke('eclipse-push',{body});
    if(error){let detail='';try{detail=(await error.context.json()).error||'';}catch{}throw Error(detail||error.message||'Error del servidor push');}
    if(data?.error)throw Error(data.error);return data;
  }
  async function pushRegistration(){
    if(!isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Este navegador no admite Web Push desde esta dirección.');
    await navigator.serviceWorker.register('./sw.js');
    return await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('El servicio de notificaciones no se ha activado. Recarga la página.')),15000))]);
  }
  function vapidBytes(v){const b=atob(v.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-v.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));}
  async function pushAction(action){
    if(pushBusy)return;if(!session?.user||recovery){pushMsg('Inicia sesión primero.');return;}
    const userId=session.user.id;
    pushBusy=true;for(const id of ['eclipsePushOn','eclipsePushTest','eclipsePushOff'])el(id).disabled=true;
    pushMsg('Conectando…');
    try{
      if(action==='register'){
        if(!('Notification' in window))throw Error('Notificaciones no disponibles.');
        const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Permiso de notificaciones no concedido.');
      }
      const reg=await pushRegistration();let sub=await reg.pushManager.getSubscription();
      if(session?.user?.id!==userId||recovery)throw Error('La cuenta ha cambiado.');
      if(action==='register'){
        const {publicKey}=await pushCall({action:'key'});const key=vapidBytes(publicKey);
        if(sub){const old=sub.options.applicationServerKey;if(old&&Array.from(new Uint8Array(old)).join(',')!==Array.from(key).join(',')){await pushCall({action:'disable',endpoint:sub.endpoint});await sub.unsubscribe();sub=null;}}
        if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
        if(session?.user?.id!==userId||recovery)throw Error('La cuenta ha cambiado.');
        await pushCall({action:'register',subscription:sub.toJSON()});pushMsg('Dispositivo registrado. Ya puedes enviar una prueba push.');window.dispatchEvent(new Event('eclipse-push-changed'));
      }else if(action==='test'){
        if(!sub)throw Error('Activa primero este dispositivo.');
        await pushCall({action:'test',subscription:sub.toJSON()});pushMsg('El servidor push ha aceptado el envío. Comprueba las notificaciones del dispositivo.');
      }else{
        if(!sub){pushMsg('No hay una suscripción activa en este navegador.');return;}
        await pushCall({action:'disable',endpoint:sub.endpoint});await sub.unsubscribe();pushMsg('Dispositivo desactivado.');window.dispatchEvent(new Event('eclipse-push-changed'));
      }
    }catch(e){pushMsg('Error: '+(e.message||'No se pudo completar la operación.'));}
    finally{pushBusy=false;for(const id of ['eclipsePushOn','eclipsePushTest','eclipsePushOff'])el(id).disabled=false;}
  }
  el('eclipsePushOn').onclick=()=>pushAction('register');
  el('eclipsePushTest').onclick=()=>pushAction('test');
  el('eclipsePushOff').onclick=()=>pushAction('disable');

  // V2.4 — opt-in cloud inbox. This check runs while the page is open.
  const noticePanel=document.createElement('section');
  noticePanel.className='panel';noticePanel.style.marginTop='14px';
  noticePanel.innerHTML='<h3>🔔 Centro de notificaciones · V2.7</h3><p class="tiny">Activa los avisos que quieras recibir. Se comprueban con la aplicación abierta y se guardan en tu cuenta. Solo anime general.</p><div id="eclipseNoticePrefs" style="display:grid;gap:8px;margin:12px 0"></div><div class="actions"><button type="button" id="eclipseNoticeSave">Guardar preferencias</button><button type="button" id="eclipseNoticeRefresh">Comprobar avisos</button><button type="button" id="eclipseNoticeRead">Marcar todo como leído</button></div><p id="eclipseNoticeStatus" class="tiny" role="status" aria-live="polite"></p><div id="eclipseNoticeList" style="display:grid;gap:8px"></div>';
  el('cloudPanel').appendChild(noticePanel);
  noticePanel.id='eclipseNoticePanel';
  const noticeStyle=document.createElement('style');
  noticeStyle.textContent=`#eclipseBell{display:flex;align-items:center;justify-content:center;gap:8px;min-height:40px;flex:none;padding:7px 10px;margin-left:auto;position:relative;background:var(--panel);border-color:var(--line)}#eclipseBellCount{background:#dc3c5c;color:white;border-radius:99px;padding:2px 6px;font-size:11px;font-weight:800;min-width:20px;text-align:center}#eclipseNoticePanel{scroll-margin-top:10px;overflow-wrap:anywhere}#eclipseNoticeFilters{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}#eclipseNoticeList .eclipseNoticeCard{display:grid;gap:8px;padding:12px;border-left:3px solid var(--line)}#eclipseNoticeList .eclipseNoticeCard.unread{border-left-color:var(--accent)}#eclipseNoticeList .eclipseNoticeCard .actions button{min-height:38px}#eclipseNoticeList .eclipseNoticeCard .actions{margin-top:3px}#eclipseNoticePanel label:has(input[type=checkbox]){display:flex;align-items:center;gap:8px}@media(max-width:750px){#eclipseBell{min-height:44px}#eclipseNoticePanel{padding:12px}#eclipseNoticeFilters{grid-template-columns:1fr}#eclipseNoticeList .actions button{flex:1 1 110px;min-height:44px}#accountDialog{padding:15px;max-height:92dvh}}`;
  document.head.append(noticeStyle);
  const noticeBell=document.createElement('button');noticeBell.type='button';noticeBell.id='eclipseBell';noticeBell.setAttribute('aria-label','Abrir centro de notificaciones');noticeBell.innerHTML='<span aria-hidden="true">🔔</span><span id="eclipseBellCount" hidden>0</span>';
  const bellHost=document.querySelector('.brand');if(bellHost)bellHost.append(noticeBell);else el('accountButton').before(noticeBell);
  const filters=document.createElement('div');filters.id='eclipseNoticeFilters';filters.innerHTML='<label>Categoría<select id="eclipseNoticeCategory"><option value="all">Todas</option><option value="episodes">Episodios</option><option value="premieres">Estrenos</option><option value="favorites">Anime favorito</option><option value="goals">Metas</option></select></label><label>Mostrar<select id="eclipseNoticeView"><option value="all">Todos los avisos</option><option value="unread">Sin leer</option><option value="starred">Avisos favoritos</option></select></label>';
  el('eclipseNoticeList').before(filters);
  function setBellCount(count){const badge=el('eclipseBellCount');badge.hidden=!(count>0);badge.textContent=count>99?'99+':String(count||0);noticeBell.setAttribute('aria-label','Abrir centro de notificaciones'+(count>0?' · '+count+' sin leer':''));}
  let bellRequest=0;
  async function refreshBell(){const user=noticeUser(),request=++bellRequest;if(!user){setBellCount(0);return;}try{const {count,error}=await client.from('eclipse_notifications').select('event_key',{count:'exact',head:true}).eq('user_id',user).is('read_at',null).is('deleted_at',null);if(!error&&noticeValid(user)&&request===bellRequest)setBellCount(count||0);}catch{}}
  noticeBell.onclick=()=>{el('accountButton').click();if(noticeUser()){requestAnimationFrame(()=>noticePanel.scrollIntoView({block:'start',behavior:'auto'}));if(!noticeBusy)noticeAction('refresh');}};
  for(const id of ['eclipseNoticeCategory','eclipseNoticeView'])el(id).onchange=()=>noticeAction('refresh');
  const noticeTypes={episodes:'Nuevos episodios',premieres:'Próximos estrenos (episodio 1)',favorites:'Episodios de favoritos',goals:'Recordatorio semanal de metas'};
  for(const [kind,label] of Object.entries(noticeTypes)){
    const line=document.createElement('label'),check=document.createElement('input');
    check.type='checkbox';check.id='eclipseNotice_'+kind;line.append(check,document.createTextNode(' '+label));el('eclipseNoticePrefs').append(line);
  }
  let noticeBusy=false,noticeOwner=null,noticeLast=0,noticePrefs=null;
  const noticeStatus=t=>el('eclipseNoticeStatus').textContent=t;
  const noticeUser=()=>!recovery&&session?.user?.id||null;
  function noticeValid(user){return noticeUser()===user;}
  function noticeControls(disabled){for(const id of ['eclipseNoticeSave','eclipseNoticeRefresh','eclipseNoticeRead',...Object.keys(noticeTypes).map(k=>'eclipseNotice_'+k),'eclipseNoticeCategory','eclipseNoticeView'])el(id).disabled=disabled;noticePanel.querySelectorAll('[data-notice-action]').forEach(b=>b.disabled=disabled);}
  function resetNotice(){noticeOwner=null;noticePrefs=null;noticeLast=0;bellRequest++;setBellCount(0);el('eclipseNoticeCategory').value='all';el('eclipseNoticeView').value='all';el('eclipseNoticeList').replaceChildren();for(const k of Object.keys(noticeTypes))el('eclipseNotice_'+k).checked=false;noticeStatus('');noticeControls(true);}
  async function loadNoticePrefs(user){
    const {data,error}=await client.from('eclipse_notification_preferences').select('episodes,premieres,favorites,goals').eq('user_id',user).maybeSingle();
    if(error)throw error;if(!noticeValid(user))throw Error('La cuenta ha cambiado.');
    noticePrefs=Object.fromEntries(Object.keys(noticeTypes).map(k=>[k,data?.[k]===true]));
    for(const k of Object.keys(noticeTypes))el('eclipseNotice_'+k).checked=noticePrefs[k];noticeOwner=user;
  }
  async function loadNoticeList(user){
    const cat=el('eclipseNoticeCategory').value,view=el('eclipseNoticeView').value;
    let query=client.from('eclipse_notifications').select('event_key,kind,title,body,created_at,read_at,starred').eq('user_id',user).is('deleted_at',null);
    if(cat!=='all')query=query.eq('kind',cat);if(view==='unread')query=query.is('read_at',null);if(view==='starred')query=query.eq('starred',true);
    const {data,error}=await query.order('created_at',{ascending:false}).limit(50);
    if(error)throw error;if(!noticeValid(user))return;
    const target=el('eclipseNoticeList');target.replaceChildren();
    const counter=document.createElement('p');counter.className='tiny';counter.textContent=(data?.length||0)+' avisos mostrados · máximo 50';target.append(counter);
    if(!data?.length){const p=document.createElement('p');p.textContent='No hay avisos que coincidan con este filtro.';target.append(p);await refreshBell();return;}
    for(const n of data){const card=document.createElement('div');card.className='panel eclipseNoticeCard'+(n.read_at?'':' unread');
      const heading=document.createElement('strong');heading.textContent=(n.read_at?'':'● ')+(n.starred?'★ ':'')+n.title;
      const body=document.createElement('p');body.textContent=n.body;
      const meta=document.createElement('small');meta.className='tiny';meta.textContent=(noticeTypes[n.kind]||n.kind)+' · '+new Date(n.created_at).toLocaleString('es-ES');
      const actions=document.createElement('div');actions.className='actions';
      for(const [action,label] of [['star',n.starred?'★ Quitar favorito':'☆ Guardar favorito'],['read',n.read_at?'Marcar sin leer':'Marcar leído'],['delete','Eliminar']]){const button=document.createElement('button');button.type='button';button.dataset.noticeAction=action;button.textContent=label;if(action==='delete')button.className='danger';button.disabled=noticeBusy;button.onclick=()=>changeNotice(user,n,action);actions.append(button);}
      card.append(heading,body,meta,actions);target.append(card);}
    await refreshBell();
  }
  async function changeNotice(user,n,action){
    if(noticeBusy||!noticeValid(user))return;
    if(action==='delete'&&!confirm('¿Eliminar este aviso?'))return;
    const stamp=new Date().toISOString(),patch=action==='star'?{starred:!n.starred}:action==='read'?{read_at:n.read_at?null:stamp}:{deleted_at:stamp,read_at:stamp};
    noticeBusy=true;noticeControls(true);try{const {error}=await client.from('eclipse_notifications').update(patch).eq('user_id',user).eq('event_key',n.event_key).is('deleted_at',null);if(error)throw error;if(!noticeValid(user))return;await loadNoticeList(user);noticeStatus(action==='delete'?'Aviso eliminado.':action==='star'?'Favorito actualizado.':'Estado actualizado.');}catch(e){if(noticeValid(user))noticeStatus('Error: '+e.message);}finally{noticeBusy=false;if(noticeValid(user))noticeControls(false);else resetNotice();}
  }
  async function generateNotices(user,prefs){
    const now=Math.floor(Date.now()/1000),events=[];
    const add=(kind,key,title,body)=>events.push({user_id:user,event_key:key,kind,title:title.slice(0,160),body:body.slice(0,500)});
    if(prefs.goals){const day=new Date();day.setUTCHours(0,0,0,0);day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));add('goals','goal:'+day.toISOString().slice(0,10),'Revisa tus metas de anime','Consulta tu progreso y registra los episodios vistos esta semana.');}
    if(prefs.episodes||prefs.premieres||prefs.favorites){
      const saved=rows.filter(x=>x.category==='normal'&&x.anilistId>0&&x.status!=='Abandonado');
      const byId=new Map();for(const x of saved){const prev=byId.get(x.anilistId);if(!prev)byId.set(x.anilistId,{...x});else{prev.favorite=prev.favorite||x.favorite;prev.seen=Math.max(prev.seen,x.seen);}}
      const ids=[...byId.keys()].slice(0,100);
      const query='query($ids:[Int],$start:Int,$end:Int,$p:Int){Page(page:$p,perPage:50){pageInfo{hasNextPage} airingSchedules(mediaId_in:$ids,airingAt_greater:$start,airingAt_lesser:$end,sort:TIME){mediaId episode airingAt media{isAdult}}}}';
      if(ids.length)for(let p=1;p<=5;p++){
        const res=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({query,variables:{ids,start:now-86400,end:now+86400*7,p}}),signal:AbortSignal.timeout(15000)});
        if(!res.ok)throw Error('AniList no disponible ('+res.status+').');const j=await res.json();if(j.errors||!j.data?.Page)throw Error('No se pudo consultar AniList.');
        if(!noticeValid(user))throw Error('La cuenta ha cambiado.');
        for(const a of j.data.Page.airingSchedules||[]){const x=byId.get(a.mediaId);if(!x||a.media?.isAdult!==false||!Number.isInteger(a.episode)||!Number.isInteger(a.airingAt))continue;
          const key=a.mediaId+':'+a.episode;const title=x.title;
          if(a.airingAt<=now&&a.episode>x.seen){
            if(prefs.episodes)add('episodes','ep:'+key,'Nuevo episodio · '+title,'Según el calendario de AniList, el episodio '+a.episode+' ya se ha emitido.');
            if(prefs.favorites&&x.favorite)add('favorites','fav:'+key,'Novedad de un favorito · '+title,'El episodio '+a.episode+' de uno de tus favoritos figura como emitido en AniList.');
          }else if(prefs.premieres&&a.episode===1&&a.airingAt>now){add('premieres','premiere:'+key,'Próximo estreno · '+title,'Fecha prevista: '+new Date(a.airingAt*1000).toLocaleString('es-ES')+' (puede cambiar).');}
        }
        if(!j.data.Page.pageInfo?.hasNextPage)break;
      }
    }
    if(!noticeValid(user))throw Error('La cuenta ha cambiado.');
    if(events.length){const unique=[...new Map(events.map(e=>[e.event_key,e])).values()];const {error}=await client.from('eclipse_notifications').upsert(unique,{onConflict:'user_id,event_key',ignoreDuplicates:true});if(error)throw error;}
  }
  async function noticeAction(action){
    const user=noticeUser();if(!user||noticeBusy)return;noticeBusy=true;noticeControls(true);
    try{
      if(noticeOwner!==user||!noticePrefs)await loadNoticePrefs(user);
      if(action==='save'){
        const values=Object.fromEntries(Object.keys(noticeTypes).map(k=>[k,el('eclipseNotice_'+k).checked]));
        const {error}=await client.from('eclipse_notification_preferences').upsert({user_id:user,...values,updated_at:new Date().toISOString()});if(error)throw error;if(!noticeValid(user))return;noticePrefs=values;noticeStatus('Preferencias guardadas.');
      }else if(action==='read'){
        const {error}=await client.from('eclipse_notifications').update({read_at:new Date().toISOString()}).eq('user_id',user).is('read_at',null).is('deleted_at',null);if(error)throw error;noticeStatus('Avisos marcados como leídos.');
      }else if(action==='check'){
        noticeStatus('Comprobando avisos…');await generateNotices(user,noticePrefs);noticeLast=Date.now();noticeStatus('Comprobación completada.');
      }else noticeStatus(action==='refresh'?'Avisos actualizados.':'Preferencias cargadas.');
      await loadNoticeList(user);
    }catch(e){if(noticeValid(user))noticeStatus('Error: '+(e.message||'No se pudo completar.'));}
    finally{noticeBusy=false;if(noticeValid(user))noticeControls(false);else resetNotice();}
  }
  el('eclipseNoticeSave').onclick=()=>noticeAction('save');el('eclipseNoticeRefresh').onclick=()=>noticeAction('check');el('eclipseNoticeRead').onclick=()=>noticeAction('read');
  // Account changes clear previous private notices before another account uses the panel.
  client.auth.onAuthStateChange(()=>{const user=noticeUser();if(user!==noticeOwner)resetNotice();setTimeout(()=>{if(noticeUser()&&!noticeBusy&&noticeOwner!==noticeUser())noticeAction('load');},100);});
  el('accountButton').addEventListener('click',()=>{if(noticeUser()&&!noticeBusy&&noticeOwner!==noticeUser())noticeAction('load');});
  setInterval(()=>{if(noticeUser()&&!document.hidden&&navigator.onLine&&!noticeBusy&&Date.now()-noticeLast>3600000)noticeAction('check');},60000);

  setInterval(()=>{if(!document.hidden&&navigator.onLine)refreshBell();},30000);
  window.addEventListener('focus',refreshBell);
  client.auth.onAuthStateChange(()=>setTimeout(refreshBell,100));
  // V2.6 — private device management and account-wide quiet hours.
  const devicePanel=document.createElement('section');
  devicePanel.className='panel';devicePanel.style.marginTop='14px';
  devicePanel.innerHTML='<h3>📱 Centro de dispositivos · V2.6</h3><p class="tiny">Gestiona los navegadores registrados. El estado indica registro, no conexión en tiempo real.</p><button type="button" id="eclipseDeviceRefresh">Actualizar dispositivos</button><p id="eclipseDeviceStatus" class="tiny" role="status" aria-live="polite"></p><div id="eclipseDeviceList" style="display:grid;gap:8px"></div><hr><h3>🌙 Horario de silencio</h3><p class="tiny">Hora de Madrid. Se aplica a todos los dispositivos y a los envíos automáticos. Las pruebas manuales se pueden enviar en cualquier momento.</p><label><input type="checkbox" id="eclipseQuietEnabled"> Activar horario de silencio</label><div class="actions"><label>Desde <input type="time" id="eclipseQuietStart" value="22:00"></label><label>Hasta <input type="time" id="eclipseQuietEnd" value="08:00"></label></div><button type="button" id="eclipseQuietSave">Guardar horario</button><p id="eclipseQuietStatus" class="tiny" role="status"></p><hr><h3>📊 Historial de envíos automáticos</h3><p class="tiny">Últimos 30 avisos procesados. Aceptado significa que el servicio push aceptó el envío; no confirma su lectura. Los avisos agrupados comparten el resultado del envío.</p><div id="eclipseDeviceHistory" style="display:grid;gap:8px"></div>';
  el('cloudPanel').appendChild(devicePanel);
  let deviceBusy=false,deviceOwner=null,deviceCurrent=null,quietLoaded=false;
  const deviceUser=()=>!recovery&&session?.user?.id||null;
  const deviceStatus=t=>el('eclipseDeviceStatus').textContent=t;
  const quietStatus=t=>el('eclipseQuietStatus').textContent=t;
  function devicePlatform(){const u=navigator.userAgent;const p=navigator.userAgentData?.platform||'';if(/Android/i.test(u+' '+p))return 'Android';if(/iPhone|iPad|iPod/i.test(u)||(/Mac/i.test(p||u)&&navigator.maxTouchPoints>1))return 'iOS';if(/Windows/i.test(u+' '+p))return 'Windows';if(/Mac/i.test(p||u))return 'macOS';if(/Linux/i.test(u+' '+p))return 'Linux';return 'Desconocido';}
  async function currentPush(){if(!('serviceWorker' in navigator))return null;try{const reg=await navigator.serviceWorker.getRegistration();return await reg?.pushManager?.getSubscription()||null;}catch{return null;}}
  async function deviceCall(body){const {data,error}=await client.functions.invoke('eclipse-devices',{body});if(error){let detail='';try{detail=(await error.context.json()).error||'';}catch{}throw Error(detail||error.message||'Error de conexión');}if(data?.error)throw Error(data.error);return data;}
  function deviceControls(){devicePanel.querySelectorAll('button,input').forEach(e=>{e.disabled=deviceBusy||!deviceUser()||(!quietLoaded&&['eclipseQuietSave','eclipseQuietEnabled','eclipseQuietStart','eclipseQuietEnd'].includes(e.id));});}
  function clearDevices(){deviceOwner=null;deviceCurrent=null;quietLoaded=false;el('eclipseDeviceList').replaceChildren();el('eclipseDeviceHistory').replaceChildren();el('eclipseQuietEnabled').checked=false;el('eclipseQuietStart').value='22:00';el('eclipseQuietEnd').value='08:00';deviceStatus('');quietStatus('');deviceControls();}
  function drawDevices(data,user){if(deviceUser()!==user)return;deviceCurrent=data.current;const target=el('eclipseDeviceList');target.replaceChildren();
    const count=document.createElement('p');count.className='tiny';count.textContent=(data.devices?.length||0)+' dispositivos registrados';target.append(count);
    for(const d of data.devices||[]){const card=document.createElement('div');card.className='panel';card.style.padding='10px';const heading=document.createElement('strong');heading.textContent=(d.platform==='Android'||d.platform==='iOS'?'📱 ':'💻 ')+d.platform+(d.device_id===deviceCurrent?' · Este dispositivo':'');const meta=document.createElement('p');meta.className='tiny';meta.textContent='Registrado · Último contacto: '+new Date(d.updated_at).toLocaleString('es-ES');const actions=document.createElement('div');actions.className='actions';for(const [action,label] of [['test','Enviar prueba'],['remove','Eliminar dispositivo']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>deviceAction(action,d.device_id);actions.append(b);}card.append(heading,meta,actions);target.append(card);}
    const history=el('eclipseDeviceHistory');history.replaceChildren();if(!data.history?.length){const t=document.createElement('p');t.textContent='Todavía no hay envíos registrados.';history.append(t);}
    const labels={attempted:'Intento registrado (sin resultado)',accepted:'Aceptado',partial:'Parcial',failed:'Fallido'};
    for(const h of data.history||[]){const line=document.createElement('div');line.className='panel';line.style.padding='8px';const title=document.createElement('strong');title.textContent=labels[h.result]||'Sin resultado';const meta=document.createElement('p');meta.className='tiny';meta.textContent=new Date(h.attempted_at).toLocaleString('es-ES')+(h.result==='attempted'?'':' · '+h.accepted_count+' aceptados / '+h.failed_count+' fallidos');line.append(title,meta);history.append(line);}
  }
  async function deviceLoad(user,loadQuiet=true){const sub=await currentPush();const data=await deviceCall({action:'list',endpoint:sub?.endpoint||null,platform:devicePlatform()});if(deviceUser()!==user)return;drawDevices(data,user);
    if(loadQuiet){const {data:p,error}=await client.from('eclipse_notification_preferences').select('quiet_enabled,quiet_start,quiet_end').eq('user_id',user).maybeSingle();if(error)throw error;if(deviceUser()!==user)return;el('eclipseQuietEnabled').checked=p?.quiet_enabled===true;el('eclipseQuietStart').value=(p?.quiet_start||'22:00').slice(0,5);el('eclipseQuietEnd').value=(p?.quiet_end||'08:00').slice(0,5);quietLoaded=true;}
    deviceOwner=user;
  }
  async function deviceAction(action,id){const user=deviceUser();if(!user||deviceBusy)return;if(action==='remove'&&!confirm('¿Eliminar este dispositivo de los envíos push? Podrás activarlo de nuevo desde ese navegador.'))return;
    deviceBusy=true;deviceControls();deviceStatus('Conectando…');try{
      if(action==='test'){await deviceCall({action:'test',device_id:id});if(deviceUser()===user)deviceStatus('Prueba aceptada por el servicio push. Comprueba el dispositivo.');}
      else if(action==='remove'){const local=id===deviceCurrent;await deviceCall({action:'remove',device_id:id});if(deviceUser()!==user)return;if(local){try{await (await currentPush())?.unsubscribe();}catch{}}await deviceLoad(user,false);if(deviceUser()===user)deviceStatus('Dispositivo eliminado.');}
      else{await deviceLoad(user,true);if(deviceUser()===user)deviceStatus('Dispositivos actualizados.');}
    }catch(e){if(deviceUser()===user)deviceStatus('Error: '+(e.message||'No se pudo completar.'));}finally{deviceBusy=false;if(deviceUser()!==user)clearDevices();deviceControls();}
  }
  async function saveQuiet(){const user=deviceUser();if(!user||deviceBusy||!quietLoaded)return;const start=el('eclipseQuietStart').value,end=el('eclipseQuietEnd').value;if(!/^\d\d:\d\d$/.test(start)||!/^\d\d:\d\d$/.test(end)||start===end){quietStatus('Elige dos horas diferentes.');return;}const enabled=el('eclipseQuietEnabled').checked;deviceBusy=true;deviceControls();quietStatus('Guardando…');try{const {error}=await client.from('eclipse_notification_preferences').upsert({user_id:user,quiet_enabled:enabled,quiet_start:start,quiet_end:end,updated_at:new Date().toISOString()});if(error)throw error;if(deviceUser()===user)quietStatus(enabled?'Horario guardado · '+start+'–'+end+' (Madrid).':'Horario de silencio desactivado.');}catch(e){if(deviceUser()===user)quietStatus('Error: '+e.message);}finally{deviceBusy=false;if(deviceUser()!==user)clearDevices();deviceControls();}}
  el('eclipseDeviceRefresh').onclick=()=>deviceAction('load');el('eclipseQuietSave').onclick=saveQuiet;
  el('accountButton').addEventListener('click',()=>{if(deviceUser()&&!deviceBusy)deviceAction('load');});
  client.auth.onAuthStateChange(()=>{if(deviceUser()!==deviceOwner)clearDevices();setTimeout(()=>{if(deviceUser()&&!deviceBusy&&deviceOwner!==deviceUser())deviceAction('load');},100);});
  window.addEventListener('eclipse-push-changed',()=>{if(deviceUser()&&!deviceBusy)deviceAction('load');});
  deviceControls();

  paint();
})();
