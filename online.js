// ===================== ONLINE MULTIPLAYER (room code, host-authoritative) =====================
// Host runs the real game engine. Guests only render and answer their own decisions.
// Transport: PeerJS/WebRTC (peer-to-peer, low latency) — falls back to BroadcastChannel (same device, for testing).
var Online = (function () {
  var A = null;           // UI internals injected by ui.js
  var net = null;         // transport
  var room = null;        // { code, role, players:[{peer,name,char,costume,loadout}], settings }
  var pending = {}, rpcSeq = 0, chain = Promise.resolve(), dirty = false, dirtyT = null;
  var DECIDE = ['preRoll', 'rollDice', 'planPath', 'chooseDir', 'confirmBuy', 'chooseInvest', 'confirmBuyout', 'bank', 'broker', 'pickCard', 'choose', 'chooseNumber', 'confirmUse', 'confirmDeal', 'auctionBid', 'casinoBet', 'chooseBuilding'];
  var DISPLAY = ['turnStart', 'showDice', 'step', 'teleport', 'landed', 'rent', 'dividend', 'money', 'promotion', 'suit', 'built', 'showCard', 'lineBonus', 'casinoShow', 'notify', 'info'];
  var LOCAL_ONLY = { info: 1 };

  function code() { var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

  // ---------- transport ----------
  var CHUNK = 12000, inbox = {};
  function pack(obj, out) { // split big messages so Safari's WebRTC never drops them
    var str = JSON.stringify(obj);
    if (str.length <= CHUNK) { out(str); return; }
    var id = Math.random().toString(36).slice(2, 9), n = Math.ceil(str.length / CHUNK);
    for (var k = 0; k < n; k++) out(JSON.stringify({ $c: id, i: k, n: n, d: str.slice(k * CHUNK, (k + 1) * CHUNK) }));
  }
  function unpack(from, raw) {
    var m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
    if (!m || !m.$c) return m;
    var key = from + m.$c, b = inbox[key] = inbox[key] || { n: m.n, got: 0, parts: [] };
    if (b.parts[m.i] === undefined) { b.parts[m.i] = m.d; b.got++; }
    if (b.got < b.n) return null;
    delete inbox[key]; try { return JSON.parse(b.parts.join('')); } catch (e) { return null; }
  }
  function loadPeer() {
    return new Promise(function (res) {
      if (typeof window.Peer === 'function') return res(true);
      if (localMode()) return res(false);
      var sc = document.querySelector('script[data-peer]');
      if (!sc) { sc = document.createElement('script'); sc.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'; sc.dataset.peer = 1; document.head.appendChild(sc); }
      var t0 = Date.now(), iv = setInterval(function () { if (typeof window.Peer === 'function') { clearInterval(iv); res(true); } else if (Date.now() - t0 > 9000) { clearInterval(iv); res(false); } }, 150);
    });
  }
  function localMode() { return /[?&]local=1/.test(location.search) || window.__forceBC; }
  function makeNet(roomCode, isHost, onMsg, onJoin, onLeave, onReady, onFail) {
    if (!localMode()) {
      var peer = isHost ? new Peer('rfs-room-' + roomCode, { debug: 0 }) : new Peer({ debug: 0 }), conns = {}, readyDone = false, timer = null;
      var wire = function (c) {
        c.on('open', function () { conns[c.peer] = c; if (isHost) onJoin(c.peer); else if (!readyDone) { readyDone = true; clearTimeout(timer); onReady(); } });
        c.on('data', function (d) { var m = unpack(c.peer, d); if (m) onMsg(c.peer, m); });
        c.on('close', function () { if (conns[c.peer]) { delete conns[c.peer]; onLeave(c.peer); } });
        c.on('error', function () { });
      };
      peer.on('open', function () { if (isHost) onReady(); else wire(peer.connect('rfs-room-' + roomCode, { reliable: true, serialization: 'raw' })); });
      if (isHost) peer.on('connection', wire);
      peer.on('disconnected', function () { try { peer.reconnect(); } catch (e) { } }); // signalling only; game data keeps flowing P2P
      peer.on('error', function (e) { var t = e && e.type; if (readyDone && t !== 'peer-unavailable') return; clearTimeout(timer); onFail(t === 'unavailable-id' ? 'รหัสห้องนี้ถูกใช้แล้ว ลองสร้างใหม่' : t === 'peer-unavailable' ? 'ไม่พบห้องนี้ — ตรวจรหัสห้องอีกครั้ง' : t === 'browser-incompatible' ? 'เบราว์เซอร์นี้ไม่รองรับการเล่นออนไลน์' : 'เชื่อมต่อไม่ได้ (' + (t || 'network') + ')'); });
      if (!isHost) timer = setTimeout(function () { if (!readyDone) onFail('เชื่อมต่อนานเกินไป — ลองใหม่ หรือเปลี่ยนเครือข่าย Wi-Fi'); }, 15000);
      var send = function (c, m) { if (c && c.open) pack(m, function (x) { try { c.send(x); } catch (e) { } }); };
      return { kind: 'p2p', send: function (to, m) { send(conns[to], m); }, all: function (m, except) { Object.keys(conns).forEach(function (k) { if (k !== except) send(conns[k], m); }); }, host: function (m) { send(conns[Object.keys(conns)[0]], m); }, drop: function (k) { var c = conns[k]; delete conns[k]; try { c && c.close(); } catch (e) { } }, close: function () { try { peer.destroy(); } catch (e) { } } };
    }
    // BroadcastChannel (same device testing: add ?local=1 to the URL)
    var me = isHost ? 'host' : 'g' + Math.random().toString(36).slice(2, 8), bc = new BroadcastChannel('rfs-room-' + roomCode), peers = {};
    bc.onmessage = function (ev) {
      var d = ev.data; if (d.to && d.to !== me && d.to !== '*') return; if (d.from === me) return;
      if (d.sys === 'join' && isHost) { peers[d.from] = 1; bc.postMessage({ sys: 'ok', to: d.from, from: me }); onJoin(d.from); return; }
      if (d.sys === 'ok' && !isHost) { onReady(); return; }
      if (d.sys === 'bye') { if (peers[d.from] || !isHost) { delete peers[d.from]; onLeave(d.from); } return; }
      if (d.m) { var m = unpack(d.from, d.m); if (m) onMsg(d.from, m); }
    };
    addEventListener('beforeunload', function () { bc.postMessage({ sys: 'bye', from: me, to: '*' }); });
    if (isHost) setTimeout(onReady, 50); else setTimeout(function () { bc.postMessage({ sys: 'join', from: me, to: 'host' }); }, 50);
    var post = function (to, m) { pack(m, function (x) { bc.postMessage({ to: to, from: me, m: x }); }); };
    return { kind: 'local', send: post, all: function (m, except) { Object.keys(peers).forEach(function (k) { if (k !== except) post(k, m); }); }, host: function (m) { post('host', m); }, drop: function (k) { delete peers[k]; }, close: function () { bc.postMessage({ sys: 'bye', from: me, to: '*' }); bc.close(); } };
  }
  // ---------- heartbeat: detects locked iPads / lost Wi-Fi so nobody waits forever ----------
  var hb = null, lastSeen = {};
  function startHeartbeat(isHost) {
    clearInterval(hb); lastSeen = {};
    hb = setInterval(function () {
      if (!net || !room) return clearInterval(hb);
      var now = Date.now();
      if (isHost) {
        net.all({ t: 'ping' });
        (room.players || []).forEach(function (x) { if (!x.peer) return; if (!lastSeen[x.peer]) lastSeen[x.peer] = now; if (now - lastSeen[x.peer] > 15000) { lastSeen[x.peer] = now + 1e12; net.drop(x.peer); onHostLeave(x.peer); } });
      } else {
        net.host({ t: 'pong' });
        if (!lastSeen.host) lastSeen.host = now;
        if (now - lastSeen.host > 15000) { A.toast('📴 ขาดการเชื่อมต่อกับโฮสต์'); var st = room && room.started; leave(); A.closeModal(); if (st) A.toMenu(); }
      }
    }, 3000);
  }
  // ---------- (de)serialisation: tiles & players travel as references ----------
  function enc(v, s) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(function (x) { return enc(x, s); });
    if (typeof v.id === 'number' && s.tiles[v.id] === v) return { $t: v.id };
    if (typeof v.id === 'number' && s.players[v.id] === v) return { $p: v.id };
    var o = {}; Object.keys(v).forEach(function (k) { if (typeof v[k] !== 'function') o[k] = enc(v[k], s); }); return o;
  }
  function dec(v, s) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(function (x) { return dec(x, s); });
    if ('$t' in v) return s.tiles[v.$t]; if ('$p' in v) return s.players[v.$p];
    var o = {}; Object.keys(v).forEach(function (k) { o[k] = dec(v[k], s); }); return o;
  }
  function snap(s, full) {
    var c = JSON.parse(JSON.stringify(s)); c.log = c.log.slice(-25); c.cardHistory = []; c.paidTx = {};
    if (!full) { c.tiles.forEach(function (t) { delete t.n; }); c.players.forEach(function (p) { p.hist = p.hist.slice(-1); }); c.light = 1; }
    return c;
  }
  function isPlayer(p) { return p && typeof p === 'object' && p.shares && typeof p.id === 'number'; }
  function hostClone(p) { return isPlayer(p) && p.remote ? Object.assign({}, p, { isAI: true }) : p; }   // host: only remote players become non-blocking
  function aiClone(p) { return isPlayer(p) ? Object.assign({}, p, { isAI: true }) : p; }

  // ===================== HOST =====================
  function pushState(g) { dirty = true; if (dirtyT) return; dirtyT = setTimeout(function () { dirtyT = null; if (dirty && net) { dirty = false; net.all({ t: 'state', s: snap(g.s) }); } }, 90); }
  function rpc(g, peer, m, args) {
    return new Promise(function (res, rej) {
      var id = ++rpcSeq, to = setTimeout(function () { if (pending[id]) { delete pending[id]; net.send(peer, { t: 'cancel', id: id }); A.toast('⏰ หมดเวลาตัดสินใจ — ระบบเลือกให้'); rej('timeout'); } }, 120000);
      pending[id] = { res: function (v) { clearTimeout(to); res(v); }, rej: function (e) { clearTimeout(to); rej(e); }, peer: peer };
      net.send(peer, { t: 'rpc', id: id, m: m, args: enc(args, g.s), s: snap(g.s) });
    });
  }
  async function applyOps(g, ops) {
    for (var i = 0; i < (ops || []).length; i++) {
      var o = ops[i], p = g.s.players[o.a[0]];
      if (o.f === 'buyStock') g.buyStock(p, o.a[1], o.a[2]);
      else if (o.f === 'sellStock') g.sellStock(p, o.a[1], o.a[2]);
      else if (o.f === 'sellShopToBank') { var t = g.s.tiles[o.a[1]]; if (t.owner === p.id) g.sellShopToBank(p, t); }
      else if (o.f === 'usePreRoll') { g._replay = (o.ans || []).slice(); await g.usePreRoll(p, g.loadoutSlots(p)[o.a[1]]); g._replay = null; }
    }
    A.refresh();
  }
  // a remote player who left / timed out: let the AI make this one decision
  async function aiFallback(g, io, f, m, args, p) {
    var ai = Object.assign({}, p, { isAI: true, ai: p.ai || { level: 'normal', persona: 'Balanced' } });
    if (m === 'rollDice') return g.dice();
    if (m === 'planPath') {
      var path = [], pos = p.pos, prev = p.prev;
      for (var k = args[1]; k > 0; k--) { var opts = g.nextOptions(pos, prev), nx = opts.length > 1 ? window.AI.chooseDir(g, ai, opts, k) : opts[0]; path.push(nx); prev = pos; pos = nx; }
      return path;
    }
    return f.apply(io, [ai].concat(args.slice(1)));
  }
  function hostIO(io, g) {
    var w = Object.assign({}, io);
    DECIDE.forEach(function (m) {
      var f = io[m]; if (!f) return;
      w[m] = async function () {
        var args = [].slice.call(arguments), p = args[0];
        if (g._replay && g._replay.length && p && p.remote) return g._replay.shift();
        if (p && p.remote) {
          A.setWaiting(p);
          try {
            var r = await rpc(g, p.remote, m, args);
            await applyOps(g, r.ops);
            if (m === 'rollDice') { net.all({ t: 'ev', m: 'showDice', args: enc([p, r.v], g.s) }, p.remote); await io.showDice(hostClone(p), r.v); }
            pushState(g); return r.v;
          } catch (e) { if (e === 'abort') throw e; return aiFallback(g, io, f, m, args, p); }
        }
        var v = await f.apply(io, args);
        if (m === 'rollDice') net.all({ t: 'ev', m: 'showDice', args: enc([p, v], g.s) });
        pushState(g); return v;
      };
    });
    DISPLAY.forEach(function (m) {
      var f = io[m]; if (!f) return;
      w[m] = function () {
        var args = [].slice.call(arguments);
        if (!LOCAL_ONLY[m]) net.all({ t: 'ev', m: m, args: enc(args, g.s) });
        pushState(g);
        return f.apply(io, args.map(hostClone));
      };
    });
    w.log = function (msg, k) { io.log(msg, k); net.all({ t: 'ev', m: 'log', args: [msg, k] }); };
    w.toast = function (msg) { io.toast(msg); net.all({ t: 'ev', m: 'toast', args: [msg] }); };
    w.autosave = function () { };
    return w;
  }
  function onHostMsg(peer, d) {
    lastSeen[peer] = Date.now();
    if (d.t === 'pong') return;
    if (d.t === 'hello') {
      if (room.started) { net.send(peer, { t: 'full', why: 'เกมเริ่มไปแล้ว' }); return; }
      if (room.players.length >= 4) { net.send(peer, { t: 'full', why: 'ห้องเต็มแล้ว (4 คน)' }); return; }
      var used = room.players.map(function (x) { return x.char; }), ch = d.char;
      if (used.indexOf(ch) >= 0) ch = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'].find(function (k) { return used.indexOf(k) < 0; });
      room.players.push({ peer: peer, name: String(d.name || 'ผู้เล่น').slice(0, 14), char: ch, costume: ch === d.char ? d.costume : 'chars', loadout: d.loadout || { eq: [], sc: null } });
      lobbyBroadcast(); A.renderLobby();
    } else if (d.t === 'res') { var pd = pending[d.id]; if (pd) { delete pending[d.id]; pd.res({ v: d.v, ops: d.ops }); } }
  }
  function onHostLeave(peer) {
    if (!room) return;
    if (!room.started) { room.players = room.players.filter(function (x) { return x.peer !== peer; }); lobbyBroadcast(); A.renderLobby(); return; }
    var g = A.game(); if (!g) return;
    g.s.players.forEach(function (p) { if (p.remote === peer) { p.remote = null; p.isAI = true; p.ai = { level: 'normal', persona: 'Balanced' }; A.toast('📴 ' + A.esc(p.name) + ' หลุดการเชื่อมต่อ — AI เล่นแทน'); } });
    Object.keys(pending).forEach(function (id) { if (pending[id].peer === peer) { var pd = pending[id]; delete pending[id]; pd.rej('left'); } });
    A.refresh(); pushState(g);
  }
  function lobbyBroadcast() { net.all({ t: 'lobby', players: room.players.map(function (x) { return { name: x.name, char: x.char, costume: x.costume }; }), settings: room.settings }); }
  function host(done) {
    var c = code(), P = Meta.p;
    room = { code: c, role: 'host', started: false, players: [{ peer: null, name: P.name, char: P.equip.char, costume: P.equip.costume, loadout: Meta.validLoadout() }], settings: { map: 0, target: 40000, fillAI: true, tax: false } };
    loadPeer().then(function (ok) {
      if (!ok && !localMode()) { done('โหลดระบบออนไลน์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่'); return; }
      net = makeNet(c, true, onHostMsg, function (pid) { lastSeen[pid] = Date.now(); }, onHostLeave, function () { startHeartbeat(true); done(null, room); }, function (err) { done(err); });
    });
  }
  function startHost() {
    var R = room.settings, players = room.players.map(function (x, i) { return { name: x.name, char: x.char, costume: x.costume, isAI: false, remote: x.peer || undefined, loadout: x.loadout }; });
    var used = players.map(function (p) { return p.char; }), pool = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'].filter(function (k) { return used.indexOf(k) < 0; });
    var names = ['คุมะ AI', 'โคริ AI', 'คิอิโระ AI', 'ชาอิ AI', 'เนโกะ AI', 'ริสุ AI', 'เพนกิ AI', 'ชิกะ AI'];
    if (R.fillAI) while (players.length < 4) { var ch = pool.shift(); players.push({ name: names[+ch.slice(1)], char: ch, isAI: true, aiLevel: 'normal', persona: AI_PERSONAS[players.length % 5] }); }
    if (players.length < 2) { A.toast('ต้องมีผู้เล่นอย่างน้อย 2 คน (เปิด “เติม AI” ได้)'); return; }
    var s = Game.create({ mapIdx: R.map, players: players, target: R.target, maxRounds: 100, rules: { tax: R.tax, endOnBankrupt: true }, seed: Math.floor(Math.random() * 1e9) });
    s.players.forEach(function (p, i) { p.remote = players[i].remote || null; });
    s.ownerIdx = 0; s.dice = Meta.p.equip.dice; s.online = true;
    room.started = true; A.setOnline({ role: 'host', code: room.code, kind: net.kind });
    s.players.forEach(function (p) { if (p.remote) net.send(p.remote, { t: 'start', s: snap(s, true), idx: p.id }); });
    A.closeModal(); A.startGame(s, true);
  }
  function end(g) { if (net) net.all({ t: 'end', s: snap(g.s, true) }); setTimeout(leave, 4000); }

  // ===================== GUEST =====================
  var gstate = { idx: -1 };
  function join(roomCode, done) {
    var P = Meta.p;
    room = { code: roomCode, role: 'guest', players: [] };
    loadPeer().then(function (ok) {
      if (!ok && !localMode()) { done('โหลดระบบออนไลน์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่'); return; }
      net = makeNet(roomCode, false, onGuestMsg, function () { }, function () { if (room) { A.toast('📴 โฮสต์ออกจากห้องแล้ว'); var wasStarted = room.started; leave(); A.closeModal(); if (wasStarted) A.toMenu(); } }, function () {
        net.host({ t: 'hello', name: P.name, char: P.equip.char, costume: P.equip.costume, loadout: Meta.validLoadout() }); startHeartbeat(false); done(null, room);
      }, function (err) { done(err); });
    });
  }
  var queued = 0;
  function onGuestMsg(peer, d) {
    lastSeen.host = Date.now();
    if (d.t === 'ping') return;
    if (d.t === 'cancel') { if (curRpc === d.id) A.closeModal(); return; }
    if (d.t === 'lobby') { room.players = d.players; room.settings = d.settings; A.renderLobby(); return; }
    if (d.t === 'full') { A.toast('⚠️ ' + d.why); leave(); A.closeModal(); return; }
    if (d.t === 'start') { room.started = true; gstate.idx = d.idx; A.setOnline({ role: 'guest', code: room.code, idx: d.idx, kind: net.kind }); A.closeModal(); A.startGuest(d.s, d.idx); return; }
    var g = A.game(); if (!g) return;
    if (d.t === 'state') { applyState(g, d.s); return; }
    queued++;
    chain = chain.then(function () { return handle(g, d); }).catch(function (e) { if (e !== 'abort') console.error(e); }).then(function () { queued--; });
  }
  function applyState(g, s) {
    s.ownerIdx = gstate.idx; s.dice = Meta.p.equip.dice;
    if (s.light) { s.tiles.forEach(function (t, i) { t.n = g.s.tiles[i] ? g.s.tiles[i].n : []; }); s.players.forEach(function (p, i) { var o = g.s.players[i]; if (o && o.hist) p.hist = o.hist.slice(-40).concat(p.hist).slice(-60); }); delete s.light; }
    // keep my own piece where my preview is while I'm choosing a path
    g.s = s; A.consumeUsed(g); A.refresh();
  }
  var curRpc = null;
  var FAST_TOAST = { showCard: function (a) { return '🃏 ' + a[0].name + ': ' + a[1].name; }, rent: function (a) { return '🏪 ' + a[0].name + ' จ่าย ' + Game.fmt(a[3]) + ' G ให้ ' + a[1].name; }, promotion: function (a) { return '🎉 ' + a[0].name + ' เลื่อนระดับ +' + Game.fmt(a[1]) + ' G'; }, lineBonus: function (a) { return '🌈 ' + a[0].name + ' แถวการ์ด +' + Game.fmt(a[2]) + ' G'; }, casinoShow: function (a) { return '🎰 ' + a[0].name + (a[3] ? ' ชนะ +' + Game.fmt(a[3]) : ' เสีย ' + a[2]) + ' G'; }, notify: function (a) { return a[1]; } };
  async function handle(g, d) {
    var io = g.io;
    if (d.t === 'end') { applyState(g, d.s); A.consumeUsed(g); leave(); A.showResult(g); return; }
    if (d.t === 'ev') {
      if (d.m === 'log') { A.addLog(d.args[0], d.args[1]); return; }
      if (d.m === 'toast') { A.toast(d.args[0]); return; }
      var args = dec(d.args, g.s), p0 = args[0], behind = queued > 2;
      if (d.m === 'step') { p0.prev = p0.pos; p0.pos = args[1]; if (behind) { A.refresh(); return; } }
      if (d.m === 'teleport') { p0.pos = args[2]; if (behind) { A.refresh(); return; } }
      if (d.m === 'turnStart') { A.setTurnLabel(p0, p0.id === gstate.idx); A.refresh(); return; }
      if (FAST_TOAST[d.m]) { // other players' popups → short toasts so the guest never falls behind
        var mine = (isPlayer(p0) && p0.id === gstate.idx) || (d.m === 'rent' && args[1].id === gstate.idx);
        if (!mine || behind) { A.toast(FAST_TOAST[d.m](args), 2200); A.refresh(); return; }
      }
      if (behind && (d.m === 'showDice' || d.m === 'landed' || d.m === 'built' || d.m === 'money' || d.m === 'dividend' || d.m === 'suit')) { A.refresh(); return; }
      if (io[d.m]) await io[d.m].apply(io, args.map(aiClone));
      return;
    }
    if (d.t === 'rpc') {
      applyState(g, d.s); curRpc = d.id;
      var a = dec(d.args, g.s), ops = []; g._rec = ops;
      if (d.m === 'preRoll') A.setTurnLabel(a[0], true);
      var v;
      try { v = await io[d.m].apply(io, a); } finally { g._rec = null; curRpc = null; }
      if (net) net.host({ t: 'res', id: d.id, v: enc(v, g.s), ops: ops });
    }
  }
  // record UI-side mutations on the guest so the host can replay them
  function instrumentGuest(g) {
    ['buyStock', 'sellStock'].forEach(function (f) { g[f] = function (p, d, n) { if (g._rec) g._rec.push({ f: f, a: [p.id, d, n] }); return Game.prototype[f].call(g, p, d, n); }; });
    g.sellShopToBank = function (p, t, forced) { if (g._rec) g._rec.push({ f: 'sellShopToBank', a: [p.id, t.id] }); return Game.prototype.sellShopToBank.call(g, p, t, forced); };
    g.usePreRoll = async function (p, sl) {
      var rec = { f: 'usePreRoll', a: [p.id, g.loadoutSlots(p).indexOf(sl)], ans: [] }; g._ans = rec.ans;
      var r = await Game.prototype.usePreRoll.call(g, p, sl); g._ans = null; if (g._rec && r) g._rec.push(rec); return r;
    };
    ['chooseNumber', 'choose'].forEach(function (m) { var f = g.io[m]; g.io[m] = function () { return Promise.resolve(f.apply(g.io, arguments)).then(function (v) { if (g._ans) g._ans.push(v); return v; }); }; });
  }
  function leave() { clearInterval(hb); if (net) { try { net.close(); } catch (e) { } } net = null; room = null; pending = {}; queued = 0; chain = Promise.resolve(); A.setOnline(null); }

  return {
    init: function (api) { A = api; },
    host: host, join: join, startHost: startHost, hostIO: hostIO, end: end, leave: leave, instrumentGuest: instrumentGuest,
    get room() { return room; }, get kind() { return net && net.kind; },
    setSetting: function (k, v) { if (room && room.role === 'host') { room.settings[k] = v; lobbyBroadcast(); } },
  };
})();
