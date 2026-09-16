const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {createHash} = require('node:crypto');
function socketContext() {
 const ctx = vm.createContext({TextEncoder, Uint8Array, Blob, console, Date, clearTimeout, setTimeout, restart_delay_msec: Infinity});
 vm.runInContext(fs.readFileSync('assets/socket_edge_tts.js','utf8')+'\nglobalThis.Socket = SocketEdgeTTS;',ctx);
 return Object.create(ctx.Socket.prototype);
}
test('timestamp UTC indépendant du fuseau local', () => {
 const s=socketContext();
 const now=new Date();
 const stamp=s.date_to_string();
 assert.match(stamp,/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT\+0000/);
 assert.ok(Math.abs(Date.parse(stamp)-now.getTime())<2000);
});
test('assemblage audio conserve les octets et ignore les trames sans audio',async()=>{
 const s=socketContext(); s.data_separator=new TextEncoder().encode('Path:audio\r\n');
 s.audios=[new Blob(['header\r\nPath:audio\r\n',new Uint8Array([0,255,1])]),new Blob(['metadata']),new Blob(['Path:audio\r\n',new Uint8Array([2,3])])];
 let saved=0; s.save_mp3=()=>saved++;
 await s.onSocketMessage({data:'Path:turn.end'});
 assert.deepEqual([...s.my_uint8Array],[0,255,1,2,3]);
 assert.equal(saved,1); assert.equal(s.audios.length,0);
});
test('SHA-256 reste exact sur appels répétés',()=>{
 const s=socketContext();
 for(const value of ['abc','1234567890','abc']) assert.equal(s.sha256(value),createHash('sha256').update(value).digest('hex'));
});
function directoryContext(picker) {
 const source=fs.readFileSync('assets/script.js','utf8');
 const ctx=vm.createContext({window:{showDirectoryPicker:picker},console,save_path_handle:null,calls:0,get_audio(){ctx.calls++;}});
 vm.runInContext(source.slice(source.indexOf('async function selectDirectory()'),source.indexOf('\nconst start =')),ctx);
 return ctx;
}
test('choix dossier ne touche à aucun fichier existant',async()=>{
 const handle={getFileHandle(){throw Error('ne doit pas être appelé');}};
 const ctx=directoryContext(async()=>handle); await ctx.selectDirectory();
 assert.equal(ctx.calls,1); assert.equal(ctx.save_path_handle,handle);
});
test('annulation dossier ne déclenche pas de téléchargement',async()=>{
 const ctx=directoryContext(async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'});});
 await ctx.selectDirectory(); assert.equal(ctx.calls,0);
});
function runtime(extra = {}) {
 const timers = new Map(); let next = 0;
 const elements = new Map();
 const element = key => {
  if (!elements.has(key)) elements.set(key, {value:'20', textContent:'0 / 5', style:{}, addEventListener(){}, options:[]});
  return elements.get(key);
 };
 const ctx=vm.createContext({TextEncoder, Uint8Array, Blob, console, Date,
  setTimeout(fn,ms){timers.set(++next,{fn,ms});return next;},clearTimeout(id){timers.delete(id);},
  window:{addEventListener(){}},document:{querySelector:element,getElementById:element,addEventListener(){}},
  localStorage:{getItem(){return null;}},...extra});
 vm.runInContext(fs.readFileSync('assets/socket_edge_tts.js','utf8')+'\nglobalThis.Socket = SocketEdgeTTS;',ctx);
 vm.runInContext(fs.readFileSync('assets/script.js','utf8'),ctx);
 return {ctx,timers,element,step(ms){const found=[...timers].find(([,v])=>v.ms===ms);assert.ok(found,'timer attendu');timers.delete(found[0]);found[1].fn();}};
}
test('reconnexion unique, puis annulation sans redémarrage',()=>{
 const r=runtime();const s=Object.create(r.ctx.Socket.prototype);
 s.update_stat=()=>{};s.constructor.gec_report_error=()=>{};
 s.audios=[];let closed=0;s.socket={readyState:1,close(){closed++;}};
 s.error_restart();s.error_restart();
 assert.equal(closed,1);assert.equal(r.timers.size,1);
 s.cancel();assert.equal(r.timers.size,0);assert.equal(s.cancelled,true);
});
test('watchdog relance une connexion silencieuse et respecte infini',()=>{
 const r=runtime();const s=Object.create(r.ctx.Socket.prototype);let retries=0;s.error_restart=()=>retries++;
 r.ctx.restart_delay_msec=10000;s.arm_watchdog();r.step(10000);assert.equal(retries,1);
 r.ctx.restart_delay_msec=Infinity;s.arm_watchdog();assert.equal(r.timers.size,0);
});
test('résultat vide programme une relance',async()=>{
 const r=runtime();const s=Object.create(r.ctx.Socket.prototype);let retries=0;s.error_restart=()=>retries++;s.my_uint8Array=new Uint8Array();
 await s.save_mp3();assert.equal(retries,1);
});
test('horloge serveur corrige le GEC sans modifier le token',async()=>{
 const date='Thu, 10 Sep 2026 10:00:00 GMT';
 const r=runtime({fetch:async()=>({headers:{get:()=>date}})});
 await r.ctx.Socket.gec_sync_clock_skew();
 assert.ok(Math.abs(r.ctx.Socket.gec_clock_skew-(Date.parse(date)-Date.now())/1000)<1);
 const s=Object.create(r.ctx.Socket.prototype);const gec=s.generateSecMsGec();assert.match(gec,/^[A-F0-9]{64}$/);
});
test('limite des flux modifiable, sans doublons de lancement',()=>{
 const r=runtime();const launched=[];
 r.ctx.MockSocket=class {constructor(...args){launched.push(args);}cancel(){}};
 vm.runInContext('SocketEdgeTTS = MockSocket',r.ctx);
 r.ctx.book={all_sentences:['a','b','c','d','e'],file_names:[['livre',0,'','','']]};
 r.ctx.run_work=true;r.element('.max-threads').value='2';
 r.ctx.add_edge_tts();r.ctx.add_edge_tts();assert.equal(r.timers.size,1);
 r.step(100);r.step(100);assert.equal(launched.length,2);assert.equal(r.timers.size,0);
 r.element('.max-threads').value='1';r.ctx.threads_info.saved=1;r.ctx.add_edge_tts();assert.equal(r.timers.size,0);
 r.ctx.threads_info.saved=2;r.ctx.add_edge_tts();r.step(100);assert.equal(launched.length,3);
 r.element('.max-threads').value='3';r.ctx.add_edge_tts();r.step(100);r.step(100);assert.equal(launched.length,5);
 assert.deepEqual(launched.map(a=>a[0]),[0,1,2,3,4]);
});
test('nouvelle génération annule les lancements en attente',()=>{
 const r=runtime();r.ctx.book={all_sentences:['a'],file_names:[['livre',0,'','','']]};r.ctx.run_work=true;
 r.ctx.add_edge_tts();assert.equal(r.timers.size,1);r.ctx.clear_old_run();assert.equal(r.timers.size,0);
});
test('cycle WebSocket complet compte une seule partie et garde les octets pour fusion',async()=>{
 const sockets=[];
 class FakeWebSocket {
  constructor(url){this.url=url;this.handlers={};this.readyState=1;this.sent=[];sockets.push(this);}
  addEventListener(name,fn){this.handlers[name]=fn;}
  send(value){this.sent.push(value);}
  close(){this.readyState=3;this.handlers.close?.();}
 }
 const r=runtime({WebSocket:FakeWebSocket,window:{WebSocket:FakeWebSocket,addEventListener(){}}});
 const info={saved:0,stat:{textContent:'0 / 1'}};
 r.ctx.updateStatusBox=()=>{};
 const s=new r.ctx.Socket(0,'livre','0001','fr-FR, DeniseNeural','+0Hz','+0%','+0%','Bonjour',null,info,true);
 sockets[0].handlers.open();assert.equal(sockets[0].sent.length,2);
 assert.match(sockets[0].url,/Sec-MS-GEC-Version=1-151\.0\.4129\.59/);
 await sockets[0].handlers.message({data:new Blob(['Path:audio\r\n',new Uint8Array([1,2,3])])});
 await sockets[0].handlers.message({data:'Path:turn.end'});
 await sockets[0].handlers.message({data:'Path:turn.end'});
 assert.equal(info.saved,1);assert.equal(info.stat.textContent,'1 / 1');
 assert.deepEqual([...s.my_uint8Array],[1,2,3]);
 s.cancel();assert.equal(r.timers.size,0);
});
