// ===================== UI (touch-first, iPad landscape) =====================
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var fmt = Game.fmt;
  var U = { g: null, token: 0, speed: 1, sound: true, sel: { map: 0, len: 1, slots: null }, view: 0 };
  window.U = U;
  Meta.load();
  U.music = true; U.vol = 0.5;
  try { var st = JSON.parse(localStorage.getItem('rfs_settings') || '{}'); if (st.speed) U.speed = st.speed; if (st.sound === false) U.sound = false; if (st.music === false) U.music = false; if (st.vol !== undefined) U.vol = st.vol; } catch (e) { }
  var SPEEDS = [[0.5, '🐢 ช้า'], [1, '🐻 ปกติ'], [1.8, '🐇 เร็ว'], [3, '⚡ เร็วมาก']];
  if (!SPEEDS.some(function (x) { return x[0] === U.speed; })) U.speed = 1;
  function speedLabel() { return (SPEEDS.find(function (x) { return x[0] === U.speed; }) || SPEEDS[1])[1]; }
  function saveSettings() { localStorage.setItem('rfs_settings', JSON.stringify({ speed: U.speed, sound: U.sound, music: U.music, vol: U.vol })); }

  // ---------- stage scaling ----------
  function fit() { var s = Math.min(innerWidth / 1280, innerHeight / 860); $('#stage').style.transform = 'scale(' + s + ')'; }
  addEventListener('resize', fit); fit();

  // ---------- helpers ----------
  function spr(spec, w, h, extraStyle) {
    if (!spec) return '';
    if (spec[0] === 'cdice') { var z = Math.min(w, h) * 0.62; return '<div class="cdiceIcon" style="width:' + w + 'px;height:' + h + 'px">' + cubeHTML(z, 'fx:' + spec[1], true) + '</div>'; }
    var S = ATLAS[spec[0]]; if (!S) return '';
    var b = typeof spec[1] === 'string' ? S.n[spec[1]] : S.b[spec[1]]; if (!b) return '';
    if (spec[2]) { var n = spec[2], k = spec[3] || 0; b = [b[0] + b[2] / n * k, b[1], b[2] / n, b[3]]; }
    var sc = Math.min(w / b[2], h / b[3]);
    return '<div class="spr" style="width:' + (b[2] * sc).toFixed(1) + 'px;height:' + (b[3] * sc).toFixed(1) + 'px;background-image:url(' + S.url + ');background-size:' + (S.W * sc).toFixed(1) + 'px ' + (S.H * sc).toFixed(1) + 'px;background-position:-' + (b[0] * sc).toFixed(1) + 'px -' + (b[1] * sc).toFixed(1) + 'px;' + (extraStyle || '') + '"></div>';
  }
  U.spr = spr; U.spinner = function (el, size, tint) { return spinner(el, size, tint); };
  function setHTML(el, html) { if (el && el._h !== html) { el._h = html; el.innerHTML = html; } }
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function show(id) { document.querySelectorAll('.screen').forEach(function (e) { e.classList.toggle('on', e.id === id); }); if (id === 'menu') renderMenu(); if (window.Music) Music.setMood(id === 'game' ? 'game' : 'menu'); }
  function wait(ms) { var t = U.token; return new Promise(function (res, rej) { setTimeout(function () { t === U.token ? res() : rej('abort'); }, ms / U.speed); }); }
  function toast(msg, ms) { var d = document.createElement('div'); d.innerHTML = msg; $('#toast').appendChild(d); setTimeout(function () { d.remove(); }, ms || 2200); }
  U.toast = toast; U.boxModal = function () { return boxModal(); };
  // tiny WebAudio sfx
  var AC = null;
  function sfx(kind) {
    if (!U.sound) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      var o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
      var f = { step: [520, .05], tap: [660, .05], coin: [988, .12], bad: [180, .2], dice: [300, .04], win: [784, .4], card: [880, .1], build: [440, .18] }[kind] || [600, .06];
      o.type = kind === 'bad' ? 'sawtooth' : 'triangle'; o.frequency.setValueAtTime(f[0], t);
      if (kind === 'coin' || kind === 'win') o.frequency.exponentialRampToValueAtTime(f[0] * 1.5, t + f[1]);
      g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + f[1] + .05);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + f[1] + .06);
    } catch (e) { }
  }
  document.addEventListener('click', function (e) { if (e.target.closest('button,.opt,.tab,.hot')) sfx('tap'); }, true);

  // ---------- MODAL (queued, promise-based) ----------
  var mq = Promise.resolve(), modalOpen = false, mgen = 0;
  // drop every queued popup (used when a match ends: nothing from the old game may block the result screen)
  U.flushModals = function () { mgen++; if (U._closeModal) U._closeModal(); $('#modal').classList.remove('on'); modalOpen = false; mq = Promise.resolve(); };
  function modal(o) {
    var myGen = mgen;
    var run = function () {
      if (myGen !== mgen) return Promise.resolve(null);
      return new Promise(function (resolve) {
        var box = $('#modalBox'), M = $('#modal'); modalOpen = true;
        box.style.width = o.width ? o.width + 'px' : ''; box.style.background = o.bg || '';
        box.innerHTML = (o.close !== false ? '<div class="xbtn" data-x>' + spr(['ui', 'close'], 64, 60) + '</div>' : '') + (o.title ? '<div class="mtitle">' + o.title + '</div>' : '') + '<div class="mbody"></div>' + (o.buttons && o.buttons.length ? '<div class="mbtns"></div>' : '');
        var body = box.querySelector('.mbody');
        if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
        var done = false, timer = null;
        U._closeModal = function () { close(o.xValue === undefined ? null : o.xValue); };
        function close(v) { if (done) return; done = true; U._closeModal = null; clearTimeout(timer); M.classList.remove('on'); modalOpen = false; box.innerHTML = ''; resolve(v); }
        (o.buttons || []).forEach(function (b) {
          var el = document.createElement('button'); el.innerHTML = b.t; if (b.cls) el.className = b.cls; if (b.dis) el.disabled = true;
          el.onclick = function () { close(b.v); }; box.querySelector('.mbtns').appendChild(el);
        });
        var x = box.querySelector('[data-x]'); if (x) x.onclick = function () { close(o.xValue === undefined ? null : o.xValue); };
        M.onclick = function (e) { if (e.target === M && o.close !== false && o.bgClose !== false) close(o.xValue === undefined ? null : o.xValue); };
        M.classList.add('on');
        if (o.auto) timer = setTimeout(function () { close(o.autoValue); }, o.auto / U.speed);
        if (o.mount) o.mount(box, close);
      });
    };
    var p = mq.then(run); mq = p.catch(function () { }); return p;
  }
  U.modal = modal;
  function alertBox(title, html, btn) { return modal({ title: title, body: '<div style="font-size:18px;font-weight:700;text-align:center;max-width:620px">' + html + '</div>', buttons: [{ t: btn || 'ตกลง', v: true, cls: 'green' }] }); }

  // =====================================================================
  // MAIN MENU (uses the project's menu art; hotspots sit on its painted buttons)
  // =====================================================================
  function renderMenu() {
    var P = Meta.p, ls = Meta.loginState();
    $('#menuImg').style.backgroundImage = 'url(assets/bg_menu.webp)'; $('#menuBgBlur').style.backgroundImage = 'url(assets/bg_menu.webp)';
    var H = [
      [944, 161, 324, 122, 'play'], [961, 300, 307, 69, 'online'], [961, 387, 307, 73, 'ai'], [961, 471, 307, 73, 'tour'], [961, 558, 307, 82, 'shop'],
      [14, 142, 76, 73, 'login'], [14, 230, 76, 73, 'rank'], [14, 318, 76, 73, 'trophy'], [14, 406, 76, 73, 'news'],
      [19, 8, 295, 92, 'profile'], [996, 11, 54, 58, 'news'], [1061, 11, 61, 58, 'mail'], [1134, 11, 57, 58, 'login'], [1203, 11, 61, 58, 'settings'],
      [520, 20, 45, 40, 'exchange'], [716, 20, 45, 40, 'exchange'], [900, 20, 45, 40, 'energy'],
    ];
    var h = H.map(function (r) { return '<div class="hot" data-act="' + r[4] + '" style="left:' + r[0] + 'px;top:' + r[1] + 'px;width:' + r[2] + 'px;height:' + r[3] + 'px"></div>'; }).join('');
    // live currency + level over the painted HUD
    h += '<div class="hudnum" style="left:396px;top:22px;width:128px;height:34px">' + fmt(P.gold) + '</div>';
    h += '<div class="hudnum" style="left:637px;top:22px;width:82px;height:34px">' + fmt(P.diamond) + '</div>';
    h += '<div class="hudnum" style="left:836px;top:22px;width:78px;height:34px">20/20</div>';
    h += '<div class="hudnum" style="left:172px;top:22px;width:84px;height:34px;background:#5a2a14">Lv. ' + P.level + '</div>';
    h += '<div class="hot eventbtn bkkbtn" data-act="bkk"><img src="assets/bkk_banner.webp" draggable="false"><span>🛺 Bangkok City' + (Meta.bagCount('blue') + Meta.bagCount('purple') + Meta.bagCount('red') > 0 ? ' • 👝×' + (Meta.bagCount('blue') + Meta.bagCount('purple') + Meta.bagCount('red')) : '') + '</span></div>';
    h += '<div class="hot eventbtn trainbtn" data-act="trainev"><img src="assets/train_banner.webp" draggable="false"><span>🚂 อีเวนต์รถจักรไอน้ำ' + (P.tickets > 0 ? ' • 🎫×' + P.tickets : '') + '</span></div>';
    h += '<div class="hot eventbtn" data-act="easter"><img src="assets/easter_banner.webp" draggable="false"><span>🐰 อีเวนต์อีสเตอร์' + (P.eeggs > 0 ? ' • 🥚×' + P.eeggs : '') + '</span></div>';
    if (P.boxes > 0) h += '<div class="hot giftbtn" data-act="boxes" style="left:290px;top:150px;width:150px;height:130px"><img src="assets/box.webp" draggable="false"><span>เปิดกล่อง ×' + P.boxes + '</span></div>';
    if (ls.canClaim) h += '<div class="badge" style="left:70px;top:140px">!</div><div class="badge" style="left:1176px;top:8px">!</div>';
    $('#menuHot').innerHTML = h; $('#menuHot').style.cssText = 'position:absolute;left:0;top:69px;width:1280px;height:721px';
  }
  $('#menuHot').addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act;
    if (act === 'play') playMenu(false);
    else if (act === 'ai') playMenu(true);
    else if (act === 'online') onlineMenu();
    else if (act === 'tour') Tour.open();
    else if (act === 'tourOld') alertBox('🏆 ทัวร์นาเมนต์', 'จะเปิดหลังระบบออนไลน์พร้อม — ระหว่างนี้ลองเล่น “Long Match” กับ AI ระดับ Advanced ได้เลย!');
    else if (act === 'shop') openShop('rec');
    else if (act === 'boxes') boxModal().then(renderMenu);
    else if (act === 'easter') Easter.open();
    else if (act === 'trainev') Train.open();
    else if (act === 'bkk') Bkk.open();
    else if (act === 'login') dailyLogin();
    else if (act === 'rank') rankingModal();
    else if (act === 'trophy') achievements();
    else if (act === 'news') newsModal();
    else if (act === 'mail') mailModal();
    else if (act === 'profile') openProfile();
    else if (act === 'settings') hubModal();
    else if (act === 'exchange') openShop('exch');
    else if (act === 'energy') toast('❤️ พลังงานเต็ม 20/20 — เล่นได้ไม่จำกัดใน Prototype');
  });
  function playMenu(vsAI) {
    var has = !!localStorage.getItem('rfs_save_auto'), m = slotMeta('rfs_save_auto');
    var big = function (k, icon, t, sub, cls, dis) { return '<div class="opt bigopt ' + (cls || '') + (dis ? ' dimo' : '') + '" data-pm="' + k + '">' + icon + '<div class="col" style="gap:0"><span style="font-size:22px">' + t + '</span><span style="font-size:13px;opacity:.8">' + sub + '</span></div></div>'; };
    modal({ title: vsAI ? 'เล่นกับ AI' : 'เข้าเกม', width: 620, body: '<div class="col" style="gap:12px">' +
      big('new', spr(['ui', 'play'], 96, 74), 'เริ่มเกมใหม่', 'เลือกแผนที่ ผู้เล่น และไอเทม', 'pmA') +
      big('cont', spr(['ui', 'auto'], 96, 74), 'เล่นต่อ', has && m ? m.map + ' • รอบ ' + m.round : 'ยังไม่มีเกมที่บันทึกไว้', 'pmB', !has) +
      big('load', spr(['ui', 'load'], 96, 74), 'โหลดเกม', 'Auto Save + 3 ช่องบันทึก', 'pmC') +
      big('tut', spr(['ui', 'guide'], 96, 74), 'โหมดสอนเล่น 🎓', 'เล่นจริงพร้อมครูช่วยอธิบายทีละขั้น (แนะนำสำหรับมือใหม่)', 'pmD') + '</div>',
      mount: function (box, close) { box.querySelectorAll('[data-pm]').forEach(function (e) { e.onclick = function () { if (!e.classList.contains('dimo')) close(e.dataset.pm); }; }); } })
      .then(function (v) { if (v === 'new') openSetup(vsAI); else if (v === 'cont') startGame(JSON.parse(localStorage.getItem('rfs_save_auto'))); else if (v === 'load') loadModal(); else if (v === 'tut') Tutorial.start(); });
  }
  // =====================================================================
  // SAVE TRANSFER — move the whole save to another device/browser
  //  • live: 4-digit code, both devices online (PeerJS, no server needed)
  //  • backup code: copy text → paste on the other device (works any time)
  // =====================================================================
  var Sync = (function () {
    var SKIP = /^rfs_(online_|cloud)/;
    function collect() { try { Meta.save(); } catch (e) { } var d = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^rfs_/.test(k) && !SKIP.test(k)) d[k] = localStorage.getItem(k); } return { app: 'rfs', v: 1, t: Date.now(), d: d }; }
    function summary(pkg) { var p = null; try { p = JSON.parse(pkg.d.rfs_profile_v1); } catch (e) { } return p ? 'ชื่อ <b>' + esc(p.name) + '</b> • Lv ' + p.level + ' • ' + fmt(p.gold) + ' G • ' + p.diamond + ' 💎 • ตัวละคร ' + Object.keys(p.chars || {}).length + ' ตัว' + (p.tickets ? ' • 🎫 ' + p.tickets : '') : 'ไม่มีโปรไฟล์'; }
    function apply(pkg) {
      if (!pkg || pkg.app !== 'rfs' || !pkg.d || !pkg.d.rfs_profile_v1) { toast('⚠️ ข้อมูลเซฟไม่ถูกต้อง', 3000); return Promise.resolve(false); }
      if (U._closeModal) U._closeModal();
      return modal({ title: '📥 โหลดเซฟนี้?', width: 560, body: '<div style="text-align:center;font-weight:700;line-height:1.7">เซฟที่ได้รับ: ' + summary(pkg) + '<br><span class="muted">บันทึกเมื่อ ' + new Date(pkg.t).toLocaleString('th-TH') + '</span><br><span style="color:#d0342c">⚠️ เซฟในเครื่องนี้ (' + summary(collect()) + ') จะถูกแทนที่</span></div>', buttons: [{ t: '✅ ใช้เซฟนี้', v: 1, cls: 'green' }, { t: 'ยกเลิก', v: 0 }] })
        .then(function (v) {
          if (!v) return false;
          Object.keys(collect().d).forEach(function (k) { localStorage.removeItem(k); });
          Object.keys(pkg.d).forEach(function (k) { try { localStorage.setItem(k, pkg.d[k]); } catch (e) { } });
          toast('✅ โหลดเซฟแล้ว! กำลังเริ่มเกมใหม่...', 2500); setTimeout(function () { location.reload(); }, 1200); return true;
        });
    }
    // ---- backup code (text) ----
    function toCode(pkg) { var s = JSON.stringify(pkg); return 'RFS1:' + btoa(unescape(encodeURIComponent(s))); }
    function fromCode(c) { try { c = (c || '').trim().replace(/\s+/g, ''); if (c.indexOf('RFS1:') !== 0) return null; return JSON.parse(decodeURIComponent(escape(atob(c.slice(5))))); } catch (e) { return null; } }
    // ---- live transfer ----
    var peer = null;
    function stop() { if (peer) { try { peer.destroy(); } catch (e) { } peer = null; } }
    function ready() { return new Promise(function (res) { if (typeof window.Peer === 'function') return res(true); var t0 = Date.now(), iv = setInterval(function () { if (typeof window.Peer === 'function') { clearInterval(iv); res(true); } else if (Date.now() - t0 > 8000) { clearInterval(iv); res(false); } }, 150); }); }
    function send(code, el) {
      stop();
      ready().then(function (ok) {
        if (!ok) { el.innerHTML = '⚠️ เชื่อมต่ออินเทอร์เน็ตไม่ได้ — ใช้ “รหัสเซฟสำรอง” แทน'; return; }
        peer = new Peer('rfs-save-' + code, { debug: 0 });
        peer.on('open', function () { el.innerHTML = '✅ พร้อมส่งแล้ว! บนเครื่องที่จะเล่น กด <b>📥 รับเซฟ</b> แล้วใส่รหัส <b style="font-size:26px;color:#ff5d8f;letter-spacing:4px">' + code + '</b><br><span class="muted">เปิดหน้านี้ค้างไว้จนกว่าอีกเครื่องรับเสร็จ (10 นาที)</span>'; });
        peer.on('connection', function (c) {
          c.on('open', function () { c.send(JSON.stringify(collect())); el.innerHTML = '📤 กำลังส่งเซฟ...'; });
          c.on('data', function (d) { if (d === 'got') { el.innerHTML = '🎉 ส่งเซฟสำเร็จ! อีกเครื่องได้เซฟแล้ว'; sfx('win'); setTimeout(stop, 1500); } });
        });
        peer.on('error', function (e) { el.innerHTML = e && e.type === 'unavailable-id' ? '⚠️ รหัสนี้มีคนใช้อยู่ — เปลี่ยนรหัสใหม่' : '⚠️ เชื่อมต่อไม่ได้ (' + (e && e.type || 'network') + ') — ลองใหม่ หรือใช้รหัสเซฟสำรอง'; });
        setTimeout(function () { if (peer && peer.id === 'rfs-save-' + code) { stop(); el.innerHTML = '⌛ หมดเวลา 10 นาที — กดส่งใหม่ได้'; } }, 600000);
      });
    }
    function receive(code, el) {
      stop();
      ready().then(function (ok) {
        if (!ok) { el.innerHTML = '⚠️ เชื่อมต่ออินเทอร์เน็ตไม่ได้'; return; }
        el.innerHTML = '🔍 กำลังหาเครื่องที่ส่งรหัส ' + code + '...';
        peer = new Peer({ debug: 0 }); var got = false;
        peer.on('open', function () {
          var c = peer.connect('rfs-save-' + code, { reliable: true });
          c.on('data', function (d) { if (got) return; got = true; var pkg = null; try { pkg = JSON.parse(d); } catch (e) { } try { c.send('got'); } catch (e) { } el.innerHTML = '📥 ได้รับเซฟแล้ว!'; setTimeout(function () { stop(); apply(pkg); }, 500); });
        });
        peer.on('error', function (e) { el.innerHTML = e && e.type === 'peer-unavailable' ? '⚠️ ไม่พบรหัส ' + code + ' — ให้อีกเครื่องกด “📤 ส่งเซฟ” ค้างไว้ก่อน แล้วตรวจรหัสอีกครั้ง' : '⚠️ เชื่อมต่อไม่ได้ (' + (e && e.type || 'network') + ')'; });
        setTimeout(function () { if (!got && peer) { stop(); if (/กำลังหา/.test(el.innerHTML)) el.innerHTML = '⌛ ไม่พบเครื่องที่ส่ง — ตรวจรหัส แล้วลองใหม่'; } }, 20000);
      });
    }
    // ---- cloud save: running-number codes from the server (never collide) ----
    var API = 'api/save';
    function errText(e) { return e === 'nodb' ? 'ยังไม่ได้เชื่อมฐานข้อมูลบน Vercel (ดูวิธีตั้งค่า)' : e === 'notfound' ? 'ไม่พบเลขเซฟนี้ — ตรวจเลขอีกครั้ง' : e === 'big' ? 'เซฟใหญ่เกินไป' : e === 'offline' ? 'ต่อเซิร์ฟเวอร์เซฟไม่ได้ — ระบบเซฟคลาวด์ใช้ได้บนเว็บที่อัปขึ้น Vercel (ใช้รหัสเซฟสำรองแทนได้)' : 'เกิดข้อผิดพลาด (' + e + ')'; }
    function cloudSave() {
      return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: toCode(collect()) }) })
        .then(function (r) { return r.json().catch(function () { return { error: 'offline' }; }); }, function () { return { error: 'offline' }; })
        .then(function (j) { if (j && j.code) { var h = []; try { h = JSON.parse(localStorage.getItem('rfs_cloud') || '[]'); } catch (e) { } h.unshift({ code: j.code, t: Date.now() }); try { localStorage.setItem('rfs_cloud', JSON.stringify(h.slice(0, 5))); } catch (e) { } } return j; });
    }
    function cloudLoad(code) {
      return fetch(API + '?code=' + encodeURIComponent(code), { cache: 'no-store' })
        .then(function (r) { return r.json().catch(function () { return { error: 'offline' }; }); }, function () { return { error: 'offline' }; });
    }
    function open() {
      var mine = collect(), hist = []; try { hist = JSON.parse(localStorage.getItem('rfs_cloud') || '[]'); } catch (e) { }
      modal({ title: '☁️ เซฟคลาวด์ — ย้ายเซฟข้ามเครื่อง', width: 820, body:
        '<div class="sync"><div class="muted" style="font-weight:700;text-align:center;margin-bottom:8px">เซฟในเครื่องนี้: ' + summary(mine) + '</div>' +
        '<div class="row" style="gap:12px;align-items:stretch">' +
        '<div class="panel grow" style="padding:12px"><b style="font-size:18px">📤 เซฟขึ้นคลาวด์ (ก่อนเลิกเล่น)</b><div class="muted" style="font-size:13px;font-weight:700">ระบบจะออกเลขเซฟใหม่ให้ทุกครั้ง ไม่ซ้ำกับใคร</div>' +
        '<button class="pink" id="cSave" style="margin-top:10px;font-size:20px;width:100%">☁️ เซฟตอนนี้</button><div id="cMsg1" class="symsg">' + (hist.length ? 'เลขเซฟล่าสุดของเครื่องนี้: <b style="font-size:20px;color:#ff5d8f">' + hist[0].code + '</b> <span class="muted">(' + new Date(hist[0].t).toLocaleString('th-TH') + ')</span>' : '') + '</div></div>' +
        '<div class="panel grow" style="padding:12px"><b style="font-size:18px">📥 ดึงเซฟ (อีกเครื่อง)</b><div class="muted" style="font-size:13px;font-weight:700">กรอกเลขเซฟ 6 หลักที่ได้จากเครื่องที่เล่นล่าสุด</div>' +
        '<div class="row" style="gap:6px;margin-top:10px"><input id="cCode" class="pin" style="width:150px" maxlength="8" inputmode="numeric" placeholder="______"><button class="green" id="cLoad">📥 ดึงเซฟ</button></div><div id="cMsg2" class="symsg"></div></div></div>' +
        '<div class="muted" style="font-size:12px;font-weight:700;margin-top:8px">💡 เครื่องไม่ต้องเปิดพร้อมกัน • เลขเซฟไม่ถูกลบและไม่ถูกใช้ซ้ำ • ทุกครั้งที่เซฟจะได้เลขใหม่ ให้ใช้ “เลขล่าสุด” เสมอ</div>' +
        '<details style="margin-top:8px"><summary style="font-weight:900;cursor:pointer">🔑 รหัสเซฟสำรอง (ใช้ได้แม้ไม่มีเน็ต/คลาวด์ — คัดลอกส่งทาง LINE)</summary>' +
        '<div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap"><button class="small" id="syCopy">📋 คัดลอกรหัสเซฟของเครื่องนี้</button><button class="small" id="syFile">💾 ดาวน์โหลดเป็นไฟล์</button><label class="small btnlike">📂 โหลดจากไฟล์<input type="file" id="syIn" accept=".txt" hidden></label></div>' +
        '<textarea id="syTxt" placeholder="วางรหัสเซฟที่ขึ้นต้นด้วย RFS1: ตรงนี้" style="width:100%;height:70px;margin-top:6px;border-radius:12px;border:3px solid #e0a96d;padding:6px;font-size:11px"></textarea><button class="green small" id="syPaste">📥 โหลดจากรหัสที่วาง</button></details></div>',
        buttons: [{ t: 'ปิด', v: 0 }],
        mount: function (box) {
          var m1 = box.querySelector('#cMsg1'), m2 = box.querySelector('#cMsg2'), busy = false;
          box.querySelector('#cSave').onclick = function () {
            if (busy) return; busy = true; m1.innerHTML = '⏳ กำลังเซฟขึ้นคลาวด์...';
            cloudSave().then(function (j) { busy = false;
              if (!j.code) { m1.innerHTML = '⚠️ ' + errText(j.error); return; }
              sfx('win'); m1.innerHTML = '✅ เซฟแล้ว! เลขเซฟของคุณ<div class="ccode">' + j.code + '</div><button class="small" id="cCopyNo">📋 คัดลอกเลข</button> <span class="muted">จดเลขนี้ไว้ แล้วไปกรอกในอีกเครื่อง</span>';
              var cp = box.querySelector('#cCopyNo'); cp.onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(j.code); toast('📋 คัดลอกเลข ' + j.code + ' แล้ว'); };
            });
          };
          box.querySelector('#cLoad').onclick = function () {
            var c = (box.querySelector('#cCode').value || '').replace(/\D/g, ''); if (c.length < 6) { toast('กรอกเลขเซฟ 6 หลัก'); return; }
            if (busy) return; busy = true; m2.innerHTML = '⏳ กำลังดึงเซฟ ' + c + '...';
            cloudLoad(c).then(function (j) { busy = false;
              if (!j.data) { m2.innerHTML = '⚠️ ' + errText(j.error); return; }
              var pkg = fromCode(j.data); if (!pkg) { m2.innerHTML = '⚠️ ข้อมูลเซฟเสียหาย'; return; }
              m2.innerHTML = '📥 ได้เซฟแล้ว!'; apply(pkg);
            });
          };
          box.querySelector('#syCopy').onclick = function () { var code = toCode(collect()), ta = box.querySelector('#syTxt'); ta.value = code; ta.select(); var done = function () { toast('📋 คัดลอกรหัสเซฟแล้ว — ส่งให้ตัวเองแล้ววางในเครื่องใหม่', 3000); }; if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, function () { try { document.execCommand('copy'); } catch (e) { } done(); }); else { try { document.execCommand('copy'); } catch (e) { } done(); } };
          box.querySelector('#syFile').onclick = function () { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toCode(collect())], { type: 'text/plain' })); a.download = 'rilakkuma-save-' + new Date().toISOString().slice(0, 10) + '.txt'; document.body.appendChild(a); a.click(); a.remove(); };
          box.querySelector('#syIn').onchange = function (ev) { var f = ev.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { var pkg = fromCode(r.result); if (!pkg) { toast('⚠️ ไฟล์เซฟไม่ถูกต้อง', 3000); return; } apply(pkg); }; r.readAsText(f); };
          box.querySelector('#syPaste').onclick = function () { var pkg = fromCode(box.querySelector('#syTxt').value); if (!pkg) { toast('⚠️ รหัสเซฟไม่ถูกต้อง (ต้องขึ้นต้นด้วย RFS1:)', 3000); return; } apply(pkg); };
        } });
    }
    return { open: open, collect: collect, toCode: toCode, fromCode: fromCode, apply: apply };
  })();
  U.Sync = Sync;
  function hubModal() {
    var it = function (k, n, t) { return '<div class="hubit" data-hb="' + k + '">' + spr(['ui', n], 150, 120) + '</div>'; };
    modal({ title: 'เมนู', width: 720, body: '<div class="hub">' + it('settings', 'settings') + it('lessons', 'guide') + it('music', 'music') + it('load', 'load') + it('inv', 'assets') + it('prof', 'chars') + it('achv', 'achv') + it('rank', 'rank') + '</div><button class="pink" id="hbSync" style="width:100%;margin-top:10px;font-size:20px">☁️ ย้ายเซฟ / ดึงเซฟจากเครื่องอื่น</button>',
      mount: function (box, close) { box.querySelector('#hbSync').onclick = function () { close('sync'); }; box.querySelectorAll('[data-hb]').forEach(function (e) { e.onclick = function () { close(e.dataset.hb); }; }); } })
      .then(function (v) { ({ sync: Sync.open, settings: settingsModal, lessons: lessonsModal, guide: guideModal, music: function () { if (!Music.playing) { U.music = true; saveSettings(); Music.start('menu'); } else Music.next(); toast('🎵 ' + (Music.song ? esc(Music.song.title) : '')); }, load: loadModal, inv: function () { openInventory('🎽 ติดตั้ง'); }, prof: openProfile, achv: achievements, rank: rankingModal }[v] || function () { })(); });
  }
  function backBtns() { document.querySelectorAll('.backbtn').forEach(function (b) { if (!b.innerHTML) b.innerHTML = spr(['ui', 'prev'], 70, 70); }); }
  backBtns();
  document.querySelectorAll('[data-back]').forEach(function (b) { b.onclick = function () { if (U.tourPending && b.closest('#loadout')) { U.tourPending = false; if (U.selBak) { U.sel.map = U.selBak.map; U.sel.slots = U.selBak.slots; U.selBak = null; } Tour.hub(); return; } show(b.dataset.back || 'menu'); }; });

  function dailyLogin() {
    var ls = Meta.loginState();
    var cells = DAILY_REWARDS.map(function (r, i) {
      var got = ls.canClaim ? i < ls.day : i <= ls.day, today = ls.canClaim && i === ls.day;
      var icon = r.item && !r.gold ? spr(Meta.item(r.item).spr, 56, 56) : r.diamond && !r.gold ? spr(['items', 27], 60, 56) : spr(['ui', 'i_money'], 60, 56);
      var txt = [r.gold ? fmt(r.gold) + ' G' : '', r.diamond ? r.diamond + ' 💎' : '', r.item ? (Meta.item(r.item).name + (r.n ? ' x' + r.n : '')) : ''].filter(Boolean).join(' + ');
      return '<div style="width:122px;height:150px;border:4px solid ' + (today ? '#ff5d8f' : '#6b4226') + ';border-radius:16px;background:' + (got ? '#e8ffe0' : today ? '#fff3a8' : '#fff') + ';display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:6px;font-weight:900;font-size:13px;text-align:center"><div>วันที่ ' + (i + 1) + '</div>' + icon + '<div>' + txt + (got ? ' ✅' : '') + '</div></div>';
    }).join('');
    var hist = Meta.p.login.claimed.slice(0, 5).map(function (c) { return '<div>' + c.d + ' — วันที่ ' + c.day + '</div>'; }).join('') || '<div class="muted">ยังไม่มีประวัติ</div>';
    modal({ title: '📅 ล็อกอินรายวัน (7 วัน)', width: 960, body: '<div class="row" style="gap:8px;justify-content:center">' + cells + '</div><div style="margin-top:10px;font-size:14px"><b>ประวัติการรับ:</b>' + hist + '</div>', buttons: [{ t: ls.canClaim ? '🎁 รับรางวัลวันนี้' : 'รับแล้ววันนี้ — กลับมาพรุ่งนี้', v: 'claim', cls: 'pink', dis: !ls.canClaim }] })
      .then(function (v) { if (v === 'claim') { var r = Meta.claimLogin(); if (r) { sfx('coin'); toast('🎁 รับรางวัลล็อกอินแล้ว!'); renderMenu(); } } });
  }
  function rankingModal() {
    var P = Meta.p, list = JSON.parse(localStorage.getItem('rfs_results') || '[]');
    var rows = list.slice(0, 10).map(function (r, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.map) + '</td><td>' + r.rank + '</td><td>' + fmt(r.nw) + ' G</td><td>' + r.date + '</td></tr>'; }).join('');
    modal({ title: '👑 อันดับและสถิติ', width: 760, body: '<div class="row" style="justify-content:center;gap:12px"><span class="chip">เล่น ' + P.stats.games + ' เกม</span><span class="chip">ชนะ ' + P.stats.wins + '</span><span class="chip">ทรัพย์สินสูงสุด ' + fmt(P.stats.best) + ' G</span></div><table style="width:100%;margin-top:12px;font-weight:700;border-collapse:collapse"><tr style="background:#ffe2a8"><th>#</th><th>แผนที่</th><th>อันดับ</th><th>ทรัพย์สิน</th><th>วันที่</th></tr>' + (rows || '<tr><td colspan=5 style="text-align:center">ยังไม่มีผลการแข่งขัน</td></tr>') + '</table>', buttons: [{ t: 'ปิด', v: 1 }] });
  }
  function achievements() {
    var P = Meta.p, A = [['ชนะครั้งแรก', P.stats.wins >= 1], ['เล่นครบ 5 เกม', P.stats.games >= 5], ['เศรษฐีหมื่นห้า (NW 15,000+)', P.stats.best >= 15000], ['เจ้าสัว (NW 30,000+)', P.stats.best >= 30000], ['นักสะสม (อุปกรณ์/การ์ด 10 ชิ้น)', Object.keys(P.inv || {}).filter(function (k) { return P.inv[k] > 0; }).length >= 10], ['เพื่อนครบแก๊ง (ตัวละคร 8 ตัว)', Object.keys(P.chars).length >= 8]];
    modal({ title: '🏆 ความสำเร็จ', body: '<div class="col" style="min-width:460px">' + A.map(function (a) { return '<div class="opt">' + (a[1] ? '🏅' : '🔒') + ' ' + a[0] + '</div>'; }).join('') + '</div>', buttons: [{ t: 'ปิด', v: 1 }] });
  }
  function newsModal() {
    modal({ title: 'ข่าวสาร & คู่มือ', width: 700, body: '<div class="col"><div class="opt">' + spr(['ui', 'i_event'], 50, 50) + '<span>อัปเดต v0.4: หน้าตาใหม่น่ารักขึ้น แผนที่ใหญ่ขึ้น ปุ่มจากชุดภาพของเกม และเพลงคาวาอิแต่งใหม่ทุกเพลง</span></div><div class="opt">' + spr(['ui', 'i_card'], 50, 50) + '<span>เปิดการ์ดให้สีของคุณเรียงเป็นแถว 3 ช่องขึ้นไป รับโบนัสสูงสุด 5,000 G!</span></div><div class="opt">' + spr(['ui', 'i_district'], 50, 50) + '<span>ซื้อร้านในเขตเดียวกันหลายร้าน = ค่าเช่าและเพดานการลงทุนสูงขึ้น</span></div></div>', buttons: [{ t: '🎓 โหมดสอนเล่น', v: 't', cls: 'pink' }, { t: '📖 คู่มือ', v: 'g', cls: 'purple' }, { t: 'ปิด', v: 0 }] }).then(function (v) { if (v === 'g') guideModal(); if (v === 't') lessonsModal(); });
  }
  function mailModal() { modal({ title: '✉️ จดหมาย & ข่าวสาร', body: '<div class="col" style="max-width:640px">' + Meta.p.mail.map(function (m) { return '<div class="opt">📩 ' + esc(m.m) + '</div>'; }).join('') + '<div class="opt">📢 Version 0.1 — 4 แผนที่, 5 เขตธุรกิจต่อแผนที่, การ์ด 100 ใบ, หุ้น/ปันผล/ภาษี, AI 3 ระดับ, ร้านค้า & Loadout</div></div>', buttons: [{ t: 'ปิด', v: 1 }] }); }
  function settingsModal() {
    var body = document.createElement('div'); body.className = 'col'; body.style.minWidth = '460px';
    function draw() {
      body.innerHTML = '<b>ความเร็วเกม (AI / การเดิน / ลูกเต๋า)</b><div class="seg">' + SPEEDS.map(function (x) { return '<div data-sp="' + x[0] + '" class="' + (U.speed === x[0] ? 'on' : '') + '">' + x[1] + '</div>'; }).join('') + '</div>' +
        '<b>🎵 เพลงประกอบ (แต่งใหม่อัตโนมัติทุกเพลง)</b><div class="seg"><div data-mu="1" class="' + (U.music ? 'on' : '') + '">เปิด</div><div data-mu="0" class="' + (!U.music ? 'on' : '') + '">ปิด</div></div><div class="row"><span>ระดับเสียง</span><input id="volIn" type="range" min="0" max="1" step="0.05" value="' + U.vol + '" class="grow"><button class="small pink" id="nextSong">🎲 เพลงใหม่</button></div><div class="muted" style="font-size:13px">กำลังเล่น: ' + (Music.song ? esc(Music.song.title) + ' • ' + Music.song.bpm + ' BPM' : '-') + '</div>' +
        '<b>เสียงตอบสนอง</b><div class="seg"><div data-snd="1" class="' + (U.sound ? 'on' : '') + '">เปิด</div><div data-snd="0" class="' + (!U.sound ? 'on' : '') + '">ปิด</div></div>' +
        '<b>ชื่อผู้เล่น</b><div class="row"><input id="nmIn" value="' + esc(Meta.p.name) + '" maxlength="14" style="font-size:18px;padding:8px;border:3px solid #6b4226;border-radius:12px;flex:1;font-family:inherit"><button class="small green" id="nmSave">บันทึก</button></div>' +
        '<button class="small gray" id="rstProf">รีเซ็ตโปรไฟล์ (ลบไอเทมและเงินทั้งหมด)</button>';
      body.querySelectorAll('[data-sp]').forEach(function (e) { e.onclick = function () { U.speed = +e.dataset.sp; saveSettings(); draw(); }; });
      body.querySelectorAll('[data-mu]').forEach(function (e) { e.onclick = function () { U.music = e.dataset.mu === '1'; saveSettings(); if (U.music) Music.start(); else Music.stop(); draw(); }; });
      body.querySelector('#volIn').oninput = function () { U.vol = +this.value; Music.setVol(U.vol); saveSettings(); };
      body.querySelector('#nextSong').onclick = function () { if (!Music.playing) { U.music = true; saveSettings(); Music.start(); } Music.next(); setTimeout(draw, 50); };
      body.querySelectorAll('[data-snd]').forEach(function (e) { e.onclick = function () { U.sound = e.dataset.snd === '1'; saveSettings(); draw(); }; });
      body.querySelector('#nmSave').onclick = function () { Meta.p.name = body.querySelector('#nmIn').value.trim() || 'ผู้เล่น'; Meta.save(); toast('บันทึกชื่อแล้ว'); };
      body.querySelector('#rstProf').onclick = function () { var b = body.querySelector('#rstProf'); if (b.dataset.sure) { Meta.reset(); toast('รีเซ็ตแล้ว'); renderMenu(); b.textContent = 'รีเซ็ตแล้ว'; b.disabled = true; } else { b.dataset.sure = 1; b.textContent = '⚠️ แตะอีกครั้งเพื่อยืนยันการรีเซ็ต'; } };
    }
    draw();
    return modal({ title: '⚙️ ตั้งค่า', body: body, buttons: [{ t: 'ปิด', v: 1 }] });
  }
  function guideModal() {
    var C = CONFIG;
    var html = '<div style="max-width:900px;font-size:15px;font-weight:600;line-height:1.6">' +
      '<b>🎯 เป้าหมาย:</b> ทรัพย์สินรวม (เงินสด + มูลค่าร้าน + หุ้น) ถึงเป้าหมาย แล้ว <b>กลับเข้าธนาคาร</b> = ชนะ (ตั้งเป้าเองได้ในหน้าเลือกแผนที่)<br>' +
      '<b>🎲 ทอยลูกเต๋า:</b> ถึงตาเราให้แตะที่ตัวละครของเราบนแผนที่ (หรือรูปตัวเราที่แถบล่าง) • ลูกเต๋าหมุนอยู่ตลอด แตะเพื่อหยุดเอง • ตอนเดินจะมีตัวเลขก้าวที่เหลือบนหัว มี 📍 บอกจุดที่อาจตก กด <b>↩ ย้อน</b> เพื่อเดินถอยกลับได้ก่อนกด “หยุดตรงนี้”<br>' +
      '<b>🏠 หัวใจของเกม = สร้างร้านแพง ๆ ให้คนอื่นมาตก!</b><br>' +
      '• ซื้อร้านว่าง → ร้านเปลี่ยนเป็นกรอบสีของคุณ<br>' +
      '• <b>ตกที่ร้านตัวเอง = ลงทุน</b> เลือกอัปเกรดร้านของคุณในเขตเดียวกันได้ <b>1 หลัง ขึ้นได้ 1 ระดับ</b> ต่อครั้ง ร้านจะค่อย ๆ ขยายจากบ้านเล็กเป็นโรงแรมหรู<br>• <b>ซื้อหุ้นได้ 1 ครั้งต่อเทิร์น</b> (เลือก 1 เขต) • ถ้าเงินสดไม่พอจ่าย <b>เลือกขายหุ้น/ร้านเองได้</b><br>' +
      '• ถือหลายร้านในเขตเดียวกัน มูลค่าทุกร้าน ×(1 + 0.25 ต่อร้านที่เพิ่ม) และ <b>ผูกขาดทั้งเขต ×1.5</b> ทุนสูงสุดก็เพิ่มตาม<br>' +
      '• ค่าเช่า = มูลค่าร้าน × อัตราผลตอบแทน (13%→20% ยิ่งร้านแพงยิ่งสูง) — คนที่ตกต้องจ่ายเต็ม ๆ!<br>' +
      '• <b>🔗 ร้านติดกันบนถนน</b> ของเจ้าของเดียวกันเชื่อมเป็นแถว ค่าเช่า +20% ต่อร้าน (สูงสุด ×1.8) และอาคารขยายขึ้นทั้งแถว<br>' +
      '• ซื้อกิจการคู่แข่งได้ที่ 5 เท่าของมูลค่า หลังจ่ายค่าเช่า<br>' +
      '<b>📈 หุ้น:</b> ราคาหุ้น = มูลค่ารวมของเขต ÷ (23.275 × จำนวนร้าน) — ลงทุนร้านแล้วหุ้นขึ้น! ซื้อครั้งละไม่เกิน 99 หุ้นที่ธนาคาร/Stock Broker ซื้อ 10 หุ้นขึ้นไปราคาหุ้นขยับขึ้น<br>' +
      '<b>💹 ปันผล:</b> ทุกครั้งที่มีคนจ่ายค่าเช่าในเขต ธนาคารจ่ายปันผล 20% ของค่าเช่าให้ผู้ถือหุ้นเขตนั้นตามสัดส่วน (รวมเจ้าของร้านเองด้วย ถ้าถือหุ้น)<br>' +
      '<b>🃏 เงินเดือน:</b> เก็บ ♥ ♦ ♣ ♠ ครบ แล้วผ่าน/หยุดธนาคาร → เลื่อนระดับ + เงินเดือน = ' + fmt(C.baseSalary) + ' + ' + fmt(C.salaryPerLevel) + '×Lv + 10% ของมูลค่าร้าน<br>' +
      '<b>⚖️ กติกาเลือกได้:</b> ภาษี เปิด/ปิด (ปิด = แบบเกมจริง) • มีคนล้มละลาย = จบเกม<br>' +
      '<b>🏰 บ้านพิเศษ (ช่อง ? สีม่วง):</b> ตกแล้วสร้างได้ 1 ใน 4 — 🌀 ประตูทะลุมิติ (คนตกเลือกวาร์ป จ่าย 10% ทรัพย์สิน / ไม่วาร์ป 5% • เจ้าของวาร์ปฟรี) • 🎉 บ้านปาร์ตี้ (เรียกทุกคนมารวม จ่ายคนละ 100 • เจ้าของตกเองก็เรียกปาร์ตี้ได้) • 🚧 ประตูเก็บค่าผ่านทาง (ผ่านต้องจ่าย เพิ่ม +10 G ทุกครั้ง) • 🌬️ บ้านกังหันลม (สกิลการ์ด 2 ใบ + สัญลักษณ์ ♥♦♣♠ 1 ใบ + การ์ดพิเศษที่พกมา 1 ใบ ปลิวหาย • เจ้าของตกเอง ขโมยเงิน 5% จากทุกคน)<br>' +
      '<b>🃏 การ์ด:</b> หยุดตรงช่องสัญลักษณ์พอดีเพื่อเปิดการ์ด<br>' +
      '<b>🌈 พิเศษ:</b> เปิดการ์ดให้สีตัวเองเรียงแถว 3+ ช่องรับโบนัส • ไอเทม/การ์ดพิเศษติดตัวใช้ได้อย่างละครั้ง</div>';
    return modal({ title: '📖 คู่มือการเล่น', width: 980, body: html, buttons: [{ t: 'เข้าใจแล้ว!', v: 1, cls: 'green' }] });
  }

  // =====================================================================
  // SETUP
  // =====================================================================
  var LENGTHS = [{ n: 'Quick', t: 25000, d: '~25 รอบ' }, { n: 'Standard', t: 40000, d: '~40 รอบ' }, { n: 'Long', t: 60000, d: '~50 รอบ' }, { n: 'Marathon', t: 100000, d: '~70 รอบ' }];
  U.rules = { target: 40000, rounds: 100, tax: false, endOnBankrupt: true, cash: 10000 };
  // give every player a different colour: preferred palette index first, then the next free colours
  function assignColors(prefs) { var used = {}, out = []; prefs.forEach(function (pi, i) { var k = (pi >= 0 && !used[pi]) ? pi : -1; if (k < 0) for (var j = 0; j < TEAM_PAL.length; j++) { var c = [0, 1, 5, 3, 2, 4, 6][j]; if (!used[c]) { k = c; break; } } used[k] = 1; out.push(TEAM_PAL[k].c); }); return out; }
  U.assignColors = assignColors;
  try { var rs = JSON.parse(localStorage.getItem('rfs_rules') || 'null'); if (rs) Object.assign(U.rules, rs); } catch (e) { }
  function saveRules() { try { localStorage.setItem('rfs_rules', JSON.stringify(U.rules)); } catch (e) { } }
  function openSetup(vsAI) {
    var P = Meta.p;
    if (!U.sel.slots || vsAI) U.sel.slots = [{ type: 'human', name: P.name, char: P.equip.char }, { type: 'ai', lv: 1 }, { type: 'ai', lv: 1 }, { type: 'ai', lv: 1 }];
    U.sel.slots[0].char = P.equip.char; U.sel.slots[0].name = P.name;
    renderSetup(); show('setup');
  }
  function renderSetup() {
    var sel = U.sel;
    $('#mapCards').innerHTML = MAPS.map(function (m, i) {
      if (m.bkk) return '';
      return '<div class="mapcard ' + (sel.map === i ? 'sel' : '') + '" data-map="' + i + '"><div class="thumb" style="background-image:url(assets/' + m.bg + '.webp)"><div class="mzoom" data-mz="' + i + '">🔍</div></div><div class="nm">' + m.th + ' <span class="muted" style="font-size:14px">' + m.name + '</span></div><div class="row" style="gap:4px;padding:0 12px 10px">' + m.districts.map(function (d) { return '<span title="' + esc(d.th) + '" style="width:22px;height:14px;border-radius:5px;background:' + d.color + ';border:2px solid #6b4226"></span>'; }).join('') + '<span style="font-size:12px;font-weight:800;margin-left:4px">' + (function () { var b = Game.buildBoard(i); return 'แผนที่' + m.size + ' • ' + b.tiles.length + ' ช่อง • ' + b.districts.length + ' เขต • ' + b.tiles.filter(function (t) { return t.type === 'shop'; }).length + ' ร้าน'; })() + '</span></div></div>';
    }).join('');
    document.querySelectorAll('[data-map]').forEach(function (e) { e.onclick = function (ev) { if (ev.target.closest('[data-mz]')) { ev.stopPropagation(); mapViewer(+e.dataset.map, function () { sel.map = +e.dataset.map; renderSetup(); }); return; } sel.map = +e.dataset.map; renderSetup(); }; });
    var used = sel.slots.map(function (s) { return s.char; });
    $('#slots').innerHTML = sel.slots.map(function (s, i) {
      var types = i === 0 ? [['human', 'คุณ (P1)']] : [['human', 'ผู้เล่น'], ['ai', 'AI'], ['off', 'ปิด']];
      var charSp = s.type === 'off' ? '<div style="height:90px;display:flex;align-items:center;font-size:40px">—</div>' : s.char ? spr(Meta.charSprite(s.char), 90, 90) : '<div style="height:90px;display:flex;align-items:center;font-weight:900">🎲 สุ่มตัวละคร</div>';
      return '<div class="slot" style="border-color:' + PLAYER_COLORS[i] + ';border-width:5px"><div class="row"><b style="color:' + PLAYER_COLORS[i] + ';font-size:20px">P' + (i + 1) + '</b><div class="seg grow">' + types.map(function (t) { return '<div data-ty="' + i + ':' + t[0] + '" class="' + (s.type === t[0] ? 'on' : '') + '">' + t[1] + '</div>'; }).join('') + '</div></div>' +
        '<div class="row" style="justify-content:center;cursor:pointer;margin:6px 0" data-ch="' + i + '">' + charSp + '</div>' +
        (s.type === 'ai' ? '<div class="seg">' + AI_LEVELS.map(function (l, k) { return '<div data-lv="' + i + ':' + k + '" class="' + (s.lv === k ? 'on' : '') + '">' + l.name + '</div>'; }).join('') + '</div>' : s.type === 'human' ? '<div style="text-align:center;font-weight:800">' + (i === 0 ? esc(Meta.p.name) + ' • ใช้ Loadout ของคุณ' : 'เล่นบนเครื่องเดียวกัน (Hot-seat)') + '</div>' : '<div style="text-align:center" class="muted">ไม่มีผู้เล่น</div>') + '</div>';
    }).join('');
    document.querySelectorAll('[data-ty]').forEach(function (e) { e.onclick = function () { var a = e.dataset.ty.split(':'); var s = sel.slots[+a[0]]; s.type = a[1]; if (s.type === 'ai' && s.lv === undefined) s.lv = 1; if (s.type === 'off') s.char = null; renderSetup(); }; });
    document.querySelectorAll('[data-lv]').forEach(function (e) { e.onclick = function () { var a = e.dataset.lv.split(':'); sel.slots[+a[0]].lv = +a[1]; renderSetup(); }; });
    document.querySelectorAll('[data-ch]').forEach(function (e) { e.onclick = function () { var i = +e.dataset.ch; if (sel.slots[i].type === 'off' || i === 0) { if (i === 0) toast('เลือกตัวละครของคุณในหน้าถัดไป (Pre-Match Setup)'); return; } pickCharModal(i); }; });
    renderRules();
  }
  function renderRules() {
    var R = U.rules, box = $('#rulesBox');
    box.innerHTML = '<div class="row" style="align-items:center;gap:14px"><b style="font-size:18px">🎯 เป้าหมายทรัพย์สิน</b>' +
      '<button class="small rbtn" data-tg="-5000">−5,000</button><button class="small rbtn" data-tg="-1000">−1,000</button>' +
      '<input class="tgt" id="tgtIn" inputmode="numeric" value="' + fmt(R.target) + '">' +
      '<button class="small rbtn" data-tg="1000">+1,000</button><button class="small rbtn" data-tg="5000">+5,000</button>' +
      '<span class="muted" style="font-size:13px;font-weight:700">(ตั้งได้ 15,000–999,000)</span></div>' +
      '<div class="row" style="margin-top:8px;align-items:center"><b>ปุ่มลัด:</b>' + LENGTHS.map(function (l) { return '<button class="small rbtn ' + (R.target === l.t ? 'on' : '') + '" data-tp="' + l.t + '">' + l.n + ' ' + fmt(l.t) + ' <span style="font-size:11px">' + l.d + '</span></button>'; }).join('') + '</div>' +
      '<div class="row" style="margin-top:10px;align-items:center;gap:12px"><b>กติกา:</b>' +
      '<div class="tog ' + (R.tax ? 'on' : '') + '" data-rule="tax"><i></i>มีภาษี (ช่องภาษี/ภาษีทรัพย์สิน/ค่าธรรมเนียมหุ้น)</div>' +
      '<div class="tog ' + (R.endOnBankrupt ? 'on' : '') + '" data-rule="endOnBankrupt"><i></i>มีคนล้มละลาย = จบเกม (แบบเกมจริง)</div>' +
      '</div>' +
      '<div class="row" style="margin-top:8px;align-items:center;gap:6px;flex-wrap:wrap"><b>จำนวนรอบ:</b>' + [30, 50, 100, 150, 200, 0].map(function (n) { return '<button class="small rbtn ' + (R.rounds === n ? 'on' : '') + '" data-rd="' + n + '">' + (n || '♾️ ไม่จำกัด') + '</button>'; }).join('') + '<input id="rdIn" type="number" value="' + (R.rounds || 0) + '" style="width:74px;font-size:16px;padding:4px 6px;border:2px solid #6b4226;border-radius:10px;font-family:inherit"> รอบ</div>' +
      '<div class="row" style="margin-top:8px;align-items:center;gap:6px;flex-wrap:wrap"><b>เงินเริ่มต้น:</b>' + [5000, 10000, 15000, 20000, 30000].map(function (n) { return '<button class="small rbtn ' + ((R.cash || 10000) === n ? 'on' : '') + '" data-cs="' + n + '">' + fmt(n) + '</button>'; }).join('') + '<input id="csIn" type="number" value="' + (R.cash || 10000) + '" style="width:96px;font-size:16px;padding:4px 6px;border:2px solid #6b4226;border-radius:10px;font-family:inherit"> G</div>' +
      '<div class="row" style="margin-top:8px;align-items:center;gap:4px;flex-wrap:wrap"><b>สีของคุณ:</b>' + colorDots(Meta.p.color || 0, 'pc') + '</div>';
    var clampT = function (v) { return Math.max(15000, Math.min(999000, Math.round(v / 1000) * 1000)); };
    box.querySelectorAll('[data-tg]').forEach(function (b) { b.onclick = function () { R.target = clampT(R.target + +b.dataset.tg); saveRules(); renderRules(); }; });
    box.querySelectorAll('[data-tp]').forEach(function (b) { b.onclick = function () { R.target = +b.dataset.tp; saveRules(); renderRules(); }; });
    box.querySelectorAll('[data-rd]').forEach(function (b) { b.onclick = function () { R.rounds = +b.dataset.rd; saveRules(); renderRules(); }; });
    box.querySelectorAll('[data-cs]').forEach(function (b) { b.onclick = function () { R.cash = +b.dataset.cs; saveRules(); renderRules(); }; });
    box.querySelectorAll('[data-pc]').forEach(function (b) { b.onclick = function () { Meta.p.color = +b.dataset.pc; Meta.save(); renderRules(); }; });
    box.querySelector('#rdIn').onchange = function () { var v = Math.round(+this.value || 0); R.rounds = v <= 0 ? 0 : Math.max(5, Math.min(9999, v)); saveRules(); renderRules(); };
    box.querySelector('#csIn').onchange = function () { R.cash = Math.max(1000, Math.min(999999, Math.round(+this.value || 10000))); saveRules(); renderRules(); };
    box.querySelectorAll('[data-rule]').forEach(function (b) { b.onclick = function () { R[b.dataset.rule] = !R[b.dataset.rule]; saveRules(); renderRules(); }; });
    var inp = box.querySelector('#tgtIn');
    inp.onfocus = function () { inp.value = R.target; inp.select(); };
    inp.onchange = inp.onblur = function () { var v = parseInt(String(inp.value).replace(/[^0-9]/g, ''), 10); if (v) { R.target = clampT(v); saveRules(); } renderRules(); };
    inp.onkeydown = function (e) { if (e.key === 'Enter') inp.blur(); };
  }
  function colorDots(cur, attr, off) { return TEAM_PAL.map(function (c, ci) { return '<span class="tcdot' + (ci === cur ? ' on' : '') + (off === ci ? ' off' : '') + '" data-' + attr + '="' + ci + '" title="' + c.n + '" style="background:' + c.c + '"></span>'; }).join(''); }
  U.colorDots = colorDots;
  function pickCharModal(i) {
    var taken = U.sel.slots.map(function (s, k) { return k !== i ? s.char : null; });
    var keys = allCharKeys();
    modal({ title: 'เลือกตัวละคร P' + (i + 1), width: 900, body: '<div class="charpick">' + keys.map(function (k) { var dis = taken.indexOf(k) >= 0; return '<div class="charbtn ' + (dis ? 'lock' : '') + '" data-k="' + k + '">' + spr(Meta.charSprite(k, 'chars'), 80, 84) + '</div>'; }).join('') + '</div>', buttons: [{ t: '🎲 สุ่มตัวละคร', v: 'rnd', cls: 'pink' }], mount: function (box, close) { box.querySelectorAll('[data-k]').forEach(function (e) { e.onclick = function () { if (!e.classList.contains('lock')) close(e.dataset.k); }; }); } })
      .then(function (k) { if (k) { U.sel.slots[i].char = k === 'rnd' ? null : k; renderSetup(); } });
  }
  $('#toLoadout').onclick = function () {
    var n = U.sel.slots.filter(function (s) { return s.type !== 'off'; }).length;
    if (n < 2) { toast('ต้องมีผู้เล่นอย่างน้อย 2 คน (เติม AI ได้)'); return; }
    openLoadout();
  };

  // =====================================================================
  // PRE-MATCH LOADOUT (Character • Costume • Equipment x2 • Special Card x1 • Inventory • Map Preview • Ready)
  // =====================================================================
  var LO = { slot: 0 };
  function allCharKeys() { var k = []; CHARACTERS.forEach(function (c, i) { k.push('b' + i); }); EXTRA_CHARS.forEach(function (c, i) { k.push('x' + i); }); JOB_CHARS.forEach(function (c, i) { k.push('j' + i); }); GOLD_CHARS.forEach(function (c, i) { k.push('g' + i); }); EASTER_CHARS.forEach(function (c, i) { k.push('e' + i); }); STEAM_CHARS.forEach(function (c, i) { k.push('s' + i); }); ROYAL_CHARS.forEach(function (c, i) { k.push('r' + i); }); BKK_CHARS.forEach(function (c, i) { k.push('k' + i); }); return k; }
  function aiCharKeys() { return allCharKeys().filter(function (k) { return k[0] !== 'e' && k[0] !== 'r' && k[0] !== 'k'; }); }
  function skillChip(k, big) { var s = Meta.charSkill(k); if (!s) return ''; return '<div class="skillchip' + (k[0] === 'g' ? ' gold' : k[0] === 'e' ? ' easter' : k[0] === 'r' ? ' royal' : '') + (big ? ' big' : '') + '"><b>⭐ ' + esc(s.name) + '</b><span>' + esc(s.desc) + '</span>' + (s.ename ? '<b style="margin-top:3px">' + (s.etag || '🥚') + ' ' + esc(s.ename) + ' <small>(โบนัส' + (s.elabel || 'อีเวนต์อีสเตอร์') + ')</small></b><span>' + esc(s.edesc) + '</span>' : '') + '</div>'; }
  U.skillChip = skillChip;
  function openLoadout() { var e = Meta.p.equip, v = Meta.validLoadout(); e.eq = v.eq; e.sc = v.sc; renderLoadout(); show('loadout'); }
  function renderLoadout() {
    var P = Meta.p, e = P.equip, m = MAPS[U.sel.map];
    var taken = U.sel.slots.slice(1).map(function (s) { return s.char; });
    var keys = allCharKeys().sort(function (a, b) { return (P.chars[b] ? 1 : 0) - (P.chars[a] ? 1 : 0); });
    var chars = keys.map(function (k) {
      var own = P.chars[k], dis = !own || taken.indexOf(k) >= 0;
      var sk = Meta.charSkill(k);
      return '<div class="charbtn ' + (e.char === k ? 'sel ' : '') + (dis ? 'lock ' : '') + (k[0] === 'g' ? 'goldc' : '') + '" data-c="' + k + '" title="' + esc(Meta.charName(k) + (sk ? ' — ' + sk.name + ': ' + sk.desc : '')) + '" style="height:84px">' + spr(Meta.charSprite(k), 54, 72) + (!own ? '<span class="who">🔒</span>' : '') + '</div>';
    }).join('');
    var slot = function (idx, kind) {
      var id = kind === 'sc' ? e.sc : e.eq[idx], it = id && Meta.item(id);
      return '<div class="eqslot ' + (it ? 'filled' : '') + '" data-slot="' + (kind === 'sc' ? 'sc' : idx) + '" style="width:100px;min-height:120px;font-size:12px;' + (LO.slot === (kind === 'sc' ? 'sc' : idx) ? 'outline:5px solid #ff7aa8' : '') + '">' +
        (it ? spr(it.spr, 60, 52) + '<div>' + it.name + '</div><div style="font-size:10px;font-weight:700;line-height:1.2">' + it.desc + '</div>' : '<div style="font-size:30px">＋</div>' + (kind === 'sc' ? 'การ์ดพิเศษ' : 'อุปกรณ์ ' + (idx + 1))) + '</div>';
    };
    var inv = EQUIPMENT.concat(SPECIAL_CARDS).map(function (it) {
      var q = Meta.owned(it.id), isSC = /^SC_/.test(it.id), eqd = isSC ? e.sc === it.id : e.eq.indexOf(it.id) >= 0;
      return '<div class="invitem ' + (q ? '' : 'dim') + (eqd ? ' eqd' : '') + '" data-it="' + it.id + '"><span class="q">x' + q + '</span>' + spr(it.spr, 64, 58) + '<div>' + it.name + '</div><div style="font-size:10px;font-weight:700">' + (isSC ? 'การ์ดพิเศษ' : 'อุปกรณ์') + '</div></div>';
    }).join('');
    var html = '<div class="row" style="align-items:flex-start;gap:16px">' +
      '<div class="col" style="width:560px"><div class="panel" style="padding:10px"><b>1) Character Selection</b><div class="charpick" style="margin-top:6px">' + chars + '</div>' +
      '<div style="margin-top:8px"><b>2) สกิลติดตัว</b> ' + skillChip(e.char) + '</div></div>' +
      '<div class="panel" style="padding:10px"><b>6) Inventory — แตะเพื่อใส่ช่องที่เลือก</b> <span class="muted" style="font-size:13px">(ใช้ได้เมื่อมีใน Inventory • ไอเทมจะถูกหักเมื่อใช้งานจริงในเกม)</span><div class="invgrid" style="margin-top:6px;max-height:230px;overflow:auto">' + inv + '</div>' + itemInfoBox(LO.info) + '</div></div>' +
      '<div class="col" style="width:330px;align-items:center"><div class="panel" style="padding:12px;width:100%;text-align:center">' + spr(Meta.charSprite(e.char), 200, 190) + '<div style="font-weight:900;font-size:20px">' + Meta.charName(e.char) + '</div>' + skillChip(e.char, true) + '</div>' +
      '<div class="row" style="gap:8px">' + slot(0) + slot(1) + slot(2) + '</div>' + slot(0, 'sc') + '</div>' +
      '<div class="col" style="width:300px"><div class="panel" style="padding:10px"><b>7) Map Preview</b><div style="height:170px;border-radius:14px;border:3px solid #6b4226;margin-top:6px;background:url(assets/' + m.bg + '.webp) center/cover"></div><div style="font-weight:900;font-size:18px;margin-top:4px">' + m.th + '</div>' + m.districts.map(function (d) { return '<div class="row" style="font-size:13px;font-weight:800;gap:6px"><span style="width:16px;height:12px;border-radius:4px;background:' + d.color + ';border:2px solid #6b4226"></span>' + d.th + '</div>'; }).join('') + '</div>' +
      '<div class="panel" style="padding:10px;font-weight:800;font-size:14px"><b>5) ตรวจสอบความพร้อม</b><div>ตัวละคร: ' + Meta.charName(e.char) + '</div><div>อุปกรณ์: ' + (e.eq.map(function (id) { return Meta.item(id).name; }).join(', ') || '-') + ' (' + e.eq.length + '/3)</div><div>การ์ดพิเศษ: ' + (e.sc ? Meta.item(e.sc).name : '-') + ' (' + (e.sc ? 1 : 0) + '/1)</div><div>โหมด: ' + LENGTHS[U.sel.len].n + '</div></div></div></div>';
    $('#loadoutBody').innerHTML = html;
    var B = $('#loadoutBody');
    B.querySelectorAll('[data-c]').forEach(function (x) { x.onclick = function () { if (x.classList.contains('lock')) { LO.info = x.dataset.c; renderLoadout(); toast(Meta.p.chars[x.dataset.c] ? 'ตัวละครนี้ถูกเลือกแล้ว' : x.dataset.c[0] === 'e' ? '🥚 ตัวละครอีสเตอร์ได้จากไข่อีสเตอร์สุ่มเท่านั้น' : '🔒 ปลดล็อกตัวละครนี้ได้ที่ร้านค้า'); return; } e.char = x.dataset.c; LO.info = x.dataset.c; Meta.save(); renderLoadout(); }; });
    B.querySelectorAll('[data-slot]').forEach(function (x) { x.onclick = function () { var s = x.dataset.slot === 'sc' ? 'sc' : +x.dataset.slot; if (LO.slot === s) { if (s === 'sc') e.sc = null; else e.eq.splice(s, 1); Meta.save(); } LO.slot = s; renderLoadout(); }; });
    B.querySelectorAll('[data-it]').forEach(function (x) {
      x.onclick = function () {
        var id = x.dataset.it, isSC = /^SC_/.test(id); LO.info = id;
        if (!Meta.owned(id)) { renderLoadout(); toast('ยังไม่มีไอเทมนี้ใน Inventory — ซื้อได้ที่ร้านค้า'); return; }
        if (isSC) { e.sc = e.sc === id ? null : id; LO.slot = 'sc'; }
        else {
          var at = e.eq.indexOf(id);
          if (at >= 0) e.eq.splice(at, 1); // tap again = remove
          else { var s = typeof LO.slot === 'number' ? LO.slot : (e.eq.length < 3 ? e.eq.length : 2); if (s > e.eq.length) s = e.eq.length; e.eq[s] = id; e.eq = e.eq.slice(0, 3); LO.slot = e.eq.length < 2 ? e.eq.length : s; }
        }
        Meta.save(); renderLoadout();
      };
    });
  }
  $('#btnStart').onclick = function () {
    if (U.tourPending && Tour.load()) { var e0 = Meta.p.equip; if (e0.eq.length !== new Set(e0.eq).size) { toast('ห้ามติดตั้งอุปกรณ์ชิ้นเดียวกันซ้ำ'); return; } Tour.startWorld(); return; }
    var P = Meta.p, e = P.equip, v = Meta.validLoadout();
    if (e.eq.length !== new Set(e.eq).size) { toast('ห้ามติดตั้งอุปกรณ์ชิ้นเดียวกันซ้ำ'); return; }
    if (!P.chars[e.char]) { toast('ต้องเลือกตัวละครที่ปลดล็อกแล้ว'); return; }
    var R = U.rules, slots = U.sel.slots;
    var usedChars = [e.char]; slots.slice(1).forEach(function (s) { if (s.char) usedChars.push(s.char); });
    var pool = aiCharKeys().filter(function (k) { return usedChars.indexOf(k) < 0; });
    var players = [], hn = 1;
    slots.forEach(function (s, i) {
      if (s.type === 'off') return;
      var ch = i === 0 ? e.char : (s.char || pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      if (i !== 0 && s.type === 'human') hn++;
      players.push({
        name: i === 0 ? P.name : s.type === 'human' ? 'ผู้เล่น ' + (i + 1) : Meta.charName(ch) + ' AI', char: ch, costume: i === 0 ? e.costume : 'chars', isAI: s.type === 'ai',
        aiLevel: s.type === 'ai' ? (AI_LEVELS[s.lv] || AI_LEVELS[1]).id : null, persona: AI_PERSONAS[Math.floor(Math.random() * AI_PERSONAS.length)],
        loadout: i === 0 ? { eq: v.eq, sc: v.sc } : null, owner: i === 0,
      });
    });
    var cols = assignColors(players.map(function (q, k) { return k === 0 ? (Meta.p.color || 0) : -1; })); players.forEach(function (q, k) { q.color = cols[k]; });
    var s = Game.create({ mapIdx: U.sel.map, players: players, target: R.target, startCash: R.cash || 10000, maxRounds: R.rounds > 0 ? R.rounds : 9999, rules: { tax: R.tax, endOnBankrupt: R.endOnBankrupt }, seed: Math.floor(Math.random() * 1e9) });
    s.ownerIdx = 0; s.dice = P.equip.dice; s.lenName = 'เป้า ' + fmt(R.target);
    startGame(s, true);
  };

  // =====================================================================
  // GAME
  // =====================================================================
  // ---------- painted board + camera (zoom / pan / follow) ----------
  var SC = 0.6, BT = 42, VW = 1040, VH = 686;
  var CAM = { z: 1, tx: 0, ty: 0, follow: true };
  function startGame(state, isNew) {
    U.token++; var tok = U.token; var pp0 = document.getElementById('pickPanel'); if (pp0) pp0.remove(); U.planTap = null;
    migrate(state); U.tut = state.tutorial ? Tutorial : null;
    if (!U.online) state.players.forEach(function (p) { if (p.remote || p.seat) { p.seat = null; p.remote = null; p.isAI = true; p.ai = { level: 'normal', persona: 'Balanced' }; } });
    var g = new Game(state, null); g.io = makeIO(g, tok); U.g = g;
    if (U.online && U.online.role === 'host') g.io = Online.hostIO(g.io, g);
    U.view = state.players.findIndex(function (p) { return !p.isAI; }); if (U.view < 0) U.view = 0;
    show('game'); buildBoard(); refresh();
    $('#logBox').innerHTML = ''; state.log.slice(-40).forEach(function (l) { addLog(l.m, l.k); });
    (async function () {
      try {
        if (isNew) await orderIntro(g);
        if (isNew) { try { localStorage.setItem(saveKey(g.s), JSON.stringify(g.s)); } catch (e) { } }
        setTimeout(function () { if (tok === U.token) U.crash = 0; }, 60000);
        while (!g.s.over && tok === U.token) { await g.playTurn(); if (tok !== U.token) return; refresh(); }
        if (tok === U.token) { consumeUsed(g); localStorage.removeItem(saveKey(g.s)); if (U.online) Online.end(g); await wait(600); showResult(g); }
      } catch (err) {
        if (err === 'abort' || tok !== U.token) return;
        console.error(err);
        // something broke mid-turn: reload the last turn-start save instead of leaving the game stuck
        var key = saveKey(g.s), sv = null; try { sv = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { }
        U.crash = (U.crash || 0) + 1;
        if (sv && !U.online && U.crash <= 3) { toast('⚠️ เกิดข้อผิดพลาด — กำลังโหลดต่อจากจุดบันทึกล่าสุด (รอบ ' + sv.round + ')', 3500); setTimeout(function () { if (tok === U.token) startGame(sv, false); }, 1200); }
        else toast('⚠️ ' + (err && err.message || err));
      }
    })();
  }
  function saveKey(s) { return s && s.bkk && s.bkk.kind === 'solo' ? 'rfs_save_bkk' : s && s.train && s.train.kind === 'solo' ? 'rfs_save_train' : s && s.easter && s.easter.kind === 'solo' ? 'rfs_save_easter' : s && s.tour && s.tour.kind === 'solo' ? 'rfs_save_tour' : 'rfs_save_auto'; }
  U.saveKey = saveKey;
  // ---------- 3D dice (faces from the project's dice art) ----------
  var FACE_ROT = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
  var TINT = { dice_1: '#ffe9c7', dice_2: '#ffd34d', dice_3: '#ffb3c6', dice_4: '#a9d8ff', dice_5: '#bfe8a8', dice_6: '#d9a066' };
  // effect dice skins: drawn with CSS (face colour, pip shape, glow, particles)
  var DFX = {
    heart: { pip: '♥', parts: ['💗', '💖', '♥', '💕'] },
    sakura: { pip: '🌸', parts: ['🌸', '🌸', '💮'] },
    crystal: { pip: '❄', parts: ['❄', '✦', '✧'] },
    galaxy: { pip: '●', parts: ['✦', '✧', '⭐', '✨'] },
    rainbow: { pip: '★', parts: ['✨', '🌈', '⭐', '💫'] },
    royal: { pip: '★', parts: ['✨', '⭐', '💛', '👑'] },
    thunder: { pip: '⚡', parts: ['⚡', '⚡', '✦', '💥'], rise: 0 },
    fire: { pip: '●', parts: ['🔥', '🔥', '✦', '•'], rise: 1.1 },
    laser: { pip: '◆', parts: ['━', '┃', '✦', '◆'], rise: 0 },
    gem: { pip: '◆', parts: ['💎', '✦', '✧', '💠'] },
    cosmos: { pip: '★', parts: ['🪐', '⭐', '☄️', '✨', '🌙'] },
    storm: { pip: '●', parts: ['💨', '🌀', '💧', '⚡'], rise: 0, swirl: true },
    bubble: { pip: '●', parts: ['🫧', '🫧', '○', '◦'], rise: 1.3 },
    wonder: { pip: ['🎩', '♥', '♠', '♦', '♣', '🕰'], parts: ['🃏', '🎩', '🍄', '🕰️', '🐇', '🫖', '♥', '♠'] },
  };
  var PIPS = { 1: [[50, 50]], 2: [[27, 27], [73, 73]], 3: [[25, 25], [50, 50], [75, 75]], 4: [[27, 27], [73, 27], [27, 73], [73, 73]], 5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]], 6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]] };
  function skinFx(tint) { if (!tint) return null; var k = /^fx:/.test(tint) ? tint.slice(3) : (DICE_SKINS.find(function (d) { return d.id === tint; }) || {}).fx; return k && DFX[k] ? k : null; }
  function cubeHTML(size, tint, still) {
    var fx = skinFx(tint);
    if (fx) {
      var h2 = size / 2, ps = size * (fx === 'sakura' ? 0.2 : 0.22);
      var ff = function (n, tr) { var pp = DFX[fx].pip, pc = Array.isArray(pp) ? pp[n - 1] : pp; return '<div class="fc sk sk' + n + '" style="transform:' + tr + ' translateZ(' + h2 + 'px)">' + PIPS[n].map(function (q) { return '<i style="left:' + q[0] + '%;top:' + q[1] + '%;font-size:' + (n === 1 ? ps * 1.8 : ps) + 'px">' + pc + '</i>'; }).join('') + '</div>'; };
      var inn = ['rotateY(0)', 'rotateY(180deg)', 'rotateY(90deg)', 'rotateY(-90deg)', 'rotateX(90deg)', 'rotateX(-90deg)'].map(function (tr) { return '<div class="in" style="transform:' + tr + ' translateZ(' + (h2 - 3) + 'px)"></div>'; }).join('');
      return '<div class="dicewrap dfx dfx-' + fx + '"><div class="daura" style="--R:' + Math.round(size * 0.85) + 'px;--E:' + Math.max(14, Math.round(size * 0.3)) + 'px;width:' + size * 1.9 + 'px;height:' + size * 1.9 + 'px;top:' + (-size * 0.45) + 'px"></div><div class="cube ' + (still ? 'still' : 'spin') + '" style="width:' + size + 'px;height:' + size + 'px">' + inn + ff(1, 'rotateY(0)') + ff(6, 'rotateY(180deg)') + ff(2, 'rotateY(90deg)') + ff(5, 'rotateY(-90deg)') + ff(3, 'rotateX(90deg)') + ff(4, 'rotateX(-90deg)') + '</div>' + (still ? '' : '<div class="diceshadow"></div>') + '</div>';
    }
    if (tint && TINT[tint]) tint = TINT[tint];
    var h = size / 2, f = function (n, tr) { return '<div class="fc" style="background-position:' + (n - 1) * 20 + '% 0;transform:' + tr + ' translateZ(' + h + 'px)' + (tint ? ';--tint:' + tint : '') + '"></div>'; };
    var inner = ['rotateY(0)', 'rotateY(180deg)', 'rotateY(90deg)', 'rotateY(-90deg)', 'rotateX(90deg)', 'rotateX(-90deg)'].map(function (tr) { return '<div class="in" style="transform:' + tr + ' translateZ(' + (h - 3) + 'px)"></div>'; }).join('');
    return '<div class="dicewrap"><div class="cube spin" style="width:' + size + 'px;height:' + size + 'px">' + inner + f(1, 'rotateY(0)') + f(6, 'rotateY(180deg)') + f(2, 'rotateY(90deg)') + f(5, 'rotateY(-90deg)') + f(3, 'rotateX(90deg)') + f(4, 'rotateX(-90deg)') + '</div><div class="diceshadow"></div></div>';
  }
  function dicePreview(el, id) {
    if (!el) return; var run = function () { if (!el.isConnected) return; var r = spinner(el, 110, id); setTimeout(function () { if (!el.isConnected) return; r.stop(); setTimeout(run, 2100); }, 1500); }; run();
  }
  U.dicePreview = dicePreview;
  function spinner(el, size, tint) {
    el.innerHTML = cubeHTML(size, tint); var cube = el.querySelector('.cube'), stopped = false, snd = setInterval(function () { sfx('dice'); }, 140);
    var fx = skinFx(tint), wrap = el.querySelector('.dicewrap'), pt = null;
    function part(burst) {
      if (!wrap || !wrap.isConnected) { clearInterval(pt); return; }
      var e = document.createElement('span'), a = Math.random() * Math.PI * 2, r0 = size * (burst ? 0.3 : 0.55), r1 = size * (burst ? 1.4 + Math.random() * 0.6 : 0.9);
      e.className = 'dpart'; e.textContent = DFX[fx].parts[Math.floor(Math.random() * DFX[fx].parts.length)];
      e.style.cssText = 'left:50%;top:' + size * 0.5 + 'px;font-size:' + (size * (0.14 + Math.random() * 0.12)) + 'px;--x0:' + Math.cos(a) * r0 + 'px;--y0:' + Math.sin(a) * r0 + 'px;--x1:' + Math.cos(a) * r1 + 'px;--y1:' + (Math.sin(a) * r1 - (fx === 'sakura' ? -size * 0.4 : size * (DFX[fx].rise === undefined ? 0.3 : DFX[fx].rise))) + 'px;--rot:' + (fx === 'laser' ? Math.round(a * 57.3) + 'deg' : DFX[fx].swirl ? '540deg' : '160deg') + ';animation-duration:' + (burst ? 0.9 : 1.2 + Math.random() * 0.6) + 's';
      wrap.appendChild(e); setTimeout(function () { e.remove(); }, 2000);
    }
    if (fx) pt = setInterval(function () { part(false); }, 90);
    return { stop: function (forced) {
      if (stopped) return null; stopped = true; clearInterval(snd); clearInterval(pt);
      if (fx) { for (var bi = 0; bi < 18; bi++) setTimeout(function () { part(true); }, 700 + bi * 12); setTimeout(function () { if (wrap) wrap.classList.add('dflash'); }, 700); }
      var v = forced || (1 + Math.floor(Math.random() * 6)), r = FACE_ROT[v];
      var cs = getComputedStyle(cube).transform; cube.classList.remove('spin'); cube.style.transform = cs === 'none' ? '' : cs; void cube.offsetWidth;
      cube.style.transition = 'transform .75s cubic-bezier(.15,1.35,.4,1)';
      cube.style.transform = 'rotateX(' + (r[0] - 720 - 15) + 'deg) rotateY(' + (r[1] + 720 + 20) + 'deg)';
      setTimeout(function () { cube.style.transform = 'rotateX(' + (r[0] - 12) + 'deg) rotateY(' + (r[1] + 18) + 'deg)'; }, 760);
      el.querySelector('.dicewrap').classList.add('bounce'); sfx('card');
      return v;
    } };
  }
  function diceTint(p) { if (p && p.dice) return p.dice; return p && !p.isAI && U.g && U.g.s.dice && p.id === (U.g.s.ownerIdx || 0) ? U.g.s.dice : null; }
  async function orderIntro(g) {
    var s = g.s, res = {};
    var html = '<div class="row" style="gap:14px;justify-content:center">' + s.players.map(function (p) { return '<div id="oc' + p.id + '" style="text-align:center;border:5px solid ' + p.color + ';border-radius:22px;padding:8px;background:#fff;width:180px">' + spr(charSpec(p), 100, 100) + '<div style="font-weight:700">' + esc(p.name) + '</div><div class="ordice" id="od' + p.id + '"></div><div id="ol' + p.id + '" style="font-weight:700;font-size:15px;min-height:44px">' + (p.isAI ? 'กำลังทอย...' : '<button class="pink small" id="ob' + p.id + '">✋ หยุด!</button>') + '</div></div>'; }).join('') + '</div><div style="text-align:center;margin-top:8px;font-weight:700">แตะ “หยุด!” หรือแตะลูกเต๋าเพื่อหยุดลูกเต๋าของคุณ • แต้มมากสุดได้เริ่มก่อน</div>';
    await modal({ title: '🎲 ทอยลูกเต๋าจัดลำดับผู้เล่น', width: 840, body: html, close: false, buttons: [{ t: 'เริ่มเกม!', v: 1, cls: 'pink', dis: true }], mount: function (box) {
      var btn = box.querySelector('.mbtns button'), left = s.players.length;
      s.players.forEach(function (p) {
        var sp = spinner(box.querySelector('#od' + p.id), 70, diceTint(p));
        var stop = function () { if (res[p.id]) return; res[p.id] = sp.stop(); sfx('card'); var ol = box.querySelector('#ol' + p.id); if (!ol) return; ol.innerHTML = '<b style="font-size:22px">' + res[p.id] + ' แต้ม</b>'; if (--left === 0) { btn.disabled = false; finalize(); } };
        if (p.isAI || U.online) setTimeout(stop, 700 + Math.random() * 1600);
        else { box.querySelector('#ob' + p.id).onclick = stop; box.querySelector('#od' + p.id).onclick = stop; }
      });
      function finalize() {
        var order = s.players.map(function (p) { return { id: p.id, roll: res[p.id], tb: Math.random() }; }).sort(function (a, b) { return b.roll - a.roll || b.tb - a.tb; });
        s.order = order.map(function (o) { return o.id; }); s.orderRolls = order.map(function (o) { return { id: o.id, roll: o.roll }; }); s.cur = 0;
        order.forEach(function (o, i) { var el = box.querySelector('#ol' + o.id); el.innerHTML += '<div style="color:#ff5d8f">ลำดับที่ ' + (i + 1) + '</div>'; });
        refresh();
      }
    } });
  }
  function cardGridHTML(grid, hl) {
    var s = U.g.s, own = s.gridOwner || [];
    var legend = '<div class="row" style="justify-content:center;gap:8px;margin-bottom:6px">' + s.players.map(function (q) { return '<span class="chip" style="border-color:' + q.color + '"><span style="width:14px;height:14px;border-radius:4px;background:' + q.color + '"></span>' + esc(q.name) + ' ' + own.filter(function (o) { return o === q.id; }).length + '</span>'; }).join('') + '</div>';
    return legend + '<div style="display:flex;justify-content:center"><div class="cgrid">' + grid.map(function (u, i) {
      var o = own[i], q = o >= 0 ? s.players[o] : null, on = hl && hl.indexOf(i) >= 0;
      return '<div data-c="' + i + '" class="' + (u ? 'used ' : '') + (on ? 'pick' : '') + '" style="' + (q ? 'background:' + q.color + ';box-shadow:inset 0 0 0 3px rgba(255,255,255,.7)' + (on ? ',0 0 0 4px #fff,0 0 12px ' + q.color : '') : '') + '">' + (q ? '<span class="gi">' + spr(charSpec(q), 30, 30) + '</span>' : '') + '</div>';
    }).join('') + '</div></div>';
  }
  function charSpec(p) { return Meta.charSprite(p.char); }
  U.charSpec = charSpec;
  function consumeUsed(g) {
    var p = g.s.players[g.s.ownerIdx || 0]; if (!p || p.isAI) return;
    U._consumed = U._consumed || {};
    g.loadoutSlots(p).forEach(function (sl, i) { var k = g.s.seed + ':' + p.id + ':' + i; if (sl.used && !sl.consumed && !U._consumed[k]) { sl.consumed = true; U._consumed[k] = 1; Meta.consume(sl.id); } });
  }
  function buildBoard() {
    var g = U.g, s = g.s, M = MAPS[s.mapIdx];
    SC = Math.min(VW / s.w, VH / s.h); BT = M.ts * SC;
    var B = $('#board'); B.style.left = '0px'; B.style.top = '0px'; B.style.width = s.w * SC + 'px'; B.style.height = s.h * SC + 'px';
    B.style.backgroundImage = 'url(assets/' + M.bg + '.webp)'; B.style.backgroundSize = '100% 100%';
    var h = '';
    // painted lots (Riverside): show the district's buildings on its lot
    M.districts.forEach(function (d, i) { if (d.lot) h += '<div class="lot" id="lot' + i + '" style="left:' + d.lot[0] * SC + 'px;top:' + d.lot[1] * SC + 'px;width:' + (d.lot[2] - d.lot[0]) * SC + 'px;height:' + (d.lot[3] - d.lot[1]) * SC + 'px"></div>'; });
    s.tiles.forEach(function (t) { h += '<div class="ptile" id="t' + t.id + '" data-t="' + t.id + '"></div>'; });
    M.districts.forEach(function (d, i) { h += '<div class="dlabel" id="dl' + i + '" style="left:' + d.label[0] * SC + 'px;top:' + (d.label[1] * SC - 10) + 'px;border-color:' + d.color + ';font-size:' + Math.max(9, Math.min(12, BT * 0.24)) + 'px"></div>'; });
    s.players.forEach(function (p) { h += '<div class="piece" id="pc' + p.id + '" style="--pc:' + p.color + '"><div class="pin">P' + (p.id + 1) + '</div><div class="ring"></div>' + spr(charSpec(p), BT * 1.05, BT * 1.15) + (s.train ? '<img class="trainimg" src="assets/train.webp" draggable="false">' : '') + '</div>'; });
    if (s.easter) h += '<div id="eggLayer"></div><div id="bunny" class="bunny"><img src="assets/bunny.webp" draggable="false"><span class="bdice" id="bDice"></span></div>';
    B.innerHTML = h;
    var ep = document.getElementById('eventPill'); if (s.easter && !ep) { ep = document.createElement('div'); ep.id = 'eventPill'; $('#boardWrap').appendChild(ep); } if (ep) ep.style.display = s.easter ? '' : 'none';
    B.onclick = function (e) { if (U.dragMoved) return; if (U.tapRoll && e.target.closest('.piece.tapme')) { U.tapRoll(); return; } var t = e.target.closest('[data-t]'); if (t && U.planTap && !modalOpen && U.planTap(+t.dataset.t)) return; if (t && !modalOpen && !U.choosingDir) tileInfo(+t.dataset.t); };
    CAM.z = 1; fitCam(false);
  }
  function clampCam() {
    var s = U.g.s, bw = s.w * SC * CAM.z, bh = s.h * SC * CAM.z;
    CAM.tx = bw <= VW ? (VW - bw) / 2 : Math.min(0, Math.max(VW - bw, CAM.tx));
    CAM.ty = bh <= VH ? (VH - bh) / 2 : Math.min(0, Math.max(VH - bh, CAM.ty));
  }
  function applyCam(anim) { clampCam(); var B = $('#board'); B.style.transition = anim ? 'transform .3s ease' : 'none'; B.style.transform = 'translate(' + CAM.tx + 'px,' + CAM.ty + 'px) scale(' + CAM.z + ')'; $('#zLvl').textContent = Math.round(CAM.z * 100) + '%'; }
  function fitCam(anim) { CAM.z = 1; CAM.tx = 0; CAM.ty = 0; applyCam(anim); }
  function zoomAt(f, cx, cy, anim) { var nz = Math.max(1, Math.min(3.2, CAM.z * f)); CAM.tx = cx - (cx - CAM.tx) * (nz / CAM.z); CAM.ty = cy - (cy - CAM.ty) * (nz / CAM.z); CAM.z = nz; applyCam(anim); }
  function centerOnTile(id, anim) { var t = U.g.s.tiles[id]; CAM.tx = VW / 2 - t.x * SC * CAM.z; CAM.ty = VH / 2 - t.y * SC * CAM.z; applyCam(anim); }
  U.zoomAt = zoomAt;
  (function camInput() {
    var W = $('#boardWrap'), pts = {}, start = null;
    function local(e) { var r = W.getBoundingClientRect(), k = r.width / (VW + 8); return { x: (e.clientX - r.left) / k - 4, y: (e.clientY - r.top) / k - 4 }; }
    W.addEventListener('pointerdown', function (e) { if (e.target.closest('.zbtns,.dirArrow')) return; pts[e.pointerId] = local(e); U.dragMoved = false; start = { tx: CAM.tx, ty: CAM.ty, z: CAM.z, p: Object.assign({}, pts) }; });
    W.addEventListener('pointermove', function (e) {
      if (!(e.pointerId in pts) || !start) return; pts[e.pointerId] = local(e); var ids = Object.keys(pts);
      if (ids.length === 1) { var a = pts[ids[0]], a0 = start.p[ids[0]]; if (!a0) return; var dx = a.x - a0.x, dy = a.y - a0.y; if (Math.abs(dx) + Math.abs(dy) > 8) U.dragMoved = true; if (CAM.z > 1) { CAM.tx = start.tx + dx; CAM.ty = start.ty + dy; applyCam(false); } }
      else if (ids.length >= 2 && start.p[ids[0]] && start.p[ids[1]]) {
        var p0 = start.p[ids[0]], p1 = start.p[ids[1]], q0 = pts[ids[0]], q1 = pts[ids[1]];
        var d0 = Math.hypot(p0.x - p1.x, p0.y - p1.y), d1 = Math.hypot(q0.x - q1.x, q0.y - q1.y); if (d0 < 10) return;
        U.dragMoved = true; var nz = Math.max(1, Math.min(3.2, start.z * d1 / d0)), cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2;
        CAM.tx = cx - (cx - start.tx) * (nz / start.z) + ((q0.x + q1.x) / 2 - cx); CAM.ty = cy - (cy - start.ty) * (nz / start.z) + ((q0.y + q1.y) / 2 - cy); CAM.z = nz; applyCam(false);
      }
    });
    function up(e) { delete pts[e.pointerId]; start = Object.keys(pts).length ? { tx: CAM.tx, ty: CAM.ty, z: CAM.z, p: Object.assign({}, pts) } : null; setTimeout(function () { if (!Object.keys(pts).length) U.dragMoved = false; }, 30); }
    W.addEventListener('pointerup', up); W.addEventListener('pointercancel', up); W.addEventListener('pointerleave', up);
    W.addEventListener('wheel', function (e) { e.preventDefault(); var l = local(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, l.x, l.y, false); }, { passive: false });
    document.querySelector('.zbtns').addEventListener('click', function (e) {
      var b = e.target.closest('[data-z]'); if (!b || !U.g) return; var k = b.dataset.z;
      if (k === 'in') { zoomAt(1.35, VW / 2, VH / 2, true); }
      else if (k === 'out') zoomAt(1 / 1.35, VW / 2, VH / 2, true);
      else if (k === 'fit') fitCam(true);
      else if (k === 'me') { if (CAM.z < 1.6) { CAM.z = 1.8; } centerOnTile(U.g.cp().pos, true); }
      else if (k === 'follow') { CAM.follow = !CAM.follow; b.classList.toggle('on', CAM.follow); toast(CAM.follow ? '🎯 กล้องติดตามตัวละคร (เมื่อซูม)' : 'ปิดการติดตาม'); }
    });
  })();
  var TOUR_ICON = { platform: '🚉', prank: '🎁', chance: '🃏', lucky: '⭐', superlucky: '🌟', tax: '🧾', casino: '🎰', broker: '📈', rest: '♨️', festival: '🎉', event: '❗', boost: '⏩', ice: '⛸️', whirl: '🌀', wheel: '🎡', gate: '🔐', switch: '🔄', warp: '🌀' };
  function bkBld(t) { var L = [1, 2, 2, 3, 4, 4, 5, 5][Math.max(0, Math.min(7, (t.level || 1) - 1))]; return ['bkb', (t.biz === 'onsen' ? 5 : 0) + L - 1]; }
  var BK_ICON = { manhole: 0, cross: 1, bts: 2, mrt: 3, tuktuk: 4, pier: 5 }, BK_LBL = { manhole: '🕳️ ท่อ', cross: '🚸 ทางม้าลาย', bts: '🚈 BTS', mrt: 'Ⓜ️ MRT', tuktuk: '🛺 ตุ๊กตุ๊ก', pier: '⛴️ ท่าเรือ', event: '🏙️ อีเวนต์', casino: '🎲 คาสิโน', broker: '📈 หุ้น' };
  function dieFace(n) { var P = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[n] || [4], h = ''; for (var i = 0; i < 9; i++) h += '<i' + (P.indexOf(i) >= 0 ? ' class="on' + (n === 1 || n === 4 ? ' red' : '') + '"' : '') + '></i>'; return '<div class="pips">' + h + '</div>'; }
  function tileHTML(t) {
    var g = U.g, s = g.s, T = BT, html = '', style = '', cls = 'ptile', fs = Math.max(8.5, T * 0.21);
    var lbl = function (txt, col) { return '<div class="lbl" style="font-size:' + fs + 'px;line-height:' + (fs * 1.35) + 'px;' + (col ? 'border-color:' + col : '') + '">' + txt + '</div>'; };
    if (t.type === 'shop') {
      var d = s.districts[t.district], biz = BUSINESS.find(function (b) { return b.id === t.biz; }) || BUSINESS[0];
      if (t.owner >= 0) {
        var o = s.players[t.owner], bw = Math.max(3, T * 0.09);
        cls += ' owned'; style += 'border:' + bw + 'px solid ' + o.color + ';background:' + hexA(o.color, .35) + ';box-shadow:0 0 0 2px #fff,0 0 ' + T * 0.25 + 'px ' + o.color + ';';
        var ch = g.chainLen(t);
        html += '<div class="bld">' + (MAPS[s.mapIdx].bkk ? spr(bkBld(t), T * 1.15, T * 1.1) : spr(['lvl', t.level - 1], T * 1.12, T * 1.02)) + '</div><div class="lv" style="font-size:' + fs * 0.9 + 'px">' + (ch > 1 ? '🔗' + ch : 'Lv' + t.level) + '</div><div class="own" style="border-color:' + o.color + ';width:' + T * 0.5 + 'px;height:' + T * 0.5 + 'px">' + spr(charSpec(o), T * 0.42, T * 0.42) + '</div>' + lbl(fmt(g.shopRent(t)), o.color);
        if (g.noRent(t)) html += '<div style="position:absolute;top:10%;font-size:' + T * 0.4 + 'px">🔧</div>';
      } else {
        style += 'border:' + Math.max(2, T * 0.05) + 'px dashed ' + d.color + ';';
        html += '<div class="forsale">' + spr(['lvl', biz.spr], T * 0.78, T * 0.7) + '</div>' + lbl(fmt(g.buyPrice(t)), d.color);
      }
    } else if (t.type === 'splot') {
      if (t.special) {
        var sb = SPECIAL_BUILDINGS.find(function (x) { return x.id === t.special; }), so = s.players[t.spOwner];
        style += so ? 'border:' + Math.max(3, T * 0.09) + 'px solid ' + so.color + ';background:' + hexA(so.color, .3) + ';box-shadow:0 0 0 2px #fff,0 0 ' + T * 0.25 + 'px ' + so.color + ';' : '';
        cls += ' owned';
        html = '<div class="bld">' + spr(sb.spr, T * 1.2, T * 1.15) + '</div>' + (so ? '<div class="own" style="border-color:' + so.color + ';width:' + T * 0.5 + 'px;height:' + T * 0.5 + 'px">' + spr(charSpec(so), T * 0.42, T * 0.42) + '</div>' : '') + lbl(t.special === 'sp_toll' ? '🚧 ' + fmt(t.toll || 100) : sb.th.replace('บ้าน', '').replace('ประตูเก็บค่าผ่านทาง', 'ด่าน'), so && so.color);
      } else {
        html = '<div class="ico splot">' + spr(['sph', 0], T * 0.32, T * 0.32) + spr(['sph', 1], T * 0.32, T * 0.32) + '</div>' + lbl('บ้านพิเศษ', '#ab47bc');
      }
    } else if (t.type === 'vacant' && t.special) {
      var b = SPECIAL_BUILDINGS.find(function (x) { return x.id === t.special; }), ow = s.players[t.spOwner];
      style += ow ? 'border:' + Math.max(3, T * 0.09) + 'px solid ' + ow.color + ';background:' + hexA(ow.color, .3) + ';' : '';
      html = '<div class="bld">' + spr(b.spr, T * 1.05, T * 0.95) + '</div>' + (ow ? '<div class="own" style="border-color:' + ow.color + ';width:' + T * 0.5 + 'px;height:' + T * 0.5 + 'px">' + spr(charSpec(ow), T * 0.42, T * 0.42) + '</div>' : '') + lbl(b.th);
    } else if (MAPS[s.mapIdx].bkk && (BK_ICON[t.type] !== undefined || BK_LBL[t.type])) {
      var bkc = { manhole: '#607d8b', cross: '#455a64', bts: '#2e7d32', mrt: '#1565c0', tuktuk: '#f9a825', pier: '#0288d1', event: '#e91e63', casino: '#c2185b', broker: '#2e7d32' }[t.type];
      html = (BK_ICON[t.type] !== undefined ? '<div class="bkico">' + spr(['bkt', BK_ICON[t.type]], T * 1.05, T * 0.85) + '</div>' : '<div class="tbadge" style="font-size:' + T * 0.42 + 'px">' + (t.type === 'event' ? '🏙️' : t.type === 'casino' ? '🎲' : '📈') + '</div>') + lbl(BK_LBL[t.type], bkc);
    } else if ((MAPS[s.mapIdx].tour || MAPS[s.mapIdx].train) && TOUR_ICON[t.type]) {
      html = '<div class="tbadge" style="font-size:' + T * 0.42 + 'px">' + TOUR_ICON[t.type] + '</div>' + (t.type === 'gate' ? lbl('🔐 ' + fmt(CONFIG.gateFee), '#607d8b') : t.type === 'platform' ? lbl('🚉 ชานชาลา', '#1e88e5') : t.type === 'prank' ? lbl('🎁 กล่องแกล้ง', '#e53935') : '');
    } else if (t.type === 'dragon') {
      cls += ' dragon'; html = lbl('🐉 ' + fmt(s.dragonPot || 0), '#e53935');
    } else if (t.ov && t.type === 'road') {
      cls += ' pad';
    } else if (t.ov && t.type === 'suit') {
      html = '<div class="ico glyph" style="color:' + SUIT_COLOR[t.suit] + ';font-size:' + T * 0.5 + 'px">' + SUIT_GLYPH[t.suit] + '</div>';
    } else if (t.ov && t.type === 'switch') {
      html = '<div class="ico glyph" style="font-size:' + T * 0.45 + 'px">🔄</div>';
    } else if (t.ov) {
      var info = TILE_INFO[t.ch];
      html = '<div class="ico">' + spr(info.icon, T * 0.62, T * 0.58) + '</div>';
    } else if (t.type === 'bank') { cls += ' bank'; }
    return { cls: cls, style: style, html: html };
  }
  function refreshTiles() {
    var s = U.g.s, T = BT;
    s.tiles.forEach(function (t) {
      var el = document.getElementById('t' + t.id); if (!el) return;
      var r = tileHTML(t), big = t.type === 'bank' ? 1.9 : 1;
      var css = 'left:' + (t.x * SC - T * big / 2) + 'px;top:' + (t.y * SC - T * big / 2) + 'px;width:' + T * big + 'px;height:' + T * big + 'px;border-radius:' + T * 0.22 + 'px;' + r.style;
      if (el._c !== r.cls) { el._c = r.cls; var keep = ['hl', 'dest', 'trail'].filter(function (k) { return el.classList.contains(k); }); el.className = r.cls; keep.forEach(function (k) { el.classList.add(k); }); }
      if (el._s !== css) { el._s = css; el.style.cssText = css; }
      setHTML(el, r.html);
    });
    // lots: buildings of owned shops in that district
    MAPS[s.mapIdx].districts.forEach(function (d, i) {
      var el = document.getElementById('lot' + i); if (!el) return;
      var owned = s.districts[i].tiles.map(function (id) { return s.tiles[id]; }).filter(function (t) { return t.owner >= 0; });
      setHTML(el, owned.map(function (t) { var o = s.players[t.owner]; return '<div class="lotb" style="border-color:' + o.color + '">' + spr(['lvl', t.level - 1], BT * 1.2, BT * 1.1) + '</div>'; }).join(''));
    });
  }
  function refreshLabels() {
    var g = U.g, s = g.s;
    s.districts.forEach(function (d, i) {
      var el = document.getElementById('dl' + i); if (!el) return;
      var owners = d.tiles.map(function (id) { return s.tiles[id].owner; }), mono = owners[0] >= 0 && owners.every(function (o) { return o === owners[0]; });
      el.style.borderColor = mono ? s.players[owners[0]].color : d.color;
      setHTML(el, '<span style="background:' + d.color + '"></span>' + esc(d.th) + ' • ' + d.price + ' G' + (mono ? ' 👑' + esc(s.players[owners[0]].name) : ''));
    });
  }
  function placePieces(skip) {
    var s = U.g.s, groups = {}, T = BT;
    s.players.forEach(function (p) { if (p.bankrupt) { var e = document.getElementById('pc' + p.id); if (e) e.style.display = 'none'; return; } (groups[p.pos] = groups[p.pos] || []).push(p); });
    Object.keys(groups).forEach(function (pos) {
      var list = groups[pos], t = s.tiles[pos];
      list.forEach(function (p, i) {
        if (skip === p.id) return;
        var el = document.getElementById('pc' + p.id), off = list.length > 1 ? (i - (list.length - 1) / 2) * T * 0.42 : 0;
        el.style.left = (t.x * SC - T * 0.52 + off) + 'px'; el.style.top = (t.y * SC - T * 1.05 + (list.length > 1 ? (i % 2) * 5 : 0)) + 'px';
        el.style.zIndex = 20 + i + (p.id === U.g.cp().id ? 5 : 0);
        el.classList.toggle('driving', !!(s.train && s.train.phase && p.flags.train));
      });
    });
  }
  function refresh() {
    if (!U.g) return;
    var g = U.g, s = g.s;
    refreshTiles(); refreshLabels(); placePieces(); renderPlayers(); renderStocks(); renderItems(); refreshEaster();
    $('#roundPill').innerHTML = spr(['items', 19], 36, 36) + 'รอบ ' + Math.min(s.round, s.settings.maxRounds) + ' / ' + (s.settings.maxRounds >= 9999 ? '♾️' : s.settings.maxRounds);
    if (!$('#btnGameMenu').innerHTML) $('#btnGameMenu').innerHTML = spr(['ui', 'settings'], 70, 54);
    $('#spdBtn').textContent = 'ความเร็ว: ' + speedLabel();
    $('#targetPill').innerHTML = s.teams ? '<span style="font-size:26px">🤝</span><div><small>เป้าหมายทีม ' + fmt(s.settings.target) + ' G</small><div class="v" style="font-size:15px">' + [0, 1].map(function (k) { var q = s.players.find(function (x) { return x.team === k; }); return '<span style="color:' + TI(s, k).c + '">' + TI(s, k).n + ' ' + fmt(q ? g.teamWorth(q) : 0) + '</span>'; }).join(' • ') + '</div></div>' : '<span style="font-size:30px">🎯</span><div><small>เป้าหมายทรัพย์สิน</small><div class="v">' + fmt(s.settings.target) + ' G</div></div>';
  }
  U.refresh = refresh;
  function renderPlayers() {
    var g = U.g, s = g.s, cur = g.cp();
    var rank = s.players.slice().sort(function (a, b) { if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1; return g.netWorth(b) - g.netWorth(a); }).map(function (p) { return p.id; });
    setHTML($('#pbar'), s.players.map(function (p) {
      var rk = rank.indexOf(p.id) + 1;
      return '<div class="pcard ' + (p.id === cur.id && !s.over ? 'turn ' : '') + (p.bankrupt ? 'bk' : '') + '" data-p="' + p.id + '" style="--pc:' + p.color + ';--pcl:' + hexA(p.color, .35) + '">' + (rk === 1 && !p.bankrupt ? '<div class="crown">👑</div>' : '') +
        '<div class="pchar">' + spr(charSpec(p), 84, 92) + (Meta.charSkill(p.char) ? '<span class="pskill' + (p.char[0] === 'g' ? ' gold' : '') + '" title="' + esc(Meta.charSkill(p.char).name + ': ' + Meta.charSkill(p.char).desc) + '">⭐</span>' : '') + '</div>' +
        '<div class="ptop"><span class="pno"' + (s.teams && p.team >= 0 ? ' style="background:' + TI(s, p.team).c + ';color:#fff" title="ทีม' + TI(s, p.team).n + '"' : '') + '>' + (s.teams && p.team >= 0 ? TI(s, p.team).e : '') + 'P' + (p.id + 1) + '</span><span class="nm">' + esc(p.name) + '</span></div>' +
        '<div class="cash coin">' + fmt(p.cash) + '</div>' +
        '<span class="nwpill">ทรัพย์สิน ' + fmt(g.netWorth(p)) + '</span>' + (s.easter ? '<span class="eggpill">🥚 ' + (p.eggs || 0) + '</span>' : '') + (s.teams && p.team >= 0 ? '<span class="teamsum" style="background:' + TI(s, p.team).c + '">' + TI(s, p.team).e + ' ทีมรวม ' + fmt(g.teamWorth(p)) + '</span>' : '') +
        '<div class="lvl">' + (p.seat && !p.remote ? '<span style="color:#d0342c">📴 หลุด</span> • ' : '') + 'Lv' + p.level + (p.isAI ? ' • AI ' + { beginner: 'ง่าย', master: 'เก่งโคตร', normal: 'ปานกลาง', advanced: 'เก่ง' }[p.ai.level] : '') + '</div>' +
        '<div class="suits">' + SUITS.map(function (k) { return '<span class="' + (p.suits[k] ? 'on' : '') + '" style="' + (p.suits[k] ? 'color:' + SUIT_COLOR[k] : '') + '">' + SUIT_GLYPH[k] + '</span>'; }).join('') + '</div>' +
        (function () { var b = g.activeBuffs(p); return b.length ? '<div class="buffrow" data-bf="' + p.id + '" title="สกิลที่มีอยู่">' + b.map(function (x) { return '<span>' + x[1] + '</span>'; }).join('') + '</div>' : ''; })() +
        '<div class="rankb">' + spr(['ui', 'rank' + rk], 92, 30) + '</div></div>';
    }).join(''));
  }
  $('#pbar').onclick = function (e) { var bf = e.target.closest('[data-bf]'); if (bf && !modalOpen) { e.stopPropagation(); buffsModal(U.g.s.players[+bf.dataset.bf]); return; } var c = e.target.closest('[data-p]'); if (c && !modalOpen) playerInfo(U.g.s.players[+c.dataset.p]); };
  function renderStocks() {
    var g = U.g, s = g.s, me = s.players[U.view];
    setHTML($('#stockBox'), '<div style="font-weight:900;font-size:14px;display:flex;justify-content:space-between"><span>📈 หุ้นเขตธุรกิจ</span><span class="muted">ราคา • ถือ</span></div>' + s.districts.map(function (d, i) {
      var h = d.hist, ch = h.length > 1 ? d.price - h[h.length - 2] : 0;
      return '<div class="srow" data-d="' + i + '"><span class="dot" style="background:' + d.color + '"></span><span class="grow" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + d.name + '</span><b>' + d.price + '</b><span style="width:20px;color:' + (ch > 0 ? '#2c8a2c' : ch < 0 ? '#c0392b' : '#999') + '">' + (ch > 0 ? '▲' : ch < 0 ? '▼' : '•') + '</span><span style="width:34px;text-align:right">' + (me ? me.shares[i] : 0) + '</span></div>';
    }).join(''));
  }
  $('#stockBox').onclick = function (e) { var r = e.target.closest('[data-d]'); if (r && !modalOpen) districtInfo(+r.dataset.d); };
  function renderItems() {
    var g = U.g, s = g.s, cur = g.cp(), p = !cur.isAI ? cur : s.players[U.view];
    if (!p) { $('#itemBar').innerHTML = ''; return; }
    var slots = g.loadoutSlots(p);
    var card = function (sl, i) {
      var d = g.itemDef(sl.id), ready = g.canUsePre(p, sl) && !p.isAI && U.preRollActive;
      var st = sl.blown ? '<span class="st used">🌬️ ปลิวหาย</span>' : sl.used ? '<span class="st used">ใช้แล้ว</span>' : d.when === 'preRoll' ? '<span class="st ready">' + (ready ? 'แตะเพื่อใช้' : 'พร้อมใช้') + '</span>' : '<span class="st on">✓ ใช้งานอยู่</span>';
      return '<div class="itemSlot ' + (sl.used ? 'used ' : '') + (ready ? 'ready' : '') + '" data-sl="' + i + '">' + spr(d.spr, 50, 44) + '<div class="in">' + d.name + '</div>' + st + '</div>';
    };
    var all = p.loadout.eq.map(function (sl, i) { return card(sl, i); });
    if (p.loadout.sc) all.push(card(p.loadout.sc, p.loadout.eq.length).replace('class="itemSlot', 'class="itemSlot sc'));
    var left = slots.filter(function (x) { return !x.used; }).length;
    var bfs = g.activeBuffs(p); setHTML($('#itemBar'), '<div class="ribbon">🎒 ไอเทม + การ์ดพิเศษ (' + left + '/' + slots.length + ')</div>' + (all.join('') || '<div class="muted" style="font-weight:700">ไม่ได้ติดตั้งไอเทม</div>') + '<div class="bufbtn" data-bfi="' + p.id + '"><div>🛡️</div><b>สกิล ' + bfs.length + '</b><div class="bfl">' + bfs.map(function (x) { return x[1]; }).join('') + '</div></div>');
    $('#itemBar').dataset.pid = p.id;
  }
  $('#itemBar').onclick = function (e) {
    var bb = e.target.closest('[data-bfi]'); if (bb && !modalOpen) { buffsModal(U.g.s.players[+bb.dataset.bfi]); return; }
    var el = e.target.closest('[data-sl]'); if (!el || modalOpen) return;
    var g = U.g, p = g.s.players[+$('#itemBar').dataset.pid], sl = g.loadoutSlots(p)[+el.dataset.sl], d = g.itemDef(sl.id);
    var can = g.canUsePre(p, sl) && !p.isAI && U.preRollActive;
    var whenTxt = { preRoll: 'กดใช้ก่อนทอยลูกเต๋า', postRoll: 'ระบบจะถามหลังทอยลูกเต๋า', rent: 'ระบบจะถามเมื่อกำลังจะจ่ายค่าเช่า', tax: 'ระบบจะถามเมื่อกำลังจะเสียภาษี', gain: 'ระบบจะถามเมื่อได้รับเงินรางวัลจากเหตุการณ์', upgrade: 'ระบบจะถามก่อนยืนยันการอัปเกรด', buy: 'ระบบจะถามก่อนยืนยันการซื้อร้าน', negative: 'ระบบจะถามเมื่อเจอการ์ดผลเสีย', lose: 'ระบบจะถามเมื่อจะเสียเงินจากการ์ด/เทศกาล' }[d.when];
    modal({ title: d.name, body: '<div class="col" style="align-items:center;min-width:400px">' + spr(d.spr, 140, 120) + '<div style="font-size:18px;font-weight:800">' + d.th + '</div><div class="chip">เงื่อนไข: ' + whenTxt + '</div><div class="chip">คงเหลือ ' + (sl.used ? 0 : 1) + ' / 1 ครั้ง' + (sl.used ? ' • Used' : '') + '</div></div>', buttons: [{ t: 'Use', v: 'use', cls: 'green', dis: !can }, { t: 'ปิด', v: null }] })
      .then(function (v) {
        if (v !== 'use') return;
        return modal({ title: 'ยืนยันการใช้ ' + d.name + '?', body: '<div style="text-align:center;font-weight:800">' + d.th + '</div>', buttons: [{ t: 'ใช้เลย', v: 1, cls: 'green' }, { t: 'ยกเลิก', v: 0 }] })
          .then(async function (ok) { if (ok) { await g.usePreRoll(p, sl); consumeUsed(g); sfx('coin'); refresh(); if ((g.s.teleportBank || g.s.warpTo != null) && U.preRollResolve) U.preRollResolve(); else if (U.preRollRender) U.preRollRender(); } });
      });
  };
  var LOG_ICON = { gain: ['ui', 'i_money'], lose: ['ui', 'c_warn'], rent: ['ui', 'i_shop'], buy: ['ui', 'buy'], card: ['ui', 'i_card'], div: ['ui', 'i_stock'], bad: ['ui', 'c_x'], win: ['ui', 'achv'] };
  function logIcon(m, k) {
    if (LOG_ICON[k]) return LOG_ICON[k];
    if (/ทอย/.test(m)) return ['ui', 'd' + ((m.match(/(\d) แต้ม/) || [0, 1])[1])]; if (/หุ้น/.test(m)) return ['ui', 'i_stock']; if (/สัญลักษณ์/.test(m)) return ['ui', 'c_star']; if (/ธนาคาร|เงินเดือน/.test(m)) return ['ui', 'bank']; if (/วาร์ป|ย้าย/.test(m)) return ['ui', 'i_warp']; if (/ใช้ /.test(m)) return ['ui', 'i_item']; if (/ภาษี/.test(m)) return ['ui', 'i_tax'];
    return ['ui', 'c_info'];
  }
  function addLog(m, k) {
    var b = $('#logBox'), d = document.createElement('div'); d.className = 'lrow ' + (k || '');
    var am = m.match(/([+-])\s?([\d,]+)\s?G/), amt = am ? '<span class="amt ' + (am[1] === '+' ? 'p' : 'm') + '">' + am[1] + am[2] + ' G</span>' : '';
    if (!am && k === 'rent') { var r = m.match(/ค่าเช่า [^\d]*([\d,]+) G/); if (r) amt = '<span class="amt m">-' + r[1] + ' G</span>'; }
    if (!am && k === 'buy') { var r2 = m.match(/\(([\d,]+) G\)|([\d,]+) G$/); if (r2) amt = '<span class="amt m">-' + (r2[1] || r2[2]) + ' G</span>'; }
    var txt = m.replace(/^[^\wก-๙]+\s*/, '');
    d.innerHTML = spr(logIcon(m, k), 24, 24) + '<span>' + esc(txt) + '</span>' + amt;
    b.appendChild(d); while (b.children.length > 60) b.firstChild.remove(); b.scrollTop = b.scrollHeight;
  }
  document.querySelector('.tabs2').addEventListener('click', function (e) { var t = e.target.closest('[data-tab]'); if (!t) return; document.querySelectorAll('.tabs2 div').forEach(function (x) { x.classList.toggle('on', x === t); }); $('#logBox').style.display = t.dataset.tab === 'log' ? '' : 'none'; $('#stockBox').style.display = t.dataset.tab === 'stock' ? '' : 'none'; });
  function floatText(p, amt) {
    var el = document.querySelector('.pcard[data-p="' + p.id + '"]'); if (!el) return;
    var r = el.getBoundingClientRect(), st = $('#stage').getBoundingClientRect(), sc = st.width / 1280;
    var d = document.createElement('div'); d.className = 'float'; d.style.left = ((r.left - st.left) / sc + 90) + 'px'; d.style.top = ((r.top - st.top) / sc + 40) + 'px';
    d.style.color = amt >= 0 ? '#2c9a2c' : '#d0342c'; d.textContent = (amt >= 0 ? '+' : '') + fmt(amt) + ' G'; $('#stage').appendChild(d); setTimeout(function () { d.remove(); }, 1400);
  }
  // pick a shop / tile / district right on the board: candidates blink, the chosen one pulses and the camera goes there
  function boardChoose(g, p, req) {
    var s = g.s, isD = req.kind === 'district', cancel = req.kind === 'shop' || req.kind === 'player';
    var tilesOf = function (o) { return isD ? s.tiles.filter(function (t) { return t.district === o.value && (t.type === 'shop' || t.type === 'vacant'); }).map(function (t) { return t.id; }) : [o.value]; };
    var all = []; req.options.forEach(function (o) { tilesOf(o).forEach(function (id) { if (all.indexOf(id) < 0) all.push(id); }); });
    var cls = function (id, c, on) { var e = document.getElementById('t' + id); if (e) e.classList.toggle(c, on); };
    var sel = -1, panel = document.createElement('div'); panel.id = 'pickPanel'; $('#game').appendChild(panel);
    all.forEach(function (id) { cls(id, 'dest', true); });
    fitCam(true);
    return new Promise(function (resolve) {
      var done = function (v) { all.forEach(function (id) { cls(id, 'dest', false); cls(id, 'pksel', false); }); U.planTap = null; panel.remove(); sfx('card'); resolve(v); };
      var choose = function (i) {
        if (sel >= 0) tilesOf(req.options[sel]).forEach(function (id) { cls(id, 'pksel', false); });
        sel = i; var ts = tilesOf(req.options[i]); ts.forEach(function (id) { cls(id, 'pksel', true); });
        if (ts.length === 1) { CAM.z = Math.max(CAM.z, 1.5); centerOnTile(ts[0], true); } else fitCam(true);
        sfx('tap'); draw();
        var it = panel.querySelector('[data-po="' + i + '"]'); if (it) it.scrollIntoView({ block: 'nearest' });
      };
      var draw = function () {
        var o = sel >= 0 ? req.options[sel] : null;
        panel.innerHTML = '<div class="pkhead">' + esc(req.title) + '</div><div class="pkhint">👆 แตะช่องที่กระพริบบนแผนที่ หรือเลือกจากรายการ</div><div class="pklist">' + req.options.map(function (q, i) { return '<div class="pkopt' + (i === sel ? ' on' : '') + '" data-po="' + i + '"><span class="sw" style="background:' + (q.color || '#fff') + '"></span><div class="col" style="gap:0;text-align:left"><span>' + esc(q.label) + '</span>' + (q.sub ? '<span style="font-size:11px;font-weight:700">' + esc(q.sub) + '</span>' : '') + '</div></div>'; }).join('') + '</div>' +
          '<div class="pksel">' + (o ? '📍 ' + esc(o.label) + (o.sub ? '<br><span style="font-size:12px">' + esc(o.sub) + '</span>' : '') : 'ยังไม่ได้เลือก') + '</div>' +
          '<div class="row" style="gap:6px;justify-content:center"><button class="green" id="pkOk"' + (o ? '' : ' disabled') + '>✅ ยืนยัน</button>' + (cancel ? '<button class="small gray" id="pkNo">ยกเลิก</button>' : '') + '</div>';
        panel.querySelectorAll('[data-po]').forEach(function (e) { e.onclick = function () { var i = +e.dataset.po; if (i === sel) done(req.options[i].value); else choose(i); }; });
        panel.querySelector('#pkOk').onclick = function () { if (sel >= 0) done(req.options[sel].value); };
        var no = panel.querySelector('#pkNo'); if (no) no.onclick = function () { done(null); };
      };
      U.planTap = function (id) {
        var i = req.options.findIndex(function (o) { return tilesOf(o).indexOf(id) >= 0; });
        if (i < 0) return false;
        if (i === sel) done(req.options[i].value); else choose(i);
        return true;
      };
      draw();
    });
  }
  function setAct(html) { $('#actMain').innerHTML = html; }
  function setTurn(p, mine) {
    $('#turnRibbon').textContent = mine ? 'เทิร์นของคุณ' : 'เทิร์นของ ' + p.name;
    $('#turnChar').style.setProperty('--pc', p.color);
    $('#turnChar').innerHTML = spr(charSpec(p), 88, 92) + '<div class="tn"><b>P' + (p.id + 1) + '</b>' + esc(p.name) + '</div>';
    $('#actBtns').innerHTML = '';
  }

  // ---------- info popups (tap) ----------
  function tileInfo(id) {
    var g = U.g, s = g.s, t = s.tiles[id];
    if (t.type === 'shop') return shopInfo(t);
    if (t.type === 'bank') return bankInfo(s.players[U.view] || g.cp());
    var info = TILE_INFO[t.ch] || { name: t.name }, desc = {
      suit: 'เดินผ่านหรือหยุดเพื่อเก็บสัญลักษณ์ ' + SUIT_GLYPH[t.suit] + ' — ครบ 4 แบบแล้วกลับธนาคารเพื่อรับเงินเดือน • หยุดตรงช่องนี้พอดีได้เปิดการ์ด!', chance: 'เปิดการ์ด 1 ใบจากตาราง 100 ช่อง', lucky: 'รับเงินจากกองภาษีเมือง 50% (ขั้นต่ำ ' + CONFIG.luckyMin + ' G) • กองตอนนี้ ' + fmt(s.taxPool) + ' G', superlucky: 'รับกองภาษีเมืองทั้งหมด (ขั้นต่ำ ' + CONFIG.superLuckyMin + ' G) • กองตอนนี้ ' + fmt(s.taxPool) + ' G',
      tax: 'จ่ายภาษี 300 G หรือ 3% ของเงินสด (สูงสุด 1,000 G)', casino: 'เล่นสล็อตแมชชีน (เดิมพัน 100–500 G รางวัลสูงสุด 2,500 G)', broker: 'ซื้อ/ขายหุ้นทุกเขต', vacant: t.special ? SPECIAL_BUILDINGS.find(function (b) { return b.id === t.special; }).desc + (t.spOwner >= 0 ? ' • เจ้าของ: ' + s.players[t.spOwner].name : '') : 'ซื้อที่ดินและสร้างอาคารพิเศษ: ด่านเก็บเงิน, ที่จอดรถ, สวนดอกไม้, ตลาด, โรงแรม, ออนเซ็น',
      splot: t.special ? (SPECIAL_BUILDINGS.find(function (x) { return x.id === t.special; }).desc + (t.spOwner >= 0 ? ' • เจ้าของ: ' + s.players[t.spOwner].name : '') + (t.special === 'sp_toll' ? ' • ค่าผ่านทางตอนนี้ ' + fmt(t.toll || 100) + ' G' : '')) : 'ตกช่องนี้ = สร้างบ้านพิเศษได้ 1 ใน 4 แบบ: ประตูทะลุมิติ, บ้านปาร์ตี้, ประตูเก็บค่าผ่านทาง, บ้านกังหันลม',
      boost: 'ตกแล้วพุ่งไปข้างหน้าอีก ' + CONFIG.boostSteps + ' ช่อง',
      ice: 'ตกแล้วลื่นไถลต่ออีก ' + CONFIG.iceSteps + ' ช่อง',
      whirl: 'ตกแล้วถูกวังวนดูดไปโผล่ช่องสุ่มบนแผนที่',
      wheel: 'หมุนวงล้อ: ได้เงิน / เสียเงิน / เปิดการ์ด / หุ้นฟรี / ทอยต่อ / วาร์ป',
      gate: 'เดินผ่านต้องจ่าย ' + fmt(CONFIG.gateFee) + ' G เข้ากองภาษีเมือง (มีสัญลักษณ์ครบ 4 ผ่านฟรี)',
      dragon: 'วางเดิมพัน 100/300/500/1,000 G แล้วโจมตีมังกร! โดน = ได้เงินสะสมทั้งหมด (ตอนนี้ ' + fmt(s.dragonPot || 0) + ' G) • พลาด = เงินเข้ากองสะสม แล้วถูกลมพัดไปช่องสุ่ม',
      warp: 'หยุดแล้ววาร์ปไปอีกฝั่งของแผนที่', switch: 'ตกช่องนี้แล้วทิศทางเดินจะกลับด้าน (เทิร์นหน้าเดินย้อนกลับ)', rollon: 'ตกช่องลูกเต๋า = ได้ทอยลูกเต๋าอีกครั้งทันที!', road: 'ทางเชื่อม', rest: 'พักผ่อน รับ ' + CONFIG.restBonus + ' G', festival: 'งานเทศกาล — ขายของได้เงิน หรือเป็นเจ้าภาพจ่ายให้ทุกคน', event: 'เหตุการณ์ในเมืองแบบสุ่ม (การ์ดหมวด I)',
    }[t.type];
    modal({ title: (t.type === 'splot' && !t.special ? 'ที่ดินบ้านพิเศษ' : t.special ? SPECIAL_BUILDINGS.find(function (b) { return b.id === t.special; }).th : info.name), body: '<div class="col" style="align-items:center;min-width:420px">' + (t.type === 'suit' ? '<div style="font-size:90px;color:' + SUIT_COLOR[t.suit] + '">' + SUIT_GLYPH[t.suit] + '</div>' : spr(t.special ? SPECIAL_BUILDINGS.find(function (b) { return b.id === t.special; }).spr : info.icon, 140, 120)) + '<div style="font-size:18px;font-weight:800;text-align:center;max-width:520px">' + desc + '</div></div>', buttons: [{ t: 'ปิด', v: 1 }] });
  }
  function shopInfo(t) {
    var g = U.g, s = g.s, d = s.districts[t.district], biz = BUSINESS.find(function (b) { return b.id === t.biz; });
    var owner = t.owner >= 0 ? s.players[t.owner] : null, c = owner ? g.ownedIn(owner.id, t.district) : 0, n = d.tiles.length;
    var kv = '<div class="kv"><span>เขต</span><b style="color:' + d.color + '">' + d.th + '</b><span>ธุรกิจ</span><b>' + biz.name + '</b><span>เจ้าของ</span><b>' + (owner ? esc(owner.name) : 'ว่าง (ซื้อได้ ' + fmt(g.buyPrice(t)) + ' G)') + '</b>' +
      (owner ? '<span>อาคาร</span><b>' + CONFIG.levelName[t.level] + '</b><span>มูลค่าร้าน</span><b>' + fmt(g.shopValue(t)) + ' G</b><span>ค่าเช่าเมื่อมีคนตก</span><b style="color:#d0342c;font-size:20px">' + fmt(g.shopRent(t)) + ' G</b><span>ทุนสูงสุดคงเหลือ</span><b>' + fmt(g.maxCapital(t)) + ' G</b><span>ถือในเขต</span><b>' + c + '/' + n + ' ร้าน ×' + g.distMult(t).toFixed(2) + (c >= n ? ' 👑 ผูกขาด' : '') + '</b><span>ร้านติดกัน (เชื่อมถนน)</span><b>' + (g.chainLen(t) > 1 ? '🔗 ' + g.chainLen(t) + ' ร้าน ×' + g.chainMult(t).toFixed(2) + ' • อาคาร +' + (g.chainLen(t) - 1) + ' ขั้น' : '-') + '</b><span>ราคาซื้อกิจการ (5×)</span><b>' + fmt(g.shopValue(t) * 5) + ' G</b>' : '<span>ค่าเช่าเริ่มต้น</span><b>' + fmt(Math.round(g.priceFor(t.base))) + ' G</b>') + '</div>';
    var levels = '<div class="row" style="gap:2px;margin-top:8px;justify-content:center">' + [1, 2, 3, 4, 5, 6, 7, 8].map(function (L) { return '<div style="text-align:center;opacity:' + (owner && L <= t.level ? 1 : .3) + '">' + spr(['lvl', L - 1], 56, 50) + '<div style="font-size:10px;font-weight:700">' + fmt(Math.round(t.base * CONFIG.levelRatio[L - 1])) + '</div></div>'; }).join('') + '</div><div class="muted" style="text-align:center;font-size:12px;font-weight:700">ลงทุนจนมูลค่าฐานถึงตัวเลขด้านล่าง อาคารจะขยายเป็นขั้นถัดไป (ตกที่ร้านตัวเองเพื่อลงทุน)</div>';
    modal({ title: esc(t.name), width: 680, body: '<div class="row" style="align-items:flex-start;gap:16px"><div style="border:6px solid ' + (owner ? owner.color : d.color) + ';border-radius:20px;padding:8px;background:#fff">' + spr(owner ? ['lvl', t.level - 1] : ['lvl', biz.spr], 150, 140) + '</div>' + kv + '</div>' + levels, buttons: [{ t: 'ดูหุ้นเขตนี้', v: 'd', cls: 'blue small' }, { t: 'ปิด', v: null }] })
      .then(function (v) { if (v === 'd') districtInfo(t.district); });
  }
  function spark(hist, color, w, h) {
    if (hist.length < 2) hist = [hist[0], hist[0]];
    var mn = Math.min.apply(null, hist), mx = Math.max.apply(null, hist), rg = mx - mn || 1;
    var pts = hist.map(function (v, i) { return (i / (hist.length - 1) * w).toFixed(1) + ',' + (h - 6 - (v - mn) / rg * (h - 12)).toFixed(1); }).join(' ');
    return '<svg class="spark" width="' + w + '" height="' + h + '"><polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linejoin="round"/></svg>';
  }
  function districtInfo(i) {
    var g = U.g, s = g.s, d = s.districts[i];
    var shops = d.tiles.map(function (id) { var t = s.tiles[id]; return '<div class="row" style="font-weight:800;font-size:14px"><span class="grow">' + t.name + '</span><span>' + (t.owner >= 0 ? esc(s.players[t.owner].name) + ' Lv' + t.level : 'ว่าง') + '</span></div>'; }).join('');
    var holders = s.players.map(function (p) { return '<div class="row" style="font-weight:800;font-size:14px"><span style="color:' + p.color + '" class="grow">' + esc(p.name) + '</span><span>' + p.shares[i] + ' หุ้น</span></div>'; }).join('');
    modal({ title: '<span style="color:' + d.color + '">■</span> ' + d.th, width: 640, buttons: [{ t: '📍 ดูบนแผนที่', v: 'peek', cls: 'blue' }, { t: 'ปิด', v: 1 }], body: '<div class="kv"><span>ราคาหุ้น</span><b>' + d.price + ' G</b><span>หุ้นคงเหลือในตลาด</span><b>' + g.sharesAvail(i) + ' / ' + CONFIG.stock.total + '</b><span>มูลค่าธุรกิจรวม</span><b>' + fmt(g.districtValue(i)) + ' G</b><span>ร้านมีเจ้าของ</span><b>' + d.tiles.filter(function (id) { return s.tiles[id].owner >= 0; }).length + ' / ' + d.tiles.length + '</b></div><div style="margin:8px 0">' + spark(d.hist, d.color, 580, 90) + '</div><div class="row" style="align-items:flex-start;gap:20px"><div class="col grow"><b>ร้านในเขต</b>' + shops + '</div><div class="col grow"><b>ผู้ถือหุ้น</b>' + holders + '</div></div>', xValue: null }).then(function (v) { if (v === 'peek') peekModalDistrict(i); });
  }
  function buffsHTML(p) {
    var b = U.g.activeBuffs(p);
    if (!b.length) return '<div class="muted" style="font-weight:700">ยังไม่มีสกิลจากการ์ด</div>';
    return b.map(function (x) { return '<div class="buffitem"><span class="bi">' + x[1] + '</span><div><b>' + x[2] + '</b><div style="font-size:12px">' + x[3] + (x[0] === 'upgDisc' && p.flags.upgDiscUntil ? ' (ถึงรอบ ' + p.flags.upgDiscUntil + ')' : x[0] === 'maintHalf' ? ' (ถึงรอบ ' + p.flags.maintHalf + ')' : ' • ใช้ครั้งเดียวแล้วหมด') + '</div></div></div>'; }).join('');
  }
  function buffsModal(p) {
    modal({ title: '🛡️ สกิลจากการ์ดของ ' + esc(p.name), width: 640, body: '<div style="font-weight:700;margin-bottom:6px">ตอนนี้ได้รับการป้องกัน/ส่วนลดจาก:</div><div class="col">' + buffsHTML(p) + '</div><div class="muted" style="font-size:12px;font-weight:700;margin-top:8px">สกิลชนิดเดียวกันไม่สะสม — ได้การ์ดแบบเดิมอีกใบจะแทนที่ของเดิม • สกิลต่างชนิดมีพร้อมกันได้หลายอัน</div>', buttons: [{ t: 'ปิด', v: 1 }] });
  }
  U.buffsModal = buffsModal;
  function playerInfo(p) {
    var g = U.g, s = g.s;
    var shops = g.shopsOf(p).map(function (t) { return '<div class="row" style="font-size:14px;font-weight:800"><span style="color:' + s.districts[t.district].color + '">■</span><span class="grow">' + t.name + ' Lv' + t.level + '</span><span>' + fmt(g.shopValue(t)) + '</span></div>'; }).join('') || '<div class="muted">ยังไม่มีร้าน</div>';
    var st = p.shares.map(function (n, i) { return n ? '<div class="row" style="font-size:14px;font-weight:800"><span style="color:' + s.districts[i].color + '">■</span><span class="grow">' + s.districts[i].name + '</span><span>' + n + ' × ' + s.districts[i].price + '</span></div>' : ''; }).join('') || '<div class="muted">ไม่มีหุ้น</div>';
    var rank = s.players.slice().sort(function (a, b) { return g.netWorth(b) - g.netWorth(a); }).indexOf(p) + 1;
    modal({ title: esc(p.name) + (p.isAI ? ' (AI ' + p.ai.level + ' • ' + p.ai.persona + ')' : ''), width: 760, body: '<div class="row" style="align-items:flex-start;gap:16px"><div style="text-align:center">' + spr(charSpec(p), 150, 160) + '<div class="chip">อันดับ #' + rank + '</div>' + skillChip(p.char) + '</div><div class="col grow"><div class="kv"><span>เงินสด</span><b>' + fmt(p.cash) + ' G</b><span>มูลค่าร้าน/อาคาร</span><b>' + fmt(g.propertyValue(p)) + ' G</b><span>มูลค่าหุ้น</span><b>' + fmt(g.stockValue(p)) + ' G</b>' + (p.safe ? '<span>บัญชีคุ้มครอง</span><b>' + fmt(p.safe) + ' G</b>' : '') + '<span>ทรัพย์สินรวม</span><b>' + fmt(g.netWorth(p)) + ' G</b><span>ระดับ</span><b>Lv' + p.level + ' (เงินเดือนถัดไป ' + fmt(g.salary(p)) + ' G)</b><span>หนี้ค้างชำระ</span><b>' + (p.cash < 0 ? fmt(-p.cash) : 0) + ' G</b></div>' + (p.hist.length > 1 ? '<div><b>ประวัติทรัพย์สิน</b><br>' + spark(p.hist, p.color, 480, 60) + '</div>' : '') + '<div><b>🛡️ สกิลจากการ์ดที่มีอยู่</b><div class="col" style="margin-top:4px">' + buffsHTML(p) + '</div></div><div class="row" style="align-items:flex-start;gap:14px"><div class="col grow"><b>ร้านค้า</b>' + shops + '</div><div class="col grow"><b>หุ้น</b>' + st + '</div></div></div></div>', buttons: [{ t: 'ปิด', v: 1 }] });
  }
  function bankInfo(p) {
    var g = U.g;
    modal({ title: '🏦 ธนาคาร', body: '<div class="kv" style="min-width:420px"><span>ผู้เล่น</span><b>' + esc(p.name) + '</b><span>เงินสด</span><b>' + fmt(p.cash) + ' G</b><span>สัญลักษณ์</span><b>' + SUITS.map(function (k) { return '<span style="color:' + (p.suits[k] ? SUIT_COLOR[k] : '#ccc') + '">' + SUIT_GLYPH[k] + '</span>'; }).join(' ') + '</b><span>เงินเดือนถ้ากลับธนาคารพร้อมสัญลักษณ์ครบ</span><b>' + fmt(g.salary(p)) + ' G</b><span>มูลค่าหุ้น</span><b>' + fmt(g.stockValue(p)) + ' G</b><span>ทรัพย์สินรวม / เป้าหมาย</span><b>' + fmt(g.netWorth(p)) + ' / ' + fmt(g.s.settings.target) + '</b><span>หนี้</span><b>' + (p.cash < 0 ? fmt(-p.cash) : 0) + ' G</b><span>กองภาษีเมือง (Lucky)</span><b>' + fmt(g.s.taxPool) + ' G</b></div>', buttons: [{ t: 'ปิด', v: 1 }] });
  }

  // ---------- Stock trading panel ----------
  function stockPanel(p, mode, title, extraTabs) {
    var g = U.g, s = g.s, custom = {};
    var pend = function () { if (mode === 'sell' || p.flags.stockBuyDone) return null; for (var k in custom) { var n = Math.min(g.maxBuyShares(p, +k), Math.floor(+custom[k] || 0)); if (n > 0) return { i: +k, n: n }; } return null; };
    return modal({
      title: title, width: 1000, close: true, xValue: 'done', bgClose: false, buttons: [{ t: 'เสร็จสิ้น', v: 'done', cls: 'green' }],
      body: '<div id="spBody"></div>',
      mount: function (box) {
        var body = box.querySelector('#spBody');
        function draw() {
          var fee = g.buyFee(p), sfee = g.sellFee();
          var rows = s.districts.map(function (d, i) {
            var max = g.maxBuyShares(p, i);
            var cq = Math.min(max, Math.floor(+custom[i] || 0)), buyBtns = mode !== 'sell' ? [5, 10, 25, 50, 99].map(function (n) { return '<button class="small ' + (cq === Math.min(n, max) && cq ? 'green' : '') + '" data-b="' + i + ':' + n + '" ' + (max <= 0 ? 'disabled' : '') + '>' + n + '</button>'; }).join('') + '<input data-ci="' + i + '" type="number" min="1" placeholder="จำนวน" style="width:84px;font-size:16px;padding:6px;border:2px solid #6b4226;border-radius:10px;font-family:inherit" value="' + (custom[i] || '') + '" ' + (max <= 0 ? 'disabled' : '') + '><button class="small green" data-bc="' + i + '" ' + (cq > 0 ? '' : 'disabled') + '>ซื้อ' + (cq > 0 ? ' ' + cq + ' หุ้น = ' + fmt(Math.ceil(cq * d.price * (1 + fee))) + ' G' : '') + '</button>' : '';
            var sellBtns = mode !== 'buy' ? [1, 5, 10, 25].map(function (n) { return '<button class="small pink" data-s="' + i + ':' + n + '" ' + (n > p.shares[i] ? 'disabled' : '') + '>-' + n + '</button>'; }).join('') + '<button class="small pink" data-s="' + i + ':' + p.shares[i] + '" ' + (!p.shares[i] ? 'disabled' : '') + '>ขายหมด</button>' : '';
            var own = d.tiles.map(function (id) { return s.tiles[id]; }); return '<div class="row" style="border-bottom:2px dashed #e5cfae;padding:6px 0;gap:8px"><span style="width:16px;height:30px;border-radius:5px;background:' + d.color + ';border:2px solid #6b4226"></span><div style="width:210px;cursor:pointer" data-peek="' + i + '"><b>' + esc(d.th) + ' <span style="font-size:13px;color:#3f86f0">📍ดูบนแผนที่</span></b><div style="display:flex;gap:2px;margin:1px 0">' + own.map(function (t) { return '<span title="' + esc(t.name) + '" style="width:16px;height:16px;border-radius:5px;border:2px solid ' + (t.owner >= 0 ? s.players[t.owner].color : '#ccc') + ';background:' + (t.owner >= 0 ? hexA(s.players[t.owner].color, .5) : '#fff') + ';font-size:9px;display:flex;align-items:center;justify-content:center;font-weight:700">' + (t.owner >= 0 ? t.level : '') + '</span>'; }).join('') + '</div><div style="font-size:12px;font-weight:700">ราคา ' + d.price + ' G • ถือ ' + p.shares[i] + ' • ซื้อได้อีก ' + max + '</div></div>' + spark(d.hist, d.color, 90, 34) + '<div class="row" style="gap:4px;flex-wrap:wrap;flex:1">' + buyBtns + sellBtns + '</div></div>';
          }).join('');
          body.innerHTML = '<div class="row" style="justify-content:center;gap:10px;margin-bottom:6px"><span class="chip coin">' + fmt(p.cash) + ' G</span>' + (fee || sfee ? '<span class="chip">ค่าธรรมเนียมซื้อ ' + (fee * 100) + '% • ขาย ' + (sfee * 100) + '%</span>' : '<span class="chip">ไม่มีค่าธรรมเนียม</span>') + (mode !== 'sell' ? (p.flags.stockBuyDone ? '<span class="chip" style="background:#d8f5d0">✅ ซื้อหุ้นแล้วในเทิร์นนี้</span>' : '<span class="chip" style="background:#fff3c4">ซื้อหุ้นได้ 1 ครั้ง/เทิร์น • เลือก 1 เขต (สูงสุด 99 หุ้น)</span>') : '') + '<span class="chip">💡 แตะชื่อเขตเพื่อดูบนแผนที่</span></div>' + rows + (mode !== 'sell' && !p.flags.stockBuyDone ? (function () { var pd = pend(); return '<div class="stbar">' + (pd ? '<div style="font-weight:900;font-size:18px">🧾 ' + esc(s.districts[pd.i].th) + ' × ' + pd.n + ' หุ้น = ' + fmt(Math.ceil(pd.n * s.districts[pd.i].price * (1 + fee))) + ' G</div><button class="green" id="stOk" style="font-size:22px;padding:10px 34px">✅ ตกลงซื้อหุ้น</button><button class="small gray" id="stCancel">ยกเลิก</button>' : '<div style="font-weight:800">👆 เลือกจำนวนหุ้นของเขตที่ต้องการ แล้วกด “ตกลงซื้อหุ้น” ตรงนี้</div>') + '</div>'; })() : '');
          var okB = body.querySelector('#stOk'); if (okB) okB.onclick = function () { var pd = pend(); if (pd) { var bc = body.querySelector('[data-bc="' + pd.i + '"]'); if (bc) bc.onclick(); } };
          var cB = body.querySelector('#stCancel'); if (cB) cB.onclick = function () { custom = {}; draw(); };
          body.querySelectorAll('[data-peek]').forEach(function (e) { e.onclick = function () { peekDistrict(+e.dataset.peek); }; });
          body.querySelectorAll('[data-b]').forEach(function (b) { b.onclick = function () { var a = b.dataset.b.split(':'), i = +a[0]; custom = {}; custom[i] = Math.min(+a[1], g.maxBuyShares(p, i)); sfx('click'); draw(); }; });
          body.querySelectorAll('[data-ci]').forEach(function (inp) { inp.onchange = function () { var i = +inp.dataset.ci; custom = {}; custom[i] = Math.max(0, Math.min(g.maxBuyShares(p, i), Math.floor(+inp.value || 0))); draw(); }; });
          body.querySelectorAll('[data-bc]').forEach(function (b) { b.onclick = function () { var i = +b.dataset.bc, n = Math.min(g.maxBuyShares(p, i), Math.floor(+custom[i] || 0)); if (n <= 0) return; if (g.buyStock(p, i, n)) { custom = {}; sfx('coin'); refresh(); toast('🧾 ซื้อหุ้น ' + esc(s.districts[i].th) + ' ' + n + ' หุ้นแล้ว'); if (mode === 'buy' && U._closeModal) { U._closeModal(); return; } draw(); } }; });
          body.querySelectorAll('[data-s]').forEach(function (b) {
            b.onclick = function () {
              var a = b.dataset.s.split(':'), i = +a[0], n = +a[1], pv = g.sellPreview(p, i, n);
              var doSell = function () { g.sellStock(p, i, n); sfx('coin'); refresh(); };
              doSell(); if (n >= 10) toast('📉 ขาย ' + n + ' หุ้น +' + fmt(pv.net) + ' G • ราคาหุ้นลดเป็น ' + pv.newPrice + ' G', 2200); draw();
            };
          });
        }
        draw();
      },
    }).then(function (v) {
      // closed with a purchase still selected → buy it (players often forget to press the buy button)
      var pd = pend();
      if (pd && g.buyStock(p, pd.i, pd.n)) { sfx('coin'); refresh(); toast('🧾 ซื้อหุ้น ' + esc(s.districts[pd.i].th) + ' ' + pd.n + ' หุ้นตามที่เลือกไว้แล้ว', 2600); }
      return v;
    });
  }
  function landPreview(p, t) {
    var g = U.g, s = g.s;
    if (t.type === 'shop') {
      if (t.owner < 0) return '📍 <b>' + esc(t.name) + '</b><br>ร้านว่าง • ซื้อได้ ' + fmt(g.buyPrice(t)) + ' G' + (p.cash < g.buyPrice(t) ? '<br><span style="color:#d0342c">เงินไม่พอ</span>' : '');
      if (t.owner === p.id) return '📍 <b>' + esc(t.name) + '</b> (ร้านคุณ)<br>อัปเกรดร้าน 1 หลังได้ 1 ระดับ';
      if (g.mate(t.owner, p)) return '📍 <b>' + esc(t.name) + '</b> 🤝 ร้านเพื่อนร่วมทีม<br><span style="color:#2c8a2c">ไม่ต้องจ่าย • ช่วยลงทุนได้</span>';
      return '📍 <b>' + esc(t.name) + '</b> ของ ' + esc(s.players[t.owner].name) + '<br><span style="color:#d0342c;font-size:16px">ต้องจ่าย ' + fmt(g.shopRent(t)) + ' G</span>';
    }
    if (t.type === 'bank') return '📍 <b>ธนาคาร</b><br>' + (Game.suitsDone(p) ? 'เลื่อนระดับ + เงินเดือน ' + fmt(g.salary(p)) + ' G!' : 'ซื้อหุ้น • เลือกทิศได้อิสระ');
    if (t.type === 'splot') { if (!t.special) return '📍 <b>ที่ดินบ้านพิเศษ</b><br>สร้างบ้านพิเศษได้!'; var sb2 = SPECIAL_BUILDINGS.find(function (x) { return x.id === t.special; }); if (t.spOwner === p.id) return '📍 ' + sb2.th + ' (ของคุณ)' + (t.special === 'sp_portal' ? '<br><span style="color:#2c8a2c">🌀 วาร์ปฟรีไปช่องไหนก็ได้!</span>' : t.special === 'sp_party' ? '<br><span style="color:#2c8a2c">🎉 จัดปาร์ตี้ ทุกคนจ่ายคุณคนละ 100 G</span>' : t.special === 'sp_windmill' ? '<br><span style="color:#2c8a2c">🌪️ ขโมยเงิน 5% จากทุกคน</span>' : ''); return '📍 <b>' + sb2.th + '</b> ของ ' + esc(s.players[t.spOwner].name) + '<br><span style="color:#d0342c">' + (t.special === 'sp_portal' ? 'จ่าย 5–10% ของทรัพย์สิน' : t.special === 'sp_party' ? 'ทุกคนจ่ายคนละ 100 G' : t.special === 'sp_toll' ? 'จ่าย ' + fmt(t.toll || 100) + ' G' : 'สกิลการ์ด 2 + สัญลักษณ์ 1 + การ์ดพิเศษ 1 ปลิวหาย!') + '</span>'; }
    if (t.type === 'switch') return '📍 <b>ช่องสลับ 🔄</b><br>เทิร์นหน้าจะเดินกลับทิศ';
    if (t.type === 'boost') return '📍 <b>ช่องพุ่งเร็ว ⏩</b><br>พุ่งต่ออีก ' + CONFIG.boostSteps + ' ช่อง';
    if (t.type === 'ice') return '📍 <b>พื้นน้ำแข็งลื่น ⛸️</b><br>ไถลต่ออีก ' + CONFIG.iceSteps + ' ช่อง';
    if (t.type === 'whirl') return '📍 <b>วังวนมิติ 🌀</b><br>ถูกดูดไปช่องสุ่ม!';
    if (t.type === 'wheel') return '📍 <b>วงล้อเสี่ยงโชค 🎡</b><br>หมุนลุ้นรางวัล';
    if (t.type === 'gate') return '📍 <b>ประตูล็อก 🔐</b><br>จ่าย ' + fmt(CONFIG.gateFee) + ' G (มีสัญลักษณ์ครบ 4 = ฟรี)';
    if (t.type === 'dragon') return '📍 <b>ป้อมสู้มังกร 🐉</b><br>เงินสะสม <span style="color:#d0342c">' + fmt(s.dragonPot || 0) + ' G</span>';
    if (t.type === 'chance') return '📍 <b>' + esc(t.name) + '</b><br>🃏 ได้เปิดการ์ด!';
    if (t.type === 'rollon') return '📍 <b>ช่องลูกเต๋า 🎲</b><br>ได้ทอยอีกครั้งทันที!';
    if (t.type === 'suit') return '📍 สัญลักษณ์ ' + SUIT_GLYPH[t.suit] + (p.suits[t.suit] ? ' (มีแล้ว)' : ' (ใหม่!)') + '<br>🃏 หยุดพอดี = ได้เปิดการ์ด!';
    if (t.type === 'vacant' && t.special) { var b = SPECIAL_BUILDINGS.find(function (x) { return x.id === t.special; }); return '📍 ' + b.th + (t.spOwner >= 0 && t.spOwner !== p.id ? ' ของ ' + esc(s.players[t.spOwner].name) : ''); }
    return '📍 <b>' + esc((TILE_INFO[t.ch] || {}).name || t.name) + '</b>';
  }
  // ---------- out of cash: the player picks what to sell ----------
  function debtUI(p) {
    var g = U.g, s = g.s;
    return modal({ title: '💸 เงินสดไม่พอจ่าย! เลือกขายทรัพย์สินเอง', width: 1000, close: false, bgClose: false, body: '<div id="dbB"></div>', buttons: [], mount: function (box, close) {
      var B = box.querySelector('#dbB');
      function draw() {
        var owe = Math.max(0, -p.cash), sfee = g.sellFee();
        var st = s.districts.map(function (d, i) {
          if (!p.shares[i]) return '';
          var per = Math.floor(d.price * (1 - sfee)), needN = Math.min(p.shares[i], Math.ceil(owe / Math.max(1, per)));
          return '<div class="row" style="border-bottom:2px dashed #e5cfae;padding:5px 0;gap:8px"><span style="width:14px;height:28px;border-radius:5px;background:' + d.color + ';border:2px solid #6b4226"></span><div style="width:230px"><b>' + esc(d.th) + '</b><div style="font-size:12px;font-weight:700">ถือ ' + p.shares[i] + ' หุ้น × ' + d.price + ' G = ' + fmt(p.shares[i] * per) + ' G</div></div><div class="row" style="gap:4px;flex-wrap:wrap;flex:1">' + [1, 5, 10, 25].map(function (n) { return '<button class="small pink" data-ds="' + i + ':' + n + '" ' + (n > p.shares[i] ? 'disabled' : '') + '>-' + n + '</button>'; }).join('') + (owe > 0 ? '<button class="small green" data-ds="' + i + ':' + needN + '">ขายพอใช้หนี้ (' + needN + ')</button>' : '') + '<button class="small pink" data-ds="' + i + ':' + p.shares[i] + '">ขายหมด</button></div></div>';
        }).join('');
        var shops = g.shopsOf(p).map(function (t) { return '<div class="row" style="gap:8px;padding:3px 0;border-bottom:2px dashed #e5cfae">' + spr(['lvl', t.level - 1], 44, 38) + '<div class="grow"><b style="color:' + s.districts[t.district].color + '">' + esc(t.name) + '</b><div style="font-size:12px;font-weight:700">ค่าเช่า ' + fmt(g.shopRent(t)) + ' • ขายได้ ' + fmt(g.shopSellValue(t)) + ' G</div></div><button class="small pink" data-dsh="' + t.id + '">ขายร้าน</button></div>'; }).join('');
        var sps = s.tiles.filter(function (t) { return t.special && t.spOwner === p.id; }).map(function (t) { var b = SPECIAL_BUILDINGS.find(function (x) { return x.id === t.special; }); return '<div class="row" style="gap:8px;padding:3px 0;border-bottom:2px dashed #e5cfae"><div class="grow"><b>' + (b ? b.th : 'บ้านพิเศษ') + '</b><div style="font-size:12px;font-weight:700">ขายได้ ' + fmt(g.specialSellValue(t)) + ' G</div></div><button class="small pink" data-dsp="' + t.id + '">ขาย</button></div>'; }).join('');
        B.innerHTML = '<div style="text-align:center;font-weight:800;font-size:18px">' + (owe > 0 ? 'ต้องหาเงินอีก <span style="color:#d0342c;font-size:30px">' + fmt(owe) + ' G</span>' : '<span style="color:#2c8a2c;font-size:24px">✅ ชำระหนี้ครบแล้ว! เงินสด ' + fmt(p.cash) + ' G</span>') + '</div>' +
          '<div class="muted" style="text-align:center;font-weight:700;font-size:13px;margin-bottom:6px">แนะนำขายหุ้นก่อนเพื่อรักษาร้านไว้ • ขายร้านให้ธนาคารได้ราว 70% ของมูลค่า' + (sfee ? ' • ค่าธรรมเนียมขายหุ้น ' + (sfee * 100) + '%' : '') + '</div>' +
          '<div class="row" style="align-items:flex-start;gap:14px"><div class="grow" style="max-height:430px;overflow:auto"><b>📈 หุ้นของคุณ</b>' + (st || '<div class="muted">ไม่มีหุ้น</div>') + '</div><div style="width:330px;max-height:430px;overflow:auto"><b>🏪 ร้าน / บ้านพิเศษ</b>' + ((shops + sps) || '<div class="muted">ไม่มีร้าน</div>') + '</div></div>' +
          '<div class="row" style="justify-content:center;gap:10px;margin-top:8px">' + (owe > 0 ? '<button class="gray" id="dbAuto">🤖 ให้ระบบขายให้อัตโนมัติ</button>' : '<button class="green" id="dbOk">ตกลง</button>') + '</div>';
        B.querySelectorAll('[data-ds]').forEach(function (e) { e.onclick = function () { var a = e.dataset.ds.split(':'); g.sellStock(p, +a[0], +a[1]); sfx('coin'); refresh(); draw(); }; });
        B.querySelectorAll('[data-dsh]').forEach(function (e) { e.onclick = function () { g.sellShopToBank(p, g.tile(+e.dataset.dsh), true); sfx('coin'); refresh(); draw(); }; });
        B.querySelectorAll('[data-dsp]').forEach(function (e) { e.onclick = function () { g.sellSpecialToBank(p, g.tile(+e.dataset.dsp)); sfx('coin'); refresh(); draw(); }; });
        var a1 = B.querySelector('#dbAuto'); if (a1) a1.onclick = function () { close('auto'); };
        var a2 = B.querySelector('#dbOk'); if (a2) a2.onclick = function () { close('ok'); };
      }
      draw();
    } });
  }
  function investUI(p, t, o) {
    var g = U.g, s = g.s, d = s.districts[t.district];
    var list = o.list.filter(function (x) { return !x.blocked; }), sel = (list.find(function (x) { return x.tile.id === t.id && x.cap > 0; }) || list.find(function (x) { return x.cap > 0; }) || list[0]).tile, amt = 0;
    return modal({ title: '🏗️ อัปเกรดร้าน 1 หลัง (ขึ้นได้ 1 ระดับ) • เขต ' + esc(d.th), width: 980, xValue: null, bgClose: false, body: '<div id="invB"></div>', buttons: [], mount: function (box, close) {
      var B = box.querySelector('#invB');
      function draw() {
        var max = g.maxInvest(p, sel); amt = Math.min(amt, max); if (!amt && max) amt = max;
        var cost = g.investCost(p, amt), nv = g.valueAfterInvest(sel, amt), nr = g.rentAfterInvest(sel, amt), curR = g.shopRent(sel);
        var newLv = (function () { var r = (sel.base + sel.invest + amt) / sel.base, L = 1; CONFIG.levelRatio.forEach(function (x, i) { if (r >= x) L = i + 1; }); return Math.min(8, L + g.chainLen(sel) - 1); })();
        var dv = g.districtValue(t.district) - g.shopValue(sel) + nv, newStock = Math.max(1, Math.round(dv / (CONFIG.stockDiv * d.tiles.length) * (d.adj || 1)));
        B.innerHTML = '<div class="row" style="align-items:flex-start;gap:14px"><div style="width:360px">' + list.map(function (x) { var tt = x.tile; return '<div class="invshop ' + (tt.id === sel.id ? 'sel' : '') + (x.cap <= 0 ? ' full' : '') + '" data-is="' + tt.id + '">' + spr(['lvl', tt.level - 1], 64, 56) + '<div class="col grow" style="gap:0"><b>' + esc(tt.name) + '</b><span style="font-size:12px">ค่าเช่า ' + fmt(g.shopRent(tt)) + ' • มูลค่า ' + fmt(g.shopValue(tt)) + '</span><span style="font-size:12px">ทุนสูงสุดคงเหลือ ' + fmt(x.cap) + ' G</span></div></div>'; }).join('') +
          '<div class="muted" style="font-size:12px;font-weight:700">ถือ ' + g.ownedIn(p.id, t.district) + '/' + d.tiles.length + ' ร้านในเขต — ยิ่งถือมาก ทุนสูงสุดและค่าเช่ายิ่งสูง' + (g.dominated(sel) ? ' • 👑 ผูกขาดทั้งเขต!' : '') + '</div></div>' +
          '<div class="grow"><div class="row" style="gap:12px;justify-content:center">' + spr(['lvl', sel.level - 1], 120, 104) + '<div style="font-size:36px">➜</div>' + spr(['lvl', newLv - 1], 140, 122) + '</div>' +
          '<div style="text-align:center;font-weight:700">' + CONFIG.levelName[sel.level] + ' ➜ <span class="up">' + CONFIG.levelName[newLv] + '</span></div>' +
          '<div class="bigrow"><div>ค่าเช่า<b>' + fmt(curR) + ' ➜ <span class="up">' + fmt(nr) + '</span></b></div><div>มูลค่าร้าน<b>' + fmt(g.shopValue(sel)) + ' ➜ <span class="up">' + fmt(nv) + '</span></b></div><div>หุ้นเขต<b>' + d.price + ' ➜ <span class="up">' + newStock + '</span></b></div></div>' +
          '<div style="text-align:center"><div style="font-size:15px;font-weight:700">จำนวนเงินลงทุน</div><div style="font-size:40px;font-weight:700;color:#2c9a2c">' + fmt(amt) + ' G</div>' +
          '<input type="range" id="invR" min="0" max="' + max + '" step="10" value="' + amt + '" style="width:90%">' +
          '<div class="row" style="justify-content:center;gap:6px;flex-wrap:wrap">' + [-1000, -100, 100, 500, 1000].map(function (v) { return '<button class="small rbtn" data-ia="' + v + '">' + (v > 0 ? '+' : '') + fmt(v) + '</button>'; }).join('') + '<button class="small rbtn pink" data-ia="max">สูงสุด ' + fmt(max) + '</button></div>' +
          '<div style="font-size:13px;font-weight:700;margin-top:4px">จ่ายจริง ' + fmt(cost) + ' G' + (cost < amt ? ' (ส่วนลด)' : '') + ' • เงินสด ' + fmt(p.cash) + ' G</div><div style="font-size:13px;font-weight:700;color:#b5651d">📌 เลือกได้ 1 ร้าน • อัปได้ทีละ 1 ระดับ' + (g.levelStep(sel) === Infinity ? ' (ระดับสูงสุดแล้ว)' : ' • ต้องใช้ทุน ' + fmt(g.levelStep(sel)) + ' G เพื่อขึ้นระดับถัดไป') + '</div></div>' +
          '<div class="row" style="justify-content:center;gap:10px;margin-top:8px"><button class="green" id="invOk" ' + (amt > 0 ? '' : 'disabled') + '>🏗️ ลงทุน ' + fmt(amt) + ' G</button><button class="gray" id="invNo">ไม่ลงทุน</button></div></div></div>';
        B.querySelectorAll('[data-is]').forEach(function (e) { e.onclick = function () { sel = g.tile(+e.dataset.is); amt = 0; draw(); }; });
        B.querySelectorAll('[data-ia]').forEach(function (e) { e.onclick = function () { var v = e.dataset.ia; amt = v === 'max' ? max : Math.max(0, Math.min(max, amt + +v)); draw(); }; });
        B.querySelector('#invR').oninput = function () { amt = +this.value; draw(); };
        B.querySelector('#invOk').onclick = function () { close({ id: sel.id, amount: amt }); };
        B.querySelector('#invNo').onclick = function () { close(null); };
      }
      draw();
    } });
  }
  // ---------- peek a district on the map (from the stocks screen / district info) ----------
  function peekDistrict(i) {
    var g = U.g, s = g.s, d = s.districts[i], M = $('#modal');
    M.style.visibility = 'hidden';
    var ts = d.tiles.map(function (id) { return s.tiles[id]; }), xs = ts.map(function (t) { return t.x; }), ys = ts.map(function (t) { return t.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var z = Math.max(1, Math.min(2.6, VW * 0.8 / ((x1 - x0) * SC + BT * 3), VH * 0.7 / ((y1 - y0) * SC + BT * 3)));
    CAM.z = z; CAM.tx = VW / 2 - (x0 + x1) / 2 * SC * z; CAM.ty = VH * 0.42 - (y0 + y1) / 2 * SC * z; applyCam(true);
    ts.forEach(function (t) { var e = document.getElementById('t' + t.id); if (e) e.classList.add('dest'); });
    var box = document.createElement('div'); box.className = 'peekBox panel bear';
    box.innerHTML = '<div class="row" style="gap:8px"><span style="width:20px;height:20px;border-radius:6px;background:' + d.color + ';border:2px solid #6b4226"></span><b style="font-size:18px">' + esc(d.th) + '</b><span class="chip">หุ้น ' + d.price + ' G</span><span class="chip">มูลค่าเขต ' + fmt(g.districtValue(i)) + '</span></div>' +
      '<div class="peekList">' + ts.map(function (t) { var o = t.owner >= 0 ? s.players[t.owner] : null; return '<div class="peekRow" style="border-color:' + (o ? o.color : '#ccc') + '">' + spr(o ? ['lvl', t.level - 1] : ['lvl', (BUSINESS.find(function (b) { return b.id === t.biz; }) || BUSINESS[0]).spr], 40, 36) + '<div class="col" style="gap:0"><b style="font-size:13px">' + esc(t.name) + '</b><span style="font-size:12px">' + (o ? '<span style="color:' + o.color + '">● ' + esc(o.name) + '</span> • ค่าเช่า ' + fmt(g.shopRent(t)) + (g.chainLen(t) > 1 ? ' • 🔗' + g.chainLen(t) : '') : 'ว่าง • ' + fmt(t.base) + ' G') + '</span></div></div>'; }).join('') + '</div>' +
      '<div class="row" style="justify-content:space-between;margin-top:6px"><span style="font-size:12px;font-weight:700">ผู้ถือหุ้น: ' + s.players.filter(function (q) { return q.shares[i]; }).map(function (q) { return '<span style="color:' + q.color + '">' + esc(q.name) + ' ' + q.shares[i] + '</span>'; }).join(' • ') + '</span><button class="pink" id="peekBack">◀ กลับไปหน้าหุ้น</button></div>';
    $('#boardWrap').appendChild(box);
    box.querySelector('#peekBack').onclick = function () { box.remove(); ts.forEach(function (t) { var e = document.getElementById('t' + t.id); if (e) e.classList.remove('dest'); }); fitCam(true); M.style.visibility = ''; };
  }
  function peekModalDistrict(i) { peekDistrict(i); }
  U.peekDistrict = peekDistrict;
  function myShopsModal(p) {
    var g = U.g, list = g.shopsOf(p);
    if (!list.length) return alertBox('🏪 ร้านของฉัน', 'ยังไม่มีร้าน — หยุดที่ช่องร้านว่าง (กรอบเส้นประ) เพื่อซื้อ แล้วร้านจะเปลี่ยนเป็นกรอบสีของคุณ');
    modal({ title: '🏪 ร้านของ ' + esc(p.name) + ' (' + list.length + ' ร้าน)', width: 820, body: '<div class="col">' + list.map(function (t) { var d = g.s.districts[t.district], c = g.ownedIn(p.id, t.district); return '<div class="opt" data-sh="' + t.id + '" style="border-color:' + p.color + '"><span class="sw" style="background:' + d.color + '"></span>' + spr(['lvl', t.level - 1], 54, 48) + '<div class="col grow" style="gap:0"><span>' + t.name + ' • Lv' + t.level + '</span><span style="font-size:12px">' + d.th + ' (ถือ ' + c + '/' + d.tiles.length + ') • ลงทุนได้ถึง Lv' + g.levelCap(t) + '</span></div><span>ค่าเช่า <b>' + fmt(g.shopRent(t)) + '</b> • มูลค่า <b>' + fmt(g.shopValue(t)) + '</b></span></div>'; }).join('') + '<div class="muted" style="font-size:13px;font-weight:800">ตกที่ร้านของตัวเอง = ลงทุนร้านของคุณในเขตเดียวกันได้ (สูงสุด 6,000 G ต่อครั้ง)</div></div>', buttons: [{ t: 'ปิด', v: null }], mount: function (box, close) { box.querySelectorAll('[data-sh]').forEach(function (e) { e.onclick = function () { close(+e.dataset.sh); }; }); } })
      .then(function (id) { if (id !== null && id !== undefined) shopInfo(g.s.tiles[id]); });
  }
  function sellShopsPanel(p) {
    var g = U.g;
    var list = g.shopsOf(p); if (!list.length) { toast('คุณยังไม่มีร้าน'); return Promise.resolve(); }
    return modal({ title: '🏚️ ขายร้านให้ธนาคาร (75% − ค่าธรรมเนียม 5%)', width: 760, body: '<div class="col">' + list.map(function (t) { var v = Math.floor(g.shopValue(t) * CONFIG.shopSellRate * (1 - CONFIG.shopSellFee)); return '<div class="opt" data-sh="' + t.id + '"><span class="sw" style="background:' + g.s.districts[t.district].color + '"></span>' + spr(['lvl', t.level - 1], 50, 44) + '<span class="grow">' + t.name + ' Lv' + t.level + '</span><span>มูลค่า ' + fmt(g.shopValue(t)) + ' → ได้รับ <b>' + fmt(v) + ' G</b></span></div>'; }).join('') + '</div>', buttons: [{ t: 'ปิด', v: null }], mount: function (box, close) { box.querySelectorAll('[data-sh]').forEach(function (e) { e.onclick = function () { close(+e.dataset.sh); }; }); } })
      .then(function (id) { if (id === null || id === undefined) return; var t = g.s.tiles[id]; return modal({ title: 'ยืนยันขาย ' + t.name + '?', body: '<div style="text-align:center;font-weight:800">ร้านจะกลับเป็นของว่าง และมูลค่าเขตจะลดลง</div>', buttons: [{ t: 'ขาย', v: 1, cls: 'pink' }, { t: 'ยกเลิก', v: 0 }] }).then(function (ok) { if (ok) { g.sellShopToBank(p, t); sfx('coin'); refresh(); } }); });
  }


  // ---------- IO adapter: human = UI, AI = ai.js + short visual delays ----------
  function makeIO(g, tok) {
    var A = window.AI;
    function aiWait(ms) { return wait(ms * 1.8); }
    var io = {
      log: function (m, k) { addLog(m, k); },
      toast: toast,
      money: function (p, amt) { floatText(p, amt); renderPlayers(); if (amt > 0) sfx('coin'); },
      autosave: function (s) { consumeUsed(g); try { var key = saveKey(s); localStorage.setItem(key, JSON.stringify(s)); if (key !== 'rfs_save_auto') return; localStorage.setItem('rfs_save_auto_meta', JSON.stringify({ map: MAPS[s.mapIdx].th, round: s.round, date: new Date().toLocaleString('th-TH') })); } catch (e) { } },
      turnStart: async function (p) {
        if (!p.isAI) U.view = p.id;
        if (p.isAI) { try { await wait(350); } catch (e) { } }
        setTurn(p, !p.isAI);
        refresh(); if (CAM.follow && CAM.z > 1.05) centerOnTile(p.pos, true);
        if (U.tut && !p.isAI) { await Tutorial.event('intro'); if (g.loadoutSlots(p).length) await Tutorial.event('items'); if (g.netWorth(p) >= g.s.settings.target) await Tutorial.event('win'); }
        if (!p.isAI && !U.online && g.s.players.filter(function (q) { return !q.isAI && !q.remote && !q.seat; }).length > 1) await modal({ title: 'ตาของ ' + esc(p.name), body: '<div style="text-align:center">' + spr(charSpec(p), 140, 140) + '<div style="font-weight:800">ส่ง iPad ให้ ' + esc(p.name) + '</div></div>', buttons: [{ t: 'พร้อมแล้ว!', v: 1, cls: 'pink' }], close: false });
      },
      preRoll: function (p) {
        if (p.isAI) { setAct(spr(['ui', 'thinking'], 220, 44) + '<div>' + esc(p.name) + '</div>'); return aiWait(500).then(function () { return A.preRoll(g, p); }).then(function () { refresh(); }); }
        return new Promise(function (resolve) {
          U.preRollActive = true;
          var me = document.getElementById('pc' + p.id), tc = $('#turnChar');
          var done = function () { U.preRollActive = false; U.preRollResolve = null; U.preRollRender = null; U.tapRoll = null; if (me) me.classList.remove('tapme'); tc.classList.remove('tapme'); tc.onclick = null; renderItems(); resolve(); };
          U.tapRoll = function () { if (modalOpen) return; $('#actBtns').innerHTML = ''; sfx('tap'); done(); };
          if (me) me.classList.add('tapme'); tc.classList.add('tapme'); tc.onclick = function () { U.tapRoll && U.tapRoll(); };
          U.preRollResolve = done;
          var render = function () {
            setAct('<div class="taproll">👆 แตะที่<b>ตัวเรา</b><br>เพื่อทอยลูกเต๋า!</div>' + (U.lastRoll ? '<div class="lastroll">ครั้งก่อน ' + U.lastRoll + '</div>' : ''));
            $('#actBtns').innerHTML = '<div class="uibtn" id="aShops">' + spr(['ui', 'manage'], 150, 58) + '</div><div class="uibtn" id="aMine">' + spr(['ui', 'assets'], 150, 58) + '</div><div class="uibtn" id="aSellSh">' + spr(['ui', 'sell'], 150, 58) + '</div><div class="uibtn" id="aSellSt">' + spr(['ui', 'stockmkt'], 150, 58) + '</div>';
            $('#aSellSt').onclick = function () { stockPanel(p, 'sell', '📈 หุ้นของคุณ — ขายได้ต้นเทิร์น (ซื้อที่ธนาคาร/Broker)').then(function () { refresh(); render(); }); };
            $('#aSellSh').onclick = function () { sellShopsPanel(p).then(function () { refresh(); render(); }); };
            $('#aMine').onclick = function () { playerInfo(p); };
            $('#aShops').onclick = function () { myShopsModal(p); };
            renderItems();
          };
          U.preRollRender = render; render();
        });
      },
      rollDice: function (p) {
        return (U.tut ? Tutorial.event('dice') : Promise.resolve()).then(function () { return new Promise(function (resolve) {
          var L = $('#diceLayer'); L.classList.add('on', 'tap'); L.innerHTML = '<div id="spinD"></div><div class="tapmsg">👆 แตะเพื่อหยุดลูกเต๋า!</div>';
          setAct('<div style="font-size:17px">แตะลูกเต๋าเพื่อหยุด!</div>');
          var sp = spinner(L.querySelector('#spinD'), 170, diceTint(p)), done = false;
          L.onclick = async function () {
            if (done) return; done = true; L.classList.remove('tap'); L.querySelector('.tapmsg').remove();
            var v = sp.stop(U.tut ? U.tut.rig(p) : null); U.lastRoll = v;
            try { await wait(900); } catch (e) { }
            L.insertAdjacentHTML('beforeend', '<div class="dresult">' + v + '!</div>');
            try { await wait(700); } catch (e) { }
            L.classList.remove('on'); L.innerHTML = ''; L.onclick = null;
            setAct(spr(['ui', 'd' + v], 56, 56) + '<div>' + esc(p.name) + ' ได้ ' + v + ' แต้ม!</div>');
            resolve(v);
          };
        }); });
      },
      planPath: function (p, steps) {
        return (U.tut ? Tutorial.event('plan') : Promise.resolve()).then(function () { return new Promise(function (resolve) {
          var path = [], manual = false, timer = null, B = $('#board'), busy = false;
          var curId = function () { return path.length ? path[path.length - 1] : p.pos; };
          var prevId = function () { return path.length >= 2 ? path[path.length - 2] : path.length === 1 ? p.pos : p.prev; };
          var bubble = document.createElement('div'); bubble.className = 'stepBubble'; B.appendChild(bubble);
          function clear() { B.querySelectorAll('.dirArrow').forEach(function (a) { a.remove(); }); B.querySelectorAll('.dest,.trail').forEach(function (e) { e.classList.remove('dest', 'trail'); }); clearTimeout(timer); }
          function finish() { clear(); bubble.remove(); U.planTap = null; $('#actBtns').innerHTML = ''; resolve(path.slice()); }
          U.planTap = function (id) {
            if (busy) return true; var rem = steps - path.length; if (rem <= 0) { if (id === curId()) { finish(); return true; } return false; }
            var e = g.endpoints(curId(), prevId(), rem).find(function (x) { return x.end === id; }); if (!e) return false;
            busy = true; clearTimeout(timer); var i = 0;
            (function nx() { if (i < e.path.length) { path.push(e.path[i++]); sfx('step'); render(); setTimeout(nx, 140 / Math.max(.5, U.speed) + 40); } else { busy = false; finish(); } })();
            return true;
          };
          function render() {
            clear(); var rem = steps - path.length, cur = g.tile(curId());
            // piece preview
            var el = document.getElementById('pc' + p.id); el.style.left = (cur.x * SC - BT * 0.52) + 'px'; el.style.top = (cur.y * SC - BT * 1.05) + 'px'; el.style.zIndex = 30;
            bubble.style.left = cur.x * SC + 'px'; bubble.style.top = (cur.y * SC - BT * 1.1) + 'px'; bubble.textContent = rem; bubble.style.display = rem > 0 ? 'flex' : 'none';
            path.forEach(function (id) { var e = document.getElementById('t' + id); if (e) e.classList.add('trail'); });
            if (CAM.follow && CAM.z > 1.05) centerOnTile(cur.id, true);
            if (rem > 0) {
              g.endpoints(cur.id, prevId(), rem).forEach(function (e) { var d = document.getElementById('t' + e.end); if (d) d.classList.add('dest'); });
              var opts = g.nextOptions(cur.id, prevId());
              setAct('<div style="font-size:18px">เดินอีก <b style="font-size:26px;color:#ff5d8f">' + rem + '</b> ก้าว</div><div class="lp">' + (opts.length > 1 || manual ? '👆 แตะช่อง 📍 ที่กระพริบเพื่อเดินไปเลย' : 'กำลังเดิน...') + '<br>📍 = จุดที่อาจตก</div>');
              $('#actBtns').innerHTML = '<div class="mvbtns"><button class="blue" id="mvUndo" ' + (path.length ? '' : 'disabled') + '>↩ ย้อน 1 ก้าว</button><button class="small" id="mvReset" ' + (path.length ? '' : 'disabled') + '>⏮ เริ่มเดินใหม่</button></div>';
              if (busy) { }
              else if (opts.length === 1 && !manual) timer = setTimeout(function () { step(opts[0]); }, 230 / U.speed + 80);
              // no direction arrows: tap a flashing 📍 tile to walk there
            } else {
              var e2 = document.getElementById('t' + cur.id); if (e2) e2.classList.add('dest');
              setAct('<div class="lp">' + landPreview(p, cur) + '</div>');
              $('#actBtns').innerHTML = '<div class="mvbtns"><button class="green" id="mvOk">✔ หยุดตรงนี้</button><button class="blue" id="mvUndo">↩ ย้อน 1 ก้าว</button></div>';
              $('#mvOk').onclick = finish;
            }
            var u = $('#mvUndo'); if (u) u.onclick = function () { if (!path.length) return; path.pop(); manual = true; sfx('tap'); render(); };
            var r = $('#mvReset'); if (r) r.onclick = function () { path = []; manual = true; render(); };
          }
          function step(id) { path.push(id); sfx('step'); render(); }
          render();
        }); });
      },
      showDice: async function (p, roll) {
        setAct('<div>' + esc(p.name) + ' ทอยลูกเต๋า...</div>');
        var L = $('#diceLayer'); L.classList.add('on'); L.innerHTML = '<div id="spinD"></div>';
        var sp = spinner(L.querySelector('#spinD'), 150, diceTint(p));
        await wait(700); sp.stop(roll); await wait(900);
        L.insertAdjacentHTML('beforeend', '<div class="dresult">' + roll + '!</div>'); await wait(600);
        L.classList.remove('on'); L.innerHTML = '';
        setAct(spr(['ui', 'd' + roll], 56, 56) + '<div>' + esc(p.name) + ' ได้ ' + roll + ' แต้ม</div>');
      },
      step: async function (p, id, rem, fast) {
        if (fast) { placePieces(); await wait(110); return; }
        var el = document.getElementById('pc' + p.id); placePieces(); if (CAM.follow && CAM.z > 1.05) centerOnTile(id, true); el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); sfx('step');
        setAct(spr(['ui', 'walking'], 220, 44) + '<div style="font-size:18px">เหลืออีก ' + rem + ' ช่อง</div>');
        await wait(320);
      },
      teleport: async function (p, from, to) { var el = document.getElementById('pc' + p.id); el.style.opacity = 0; await wait(250); placePieces(); el.style.opacity = 1; await wait(250); },
      chooseDir: function (p, opts, rem) {
        if (p.isAI) return aiWait(250).then(function () { return A.chooseDir(g, p, opts, rem); });
        return new Promise(function (resolve) {
          U.choosingDir = true;
          var cur = g.tile(p.pos);
          setAct('<div class="msg">เลือกทาง 👣<br><span style="font-size:14px">เหลืออีก ' + rem + ' ช่อง • แตะช่องที่กระพริบ</span></div>');
          opts.forEach(function (id) { var e = document.getElementById('t' + id); if (e) e.classList.add('dest'); });
          U.planTap = function (id) { if (opts.indexOf(id) < 0) return false; opts.forEach(function (x) { var e = document.getElementById('t' + x); if (e) e.classList.remove('dest'); }); U.planTap = null; U.choosingDir = false; resolve(id); return true; };
        });
      },
      landed: async function (p, t) { var el = document.getElementById('t' + t.id); if (el) { el.classList.add('hl'); setTimeout(function () { el.classList.remove('hl'); }, 900); } await wait(250); },
      confirmBuy: async function (p, t, price, disc) {
        if (U.tut && !p.isAI) await Tutorial.event('buy');
        if (p.isAI) { var r = A.confirmBuy(g, p, t, price); return aiWait(350).then(function () { if (r) toast('🏠 ' + esc(p.name) + ' ซื้อ ' + t.name); return r; }); }
        var d = g.s.districts[t.district], biz = BUSINESS.find(function (b) { return b.id === t.biz; }), c = g.ownedIn(p.id, t.district) + 1, n = d.tiles.length;
        var mult = (1 + CONFIG.distStep * (c - 1)) * (c >= n ? CONFIG.domination : 1), others = d.tiles.map(function (id) { return g.tile(id); }).filter(function (x) { return x.owner >= 0 && x.owner !== p.id; });
        return modal({ title: '🏪 ' + esc(t.name) + ' ว่างอยู่!', width: 640, body: '<div class="row" style="gap:16px;align-items:flex-start"><div style="border:5px dashed ' + d.color + ';border-radius:18px;padding:8px;background:#fff">' + spr(['lvl', biz.spr], 150, 130) + '</div><div class="kv"><span>เขต</span><b style="color:' + d.color + '">' + d.th + '</b><span>ธุรกิจ</span><b>' + biz.name + '</b><span>ราคา</span><b style="font-size:22px">' + fmt(price) + ' G</b>' + (disc.length ? '<span>ส่วนลด</span><b>' + disc.join(', ') + '</b>' : '') + '<span>ค่าเช่าเริ่มต้น</span><b>' + fmt(Math.round(g.priceFor(t.base * mult))) + ' G</b><span>ถ้าซื้อ: ถือในเขต</span><b>' + c + '/' + n + (c >= n ? ' 👑 ผูกขาด!' : '') + '</b><span>ตัวคูณเขต</span><b>×' + mult.toFixed(2) + '</b><span>ทุนสูงสุดที่ลงทุนได้</span><b>' + fmt(Math.round(t.base * (c + 1) * (c >= n ? CONFIG.domination : 1))) + ' G</b><span>เงินสดหลังซื้อ</span><b>' + fmt(p.cash - price) + ' G</b></div></div>' + (others.length ? '<div class="muted" style="text-align:center;font-weight:700;font-size:13px">เขตนี้มีร้านของคู่แข่งแล้ว ' + others.length + ' ร้าน</div>' : '') + (function () { var nb = t.n.map(function (id) { return g.tile(id); }).filter(function (u) { return u.type === 'shop' && u.owner === p.id; }); return nb.length ? '<div style="text-align:center;font-weight:700;color:#e0407a;font-size:15px">🔗 ติดกับร้านของคุณ! ซื้อแล้วร้านจะเชื่อมกัน — ค่าเช่าเพิ่มและอาคารขยายทั้งแถว</div>' : ''; })(), buttons: [{ t: '🏠 ซื้อร้าน ' + fmt(price) + ' G', v: true, cls: 'green' }, { t: 'ไม่ซื้อ', v: false }] });
      },
      chooseInvest: async function (p, t, o) {
        if (p.isAI) { var r = A.chooseInvest(g, p, t, o); return aiWait(350).then(function () { if (r) toast('🏗️ ' + esc(p.name) + ' ลงทุน ' + esc(g.tile(r.id).name) + ' ' + fmt(r.amount) + ' G'); return r; }); }
        if (U.tut) { await Tutorial.event('invest'); Tutorial.invested = true; }
        return investUI(p, t, o);
      },
      confirmBuyout: function (p, t, cost) {
        if (p.isAI) { var r = A.confirmBuyout(g, p, t, cost); return aiWait(300).then(function () { return r; }); }
        var o = g.s.players[t.owner];
        return modal({ title: '🤝 ซื้อกิจการ ' + t.name + '?', body: '<div style="text-align:center;font-weight:800;font-size:17px">' + spr(['lvl', t.level - 1], 140, 120) + '<br>เจ้าของ: ' + esc(o.name) + '<br>ราคาซื้อกิจการ (5× มูลค่า) = <b>' + fmt(cost) + ' G</b><br>เงินสดของคุณ ' + fmt(p.cash) + ' G</div>', buttons: [{ t: 'ซื้อกิจการ', v: true, cls: 'pink' }, { t: 'ไม่ซื้อ', v: false }] });
      },
      dividend: async function (t, dist) { toast('💹 ปันผล ' + esc(U.g.s.districts[t.district].th) + ': ' + esc(dist.join(', ')), 2600); },
      rent: async function (p, owner, t, rent, ownerInc, city) {
        if (U.tut) { if (!p.isAI) await Tutorial.event('rentPay'); else if (!owner.isAI) await Tutorial.event('rentGet'); }
        sfx('bad'); floatText(p, -rent); floatText(owner, ownerInc);
        var big = rent >= 2000, d = g.s.districts[t.district];
        var html = '<div style="text-align:center;min-width:460px"><div class="row" style="justify-content:center;gap:18px;align-items:flex-end">' + spr(charSpec(p), 110, 110) + '<div style="font-size:40px">➜</div><div style="border:6px solid ' + owner.color + ';border-radius:22px;padding:6px;background:' + hexA(owner.color, .2) + '">' + spr(['lvl', t.level - 1], 130, 116) + '</div>' + spr(charSpec(owner), 110, 110) + '</div>' +
          '<div style="font-size:' + (big ? 56 : 42) + 'px;font-weight:700;color:#e0405a;-webkit-text-stroke:3px #fff;paint-order:stroke fill;' + (big ? 'animation:pop .3s' : '') + '">−' + fmt(rent) + ' G</div>' +
          '<div style="font-weight:700">' + esc(p.name) + ' จ่ายให้ ' + esc(owner.name) + ' ' + fmt(ownerInc) + ' G' + (city ? ' • ภาษีเมือง ' + fmt(city) + ' G' : '') + '</div>' +
          '<div style="font-size:13px;font-weight:700;color:#5a8a3a">💹 ผู้ถือหุ้น ' + esc(d.th) + ' ได้ปันผล 20% (' + fmt(Math.floor(rent * CONFIG.dividendPct)) + ' G) จากธนาคาร</div></div>';
        await modal({ title: big ? '💸 ร้านราคาแพง! จ่ายเงิน' : '🏪 จ่ายเงินที่ร้าน ' + esc(t.name), body: html, buttons: [{ t: 'จ่าย', v: 1, cls: 'pink' }], auto: p.isAI ? (big ? 2200 : 1300) : 0, close: false });
      },
      bank: async function (p, stopped) {
        refresh();
        if (p.isAI) { await aiWait(300); await A.bank(g, p, stopped); refresh(); return; }
        if (U.tut) await Tutorial.event('bank');
        await stockPanel(p, 'buy', '🏦 ธนาคาร — ซื้อหุ้น' + (Game.suitsDone(p) ? '' : ' • สัญลักษณ์ ' + SUITS.map(function (k) { return p.suits[k] ? SUIT_GLYPH[k] : '·'; }).join(' ')));
        refresh();
      },
      debtSell: async function (p, need) {
        if (p.isAI) return 'auto';
        refresh(); sfx('bad');
        return debtUI(p);
      },
      broker: async function (p) { if (p.isAI) { await aiWait(300); await A.broker(g, p); refresh(); return; } await stockPanel(p, 'both', '📊 Stock Broker — ซื้อ/ขายหุ้น'); refresh(); },
      promotion: async function (p, sal) {
        if (U.tut && !p.isAI) await Tutorial.event('promo');
        sfx('win');
        if (p.isAI) { toast('🎉 ' + esc(p.name) + ' เลื่อนเป็น Lv' + p.level + ' รับเงินเดือน ' + fmt(sal) + ' G'); floatText(p, sal); await aiWait(500); return; }
        var pv = g.propertyValue(p);
        await modal({ title: '🎉 เลื่อนระดับเป็น Lv' + p.level + '!', body: '<div class="kv" style="min-width:420px"><span>เงินเดือนพื้นฐาน</span><b>' + CONFIG.baseSalary + '</b><span>ระดับ ' + (p.level - 1) + ' × ' + fmt(CONFIG.salaryPerLevel) + '</span><b>' + fmt((p.level - 1) * CONFIG.salaryPerLevel) + '</b><span>10% ของมูลค่าร้าน (' + fmt(pv) + ')</span><b>' + fmt(Math.floor(pv * CONFIG.salaryPropPct)) + '</b><span>รวมเงินเดือน (รวมโบนัส)</span><b style="color:#2c8a2c">+' + fmt(sal) + ' G</b></div><div style="text-align:center;margin-top:6px;font-weight:800">สัญลักษณ์ถูกล้าง เริ่มเก็บรอบใหม่!</div>', buttons: [{ t: 'เยี่ยม!', v: 1, cls: 'green' }] });
        floatText(p, sal);
      },
      suit: async function (p, suit) {
        if (U.tut && !p.isAI) await Tutorial.event('suit'); sfx('card'); renderPlayers(); toast('<span style="color:' + SUIT_COLOR[suit] + ';font-size:22px">' + SUIT_GLYPH[suit] + '</span> ' + esc(p.name) + ' เก็บสัญลักษณ์!', 1200); },
      built: async function (p, t, oldLv) {
        if (U.tut && !p.isAI && t.district >= 0 && g.ownedIn(p.id, t.district) >= 2) await Tutorial.event('district');
        if (U.tut && !p.isAI && t.type === 'shop' && g.chainLen(t) >= 2) await Tutorial.event('chain'); sfx('build'); refresh(); if (oldLv !== undefined && t.level > oldLv) toast('✨ ' + esc(t.name) + ' ขยายเป็น ' + CONFIG.levelName[t.level] + '!', 2000); var el = document.getElementById('t' + t.id); if (el) { el.classList.add('hl'); setTimeout(function () { el.classList.remove('hl'); }, 900); } await wait(300); },
      pickCard: async function (p, grid) {
        if (U.tut && !p.isAI) await Tutorial.event('card');
        var title = '🃏 ' + esc(p.name) + ' เลือกการ์ด 1 ใบจากตาราง 100 ช่อง';
        var body = cardGridHTML(grid, null) + '<div style="text-align:center;font-weight:800;margin-top:6px">เหลือ ' + grid.filter(function (x) { return !x; }).length + ' ใบ • เปิดการ์ดให้สีของคุณเรียงเป็นแถว (แนวนอน/ตั้ง/ทแยง) ตั้งแต่ 3 ช่องขึ้นไปรับโบนัส!</div>';
        if (p.isAI) {
          var pick = A.pickCard(g, p, grid);
          return modal({ title: title, width: 760, body: body, close: false, auto: 900, autoValue: pick, mount: function (box) { var e = box.querySelector('[data-c="' + pick + '"]'); if (e) e.classList.add('pick'); } });
        }
        return modal({ title: title, width: 760, body: body, close: false, mount: function (box, close) { box.querySelectorAll('[data-c]:not(.used)').forEach(function (e) { e.onclick = function () { e.classList.add('pick'); sfx('card'); setTimeout(function () { close(+e.dataset.c); }, 250); }; }); } });
      },
      showCard: async function (p, c, cell) {
        var catColor = { A: '#f4b400', B: '#ff8a65', C: '#8d6e63', D: '#29b6f6', E: '#66bb6a', F: '#ab47bc', G: '#ef5350', H: '#5c6bc0', I: '#ec407a', J: '#26a69a' }[c.cat];
        var art = ['card' + (1 + Math.floor(c.art / 25)), c.art % 25];
        var BK = { 71: 'rentShield', 74: 'insurance', 99: 'insurance', 77: 'shopProtect', 72: 'taxHalf', 78: 'maintFree', 79: 'taxExempt', 60: 'freeRide', 64: 'rentHalf', 19: 'newBranch', 86: 'winterSale', 22: 'builderDisc', 23: 'freeUpgrade', 34: 'hotelDisc', 24: 'vacantDisc', 63: 'buyoutDisc', 69: 'buyoutDisc', 17: 'upgDisc', 25: 'maintHalf' }[c.id];
        var bdef = BK && BUFFS.find(function (x) { return x[0] === BK; });
        var banner = bdef ? '<div class="skillban">✨ ได้สกิลใช้ครั้งเดียว: ' + bdef[1] + ' ' + bdef[2] + (p.flags[BK] ? '<br><span style="color:#d0342c">🔁 มีสกิลนี้อยู่แล้ว — ใบใหม่จะแทนที่ใบเดิม (ไม่สะสม)</span>' : '') + '</div>' : '';
        var html = banner + '<div class="cardFace" style="border-color:' + catColor + '"><div class="cat" style="background:' + catColor + '">หมวด ' + c.cat + ' • ' + CARD_CATS[c.cat] + '</div><div class="art">' + spr(art, 210, 200) + '</div><div class="nm">' + c.name + '</div><div class="ds">' + c.desc + '</div><div class="id">Card ID: C' + String(c.id).padStart(3, '0') + (cell !== undefined ? ' • ช่อง ' + (Math.floor(cell / 10) + 1) + '-' + (cell % 10 + 1) : '') + (c.neg ? ' • ผลเสีย' : '') + '</div></div>';
        sfx(c.neg ? 'bad' : 'card');
        await modal({ title: esc(p.name) + ' ได้การ์ด', body: html, buttons: [{ t: 'ตกลง', v: 1, cls: 'green' }], auto: p.isAI ? 2200 : 0, close: false });
      },
      choose: function (p, req) {
        if (p.isAI) return aiWait(300).then(function () { return A.choose(g, p, req); });
        if (req.kind === 'shop' || req.kind === 'tile' || req.kind === 'district') return boardChoose(g, p, req);
        var cancel = req.kind === 'shop' || req.kind === 'player';
        return modal({ title: req.title, width: 760, close: cancel, xValue: null, bgClose: false, body: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + req.options.map(function (o, i) { return '<div class="opt" data-o="' + i + '"><span class="sw" style="background:' + (o.color || '#fff') + '"></span><div class="col" style="gap:0"><span>' + esc(o.label) + '</span>' + (o.sub ? '<span style="font-size:12px;font-weight:700">' + esc(o.sub) + '</span>' : '') + '</div></div>'; }).join('') + '</div>', mount: function (box, close) { box.querySelectorAll('[data-o]').forEach(function (e) { e.onclick = function () { close(req.options[+e.dataset.o].value); }; }); } });
      },
      chooseNumber: function (p, title, a, b) {
        if (p.isAI) return Promise.resolve(A.chooseNumber(g, p, title, a, b));
        var nums = []; for (var i = a; i <= b; i++) nums.push(i);
        return modal({ title: title, close: false, body: '<div class="row" style="gap:10px;justify-content:center">' + nums.map(function (n) { return '<div class="opt" data-n="' + n + '" style="width:92px;justify-content:center">' + (n <= 6 ? spr(['dice', 6 + n], 70, 70) : '<b style="font-size:40px">' + n + '</b>') + '</div>'; }).join('') + '</div>', mount: function (box, close) { box.querySelectorAll('[data-n]').forEach(function (e) { e.onclick = function () { close(+e.dataset.n); }; }); } });
      },
      confirmUse: function (p, def, ctx) {
        if (p.isAI) { var r = A.confirmUse(g, p, def, ctx); if (r) toast('🎒 ' + esc(p.name) + ' ใช้ ' + def.name); return Promise.resolve(r); }
        var why = ctx.rent ? 'ค่าเช่า ' + fmt(ctx.rent) + ' G' : ctx.amt ? fmt(ctx.amt) + ' G' : ctx.roll ? 'แต้มลูกเต๋า ' + ctx.roll : ctx.cost !== undefined ? 'ค่าอัปเกรด ' + fmt(ctx.cost) + ' G' : ctx.price ? 'ราคาร้าน ' + fmt(ctx.price) + ' G' : ctx.card ? 'การ์ด ' + ctx.card.name : '';
        return modal({ title: '🎒 ใช้ ' + def.name + '?', body: '<div class="col" style="align-items:center;min-width:420px">' + spr(def.spr, 120, 100) + '<div style="font-weight:800;font-size:17px">' + def.th + '</div><div class="chip">สถานการณ์: ' + why + '</div><div class="muted" style="font-size:13px">ใช้ได้ 1 ครั้งต่อเกม</div></div>', buttons: [{ t: 'ใช้เลย', v: true, cls: 'green' }, { t: 'เก็บไว้ก่อน', v: false }] }).then(function (v) { if (v) { sfx('coin'); setTimeout(function () { consumeUsed(g); renderItems(); }, 50); } return v; });
      },
      confirmDeal: function (q, text, v) {
        if (q.isAI) return aiWait(300).then(function () { var r = A.confirmDeal(g, q, text, v); toast(esc(q.name) + (r ? ' ✅ ตกลง' : ' ❌ ปฏิเสธ') + ': ' + esc(text)); return r; });
        return modal({ title: '📨 ข้อเสนอถึง ' + esc(q.name), body: '<div style="text-align:center;font-weight:800;font-size:18px">' + esc(text) + '</div>', buttons: [{ t: 'ตกลง', v: true, cls: 'green' }, { t: 'ปฏิเสธ', v: false, cls: 'pink' }], close: false });
      },
      auctionBid: function (q, t, cur) {
        if (q.isAI) return Promise.resolve(A.auctionBid(g, q, t, cur));
        var steps = [1.1, 1.3, 1.6].map(function (m) { return Math.round(cur * m / 10) * 10; }).filter(function (v) { return v <= q.cash; });
        return modal({ title: '🔨 ประมูล ' + t.name + ' — ' + esc(q.name), body: '<div style="text-align:center;font-weight:800">ราคาปัจจุบัน ' + fmt(cur) + ' G • มูลค่า ' + fmt(g.shopValue(t)) + ' G • เงินสดของคุณ ' + fmt(q.cash) + ' G</div>', buttons: steps.map(function (v) { return { t: 'เสนอ ' + fmt(v), v: v, cls: 'green' }; }).concat([{ t: 'ไม่เสนอ', v: 0 }]), close: false });
      },
      bkEvent: function (p, idx, dodged) {
        var ev = BKK_EVENTS[idx]; sfx(ev.bad ? 'bad' : 'coin');
        return modal({ title: '🏙️ อีเวนต์กรุงเทพฯ — ' + esc(p.name), width: 720, close: false, body: '<div class="bkevpop">' + spr(['bkev', idx], 660, 365) + '</div><div style="text-align:center;font-weight:900;font-size:22px;margin-top:8px">' + esc(ev.name) + '</div><div style="text-align:center;font-weight:700;font-size:16px">' + esc(ev.desc) + '</div>' + (dodged ? '<div style="text-align:center;font-weight:900;color:#2e7d32;font-size:18px;margin-top:4px">🛡️ สกิลตัวละครหลบอีเวนต์ร้ายได้!</div>' : ''), buttons: [{ t: 'ตกลง', v: 1, cls: 'green' }], auto: p.isAI ? 2200 : 0 });
      },
      casinoBet: function (p, bets) {
        if (p.isAI) return Promise.resolve(A.casinoBet(g, p, bets));
        var sel = bets[Math.min(1, bets.length - 1)], bg = MAPS[g.s.mapIdx].bkk ? 'bg_bkcasino' : 'bg_casino';
        return modal({ title: '🎲 คาสิโน — แทงสูง/ต่ำ ลูกเต๋า 3 ลูก', width: 960, close: false, body: '<div class="hlwrap" style="background-image:url(assets/' + bg + '.webp)"><div class="hlrule">🔺 สูง = 11–18 &nbsp;•&nbsp; 🔻 ต่ำ = 3–10 &nbsp;•&nbsp; ทายถูกได้ x2 &nbsp;•&nbsp; ออกตอง (3 ลูกเหมือนกัน) เจ้ามือกิน</div></div>' +
          '<div style="text-align:center;font-weight:800;margin:8px 0 4px">เลือกจำนวนเงินเดิมพัน • เงินสด ' + fmt(p.cash) + ' G</div><div class="hlchips">' + bets.map(function (b) { return '<button class="hlchip' + (b === sel ? ' on' : '') + '" data-bet="' + b + '">' + fmt(b) + '</button>'; }).join('') + '</div>' +
          '<div class="row" style="justify-content:center;gap:16px;margin-top:10px"><button class="hlbtn hi" data-side="hi">🔺 แทงสูง<small>11–18</small></button><button class="hlbtn lo" data-side="lo">🔻 แทงต่ำ<small>3–10</small></button></div>', buttons: [{ t: 'ไม่เล่น', v: 0, cls: 'gray' }],
          mount: function (box, close) {
            box.querySelectorAll('[data-bet]').forEach(function (e) { e.onclick = function () { sel = +e.dataset.bet; box.querySelectorAll('[data-bet]').forEach(function (x) { x.classList.toggle('on', x === e); }); sfx('tap'); }; });
            box.querySelectorAll('[data-side]').forEach(function (e) { e.onclick = function () { close({ bet: sel, side: e.dataset.side }); }; });
          } });
      },
      casinoShow: function (p, dice, bet, win, side, refund) {
        var bg = MAPS[g.s.mapIdx].bkk ? 'bg_bkcasino' : 'bg_casino', sum = dice[0] + dice[1] + dice[2], triple = dice[0] === dice[1] && dice[1] === dice[2];
        return modal({ title: '🎲 ' + esc(p.name) + ' แทง' + (side === 'hi' ? 'สูง 🔺' : 'ต่ำ 🔻') + ' ' + fmt(bet) + ' G', width: 960, close: false, body: '<div class="hlwrap" style="background-image:url(assets/' + bg + '.webp)"><div class="hldome"><div class="hldie" id="hd0"></div><div class="hldie" id="hd1"></div><div class="hldie" id="hd2"></div></div></div><div id="cres" class="hlres">กำลังเขย่า...</div>', buttons: [{ t: 'ตกลง', v: 1, cls: 'green' }], auto: p.isAI ? 3000 : 0,
          mount: function (box) {
            var k = 0, els = [0, 1, 2].map(function (i) { return box.querySelector('#hd' + i); });
            els.forEach(function (e) { e.classList.add('spin'); });
            var iv = setInterval(function () {
              els.forEach(function (e, i) { if (!e) return; if (k < 14 + i * 4) e.innerHTML = dieFace(1 + Math.floor(Math.random() * 6)); else if (e.classList.contains('spin')) { e.classList.remove('spin'); e.classList.add('land'); e.innerHTML = dieFace(dice[i]); sfx('tap'); } });
              k++; if (k % 3 === 0) sfx('dice');
              if (k > 24) {
                clearInterval(iv); var r = box.querySelector('#cres'), hi = sum >= 11;
                if (r) r.innerHTML = '<span class="hlsum ' + (hi ? 'hi' : 'lo') + '">' + dice.join(' + ') + ' = ' + sum + ' → ' + (triple ? 'ตอง! เจ้ามือกิน' : hi ? 'สูง 🔺' : 'ต่ำ 🔻') + '</span><br>' + (win && !refund ? '🎉 ชนะ! รับ ' + fmt(win) + ' G (กำไร +' + fmt(win - bet) + ')' : refund ? '🍀 สกิลตัวละครคืนเงินเดิมพัน ' + fmt(win) + ' G' : '💸 เสียเดิมพัน ' + fmt(bet) + ' G');
                sfx(win && !refund ? 'win' : 'bad'); if (win && !refund) box.querySelector('.hlwrap').classList.add('winfx');
              }
            }, 90);
          } });
      },
      chooseSpecialHouse: async function (p, t, opts) {
        if (U.tut && !p.isAI) await Tutorial.event('special');
        if (p.isAI) return aiWait(350).then(function () { var r = A.chooseSpecialHouse(g, p, t, opts); if (r) toast('🏰 ' + esc(p.name) + ' สร้าง ' + SPECIAL_BUILDINGS.find(function (b) { return b.id === r; }).th); return r; });
        return modal({ title: '🏰 สร้างบ้านพิเศษ', width: 1000, xValue: null, body: '<div style="text-align:center;font-weight:700;margin-bottom:8px">เลือก 1 แบบ — ใครมาตก/เดินผ่านจะโดนเอฟเฟกต์ของบ้าน • เงินสด ' + fmt(p.cash) + ' G</div><div class="sphgrid">' + opts.map(function (o) { var ok = o.cost <= p.cash; return '<div class="sphopt ' + (ok ? '' : 'dimo') + '" data-sb="' + o.b.id + '">' + spr(o.b.spr, 170, 160) + '<b>' + o.b.th + '</b><span>' + o.b.desc + '</span><div class="coin" style="font-size:18px">' + fmt(o.cost) + '</div></div>'; }).join('') + '</div>', buttons: [{ t: 'ยังไม่สร้าง', v: null, cls: 'gray' }],
          mount: function (box, close) { box.querySelectorAll('[data-sb]').forEach(function (e) { e.onclick = function () { if (e.classList.contains('dimo')) { toast('เงินไม่พอ'); return; } close(e.dataset.sb); }; }); } });
      },
      portalChoice: function (p, owner, t, big, small, buyCost) {
        if (owner.id === p.id) {
          if (p.isAI) return aiWait(400).then(function () { var r = A.portalChoice(g, p, owner, t, 0, 0); if (r) toast('🌀 ' + esc(p.name) + ' วาร์ปฟรีด้วยประตูของตัวเอง!'); return r; });
          return modal({ title: '🌀 ประตูทะลุมิติของคุณเอง', width: 640, close: false, body: '<div class="row" style="gap:16px;align-items:center">' + spr(['sph', 0], 160, 160) + '<div style="font-weight:700;font-size:17px;line-height:1.7">เจ้าของประตูวาร์ปได้ <b style="color:#2c8a2c">ฟรี!</b><br>วาร์ปไปช่องไหนก็ได้ในแผนที่ แล้วได้ผลของช่องนั้นตามปกติ</div></div>', buttons: [{ t: '🌀 วาร์ปฟรี', v: true, cls: 'purple' }, { t: 'อยู่ที่นี่', v: false }] });
        }
        if (p.isAI) return aiWait(400).then(function () { var r = A.portalChoice(g, p, owner, t, big, small, buyCost); toast('🌀 ' + esc(p.name) + (r === 'buy' ? ' ซื้อบ้านประตูทะลุมิติ ' + fmt(buyCost) + ' G!' : r ? ' จ่าย ' + fmt(big) + ' G แล้ววาร์ป!' : ' จ่าย ' + fmt(small) + ' G (ไม่วาร์ป)')); return r; });
        return modal({ title: '🌀 ประตูทะลุมิติของ ' + esc(owner.name), width: 680, close: false, body: '<div class="row" style="gap:16px;align-items:center">' + spr(['sph', 0], 160, 160) + '<div style="font-weight:700;font-size:17px;line-height:1.7">วาร์ปไปช่องไหนก็ได้ในแผนที่!<br>• วาร์ป: จ่าย <b style="color:#d0342c">' + fmt(big) + ' G</b> (10% ของทรัพย์สิน)<br>• ไม่วาร์ป: จ่าย <b style="color:#d0342c">' + fmt(small) + ' G</b> (5%)<br>• 🏠 ซื้อบ้านนี้: จ่าย <b style="color:#d0342c">' + fmt(buyCost) + ' G</b> (20% ของทรัพย์สิน) ให้เจ้าของ แล้วบ้านเป็นของเรา</div></div>', buttons: [{ t: '🌀 วาร์ป (' + fmt(big) + ' G)', v: true, cls: 'purple' }, { t: '🏠 ซื้อบ้าน (' + fmt(buyCost) + ' G)', v: 'buy', cls: 'pink' }, { t: 'ไม่วาร์ป (' + fmt(small) + ' G)', v: false }] });
      },
      rollTwo: function (p, pre) {
        if (p.isAI) return this.showTwo(p, pre).then(function () { return pre; });
        var self = this;
        return new Promise(function (resolve) {
          var L = $('#diceLayer'); L.classList.add('on', 'tap'); L.innerHTML = '<div class="two"><div id="spinA"></div><div id="spinB"></div></div><div class="tapmsg">' + (g.s.train && g.s.train.phase ? '🚂 แตะเพื่อทอยลูกเต๋า 2 ลูก ขับรถไฟ!' : '🎲🎲 แตะเพื่อทอยลูกเต๋า 2 ลูก!') + '</div>';
          setAct('<div style="font-size:17px">🚂 คุณได้ขับรถไฟ! แตะลูกเต๋า</div>');
          var a = spinner(L.querySelector('#spinA'), 140, diceTint(p)), b = spinner(L.querySelector('#spinB'), 140, diceTint(p)), done = false;
          L.onclick = async function () {
            if (done) return; done = true; L.classList.remove('tap'); var m = L.querySelector('.tapmsg'); if (m) m.remove();
            a.stop(pre[0]); setTimeout(function () { b.stop(pre[1]); }, 180);
            try { await wait(1100); } catch (e) { }
            L.insertAdjacentHTML('beforeend', '<div class="dresult">' + pre[0] + ' + ' + pre[1] + ' = ' + (pre[0] + pre[1]) + '!</div>');
            try { await wait(800); } catch (e) { }
            L.classList.remove('on'); L.innerHTML = ''; L.onclick = null;
            setAct('<div>🚂 ' + esc(p.name) + ' ขับรถไฟ ' + (pre[0] + pre[1]) + ' ช่อง!</div>'); resolve(pre);
          };
        });
      },
      showTwo: async function (p, pre) {
        setAct('<div>🚂 ' + esc(p.name) + ' ทอยลูกเต๋า 2 ลูก...</div>');
        var L = $('#diceLayer'); L.classList.add('on'); L.innerHTML = '<div class="two"><div id="spinA"></div><div id="spinB"></div></div>';
        var a = spinner(L.querySelector('#spinA'), 130, diceTint(p)), b = spinner(L.querySelector('#spinB'), 130, diceTint(p));
        await wait(650); a.stop(pre[0]); await wait(150); b.stop(pre[1]); await wait(900);
        L.insertAdjacentHTML('beforeend', '<div class="dresult">' + pre[0] + ' + ' + pre[1] + ' = ' + (pre[0] + pre[1]) + '!</div>'); await wait(600);
        L.classList.remove('on'); L.innerHTML = '';
        setAct('<div>🚂 ' + esc(p.name) + ' ขับรถไฟ ' + (pre[0] + pre[1]) + ' ช่อง</div>');
      },
      trainPhase: async function (on) {
        refresh();
        if (!on) { toast('🚃 จบรอบขับรถไฟ — กลับมาเล่นปกติ', 2200); await wait(600); return; }
        var ov = document.createElement('div'); ov.className = 'trainintro'; ov.innerHTML = '<img src="assets/train.webp" draggable="false"><div><b>🚂 รอบขับรถไฟ!</b><br>ทุกคนได้ขับคนละ 1 ตา • ลูกเต๋า 2 ลูก<br>ขับผ่านใคร = ชน! 💥</div>';
        $('#game').appendChild(ov); sfx('win'); await wait(2300 / Math.max(1, U.speed)); ov.remove();
      },
      trainCrash: async function (p, q, info) {
        var s = g.s, txt = info.kind === 'dodge' ? '🛡️ หลบทัน! ไม่เสียอะไร' : info.kind === 'cash' ? '💸 เงินหล่น ' + fmt(info.amt) + ' G' + (info.loot ? '<br><small>' + esc(p.name) + ' เก็บได้ ' + fmt(info.loot) + ' G</small>' : '') : info.kind === 'suit' ? '🃏 ดอก ' + SUIT_GLYPH[info.suit] + ' กระเด็นหาย' : info.kind === 'card' ? '🎴 “' + esc(info.item) + '” หล่นหาย' : info.kind === 'skill' ? '😵 สกิล “' + esc(info.skill) + '” ใช้ไม่ได้ ' + TRAIN.noSkillRounds + ' รอบ' : '💥 กระเด็น!';
        var el = document.getElementById('pc' + q.id); if (el) { el.classList.remove('crashed'); void el.offsetWidth; el.classList.add('crashed'); }
        var pop = document.createElement('div'); pop.className = 'eggpop crashpop';
        pop.innerHTML = '<div style="font-size:46px">💥</div><div><b>' + esc(p.name) + ' 🚂 ชน ' + esc(q.name) + '!</b><br>' + txt + (info.kind !== 'dodge' ? '<br><small>กระเด็นกลับสถานี</small>' : '') + '</div>';
        $('#game').appendChild(pop); sfx(info.kind === 'dodge' ? 'coin' : 'bad'); var bw = $('#boardWrap'); if (bw) { bw.classList.remove('shake'); void bw.offsetWidth; bw.classList.add('shake'); }
        setTimeout(function () { pop.remove(); if (el) el.classList.remove('crashed'); }, 2300 / Math.max(1, U.speed));
        refresh(); await wait(1500);
      },
      ticket: async function (p) {
        var pop = document.createElement('div'); pop.className = 'eggpop gold'; pop.innerHTML = '<img src="assets/ticket.webp" style="height:70px" draggable="false"><div><b>🎫 ' + esc(p.name) + ' ได้ตั๋วรถไฟทอง!</b><br><small>รวม ' + (p.tickets || 0) + ' ใบในเกมนี้</small></div>';
        $('#game').appendChild(pop); sfx('win'); setTimeout(function () { pop.remove(); }, 2600); await wait(1500);
      },
      prankRoll: async function (p, kind) {
        toast('🎁 กล่องแกล้ง: ' + { swap: 'สลับตำแหน่ง!', back: 'ส่งกลับสถานี!', steal: 'แอบหยิบเงิน 5%!' }[kind], 2200); sfx('card'); await wait(700);
      },
      bunnyArrive: async function (pos) {
        refresh(); sfx('win'); var b = document.getElementById('bunny'); if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
        centerOnTile(pos, true); toast('🐰 กระต่ายอีสเตอร์โผล่มาแล้ว! จะอยู่ ' + EASTER.bunnyStay + ' รอบ คอยวางไข่ทั่วแผนที่', 2800);
        await wait(1300);
      },
      bunnyMove: async function (roll, path) {
        var s = g.s, b = document.getElementById('bunny'), d = document.getElementById('bDice'), T = BT;
        if (d) { d.textContent = '🎲 ' + roll; d.classList.add('on'); }
        sfx('dice'); await wait(500);
        for (var i = 0; i < path.length; i++) {
          var t = s.tiles[path[i]]; if (b) { b.style.display = 'block'; b.style.left = (t.x * SC - T * 1.45) + 'px'; b.style.top = (t.y * SC - T * 1.45) + 'px'; b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop'); }
          sfx('step'); await wait(230);
        }
        if (d) d.classList.remove('on');
      },
      eggLaid: async function (pos, kind) {
        refresh(); var e = document.getElementById('egg' + pos); if (e) e.classList.add('new');
        sfx('coin'); await wait(450);
      },
      bunnyLeave: async function () {
        var b = document.getElementById('bunny'); if (b) b.classList.add('bye');
        toast('🐰 กระต่ายอีสเตอร์กลับบ้านแล้ว — จะกลับมาอีกใน ' + EASTER.bunnyCool + ' รอบ', 2500);
        await wait(900); if (b) b.classList.remove('bye'); refresh();
      },
      egg: async function (p, rw, tid) {
        var s = g.s, txt = rw.kind === 'cash' ? '💰 +' + fmt(rw.amt) + ' G' : rw.kind === 'stock' ? '📈 หุ้นฟรี ' + esc(s.districts[rw.d].th) + ' ' + rw.n + ' หุ้น' : rw.kind === 'suit' ? '🃏 ได้ดอก ' + SUIT_GLYPH[rw.suit] : rw.kind === 'more' ? '🥚 ไข่แถมอีก ' + rw.extra + ' ฟอง!' : '🏠 ' + esc(s.tiles[rw.tile].name) + ' มูลค่า +' + (rw.golden ? 20 : 10) + '%';
        var pop = document.createElement('div'); pop.className = 'eggpop' + (rw.golden ? ' gold' : '');
        pop.innerHTML = spr(['eggs', rw.golden ? 1 : 0], 70, 76) + '<div><b>' + esc(p.name) + ' เก็บ' + (rw.golden ? 'ไข่ทอง' : 'ไข่อีสเตอร์') + ' +' + rw.cnt + ' ฟอง</b><br>' + txt + '<br><small>รวม 🥚 ' + (p.eggs || 0) + ' ฟอง</small></div>';
        $('#game').appendChild(pop); sfx(rw.golden ? 'win' : 'coin'); refresh();
        if (rw.kind === 'boost') { var el = document.getElementById('t' + rw.tile); if (el) { el.classList.add('cfx'); setTimeout(function () { el.classList.remove('cfx'); }, 3000); } }
        setTimeout(function () { pop.remove(); }, 2300 / Math.max(1, U.speed));
        await wait(p.isAI ? 900 : 1400);
      },
      cardFx: async function (p, tiles, dists) {
        var s = g.s, ids = tiles.slice();
        dists.forEach(function (i) { (s.districts[i].tiles || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); }); });
        if (!ids.length) return;
        var names = tiles.filter(function (i) { return s.tiles[i].name; }).slice(0, 3).map(function (i) { return s.tiles[i].name; }).concat(dists.slice(0, 3).map(function (i) { return 'เขต' + s.districts[i].th; }));
        ids.forEach(function (id) { var e = document.getElementById('t' + id); if (e) { e.classList.remove('cfx'); void e.offsetWidth; e.classList.add('cfx'); } });
        if (ids.length === 1) centerOnTile(ids[0], true); else fitCam(true);
        toast('🃏 การ์ดมีผลกับ: ' + names.join(', ') + (tiles.length + dists.length > 6 ? ' ...' : '') + ' (ช่องที่กระพริบ)', 3200);
        setTimeout(function () { ids.forEach(function (id) { var e = document.getElementById('t' + id); if (e) e.classList.remove('cfx'); }); }, 3600);
        await wait(p.isAI ? 900 : 1700);
      },
      pickTile: function (p, title, ids) {
        if (p.isAI) return aiWait(400).then(function () { return A.pickTile(g, p, title, ids); });
        return new Promise(function (resolve) {
          setAct('<div style="font-size:17px">' + title + '</div><div class="lp">แตะช่องที่กระพริบบนแผนที่</div>');
          ids.forEach(function (id) { var e = document.getElementById('t' + id); if (e) e.classList.add('dest'); });
          fitCam(true); toast('👆 แตะช่องบนแผนที่เพื่อวาร์ป', 2500);
          U.planTap = function (id) { if (ids.indexOf(id) < 0) return false; ids.forEach(function (x) { var e = document.getElementById('t' + x); if (e) e.classList.remove('dest'); }); U.planTap = null; sfx('card'); resolve(id); return true; };
        });
      },
      party: async function (p, owner, t) {
        sfx('win');
        await modal({ title: '🎉 ปาร์ตี้ที่บ้านของ ' + esc(owner.name) + '!', width: 700, close: false, body: '<div style="text-align:center">' + spr(['sph', 1], 180, 180) + '<div style="font-weight:700;font-size:18px">' + (p.id === owner.id ? esc(owner.name) + ' จัดปาร์ตี้ที่บ้านตัวเอง' : esc(p.name) + ' ตกบ้านปาร์ตี้') + ' — ทุกคนถูกเรียกมารวมกันที่นี่!<br>ทุกคน (ยกเว้นเจ้าของ) จ่ายคนละ 100 G</div><div class="row" style="justify-content:center;gap:6px;margin-top:6px">' + g.alive().map(function (q) { return spr(charSpec(q), 70, 70); }).join('') + '</div></div>', buttons: [{ t: 'ไปปาร์ตี้!', v: 1, cls: 'pink' }], auto: p.isAI ? 2200 : 0 });
      },
      wheel: async function (p, k) {
        var W = CONFIG.wheel, lab = function (o) { return o[1] === 'g' ? '+' + fmt(o[2]) : o[1] === 'l' ? '-' + fmt(o[2]) : { card: '🃏 การ์ด', again: '🎲 ทอยต่อ', stock: '📈 หุ้น 5', warp: '🌀 วาร์ป' }[o[1]]; };
        var n = W.length, seg = 360 / n, cols = ['#ff8fb3', '#ffd54f', '#7cc0ff', '#a5d6a7', '#ce93d8', '#ffab91'];
        var grad = W.map(function (o, i) { return cols[i % cols.length] + ' ' + (i * seg) + 'deg ' + ((i + 1) * seg) + 'deg'; }).join(',');
        var labels = W.map(function (o, i) { var a = (i + 0.5) * seg; return '<div class="wlab" style="transform:rotate(' + a + 'deg) translateY(-108px) rotate(' + (-a) + 'deg)">' + lab(o) + '</div>'; }).join('');
        var final = 360 * 5 + (360 - (k + 0.5) * seg);
        sfx('dice');
        var html = '<div style="text-align:center"><div class="wheelwrap"><div class="wheelptr">▼</div><div class="wheel" style="background:conic-gradient(' + grad + ')">' + labels + '</div></div><div id="wres" style="font-weight:900;font-size:24px;min-height:34px;margin-top:8px"></div></div>';
        var dur = p.isAI ? 1400 : 2400;
        await modal({ title: '🎡 วงล้อเสี่ยงโชค — ' + esc(p.name), width: 560, close: false, body: html, auto: dur + 1400, autoValue: 1, mount: function (box) {
          var wh = box.querySelector('.wheel'); wh.style.transition = 'transform ' + (dur / U.speed / 1000) + 's cubic-bezier(.15,.8,.2,1)';
          requestAnimationFrame(function () { requestAnimationFrame(function () { wh.style.transform = 'rotate(' + final + 'deg)'; }); });
          setTimeout(function () { var r = box.querySelector('#wres'); if (r) r.innerHTML = 'ได้: ' + lab(W[k]); sfx(W[k][1] === 'l' ? 'bad' : 'coin'); }, dur / U.speed);
        } });
      },
      dragonBet: function (p, pot, opts) {
        if (p.isAI) return aiWait(400).then(function () { var r = A.dragonBet(g, p, pot, opts); toast(r ? '⚔️ ' + esc(p.name) + ' พนัน ' + fmt(r) + ' G โจมตีมังกร!' : '🏰 ' + esc(p.name) + ' ไม่สู้มังกร'); return r; });
        sfx('tap');
        return modal({ title: '🐉 ป้อมสู้มังกร!', width: 820, close: false, bgClose: false, body: '<div class="row" style="gap:16px;align-items:center"><img src="assets/dragon.webp" style="width:230px;filter:drop-shadow(0 6px 6px rgba(0,0,0,.3))" draggable="false"><div class="grow" style="text-align:center"><div style="font-weight:800;font-size:16px">เงินสะสมในรังมังกร</div><div class="dragonpot">💰 ' + fmt(pot) + ' G</div><div style="font-weight:700;font-size:14px;line-height:1.6">วางเดิมพันแล้วโจมตี! ถ้า<b style="color:#2c8a2c">โดน</b> ได้เงินสะสมทั้งหมด + เงินเดิมพันคืน<br>ถ้า<b style="color:#d0342c">พลาด</b> เงินเดิมพันเข้ากองสะสม และโดนลมมังกรพัดกระเด็นไปช่องอื่น!</div></div></div>', buttons: CONFIG.dragon.bets.map(function (b) { var ok = opts.indexOf(b) >= 0; return { t: '⚔️ ' + fmt(b) + ' G<br><small>โอกาสโดน ' + Math.round(g.dragonChance(b) * 100) + '%</small>', v: b, cls: ok ? 'pink' : 'gray', dis: !ok }; }).concat([{ t: '🏃 ไม่สู้', v: 0 }]) });
      },
      dragonResult: async function (p, r) {
        refreshTiles();
        if (r.win) { sfx('win'); floatText(p, r.prize); }
        else { sfx('bad'); floatText(p, -r.bet); }
        var body = '<div style="text-align:center"><img src="assets/dragon.webp" class="' + (r.win ? 'dragonhit' : 'dragonroar') + '" style="width:220px" draggable="false"><div style="font-weight:800;font-size:22px;margin-top:6px">' + (r.win ? '⚔️ ' + esc(p.name) + ' โจมตีโดนมังกร!<div class="dragonpot">+' + fmt(r.prize) + ' G</div><div style="font-size:15px">ได้เงินสะสมทั้งหมดไป! กองใหม่เริ่มที่ ' + fmt(r.pot) + ' G</div>' : '💨 พลาด! มังกรพ่นลมใส่ ' + esc(p.name) + '<div style="font-size:16px;font-weight:700">เสีย ' + fmt(r.bet) + ' G • เงินสะสมตอนนี้ <b style="color:#d0342c">' + fmt(r.pot) + ' G</b><br>ถูกพัดกระเด็นไปที่ ' + esc(g.tile(r.dest).name || 'ช่องอื่น') + '!</div>') + '</div></div>';
        if (p.isAI) { toast(r.win ? '⚔️ ' + esc(p.name) + ' ล้มมังกรได้ +' + fmt(r.prize) + ' G!' : '💨 ' + esc(p.name) + ' โจมตีพลาด ถูกลมพัดกระเด็น! (สะสม ' + fmt(r.pot) + ' G)', 2400); await aiWait(700); return; }
        await modal({ title: r.win ? '🏆 ชนะมังกร!' : '🐉 มังกรรอดไปได้...', width: 640, close: false, body: body, buttons: [{ t: 'ตกลง', v: 1, cls: r.win ? 'green' : 'pink' }] });
      },
      windmill: async function (p, owner, t, lost, lostItems) {
        sfx('bad'); lostItems = lostItems || []; var tot = lost.length + lostItems.length;
        await modal({ title: '🌬️ บ้านกังหันลมของ ' + esc(owner.name), width: 680, close: false, body: '<div style="text-align:center">' + spr(['sph', 3], 160, 160) + '<div style="font-weight:700;font-size:18px">' + (tot ? 'ลมกังหันพัดการ์ดของ ' + esc(p.name) + ' ปลิวหายไป ' + tot + ' ใบ!<div class="windlost">' + lost.map(function (b) { return '<span>' + b[1] + ' ' + b[2] + '</span>'; }).concat(lostItems.map(function (n) { return '<span>' + esc(n) + '</span>'; })).join('') + '</div>' : esc(p.name) + ' ไม่มีการ์ดติดตัว — รอดตัว!') + '</div></div>', buttons: [{ t: 'ตกลง', v: 1 }], auto: p.isAI ? 2000 : 0 });
        refresh();
      },
      windSteal: async function (p, t, stolen) {
        sfx('coin'); refresh();
        stolen.forEach(function (x) { floatText(g.s.players[x.id], -x.amt); }); var tot = stolen.reduce(function (a, x) { return a + x.amt; }, 0); floatText(p, tot);
        var rows = stolen.map(function (x) { var q = g.s.players[x.id]; return '<div class="row" style="justify-content:center;gap:8px;font-weight:800"><span style="color:' + q.color + '">' + esc(q.name) + '</span><span style="color:#d0342c">-' + fmt(x.amt) + ' G</span></div>'; }).join('') || '<div class="muted">ไม่มีใครมีเงินให้ขโมย</div>';
        if (p.isAI) { toast('🌪️ ' + esc(p.name) + ' ใช้กังหันลมขโมยเงิน 5% จากทุกคน +' + fmt(tot) + ' G!', 2400); await aiWait(700); return; }
        await modal({ title: '🌪️ ลมกังหันของคุณพัดเงินมา!', width: 640, close: false, body: '<div style="text-align:center">' + spr(['sph', 3], 160, 160) + '<div style="font-weight:700;font-size:17px">เจ้าของตกบ้านกังหันลมของตัวเอง — ขโมยเงิน 5% จากผู้เล่นทุกคน</div>' + rows + '<div class="dragonpot" style="font-size:32px">+' + fmt(tot) + ' G</div></div>', buttons: [{ t: 'เยี่ยม!', v: 1, cls: 'green' }] });
      },
      toll: async function (p, owner, t, fee) { sfx('coin'); floatText(p, -fee); floatText(owner, fee); toast('🚧 ' + esc(p.name) + ' จ่ายค่าผ่านทาง ' + fmt(fee) + ' G ให้ ' + esc(owner.name) + ' (ครั้งหน้า ' + fmt((t.toll || 100) + 10) + ' G)', 2200); refreshTiles(); },
      chooseBuilding: function (p, t, opts) {
        if (p.isAI) return aiWait(300).then(function () { var r = A.chooseBuilding(g, p, t, opts); if (r) toast('🏗️ ' + esc(p.name) + ' สร้าง ' + SPECIAL_BUILDINGS.find(function (b) { return b.id === r; }).th); return r; });
        return modal({ title: '🌱 ที่ดินเปล่า — สร้างอาคารพิเศษ?', width: 900, body: '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">' + opts.map(function (o) { return '<div class="opt" data-b="' + o.b.id + '" style="flex-direction:column;text-align:center">' + spr(o.b.spr, 110, 90) + '<b>' + o.b.th + ' (' + o.b.name + ')</b><span style="font-size:12px">' + o.b.desc + '</span><span class="coin">' + fmt(o.cost) + '</span></div>'; }).join('') + '</div>', buttons: [{ t: 'ถือไว้ก่อน / ไม่สร้าง', v: null }], mount: function (box, close) { box.querySelectorAll('[data-b]').forEach(function (e) { e.onclick = function () { close(e.dataset.b); }; }); } });
      },
      lineBonus: function (p, run, bonus, cells) {
        sfx('win'); floatText(p, bonus);
        var html = cardGridHTML(g.s.grid, cells) + '<div style="text-align:center;font-weight:900;font-size:22px;margin-top:8px;color:' + p.color + '">🌈 แถวสี ' + esc(p.name) + ' ยาว ' + run + ' ช่อง! โบนัส +' + fmt(bonus) + ' G</div><div style="text-align:center;font-size:13px;font-weight:700">3 ช่อง 300 • 4 ช่อง 600 • 5 ช่อง 1,000 • 6 ช่อง 1,500 • ... • 10 ช่อง 5,000</div>';
        return modal({ title: '🌈 โบนัสแถวการ์ด!', width: 760, body: html, buttons: [{ t: 'เยี่ยม!', v: 1, cls: 'green' }], auto: p.isAI ? 1800 : 0 });
      },
      notify: function (p, title, body) { if (p.isAI) { toast(title, 3000); return wait(400); } return modal({ title: title, body: '<div style="text-align:center;font-weight:800;max-width:600px">' + esc(body) + '</div>', buttons: [{ t: 'ตกลง', v: 1 }] }); },
      info: function (p, t, msg) { if (p.isAI) return Promise.resolve(); toast('ℹ️ ' + msg, 2600); return wait(300); },
    };
    return io;
  }

  $('#spdBtn').onclick = function () { var i = SPEEDS.findIndex(function (x) { return x[0] === U.speed; }); U.speed = SPEEDS[(i + 1) % SPEEDS.length][0]; saveSettings(); $('#spdBtn').textContent = 'ความเร็ว: ' + speedLabel(); toast('ความเร็วเกม: ' + speedLabel(), 1200); };
  // ---------- save migration (older versions → current economy) ----------
  function migrate(st) {
    var C = CONFIG, counts = {};
    st.tiles.forEach(function (t) {
      if (t.type !== 'shop') return;
      var k = counts[t.district] = (counts[t.district] || 0); counts[t.district]++;
      if (!isFinite(t.base) || !t.base) t.base = Math.round((t.f || 1) * C.shopBase[k % C.shopBase.length] / 10) * 10;
      if (!isFinite(t.invest)) t.invest = t.owner >= 0 ? Math.round(t.base * ((C.levelRatio[Math.max(0, (t.level || 1) - 1)] || 1) - 1)) : 0;
      if (!isFinite(t.bonusVal)) t.bonusVal = 0; if (!isFinite(t.bonusPct)) t.bonusPct = 0;
    });
    st.settings = st.settings || {}; st.settings.rules = Object.assign({}, C.rules, st.settings.rules || {});
    st.players.forEach(function (p) { if (!isFinite(p.cash)) p.cash = 0; p.shares = p.shares.map(function (n) { return isFinite(n) ? n : 0; }); });
    var g = new Game(st, null);
    st.tiles.forEach(function (t) { g.refreshLevel(t); });
    st.districts.forEach(function (d, i) { if (!isFinite(d.adj)) d.adj = 1; d.price = Math.max(1, Math.round(g.fairPrice(i) * d.adj)); if (!d.hist || !d.hist.length) d.hist = [d.price]; });
    return st;
  }
  // ---------- game menu / save / load ----------
  $('#btnGameMenu').onclick = function () {
    if (modalOpen) return;
    modal({ title: 'เมนูเกม', body: '<div class="col" style="min-width:380px"><button class="green" data-m="save">💾 บันทึกเกม</button><button class="pink" data-m="cloud">☁️ เซฟคลาวด์ (ย้ายไปเล่นเครื่องอื่น)</button><button class="blue" data-m="guide">📖 คู่มือ</button><button data-m="settings">⚙️ ตั้งค่า (ความเร็ว/เสียง)</button><button class="pink" data-m="quit">🏠 ออกไปหน้าหลัก (บันทึกอัตโนมัติ)</button></div>', mount: function (box, close) { box.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { close(b.dataset.m); }; }); } })
      .then(function (v) {
        if (v === 'cloud') Sync.open(); else if (v === 'save') saveModal(); else if (v === 'guide') guideModal(); else if (v === 'settings') settingsModal().then(refresh);
        else if (v === 'quit') { if (U.online) { Online.leave(); } U.token++; U.g = null; $('#diceLayer').classList.remove('on'); show('menu'); }
      });
  };
  function slotMeta(k) { try { return JSON.parse(localStorage.getItem(k + '_meta') || 'null'); } catch (e) { return null; } }
  function saveModal() {
    var g = U.g; if (!g) return;
    var s = g.s;
    // snapshot = last autosave (start of current turn) so loading resumes cleanly
    var snap = localStorage.getItem('rfs_save_auto') || JSON.stringify(s);
    modal({ title: '💾 บันทึกเกม', body: '<div class="col" style="min-width:460px">' + [1, 2, 3].map(function (i) { var m = slotMeta('rfs_save_' + i); return '<div class="opt" data-sv="' + i + '">Slot ' + i + ' — ' + (m ? m.map + ' • รอบ ' + m.round + ' • ' + m.date : 'ว่าง') + '</div>'; }).join('') + '<div class="muted" style="font-size:13px">บันทึกสถานะต้นเทิร์นปัจจุบัน</div></div>', mount: function (box, close) { box.querySelectorAll('[data-sv]').forEach(function (e) { e.onclick = function () { close(+e.dataset.sv); }; }); } })
      .then(function (i) { if (!i) return; localStorage.setItem('rfs_save_' + i, snap); var st = JSON.parse(snap); localStorage.setItem('rfs_save_' + i + '_meta', JSON.stringify({ map: MAPS[st.mapIdx].th, round: st.round, date: new Date().toLocaleString('th-TH') })); toast('💾 บันทึกลง Slot ' + i + ' แล้ว'); });
  }
  function loadModal() {
    var rows = ['rfs_save_auto', 'rfs_save_1', 'rfs_save_2', 'rfs_save_3'].map(function (k, i) { var m = slotMeta(k), has = !!localStorage.getItem(k); return '<div class="opt" data-ld="' + k + '" style="' + (has ? '' : 'opacity:.4') + '">' + (i ? 'Slot ' + i : 'Auto Save') + ' — ' + (has && m ? m.map + ' • รอบ ' + m.round + ' • ' + m.date : has ? 'มีข้อมูล' : 'ว่าง') + '</div>'; }).join('');
    modal({ title: '📂 โหลดเกม', body: '<div class="col" style="min-width:460px">' + rows + '</div>', mount: function (box, close) { box.querySelectorAll('[data-ld]').forEach(function (e) { e.onclick = function () { if (localStorage.getItem(e.dataset.ld)) close(e.dataset.ld); }; }); } })
      .then(function (k) { if (k) startGame(JSON.parse(localStorage.getItem(k))); });
  }

  // ---------- RESULT ----------
  function showResult(g) { U.flushModals(); if (g.s.bkk) { victoryScene(g).then(function () { return Bkk.award(g); }).then(function () { showResultPage(g); }); return; } if (g.s.train) { victoryScene(g).then(function () { return Train.award(g); }).then(function () { showResultPage(g); }); return; } if (g.s.easter) { setTimeout(function () { Easter.afterStage(g); }, 600); return; } victoryScene(g).then(function () { if (g.s.tour) Tour.afterWorld(g); else showResultPage(g); }); }
  U.victoryScene = function (g) { return victoryScene(g); };
  function victoryScene(g) {
    return new Promise(function (resolve) {
      var s = g.s, rk = (s.ranking || s.players.map(function (p) { return { id: p.id, nw: g.netWorth(p) }; }).sort(function (a, b) { return b.nw - a.nw; }));
      var SC2 = 1280 / 1672, POD = [[780, 428], [490, 503], [1045, 513], [1300, 573]];
      var V = document.getElementById('victory');
      var win = s.winner !== null && s.winner !== undefined ? s.players[s.winner] : s.players[rk[0].id];
      var chars = rk.slice(0, 4).map(function (r, i) {
        var p = s.players[r.id], h = i === 0 ? 190 : 150, x = POD[i][0] * SC2, y = POD[i][1] * SC2 + 70;
        return '<div class="vchar' + (i === 0 ? ' win' : '') + '" style="left:' + x + 'px;top:' + y + 'px;animation-delay:' + (0.4 + (3 - i) * 0.35) + 's">' +
          '<div class="vplate" style="--pc:' + p.color + '"><b>' + (i + 1) + '</b>' + esc(p.name) + '<span>' + fmt(r.nw) + ' G</span></div>' + spr(charSpec(p), h, h) + '</div>';
      }).join('');
      V.innerHTML = '<canvas id="vfx" width="1280" height="860"></canvas><div class="vbg"></div>' + chars + '<canvas id="vconf" width="1280" height="860"></canvas>' +
        '<div class="vtitle"><span class="ttl">🏆 ' + (s.teams && s.winTeam >= 0 ? 'ทีม' + TI(s, s.winTeam).n + ' (' + s.players.filter(function (q) { return q.team === s.winTeam; }).map(function (q) { return esc(q.name); }).join(' + ') + ') ชนะ!' : esc(win.name) + ' ชนะ!') + '</span></div><div class="vreason">' + esc(s.endReason || '') + '</div>' +
        '<button class="pink vnext" id="vNext">ดูผลการแข่งขันและกราฟ ▶</button>';
      V.classList.add('on'); sfx('win');
      // fireworks (behind) + confetti (front)
      var c1 = V.querySelector('#vfx').getContext('2d'), c2 = V.querySelector('#vconf').getContext('2d'), parts = [], conf = [], alive = true, t0 = performance.now(), lastBurst = 0;
      var COLS = ['#ff5d8f', '#ffd25e', '#7cc0ff', '#7fcf6b', '#b99cf0', '#ff9f43', '#ffffff'];
      for (var i = 0; i < 160; i++) conf.push({ x: Math.random() * 1280, y: -Math.random() * 860, w: 6 + Math.random() * 8, h: 10 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - .5) * .25, vy: 1.2 + Math.random() * 2.2, ph: Math.random() * 6, c: COLS[i % COLS.length] });
      function burst() { var x = 150 + Math.random() * 980, y = 90 + Math.random() * 280, col = COLS[Math.floor(Math.random() * 6)], n = 46; for (var k = 0; k < n; k++) { var a = k / n * Math.PI * 2, sp = 2 + Math.random() * 3.5; parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: Math.random() < .3 ? '#fff' : col }); } sfx('coin'); }
      function frame(now) {
        if (!alive) return;
        if (now - lastBurst > 520) { burst(); lastBurst = now; }
        c1.clearRect(0, 0, 1280, 860); c1.globalCompositeOperation = 'lighter';
        parts = parts.filter(function (q) { return q.life > 0; });
        parts.forEach(function (q) { q.x += q.vx; q.y += q.vy; q.vy += 0.045; q.vx *= 0.985; q.life -= 0.012; c1.globalAlpha = Math.max(0, q.life); c1.fillStyle = q.c; c1.beginPath(); c1.arc(q.x, q.y, 3.2, 0, 7); c1.fill(); });
        c1.globalAlpha = 1; c1.globalCompositeOperation = 'source-over';
        c2.clearRect(0, 0, 1280, 860);
        conf.forEach(function (q) { q.y += q.vy; q.ph += 0.05; q.x += Math.sin(q.ph) * 1.4; q.r += q.vr; if (q.y > 880) { q.y = -20; q.x = Math.random() * 1280; } c2.save(); c2.translate(q.x, q.y); c2.rotate(q.r); c2.scale(1, Math.abs(Math.cos(q.ph * 2))); c2.fillStyle = q.c; c2.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); c2.restore(); });
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      var done = function () { if (!alive) return; alive = false; V.classList.remove('on'); V.innerHTML = ''; resolve(); };
      V.querySelector('#vNext').onclick = done;
      setTimeout(function () { V.onclick = function (e) { if (e.target.id !== 'vNext') done(); }; }, 2500);
    });
  }
  // =====================================================================
  // EASTER EVENT — 4 stages, bunny lays eggs, score = net worth + eggs + mission
  // =====================================================================
  function pickMission(used) {
    var pool = EASTER.missions.filter(function (m) { return (used || []).indexOf(m.id) < 0; });
    if (!pool.length) pool = EASTER.missions.slice();
    return pool[Math.floor(Math.random() * pool.length)].id;
  }
  U.pickMission = pickMission;
  function missionDef(id) { return EASTER.missions.find(function (m) { return m.id === id; }) || EASTER.missions[0]; }
  function missionText(id) { var m = missionDef(id); return '🎯 ' + m.name + ': ' + m.desc + (m.per ? '' : ' → +' + fmt(EASTER.missionBonus) + ' แต้ม'); }
  var Easter = (function () {
    var KEY = 'rfs_easter';
    function load() { try { var t = JSON.parse(localStorage.getItem(KEY) || 'null'); return t && !t.done ? t : null; } catch (e) { return null; } }
    function save(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) { } }
    function savedStage(t) { try { var s = JSON.parse(localStorage.getItem('rfs_save_easter') || 'null'); return s && !s.over && s.easter && t && s.easter.stage === t.stage ? s : null; } catch (e) { return null; } }
    function rivals(lv) {
      var pool = aiCharKeys().filter(function (k) { return k !== Meta.p.equip.char; }), out = [];
      for (var i = 0; i < 3; i++) { var ch = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; out.push({ name: Meta.charName(ch) + ' AI', char: ch, isAI: true, aiLevel: lv, persona: AI_PERSONAS[Math.floor(Math.random() * AI_PERSONAS.length)] }); }
      return out;
    }
    function newEvent(lv) { var t = { stage: 0, aiLv: lv || 'normal', rivals: rivals(lv || 'normal'), totals: {}, used: [], hist: [] }; t.mission = pickMission([]); save(t); return t; }
    function rules() {
      return modal({ title: '📜 กติกาอีเวนต์อีสเตอร์', width: 900, body: '<div class="erules">' +
        '<p>🐰 <b>กระต่ายอีสเตอร์</b> จะโผล่มาในแผนที่ ทอยลูกเต๋าและเดินหลังจบแต่ละรอบ หยุดตรงไหนจะ<b>วางไข่</b>ไว้ อยู่ประมาณ ' + EASTER.bunnyStay + ' รอบแล้วกลับบ้าน และจะกลับมาอีกหลังผ่านไป ' + EASTER.bunnyCool + ' รอบ</p>' +
        '<p>🥚 <b>ใครเดินผ่านหรือหยุดบนไข่ได้ไข่ไป</b> พร้อมรางวัลสุ่มในเกม: เงิน • หุ้นฟรี • ดอก(สัญลักษณ์) • ไข่เพิ่ม • เพิ่มมูลค่าร้าน — <b>ไข่ทอง</b> (มีมงกุฎ) นับเป็น 3 ฟองและรางวัลใหญ่ขึ้น</p>' +
        '<p>🏁 <b>คะแนนด่าน</b> = ทรัพย์สินตอนจบ + ไข่ × ' + fmt(EASTER.eggScore) + ' + แต้มภารกิจพิเศษ (สุ่มเปลี่ยนทุกด่าน ทุกครั้งที่เล่น)</p>' +
        '<p>🗺️ แข่งต่อเนื่อง <b>4 ด่าน</b>: ' + EASTER_MAPS.map(function (m, i) { return (i + 1) + '. ' + m.th; }).join(' → ') + ' — คะแนนสะสมรวมทุกด่าน</p>' +
        '<p>🎁 <b>รางวัลทุกด่าน</b>: ไข่อีสเตอร์สุ่มตามอันดับในด่าน ' + EASTER.stageEggs.join(' / ') + ' ฟอง + โบนัส 1 ฟองทุก ๆ ' + EASTER.eggsPerReward + ' ไข่ที่เก็บได้ในแผนที่</p>' +
        '<p>🏆 <b>จบ 4 ด่าน</b> อันดับรวม: ที่ 1 ได้ <b>' + EASTER.finalEggs[0] + '</b> ฟอง • ที่ 2 ได้ ' + EASTER.finalEggs[1] + ' • ที่ 3 ได้ ' + EASTER.finalEggs[2] + ' • ที่ 4 ได้ ' + EASTER.finalEggs[3] + '</p>' +
        '<p>✨ <b>ตัวละครอีสเตอร์ 8 ตัว (หายาก)</b> ได้จากการเปิดไข่อีสเตอร์สุ่มเท่านั้น — ดูสกิลได้ที่หน้าตัวละคร/หน้าอีเวนต์</p>' +
        '<p>👫 เล่นกับเพื่อนออนไลน์ได้ (แข่งเดี่ยวทุกคน) — โฮสต์สร้างห้องจากหน้าอีเวนต์ เพื่อนเข้าด้วยรหัสห้อง</p></div>', buttons: [{ t: 'เข้าใจแล้ว', v: 1, cls: 'green' }] });
    }
    function charStrip() {
      var P = Meta.p;
      return EASTER_CHARS.map(function (c, i) { var k = 'e' + i, own = P.chars[k]; return '<div class="echar' + (own ? ' own' : '') + '" data-ech="' + k + '">' + spr(['easter', i], 74, 80) + '<span>' + (own ? '✅' : '🔒') + '</span></div>'; }).join('');
    }
    function hub() {
      var t = load(), P = Meta.p, sv = t && savedStage(t), st = t ? t.stage : 0;
      var cards = EASTER_MAPS.map(function (m, i) {
        var state = !t ? (i === 0 ? 'cur' : 'lock') : i < st ? 'done' : i === st ? 'cur' : 'lock', h = t && t.hist[i];
        return '<div class="twcard ' + state + '"><div class="twimg" style="background-image:url(assets/' + m.bg + '.webp)"></div><div class="twnm">ด่าน ' + (i + 1) + '<br><b>' + m.th + '</b></div><div class="twst">' + (state === 'done' ? '✅ อันดับ ' + h.rank : state === 'cur' ? '▶ ด่านนี้' : '🔒') + '</div></div>';
      }).join('<div class="twarrow">➜</div>');
      var stand = '';
      if (t) {
        var names = [P.name].concat(t.rivals.map(function (r) { return r.name; })), rows = names.map(function (n, i) { return { n: n, v: t.totals[n] || 0, me: i === 0, ch: i === 0 ? P.equip.char : t.rivals[i - 1].char }; }).sort(function (a, b) { return b.v - a.v; });
        stand = '<table class="ttable"><tr><th>อันดับรวม</th><th></th><th>ผู้เล่น</th><th>คะแนนสะสม</th></tr>' + rows.map(function (r, i) { return '<tr' + (r.me ? ' style="background:#fff0f6"' : '') + '><td><b>' + (i + 1) + '</b></td><td>' + spr(Meta.charSprite(r.ch), 40, 44) + '</td><td>' + esc(r.n) + '</td><td><b>' + fmt(r.v) + '</b></td></tr>'; }).join('') + '</table>';
      }
      var lv = (t && t.aiLv) || U.easterLv || 'normal';
      $('#easter').innerHTML = '<div class="scrhead"><div class="uibtn backbtn" id="eBack">' + spr(['ui', 'prev'], 70, 70) + '</div><div class="title"><span class="ttl">🐰 อีเวนต์อีสเตอร์</span></div><button class="small" id="eRules" style="margin-left:auto">📜 กติกา</button></div>' +
        '<div class="scrbody"><div class="ebanner"><img src="assets/easter_banner.webp" draggable="false"><div class="ebtag">แข่ง 4 ด่าน • เก็บไข่ • ลุ้นตัวละครหายาก 8 ตัว</div></div>' +
        '<div class="twrow" style="margin-top:10px">' + cards + '</div>' +
        '<div class="row" style="gap:14px;align-items:stretch;margin-top:12px">' +
        '<div class="panel grow" style="padding:12px"><b style="font-size:18px">ด่าน ' + (st + 1) + ' — ' + EASTER_MAPS[st].th + '</b>' +
        '<div class="emission">' + (t ? missionText(t.mission) : '🎯 ภารกิจพิเศษจะสุ่มตอนเริ่มอีเวนต์ (เปลี่ยนทุกด่าน)') + '</div>' +
        '<div class="muted" style="font-weight:700;font-size:13px">เป้าหมาย ' + fmt(EASTER.stages[st].target) + ' G • สูงสุด ' + EASTER.stages[st].rounds + ' รอบ • เงินเริ่มต้น 10,000 G • ใช้ตัวละคร/ไอเทมที่ติดตั้งไว้</div>' +
        (t ? '' : '<div class="row" style="gap:4px;margin-top:8px;align-items:center;flex-wrap:wrap"><b>ระดับ AI:</b>' + AI_LEVELS.map(function (l) { return '<button class="small rbtn' + (lv === l.id ? ' on' : '') + '" data-elv="' + l.id + '">' + l.name + '</button>'; }).join('') + '</div>') +
        '<div class="row" style="gap:4px;margin-top:6px;align-items:center"><b>สีของคุณ:</b>' + colorDots(P.color || 0, 'ecol') + '</div>' +
        '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">' + (sv ? '<button class="green" id="eResume" style="font-size:20px">▶ เล่นต่อ ด่าน ' + (st + 1) + ' (รอบ ' + sv.round + ')</button>' : '<button class="pink" id="eGo" style="font-size:20px">▶ ' + (t ? 'เล่นด่าน ' + (st + 1) : 'เริ่มอีเวนต์ (เล่นกับ AI)') + '</button>') +
        '<button id="eOnline">👫 เล่นกับเพื่อน (ออนไลน์)</button>' + (t ? '<button class="small gray" id="eReset">🔄 เริ่มอีเวนต์ใหม่</button>' : '') + '</div>' + (stand ? '<div style="margin-top:10px">' + stand + '</div>' : '') + '</div>' +
        '<div class="panel" style="padding:12px;width:430px"><div class="row" style="gap:10px;align-items:center">' + spr(['eggs', 2], 70, 76) + '<div><b style="font-size:20px">ไข่อีสเตอร์สุ่ม × ' + (P.eeggs || 0) + '</b><div class="muted" style="font-size:12px;font-weight:700">เปิดได้: ตัวละครหายาก • เพชร • Gold • อุปกรณ์ • การ์ด</div></div></div>' +
        '<button class="pink" id="eOpen" style="width:100%;margin-top:8px"' + (P.eeggs > 0 ? '' : ' disabled') + '>🥚 เปิดไข่อีสเตอร์</button>' +
        '<div style="margin-top:10px;font-weight:900">✨ ตัวละครอีสเตอร์ (หายาก)</div><div class="echars">' + charStrip() + '</div><div id="eInfo">' + itemInfoBox(null) + '</div>' +
        '<div class="muted" style="font-size:12px;font-weight:700;margin-top:6px">🎁 ด่าน: ' + EASTER.stageEggs.join('/') + ' ฟองตามอันดับ + 1 ฟอง/' + EASTER.eggsPerReward + ' ไข่ที่เก็บ • จบ 4 ด่าน: ' + EASTER.finalEggs.join('/') + '</div></div></div></div>';
      show('easter');
      $('#eBack').onclick = function () { show('menu'); };
      $('#eRules').onclick = function () { rules(); };
      $('#easter').querySelectorAll('[data-elv]').forEach(function (e) { e.onclick = function () { U.easterLv = e.dataset.elv; hub(); }; });
      $('#easter').querySelectorAll('[data-ecol]').forEach(function (e) { e.onclick = function () { P.color = +e.dataset.ecol; Meta.save(); hub(); }; });
      $('#easter').querySelectorAll('[data-ech]').forEach(function (e) { e.onclick = function () { $('#eInfo').innerHTML = itemInfoBox(e.dataset.ech); }; });
      $('#eOpen').onclick = function () { boxModal('easter').then(hub); };
      $('#eOnline').onclick = function () { Online.host({ easter: true }); };
      if (sv) $('#eResume').onclick = function () { startGame(sv, false); };
      var go = $('#eGo'); if (go) go.onclick = function () { if (!load()) { newEvent(lv); rules().then(startStage); } else startStage(); };
      var rs = $('#eReset'); if (rs) rs.onclick = function () { modal({ title: 'เริ่มอีเวนต์ใหม่?', body: '<div style="text-align:center;font-weight:700">คะแนนสะสมที่เล่นมาจะหายไป (ไข่ที่ได้แล้วยังอยู่)</div>', buttons: [{ t: 'เริ่มใหม่', v: 1, cls: 'pink' }, { t: 'ยกเลิก', v: 0 }] }).then(function (v) { if (v) { try { localStorage.removeItem(KEY); localStorage.removeItem('rfs_save_easter'); } catch (e) { } hub(); } }); };
    }
    function startStage() {
      var t = load(); if (!t) return;
      try { localStorage.removeItem('rfs_save_easter'); } catch (e) { }
      var P = Meta.p, v = Meta.validLoadout(), ES = EASTER.stages[t.stage];
      var players = [{ name: P.name, char: P.equip.char, isAI: false, loadout: { eq: v.eq, sc: v.sc }, dice: P.equip.dice }].concat(t.rivals.map(function (r) { return Object.assign({}, r); }));
      var cols = assignColors(players.map(function (q, k) { return k === 0 ? (P.color || 0) : -1; })); players.forEach(function (q, k) { q.color = cols[k]; });
      var s = Game.create({ mapIdx: ES.map, players: players, target: ES.target, startCash: 10000, maxRounds: ES.rounds, rules: { tax: false, endOnBankrupt: true }, seed: Math.floor(Math.random() * 1e9), easter: { stage: t.stage, kind: 'solo', mission: t.mission, prev: players.map(function (q) { return t.totals[q.name] || 0; }) } });
      s.ownerIdx = 0; s.dice = P.equip.dice; s.lenName = 'อีสเตอร์ ด่าน ' + (t.stage + 1);
      startGame(s, true);
    }
    function afterStage(g) {
      U.flushModals();
      var s = g.s, E = s.easter, sc = g.easterScores(), me = s.ownerIdx || 0, last = E.stage >= EASTER.stages.length - 1;
      var byStage = sc.slice().sort(function (a, b) { return b.stage - a.stage; }), byTotal = sc.slice().sort(function (a, b) { return b.total - a.total; });
      var myS = byStage.findIndex(function (x) { return x.id === me; }), myT = byTotal.findIndex(function (x) { return x.id === me; }), mine = sc[me];
      var eggs = EASTER.stageEggs[myS] + Math.floor(mine.eggs / EASTER.eggsPerReward), fin = last ? EASTER.finalEggs[myT] || 0 : 0;
      Meta.matchReward(myS, myS === 0, mine.nw, true); Meta.addEggs(eggs + fin);
      var online = E.kind === 'online';
      if (!online) {
        var t = load();
        if (t && t.stage === E.stage) {
          sc.forEach(function (x) { t.totals[x.name] = x.total; });
          t.hist[E.stage] = { rank: myS + 1, score: mine.stage };
          t.used.push(E.mission);
          if (last) { t.done = true; t.final = myT + 1; } else { t.stage++; t.mission = pickMission(t.used); }
          save(t); try { localStorage.removeItem('rfs_save_easter'); } catch (e) { }
        }
      }
      var M = missionDef(E.mission), rows = byTotal.map(function (x, i) {
        var p = s.players[x.id], sr = byStage.indexOf(x) + 1;
        return '<tr' + (x.id === me ? ' style="background:#fff0f6"' : '') + '><td><b>' + (i + 1) + '</b></td><td>' + spr(charSpec(p), 42, 46) + '</td><td style="color:' + p.color + ';font-weight:900">' + esc(p.name) + '</td><td>' + fmt(x.nw) + '</td><td>🥚 ' + x.eggs + (x.geggs ? ' <span style="color:#d4a000">(ทอง ' + x.geggs + ')</span>' : '') + '<br><small>+' + fmt(x.eggs * EASTER.eggScore) + '</small></td><td>' + (x.bonus ? '🎯 +' + fmt(x.bonus) + (x.pts ? '<br><small>(สกิลไข่ +' + fmt(x.pts) + ')</small>' : '') : '-') + '</td><td><b>' + fmt(x.stage) + '</b><br><small>อันดับด่าน ' + sr + '</small></td><td><b style="font-size:18px">' + fmt(x.total) + '</b></td></tr>';
      }).join('');
      var host = !online || (U.online && U.online.role === 'host');
      var btns = last ? '<button class="pink" id="eFin" style="font-size:20px">🥚 เปิดไข่อีสเตอร์ (' + (Meta.p.eeggs || 0) + ')</button>'
        : online ? (host ? '<button class="pink" id="eNext" style="font-size:20px">▶ ไปด่าน ' + (E.stage + 2) + ' กับเพื่อน</button>' : '<div class="chip" style="font-size:16px">⏳ รอโฮสต์เริ่มด่าน ' + (E.stage + 2) + '...</div>') + '<button id="eOpenNow">🥚 เปิดไข่ (' + (Meta.p.eeggs || 0) + ')</button>'
        : '<button class="pink" id="eNext" style="font-size:20px">▶ ไปด่าน ' + (E.stage + 2) + '</button><button id="eOpenNow">🥚 เปิดไข่ (' + (Meta.p.eeggs || 0) + ')</button>';
      $('#easter').innerHTML = '<div class="scrhead"><div class="title"><span class="ttl">🐰 ผลด่าน ' + (E.stage + 1) + ' — ' + MAPS[s.mapIdx].th + '</span></div></div><div class="scrbody">' +
        (last ? '<div class="tbanner ' + (myT === 0 ? 'champ' : 'pass') + '">' + (myT === 0 ? '👑 แชมป์อีเวนต์อีสเตอร์!' : '🏁 จบอีเวนต์ — อันดับรวมที่ ' + (myT + 1)) + '</div>' : '<div class="tbanner pass">🥚 จบด่าน ' + (E.stage + 1) + ' — อันดับในด่าน ' + (myS + 1) + '</div>') +
        '<div class="panel" style="padding:12px;margin-top:10px"><div class="emission" style="margin-top:0">ภารกิจด่านนี้ — ' + missionText(E.mission) + '</div>' +
        '<table class="ttable"><tr><th>อันดับรวม</th><th></th><th>ผู้เล่น</th><th>ทรัพย์สิน</th><th>ไข่</th><th>ภารกิจ</th><th>คะแนนด่าน</th><th>คะแนนสะสม</th></tr>' + rows + '</table></div>' +
        '<div class="row" style="justify-content:center;gap:12px;margin-top:10px;align-items:center;font-weight:900;font-size:18px">' + spr(['eggs', 2], 46, 50) + 'ได้ไข่อีสเตอร์สุ่ม ' + EASTER.stageEggs[myS] + ' (อันดับด่าน) + ' + Math.floor(mine.eggs / EASTER.eggsPerReward) + ' (เก็บไข่ ' + mine.eggs + ' ฟอง)' + (last ? ' + ' + fin + ' (อันดับรวม)' : '') + ' = <span style="color:#ff5d8f;font-size:24px">' + (eggs + fin) + ' ฟอง</span></div>' +
        '<div class="row" style="justify-content:center;gap:12px;margin-top:12px">' + btns + '</div></div>';
      show('easter'); sfx(myS === 0 ? 'win' : 'coin');
      var fn = $('#eFin'); if (fn) fn.onclick = function () { if (U.online) Online.leave(); show('menu'); boxModal('easter').then(function () { hub(); }); };
      var nx = $('#eNext'); if (nx) nx.onclick = function () { if (online) Online.nextStage(); else startStage(); };
      var on = $('#eOpenNow'); if (on) on.onclick = function () { boxModal('easter').then(function () { on.textContent = '🥚 เปิดไข่ (' + (Meta.p.eeggs || 0) + ')'; }); };
    }
    return { open: hub, hub: hub, load: load, savedStage: savedStage, afterStage: afterStage, rules: rules };
  })();
  U.Easter = Easter;
  // ---------- board: eggs + bunny ----------
  function refreshEaster() {
    var s = U.g.s, E = s.easter, L = document.getElementById('eggLayer'); if (!E || !L) return;
    var T = BT;
    L.innerHTML = Object.keys(E.eggs).map(function (id) { var t = s.tiles[id], g = E.eggs[id] === 'g'; return '<div class="begg' + (g ? ' gold' : '') + '" id="egg' + id + '" style="left:' + (t.x * SC + T * 0.08) + 'px;top:' + (t.y * SC - T * 0.85) + 'px">' + spr(['eggs', g ? 1 : 0], T * 0.72, T * 0.78) + '</div>'; }).join('');
    var b = document.getElementById('bunny');
    if (E.bunny.pos < 0) b.style.display = 'none';
    else { var t = s.tiles[E.bunny.pos]; b.style.display = 'block'; b.style.width = T * 1.6 + 'px'; b.style.height = T * 1.63 + 'px'; b.style.left = (t.x * SC - T * 1.45) + 'px'; b.style.top = (t.y * SC - T * 1.45) + 'px'; }
    var pill = document.getElementById('eventPill');
    if (pill) pill.innerHTML = '🐰 อีสเตอร์ ด่าน ' + (E.stage + 1) + '/4 • ' + esc(missionDef(E.mission).name) + ' • ' + (E.bunny.pos >= 0 ? 'กระต่ายอยู่อีก ' + E.bunny.left + ' รอบ' : 'กระต่ายมาอีกใน ' + Math.max(0, E.bunny.cool - 1) + ' รอบ') + ' • 🥚 บนแผนที่ ' + Object.keys(E.eggs).length;
  }
  // =====================================================================
  // STEAM TRAIN EVENT — one big board, 200 rounds, everyone drives the train every 5 rounds
  // =====================================================================
  var Train = (function () {
    var TB = 0;
    function cfg(i) { return TRAIN.boards[i === undefined ? TB : i] || TRAIN.boards[0]; }
    function mapIdx(i) { var k = cfg(i).key; return MAPS.findIndex(function (m) { return m.id === k; }); }
    function saved() { try { var s = JSON.parse(localStorage.getItem('rfs_save_train') || 'null'); return s && !s.over && s.train ? s : null; } catch (e) { return null; } }
    function rules() {
      return modal({ title: '📜 กติกาอีเวนต์รถจักรไอน้ำ', width: 900, body: '<div class="erules">' +
        '<p>🗺️ มี 2 สนาม: <b>สถานีรถจักรไอน้ำ</b> (เป้า ' + fmt(cfg(0).target) + ' G) และ <b>สะพานโค้งไอน้ำ</b> (เป้า ' + fmt(cfg(1).target) + ' G) • สนามนี้: <b>' + cfg().th + '</b> • ' + TRAIN.rounds + ' รอบ • เงินเริ่มต้น ' + fmt(TRAIN.startCash) + ' G • เป้าหมายทรัพย์สิน ' + fmt(cfg().target) + ' G (ถึงก่อนชนะทันที)</p>' +
        '<p>🚂 <b>ทุก ๆ ' + TRAIN.every + ' รอบ</b> จะเป็น “รอบขับรถไฟ” — ทุกคนได้ขับรถไฟคนละ 1 ตา ทอย <b>ลูกเต๋า 2 ลูก</b> ขับครบ 4 คนแล้วกลับมาเล่นปกติ</p>' +
        '<p>💥 ขับผ่านใคร = <b>ชน!</b> คนโดนชนจะสุ่มเสีย 1 อย่าง: เงินหล่น ' + Math.round(TRAIN.crashCashPct * 100) + '% (ตกกองภาษีเมือง) • ดอก(สัญลักษณ์) 1 ดอก • การ์ด/ไอเทมติดตัว 1 อย่าง • สกิลตัวละครใช้ไม่ได้ ' + TRAIN.noSkillRounds + ' รอบ — แล้ว<b>กระเด็นกลับสถานี</b> (ธนาคาร)</p>' +
        '<p>🚉 <b>ชานชาลา</b>: หยุดแล้วนั่งรถไฟไปชานชาลาอื่นได้ฟรี • 🎁 <b>กล่องแกล้ง</b>: สุ่มแกล้ง — สลับตำแหน่ง / ส่งกลับสถานี / แอบหยิบเงิน 5% • 🔄 ช่องสลับทิศ</p>' +
        '<p>🤝 <b>โหมดทีม 2 vs 2 (เล่นกับเพื่อน)</b>: เลือกแมพเองได้ • ' + TRAIN.team.rounds + ' รอบ • เป้าหมายรวมทีม ' + fmt(TRAIN.team.target) + ' G • รถไฟทับเพื่อนร่วมทีมไม่ชน • ทีมชนะได้ตั๋วทองคนละ ' + TRAIN.team.winTickets + ' ใบ + กล่องสุ่มคนละ ' + TRAIN.team.winBoxes + ' กล่อง</p>' + '<p>🎫 เปิดการ์ดทุกใบมีโอกาส 1% ได้ <b>ตั๋วรถไฟทอง</b> • <b>อันดับ 1/2/3/4 รับ ' + cfg().winTickets.join('/') + ' ใบ • กล่องสุ่ม ' + TRAIN.rankBoxes.join('/') + ' กล่อง</b> • ตั๋วใช้แลก <b>ตัวละครชุดรอยัลทอง</b> 8 ตัว (20–50 ใบ/ตัว)</p>' +
        '<p>👫 สร้างห้องออนไลน์ชวนเพื่อนได้ (แข่งเดี่ยว) • AI สุ่มตัวละครและสุ่มความเก่ง</p></div>', buttons: [{ t: 'เข้าใจแล้ว', v: 1, cls: 'green' }] });
    }
    function royalGrid() {
      var P = Meta.p;
      return ROYAL_CHARS.map(function (c, i) { var k = 'r' + i, own = P.chars[k]; return '<div class="rcard' + (own ? ' own' : '') + '" data-rk="' + k + '">' + spr(['royal', i], 86, 92) + '<div class="rnm">' + esc(c.name) + '</div>' + (own ? '<div class="rown">✅ มีแล้ว</div>' : '<button class="small ' + ((P.tickets || 0) >= c.t ? 'pink' : 'gray') + '" data-rx="' + k + '">🎫 ' + c.t + ' ใบ</button>') + '</div>'; }).join('');
    }
    function hub() {
      var P = Meta.p, sv = saved();
      $('#trainev').innerHTML = '<div class="scrhead"><div class="uibtn backbtn" id="tvBack">' + spr(['ui', 'prev'], 70, 70) + '</div><div class="title"><span class="ttl">🚂 อีเวนต์รถจักรไอน้ำ</span></div><button class="small" id="tvRules" style="margin-left:auto">📜 กติกา</button></div>' +
        '<div class="scrbody"><div class="ebanner"><img src="assets/train_banner.webp" draggable="false"></div>' +
        '<div class="row" style="gap:14px;align-items:stretch;margin-top:12px">' +
        '<div class="panel" style="padding:12px;width:470px"><div class="tbpick">' + TRAIN.boards.map(function (b, i) { return '<div class="tbcard' + (TB === i ? ' on' : '') + '" data-tb="' + i + '"><div class="tbimg" style="background-image:url(assets/' + b.bg + '.webp)"></div><b>' + b.th + '</b><span>เป้า ' + fmt(b.target) + ' G • 🎫 ' + b.winTickets.join('/') + '</span></div>'; }).join('') + '</div><div class="tvmap" id="tvMap" style="background-image:url(assets/' + cfg().bg + '.webp);height:170px;margin-top:8px"><span>🔍 แตะเพื่อดูแผนที่</span></div>' +
        '<div style="font-weight:800;margin-top:8px;line-height:1.6">🗺️ ' + cfg().th + ' • ' + TRAIN.rounds + ' รอบ • เริ่ม ' + fmt(TRAIN.startCash) + ' G • เป้าหมาย ' + fmt(cfg().target) + ' G<br>🚂 ทุก ' + TRAIN.every + ' รอบ ทุกคนขับรถไฟ (ลูกเต๋า 2 ลูก) ชนใครคนนั้นเสียของ!</div>' +
        '<div class="row" style="gap:4px;margin-top:6px;align-items:center"><b>สีของคุณ:</b>' + colorDots(P.color || 0, 'tvcol') + '</div>' +
        '<div class="muted" style="font-size:12px;font-weight:700;margin-top:4px">AI 3 ตัว สุ่มตัวละครและสุ่มความเก่ง • ใช้ตัวละคร/ไอเทมที่ติดตั้งไว้</div>' +
        '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">' + (sv ? '<button class="green" id="tvResume" style="font-size:19px">▶ เล่นต่อ (รอบ ' + sv.round + ')</button><button class="small" id="tvGo">🔄 เริ่มเกมใหม่</button>' : '<button class="pink" id="tvGo" style="font-size:20px">▶ เล่นกับ AI</button>') + '<button id="tvOnline">👫 เล่นกับเพื่อน (เดี่ยว / ทีม 2v2)</button></div></div>' +
        '<div class="panel grow" style="padding:12px"><div class="row" style="gap:10px;align-items:center"><img src="assets/ticket.webp" style="height:64px" draggable="false"><div><b style="font-size:22px">ตั๋วรถไฟทอง × ' + (P.tickets || 0) + '</b><div class="muted" style="font-size:12px;font-weight:700">ได้จากเปิดการ์ดในสนามนี้ (1%) • อันดับ 1–4 รับ ' + cfg().winTickets.join('/') + ' ใบ • กล่องสุ่ม ' + TRAIN.rankBoxes.join('/') + '</div></div></div>' +
        '<div style="margin-top:8px;font-weight:900">👑 แลกตัวละครชุดรอยัลทอง (หายาก)</div><div class="rgrid">' + royalGrid() + '</div><div id="tvInfo">' + itemInfoBox(null) + '</div>' +
        '<div class="muted" style="font-size:12px;font-weight:700;margin-top:4px">🚂 ชุดรถจักรไอน้ำ 8 ตัว (สกิลเกี่ยวกับรถไฟ) ซื้อได้ที่ร้านค้า → Characters</div></div></div></div>';
      show('trainev');
      $('#tvBack').onclick = function () { show('menu'); };
      $('#tvRules').onclick = function () { rules(); };
      $('#tvMap').onclick = function () { mapViewer(mapIdx(), null); };
      $('#trainev').querySelectorAll('[data-tb]').forEach(function (e) { e.onclick = function () { TB = +e.dataset.tb; sfx('tap'); hub(); }; });
      $('#trainev').querySelectorAll('[data-tvcol]').forEach(function (e) { e.onclick = function () { P.color = +e.dataset.tvcol; Meta.save(); hub(); }; });
      $('#trainev').querySelectorAll('[data-rk]').forEach(function (e) { e.onclick = function (ev) { if (ev.target.closest('[data-rx]')) return; $('#tvInfo').innerHTML = itemInfoBox(e.dataset.rk); }; });
      $('#trainev').querySelectorAll('[data-rx]').forEach(function (e) { e.onclick = function () { var k = e.dataset.rx, c = ROYAL_CHARS[+k.slice(1)]; $('#tvInfo').innerHTML = itemInfoBox(k);
        modal({ title: '👑 แลกตัวละครรอยัล', body: '<div style="text-align:center">' + spr(['royal', +k.slice(1)], 160, 170) + '<div style="font-weight:900;font-size:20px">' + esc(c.name) + '</div>' + skillChip(k, true) + '<div style="margin-top:8px;font-weight:800">ใช้ตั๋วรถไฟทอง ' + c.t + ' ใบ (มี ' + (P.tickets || 0) + ')</div></div>', buttons: [{ t: '🎫 แลกเลย', v: 1, cls: 'pink' }, { t: 'ยกเลิก', v: 0 }] })
          .then(function (v) { if (!v) return; var r = Meta.redeemRoyal(k); toast(r.msg, 2800); if (r.ok) sfx('win'); hub(); }); }; });
      $('#tvOnline').onclick = function () { Online.host({ train: true, board: TB }); };
      if (sv) $('#tvResume').onclick = function () { startGame(sv, false); };
      $('#tvGo').onclick = function () { if (sv && !hub._c) { hub._c = 1; toast('กดอีกครั้งเพื่อเริ่มใหม่ (เกมที่ค้างไว้จะหายไป)', 2500); setTimeout(function () { hub._c = 0; }, 2500); return; } hub._c = 0; start(); };
    }
    function randLv() { var l = AI_LEVELS.map(function (x) { return x.id; }); return l[Math.floor(Math.random() * l.length)]; }
    function start() {
      try { localStorage.removeItem('rfs_save_train'); } catch (e) { }
      var P = Meta.p, v = Meta.validLoadout(), pool = aiCharKeys().filter(function (k) { return k !== P.equip.char; });
      var players = [{ name: P.name, char: P.equip.char, isAI: false, loadout: { eq: v.eq, sc: v.sc }, dice: P.equip.dice }];
      for (var i = 0; i < 3; i++) { var ch = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; players.push({ name: Meta.charName(ch) + ' AI', char: ch, isAI: true, aiLevel: randLv(), persona: AI_PERSONAS[Math.floor(Math.random() * AI_PERSONAS.length)] }); }
      var cols = assignColors(players.map(function (q, k) { return k === 0 ? (P.color || 0) : -1; })); players.forEach(function (q, k) { q.color = cols[k]; });
      var s = Game.create({ train: true, mapIdx: mapIdx(), players: players, target: cfg().target, startCash: TRAIN.startCash, maxRounds: TRAIN.rounds, rules: { tax: false, endOnBankrupt: true }, seed: Math.floor(Math.random() * 1e9) });
      s.ownerIdx = 0; s.dice = P.equip.dice; s.lenName = 'อีเวนต์รถไฟ • ' + cfg().th; s.train.kind = 'solo'; s.train.board = TB;
      rules().then(function () { startGame(s, true); });
    }
    // tickets earned this game + 3 for the winner — shown before the normal result page
    function award(g) {
      var s = g.s, me = s.players[s.ownerIdx || 0]; if (g._tk) return Promise.resolve(); g._tk = 1;
      var rk = s.ranking || [], myR = Math.max(0, rk.findIndex(function (r) { return r.id === me.id; })), tmWin = s.teams && s.winTeam >= 0 ? me.team === s.winTeam : null, bonus = tmWin !== null ? (tmWin ? TRAIN.team.winTickets : TRAIN.team.loseTickets) : (cfg(s.train.board || 0).winTickets[myR] || 0), first = bonus > 0, n = (me.tickets || 0) + bonus;
      if (s.train.kind === 'solo') { try { localStorage.removeItem('rfs_save_train'); } catch (e) { } }
      if (!n) return Promise.resolve();
      Meta.addTickets(n);
      return modal({ title: '🎫 ตั๋วรถไฟทอง', width: 560, body: '<div style="text-align:center"><img src="assets/ticket.webp" class="tkpop" draggable="false"><div style="font-size:28px;font-weight:900;color:#c48a00">+' + n + ' ใบ</div><div style="font-weight:800;margin-top:6px">' + ((me.tickets || 0) ? 'จากการเปิดการ์ด ' + me.tickets + ' ใบ' : '') + (first ? ((me.tickets || 0) ? ' • ' : '') + (tmWin ? '🏆 ทีมชนะ! รับคนละ ' + bonus + ' ใบ' : (myR === 0 ? '👑 ' : '🏅 ') + 'อันดับ ' + (myR + 1) + ' รับ ' + bonus + ' ใบ') : '') + '</div><div class="muted" style="font-weight:700;margin-top:4px">รวมมีตั๋ว ' + (Meta.p.tickets || 0) + ' ใบ — แลกตัวละครรอยัลได้ที่หน้าอีเวนต์</div></div>', buttons: [{ t: 'เยี่ยมเลย!', v: 1, cls: 'green' }] });
    }
    return { open: hub, hub: hub, saved: saved, award: award, rules: rules, mapIdx: mapIdx, cfg: cfg };
  })();
  U.Train = Train;
  // =====================================================================
  // BANGKOK CITY — special map, Bangkok characters only, no round limit, wealth target 50k/70k/100k → lucky bags
  var Bkk = (function () {
    var SEL = { tier: 0 };
    function mapIdx() { return MAPS.indexOf(BKK_MAP); }
    function saved() { try { var s = JSON.parse(localStorage.getItem('rfs_save_bkk') || 'null'); return s && !s.over && s.bkk ? s : null; } catch (e) { return null; } }
    function myChars() { var P = Meta.p; return BKK_CHARS.map(function (c, i) { return 'k' + i; }).filter(function (k) { return P.chars[k]; }); }
    function rules() {
      return modal({ title: '📜 กติกา Bangkok City – มหานครแห่งโชคลาภ', width: 920, body: '<div class="erules">' +
        '<p>🧸 <b>ใช้ได้เฉพาะตัวละคร Bangkok Collection</b> (28 ตัว) — ต้องซื้อ/ปลดล็อกก่อนเข้าเล่น • สกิลตัวละครชุดนี้ใช้ได้ทุกแมพ และมีโบนัส 🛺 เพิ่มในแมพกรุงเทพฯ</p>' +
        '<p>🏠 บ้าน/ร้านค้า Lv.1–5 และโรงแรม Lv.1–5 ธีมกรุงเทพฯ — ระดับยิ่งสูง มูลค่าและค่าเช่ายิ่งสูง</p>' +
        '<p>🎯 เลือกเป้าหมายก่อนเริ่ม: <b>50,000 / 70,000 / 100,000 G</b> • <b>ไม่จำกัดรอบ</b> — ใครทรัพย์สินถึงเป้าก่อนชนะ</p>' +
        '<p>🏙️ ช่องอีเวนต์: สุ่ม 16 เหตุการณ์ (รถติด ฝนตก สงกรานต์ ลอยกระทง เยาวราช จตุจักร BTS MRT เรือด่วน ท่อลับ ทางม้าลาย ทำบุญ ช้อปปิ้ง สตรีทฟู้ด งานวัด เลือกตั้ง)</p>' +
        '<p>🚈 BTS / Ⓜ️ MRT วาร์ปไปสถานีอื่น • ⛴️ เรือด่วนข้ามฟาก +300 G • 🛺 ตุ๊กตุ๊กพุ่ง 1–6 ช่อง + ลุ้นไอเทม • 🕳️ ท่อระบายน้ำวาร์ปสุ่ม • 🚸 ทางม้าลาย รับ 200 G หรือเดิน +1–3</p>' +
        '<p>🎲 คาสิโนแทงสูง–ต่ำ ลูกเต๋า 3 ลูก • กติกาหลักคงเดิม: ซื้อร้าน ลงทุน หุ้น เก็บ ♥♠♣♦ กลับ BANK เลื่อนระดับ (เงินเดือนในแมพนี้ ×1.8)</p>' +
        '<p>👝 จบเกมได้ <b>ถุงโชคดี</b> ตามระดับเป้าหมาย — อันดับ 1/2/3/4 ได้ <b>' + BKK.bagsByRank.join('/') + ' ถุง</b> • ถุงสูงขึ้น = รางวัลดีขึ้น (เงิน 💎 ไอเทม การ์ด กล่องสุ่ม และตัวละครกรุงเทพฯ)</p></div>', buttons: [{ t: 'เข้าใจแล้ว', v: 1, cls: 'green' }] });
    }
    function odds(tier) { var B = Meta.BAG[tier], tot = B.w.reduce(function (a, x) { return a + x[0]; }, 0), N = { gold: '🪙 Gold ' + fmt(B.gold[0]) + '–' + fmt(B.gold[B.gold.length - 1]), diamond: '💎 ' + B.dia[0] + '–' + B.dia[B.dia.length - 1], equip: '🎒 ไอเทม ×' + B.n.join('–'), card: '🃏 การ์ดพิเศษ ×' + B.n.join('–'), 'char': '🧸 ตัวละครกรุงเทพฯ' + (tier === 'blue' ? ' (ชุดเหรียญ)' : ''), boxes: '🎁 กล่องสุ่ม ×' + (tier === 'red' ? 5 : 3) };
      return B.w.map(function (x) { return N[x[1]] + ' <b>' + Math.round(x[0] / tot * 100) + '%</b>'; }).join(' • ') + ' • ทุกถุงมีโบนัส ' + fmt(B.bonus[0]) + '–' + fmt(B.bonus[1]) + ' G'; }
    function hub() {
      var P = Meta.p, sv = saved(), mine = myChars();
      if (!P.bkChar || !P.chars[P.bkChar]) P.bkChar = mine[0] || null;
      var tiers = BKK.tiers.map(function (t, i) { var n = Meta.bagCount(t.id); return '<div class="bktier' + (SEL.tier === i ? ' on' : '') + '" data-bt="' + i + '" style="--tc:' + t.color + '"><img src="' + t.img + '" draggable="false"><div class="bkt1">' + fmt(t.target) + ' G</div><div class="bkt2">' + t.name + ' • เริ่ม ' + fmt(t.start) + ' G</div>' + (n ? '<button class="small pink" data-bo="' + t.id + '">เปิดถุง ×' + n + '</button>' : '<div class="bkt2">ถุงในคลัง: 0</div>') + '</div>'; }).join('');
      var chars = BKK_CHARS.map(function (c, i) { var k = 'k' + i, own = P.chars[k]; return '<div class="rcard bkc' + (own ? ' own' : '') + (P.bkChar === k ? ' sel' : '') + '" data-kc="' + k + '">' + spr(['bkk', i], 74, 80) + '<div class="rnm">' + esc(c.name) + '</div>' + (own ? '<div class="rown">' + (P.bkChar === k ? '✅ เลือกอยู่' : 'แตะเพื่อเลือก') + '</div>' : '<button class="small ' + (c.cur === 'gold' ? 'green' : 'pink') + '" data-kb="' + k + '">' + (c.cur === 'gold' ? '🪙 ' + fmt(c.price) : '💎 ' + c.price) + '</button>') + '</div>'; }).join('');
      $('#bkkev').innerHTML = '<div class="scrhead"><div class="uibtn backbtn" id="bkBack">' + spr(['ui', 'prev'], 70, 70) + '</div><div class="title"><span class="ttl">🛺 Bangkok City – มหานครแห่งโชคลาภ</span></div><button class="small" id="bkRules" style="margin-left:auto">📜 กติกา</button></div>' +
        '<div class="scrbody"><div class="ebanner"><img src="assets/bkk_banner.webp" draggable="false"></div>' +
        '<div class="row" style="gap:14px;align-items:stretch;margin-top:12px">' +
        '<div class="panel" style="padding:12px;width:520px"><div class="tvmap" id="bkMap" style="background-image:url(assets/bg_bkk.webp)"><span>🔍 แตะเพื่อดูแผนที่</span></div>' +
        '<div style="font-weight:900;margin-top:10px">🎯 เลือกหมวดเป้าหมาย (ไม่จำกัดรอบ)</div><div class="bktiers">' + tiers + '</div>' +
        '<div class="bkodds" id="bkOdds">👝 ถุง' + ['สีน้ำเงิน', 'สีม่วง', 'สีแดงทอง'][SEL.tier] + ': ' + odds(BKK.tiers[SEL.tier].id) + '</div>' +
        '<div class="row" style="gap:4px;margin-top:6px;align-items:center"><b>สีของคุณ:</b>' + colorDots(P.color || 0, 'bkcol') + '</div>' +
        '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">' + (sv ? '<button class="green" id="bkResume" style="font-size:19px">▶ เล่นต่อ (รอบ ' + sv.round + ' • เป้า ' + fmt(sv.settings.target) + ')</button><button class="small" id="bkGo">🔄 เริ่มเกมใหม่</button>' : '<button class="pink" id="bkGo" style="font-size:20px">▶ เริ่มแข่งกับ AI 3 ตัว</button>') + '</div>' +
        '<div class="muted" style="font-size:12px;font-weight:700;margin-top:4px">อันดับ 1/2/3/4 รับถุงโชคดี ' + BKK.bagsByRank.join('/') + ' ถุง ทุกครั้งที่จบเกม • ใช้ไอเทม/การ์ดที่ติดตั้งไว้</div></div>' +
        '<div class="panel grow" style="padding:12px"><div style="font-weight:900">🧸 ตัวละคร Bangkok Collection (' + mine.length + '/28) — ' + (mine.length ? 'เลือกตัวที่จะลงแข่ง' : '<span style="color:#e53935">ต้องซื้ออย่างน้อย 1 ตัวก่อนเข้าเล่น</span>') + '</div>' +
        '<div class="bkgrid">' + chars + '</div><div id="bkInfo">' + itemInfoBox(P.bkChar) + '</div></div></div></div>';
      show('bkkev');
      var R = $('#bkkev');
      $('#bkBack').onclick = function () { show('menu'); renderMenu(); };
      $('#bkRules').onclick = function () { rules(); };
      $('#bkMap').onclick = function () { mapViewer(mapIdx(), null); };
      R.querySelectorAll('[data-bkcol]').forEach(function (e) { e.onclick = function () { P.color = +e.dataset.bkcol; Meta.save(); hub(); }; });
      R.querySelectorAll('[data-bt]').forEach(function (e) { e.onclick = function (ev) { if (ev.target.closest('[data-bo]')) return; SEL.tier = +e.dataset.bt; sfx('tap'); hub(); }; });
      R.querySelectorAll('[data-bo]').forEach(function (e) { e.onclick = function () { boxModal('bag:' + e.dataset.bo).then(hub); }; });
      R.querySelectorAll('[data-kc]').forEach(function (e) { e.onclick = function (ev) { if (ev.target.closest('[data-kb]')) return; var k = e.dataset.kc; if (P.chars[k]) { P.bkChar = k; Meta.save(); hub(); } else $('#bkInfo').innerHTML = itemInfoBox(k); }; });
      R.querySelectorAll('[data-kb]').forEach(function (e) { e.onclick = function () { var k = e.dataset.kb, c = BKK_CHARS[+k.slice(1)];
        modal({ title: '🛺 ซื้อตัวละครกรุงเทพฯ', body: '<div style="text-align:center">' + spr(['bkk', +k.slice(1)], 160, 170) + '<div style="font-weight:900;font-size:20px">' + esc(c.name) + '</div>' + skillChip(k, true) + '<div style="margin-top:8px;font-weight:800">ราคา ' + (c.cur === 'gold' ? fmt(c.price) + ' Gold (มี ' + fmt(P.gold) + ')' : c.price + ' 💎 (มี ' + P.diamond + ')') + '</div></div>', buttons: [{ t: 'ซื้อเลย', v: 1, cls: 'pink' }, { t: 'ยกเลิก', v: 0 }] })
          .then(function (v) { if (!v) return; var r = Meta.buy(k); toast(r.msg, 2600); if (r.ok) { sfx('win'); P.bkChar = k; Meta.save(); } hub(); }); }; });
      if (sv) $('#bkResume').onclick = function () { startGame(sv, false); };
      $('#bkGo').onclick = function () {
        if (!myChars().length) { toast('🧸 ต้องมีตัวละครชุดกรุงเทพฯ อย่างน้อย 1 ตัว — กดปุ่มราคาเพื่อซื้อ', 3000); return; }
        if (sv && !hub._c) { hub._c = 1; toast('กดอีกครั้งเพื่อเริ่มใหม่ (เกมที่ค้างไว้จะหายไป)', 2500); setTimeout(function () { hub._c = 0; }, 2500); return; } hub._c = 0; start(); };
    }
    function randLv() { var l = AI_LEVELS.map(function (x) { return x.id; }); return l[Math.floor(Math.random() * l.length)]; }
    function start() {
      try { localStorage.removeItem('rfs_save_bkk'); } catch (e) { }
      var P = Meta.p, v = Meta.validLoadout(), T = BKK.tiers[SEL.tier], me = P.bkChar && P.chars[P.bkChar] ? P.bkChar : myChars()[0];
      var pool = BKK_CHARS.map(function (c, i) { return 'k' + i; }).filter(function (k) { return k !== me; });
      var players = [{ name: P.name, char: me, isAI: false, loadout: { eq: v.eq, sc: v.sc }, dice: P.equip.dice }];
      for (var i = 0; i < 3; i++) { var ch = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; players.push({ name: Meta.charName(ch) + ' AI', char: ch, isAI: true, aiLevel: randLv(), persona: AI_PERSONAS[Math.floor(Math.random() * AI_PERSONAS.length)] }); }
      var cols = assignColors(players.map(function (q, k) { return k === 0 ? (P.color || 0) : -1; })); players.forEach(function (q, k) { q.color = cols[k]; });
      var s = Game.create({ bkk: { tier: SEL.tier, kind: 'solo' }, mapIdx: mapIdx(), players: players, target: T.target, startCash: T.start, maxRounds: BKK.maxRounds, rules: { endOnBankrupt: true }, seed: Math.floor(Math.random() * 1e9) });
      s.ownerIdx = 0; s.dice = P.equip.dice; s.lenName = 'Bangkok City • เป้า ' + fmt(T.target) + ' G';
      modal({ title: '🎯 เป้าหมายการแข่งขัน', width: 620, body: '<div style="text-align:center"><img src="' + T.img + '" style="height:200px" draggable="false"><div style="font-size:30px;font-weight:900;color:' + T.color + '">' + fmt(T.target) + ' G</div><div style="font-weight:800;line-height:1.7">ถุงโชคดี' + T.name + ' • ไม่จำกัดรอบ<br>ใครทรัพย์สินถึง ' + fmt(T.target) + ' G ก่อน ชนะ! • เงินเริ่มต้น ' + fmt(T.start) + ' G<br>อันดับ 1/2/3/4 รับถุง ' + BKK.bagsByRank.join('/') + ' ถุง</div></div>', buttons: [{ t: '▶ เริ่มเลย!', v: 1, cls: 'pink' }] })
        .then(function () { startGame(s, true); });
    }
    function award(g) {
      var s = g.s, me = s.players[s.ownerIdx || 0]; if (g._bag) return Promise.resolve(); g._bag = 1;
      var rk = s.ranking || [], myR = Math.max(0, rk.findIndex(function (r) { return r.id === me.id; })), T = BKK.tiers[s.bkk.tier || 0], n = BKK.bagsByRank[myR] || 1;
      if (s.bkk.kind === 'solo') { try { localStorage.removeItem('rfs_save_bkk'); } catch (e) { } }
      Meta.addBags(T.id, n);
      return modal({ title: '👝 ถุงโชคดี' + T.name, width: 640, close: false, body: '<div style="text-align:center"><img src="' + T.img + '" class="tkpop bagpop" style="height:220px" draggable="false"><div style="font-size:30px;font-weight:900;color:' + T.color + '">×' + n + ' ถุง</div><div style="font-weight:800;margin-top:6px">' + (myR === 0 ? '👑 ' : '🏅 ') + 'อันดับ ' + (myR + 1) + ' • เป้าหมาย ' + fmt(T.target) + ' G</div></div>', buttons: [{ t: '👝 เปิดถุงเลย!', v: 1, cls: 'pink' }, { t: 'เก็บไว้เปิดทีหลัง', v: 0 }] })
        .then(function (v) { if (v) return boxModal('bag:' + T.id); });
    }
    return { open: hub, hub: hub, saved: saved, award: award, rules: rules, mapIdx: mapIdx };
  })();
  U.Bkk = Bkk;
  // =====================================================================
  // TOURNAMENT — 6 worlds, 1st & 2nd go through, boxes by how far you get
  // =====================================================================
  var Tour = (function () {
    var KEY = 'rfs_tour';
    function load() { try { var t = JSON.parse(localStorage.getItem(KEY) || 'null'); return t && !t.done ? t : null; } catch (e) { return null; } }
    function save(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) { } }
    function clear() { try { localStorage.removeItem(KEY); } catch (e) { } }
    function newRivals(n, lv, avoid) {
      var pool = aiCharKeys().filter(function (k) { return avoid.indexOf(k) < 0; }), out = [];
      for (var i = 0; i < n; i++) { var ch = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; out.push({ name: Meta.charName(ch) + ' AI', char: ch, isAI: true, aiLevel: lv[i] || 'normal', persona: AI_PERSONAS[Math.floor(Math.random() * AI_PERSONAS.length)] }); }
      return out;
    }
    var confirmRestart = false;
    function savedWorld(t) { try { var s = JSON.parse(localStorage.getItem('rfs_save_tour') || 'null'); return s && !s.over && s.tour && t && s.tour.world === t.world ? s : null; } catch (e) { return null; } }
    function boxesFor(cleared, champ) { return champ ? TOUR_BOXES.champion : (TOUR_BOXES.cleared[cleared] || 0); }
    U.tourBoxesFor = boxesFor;
    // ---------- story intro (6 comic panels) ----------
    function story() {
      return new Promise(function (res) {
        var i = 0;
        var draw = function (box) {
          box.querySelector('#stP').src = 'assets/story' + (i + 1) + '.webp';
          box.querySelector('#stN').textContent = (i + 1) + ' / 6';
          box.querySelector('#stNext').textContent = i < 5 ? 'ต่อไป ▶' : 'เริ่มทัวร์นาเมนต์! 🏆';
        };
        modal({ title: '🏆 ทัวร์นาเมนต์แห่งอาณาจักรริลัคคุมะ', width: 860, close: false, body: '<img id="stP" class="storyP" draggable="false"><div class="row" style="justify-content:space-between;margin-top:10px"><span id="stN" class="chip"></span><div class="row" style="gap:8px"><button class="gray" id="stSkip">Skip ⏩</button><button class="pink" id="stNext"></button></div></div>', mount: function (box, close) {
          draw(box);
          box.querySelector('#stSkip').onclick = function () { close(); };
          box.querySelector('#stNext').onclick = function () { if (i < 5) { i++; draw(box); sfx('tap'); } else close(); };
        } }).then(res);
      });
    }
    function rules() { return modal({ title: '📜 กติกาทัวร์นาเมนต์', width: 1100, body: '<img src="assets/tour_rules.webp" style="width:100%;border-radius:14px;border:3px solid #6b4226" draggable="false">', buttons: [{ t: 'เข้าใจแล้ว', v: 1, cls: 'green' }] }); }
    // ---------- entry ----------
    function open() {
      var t = load();
      if (t) { hub(); return; }
      modal({ title: '🏆 โหมดทัวร์นาเมนต์', width: 760, body: '<div class="col" style="gap:12px;align-items:center"><img src="assets/tour_rules.webp" style="width:100%;max-height:300px;object-fit:cover;border-radius:14px;border:3px solid #6b4226" draggable="false"><div style="font-weight:700;text-align:center;line-height:1.6">แข่ง 6 เวิลด์ต่อเนื่อง • อันดับ 1–2 เท่านั้นที่ได้ไปต่อ • AI เก่งขึ้นทุกเวิลด์<br>รางวัล: ผ่าน 1 เวิลด์ 3 กล่อง → 5 → 10 → 20 → 30 • <b style="color:#d48a00">แชมป์ 50 กล่องสุ่ม!</b></div>' +
        '<div class="opt bigopt pmA" data-tm="solo" style="width:100%"><span style="font-size:40px">👤</span><div class="col" style="gap:0"><span style="font-size:22px">เล่นคนเดียว ลุยกับ AI</span><span style="font-size:13px">คุณ + AI 3 ตัว • ติด 2 อันดับแรกเพื่อไปต่อ</span></div></div>' +
        '<div class="opt bigopt pmD" data-tm="team" style="width:100%"><span style="font-size:40px">🤝</span><div class="col" style="gap:0"><span style="font-size:22px">เล่นกับเพื่อน (ทีมเดียวกัน) vs ทีม AI</span><span style="font-size:13px">ออนไลน์ • สีเดียวกัน • ทีมชนะได้ไปต่อ • ได้กล่องเท่ากันทั้งคู่</span></div></div>' +
        '<button class="small" id="tRules">📜 ดูกติกา</button></div>', mount: function (box, close) {
          box.querySelector('#tRules').onclick = function () { close(); rules().then(open); };
          box.querySelectorAll('[data-tm]').forEach(function (e) { e.onclick = function () { close(e.dataset.tm); }; });
        } }).then(function (v) {
          if (v === 'solo') story().then(function () { var me = Meta.p.equip.char; save({ kind: 'solo', world: 0, rivals: newRivals(3, TOUR_WORLDS[0].ai, [me]), hist: [] }); hub(); });
          else if (v === 'team') story().then(function () { Online.host({ tour: true }); });
        });
    }
    // ---------- hub: bracket of 6 worlds ----------
    function hub() {
      var t = load(); if (!t) { show('menu'); return; }
      var P = Meta.p, w = t.world;
      var sv = savedWorld(t);
      var cards = TOUR_WORLDS.map(function (W, i) {
        var m = MAPS[W.map], st = i < w ? 'done' : i === w ? 'cur' : 'lock';
        return '<div class="twcard ' + st + '"><div class="twimg" style="background-image:url(assets/' + m.bg + '.webp)"></div><div class="twnm">World ' + (i + 1) + '<br><b>' + m.th + '</b></div><div class="twst">' + (st === 'done' ? '✅ ผ่านแล้ว' : st === 'cur' ? '▶ รอบนี้' : '🔒') + '</div></div>';
      }).join('<div class="twarrow">➜</div>');
      var rv = t.rivals.map(function (r) { return '<div class="twriv">' + spr(Meta.charSprite(r.char), 64, 70) + '<div>' + esc(r.name) + '<br><span class="chip">' + ({ beginner: 'ง่าย', normal: 'ปานกลาง', advanced: 'เก่ง', master: 'เก่งโคตร' }[r.aiLevel]) + '</span></div></div>'; }).join('');
      $('#tour').innerHTML = '<div class="scrhead"><div class="title"><span class="ttl">🏆 ทัวร์นาเมนต์ — World ' + (w + 1) + ' / 6</span></div><div class="uibtn" id="tHome">' + spr(['ui', 'home'], 110, 80) + '</div></div>' +
        '<div class="scrbody"><div class="twrow">' + cards + '</div>' +
        '<div class="row" style="gap:18px;align-items:stretch;margin-top:14px"><div class="panel grow" style="padding:14px"><b style="font-size:18px">⚔️ คู่แข่งใน World ' + (w + 1) + ' — ' + MAPS[TOUR_WORLDS[w].map].th + '</b><div class="row" style="gap:10px;margin-top:8px;flex-wrap:wrap"><div class="twriv me">' + spr(Meta.charSprite(P.equip.char), 64, 70) + '<div>' + esc(P.name) + '<br><span class="chip">คุณ</span></div></div>' + rv + '</div>' +
        '<div class="muted" style="font-weight:700;margin-top:8px">เป้าหมาย ' + fmt(TOUR_WORLDS[w].target) + ' G • สูงสุด ' + TOUR_WORLDS[w].rounds + ' รอบ • เงินเริ่มต้น 10,000 G • ต้องติดอันดับ 1–2 เพื่อไปต่อ</div></div>' +
        '<div class="panel" style="padding:14px;width:360px"><b>🎁 รางวัลตอนนี้ถ้าตกรอบ: ' + boxesFor(w, false) + ' กล่อง</b><div class="muted" style="font-size:13px;font-weight:700">ผ่าน World ' + (w + 1) + ' แล้วตกรอบถัดไป = ' + boxesFor(w + 1, false) + ' กล่อง • แชมป์ = ' + TOUR_BOXES.champion + ' กล่อง</div>' +
        '<div style="margin-top:8px"><b>สีของคุณ:</b><div class="row" style="gap:2px;margin-top:4px">' + colorDots(P.color || 0, 'tc') + '</div></div>' +
        '<div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">' + (sv ? '<button class="green" id="tResume" style="font-size:20px">▶ เล่นต่อ World ' + (w + 1) + ' (รอบ ' + sv.round + ')</button><button class="small" id="tGo">🔄 เริ่ม World ' + (w + 1) + ' ใหม่</button>' : '<button class="pink" id="tGo" style="font-size:20px">▶ เตรียมตัวลง World ' + (w + 1) + '</button>') + '<button class="small" id="tRules2">📜 กติกา</button><button class="small gray" id="tQuit">🏳️ สละสิทธิ์</button></div></div></div></div>';
      show('tour');
      $('#tHome').onclick = function () { show('menu'); };
      $('#tRules2').onclick = function () { rules(); };
      $('#tour').querySelectorAll('[data-tc]').forEach(function (e) { e.onclick = function () { P.color = +e.dataset.tc; Meta.save(); hub(); }; });
      $('#tQuit').onclick = function () { try { localStorage.removeItem('rfs_save_tour'); } catch (e) { } modal({ title: 'สละสิทธิ์ทัวร์นาเมนต์?', body: '<div style="text-align:center;font-weight:700">ได้รางวัลตามเวิลด์ที่ผ่านมาแล้ว: ' + boxesFor(w, false) + ' กล่อง</div>', buttons: [{ t: 'สละสิทธิ์', v: 1, cls: 'pink' }, { t: 'ยกเลิก', v: 0 }] }).then(function (v) { if (!v) return; var b = boxesFor(w, false); clear(); if (b) Meta.addBoxes(b); show('menu'); if (b) boxModal(); }); };
      if (sv) $('#tResume').onclick = function () { startGame(sv, false); toast('▶ เล่นต่อ World ' + (w + 1) + ' รอบ ' + sv.round); };
      $('#tGo').onclick = function () { if (sv && !confirmRestart) { confirmRestart = true; toast('กดอีกครั้งเพื่อเริ่ม World ' + (w + 1) + ' ใหม่ (เกมที่ค้างไว้จะหายไป)', 3000); setTimeout(function () { confirmRestart = false; }, 3000); return; } confirmRestart = false; try { localStorage.removeItem('rfs_save_tour'); } catch (e) { } U.tourPending = true; U.selBak = { map: U.sel.map, slots: U.sel.slots }; U.sel.map = TOUR_WORLDS[w].map; U.sel.slots = [{ type: 'human', name: P.name, char: P.equip.char }].concat(t.rivals.map(function (r) { return { type: 'ai', char: r.char }; })); show('loadout'); renderLoadout(); toast('🏆 เลือกตัวละคร อุปกรณ์ 2 ชิ้น และการ์ดพิเศษ 1 ใบ แล้วกดเริ่ม'); };
    }
    // ---------- start a world (solo) ----------
    function startWorld() {
      var t = load(); if (!t) return false;
      var P = Meta.p, e = P.equip, v = Meta.validLoadout(), W = TOUR_WORLDS[t.world];
      var players = [{ name: P.name, char: e.char, costume: e.costume, isAI: false, loadout: { eq: v.eq, sc: v.sc }, owner: true }].concat(t.rivals.map(function (r) { return Object.assign({}, r); }));
      var cols = assignColors(players.map(function (q, k) { return k === 0 ? (P.color || 0) : -1; })); players.forEach(function (q, k) { q.color = cols[k]; });
      var s = Game.create({ mapIdx: W.map, players: players, target: W.target, startCash: 10000, maxRounds: W.rounds, rules: { tax: false, endOnBankrupt: true }, seed: Math.floor(Math.random() * 1e9) });
      s.ownerIdx = 0; s.dice = P.equip.dice; s.lenName = 'World ' + (t.world + 1); s.tour = { kind: 'solo', world: t.world };
      U.tourPending = false; if (U.selBak) { U.sel.map = U.selBak.map; U.sel.slots = U.selBak.slots; U.selBak = null; } startGame(s, true); return true;
    }
    // ---------- after a world ----------
    function statRows(g, rk, passN) {
      var s = g.s;
      return '<table class="ttable"><tr><th>อันดับ</th><th></th><th>ผู้เล่น</th><th>เงินสด</th><th>ร้านค้า</th><th>หุ้น</th><th>ทรัพย์สินรวม</th><th>ร้าน</th><th>สัญลักษณ์</th><th>สถานะ</th></tr>' + rk.map(function (r, i) {
        var p = s.players[r.id], pass = passN(p, i);
        return '<tr class="' + (pass ? 'pass' : 'out') + '"><td><b>' + (i + 1) + '</b></td><td>' + spr(charSpec(p), 46, 50) + '</td><td style="color:' + p.color + ';font-weight:900">' + esc(p.name) + '</td><td>' + fmt(p.cash) + '</td><td>' + fmt(g.propertyValue(p)) + '</td><td>' + fmt(g.stockValue(p)) + '</td><td><b>' + fmt(g.netWorth(p)) + '</b></td><td>' + g.shopsOf(p).length + '</td><td>' + SUITS.filter(function (k) { return p.suits[k]; }).map(function (k) { return SUIT_GLYPH[k]; }).join('') + '</td><td>' + (pass ? '<span class="tpass">✅ ผ่านรอบ</span>' : '<span class="tout">❌ ตกรอบ</span>') + '</td></tr>';
      }).join('') + '</table>';
    }
    function afterWorld(g) {
      U.flushModals();
      var s = g.s, T = s.tour, w = T.world, owner = s.players[s.ownerIdx || 0];
      var rk = s.ranking || s.players.map(function (p) { return { id: p.id }; });
      var team = T.kind === 'team';
      var passN = team ? function (p) { return s.winTeam >= 0 && p.team === s.winTeam; } : function (p, i) { return i < 2 && !p.bankrupt; };
      var myIdx = rk.findIndex(function (r) { return r.id === owner.id; }), iPass = passN(owner, myIdx), last = w === TOUR_WORLDS.length - 1;
      var champ = iPass && last && (team || myIdx === 0);
      Meta.matchReward(Math.max(0, myIdx), iPass, g.netWorth(owner), true);
      var status, boxes = 0, finished = false;
      if (!iPass) { boxes = boxesFor(w, false); finished = true; status = '<div class="tbanner out">❌ ตกรอบที่ World ' + (w + 1) + '</div>'; }
      else if (champ) { boxes = boxesFor(6, true); finished = true; status = '<div class="tbanner champ">👑 แชมป์ทัวร์นาเมนต์!</div>'; }
      else if (last) { boxes = TOUR_BOXES.cleared[5]; finished = true; status = '<div class="tbanner pass">🥈 รองแชมป์ทัวร์นาเมนต์!</div>'; }
      else status = '<div class="tbanner pass">✅ ผ่านเข้าสู่ World ' + (w + 2) + '!</div>';
      if (finished && boxes) Meta.addBoxes(boxes, champ);
      if (finished) { try { var tr = JSON.parse(localStorage.getItem('rfs_trophies') || '[]'); tr.unshift({ res: champ ? 'champ' : iPass ? 'runner' : 'out', world: w + 1, date: new Date().toLocaleDateString('th-TH') }); localStorage.setItem('rfs_trophies', JSON.stringify(tr.slice(0, 30))); } catch (e) { } }
      // solo bookkeeping
      if (!team) {
        var t = load();
        if (t) {
          if (finished) clear();
          else {
            var keep = rk.slice(0, 2).map(function (r) { return s.players[r.id]; }).filter(function (p) { return p.isAI; }).map(function (p) { return { name: p.name, char: p.char, isAI: true, aiLevel: p.ai.level, persona: p.ai.persona }; });
            var avoid = keep.map(function (r) { return r.char; }).concat([Meta.p.equip.char]);
            keep.forEach(function (r, k) { r.aiLevel = TOUR_WORLDS[w + 1].ai[TOUR_WORLDS[w + 1].ai.length - 1 - k]; });
            t.world = w + 1; t.rivals = keep.concat(newRivals(3 - keep.length, TOUR_WORLDS[w + 1].ai.slice(0, 3 - keep.length), avoid)); t.hist.push({ world: w, rank: myIdx + 1 }); save(t);
          }
        }
      }
      var host = !team || (U.online && U.online.role === 'host');
      var btns = finished ? '<button class="pink" id="tFin" style="font-size:20px">' + (boxes ? '🎁 รับรางวัล ' + boxes + ' กล่องสุ่ม' : 'กลับหน้าหลัก') + '</button>'
        : team ? (host ? '<button class="pink" id="tNext" style="font-size:20px">▶ ไป World ' + (w + 2) + ' กับเพื่อน</button>' : '<div class="chip" style="font-size:16px">⏳ รอโฮสต์เริ่ม World ' + (w + 2) + '...</div>')
        : '<button class="pink" id="tNext" style="font-size:20px">▶ ไปต่อ World ' + (w + 2) + '</button>';
      $('#tour').innerHTML = '<div class="scrhead"><div class="title"><span class="ttl">🏆 ผล World ' + (w + 1) + ' — ' + MAPS[s.mapIdx].th + '</span></div></div><div class="scrbody">' + status +
        '<div class="panel" style="padding:12px;margin-top:10px">' + statRows(g, rk, passN) + '<div class="muted" style="font-weight:700;margin-top:6px">เล่นไป ' + Math.min(s.round, s.settings.maxRounds) + ' รอบ • ' + esc(s.endReason || '') + (team ? ' • ทีมที่ชนะได้ไปต่อทั้งคู่' : ' • อันดับ 1–2 ได้ไปต่อ') + '</div></div>' +
        '<div class="row" style="justify-content:center;gap:12px;margin-top:14px">' + btns + '</div></div>';
      show('tour'); sfx(iPass ? 'win' : 'bad');
      var fin = $('#tFin'); if (fin) fin.onclick = function () { if (U.online) Online.leave(); if (champ) champion(g, boxes); else { show('menu'); if (boxes) boxModal(); } };
      var nx = $('#tNext'); if (nx) nx.onclick = function () { if (team) Online.nextWorld(); else hub(); };
      if (champ && finished) setTimeout(function () { champion(g, boxes); }, 1500);
    }
    // ---------- champion podium ----------
    function champion(g, boxes) {
      var s = g.s, rk = s.ranking || [];
      var spots = [[50, 61], [31.5, 67], [68.5, 69]], ord = rk.slice(0, 3);
      var chars = ord.map(function (r, i) { var p = s.players[r.id]; return '<div class="chpod" style="left:' + spots[i][0] + '%;top:' + spots[i][1] + '%;animation-delay:' + (0.3 + (2 - i) * 0.4) + 's"><div class="vplate" style="--pc:' + p.color + '"><b>' + (i + 1) + '</b>' + esc(p.name) + '</div>' + spr(charSpec(p), i === 0 ? 190 : 150, i === 0 ? 190 : 150) + '</div>'; }).join('');
      $('#tour').innerHTML = '<div class="champbg">' + chars + '<canvas id="chconf" width="1280" height="860"></canvas><div class="chbtn"><button class="pink" id="chGo" style="font-size:24px">🎁 เปิด ' + boxes + ' กล่องสุ่มแชมป์!</button></div></div>';
      show('tour'); sfx('win');
      var c = $('#chconf').getContext('2d'), conf = [], alive = true, COLS = ['#ff5d8f', '#ffd25e', '#7cc0ff', '#7fcf6b', '#b99cf0', '#ffffff'];
      for (var i = 0; i < 180; i++) conf.push({ x: Math.random() * 1280, y: -Math.random() * 860, w: 6 + Math.random() * 8, h: 10 + Math.random() * 10, r: Math.random() * 6, vy: 1.2 + Math.random() * 2.2, ph: Math.random() * 6, c: COLS[i % COLS.length] });
      (function fr() { if (!alive || !document.getElementById('chconf')) return; c.clearRect(0, 0, 1280, 860); conf.forEach(function (q) { q.y += q.vy; q.ph += 0.05; q.x += Math.sin(q.ph); q.r += 0.05; if (q.y > 880) { q.y = -20; q.x = Math.random() * 1280; } c.save(); c.translate(q.x, q.y); c.rotate(q.r); c.fillStyle = q.c; c.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); c.restore(); }); requestAnimationFrame(fr); })();
      $('#chGo').onclick = function () { alive = false; show('menu'); boxModal(); };
    }
    return { savedWorld: savedWorld, open: open, hub: hub, startWorld: startWorld, afterWorld: afterWorld, load: load, champion: champion, boxesFor: boxesFor };
  })();
  U.Tour = Tour;
  // ---------- mystery boxes ----------
  function boxModal(kind) {
    var EG = kind === 'easter', BG = kind && kind.indexOf('bag:') === 0 ? kind.slice(4) : null, P = Meta.p, n = (BG ? Meta.bagCount(BG) : EG ? P.eeggs : P.boxes) || 0; if (!n) return Promise.resolve();
    var BT = BG && BKK.tiers.find(function (t) { return t.id === BG; });
    var opener = BG ? function () { return Meta.openBag(BG); } : EG ? Meta.openEgg : Meta.openBox, img = BG ? BT.img : EG ? 'assets/easter_egg.webp' : 'assets/box.webp';
    return modal({ title: BG ? '👝 ถุงโชคดี' + BT.name + ' (' + fmt(BT.target) + ' G)' : EG ? '🥚 ไข่อีสเตอร์สุ่ม' : '🎁 กล่องสุ่มของรางวัล', width: 1060, close: false, bgClose: false, body: '<div id="bxB"></div>', buttons: [], mount: function (box, close) {
      var B = box.querySelector('#bxB'), cells = []; if (BG) B.className = 'bagfx bag-' + BG;
      for (var i = 0; i < n; i++) cells.push(null);
      function cellHTML(c, i) {
        if (!c) return '<div class="bxcell" data-bx="' + i + '"><img class="bximg" src="' + img + '" draggable="false"><div class="bxtap">แตะเพื่อเปิด!</div></div>';
        var main = c.items[0], rest = c.items.slice(1);
        var ic = main.spr ? spr(main.spr, 120, 104) : '<div style="font-size:80px;line-height:104px">' + main.ic + '</div>';
        return '<div class="bxcell open ' + (main.big ? 'big' : '') + '"><div class="bxburst"></div>' + ic + (main.tag ? '<div class="bxtag">✨ ' + esc(main.tag) + ' ใหม่!</div>' : '') + '<div class="bxname">' + esc(main.name) + '</div>' + rest.map(function (r) { return '<div class="bxsub">' + esc(r.name) + '</div>'; }).join('') + '</div>';
      }
      function draw() {
        var left = cells.filter(function (c) { return !c; }).length;
        B.innerHTML = '<div style="text-align:center;font-weight:800;font-size:17px;margin-bottom:8px">' + (left ? (BG ? 'มีถุงโชคดีรอเปิด ' : EG ? 'มีไข่อีสเตอร์รอเปิด ' : 'มีกล่องสุ่มรอเปิด ') + '<b style="color:#ff5d8f;font-size:24px">' + left + '</b> ' + (BG ? 'ถุง' : EG ? 'ฟอง' : 'กล่อง') + ' • แตะเพื่อเปิด!' : '🎉 เปิดครบแล้ว! ของรางวัลเข้ากระเป๋าแล้ว') + '</div>' +
          '<div class="bxgrid">' + cells.map(cellHTML).join('') + '</div>' +
          '<div class="row" style="justify-content:center;gap:10px;margin-top:12px">' + (left ? '<button class="pink" id="bxAll">🎁 เปิดทั้งหมด</button><button class="gray" id="bxLater">เก็บไว้เปิดทีหลัง</button>' : '<button class="green" id="bxOk">เยี่ยมเลย!</button>') + '</div>';
        B.querySelectorAll('[data-bx]').forEach(function (e) { e.onclick = function () { openOne(+e.dataset.bx); }; });
        var a = B.querySelector('#bxAll'); if (a) a.onclick = function () { var k = 0; cells.forEach(function (c, i) { if (!c) setTimeout(function () { openOne(i); }, 260 * k++); }); };
        var l = B.querySelector('#bxLater'); if (l) l.onclick = function () { close(); };
        var o = B.querySelector('#bxOk'); if (o) o.onclick = function () { close(); };
      }
      function openOne(i) {
        if (cells[i]) return; var el = B.querySelector('[data-bx="' + i + '"]'); if (!el || el.classList.contains('shake')) return;
        el.classList.add('shake'); sfx('tap');
        setTimeout(function () { var r = opener(); if (!r) return; cells[i] = r; sfx(r.items[0].big ? 'win' : 'coin'); draw(); try { renderMenu(); } catch (e) { } }, 520);
      }
      draw();
    } });
  }
  // ---------- enlarge a map before choosing it ----------
  function mapViewer(i, onPick) {
    var m = MAPS[i], b = Game.buildBoard(i);
    return modal({ title: '🗺️ ' + esc(m.th) + ' — ' + esc(m.name), width: 1180, body: '<div class="mview" id="mvW"><div id="mvI" style="background-image:url(assets/' + m.bg + '.webp)"></div><div class="zbtns mvz"><button class="small" id="mvP">＋</button><button class="small" id="mvM">－</button><button class="small" id="mvF">⤢</button></div></div><div style="text-align:center;font-weight:800;margin-top:6px;font-size:13px;line-height:1.7">' + m.districts.map(function (d) { return '<span style="display:inline-block;width:18px;height:12px;border-radius:4px;background:' + d.color + ';border:2px solid #6b4226;vertical-align:middle"></span> ' + esc(d.th); }).join(' &nbsp; ') + '<div class="muted" style="font-size:13px">' + b.tiles.length + ' ช่อง • ' + b.tiles.filter(function (t) { return t.type === 'shop'; }).length + ' ร้าน • ลากเพื่อเลื่อน • หมุนล้อ/จีบนิ้ว หรือกด ＋ － เพื่อซูม</div></div>', buttons: [{ t: '✔ เลือกแผนที่นี้', v: 1, cls: 'pink' }, { t: 'ปิด', v: 0 }], mount: function (box) {
      var W = box.querySelector('#mvW'), I = box.querySelector('#mvI'), vw = W.clientWidth || 1000, vh = W.clientHeight || 540, iw = b.w || 1536, ih = b.h || 1024;
      var base = Math.min(vw / iw, vh / ih), z = 1, tx = 0, ty = 0, pts = {}, st = null;
      I.style.width = iw * base + 'px'; I.style.height = ih * base + 'px';
      function clamp() { var w = iw * base * z, h = ih * base * z; tx = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, tx)); ty = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, ty)); }
      function apply() { clamp(); I.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + z + ')'; }
      function zoomAt(nz, cx, cy) { nz = Math.max(1, Math.min(4, nz)); tx = cx - (cx - tx) * nz / z; ty = cy - (cy - ty) * nz / z; z = nz; apply(); }
      function loc(e) { var r = W.getBoundingClientRect(), k = r.width / vw; return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; }
      box.querySelector('#mvP').onclick = function () { zoomAt(z * 1.4, vw / 2, vh / 2); };
      box.querySelector('#mvM').onclick = function () { zoomAt(z / 1.4, vw / 2, vh / 2); };
      box.querySelector('#mvF').onclick = function () { z = 1; apply(); };
      W.addEventListener('wheel', function (e) { e.preventDefault(); var p = loc(e); zoomAt(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), p.x, p.y); }, { passive: false });
      W.addEventListener('pointerdown', function (e) { if (e.target.closest('.mvz')) return; W.setPointerCapture(e.pointerId); pts[e.pointerId] = loc(e); st = { tx: tx, ty: ty, z: z, p: Object.assign({}, pts) }; });
      W.addEventListener('pointermove', function (e) {
        if (!pts[e.pointerId]) return; pts[e.pointerId] = loc(e); var ids = Object.keys(pts), s0 = Object.keys(st.p);
        if (ids.length >= 2 && s0.length >= 2) { var a = pts[ids[0]], c = pts[ids[1]], a0 = st.p[s0[0]], c0 = st.p[s0[1]]; if (!a0 || !c0) return; var d = Math.hypot(a.x - c.x, a.y - c.y), d0 = Math.hypot(a0.x - c0.x, a0.y - c0.y) || 1; z = st.z; tx = st.tx; ty = st.ty; zoomAt(st.z * d / d0, (a0.x + c0.x) / 2, (a0.y + c0.y) / 2); }
        else if (ids.length === 1 && st.p[ids[0]]) { tx = st.tx + pts[ids[0]].x - st.p[ids[0]].x; ty = st.ty + pts[ids[0]].y - st.p[ids[0]].y; apply(); }
      });
      function up(e) { delete pts[e.pointerId]; st = { tx: tx, ty: ty, z: z, p: Object.assign({}, pts) }; }
      W.addEventListener('pointerup', up); W.addEventListener('pointercancel', up);
      apply();
    } }).then(function (v) { if (v && onPick) onPick(); });
  }
  function showResultPage(g) {
    U.flushModals();
    var s = g.s, owner = s.players[s.ownerIdx || 0];
    var rk = s.ranking || s.players.map(function (p) { return { id: p.id, nw: g.netWorth(p) }; }).sort(function (a, b) { return b.nw - a.nw; });
    var myRank = rk.findIndex(function (r) { return r.id === owner.id; });
    if (s.teams && s.winTeam >= 0) myRank = owner.team === s.winTeam ? Math.min(myRank, 1) : Math.max(myRank, 2);
    var reward = !owner.isAI ? Meta.matchReward(myRank, s.winner === owner.id || (s.teams && s.winTeam >= 0 && owner.team === s.winTeam), g.netWorth(owner), !!(s.train || s.bkk)) : null;
    if (reward && s.train) { reward.boxes = s.teams && s.winTeam >= 0 ? (owner.team === s.winTeam ? TRAIN.team.winBoxes : TRAIN.team.loseBoxes) : (TRAIN.rankBoxes[myRank] || 0); Meta.addBoxes(reward.boxes); }
    try { var L = JSON.parse(localStorage.getItem('rfs_results') || '[]'); L.unshift({ map: MAPS[s.mapIdx].th, rank: myRank + 1, nw: g.netWorth(owner), date: new Date().toLocaleDateString('th-TH') }); localStorage.setItem('rfs_results', JSON.stringify(L.slice(0, 20))); } catch (e) { }
    var W = 560, H = 220, mx = Math.max.apply(null, s.players.map(function (p) { return Math.max.apply(null, p.hist.concat([g.netWorth(p), 1])); }));
    var lines = s.players.map(function (p) { var h = p.hist.concat([g.netWorth(p)]); if (h.length < 2) h = [h[0], h[0]]; return '<polyline fill="none" stroke="' + p.color + '" stroke-width="4" points="' + h.map(function (v, i) { return (i / (h.length - 1) * W).toFixed(1) + ',' + (H - v / mx * (H - 10)).toFixed(1); }).join(' ') + '"/>'; }).join('');
    var ranks = rk.map(function (r, i) { var p = s.players[r.id]; return '<div class="row panel" style="padding:8px 14px;gap:14px;' + (i === 0 ? 'background:#fff3a8' : '') + '">' + spr(['ui', [55, 57, 59, 61][i]], 140, 40) + spr(charSpec(p), 70, 74) + '<div class="grow"><div style="font-weight:900;font-size:20px;color:' + p.color + '">' + esc(p.name) + (p.bankrupt ? ' 💥' : '') + '</div><div style="font-weight:800">ทรัพย์สิน ' + fmt(r.nw) + ' G • ร้าน ' + g.shopsOf(p).length + ' • Lv' + p.level + '</div></div></div>'; }).join('');
    $('#result').innerHTML = '<div class="scrhead"><div class="title"><span class="ttl">🏆 ผลการแข่งขัน — ' + MAPS[s.mapIdx].th + '</span></div><div class="uibtn" id="resMenu">' + spr(['ui', 'home'], 110, 80) + '</div></div><div class="scrbody"><div class="row" style="align-items:flex-start;gap:20px"><div class="col" style="width:600px">' + ranks + '<div class="panel" style="padding:10px;font-weight:800">' + esc(s.endReason || '') + '</div></div><div class="col" style="width:610px"><div class="panel" style="padding:12px"><b>กราฟทรัพย์สินรายรอบ</b><svg width="' + W + '" height="' + H + '" style="margin-top:6px;background:#fffdf5;border-radius:12px">' + lines + '</svg></div>' + (reward ? '<div class="panel" style="padding:12px;text-align:center;font-weight:900;font-size:20px">🎁 รางวัล: +' + fmt(reward.gold) + ' Gold Coin' + (reward.diamond ? ' • +' + reward.diamond + ' 💎' : '') + ' • 🎁 กล่องสุ่ม ×' + reward.boxes + '<div style="font-size:14px">ใช้ซื้อไอเทมในร้านค้าได้เลย!</div><button class="pink small" id="resBox" style="margin-top:6px">🎁 เปิดกล่องสุ่ม</button></div>' : '') + '<div class="panel" style="padding:12px;text-align:center">' + (s.winner !== null && s.winner !== undefined ? spr(charSpec(s.players[s.winner]), 200, 200) + '<div style="font-size:26px;font-weight:900">' + esc(s.players[s.winner].name) + ' ชนะ!</div>' : '') + '</div></div></div></div>';
    $('#resMenu').onclick = function () { show('menu'); };
    show('result'); sfx('win');
    var rb = $('#resBox'); if (rb) rb.onclick = function () { if (Meta.p.boxes > 0) boxModal(); else toast('เปิดกล่องครบแล้ว'); };
    if (reward && Meta.p.boxes > 0 && !s.tour) setTimeout(function () { U.flushModals(); boxModal(); }, 600);
  }

  // =====================================================================
  // SHOP (7 categories) — real purchases into Inventory, atomic, with history
  // =====================================================================
  var SH = { cat: 'rec', sort: 'popular' };
  var SHOP_CATS = [['rec', '⭐ ไอเทมแนะนำ'], ['dice', '🎲 ลูกเต๋า'], ['chars', '🐻 ตัวละคร'], ['equip', '🎲 อุปกรณ์เกม'], ['cards', '🃏 การ์ดพิเศษ'], ['packs', '🎁 แพ็กเกจพิเศษ'], ['exch', '💱 แลกเปลี่ยน'], ['hist', '🧾 ประวัติ']];
  function openShop(cat) { SH.cat = cat || 'rec'; renderShop(); show('shop'); }
  function renderShop() {
    var P = Meta.p;
    var head = '<div class="scrhead">' + '<div class="uibtn backbtn" id="shBack">' + spr(['ui', 'prev'], 70, 70) + '</div>' + '<div class="title"><span class="ttl">ร้านค้า SHOP</span></div><span class="chip coin" style="font-size:18px">' + fmt(P.gold) + '</span><span class="chip" style="font-size:18px">💎 ' + fmt(P.diamond) + '</span><div class="uibtn" id="shInv">' + spr(['ui', 'assets'], 100, 72) + '</div></div>';
    var tabs = '<div class="tabs" style="margin-bottom:12px">' + SHOP_CATS.map(function (c) { return '<div class="tab ' + (SH.cat === c[0] ? 'on' : '') + '" data-cat="' + c[0] + '">' + c[1] + '</div>'; }).join('') + '</div>';
    var body = '';
    if (SH.cat === 'exch') {
      body = '<div class="row" style="gap:14px;justify-content:center">' + EXCHANGE.map(function (x) { return '<div class="sitem" style="width:260px">' + spr(x.spr, 140, 110) + '<div class="nm">' + x.th + '</div><button class="green" data-ex="' + x.id + '">แลก</button></div>'; }).join('') + '</div><div class="panel" style="margin-top:14px;padding:12px;font-weight:800">Gold Coin: ได้จากการเล่นเกม ภารกิจ และรางวัลประจำวัน • Diamond: ได้จากรางวัลพิเศษ Achievement และกิจกรรม (ใช้ซื้อสินค้าพรีเมียม)</div>';
    } else if (SH.cat === 'hist') {
      body = '<div class="panel" style="padding:10px"><table style="width:100%;font-weight:700;border-collapse:collapse"><tr style="background:#ffe2a8"><th>เวลา</th><th>ประเภท</th><th>รายการ</th><th>จำนวน</th><th>Transaction</th></tr>' + (P.hist.map(function (h) { return '<tr><td>' + new Date(h.t).toLocaleString('th-TH') + '</td><td>' + h.kind + '</td><td>' + esc(h.name || h.id || '') + '</td><td>' + (h.amt ? (h.amt > 0 ? '+' : '') + fmt(h.amt) + (h.cur === 'gold' ? ' G' : h.cur === 'diamond' ? ' 💎' : '') : '-') + '</td><td style="font-size:11px">' + h.tx + '</td></tr>'; }).join('') || '<tr><td colspan=5 style="text-align:center">ยังไม่มีประวัติ</td></tr>') + '</table></div>';
    } else {
      var list;
      if (SH.cat === 'rec') {
        var ids = ['pk_begin', 'eq_golden', 'SC_upg', 'pk_lucky', 'x3', 'eq_rent', 'g2', 'SC_cash', 'eq_travel', 'dice_2', 'b4', 'eq_lucky', 'SC_stock'];
        list = ids.map(Meta.item).filter(Boolean);
        var srt = SH.sort;
        if (srt === 'new') list = list.filter(function (i) { return Meta.tags(i.id).indexOf('new') >= 0; });
        if (srt === 'sale') list = list.filter(function (i) { return Meta.tags(i.id).indexOf('sale') >= 0; });
        if (srt === 'limited') list = list.filter(function (i) { return Meta.tags(i.id).indexOf('limited') >= 0; });
        if (srt === 'notown') list = list.filter(function (i) { return !Meta.owned(i.id); });
        if (srt === 'popular') list.sort(function (a, b) { return (Meta.tags(b.id).indexOf('hot') >= 0) - (Meta.tags(a.id).indexOf('hot') >= 0); });
        body += '<div class="tabs" style="margin-bottom:10px">' + [['popular', '🔥 ยอดนิยม'], ['new', '🆕 ใหม่'], ['sale', '💸 ลดราคา'], ['limited', '⏰ จำกัดเวลา'], ['notown', '🎒 ที่ยังไม่มี']].map(function (x) { return '<div class="tab ' + (SH.sort === x[0] ? 'on' : '') + '" data-srt="' + x[0] + '" style="font-size:13px;padding:5px 10px">' + x[1] + '</div>'; }).join('') + '</div>';
      } else if (SH.cat === 'dice') list = Meta.all().filter(function (i) { return i.type === 'Dice Skins'; }).sort(function (a, b) { return (/^dice_(1[3-9]|20)$/.test(b.id) ? 1 : 0) - (/^dice_(1[3-9]|20)$/.test(a.id) ? 1 : 0); });
      else list = Meta.all().filter(function (i) { return i.cat === SH.cat && !i.eggOnly; }).sort(function (a, b) { return (b.type === 'Dice Skins' ? 1 : 0) - (a.type === 'Dice Skins' ? 1 : 0); });
      body += '<div class="shopgrid">' + list.map(function (it) {
        var q = Meta.owned(it.id), tg = Meta.tags(it.id), price = Meta.priceOf(it), own = it.uniq && q;
        return '<div class="sitem">' + (tg.length ? '<span class="tag">' + tg.map(function (x) { return { hot: 'HOT', new: 'NEW', sale: '-20%', limited: 'LIMITED' }[x]; }).join(' ') + '</span>' : '') + (q ? '<span class="own">' + (it.uniq ? 'มีแล้ว' : 'x' + q) + '</span>' : '') + '<div style="height:110px;display:flex;align-items:center">' + spr(it.spr, 130, 105) + '</div><div class="nm">' + it.name + '</div><div class="ds">' + it.desc + '</div><button class="small ' + (it.cur === 'gold' ? '' : 'blue') + '" data-buy="' + it.id + '" ' + (own ? 'disabled' : '') + '>' + (own ? 'มีแล้ว' : (it.cur === 'gold' ? '<span class="coin"></span>' : '💎 ') + fmt(price) + (price !== it.price ? ' <s style="font-size:11px">' + fmt(it.price) + '</s>' : '')) + '</button></div>';
      }).join('') + '</div>';
    }
    $('#shop').innerHTML = head + '<div class="scrbody">' + tabs + body + '</div>';
    $('#shBack').onclick = function () { show('menu'); };
    $('#shInv').onclick = function () { openInventory(); };
    document.querySelectorAll('#shop [data-cat]').forEach(function (e) { e.onclick = function () { SH.cat = e.dataset.cat; renderShop(); }; });
    document.querySelectorAll('#shop [data-srt]').forEach(function (e) { e.onclick = function () { SH.sort = e.dataset.srt; renderShop(); }; });
    document.querySelectorAll('#shop [data-buy]').forEach(function (e) {
      e.onclick = function () {
        var it = Meta.item(e.dataset.buy), price = Meta.priceOf(it);
        var isD = it.type === 'Dice Skins' && it.spr && it.spr[0] === 'cdice', multi = !it.uniq, bal = it.cur === 'gold' ? P.gold : P.diamond, maxQ = Math.max(1, Math.min(99, Math.floor(bal / Math.max(1, price)))), Q = 1;
        var qtyUI = multi ? '<div class="qtybox"><button class="qb" data-q="-10">−10</button><button class="qb" data-q="-1">−</button><input id="qIn" type="number" min="1" max="99" value="1" inputmode="numeric"><button class="qb" data-q="1">+</button><button class="qb" data-q="10">+10</button><button class="qb max" data-q="max">สูงสุด</button></div><div class="muted" style="font-size:12px;font-weight:700">มีอยู่ ' + Meta.owned(it.id) + ' • ซื้อได้สูงสุด ' + maxQ + ' ชิ้น</div>' : '';
        modal({ title: 'ยืนยันการซื้อ', mount: function (box) {
            if (isD) dicePreview(box.querySelector('.diceprev'), it.id);
            if (!multi) return; var inp = box.querySelector('#qIn'), tot = box.querySelector('#qTot');
            var setQ = function (v) { Q = Math.max(1, Math.min(99, Math.floor(+v || 1))); inp.value = Q; var t = price * Q; tot.innerHTML = 'รวม ' + fmt(t) + (it.cur === 'gold' ? ' Gold Coin' : ' Diamond') + (t > bal ? ' <span style="color:#e53935">(ไม่พอ)</span>' : ''); };
            box.querySelectorAll('[data-q]').forEach(function (e) { e.onclick = function () { sfx('tap'); setQ(e.dataset.q === 'max' ? maxQ : Q + (+e.dataset.q)); }; });
            inp.oninput = function () { setQ(inp.value); }; setQ(1);
          }, body: '<div class="col" style="align-items:center;min-width:420px">' + (isD ? '<div class="diceprev"></div><div class="muted" style="font-size:12px;font-weight:700">👀 ตัวอย่างเอฟเฟกต์ตอนทอย</div>' : spr(it.spr, 150, 120)) + '<div style="font-weight:900;font-size:20px">' + it.name + '</div><div style="font-weight:700">' + it.desc + '</div><div class="chip">ราคา ' + fmt(price) + (it.cur === 'gold' ? ' Gold Coin' : ' Diamond') + (multi ? ' / ชิ้น' : '') + '</div>' + qtyUI + (multi ? '<div id="qTot" class="chip" style="background:#fff3c4;font-size:17px"></div>' : '') + '</div>', buttons: [{ t: 'ซื้อ', v: 1, cls: 'green' }, { t: 'ยกเลิก', v: 0 }] })
          .then(function (ok) { if (!ok) return; var r = Meta.buy(it.id, Q); toast((r.ok ? '✅ ' : '⚠️ ') + r.msg); if (r.ok) sfx('coin'); renderShop(); });
      };
    });
    document.querySelectorAll('#shop [data-ex]').forEach(function (e) { e.onclick = function () { var x = EXCHANGE.find(function (y) { return y.id === e.dataset.ex; }); var r = Meta.exchange(x); toast((r.ok ? '✅ ' : '⚠️ ') + r.msg); renderShop(); }; });
  }

  // =====================================================================
  // INVENTORY
  // =====================================================================
  var INV_TABS = ['🎽 ติดตั้ง', 'Characters', 'Game Equipment', 'Special Cards', 'Packages', 'Dice Skins', 'Other Items'];
  var IV = { tab: '🎽 ติดตั้ง' };
  function openInventory(tab) { if (tab) IV.tab = tab; renderInventory(); show('inventory'); }
  // ---------- "ติดตั้ง" tab: one saved loadout used by every mode ----------
  var EQS = { slot: 0, info: null };
  function itemInfoBox(id) {
    if (!id) return '<div class="iinfo muted">👆 แตะไอเทมหรือตัวละครเพื่อดูสรรพคุณ</div>';
    if (/^[bxjgersk]\d+$/.test(id)) { var sk = Meta.charSkill(id); return '<div class="iinfo">' + spr(Meta.charSprite(id), 46, 50) + '<div><b>' + esc(Meta.charName(id)) + '</b><br>' + (sk ? '⭐ <b>' + esc(sk.name) + '</b>: ' + esc(sk.desc) + (sk.ename ? '<br>' + (sk.etag || '🥚') + ' <b>' + esc(sk.ename) + '</b> (' + (sk.elabel || 'อีสเตอร์') + '): ' + esc(sk.edesc) : '') : 'ไม่มีสกิลพิเศษ') + '</div></div>'; }
    var it = Meta.item(id); if (!it) return ''; return '<div class="iinfo">' + spr(it.spr, 46, 44) + '<div><b>' + esc(it.name) + '</b> <span class="chip" style="font-size:11px">' + (/^SC_/.test(id) ? 'การ์ดพิเศษ' : /^dice/.test(id) ? 'สกินลูกเต๋า' : 'อุปกรณ์') + ' • มี ' + (Meta.owned(id) || (Meta.p.dice[id] ? 1 : 0)) + '</span><br>' + esc(it.desc || it.th || '') + '</div></div>';
  }
  function renderEquipTab(box) {
    var P = Meta.p, e = P.equip, v = Meta.validLoadout(); e.eq = v.eq; e.sc = v.sc;
    var chars = allCharKeys().filter(function (k) { return P.chars[k]; }).map(function (k) {
      return '<div class="charbtn ' + (e.char === k ? 'sel ' : '') + (k[0] === 'g' ? 'goldc' : '') + '" data-ec="' + k + '" title="' + esc(Meta.charName(k)) + '" style="height:80px">' + spr(Meta.charSprite(k), 52, 68) + '</div>';
    }).join('') + EASTER_CHARS.map(function (c, i) { var k = 'e' + i; return P.chars[k] ? '' : '<div class="charbtn lock" data-elock="' + k + '" title="' + esc(c.name) + ' — ได้จากไข่อีสเตอร์" style="height:80px">' + spr(['easter', i], 52, 68) + '</div>'; }).join('');
    var dice = DICE_SKINS.filter(function (d) { return P.dice[d.id]; }).map(function (d) {
      return '<div class="invitem ' + (e.dice === d.id ? 'eqd' : '') + '" data-ed="' + d.id + '" style="padding:4px">' + spr(d.spr, 60, 56) + '<div style="font-size:11px">' + d.name + '</div></div>';
    }).join('');
    var slot = function (k) {
      var id = k === 'sc' ? e.sc : e.eq[k], it = id && Meta.item(id), on = EQS.slot === k;
      return '<div class="eqslot ' + (it ? 'filled' : '') + '" data-es="' + k + '" style="width:90px;height:126px;' + (on ? 'outline:5px solid #ff7aa8' : '') + '">' + (it ? spr(it.spr, 56, 50) + '<div style="font-size:11px">' + it.name + '</div><div style="font-size:10px;color:#c0392b">แตะซ้ำเพื่อถอด</div>' : '<div style="font-size:28px">＋</div><div style="font-size:12px">' + (k === 'sc' ? 'การ์ดพิเศษ' : 'อุปกรณ์ ' + (k + 1)) + '</div>') + '</div>';
    };
    var items = EQUIPMENT.concat(SPECIAL_CARDS).filter(function (it) { return Meta.owned(it.id) > 0; }).map(function (it) {
      var isSC = /^SC_/.test(it.id), eqd = isSC ? e.sc === it.id : e.eq.indexOf(it.id) >= 0;
      return '<div class="invitem' + (eqd ? ' eqd' : '') + '" data-ei="' + it.id + '" title="' + esc(it.th || it.desc || '') + '" style="padding:4px"><span class="q">x' + Meta.owned(it.id) + '</span>' + spr(it.spr, 54, 50) + '<div style="font-size:11px">' + it.name + '</div><div style="font-size:9px;font-weight:700">' + (isSC ? 'การ์ดพิเศษ' : 'อุปกรณ์') + '</div></div>';
    }).join('') || '<div class="muted" style="font-weight:700">ยังไม่มีอุปกรณ์/การ์ดพิเศษ — ซื้อได้ที่ร้านค้า หรือได้จากกล่องสุ่ม</div>';
    var dk = DICE_SKINS.find(function (d) { return d.id === e.dice; }) || DICE_SKINS[0];
    box.innerHTML = '<div class="row" style="align-items:flex-start;gap:14px">' +
      '<div class="col" style="width:520px;gap:10px"><div class="panel" style="padding:10px"><b>1) ตัวละคร</b> <span class="muted" style="font-size:12px">(' + (chars.split('data-ec').length - 1) + ' ตัวที่มี)</span><div class="charpick" style="margin-top:6px;max-height:262px">' + chars + '</div></div>' +
      '<div class="panel" style="padding:10px"><b>2) สกินลูกเต๋า</b><div class="invgrid" style="grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px;margin-top:6px;max-height:190px;overflow:auto">' + dice + '</div></div></div>' +
      '<div class="col" style="width:290px;align-items:center;gap:8px"><div class="panel" style="padding:12px;width:100%;text-align:center">' + spr(Meta.charSprite(e.char), 190, 180) + '<div style="font-weight:900;font-size:20px">' + Meta.charName(e.char) + '</div>' + skillChip(e.char, true) + '<div class="row" style="justify-content:center;gap:6px;margin-top:6px;font-weight:800">' + spr(dk.spr, 46, 44) + dk.name + '</div></div>' +
      '<button class="pink" id="eqSave" style="font-size:20px;width:100%">💾 บันทึกการติดตั้ง</button><div class="muted" style="font-size:12px;font-weight:700;text-align:center">ใช้กับทุกโหมดอัตโนมัติ: เล่นกับ AI • ออนไลน์ • ทัวร์นาเมนต์</div></div>' +
      '<div class="col" style="width:400px;gap:10px"><div class="panel" style="padding:10px"><b>3) ไอเทมติดตัว (อุปกรณ์ 3 + การ์ด 1)</b><div class="row" style="gap:5px;margin-top:6px;justify-content:center">' + slot(0) + slot(1) + slot(2) + slot('sc') + '</div><div class="muted" style="font-size:11px;font-weight:700;margin-top:4px">อุปกรณ์ 3 ชิ้น + การ์ดพิเศษ 1 ใบ • ไอเทมถูกหักเมื่อใช้จริงในเกม</div></div>' +
      '<div class="panel" style="padding:10px"><b>ไอเทมที่มี — แตะเพื่อใส่ช่องที่เลือก</b><div class="invgrid" style="grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:6px;margin-top:6px;max-height:200px;overflow:auto">' + items + '</div>' + itemInfoBox(EQS.info) + '</div></div></div>';
    var re = function () { Meta.save(); renderEquipTab(box); };
    box.querySelectorAll('[data-ec]').forEach(function (x) { x.onclick = function () { e.char = x.dataset.ec; EQS.info = x.dataset.ec; sfx('tap'); re(); }; });
    box.querySelectorAll('[data-elock]').forEach(function (x) { x.onclick = function () { EQS.info = x.dataset.elock; re(); toast('🥚 ตัวละครอีสเตอร์ (หายาก) ได้จากไข่อีสเตอร์สุ่มเท่านั้น', 2500); }; });
    box.querySelectorAll('[data-ed]').forEach(function (x) { x.onclick = function () { e.dice = x.dataset.ed; EQS.info = x.dataset.ed; sfx('tap'); re(); }; });
    box.querySelectorAll('[data-es]').forEach(function (x) { x.onclick = function () { var k = x.dataset.es === 'sc' ? 'sc' : +x.dataset.es; var sid = k === 'sc' ? e.sc : e.eq[k]; if (sid) EQS.info = sid; if (EQS.slot === k) { if (k === 'sc') e.sc = null; else e.eq.splice(k, 1); } EQS.slot = k; re(); }; });
    box.querySelectorAll('[data-ei]').forEach(function (x) {
      x.onclick = function () {
        var id = x.dataset.ei; EQS.info = id;
        if (/^SC_/.test(id)) { e.sc = e.sc === id ? null : id; EQS.slot = 'sc'; }
        else {
          var at = e.eq.indexOf(id);
          if (at >= 0) e.eq.splice(at, 1);
          else { var s = typeof EQS.slot === 'number' ? EQS.slot : (e.eq.length < 3 ? e.eq.length : 2); if (s > e.eq.length) s = e.eq.length; e.eq[s] = id; e.eq = e.eq.slice(0, 3); EQS.slot = e.eq.length < 2 ? e.eq.length : 'sc'; }
        }
        sfx('tap'); re();
      };
    });
    box.querySelector('#eqSave').onclick = function () { Meta.save(); sfx('win'); toast('💾 บันทึกแล้ว! ' + Meta.charName(e.char) + ' • ' + dk.name + ' • ไอเทม ' + (e.eq.length + (e.sc ? 1 : 0)) + '/3 — ใช้กับทุกโหมด'); };
  }
  function renderInventory() {
    var P = Meta.p, items = [];
    if (IV.tab === 'Characters') { allCharKeys().forEach(function (k) { if (P.chars[k]) items.push({ id: k, name: Meta.charName(k), spr: Meta.charSprite(k), q: 1, eq: P.equip.char === k }); }); allCharKeys().forEach(function (k) { if (!P.chars[k] && (k[0] === 'r' || k[0] === 'e' || k[0] === 's' || k[0] === 'k')) items.push({ id: k, name: Meta.charName(k), spr: Meta.charSprite(k), q: 0, lockedHow: k[0] === 'r' ? '🎫 แลกตั๋วทอง' : k[0] === 'e' ? '🥚 จากไข่อีสเตอร์' : k[0] === 'k' ? '🛺 ร้านค้า/ถุงโชคดี' : '💎 ร้านค้า' }); }); }
    else if (IV.tab === 'Dice Skins') { DICE_SKINS.forEach(function (d) { if (P.dice[d.id]) items.push({ id: d.id, name: d.name, spr: d.spr, q: 1, eq: P.equip.dice === d.id }); }); }
    else if (IV.tab === 'Packages') { items = []; }
    else if (IV.tab === 'Other Items') { items = []; }
    else {
      Meta.all().forEach(function (it) { if (it.type === IV.tab && Meta.owned(it.id)) items.push({ id: it.id, name: it.name, spr: it.spr, q: Meta.owned(it.id), desc: it.desc, eq: P.equip.eq.indexOf(it.id) >= 0 || P.equip.sc === it.id }); });
    }
    var setupTab = IV.tab === '🎽 ติดตั้ง';
    var grid = setupTab ? '<div id="eqTab"></div>' : items.length ? '<div class="invgrid">' + items.map(function (i) { return '<div class="invitem ' + (i.eq ? 'eqd' : '') + (i.lockedHow ? ' dim' : '') + '" data-iv="' + i.id + '">' + (i.lockedHow ? '<span class="q">🔒</span>' : '<span class="q">x' + i.q + '</span>') + spr(i.spr, 90, 84) + '<div>' + i.name + '</div>' + (i.lockedHow ? '<div style="font-size:11px;color:#a0522d">' + i.lockedHow + '</div>' : '') + (i.eq ? '<div style="font-size:11px;color:#2c8a2c">ติดตั้ง/ใช้งานอยู่</div>' : '') + '</div>'; }).join('') + '</div>' : '<div class="panel" style="padding:20px;text-align:center;font-weight:800">' + (IV.tab === 'Packages' ? 'แพ็กเกจจะถูกแยกสินค้าเข้า Inventory ตามประเภทอัตโนมัติเมื่อซื้อ' : 'ยังไม่มีไอเทมในหมวดนี้') + '</div>';
    $('#inventory').innerHTML = '<div class="scrhead">' + '<div class="uibtn backbtn" id="ivBack">' + spr(['ui', 'prev'], 70, 70) + '</div>' + '<div class="title"><span class="ttl">🎒 คลังไอเทม</span></div><span class="chip coin">' + fmt(P.gold) + '</span><span class="chip">💎 ' + P.diamond + '</span><div class="uibtn" id="ivShop">' + spr(['ui', 'shop'], 100, 72) + '</div></div><div class="scrbody"><div class="tabs" style="margin-bottom:12px">' + INV_TABS.map(function (t) { return '<div class="tab ' + (IV.tab === t ? 'on' : '') + '" data-ivt="' + t + '">' + t + '</div>'; }).join('') + '</div>' + grid + '</div>';
    $('#ivBack').onclick = function () { show('menu'); };
    $('#ivShop').onclick = function () { openShop(); };
    document.querySelectorAll('[data-ivt]').forEach(function (e) { e.onclick = function () { IV.tab = e.dataset.ivt; renderInventory(); }; });
    if (setupTab) renderEquipTab($('#eqTab'));
    document.querySelectorAll('[data-iv]').forEach(function (e) {
      e.onclick = function () {
        var id = e.dataset.iv;
        if (IV.tab === 'Characters' && !P.chars[id]) { modal({ title: Meta.charName(id), body: '<div class="col" style="align-items:center;min-width:380px">' + spr(Meta.charSprite(id), 150, 150) + skillChip(id, true) + '<div class="chip">🔒 ' + (id[0] === 'r' ? 'แลกด้วยตั๋วรถไฟทอง ' + ROYAL_CHARS[+id.slice(1)].t + ' ใบ ที่หน้าอีเวนต์รถจักรไอน้ำ' : id[0] === 'e' ? 'ได้จากไข่อีสเตอร์สุ่ม' : 'ซื้อได้ที่ร้านค้า') + '</div></div>', buttons: [{ t: 'ปิด', v: 0 }] }); return; }
        if (IV.tab === 'Characters') { P.equip.char = id; Meta.save(); toast('ตั้ง ' + Meta.charName(id) + ' เป็นตัวละครหลัก'); renderInventory(); }
        else if (IV.tab === 'Dice Skins') { P.equip.dice = id; Meta.save(); toast('เปลี่ยนสกินลูกเต๋าแล้ว'); renderInventory(); }
        else { var it = Meta.item(id); modal({ title: it.name, body: '<div class="col" style="align-items:center;min-width:380px">' + spr(it.spr, 130, 110) + '<div style="font-weight:800">' + it.desc + '</div><div class="chip">มี ' + Meta.owned(id) + ' ชิ้น</div><div class="muted" style="font-size:13px">ติดตั้งได้ที่แท็บ 🎽 ติดตั้ง</div></div>', buttons: [{ t: 'ปิด', v: 1 }] }); }
      };
    });
  }

  // =====================================================================
  // PROFILE — who you are, your record, your collection (no town)
  // =====================================================================
  function openProfile() { renderProfile(); show('profile'); }
  function renderProfile() {
    var P = Meta.p, st = P.stats, rate = st.games ? Math.round(st.wins / st.games * 100) : 0, need = P.level * 300;
    var res = []; try { res = JSON.parse(localStorage.getItem('rfs_results') || '[]'); } catch (e) { }
    var tr = []; try { tr = JSON.parse(localStorage.getItem('rfs_trophies') || '[]'); } catch (e) { }
    var champs = tr.filter(function (x) { return x.res === 'champ'; }).length, bestW = tr.reduce(function (m, x) { return Math.max(m, x.res === 'champ' ? 7 : x.world); }, 0);
    var keys = allCharKeys(), have = keys.filter(function (k) { return P.chars[k]; }).length;
    var dk = DICE_SKINS.find(function (d) { return d.id === P.equip.dice; }) || DICE_SKINS[0], sk = Meta.charSkill(P.equip.char);
    var stat = function (ic, v, l) { return '<div class="pfstat"><div style="font-size:26px">' + ic + '</div><b>' + v + '</b><span>' + l + '</span></div>'; };
    var eqs = P.equip.eq.concat(P.equip.sc ? [P.equip.sc] : []).map(function (id) { var it = Meta.item(id); return it ? '<div class="pfeq">' + spr(it.spr, 48, 44) + '<span>' + it.name + '</span></div>' : ''; }).join('') || '<span class="muted">ยังไม่ได้ติดตั้งไอเทม</span>';
    var rows = res.slice(0, 6).map(function (r) { return '<tr><td>' + esc(r.map) + '</td><td>อันดับ ' + r.rank + '</td><td>' + fmt(r.nw) + ' G</td><td style="font-size:12px">' + r.date + '</td></tr>'; }).join('') || '<tr><td colspan="4" class="muted">ยังไม่มีประวัติการแข่ง</td></tr>';
    var trs = tr.slice(0, 6).map(function (x) { return '<div class="pfeq">' + (x.res === 'champ' ? '👑 แชมป์' : x.res === 'runner' ? '🥈 รองแชมป์' : '🏳️ ตกรอบ W' + x.world) + '<span style="font-size:11px">' + x.date + '</span></div>'; }).join('') || '<span class="muted">ยังไม่เคยลงทัวร์นาเมนต์</span>';
    $('#profile').innerHTML = '<div class="scrhead"><div class="uibtn backbtn" id="pfBack">' + spr(['ui', 'prev'], 70, 70) + '</div><div class="title"><span class="ttl">👤 โปรไฟล์ผู้เล่น</span></div></div>' +
      '<div class="scrbody"><div class="row" style="align-items:stretch;gap:16px">' +
      '<div class="panel" style="width:360px;padding:16px;text-align:center">' + spr(Meta.charSprite(P.equip.char), 220, 220) +
      '<div class="row" style="justify-content:center;gap:6px;margin-top:4px"><span style="font-size:26px;font-weight:900">' + esc(P.name) + '</span><button class="small" id="pfName">✏️</button></div>' +
      '<div style="font-weight:800">' + Meta.charName(P.equip.char) + '</div>' + (sk ? '<div class="chip" style="margin-top:4px;white-space:normal">⭐ ' + esc(sk.name) + ': ' + esc(sk.desc) + (sk.ename ? '<br>' + (sk.etag || '🥚') + ' ' + esc(sk.ename) + ': ' + esc(sk.edesc) : '') + '</div>' : '') +
      '<div style="margin-top:10px;font-weight:900">Lv ' + P.level + '</div><div class="pfxp"><i style="width:' + Math.min(100, Math.round(P.xp / need * 100)) + '%"></i></div><div class="muted" style="font-size:12px;font-weight:700">EXP ' + P.xp + ' / ' + need + '</div>' +
      '<button class="pink" id="pfSetup" style="margin-top:12px;width:100%">🎽 เปลี่ยนตัวละคร / ไอเทม</button><button id="pfSync" style="margin-top:8px;width:100%">☁️ ย้ายเซฟไปเครื่องอื่น</button></div>' +
      '<div class="col grow" style="gap:12px">' +
      '<div class="panel" style="padding:12px"><b>📊 สถิติ</b><div class="row" style="gap:10px;margin-top:8px;flex-wrap:wrap">' + stat('🎮', st.games, 'เกมที่เล่น') + stat('🏆', st.wins, 'ชนะ') + stat('📈', rate + '%', 'อัตราชนะ') + stat('💰', fmt(st.best), 'ทรัพย์สินสูงสุด') + stat('👑', champs, 'แชมป์ทัวร์ฯ') + stat('🐻', have + '/' + keys.length, 'ตัวละครที่มี') + '</div></div>' +
      '<div class="row" style="gap:12px;align-items:stretch"><div class="panel grow" style="padding:12px"><b>🎒 ชุดที่ติดตั้ง</b><div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><div class="pfeq">' + spr(dk.spr, 48, 44) + '<span>' + dk.name + '</span></div>' + eqs + '</div></div>' +
      '<div class="panel grow" style="padding:12px"><b>🏆 ทัวร์นาเมนต์</b>' + (bestW ? ' <span class="chip">ไปได้ไกลสุด: ' + (bestW === 7 ? 'แชมป์' : 'World ' + bestW) + '</span>' : '') + '<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">' + trs + '</div></div></div>' +
      '<div class="panel" style="padding:12px"><b>📜 ผลการแข่งล่าสุด</b><table class="ttable" style="margin-top:6px">' + rows + '</table></div></div></div></div>';
    $('#pfBack').onclick = function () { show('menu'); };
    $('#pfSetup').onclick = function () { openInventory('🎽 ติดตั้ง'); };
    $('#pfSync').onclick = function () { Sync.open(); };
    $('#pfName').onclick = function () {
      modal({ title: '✏️ เปลี่ยนชื่อ', body: '<input id="pfNm" maxlength="14" value="' + esc(P.name) + '" style="font-size:22px;width:320px;padding:8px;border-radius:12px;border:3px solid #6b4226;font-family:inherit">', buttons: [{ t: 'บันทึก', v: 1, cls: 'green' }, { t: 'ยกเลิก', v: 0 }], mount: function (box) { var i = box.querySelector('#pfNm'); U._lastName = P.name; i.oninput = function () { U._lastName = i.value; }; setTimeout(function () { i.focus(); }, 50); } })
        .then(function (v) { var n = (U._lastName || '').trim(); if (v && n) { P.name = n.slice(0, 14); Meta.save(); renderMenu(); } renderProfile(); });
    };
  }

  // =====================================================================
  // TUTORIAL MODE — a guide (Korilakkuma) explains each system the first time it happens
  // =====================================================================
  var LESSONS = {
    intro: ['ยินดีต้อนรับสู่ Fortune Street! 🐻', 'เป้าหมายของเกมคือทำให้ <b>ทรัพย์สินรวม</b> (เงินสด + มูลค่าร้าน + หุ้น) ถึง <b>เป้าหมาย</b> ที่มุมขวาบน แล้ว <b>กลับเข้าธนาคาร</b> 🏦 ก่อนคนอื่น<br>ด้านซ้ายคือการ์ดผู้เล่น ดูเงินสด ทรัพย์สิน และอันดับได้ตลอด แตะการ์ดเพื่อดูรายละเอียด'],
    dice: ['ทอยลูกเต๋า 🎲', 'ถึงตาเรา <b>แตะที่ตัวละครของเรา</b> บนแผนที่เพื่อทอย<br>ลูกเต๋าจะ <b>หมุนอยู่ตลอด</b> — แตะที่ลูกเต๋าเมื่อไหร่ก็หยุดเมื่อนั้น<br>ได้กี่แต้มก็เดินเท่านั้น (1–6)'],
    plan: ['เลือกทางเดิน 👣', 'ตัวเลขบนหัวคือ <b>ก้าวที่เหลือ</b> • ช่องที่มี <b>📍</b> คือจุดที่เราอาจไปตก<br><b>แตะช่อง 📍 ที่กระพริบ</b> เพื่อเดินไปช่องนั้นเลย • เดินผิดกด <b>↩ ย้อน 1 ก้าว</b> ได้<br>ก้าวสุดท้ายจะบอกว่าตกช่องอะไร แล้วกด <b>✔ หยุดตรงนี้</b>'],
    buy: ['ซื้อร้าน 🏠', 'ช่องร้านที่เป็น <b>กรอบเส้นประ</b> คือร้านว่าง ซื้อได้เลย!<br>ซื้อแล้วกรอบจะกลายเป็น <b>สีของเรา</b> ใครมาตกต้องจ่ายค่าเช่าให้เรา<br>ร้านที่ <b>สีพื้นเดียวกัน</b> อยู่ <b>เขตเดียวกัน</b> — ซื้อหลายร้านในเขตเดียวกันจะยิ่งแพงขึ้น'],
    chain: ['ร้านติดกัน 🔗', 'ร้านของเราที่ <b>อยู่ติดกันบนถนน</b> จะเชื่อมกันเป็นแถว (แบบ Itadaki)!<br>ทุกร้านในแถว <b>ค่าเช่าเพิ่ม 20% ต่อร้านที่ติดกัน</b> (สูงสุด ×1.8) และ <b>อาคารขยายขึ้น 1 ขั้นต่อร้าน</b><br>ตัวเลข 🔗 บนร้านบอกความยาวแถว'],
    district: ['เขตธุรกิจ 🌈', 'ยิ่งถือหลายร้านใน <b>เขตเดียวกัน</b> มูลค่าและค่าเช่าทุกร้านในเขตยิ่งสูง (+25% ต่อร้าน)<br>ถ้าได้ <b>ครบทั้งเขต = ผูกขาด 👑</b> ค่าเช่าคูณเพิ่มอีก 1.5 เท่า และลงทุนได้เยอะขึ้นมาก!'],
    invest: ['ลงทุนสร้างร้านให้แพง 🏗️ (หัวใจของเกม!)', 'ตกที่ <b>ร้านของตัวเอง</b> = ลงทุนได้! เลือกอัปเกรดร้านของเราใน <b>เขตเดียวกัน</b> ได้ <b>1 หลัง ขึ้นทีละ 1 ระดับ</b><br>ร้านจะค่อย ๆ โตจากบ้านเล็ก ➜ <b>โรงแรมหรู</b> ค่าเช่าพุ่ง และ <b>ราคาหุ้นเขตก็ขึ้น</b><br>สร้างร้านแพง ๆ แล้วรอให้คู่แข่งมาตก! 💸'],
    rentPay: ['จ่ายค่าเช่า 💸', 'ตกร้านคนอื่นต้องจ่ายค่าเช่า ร้านยิ่งลงทุนมากยิ่งแพง!<br>ถ้ามีเงินพอ ระบบจะถามว่าอยากซื้อกิจการร้านนั้นไหม (ต้องจ่าย 5 เท่าของมูลค่า)'],
    rentGet: ['มีคนมาตกร้านเรา! 💰', 'เราได้ค่าเช่าเต็ม ๆ เลย — นี่แหละเหตุผลที่ต้องลงทุนร้านให้แพง!<br>และผู้ถือหุ้นเขตนั้นได้ <b>ปันผล 20%</b> จากธนาคารด้วย'],
    bank: ['ธนาคาร & หุ้น 📈', 'ผ่านหรือหยุดที่ธนาคารซื้อหุ้นได้ <b>1 ครั้งต่อเทิร์น เลือก 1 เขต</b> (ไม่เกิน 99 หุ้น)<br><b>ราคาหุ้นขึ้นเมื่อร้านในเขตถูกลงทุน</b> • ทุกครั้งที่มีคนจ่ายค่าเช่าในเขต ผู้ถือหุ้นได้ <b>ปันผล 20%</b><br>ทริค: ซื้อหุ้นเขตที่เราผูกขาด แล้วลงทุนร้านให้หุ้นพุ่ง!'],
    suit: ['สัญลักษณ์ ♥ ♦ ♣ ♠', 'เดินผ่านช่องสัญลักษณ์เพื่อเก็บให้ <b>ครบ 4 แบบ</b> แล้วกลับธนาคาร<br>= <b>เลื่อนระดับ + รับเงินเดือน</b> (ยิ่งมีร้านมากเงินเดือนยิ่งเยอะ)<br>ถ้า <b>หยุดตรงช่องสัญลักษณ์พอดี</b> จะได้เปิดการ์ดด้วย! 🃏'],
    promo: ['เลื่อนระดับ! 🎉', 'เงินเดือน = พื้นฐาน + เลเวล + 10% ของมูลค่าร้านทั้งหมด<br>เก็บสัญลักษณ์ใหม่แล้ววนกลับมารับอีกได้เรื่อย ๆ'],
    special: ['บ้านพิเศษ 🏰', 'ช่อง <b>? สีม่วง</b> คือที่ดินบ้านพิเศษ! ตกแล้วเลือกสร้าง 1 ใน 4 แบบ<br>🌀 <b>ประตูทะลุมิติ</b> คนตกเลือกวาร์ปได้แต่จ่าย 10% ของทรัพย์สิน (ไม่วาร์ป 5%) • <b>เจ้าของตกเองวาร์ปฟรี!</b><br>🐉 <b>ป้อมสู้มังกร</b> (แผนที่ปราสาทลอยฟ้ามังกร): พนัน 100/300/500/1,000 G โจมตีมังกร ยิ่งพนันมากยิ่งโดนง่าย (15–50%) โดน = ได้เงินสะสมทั้งหมด • พลาด = เงินเข้ากองสะสม แล้วถูกลมพัดไปช่องสุ่ม<br>🎉 <b>บ้านปาร์ตี้</b> เรียกทุกคนมารวม จ่ายคนละ 100 G<br>🚧 <b>ประตูเก็บค่าผ่านทาง</b> ใครเดินผ่านต้องจ่าย และแพงขึ้น +10 G ทุกครั้ง<br>🌬️ <b>บ้านกังหันลม</b> คนที่ตกเสียสกิลการ์ด 2 ใบ + สัญลักษณ์ที่เก็บได้ 1 ใบ + การ์ดพิเศษที่พกมา 1 ใบ (เจ้าของตกเองขโมยเงิน 5% จากทุกคน)'],
    card: ['การ์ดเหตุการณ์ 🃏', 'ช่อง ? ให้เลือกการ์ด 1 ใบจากตาราง 100 ช่อง มีทั้งดีและร้าย<br>การ์ดที่เปิดจะเป็น <b>สีของเรา</b> — เรียงเป็นแถว 3 ช่องขึ้นไป (แนวนอน/ตั้ง/ทแยง) ได้ <b>โบนัส</b>!'],
    items: ['ไอเทมติดตัว 🎒', 'ด้านล่างคือไอเทมที่เลือกไว้ก่อนเกม ใช้ได้อย่างละ 1 ครั้ง<br>ไอเทมที่ขึ้น “แตะเพื่อใช้” กดได้ก่อนทอย ส่วนอื่นระบบจะถามเองเมื่อถึงจังหวะ'],
    win: ['ใกล้ชนะแล้ว! 🏆', 'ทรัพย์สินถึงเป้าแล้ว — รีบ <b>กลับเข้าธนาคาร</b> เพื่อชนะ!'],
  };
  var LESSON_ORDER = ['intro', 'dice', 'plan', 'buy', 'special', 'chain', 'district', 'invest', 'rentPay', 'rentGet', 'bank', 'suit', 'promo', 'card', 'items', 'win'];
  function coach(key) {
    var L = LESSONS[key]; if (!L) return Promise.resolve();
    return modal({ title: '🎓 ' + L[0], width: 860, close: false, bg: '#fffaf2', body: '<div class="coach"><div style="flex:none">' + spr(['cozy', 1], 150, 170) + '</div><div class="bub">' + L[1] + '</div></div>', buttons: [{ t: 'เข้าใจแล้ว! ▶', v: 1, cls: 'pink' }] });
  }
  var Tutorial = {
    seen: {},
    event: function (key) { if (!U.tut || this.seen[key]) return Promise.resolve(); this.seen[key] = 1; return coach(key); },
    // rig the human's dice so the first lessons actually happen
    rig: function (p) {
      var g = U.g; if (!g) return null; var mine = g.shopsOf(p);
      var want = !mine.length ? function (t) { return t.type === 'shop' && t.owner < 0; } : !this.invested ? function (t) { return t.type === 'shop' && t.owner === p.id; } : !this.seen.card ? function (t) { return t.type === 'chance'; } : null;
      if (!want) return null;
      var opts = [];
      for (var n = 1; n <= 6; n++) if (g.endpoints(p.pos, p.prev, n).some(function (e) { return want(g.tile(e.end)); })) opts.push(n);
      return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
    },
    start: function () {
      this.seen = {}; this.invested = false;
      var P = Meta.p, ch = P.equip.char;
      var s = Game.create({ mapIdx: 2, target: 20000, maxRounds: 60, rules: { tax: false, endOnBankrupt: true }, seed: Math.floor(Math.random() * 1e9),
        players: [{ name: P.name, char: ch, costume: P.equip.costume, isAI: false, loadout: Meta.validLoadout(), owner: true }, { name: 'คิอิโระ (ฝึกซ้อม)', char: ch === 'b2' ? 'b1' : 'b2', isAI: true, aiLevel: 'beginner', persona: 'Balanced' }] });
      s.ownerIdx = 0; s.dice = P.equip.dice; s.tutorial = true; s.lenName = 'โหมดสอนเล่น';
      startGame(s, true);
    },
  };
  function lessonsModal() {
    modal({ title: '📚 บทเรียนทั้งหมด', width: 860, body: '<div class="lessons">' + LESSON_ORDER.map(function (k) { return '<div class="opt" data-ls="' + k + '">' + esc(LESSONS[k][0].replace(/<[^>]+>/g, '')) + '</div>'; }).join('') + '</div>', buttons: [{ t: '🎓 เริ่มโหมดสอนเล่น', v: 'start', cls: 'pink' }, { t: 'ปิด', v: null }],
      mount: function (box, close) { box.querySelectorAll('[data-ls]').forEach(function (e) { e.onclick = function () { close('ls:' + e.dataset.ls); }; }); } })
      .then(function (v) { if (v === 'start') Tutorial.start(); else if (v && v.indexOf('ls:') === 0) coach(v.slice(3)).then(lessonsModal); });
  }
  U.Tutorial = Tutorial;
  // =====================================================================
  // ONLINE LOBBY
  // =====================================================================
  function onlineMenu() {
    var seat = Online.savedSeat(), hs = Online.savedHost();
    modal({ title: '🌐 โหมดออนไลน์', width: 680, body: '<div class="col" style="gap:14px;align-items:center">' + (hs ? '<div class="opt bigopt pmD" data-on="rehost" style="width:100%">' + spr(['ui', 'auto'], 96, 74) + '<div class="col" style="gap:0"><span style="font-size:22px">🏠 เปิดห้องเดิม ' + hs.code + ' ต่อ</span><span style="font-size:13px">คุณเป็นโฮสต์ของเกมที่ค้างอยู่ (รอบ ' + hs.s.round + ') — เพื่อนจะกลับเข้ามาเอง AI เล่นต่อได้</span></div></div>' : '') + (seat ? '<div class="opt bigopt pmD" data-on="rejoin" style="width:100%">' + spr(['ui', 'auto'], 96, 74) + '<div class="col" style="gap:0"><span style="font-size:22px">🔄 กลับเข้าห้อง ' + seat.code + '</span><span style="font-size:13px">เกมที่หลุดออกมา — กลับไปเล่นที่นั่งเดิมของคุณ</span></div></div>' : '') +
      '<div class="opt bigopt pmA" data-on="host" style="width:100%">' + spr(['ui', 'players'], 96, 74) + '<div class="col" style="gap:0"><span style="font-size:22px">สร้างห้อง</span><span style="font-size:13px">ได้รหัสห้อง 4 ตัว ส่งให้เพื่อนเพื่อเข้าห้อง (สูงสุด 4 คน)</span></div></div>' +
      '<div class="opt bigopt pmC" style="width:100%;cursor:default">' + spr(['ui', 'play'], 96, 74) + '<div class="col" style="gap:6px"><span style="font-size:22px">เข้าห้องด้วยรหัส</span><div class="row"><input class="codein" id="codeIn" maxlength="4" placeholder="รหัส" autocomplete="off"><button class="green" data-on="join">เข้าห้อง ▶</button></div></div></div>' +
      '<div class="muted" style="font-size:13px;font-weight:700;text-align:center">เชื่อมต่อแบบ Peer-to-Peer (WebRTC) ตรงถึงกัน ไม่ผ่านเซิร์ฟเวอร์เกม จึงลื่นไม่แลค • ทุกคนต้องเปิดเกมจากเว็บเดียวกันและต่ออินเทอร์เน็ต</div></div>',
      mount: function (box, close) {
        var inp = box.querySelector('#codeIn'); inp.oninput = function () { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
        box.querySelectorAll('[data-on]').forEach(function (e) { e.onclick = function () { var k = e.dataset.on; if (k === 'join' && inp.value.length !== 4) { toast('ใส่รหัสห้อง 4 ตัว'); return; } close(k === 'join' ? 'join:' + inp.value : k); }; });
      } })
      .then(function (v) {
        if (!v) return;
        toast('⏳ กำลังเชื่อมต่อ...');
        var cb = function (err) { if (err) { toast('⚠️ ' + err, 3500); Online.leave(); return; } lobbyModal(); };
        if (v === 'rejoin') { Online.rejoin(function (err) { if (err) toast('⚠️ ' + err, 3500); }); return; }
        if (v === 'rehost') { Online.resumeHost(function (err) { if (err) toast('⚠️ ' + err, 3500); }); return; }
        if (v === 'host') Online.host(cb); else Online.join(v.slice(5), cb);
      });
  }
  function lobbyModal() {
    var R = Online.room;
    modal({ title: R.role === 'host' ? '🏠 ห้องของคุณ' : '🚪 ห้อง ' + R.code, width: 1000, bgClose: false, xValue: 'leave', body: '<div id="lobbyB"></div>', mount: function () { renderLobby(); } })
      .then(function (v) { if (v === 'leave' && Online.room && !Online.room.started) { Online.leave(); toast('ออกจากห้องแล้ว'); } });
  }
  function TI(s, k) { return (s && s.teamInfo && s.teamInfo[k]) || TEAM_PAL[k] || TEAM_PAL[0]; }
  var AILV = { beginner: 'ง่าย', normal: 'ปานกลาง', advanced: 'เก่ง', master: 'เก่งโคตร' };
  function renderLobby() {
    var B = document.getElementById('lobbyB'), R = Online.room; if (!B || !R) return;
    var host = R.role === 'host', S = R.settings || {}, ps = R.players || [], fill = S.fillAI || S.teams;
    if (S.tour) { renderTourLobby(B, R, host, S, ps); return; }
    if (S.easter) { renderEasterLobby(B, R, host, S, ps); return; }
    if (S.train) { renderTrainLobby(B, R, host, S, ps); return; }
    var teamOf = S.teamOf || [0, 1, 0, 1], aiLv = S.aiLv || ['normal', 'normal', 'normal', 'normal'];
    var tcol = S.teamCol || [0, 1], TC = [TEAM_PAL[tcol[0]].c, TEAM_PAL[tcol[1]].c], TN = ['ทีม' + TEAM_PAL[tcol[0]].n, 'ทีม' + TEAM_PAL[tcol[1]].n];
    var slots = [0, 1, 2, 3].map(function (i) {
      var x = ps[i], tm = S.teams ? '<div class="teamchip" ' + (host ? 'data-tm="' + i + '"' : '') + ' style="background:' + TC[teamOf[i]] + '">' + TN[teamOf[i]] + (host ? ' ⇄' : '') + '</div>' : '';
      if (x) return '<div style="border-color:' + (S.teams ? TC[teamOf[i]] : PLAYER_COLORS[i]) + '">' + tm + spr(Meta.charSprite(x.char), 80, 90) + '<div>P' + (i + 1) + ' ' + esc(x.name) + '</div><div style="font-size:12px;color:#2c9a2c">' + (i === 0 ? '👑 โฮสต์' : '✅ พร้อม') + '</div></div>';
      if (!fill) return '<div style="border-color:#ccc"><div style="padding-top:40px;opacity:.5">รอผู้เล่น...</div></div>';
      return '<div style="border-color:' + (S.teams ? TC[teamOf[i]] : PLAYER_COLORS[i]) + '">' + tm + '<div style="font-size:40px;margin-top:6px">🤖</div><div>AI เติม</div>' +
        (host ? '<div class="row" style="gap:3px;justify-content:center;margin-top:4px">' + ['beginner', 'normal', 'advanced', 'master'].map(function (l) { return '<button class="small rbtn ' + (aiLv[i] === l ? 'on' : '') + '" data-al="' + i + ':' + l + '" style="padding:2px 5px;font-size:11px">' + AILV[l] + '</button>'; }).join('') + '</div>' : '<div style="font-size:12px">ระดับ: ' + AILV[aiLv[i]] + '</div>') + '</div>';
    }).join('');
    var tgPre = S.teams ? [50000, 80000, 120000, 200000] : [25000, 40000, 60000, 100000];
    var num = function (id, v, w) { return '<input type="number" id="' + id + '" value="' + v + '" style="width:' + (w || 110) + 'px;font-size:16px;padding:5px 8px;border:2px solid #6b4226;border-radius:10px;font-family:inherit">'; };
    var settings = host ?
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:10px"><b>แผนที่:</b>' + MAPS.map(function (m, i) { return m.bkk ? '' : '<button class="small rbtn ' + (S.map === i ? 'on' : '') + '" data-lm="' + i + '">' + m.th + '</button>'; }).join('') + '</div>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><b>โหมด:</b><div class="seg"><div data-mode="0" class="' + (!S.teams ? 'on' : '') + '">👤 เดี่ยว</div><div data-mode="1" class="' + (S.teams ? 'on' : '') + '">🤝 ทีม 2 vs 2</div></div>' + (S.teams ? [0, 1].map(function (k) { return '<div class="row" style="gap:4px;align-items:center"><b style="color:' + TC[k] + '">สี' + TN[k] + ':</b>' + TEAM_PAL.map(function (c, ci) { var taken = ci === tcol[1 - k]; return '<span class="tcdot' + (ci === tcol[k] ? ' on' : '') + (taken ? ' off' : '') + '" data-tc="' + k + ':' + ci + '" title="' + c.n + '" style="background:' + c.c + '"></span>'; }).join('') + '</div>'; }).join('') : '') + (S.teams ? '<span class="muted" style="font-size:12px;font-weight:700">เพื่อนร่วมทีมไม่เก็บค่าเช่ากัน • ช่วยลงทุนร้านกันได้ • ร้านในเขตเดียวกันนับรวมเป็นของทีม • ทรัพย์สินรวมของทีมถึงเป้า = ชนะ</span>' : '') + '</div>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><b>' + (S.teams ? 'เป้าหมายรวมของทีม:' : 'เป้าหมาย:') + '</b>' + tgPre.map(function (t) { return '<button class="small rbtn ' + (S.target === t ? 'on' : '') + '" data-lt="' + t + '">' + fmt(t) + '</button>'; }).join('') + num('lobTg', S.target) + ' G</div>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><b>เงินเริ่มต้น:</b>' + [5000, 10000, 15000, 20000, 30000].map(function (t) { return '<button class="small rbtn ' + (S.startCash === t ? 'on' : '') + '" data-lc="' + t + '">' + fmt(t) + '</button>'; }).join('') + num('lobCash', S.startCash || 10000) + ' G</div>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><b>จำนวนรอบ:</b>' + [30, 50, 100, 150, 200, 0].map(function (t) { return '<button class="small rbtn ' + (S.rounds === t ? 'on' : '') + '" data-lr="' + t + '">' + (t ? t : '♾️ ไม่จำกัด') + '</button>'; }).join('') + num('lobRd', S.rounds || 0, 80) + ' รอบ</div>' +
      '<div class="row" style="gap:10px;flex-wrap:wrap;margin-top:8px">' + (S.teams ? '<span class="muted" style="font-weight:700">โหมดทีมเติม AI ให้ครบ 4 คนอัตโนมัติ</span>' : '<div class="tog ' + (S.fillAI ? 'on' : '') + '" data-lf="fillAI"><i></i>เติม AI ให้ครบ 4 คน</div>') + '<div class="tog ' + (S.tax ? 'on' : '') + '" data-lf="tax"><i></i>มีภาษี</div></div>' + (!S.teams ? '<div class="row" style="gap:4px;align-items:center;margin-top:8px"><b>สีของคุณ:</b>' + colorDots(ps[0] && typeof ps[0].color === 'number' ? ps[0].color : (Meta.p.color || 0), 'myc') + '<span class="muted" style="font-size:12px;font-weight:700">(เพื่อนใช้สีที่ตั้งไว้ในเครื่องตัวเอง ถ้าซ้ำระบบเลือกสีอื่นให้)</span></div>' : '')
      : '<div style="text-align:center;font-weight:700;margin-top:10px;line-height:1.7">แผนที่: ' + (MAPS[S.map] || MAPS[0]).th + ' • ' + (S.teams ? '🤝 โหมดทีม 2 vs 2 • เป้าหมายรวมทีม ' : 'เป้าหมาย ') + fmt(S.target || 40000) + ' G<br>เงินเริ่มต้น ' + fmt(S.startCash || 10000) + ' G • ' + (S.rounds ? S.rounds + ' รอบ' : 'ไม่จำกัดรอบ') + (fill ? ' • เติม AI' : '') + (S.tax ? ' • มีภาษี' : '') + '</div>';
    B.innerHTML = '<div class="row" style="justify-content:center;gap:16px"><span style="font-weight:700">รหัสห้อง</span><span class="roomcode">' + R.code + '</span><span class="chip">' + (Online.kind === 'p2p' ? '🌐 ออนไลน์ P2P' : '📱 โหมดทดสอบเครื่องเดียว') + '</span></div>' +
      '<div style="text-align:center;font-weight:700;margin:6px 0">' + (host ? 'ส่งรหัสนี้ให้เพื่อน แล้วเพื่อนกด “โหมดออนไลน์ → เข้าห้องด้วยรหัส”' : 'เข้าห้องแล้ว! รอโฮสต์เริ่มเกม...') + '</div>' +
      '<div class="lobbyP">' + slots + '</div>' + settings +
      (host ? '<div style="text-align:center;margin-top:12px"><button class="pink" id="lobStart" style="font-size:22px">▶ เริ่มเกม (' + ps.length + ' คน' + (fill && ps.length < 4 ? ' + AI ' + (4 - ps.length) : '') + ')</button></div>' : '');
    if (!host) return;
    var set = function (k, v) { Online.setSetting(k, v); renderLobby(); };
    B.querySelectorAll('[data-lm]').forEach(function (e) { e.onclick = function () { set('map', +e.dataset.lm); }; });
    B.querySelectorAll('[data-lt]').forEach(function (e) { e.onclick = function () { set('target', +e.dataset.lt); }; });
    B.querySelectorAll('[data-lc]').forEach(function (e) { e.onclick = function () { set('startCash', +e.dataset.lc); }; });
    B.querySelectorAll('[data-lr]').forEach(function (e) { e.onclick = function () { set('rounds', +e.dataset.lr); }; });
    B.querySelectorAll('[data-lf]').forEach(function (e) { e.onclick = function () { set(e.dataset.lf, !S[e.dataset.lf]); }; });
    B.querySelectorAll('[data-mode]').forEach(function (e) { e.onclick = function () { var on = e.dataset.mode === '1'; if (on === !!S.teams) return; Online.setSetting('target', on ? Math.max(50000, (S.target || 40000) * 2) : Math.max(10000, Math.round((S.target || 80000) / 2))); set('teams', on); }; });
    B.querySelectorAll('[data-tm]').forEach(function (e) { e.onclick = function () { var t = teamOf.slice(), i = +e.dataset.tm; t[i] = 1 - t[i]; set('teamOf', t); }; });
    B.querySelectorAll('[data-tc]').forEach(function (e) { e.onclick = function () { var a = e.dataset.tc.split(':'), k = +a[0], ci = +a[1]; if (ci === tcol[1 - k]) return; var t = tcol.slice(); t[k] = ci; set('teamCol', t); }; });
    B.querySelectorAll('[data-myc]').forEach(function (e) { e.onclick = function () { Meta.p.color = +e.dataset.myc; Meta.save(); if (Online.room.players[0]) Online.room.players[0].color = Meta.p.color; Online.setSetting('_c', Date.now()); renderLobby(); }; });
    B.querySelectorAll('[data-al]').forEach(function (e) { e.onclick = function () { var a = e.dataset.al.split(':'), l = aiLv.slice(); l[+a[0]] = a[1]; set('aiLv', l); }; });
    var clampIn = function (id, k, lo, hi) { var el = B.querySelector('#' + id); el.onchange = function () { var v = Math.round(+el.value || 0); if (k === 'rounds' && v <= 0) v = 0; else v = Math.max(lo, Math.min(hi, v)); set(k, v); }; };
    clampIn('lobTg', 'target', 10000, 9999999); clampIn('lobCash', 'startCash', 1000, 999999); clampIn('lobRd', 'rounds', 5, 9999);
    B.querySelector('#lobStart').onclick = function () { Online.startHost(); };
  }
  function renderTrainLobby(B, R, host, S, ps) {
    var TM = !!S.teams, teamOf = S.teamOf || [0, 1, 0, 1], tcol = S.teamCol || [0, 1], TC = [TEAM_PAL[tcol[0]].c, TEAM_PAL[tcol[1]].c], TN = ['ทีม' + TEAM_PAL[tcol[0]].n, 'ทีม' + TEAM_PAL[tcol[1]].n], tb = S.trainBoard || 0, CF = Train.cfg(tb), TT = TRAIN.team;
    var slots = [0, 1, 2, 3].map(function (i) { var x = ps[i], tm = TM ? '<div class="teamchip" ' + (host ? 'data-tm="' + i + '"' : '') + ' style="background:' + TC[teamOf[i]] + '">' + TN[teamOf[i]] + (host ? ' ⇄' : '') + '</div>' : '<div class="teamchip" style="background:#c62828">P' + (i + 1) + '</div>';
      return x ? '<div style="border-color:' + (TM ? TC[teamOf[i]] : '#c62828') + '">' + tm + spr(Meta.charSprite(x.char), 80, 90) + '<div>' + esc(x.name) + '</div><div style="font-size:12px;color:#2c9a2c">' + (i === 0 ? '👑 โฮสต์' : '✅ พร้อม') + '</div></div>' : '<div style="border-style:dashed;border-color:' + (TM ? TC[teamOf[i]] : '#bbb') + '">' + tm + '<div style="font-size:40px;margin-top:6px">🤖</div><div>AI สุ่ม</div><div style="font-size:12px;opacity:.7">ว่าง — เพื่อนเข้าแทนได้</div></div>'; }).join('');
    var info = TM ? '🤝 <b>ทีม 2 vs 2</b> • 🗺️ ' + CF.th + ' • ' + TT.rounds + ' รอบ • เริ่มคนละ ' + fmt(TRAIN.startCash) + ' G • เป้าหมายรวมของทีม <b>' + fmt(TT.target) + ' G</b><br>🚂 รถไฟทับเพื่อนร่วมทีม = ไม่ชน • เพื่อนร่วมทีมไม่เก็บค่าเช่ากัน<br>🏆 ทีมชนะ: 🎫 ตั๋วทอง <b>คนละ ' + TT.winTickets + ' ใบ</b> + 🎁 กล่องสุ่ม <b>คนละ ' + TT.winBoxes + ' กล่อง</b> • ทีมแพ้: 🎁 คนละ ' + TT.loseBoxes + ' กล่อง'
      : '🗺️ ' + CF.th + ' • ' + TRAIN.rounds + ' รอบ • เริ่ม ' + fmt(TRAIN.startCash) + ' G • เป้าหมาย ' + fmt(CF.target) + ' G<br>🚂 ทุก ' + TRAIN.every + ' รอบทุกคนขับรถไฟ • 🎫 ตั๋วทอง ' + CF.winTickets.join('/') + ' ใบ • 🎁 กล่องสุ่ม ' + TRAIN.rankBoxes.join('/') + ' ตามอันดับ';
    var ctrl = host ? '<div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap;margin-top:8px"><b>แมพ:</b>' + TRAIN.boards.map(function (bd, i) { return '<div class="tbcard' + (tb === i ? ' on' : '') + '" data-ltb="' + i + '" style="width:190px"><div class="tbimg" style="background-image:url(assets/' + bd.bg + '.webp);height:60px"></div><b>' + bd.th + '</b></div>'; }).join('') +
      '<div class="col" style="gap:6px"><b>โหมด:</b><div class="seg"><div data-tmode="0" class="' + (!TM ? 'on' : '') + '">👤 เดี่ยว</div><div data-tmode="1" class="' + (TM ? 'on' : '') + '">🤝 ทีม 2 vs 2</div></div></div></div>' +
      (TM ? '<div class="row" style="gap:12px;justify-content:center;margin-top:6px">' + [0, 1].map(function (k) { return '<div class="row" style="gap:4px;align-items:center"><b style="color:' + TC[k] + '">สี' + TN[k] + ':</b>' + TEAM_PAL.map(function (c, ci) { return '<span class="tcdot' + (ci === tcol[k] ? ' on' : '') + (ci === tcol[1 - k] ? ' off' : '') + '" data-tc="' + k + ':' + ci + '" style="background:' + c.c + '"></span>'; }).join('') + '</div>'; }).join('') + '<span class="muted" style="font-size:12px;font-weight:700">แตะป้ายทีมเพื่อสลับ (ทีมละ 2 คน)</span></div>'
        : '<div class="row" style="gap:4px;align-items:center;justify-content:center;margin-top:6px"><b>สีของคุณ:</b>' + colorDots(ps[0] && typeof ps[0].color === 'number' ? ps[0].color : (Meta.p.color || 0), 'myc') + '</div>') : '';
    B.innerHTML = '<div class="row" style="justify-content:center;gap:16px"><span style="font-weight:700">🚂 อีเวนต์รถจักรไอน้ำ • รหัสห้อง</span><span class="roomcode">' + R.code + '</span><span class="chip">' + (Online.kind === 'p2p' ? '🌐 ออนไลน์ P2P' : '📱 โหมดทดสอบเครื่องเดียว') + '</span></div>' +
      '<div style="text-align:center;font-weight:700;margin:6px 0">' + (host ? 'ส่งรหัสให้เพื่อน (สูงสุด 4 คน) — เลือกแมพ/โหมดได้ ที่ว่างเติม AI' : 'เข้าห้องแล้ว! รอโฮสต์เริ่มเกม...') + '</div>' +
      '<div class="lobbyP">' + slots + '</div>' + ctrl +
      '<div style="text-align:center;font-weight:700;margin-top:10px;line-height:1.7">' + info + '</div>' +
      (host ? '<div style="text-align:center;margin-top:12px"><button class="pink" id="lobStart" style="font-size:22px">▶ เริ่มเกม</button></div>' : '');
    if (!host) return;
    var set = function (k, v) { Online.setSetting(k, v); renderLobby(); };
    B.querySelectorAll('[data-ltb]').forEach(function (e) { e.onclick = function () { set('trainBoard', +e.dataset.ltb); }; });
    B.querySelectorAll('[data-tmode]').forEach(function (e) { e.onclick = function () { var on = e.dataset.tmode === '1'; if (on === TM) return; if (on && !S.teamOf) Online.setSetting('teamOf', [0, 1, 0, 1]); set('teams', on); }; });
    B.querySelectorAll('[data-tm]').forEach(function (e) { e.onclick = function () { var t = teamOf.slice(), i = +e.dataset.tm; t[i] = 1 - t[i]; set('teamOf', t); }; });
    B.querySelectorAll('[data-tc]').forEach(function (e) { e.onclick = function () { var a = e.dataset.tc.split(':'), k = +a[0], ci = +a[1]; if (ci === tcol[1 - k]) return; var t = tcol.slice(); t[k] = ci; set('teamCol', t); }; });
    B.querySelectorAll('[data-myc]').forEach(function (e) { e.onclick = function () { Meta.p.color = +e.dataset.myc; Meta.save(); if (Online.room.players[0]) Online.room.players[0].color = Meta.p.color; Online.setSetting('_c', Date.now()); renderLobby(); }; });
    B.querySelector('#lobStart').onclick = function () { Online.startHost(); };
  }
  function renderEasterLobby(B, R, host, S, ps) {
    var E = S.easter, ES = EASTER.stages[E.stage], tot = E.totals || {};
    var slots = [0, 1, 2, 3].map(function (i) { var x = ps[i]; return x ? '<div><div class="teamchip" style="background:#ff8fb3">P' + (i + 1) + '</div>' + spr(Meta.charSprite(x.char), 80, 90) + '<div>' + esc(x.name) + '</div><div style="font-size:12px;color:#2c9a2c">' + (i === 0 ? '👑 โฮสต์' : '✅ พร้อม') + (tot[x.name] ? ' • ' + fmt(tot[x.name]) : '') + '</div></div>' : '<div style="border-style:dashed"><div style="font-size:40px;margin-top:10px">🤖</div><div>AI ' + esc(AILV[E.aiLv] || 'ปานกลาง') + '</div><div style="font-size:12px;opacity:.7">ว่าง — เพื่อนเข้าแทนได้</div></div>'; }).join('');
    B.innerHTML = '<div class="row" style="justify-content:center;gap:16px"><span style="font-weight:700">🐰 อีเวนต์อีสเตอร์ • รหัสห้อง</span><span class="roomcode">' + R.code + '</span><span class="chip">' + (Online.kind === 'p2p' ? '🌐 ออนไลน์ P2P' : '📱 โหมดทดสอบเครื่องเดียว') + '</span></div>' +
      '<div style="text-align:center;font-weight:700;margin:6px 0">' + (host ? 'ส่งรหัสให้เพื่อน (สูงสุด 4 คน) — แข่งเดี่ยวทุกคน ที่ว่างเติม AI' : 'เข้าห้องแล้ว! รอโฮสต์เริ่มด่าน...') + '</div>' +
      '<div class="lobbyP">' + slots + '</div>' +
      '<div style="text-align:center;font-weight:700;margin-top:10px;line-height:1.7">ด่าน ' + (E.stage + 1) + '/4 — ' + EASTER_MAPS[E.stage].th + ' • เป้าหมาย ' + fmt(ES.target) + ' G • ' + ES.rounds + ' รอบ<br><span class="emission" style="display:inline-block">' + missionText(E.mission) + '</span></div>' +
      (host ? '<div class="row" style="gap:4px;align-items:center;justify-content:center;margin-top:8px"><b>ระดับ AI:</b>' + AI_LEVELS.map(function (l) { return '<button class="small rbtn' + (E.aiLv === l.id ? ' on' : '') + '" data-eal="' + l.id + '">' + l.name + '</button>'; }).join('') + '<b style="margin-left:10px">สีของคุณ:</b>' + colorDots(ps[0] && typeof ps[0].color === 'number' ? ps[0].color : (Meta.p.color || 0), 'myc') + '</div><div style="text-align:center;margin-top:12px"><button class="pink" id="lobStart" style="font-size:22px">▶ เริ่มด่าน ' + (E.stage + 1) + '</button></div>' : '');
    if (!host) return;
    B.querySelectorAll('[data-eal]').forEach(function (e) { e.onclick = function () { E.aiLv = e.dataset.eal; Online.setSetting('easter', E); renderLobby(); }; });
    B.querySelectorAll('[data-myc]').forEach(function (e) { e.onclick = function () { Meta.p.color = +e.dataset.myc; Meta.save(); if (Online.room.players[0]) Online.room.players[0].color = Meta.p.color; Online.setSetting('_c', Date.now()); renderLobby(); }; });
    B.querySelector('#lobStart').onclick = function () { Online.startHost(); };
  }
  function renderTourLobby(B, R, host, S, ps) {
    var w = S.tour.world, W = TOUR_WORLDS[w], tcol = S.teamCol || [0, 1], C0 = TEAM_PAL[tcol[0]], C1 = TEAM_PAL[tcol[1]];
    var hum = [0, 1].map(function (i) { var x = ps[i]; return x ? '<div style="border-color:' + C0.c + '"><div class="teamchip" style="background:' + C0.c + '">ทีม' + C0.n + '</div>' + spr(Meta.charSprite(x.char), 80, 90) + '<div>' + esc(x.name) + '</div><div style="font-size:12px;color:#2c9a2c">' + (i === 0 ? '👑 โฮสต์' : '✅ พร้อม') + '</div></div>' : '<div style="border-color:' + C0.c + ';border-style:dashed"><div class="teamchip" style="background:' + C0.c + '">ทีม' + C0.n + '</div><div style="padding-top:30px;opacity:.6">รอเพื่อน...</div></div>'; }).join('');
    var ais = [1, 2].map(function (k) { return '<div style="border-color:' + C1.c + '"><div class="teamchip" style="background:' + C1.c + '">ทีม AI</div><div style="font-size:40px;margin-top:6px">🤖</div><div>AI สุ่มตัวละคร</div><div style="font-size:12px">ระดับ: ' + AILV[W.ai[k]] + '</div></div>'; }).join('');
    B.innerHTML = '<div class="row" style="justify-content:center;gap:16px"><span style="font-weight:700">🏆 ทัวร์นาเมนต์ทีม • รหัสห้อง</span><span class="roomcode">' + R.code + '</span><span class="chip">' + (Online.kind === 'p2p' ? '🌐 ออนไลน์ P2P' : '📱 โหมดทดสอบเครื่องเดียว') + '</span></div>' +
      '<div style="text-align:center;font-weight:700;margin:6px 0">' + (host ? 'ส่งรหัสนี้ให้เพื่อน → เพื่อนกด “โหมดออนไลน์ → เข้าห้องด้วยรหัส”' : 'เข้าห้องแล้ว! รอโฮสต์เริ่มทัวร์นาเมนต์...') + '</div>' +
      '<div class="lobbyP">' + hum + ais + '</div>' +
      '<div style="text-align:center;font-weight:700;margin-top:10px;line-height:1.7">World ' + (w + 1) + ' — ' + MAPS[W.map].th + ' • เป้าหมายรวมทีม ' + fmt(W.target * 2) + ' G • ' + W.rounds + ' รอบ • เงินเริ่มต้น 10,000 G<br><span class="muted">ทีมที่ชนะได้ไปเวิลด์ถัดไป • ทั้งคุณและเพื่อนได้กล่องสุ่มเท่ากัน (ตกรอบหลังผ่าน W1 = 3 • 5 • 10 • 20 • 30 • แชมป์ 50)</span></div>' +
      (host ? '<div class="row" style="gap:4px;align-items:center;justify-content:center;margin-top:8px"><b>สีทีมเรา:</b>' + colorDots(tcol[0], 'ttc', tcol[1]) + '<span class="muted" style="font-size:12px;font-weight:700;margin-left:6px">(ทัวร์นาเมนต์เปลี่ยนได้แค่สี)</span></div><div style="text-align:center;margin-top:12px"><button class="pink" id="lobStart" style="font-size:22px">▶ เริ่ม World ' + (w + 1) + '</button></div>' : '');
    if (!host) return;
    B.querySelectorAll('[data-ttc]').forEach(function (e) { e.onclick = function () { var ci = +e.dataset.ttc, t = tcol.slice(); if (ci === t[1]) t[1] = t[0]; t[0] = ci; Meta.p.color = ci; Meta.save(); Online.setSetting('teamCol', t); renderLobby(); }; });
    B.querySelector('#lobStart').onclick = function () { Online.startHost(); };
  }
  function startGuest(state, idx) {
    U.token++; var tok = U.token; U.tut = null;
    state.ownerIdx = idx; state.dice = Meta.p.equip.dice;
    var g = new Game(state, null); g.io = makeIO(g, tok); Online.instrumentGuest(g); U.g = g; U.view = idx;
    show('game'); buildBoard(); refresh();
    $('#logBox').innerHTML = ''; state.log.slice(-30).forEach(function (l) { addLog(l.m, l.k); });
    toast('🌐 เข้าเกมออนไลน์แล้ว! คุณคือ P' + (idx + 1));
  }
  var wakeLock = null;
  function keepAwake(on) { try { if (on && navigator.wakeLock && !wakeLock) navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; w.addEventListener('release', function () { wakeLock = null; }); }).catch(function () { }); if (!on && wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) { } }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && U.online) keepAwake(true); });
  function setOnline(o) {
    U.online = o; keepAwake(!!o); var b = document.getElementById('netBadge');
    if (!o) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'netBadge'; b.className = 'netbadge'; $('#boardWrap').appendChild(b); }
    b.textContent = '🌐 ห้อง ' + o.code + (o.role === 'host' ? ' (โฮสต์)' : '');
  }
  Online.init({
    refresh: function () { if (U.g) refresh(); }, toast: toast, esc: esc, game: function () { return U.g; },
    setWaiting: function (p, off) { setTurn(p, false); setAct(off ? '<div style="font-size:16px">📴 ' + esc(p.name) + ' หลุดการเชื่อมต่อ<br>รอกลับเข้ามา...</div>' : '<div style="font-size:17px">⏳ รอ ' + esc(p.name) + '<br>ตัดสินใจ...</div>'); },
    netStatus: function (msg) { var o = document.getElementById('netOverlay'); if (!msg) { if (o) o.remove(); return; } if (!o) { o = document.createElement('div'); o.id = 'netOverlay'; document.getElementById('stage').appendChild(o); } o.innerHTML = '<div>' + msg + '<br><span style="font-size:14px">เกมยังอยู่ ไม่ต้องปิดหน้านี้</span></div>'; },
    setTurnLabel: function (p, mine) { setTurn(p, mine); },
    renderLobby: renderLobby, lobbyModal: lobbyModal, allCharKeys: allCharKeys, aiCharKeys: aiCharKeys, pickMission: pickMission, assignColors: assignColors, closeModal: function () { if (U._closeModal) U._closeModal(); },
    startGame: startGame, startGuest: startGuest, setOnline: setOnline, consumeUsed: consumeUsed, addLog: addLog,
    showResult: function (g) { showResult(g); }, toMenu: function () { U.token++; U.g = null; show('menu'); },
  });
  // ---------- music ----------
  Music.setVol(U.vol);
  Music.onSong(function (sg) { var n = $('#nowPlay'); if (n) n.textContent = '♪ ' + sg.title; if (U.music && Music.playing) toast('🎵 เพลงใหม่: ' + esc(sg.title), 1800); });
  function firstGesture() { if (U.music && !Music.playing) Music.start(document.getElementById('game').classList.contains('on') ? 'game' : 'menu'); }
  document.addEventListener('pointerdown', firstGesture, true);
  $('#nowPlay').onclick = function (e) { e.stopPropagation(); if (!Music.playing) { U.music = true; saveSettings(); Music.start(); } else Music.next(); };
  // ---------- boot ----------
  renderMenu();
  (function resumePrompt() {
    var t = Tour.load(), sv = t && Tour.savedWorld(t), hs = Online.savedHost(), seat = Online.savedSeat(), et = Easter.load(), esv = et && Easter.savedStage(et), tsv = Train.saved(), bsv = Bkk.saved();
    if (!sv && !hs && !seat && !esv && !tsv && !bsv) { if (Meta.loginState().canClaim) setTimeout(dailyLogin, 600); return; }
    var opts = (bsv ? '<div class="opt bigopt pmA" data-rs="bkk" style="width:100%"><span style="font-size:38px">🛺</span><div class="col" style="gap:0"><span style="font-size:20px">เล่น Bangkok City ต่อ — รอบ ' + bsv.round + '</span><span style="font-size:13px">เป้าหมาย ' + fmt(bsv.settings.target) + ' G</span></div></div>' : '') + (tsv ? '<div class="opt bigopt pmA" data-rs="train" style="width:100%"><span style="font-size:38px">🚂</span><div class="col" style="gap:0"><span style="font-size:20px">เล่นอีเวนต์รถจักรไอน้ำต่อ — รอบ ' + tsv.round + '</span><span style="font-size:13px">กลับไปเล่นต่อจากจุดที่บันทึกไว้</span></div></div>' : '') + (esv ? '<div class="opt bigopt pmB" data-rs="easter" style="width:100%"><span style="font-size:38px">🐰</span><div class="col" style="gap:0"><span style="font-size:20px">เล่นอีเวนต์อีสเตอร์ต่อ — ด่าน ' + (et.stage + 1) + ' รอบ ' + esv.round + '</span><span style="font-size:13px">กลับไปเล่นต่อจากจุดที่บันทึกไว้</span></div></div>' : '') + (sv ? '<div class="opt bigopt pmA" data-rs="tour" style="width:100%"><span style="font-size:38px">🏆</span><div class="col" style="gap:0"><span style="font-size:20px">เล่นทัวร์นาเมนต์ต่อ — World ' + (t.world + 1) + ' รอบ ' + sv.round + '</span><span style="font-size:13px">กลับไปเล่นต่อจากจุดที่บันทึกไว้</span></div></div>' : '') +
      (hs ? '<div class="opt bigopt pmD" data-rs="host" style="width:100%"><span style="font-size:38px">🏠</span><div class="col" style="gap:0"><span style="font-size:20px">เปิดห้องออนไลน์ ' + hs.code + ' ต่อ (รอบ ' + hs.s.round + ')</span><span style="font-size:13px">คุณเป็นโฮสต์ — เพื่อนจะกลับเข้ามาที่นั่งเดิมเอง</span></div></div>' : '') +
      (seat && !hs ? '<div class="opt bigopt pmD" data-rs="seat" style="width:100%"><span style="font-size:38px">🔄</span><div class="col" style="gap:0"><span style="font-size:20px">กลับเข้าห้องออนไลน์ ' + seat.code + '</span><span style="font-size:13px">กลับไปนั่งที่เดิมในเกมที่หลุดออกมา</span></div></div>' : '');
    setTimeout(function () {
      modal({ title: '⏯️ มีเกมที่ค้างไว้', width: 640, body: '<div class="col" style="gap:12px">' + opts + '</div>', buttons: [{ t: 'ไว้ทีหลัง', v: 0 }], mount: function (box, close) { box.querySelectorAll('[data-rs]').forEach(function (e) { e.onclick = function () { close(e.dataset.rs); }; }); } })
        .then(function (v) {
          if (v === 'tour') startGame(sv, false);
          else if (v === 'easter') startGame(esv, false);
          else if (v === 'train') startGame(tsv, false);
          else if (v === 'bkk') startGame(bsv, false);
          else if (v === 'host') { toast('⏳ กำลังเปิดห้องเดิม...'); Online.resumeHost(function (err) { if (err) toast('⚠️ ' + err, 3500); }); }
          else if (v === 'seat') { toast('⏳ กำลังกลับเข้าห้อง...'); Online.rejoin(function (err) { if (err) toast('⚠️ ' + err, 3500); }); }
          else if (Meta.loginState().canClaim) dailyLogin();
        });
    }, 500);
  })();
})();
