// ===================== ONLINE MULTIPLAYER (room code, host-authoritative) =====================
// Host runs the real game engine. Guests only render and answer their own decisions.
// Transport: PeerJS/WebRTC (peer-to-peer, low latency) — falls back to BroadcastChannel (same device, for testing).
var Online = (function () {
  var A = null;           // UI internals injected by ui.js
  var net = null;         // transport
  var room = null;        // { code, role, players:[{peer,name,char,costume,loadout}], settings }
  var pending = {}, rpcSeq = 0, chain = Promise.resolve(), dirty = false, dirtyT = null;
  var DECIDE = ['preRoll', 'rollDice', 'planPath', 'chooseDir', 'confirmBuy', 'chooseInvest', 'confirmBuyout', 'bank', 'broker', 'pickCard', 'choose', 'chooseNumber', 'confirmUse', 'confirmDeal', 'auctionBid', 'casinoBet', 'chooseBuilding', 'chooseSpecialHouse', 'portalChoice', 'pickTile', 'debtSell', 'dragonBet'];
  var DISPLAY = ['wheel', 'turnStart', 'showDice', 'step', 'teleport', 'landed', 'rent', 'dividend', 'money', 'promotion', 'suit', 'built', 'showCard', 'lineBonus', 'casinoShow', 'notify', 'info', 'party', 'windmill', 'toll', 'dragonResult', 'windSteal'];
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
      var peer = isHost ? new Peer('rfs-room-' + roomCode, { debug: 0 }) : new Peer({ debug: 0 }), conns = {}, readyDone = false, timer = null, failed = false;
      if (isHost) peer.on('open', function () { readyDone = true; });
      var wire = function (c) {
        c.on('open', function () { conns[c.peer] = c; if (isHost) onJoin(c.peer); else if (!readyDone) { readyDone = true; clearTimeout(timer); onReady(); } });
        c.on('data', function (d) { var m = unpack(c.peer, d); if (m) onMsg(c.peer, m); });
        c.on('close', function () { if (conns[c.peer]) { delete conns[c.peer]; onLeave(c.peer); } });
        c.on('error', function () { });
      };
      peer.on('open', function () { if (isHost) onReady(); else wire(peer.connect('rfs-room-' + roomCode, { reliable: true, serialization: 'raw' })); });
      if (isHost) peer.on('connection', wire);
      // signalling server lost (Wi-Fi blip, phone sleep): keep retrying so players who drop can still find this room again
      var sigTry = null;
      var keepSignal = function () { if (sigTry) return; sigTry = setInterval(function () { if (!peer || peer.destroyed) { clearInterval(sigTry); sigTry = null; return; } if (!peer.disconnected) { clearInterval(sigTry); sigTry = null; return; } try { peer.reconnect(); } catch (e) { } }, 3000); try { peer.reconnect(); } catch (e) { } };
      peer.on('disconnected', keepSignal);
      peer.on('error', function (e) { var t = e && e.type; if (isHost && readyDone && (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed')) { keepSignal(); return; } if (readyDone && t !== 'peer-unavailable') return; if (failed) return; failed = true; clearTimeout(timer); onFail(t === 'unavailable-id' ? 'รหัสห้องนี้ถูกใช้แล้ว ลองสร้างใหม่' : t === 'peer-unavailable' ? 'ไม่พบห้องนี้ — ตรวจรหัสห้องอีกครั้ง' : t === 'browser-incompatible' ? 'เบราว์เซอร์นี้ไม่รองรับการเล่นออนไลน์' : 'เชื่อมต่อไม่ได้ (' + (t || 'network') + ')'); });
      if (!isHost) timer = setTimeout(function () { if (!readyDone && !failed) { failed = true; try { peer.destroy(); } catch (e) { } onFail('เชื่อมต่อนานเกินไป — ลองใหม่ หรือเปลี่ยนเครือข่าย Wi-Fi'); } }, 15000);
      var send = function (c, m) { if (c && c.open) pack(m, function (x) { try { c.send(x); } catch (e) { } }); };
      return { kind: 'p2p', send: function (to, m) { send(conns[to], m); }, all: function (m, except) { Object.keys(conns).forEach(function (k) { if (k !== except) send(conns[k], m); }); }, host: function (m) { send(conns[Object.keys(conns)[0]], m); }, drop: function (k) { var c = conns[k]; delete conns[k]; try { c && c.close(); } catch (e) { } }, close: function () { Object.keys(conns).forEach(function (k) { delete conns[k]; }); clearTimeout(timer); failed = true; try { peer.destroy(); } catch (e) { } } };
    }
    // BroadcastChannel (same device testing: add ?local=1 to the URL)
    var me = isHost ? 'host' : 'g' + Math.random().toString(36).slice(2, 8), bc0 = new BroadcastChannel('rfs-room-' + roomCode), peers = {}, closed = false;
    var bc = { postMessage: function (m) { if (!closed) try { bc0.postMessage(m); } catch (e) { } }, close: function () { closed = true; bc0.close(); } };
    bc0.onmessage = function (ev) { if (!closed && bc.onmessage) bc.onmessage(ev); };
    bc.onmessage = function (ev) {
      if (window.__mute) return; // test hook: simulate a dead connection
      var d = ev.data; if (d.to && d.to !== me && d.to !== '*') return; if (d.from === me) return;
      if (d.sys === 'join' && isHost) { peers[d.from] = 1; bc.postMessage({ sys: 'ok', to: d.from, from: me }); onJoin(d.from); return; }
      if (d.sys === 'ok' && !isHost) { if (!gotOk) { gotOk = true; onReady(); } return; }
      if (d.sys === 'bye') { if (peers[d.from] || !isHost) { delete peers[d.from]; onLeave(d.from); } return; }
      if (d.m) { var m = unpack(d.from, d.m); if (m) onMsg(d.from, m); }
    };
    addEventListener('beforeunload', function () { bc.postMessage({ sys: 'bye', from: me, to: '*' }); });
    var gotOk = false;
    if (isHost) setTimeout(onReady, 50); else { setTimeout(function () { bc.postMessage({ sys: 'join', from: me, to: 'host' }); }, 50); setTimeout(function () { if (!gotOk && !closed) { bc.close(); onFail('ไม่พบห้อง'); } }, 6000); }
    var post = function (to, m) { if (window.__mute) return; pack(m, function (x) { bc.postMessage({ to: to, from: me, m: x }); }); };
    return { kind: 'local', send: post, all: function (m, except) { Object.keys(peers).forEach(function (k) { if (k !== except) post(k, m); }); }, host: function (m) { post('host', m); }, drop: function (k) { delete peers[k]; }, close: function () { if (window.__syncClose && !isHost) onLeave('host'); bc.postMessage({ sys: 'bye', from: me, to: '*' }); bc.close(); } };
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
        var g = A.game(), live = room.started && g ? g.s.players.filter(function (p) { return p.remote; }).map(function (p) { return p.remote; }) : (room.players || []).map(function (x) { return x.peer; }).filter(Boolean);
        live.forEach(function (pid) { if (!lastSeen[pid]) lastSeen[pid] = now; if (now - lastSeen[pid] > 35000) { lastSeen[pid] = now + 1e12; net.drop(pid); onHostLeave(pid); } });
      } else {
        net.host({ t: 'pong' });
        if (!lastSeen.host) lastSeen.host = now;
        if (now - lastSeen.host > 10000) { var g1 = A.game(); if (room.started && g1 && (g1._ended || g1.s.over)) { leave(); return; } if (room.started) reconnect(); else { A.toast('📴 ขาดการเชื่อมต่อกับโฮสต์'); leave(); A.closeModal(); } }
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
  function hostClone(p) { return isPlayer(p) && (p.remote || p.seat) ? Object.assign({}, p, { isAI: true }) : p; }   // host: only remote players become non-blocking
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
      else if (o.f === 'sellSpecialToBank') { var t2 = g.s.tiles[o.a[1]]; if (t2.spOwner === p.id) g.sellSpecialToBank(p, t2); }
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
        if (g._replay && g._replay.length && p && p.seat) return g._replay.shift();
        if (p && p.seat) {
          A.setWaiting(p);
          for (var attempt = 0; attempt < 6; attempt++) {
            if (!p.remote) { // offline: wait a little for them to come back
              var t0 = Date.now(); while (!p.remote && Date.now() - t0 < 25000) { A.setWaiting(p, true); await new Promise(function (r) { setTimeout(r, 500); }); }
              if (!p.remote) break;
            }
            try {
              var r = await rpc(g, p.remote, m, args);
              await applyOps(g, r.ops);
              if (m === 'rollDice') { net.all({ t: 'ev', m: 'showDice', args: enc([p, r.v], g.s) }, p.remote); await io.showDice(hostClone(p), r.v); }
              pushState(g); return r.v;
            } catch (e) { if (e === 'abort') throw e; if (e === 'timeout') break; /* 'left' → loop and wait for rejoin */ }
          }
          var fb = await aiFallback(g, io, f, m, args, p); pushState(g); return fb;
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
    // host keeps a copy of the match so a crashed / reloaded host can reopen the same room and everyone rejoins
    w.autosave = function (s) { try { if (room) localStorage.setItem('rfs_online_host', JSON.stringify({ code: room.code, settings: room.settings, t: Date.now(), s: snap(s, true) })); } catch (e) { } };
    return w;
  }
  function onHostMsg(peer, d) {
    lastSeen[peer] = Date.now();
    if (d.t === 'pong') return;
    if (d.t === 'hello') {
      if (room.started) { net.send(peer, { t: 'full', why: 'เกมเริ่มไปแล้ว' }); return; }
      if (room.settings.tour && room.players.length >= 2) { net.send(peer, { t: 'full', why: 'ห้องทัวร์นาเมนต์เต็มแล้ว (ทีมละ 2 คน)' }); return; }
      if (room.players.length >= 4) { net.send(peer, { t: 'full', why: 'ห้องเต็มแล้ว (4 คน)' }); return; }
      var ex = room.players.find(function (x) { return x.token && x.token === d.token; });
      if (ex) { ex.peer = peer; lobbyBroadcast(); A.renderLobby(); return; }
      var used = room.players.map(function (x) { return x.char; }), ch = d.char, nm = String(d.name || 'ผู้เล่น').slice(0, 12), k = 2;
      while (room.players.some(function (x) { return x.name === nm; })) nm = String(d.name || 'ผู้เล่น').slice(0, 12) + ' ' + (k++);
      d.name = nm;
      if (used.indexOf(ch) >= 0) ch = A.allCharKeys().find(function (k) { return used.indexOf(k) < 0; });
      room.players.push({ peer: peer, token: d.token, name: d.name, char: ch, costume: ch === d.char ? d.costume : 'chars', loadout: d.loadout || { eq: [], sc: null }, dice: typeof d.dice === 'string' ? d.dice : null, color: typeof d.color === 'number' ? d.color : -1 });
      lobbyBroadcast(); A.renderLobby();
    } else if (d.t === 'rejoin') {
      var g = A.game(), pl = g && room.started ? g.s.players.find(function (q) { return q.seat && q.seat === d.token; }) : null;
      if (!pl) { if (!room.started) { onHostMsg(peer, Object.assign({}, d, { t: 'hello' })); return; } net.send(peer, { t: 'full', why: 'ไม่พบที่นั่งของคุณในห้องนี้' }); return; }
      if (pl.remote && pl.remote !== peer) { var old = pl.remote; Object.keys(pending).forEach(function (id) { if (pending[id].peer === old) { var pd = pending[id]; delete pending[id]; pd.rej('left'); } }); try { net.drop(old); } catch (e) { } }
      pl.remote = peer; pl.offline = 0; lastSeen[peer] = Date.now();
      if (g.s.over) { net.send(peer, { t: 'end', s: snap(g.s, true) }); return; }
      net.send(peer, { t: 'start', s: snap(g.s, true), idx: pl.id, rejoin: 1 });
      A.toast('🔌 ' + A.esc(pl.name) + ' กลับเข้าเกมแล้ว!'); net.all({ t: 'ev', m: 'toast', args: ['🔌 ' + pl.name + ' กลับเข้าเกมแล้ว!'] }, peer); A.refresh();
    } else if (d.t === 'res') { var pd = pending[d.id]; if (pd) { delete pending[d.id]; pd.res({ v: d.v, ops: d.ops }); } }
  }
  function onHostLeave(peer) {
    if (!room) return;
    if (!room.started) { room.players = room.players.filter(function (x) { return x.peer !== peer; }); lobbyBroadcast(); A.renderLobby(); return; }
    var g = A.game(); if (!g) return;
    g.s.players.forEach(function (p) { if (p.remote === peer) { p.remote = null; p.offline = Date.now(); A.toast('📴 ' + A.esc(p.name) + ' หลุด — รอกลับเข้ามา (ถ้าไม่กลับ ระบบช่วยเล่นแทนชั่วคราว)', 3500); } });
    Object.keys(pending).forEach(function (id) { if (pending[id].peer === peer) { var pd = pending[id]; delete pending[id]; pd.rej('left'); } });
    A.refresh(); pushState(g);
  }
  function lobbyBroadcast() { net.all({ t: 'lobby', players: room.players.map(function (x) { return { name: x.name, char: x.char, costume: x.costume, color: x.color }; }), settings: room.settings }); }
  function host(done, opt) {
    if (typeof done === 'object' && done) { opt = done; done = null; }
    done = done || function (err) { if (err) { A.toast('⚠️ ' + err, 3500); leave(); return; } A.lobbyModal(); };
    var c = code(), P = Meta.p, tour = opt && opt.tour, mc = P.color || 0;
    room = { code: c, role: 'host', started: false, players: [{ peer: null, name: P.name, char: P.equip.char, costume: P.equip.costume, dice: P.equip.dice, loadout: Meta.validLoadout(), color: mc }], settings: { map: 0, target: 40000, fillAI: true, tax: false, teams: !!tour, teamCol: [mc, mc === 1 ? 0 : 1], startCash: 10000, rounds: 100, aiLv: ['normal', 'normal', 'normal', 'normal'], teamOf: tour ? [0, 0, 1, 1] : [0, 1, 0, 1] } };
    if (tour) room.settings.tour = { world: 0 };
    loadPeer().then(function (ok) {
      if (!ok && !localMode()) { done('โหลดระบบออนไลน์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่'); return; }
      net = makeNet(c, true, onHostMsg, function (pid) { lastSeen[pid] = Date.now(); }, onHostLeave, function () { startHeartbeat(true); done(null, room); }, function (err) { done(err); });
    });
  }
  function startHost() {
    var R = room.settings, players = room.players.map(function (x, i) { return { name: x.name, char: x.char, costume: x.costume, isAI: false, remote: x.peer || undefined, seat: x.peer ? x.token : null, loadout: x.loadout, team: R.teamOf[i], dice: x.dice || null }; });
    var used = players.map(function (p) { return p.char; }), pool = A.allCharKeys().filter(function (k) { return used.indexOf(k) < 0; }).sort(function () { return Math.random() - 0.5; });
    var TW = R.tour ? TOUR_WORLDS[R.tour.world] : null;
    if (TW && players.length < 2) { A.toast('🤝 ทัวร์นาเมนต์แบบทีมต้องมีเพื่อนเข้าห้องก่อน 1 คน (ส่งรหัสห้องให้เพื่อน)', 3500); return; }
    if (R.fillAI || R.teams) while (players.length < 4) { var ch = pool.shift(), sl = players.length; players.push({ name: Meta.charName(ch) + ' AI', char: ch, isAI: true, aiLevel: TW ? TW.ai[sl - 1] : (R.aiLv[sl] || 'normal'), persona: AI_PERSONAS[Math.floor(Math.random() * 5)], team: R.teamOf[sl] }); }
    if (!R.teams) { var cols = A.assignColors(room.players.map(function (x) { return typeof x.color === 'number' ? x.color : -1; }).concat(players.slice(room.players.length).map(function () { return -1; }))); players.forEach(function (q, k) { q.color = cols[k]; }); }
    if (players.length < 2) { A.toast('ต้องมีผู้เล่นอย่างน้อย 2 คน (เปิด “เติม AI” ได้)'); return; }
    if (R.teams) { var c0 = players.filter(function (q) { return q.team === 0; }).length; if (c0 !== 2) { A.toast('⚠️ โหมดทีมต้องแบ่ง ทีมชมพู 2 คน / ทีมฟ้า 2 คน — แตะป้ายทีมเพื่อสลับ', 3500); return; } }
    var tc = R.teamCol || [0, 1], s = Game.create({ mapIdx: TW ? TW.map : R.map, players: players, teams: !!R.teams, teamInfo: [TEAM_PAL[tc[0]], TEAM_PAL[tc[1]]], target: TW ? TW.target * 2 : R.target, startCash: TW ? 10000 : (R.startCash || 10000), maxRounds: TW ? TW.rounds : (R.rounds > 0 ? R.rounds : 9999), rules: { tax: TW ? false : R.tax, endOnBankrupt: true }, seed: Math.floor(Math.random() * 1e9) });
    if (TW) { s.tour = { kind: 'team', world: R.tour.world }; s.lenName = 'World ' + (R.tour.world + 1); }
    s.players.forEach(function (p, i) { p.remote = players[i].remote || null; p.seat = players[i].seat || null; });
    s.ownerIdx = 0; s.dice = Meta.p.equip.dice; s.online = true;
    room.started = true; A.setOnline({ role: 'host', code: room.code, kind: net.kind });
    s.players.forEach(function (p) { if (p.remote) net.send(p.remote, { t: 'start', s: snap(s, true), idx: p.id }); });
    A.closeModal(); A.startGame(s, true);
  }
  // tournament: the team goes on together unless it was knocked out or this was the last world
  function tourGoesOn(s) { return !!(s.tour && s.tour.kind === 'team' && s.winTeam === 0 && s.tour.world < TOUR_WORLDS.length - 1); }
  function end(g) { try { localStorage.removeItem('rfs_online_host'); } catch (e) { } if (net) net.all({ t: 'end', s: snap(g.s, true) }); if (!tourGoesOn(g.s)) setTimeout(function () { if (room && room.started && A.game() === g) leave(); }, 60000); }
  function nextWorld() { if (!room || room.role !== 'host' || !room.settings.tour) return; var g = A.game(); room.settings.tour.world = (g && g.s.tour ? g.s.tour.world : room.settings.tour.world) + 1; room.players = room.players.filter(function (x, i) { return i === 0 || x.peer; }); startHost(); }
  function savedHost() { try { var x = JSON.parse(localStorage.getItem('rfs_online_host') || 'null'); return x && x.s && !x.s.over && Date.now() - x.t < 3 * 3600e3 ? x : null; } catch (e) { return null; } }
  // reopen a room this device was hosting (page reloaded / app closed). Players rejoin with their seat token.
  function resumeHost(done) {
    var sv = savedHost(); if (!sv) return done('ไม่มีห้องที่ค้างไว้');
    room = { code: sv.code, role: 'host', started: true, players: [], settings: sv.settings };
    loadPeer().then(function (ok) {
      if (!ok && !localMode()) { done('โหลดระบบออนไลน์ไม่ได้'); return; }
      var t0 = Date.now();
      (function tryOpen() {
        net = makeNet(sv.code, true, onHostMsg, function (pid) { lastSeen[pid] = Date.now(); }, onHostLeave, function () {
          startHeartbeat(true);
          var s = sv.s; s.players.forEach(function (p) { p.remote = null; if (p.seat) p.offline = Date.now(); });
          s.ownerIdx = s.ownerIdx || 0; s.dice = Meta.p.equip.dice; s.online = true;
          A.setOnline({ role: 'host', code: room.code, kind: net.kind }); A.closeModal(); A.startGame(s, false);
          A.toast('🏠 เปิดห้อง ' + room.code + ' อีกครั้งแล้ว — ผู้เล่นที่หลุดจะกลับเข้ามาเอง', 4000); done(null);
        }, function (err) {
          try { net && net.close(); } catch (e) { } net = null;
          if (Date.now() - t0 < 90000) { A.toast('⏳ กำลังเปิดห้องเดิม ' + sv.code + '...', 2500); setTimeout(tryOpen, 4000); } else { room = null; done(err); }
        });
      })();
    });
  }

  // ===================== GUEST =====================
  var gstate = { idx: -1 }, rc = null;
  function token() { var t = localStorage.getItem('rfs_online_token'); if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); try { localStorage.setItem('rfs_online_token', t); } catch (e) { } } return t; }
  function savedSeat() { try { var x = JSON.parse(localStorage.getItem('rfs_online_seat') || 'null'); return x && Date.now() - x.t < 3 * 3600e3 ? x : null; } catch (e) { return null; } }
  function guestNet(roomCode, isRejoin, done) {
    var P = Meta.p;
    net = makeNet(roomCode, false, onGuestMsg, function () { }, function () { var g0 = A.game(); if (room && room.started && g0 && (g0._ended || g0.s.over)) { leave(); return; } if (room && room.started) reconnect(); else if (room) { A.toast('📴 โฮสต์ออกจากห้องแล้ว'); leave(); A.closeModal(); } }, function () {
      lastSeen.host = Date.now();
      net.host(isRejoin ? { t: 'rejoin', token: token() } : { t: 'hello', token: token(), color: P.color || 0, name: P.name, char: P.equip.char, costume: P.equip.costume, dice: P.equip.dice, loadout: Meta.validLoadout() });
      startHeartbeat(false); done(null, room);
    }, function (err) { done(err); });
  }
  // lost the host mid-game: keep the screen and keep trying to get back in
  function reconnect() {
    if (!room || rc) return;
    A.netStatus('🔄 กำลังเชื่อมต่อกลับ...'); clearInterval(hb);
    var code0 = room.code, t0 = Date.now(), n = 0, myRc = {};
    rc = myRc;
    (function attempt() {
      if (!room || rc !== myRc) return;
      if (Date.now() - t0 > 15 * 60000) { rc = null; A.netStatus(null); A.toast('📴 เชื่อมต่อกลับไม่ได้ — กด “กลับเข้าห้อง” ในเมนูโหมดออนไลน์ได้ภายใน 3 ชั่วโมง', 6000); leave(); A.toMenu(); return; }
      n++; A.netStatus('🔄 กำลังเชื่อมต่อกลับ... (ครั้งที่ ' + n + ')<br><span style="font-size:14px">ห้อง ' + code0 + ' • ที่นั่งของคุณยังอยู่ ระหว่างนี้ระบบเล่นแทนชั่วคราว</span>');
      try { if (net) net.close(); } catch (e) { } net = null;
      guestNet(code0, true, function (err) {
        if (rc !== myRc) return;
        if (err) { setTimeout(attempt, 2500); return; }
        // connected: if the host doesn't put us back in within 12 s, try again
        setTimeout(function () { if (rc === myRc && room) attempt(); }, 12000);
      });
    })();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !room || room.role !== 'guest' || !room.started) return;
    var g2 = A.game(); if (g2 && (g2._ended || g2.s.over)) return;
    if (Date.now() - (lastSeen.host || 0) > 5000) { rc = null; reconnect(); }
  });
  function rejoin(done) {
    var st = savedSeat(); if (!st) return done('ไม่มีห้องที่ค้างไว้');
    room = { code: st.code, role: 'guest', players: [], started: true };
    loadPeer().then(function (ok) { if (!ok && !localMode()) { done('โหลดระบบออนไลน์ไม่ได้'); return; } guestNet(st.code, true, done); });
  }
  function join(roomCode, done) {
    var P = Meta.p;
    room = { code: roomCode, role: 'guest', players: [] };
    loadPeer().then(function (ok) {
      if (!ok && !localMode()) { done('โหลดระบบออนไลน์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่'); return; }
      guestNet(roomCode, false, done);
    });
  }
  var queued = 0;
  function onGuestMsg(peer, d) {
    lastSeen.host = Date.now();
    if (d.t === 'ping') return;
    if (d.t === 'cancel') { if (curRpc === d.id) A.closeModal(); return; }
    if (d.t === 'lobby') { room.players = d.players; room.settings = d.settings; A.renderLobby(); return; }
    if (d.t === 'full') { A.toast('⚠️ ' + d.why); try { localStorage.removeItem('rfs_online_seat'); } catch (e) { } rc = null; A.netStatus(null); var st0 = room && room.started; leave(); A.closeModal(); if (st0) A.toMenu(); return; }
    if (d.t === 'start') { rc = null; A.netStatus(null); queued = 0; chain = Promise.resolve(); curRpc = null; room.started = true; gstate.idx = d.idx; try { localStorage.setItem('rfs_online_seat', JSON.stringify({ code: room.code, idx: d.idx, t: Date.now() })); } catch (e) { } if (d.rejoin) A.toast('🔌 กลับเข้าเกมแล้ว!'); A.setOnline({ role: 'guest', code: room.code, idx: d.idx, kind: net.kind }); A.closeModal(); A.startGuest(d.s, d.idx); return; }
    var g = A.game(); if (!g) return;
    if (d.t === 'state' && !(d.s && d.s.over)) { applyState(g, d.s); return; }
    if (d.t === 'end' || d.t === 'state') { if (g._ended) return; g._ended = true; d = { t: 'end', s: d.s }; // game over: don't wait behind queued animations / open popups
      chain = Promise.resolve(); queued = 0; curRpc = null; A.closeModal();
      handle(g, d).catch(function (e) { console.error(e); }); return;
    }
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
  var FAST_TOAST = { showCard: function (a) { return '🃏 ' + a[0].name + ': ' + a[1].name; }, rent: function (a) { return '🏪 ' + a[0].name + ' จ่าย ' + Game.fmt(a[3]) + ' G ให้ ' + a[1].name; }, promotion: function (a) { return '🎉 ' + a[0].name + ' เลื่อนระดับ +' + Game.fmt(a[1]) + ' G'; }, lineBonus: function (a) { return '🌈 ' + a[0].name + ' แถวการ์ด +' + Game.fmt(a[2]) + ' G'; }, casinoShow: function (a) { return '🎰 ' + a[0].name + (a[3] ? ' ชนะ +' + Game.fmt(a[3]) : ' เสีย ' + a[2]) + ' G'; }, notify: function (a) { return a[1]; }, party: function (a) { return '🎉 ปาร์ตี้ที่บ้าน ' + a[1].name + ' ทุกคนจ่าย 100 G'; }, windmill: function (a) { return '🌬️ ' + a[0].name + ' สกิลปลิวหาย ' + a[3].length + ' ใบ'; } };
  async function handle(g, d) {
    var io = g.io;
    if (d.t === 'end') { try { localStorage.removeItem('rfs_online_seat'); } catch (e) { } applyState(g, d.s); A.consumeUsed(g); if (!tourGoesOn(d.s)) leave(); A.showResult(g); return; }
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
    g.sellSpecialToBank = function (p, t) { if (g._rec) g._rec.push({ f: 'sellSpecialToBank', a: [p.id, t.id] }); return Game.prototype.sellSpecialToBank.call(g, p, t); };
    g.usePreRoll = async function (p, sl) {
      var rec = { f: 'usePreRoll', a: [p.id, g.loadoutSlots(p).indexOf(sl)], ans: [] }; g._ans = rec.ans;
      var r = await Game.prototype.usePreRoll.call(g, p, sl); g._ans = null; if (g._rec && r) g._rec.push(rec); return r;
    };
    ['chooseNumber', 'choose'].forEach(function (m) { var f = g.io[m]; g.io[m] = function () { return Promise.resolve(f.apply(g.io, arguments)).then(function (v) { if (g._ans) g._ans.push(v); return v; }); }; });
  }
  function leave() { clearInterval(hb); rc = null; var n0 = net; net = null; room = null; if (n0) { try { n0.close(); } catch (e) { } } A.netStatus(null); pending = {}; queued = 0; chain = Promise.resolve(); A.setOnline(null); }

  return {
    init: function (api) { A = api; },
    host: host, nextWorld: nextWorld, join: join, rejoin: rejoin, savedSeat: savedSeat, savedHost: savedHost, resumeHost: resumeHost, startHost: startHost, hostIO: hostIO, end: end, leave: leave, instrumentGuest: instrumentGuest,
    get room() { return room; }, get kind() { return net && net.kind; },
    setSetting: function (k, v) { if (room && room.role === 'host') { room.settings[k] = v; lobbyBroadcast(); } },
  };
})();
