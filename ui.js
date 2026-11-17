// ===================== UI (touch-first, iPad landscape) =====================
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var fmt = Game.fmt;
  var U = { g: null, token: 0, speed: 1, sound: true, sel: { map: 0, len: 1, slots: null }, view: 0 };
  window.U = U;
  Meta.load();
  U.music = true; U.vol = 0.5;
  try { var st = JSON.parse(localStorage.getItem('rfs_settings') || '{}'); if (st.speed) U.speed = st.speed; if (st.sound === false) U.sound = false; if (st.music === false) U.music = false; if (st.vol !== undefined) U.vol = st.vol; } catch (e) { }
  function saveSettings() { localStorage.setItem('rfs_settings', JSON.stringify({ speed: U.speed, sound: U.sound, music: U.music, vol: U.vol })); }

  // ---------- stage scaling ----------
  function fit() { var s = Math.min(innerWidth / 1280, innerHeight / 860); $('#stage').style.transform = 'scale(' + s + ')'; }
  addEventListener('resize', fit); fit();

  // ---------- helpers ----------
  function spr(spec, w, h, extraStyle) {
    if (!spec) return '';
    var S = ATLAS[spec[0]]; if (!S) return '';
    var b = typeof spec[1] === 'string' ? S.n[spec[1]] : S.b[spec[1]]; if (!b) return '';
    if (spec[2]) { var n = spec[2], k = spec[3] || 0; b = [b[0] + b[2] / n * k, b[1], b[2] / n, b[3]]; }
    var sc = Math.min(w / b[2], h / b[3]);
    return '<div class="spr" style="width:' + (b[2] * sc).toFixed(1) + 'px;height:' + (b[3] * sc).toFixed(1) + 'px;background-image:url(' + S.url + ');background-size:' + (S.W * sc).toFixed(1) + 'px ' + (S.H * sc).toFixed(1) + 'px;background-position:-' + (b[0] * sc).toFixed(1) + 'px -' + (b[1] * sc).toFixed(1) + 'px;' + (extraStyle || '') + '"></div>';
  }
  U.spr = spr;
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function show(id) { document.querySelectorAll('.screen').forEach(function (e) { e.classList.toggle('on', e.id === id); }); if (id === 'menu') renderMenu(); if (window.Music) Music.setMood(id === 'game' ? 'game' : 'menu'); }
  function wait(ms) { var t = U.token; return new Promise(function (res, rej) { setTimeout(function () { t === U.token ? res() : rej('abort'); }, ms / U.speed); }); }
  function toast(msg, ms) { var d = document.createElement('div'); d.innerHTML = msg; $('#toast').appendChild(d); setTimeout(function () { d.remove(); }, ms || 2200); }
  U.toast = toast;
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
  var mq = Promise.resolve(), modalOpen = false;
  function modal(o) {
    var run = function () {
      return new Promise(function (resolve) {
        var box = $('#modalBox'), M = $('#modal'); modalOpen = true;
        box.style.width = o.width ? o.width + 'px' : ''; box.style.background = o.bg || '';
        box.innerHTML = (o.close !== false ? '<div class="xbtn" data-x>✕</div>' : '') + (o.title ? '<div class="mtitle">' + o.title + '</div>' : '') + '<div class="mbody"></div>' + (o.buttons && o.buttons.length ? '<div class="mbtns"></div>' : '');
        var body = box.querySelector('.mbody');
        if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
        var done = false, timer = null;
        function close(v) { if (done) return; done = true; clearTimeout(timer); M.classList.remove('on'); modalOpen = false; box.innerHTML = ''; resolve(v); }
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
    if (ls.canClaim) h += '<div class="badge" style="left:70px;top:140px">!</div><div class="badge" style="left:1176px;top:8px">!</div>';
    $('#menuHot').innerHTML = h;
    $('#btnContinue').disabled = !localStorage.getItem('rfs_save_auto');
  }
  $('#menuHot').addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act;
    if (act === 'play') openSetup(false);
    else if (act === 'ai') openSetup(true);
    else if (act === 'online') alertBox('🌐 โหมดออนไลน์', 'ตามแผน GDD ระบบ Offline ต้องเสถียรก่อน — โหมดออนไลน์ (ห้อง, Ready, Turn Sync, Reconnect) จะเพิ่มในเฟสถัดไป<br>ตอนนี้เล่น <b>Local Multiplayer</b> หลายคนบนเครื่องเดียวได้แล้วใน “เข้าเกม”');
    else if (act === 'tour') alertBox('🏆 ทัวร์นาเมนต์', 'จะเปิดหลังระบบออนไลน์พร้อม — ระหว่างนี้ลองเล่น “Long Match” กับ AI ระดับ Advanced ได้เลย!');
    else if (act === 'shop') openShop('rec');
    else if (act === 'login') dailyLogin();
    else if (act === 'rank') rankingModal();
    else if (act === 'trophy') achievements();
    else if (act === 'news' || act === 'mail') mailModal();
    else if (act === 'profile') openProfile();
    else if (act === 'settings') settingsModal();
    else if (act === 'exchange') openShop('exch');
    else if (act === 'energy') toast('❤️ พลังงานเต็ม 20/20 — เล่นได้ไม่จำกัดใน Prototype');
  });
  $('#btnContinue').onclick = function () { var s = localStorage.getItem('rfs_save_auto'); if (s) startGame(JSON.parse(s)); };
  $('#btnInv').onclick = function () { openInventory('Game Equipment'); };
  $('#btnProfile').onclick = openProfile;
  $('#btnLoad').onclick = function () { loadModal(); };
  $('#btnGuide').onclick = guideModal;
  $('#btnSettings').onclick = settingsModal;
  $('#btnMusic').onclick = function () { if (!Music.playing) { U.music = true; saveSettings(); Music.start('menu'); toast('🎵 เปิดเพลง: ' + (Music.song ? esc(Music.song.title) : '')); } else { Music.next(); } };
  document.querySelectorAll('[data-back]').forEach(function (b) { b.onclick = function () { show(b.dataset.back || 'menu'); }; });

  function dailyLogin() {
    var ls = Meta.loginState();
    var cells = DAILY_REWARDS.map(function (r, i) {
      var got = ls.canClaim ? i < ls.day : i <= ls.day, today = ls.canClaim && i === ls.day;
      var icon = r.item && !r.gold ? spr(Meta.item(r.item).spr, 56, 56) : r.diamond && !r.gold ? spr(['rec', 27, 3, 1], 60, 56) : spr(['items', 14, 3, 0], 60, 56);
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
    var P = Meta.p, A = [['ชนะครั้งแรก', P.stats.wins >= 1], ['เล่นครบ 5 เกม', P.stats.games >= 5], ['เศรษฐีหมื่นห้า (NW 15,000+)', P.stats.best >= 15000], ['เจ้าสัว (NW 30,000+)', P.stats.best >= 30000], ['นักสะสม (ของตกแต่ง 5 ชิ้น)', Object.keys(P.deco).length >= 5], ['เพื่อนครบแก๊ง (ตัวละคร 8 ตัว)', Object.keys(P.chars).length >= 8]];
    modal({ title: '🏆 ความสำเร็จ', body: '<div class="col" style="min-width:460px">' + A.map(function (a) { return '<div class="opt">' + (a[1] ? '🏅' : '🔒') + ' ' + a[0] + '</div>'; }).join('') + '</div>', buttons: [{ t: 'ปิด', v: 1 }] });
  }
  function mailModal() { modal({ title: '✉️ จดหมาย & ข่าวสาร', body: '<div class="col" style="max-width:640px">' + Meta.p.mail.map(function (m) { return '<div class="opt">📩 ' + esc(m.m) + '</div>'; }).join('') + '<div class="opt">📢 Version 0.1 — 4 แผนที่, 5 เขตธุรกิจต่อแผนที่, การ์ด 100 ใบ, หุ้น/ปันผล/ภาษี, AI 3 ระดับ, ร้านค้า & Loadout</div></div>', buttons: [{ t: 'ปิด', v: 1 }] }); }
  function settingsModal() {
    var body = document.createElement('div'); body.className = 'col'; body.style.minWidth = '460px';
    function draw() {
      body.innerHTML = '<b>ความเร็ว AI / Animation</b><div class="seg">' + [1, 2, 4].map(function (s) { return '<div data-sp="' + s + '" class="' + (U.speed === s ? 'on' : '') + '">' + s + 'x</div>'; }).join('') + '</div>' +
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
    var html = '<div style="max-width:900px;font-size:15px;font-weight:600;line-height:1.55">' +
      '<b>🎯 เป้าหมาย:</b> สะสมทรัพย์สินรวม (เงินสด + ร้าน + หุ้น) ให้ถึงเป้าหมาย แล้ว <b>กลับถึงธนาคาร</b><br>' +
      '<b>🃏 เงินเดือน:</b> เก็บสัญลักษณ์ ♥ ♦ ♣ ♠ ครบ แล้วผ่าน/หยุดธนาคาร → เลื่อนระดับ + เงินเดือน = 300 + Lv×100 + 2% ของมูลค่าทรัพย์สิน<br>' +
      '<b>🏘️ เขตธุรกิจ (สไตล์ Fortune Street):</b> ร้านในเขตเดียวกันมี<b>ขอบสีเดียวกัน</b> และพื้นที่รอบ ๆ เป็นสีประจำเขต ถือหลายร้านในเขตเดียวกัน = โบนัส<br>' +
      '<table style="border-collapse:collapse;margin:6px 0;font-weight:800"><tr style="background:#ffe2a8"><th style="padding:3px 10px">ร้านในเขต</th><th style="padding:3px 10px">มูลค่า/ค่าเช่า</th><th style="padding:3px 10px">ลงทุนได้สูงสุด</th></tr>' +
      '<tr><td style="text-align:center">1 ร้าน</td><td style="text-align:center">+0%</td><td style="text-align:center">Lv ' + C.levelCapByCount[1] + '</td></tr><tr><td style="text-align:center">2 ร้าน</td><td style="text-align:center">+5%</td><td style="text-align:center">Lv ' + C.levelCapByCount[2] + '</td></tr><tr><td style="text-align:center">3 ร้าน</td><td style="text-align:center">+10%</td><td style="text-align:center">Lv ' + C.levelCapByCount[3] + '</td></tr><tr><td style="text-align:center">ครบเขต (ผูกขาด)</td><td style="text-align:center">+10% × Monopoly 1.20</td><td style="text-align:center">Lv 8 โรงแรมหรู</td></tr></table>' +
      '<b>🏗️ อัปเกรด 8 ระดับ:</b> บ้านเล็ก → บ้านชั้นเดียว → สองชั้น → บ้านใหญ่ → บ้านหรู → โรงแรมเล็ก → กลาง → โรงแรมหรู (หยุดที่ร้านตัวเองหรือหยุดที่ธนาคาร)<br>' +
      '<b>💰 ค่าเช่า:</b> ค่าเช่าพื้นฐาน × โบนัสเขต × Monopoly × เหตุการณ์ (เพดาน 5,000 G) → เจ้าของ 85% • ภาษีเมือง 5% • กองทุนปันผล 10%<br>' +
      '<b>📈 หุ้น:</b> ซื้อที่ธนาคาร/Stock Broker (ค่าธรรมเนียม 1%), ขายต้นเทิร์น (2%). ราคาขึ้นเมื่อมูลค่าเขตเพิ่ม (±15% ต่อครั้ง). ผู้ถือหุ้นได้ปันผลทุกครั้งที่มีคนจ่ายค่าเช่าในเขตนั้น<br>' +
      '<b>🤝 ซื้อกิจการ:</b> หลังจ่ายค่าเช่า สามารถซื้อร้านคู่แข่งได้ที่ 5 เท่าของมูลค่า<br>' +
      '<b>🍀 ช่อง Lucky/Super Lucky:</b> รับเงินจากกองภาษีเมือง • <b>Tax:</b> จ่าย 300 G หรือ 3% ของเงินสด (สูงสุด 1,000) • <b>ภาษีทรัพย์สิน</b> 1% ทุก 5 เทิร์น (สูงสุด 500)<br>' +
      '<b>🎒 อุปกรณ์:</b> ติดตั้งได้ 2 ชิ้น + การ์ดพิเศษ 1 ใบ ใช้ได้อย่างละ 1 ครั้งต่อเกม • <b>ล้มละลาย:</b> ระบบขายหุ้น → อาคาร → ร้าน อัตโนมัติ หากยังติดลบจะล้มละลาย</div>';
    return modal({ title: '📖 คู่มือการเล่น', width: 980, body: html, buttons: [{ t: 'เข้าใจแล้ว!', v: 1, cls: 'green' }] });
  }

  // =====================================================================
  // SETUP
  // =====================================================================
  var LENGTHS = [{ n: 'Quick Match', t: 20000, r: 50, d: '~15–25 นาที • เป้า 20,000 G' }, { n: 'Standard', t: 30000, r: 100, d: '~30–45 นาที • เป้า 30,000 G' }, { n: 'Long Match', t: 45000, r: 100, d: '~45–90 นาที • เป้า 45,000 G' }];
  function openSetup(vsAI) {
    var P = Meta.p;
    if (!U.sel.slots || vsAI) U.sel.slots = [{ type: 'human', name: P.name, char: P.equip.char }, { type: 'ai', lv: 1 }, { type: 'ai', lv: 1 }, { type: 'ai', lv: 1 }];
    U.sel.slots[0].char = P.equip.char; U.sel.slots[0].name = P.name;
    renderSetup(); show('setup');
  }
  function renderSetup() {
    var sel = U.sel;
    $('#mapCards').innerHTML = MAPS.map(function (m, i) {
      return '<div class="mapcard ' + (sel.map === i ? 'sel' : '') + '" data-map="' + i + '"><div class="thumb" style="background-image:url(assets/' + m.bg + '.webp)"></div><div class="nm">' + m.th + ' <span class="muted" style="font-size:14px">' + m.name + '</span></div><div class="row" style="gap:4px;padding:0 12px 10px">' + m.districts.map(function (d) { return '<span title="' + esc(d.th) + '" style="width:22px;height:14px;border-radius:5px;background:' + d.color + ';border:2px solid #6b4226"></span>'; }).join('') + '<span style="font-size:12px;font-weight:800;margin-left:4px">' + (function () { var b = Game.buildBoard(i); return 'แผนที่' + m.size + ' • ' + b.tiles.length + ' ช่อง • ' + b.districts.length + ' เขต • ' + b.tiles.filter(function (t) { return t.type === 'shop'; }).length + ' ร้าน'; })() + '</span></div></div>';
    }).join('');
    document.querySelectorAll('[data-map]').forEach(function (e) { e.onclick = function () { sel.map = +e.dataset.map; renderSetup(); }; });
    var used = sel.slots.map(function (s) { return s.char; });
    $('#slots').innerHTML = sel.slots.map(function (s, i) {
      var types = i === 0 ? [['human', 'คุณ (P1)']] : [['human', 'ผู้เล่น'], ['ai', 'AI'], ['off', 'ปิด']];
      var charSp = s.type === 'off' ? '<div style="height:90px;display:flex;align-items:center;font-size:40px">—</div>' : s.char ? spr(Meta.charSprite(s.char, i === 0 ? Meta.p.equip.costume : 'chars'), 90, 90) : '<div style="height:90px;display:flex;align-items:center;font-weight:900">🎲 สุ่มตัวละคร</div>';
      return '<div class="slot" style="border-color:' + PLAYER_COLORS[i] + ';border-width:5px"><div class="row"><b style="color:' + PLAYER_COLORS[i] + ';font-size:20px">P' + (i + 1) + '</b><div class="seg grow">' + types.map(function (t) { return '<div data-ty="' + i + ':' + t[0] + '" class="' + (s.type === t[0] ? 'on' : '') + '">' + t[1] + '</div>'; }).join('') + '</div></div>' +
        '<div class="row" style="justify-content:center;cursor:pointer;margin:6px 0" data-ch="' + i + '">' + charSp + '</div>' +
        (s.type === 'ai' ? '<div class="seg">' + AI_LEVELS.map(function (l, k) { return '<div data-lv="' + i + ':' + k + '" class="' + (s.lv === k ? 'on' : '') + '">' + l.name + '</div>'; }).join('') + '</div>' : s.type === 'human' ? '<div style="text-align:center;font-weight:800">' + (i === 0 ? esc(Meta.p.name) + ' • ใช้ Loadout ของคุณ' : 'เล่นบนเครื่องเดียวกัน (Hot-seat)') + '</div>' : '<div style="text-align:center" class="muted">ไม่มีผู้เล่น</div>') + '</div>';
    }).join('');
    document.querySelectorAll('[data-ty]').forEach(function (e) { e.onclick = function () { var a = e.dataset.ty.split(':'); var s = sel.slots[+a[0]]; s.type = a[1]; if (s.type === 'ai' && s.lv === undefined) s.lv = 1; if (s.type !== 'human') s.char = null; renderSetup(); }; });
    document.querySelectorAll('[data-lv]').forEach(function (e) { e.onclick = function () { var a = e.dataset.lv.split(':'); sel.slots[+a[0]].lv = +a[1]; renderSetup(); }; });
    document.querySelectorAll('[data-ch]').forEach(function (e) { e.onclick = function () { var i = +e.dataset.ch; if (sel.slots[i].type !== 'human' || i === 0) { if (i === 0) toast('เลือกตัวละครของคุณในหน้าถัดไป (Pre-Match Setup)'); return; } pickCharModal(i); }; });
    $('#lenSeg').innerHTML = LENGTHS.map(function (l, i) { return '<div data-len="' + i + '" class="' + (sel.len === i ? 'on' : '') + '">' + l.n + '<div style="font-size:11px">' + l.d + '</div></div>'; }).join('');
    document.querySelectorAll('[data-len]').forEach(function (e) { e.onclick = function () { sel.len = +e.dataset.len; renderSetup(); }; });
  }
  function pickCharModal(i) {
    var taken = U.sel.slots.map(function (s, k) { return k !== i ? s.char : null; });
    var keys = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'];
    modal({ title: 'เลือกตัวละคร P' + (i + 1), width: 900, body: '<div class="charpick">' + keys.map(function (k) { var dis = taken.indexOf(k) >= 0; return '<div class="charbtn ' + (dis ? 'lock' : '') + '" data-k="' + k + '">' + spr(Meta.charSprite(k, 'chars'), 80, 84) + '</div>'; }).join('') + '</div>', mount: function (box, close) { box.querySelectorAll('[data-k]').forEach(function (e) { e.onclick = function () { if (!e.classList.contains('lock')) close(e.dataset.k); }; }); } })
      .then(function (k) { if (k) { U.sel.slots[i].char = k; renderSetup(); } });
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
  function openLoadout() { var e = Meta.p.equip, v = Meta.validLoadout(); e.eq = v.eq; e.sc = v.sc; renderLoadout(); show('loadout'); }
  function renderLoadout() {
    var P = Meta.p, e = P.equip, m = MAPS[U.sel.map];
    var taken = U.sel.slots.slice(1).map(function (s) { return s.char; });
    var keys = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'x0', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'];
    var chars = keys.map(function (k) {
      var own = P.chars[k], dis = !own || taken.indexOf(k) >= 0;
      return '<div class="charbtn ' + (e.char === k ? 'sel ' : '') + (dis ? 'lock' : '') + '" data-c="' + k + '" style="height:84px">' + spr(Meta.charSprite(k, e.costume), 54, 72) + (!own ? '<span class="who">🔒</span>' : '') + '</div>';
    }).join('');
    var ci = /^b/.test(e.char) ? +e.char.slice(1) : -1, hasCozy = ci >= 0 && P.costumes['cz' + ci];
    var slot = function (idx, kind) {
      var id = kind === 'sc' ? e.sc : e.eq[idx], it = id && Meta.item(id);
      return '<div class="eqslot ' + (it ? 'filled' : '') + '" data-slot="' + (kind === 'sc' ? 'sc' : idx) + '" style="' + (LO.slot === (kind === 'sc' ? 'sc' : idx) ? 'outline:5px solid #ff7aa8' : '') + '">' +
        (it ? spr(it.spr, 84, 70) + '<div>' + it.name + '</div><div style="font-size:11px;font-weight:700">' + it.desc + '</div>' : '<div style="font-size:30px">＋</div>' + (kind === 'sc' ? 'Special Card Slot' : 'Equipment Slot ' + (idx + 1))) + '</div>';
    };
    var inv = EQUIPMENT.concat(SPECIAL_CARDS).map(function (it) {
      var q = Meta.owned(it.id), isSC = /^SC_/.test(it.id), eqd = isSC ? e.sc === it.id : e.eq.indexOf(it.id) >= 0;
      return '<div class="invitem ' + (q ? '' : 'dim') + (eqd ? ' eqd' : '') + '" data-it="' + it.id + '"><span class="q">x' + q + '</span>' + spr(it.spr, 64, 58) + '<div>' + it.name + '</div><div style="font-size:10px;font-weight:700">' + (isSC ? 'การ์ดพิเศษ' : 'อุปกรณ์') + '</div></div>';
    }).join('');
    var html = '<div class="row" style="align-items:flex-start;gap:16px">' +
      '<div class="col" style="width:560px"><div class="panel" style="padding:10px"><b>1) Character Selection</b><div class="charpick" style="margin-top:6px">' + chars + '</div>' +
      '<div class="row" style="margin-top:8px"><b>2) Character Costume</b><div class="seg grow"><div data-cos="chars" class="' + (e.costume !== 'cozy' ? 'on' : '') + '">ชุดเริ่มต้น</div><div data-cos="cozy" class="' + (e.costume === 'cozy' ? 'on' : '') + '" style="' + (hasCozy ? '' : 'opacity:.4') + '">ชุดพิเศษ ' + (hasCozy ? '' : '🔒') + '</div></div></div></div>' +
      '<div class="panel" style="padding:10px"><b>6) Inventory — แตะเพื่อใส่ช่องที่เลือก</b> <span class="muted" style="font-size:13px">(ใช้ได้เมื่อมีใน Inventory • ไอเทมจะถูกหักเมื่อใช้งานจริงในเกม)</span><div class="invgrid" style="margin-top:6px;max-height:300px;overflow:auto">' + inv + '</div></div></div>' +
      '<div class="col" style="width:330px;align-items:center"><div class="panel" style="padding:12px;width:100%;text-align:center">' + spr(Meta.charSprite(e.char, e.costume), 200, 190) + '<div style="font-weight:900;font-size:20px">' + Meta.charName(e.char) + '</div></div>' +
      '<div class="row" style="gap:10px">' + slot(0) + slot(1) + '</div>' + slot(0, 'sc') + '</div>' +
      '<div class="col" style="width:300px"><div class="panel" style="padding:10px"><b>7) Map Preview</b><div style="height:170px;border-radius:14px;border:3px solid #6b4226;margin-top:6px;background:url(assets/' + m.bg + '.webp) center/cover"></div><div style="font-weight:900;font-size:18px;margin-top:4px">' + m.th + '</div>' + m.districts.map(function (d) { return '<div class="row" style="font-size:13px;font-weight:800;gap:6px"><span style="width:16px;height:12px;border-radius:4px;background:' + d.color + ';border:2px solid #6b4226"></span>' + d.th + '</div>'; }).join('') + '</div>' +
      '<div class="panel" style="padding:10px;font-weight:800;font-size:14px"><b>5) ตรวจสอบความพร้อม</b><div>ตัวละคร: ' + Meta.charName(e.char) + '</div><div>อุปกรณ์: ' + (e.eq.map(function (id) { return Meta.item(id).name; }).join(', ') || '-') + ' (' + e.eq.length + '/2)</div><div>การ์ดพิเศษ: ' + (e.sc ? Meta.item(e.sc).name : '-') + ' (' + (e.sc ? 1 : 0) + '/1)</div><div>โหมด: ' + LENGTHS[U.sel.len].n + '</div></div></div></div>';
    $('#loadoutBody').innerHTML = html;
    var B = $('#loadoutBody');
    B.querySelectorAll('[data-c]').forEach(function (x) { x.onclick = function () { if (x.classList.contains('lock')) { toast(Meta.p.chars[x.dataset.c] ? 'ตัวละครนี้ถูกเลือกแล้ว' : '🔒 ปลดล็อกตัวละครนี้ได้ที่ร้านค้า'); return; } e.char = x.dataset.c; Meta.save(); renderLoadout(); }; });
    B.querySelectorAll('[data-cos]').forEach(function (x) { x.onclick = function () { if (x.dataset.cos === 'cozy' && !hasCozy) { toast('🔒 ซื้อชุดพิเศษได้ที่ร้านค้า หมวด Characters & Costumes'); return; } e.costume = x.dataset.cos; Meta.save(); renderLoadout(); }; });
    B.querySelectorAll('[data-slot]').forEach(function (x) { x.onclick = function () { var s = x.dataset.slot === 'sc' ? 'sc' : +x.dataset.slot; if (LO.slot === s) { if (s === 'sc') e.sc = null; else e.eq.splice(s, 1); Meta.save(); } LO.slot = s; renderLoadout(); }; });
    B.querySelectorAll('[data-it]').forEach(function (x) {
      x.onclick = function () {
        var id = x.dataset.it, isSC = /^SC_/.test(id);
        if (!Meta.owned(id)) { toast('ยังไม่มีไอเทมนี้ใน Inventory — ซื้อได้ที่ร้านค้า'); return; }
        if (isSC) { e.sc = e.sc === id ? null : id; LO.slot = 'sc'; }
        else {
          var at = e.eq.indexOf(id);
          if (at >= 0) e.eq.splice(at, 1); // tap again = remove
          else { var s = typeof LO.slot === 'number' ? LO.slot : (e.eq.length < 2 ? e.eq.length : 1); if (s > e.eq.length) s = e.eq.length; e.eq[s] = id; e.eq = e.eq.slice(0, 2); LO.slot = e.eq.length < 2 ? e.eq.length : s; }
        }
        Meta.save(); renderLoadout();
      };
    });
  }
  $('#btnStart').onclick = function () {
    var P = Meta.p, e = P.equip, v = Meta.validLoadout();
    if (e.eq.length !== new Set(e.eq).size) { toast('ห้ามติดตั้งอุปกรณ์ชิ้นเดียวกันซ้ำ'); return; }
    if (!P.chars[e.char]) { toast('ต้องเลือกตัวละครที่ปลดล็อกแล้ว'); return; }
    var L = LENGTHS[U.sel.len], slots = U.sel.slots;
    var usedChars = [e.char]; slots.slice(1).forEach(function (s) { if (s.char) usedChars.push(s.char); });
    var pool = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'].filter(function (k) { return usedChars.indexOf(k) < 0; });
    var aiNames = ['คุมะ AI', 'โคริ AI', 'คิอิโระ AI', 'ชาอิ AI', 'เนโกะ AI', 'ริสุ AI', 'เพนกิ AI', 'ชิกะ AI'];
    var players = [], hn = 1;
    slots.forEach(function (s, i) {
      if (s.type === 'off') return;
      var ch = i === 0 ? e.char : (s.char || pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      if (i !== 0 && s.type === 'human') hn++;
      players.push({
        name: i === 0 ? P.name : s.type === 'human' ? 'ผู้เล่น ' + (i + 1) : aiNames[+ch.slice(1)] || ('AI ' + (i + 1)), char: ch, costume: i === 0 ? e.costume : 'chars', isAI: s.type === 'ai',
        aiLevel: s.type === 'ai' ? AI_LEVELS[s.lv].id : null, persona: AI_PERSONAS[Math.floor(Math.random() * AI_PERSONAS.length)],
        loadout: i === 0 ? { eq: v.eq, sc: v.sc } : null, owner: i === 0,
      });
    });
    var s = Game.create({ mapIdx: U.sel.map, players: players, target: L.t, maxRounds: L.r, seed: Math.floor(Math.random() * 1e9) });
    s.ownerIdx = 0; s.dice = P.equip.dice; s.lenName = L.n;
    startGame(s, true);
  };

  // =====================================================================
  // GAME
  // =====================================================================
  // ---------- painted board + camera (zoom / pan / follow) ----------
  var SC = 0.6, BT = 42, VW = 862, VH = 724;
  var CAM = { z: 1, tx: 0, ty: 0, follow: true };
  function startGame(state, isNew) {
    U.token++; var tok = U.token;
    var g = new Game(state, null); g.io = makeIO(g, tok); U.g = g;
    U.view = state.players.findIndex(function (p) { return !p.isAI; }); if (U.view < 0) U.view = 0;
    show('game'); buildBoard(); refresh();
    $('#logBox').innerHTML = ''; state.log.slice(-40).forEach(function (l) { addLog(l.m, l.k); });
    (async function () {
      try {
        if (isNew) await orderIntro(g);
        while (!g.s.over && tok === U.token) { await g.playTurn(); if (tok !== U.token) return; refresh(); }
        if (tok === U.token) { consumeUsed(g); localStorage.removeItem('rfs_save_auto'); await wait(600); showResult(g); }
      } catch (err) { if (err !== 'abort') { console.error(err); toast('⚠️ ' + (err && err.message || err)); } }
    })();
  }
  async function orderIntro(g) {
    var s = g.s;
    var html = '<div class="row" style="gap:14px;justify-content:center">' + s.orderRolls.map(function (r, i) { var p = s.players[r.id]; return '<div style="text-align:center;border:4px solid ' + p.color + ';border-radius:18px;padding:8px;background:#fff;width:170px">' + spr(charSpec(p), 100, 100) + '<div style="font-weight:900">' + esc(p.name) + '</div>' + spr(['dice', 6 + r.roll], 50, 50) + '<div style="font-weight:900;font-size:20px">ลำดับที่ ' + (i + 1) + '</div></div>'; }).join('') + '</div><div style="text-align:center;margin-top:8px;font-weight:800">ทุกคนเริ่มที่ธนาคาร • เป้าหมาย ' + fmt(s.settings.target) + ' G • สูงสุด ' + s.settings.maxRounds + ' รอบ</div>';
    sfx('dice');
    await modal({ title: '🎲 ทอยลูกเต๋าจัดลำดับผู้เล่น', width: 820, body: html, buttons: [{ t: 'เริ่มเกม!', v: 1, cls: 'pink' }], close: false });
  }
  function cardGridHTML(grid, hl) {
    var s = U.g.s, own = s.gridOwner || [];
    var legend = '<div class="row" style="justify-content:center;gap:8px;margin-bottom:6px">' + s.players.map(function (q) { return '<span class="chip" style="border-color:' + q.color + '"><span style="width:14px;height:14px;border-radius:4px;background:' + q.color + '"></span>' + esc(q.name) + ' ' + own.filter(function (o) { return o === q.id; }).length + '</span>'; }).join('') + '</div>';
    return legend + '<div style="display:flex;justify-content:center"><div class="cgrid">' + grid.map(function (u, i) {
      var o = own[i], q = o >= 0 ? s.players[o] : null, on = hl && hl.indexOf(i) >= 0;
      return '<div data-c="' + i + '" class="' + (u ? 'used ' : '') + (on ? 'pick' : '') + '" style="' + (q ? 'background:' + q.color + ';box-shadow:inset 0 0 0 3px rgba(255,255,255,.7)' + (on ? ',0 0 0 4px #fff,0 0 12px ' + q.color : '') : '') + '">' + (q ? '<span class="gi">' + spr(charSpec(q), 30, 30) + '</span>' : '') + '</div>';
    }).join('') + '</div></div>';
  }
  function charSpec(p) { if (/^x/.test(p.char)) return ['extra', +p.char.slice(1)]; var i = +p.char.slice(1); return [p.costume === 'cozy' ? 'cozy' : 'chars', i]; }
  U.charSpec = charSpec;
  function consumeUsed(g) {
    var p = g.s.players[g.s.ownerIdx || 0]; if (!p || p.isAI) return;
    g.loadoutSlots(p).forEach(function (sl) { if (sl.used && !sl.consumed) { sl.consumed = true; Meta.consume(sl.id); } });
  }
  function buildBoard() {
    var g = U.g, s = g.s, M = MAPS[s.mapIdx];
    $('#boardBg').style.backgroundImage = 'url(assets/' + M.bg + '.webp)';
    SC = Math.min(VW / s.w, VH / s.h); BT = M.ts * SC;
    var B = $('#board'); B.style.left = '0px'; B.style.top = '0px'; B.style.width = s.w * SC + 'px'; B.style.height = s.h * SC + 'px';
    B.style.backgroundImage = 'url(assets/' + M.bg + '.webp)'; B.style.backgroundSize = '100% 100%';
    var h = '';
    // painted lots (Riverside): show the district's buildings on its lot
    M.districts.forEach(function (d, i) { if (d.lot) h += '<div class="lot" id="lot' + i + '" style="left:' + d.lot[0] * SC + 'px;top:' + d.lot[1] * SC + 'px;width:' + (d.lot[2] - d.lot[0]) * SC + 'px;height:' + (d.lot[3] - d.lot[1]) * SC + 'px"></div>'; });
    s.tiles.forEach(function (t) { h += '<div class="ptile" id="t' + t.id + '" data-t="' + t.id + '"></div>'; });
    M.districts.forEach(function (d, i) { h += '<div class="dlabel" id="dl' + i + '" style="left:' + d.label[0] * SC + 'px;top:' + (d.label[1] * SC - 10) + 'px;border-color:' + d.color + ';font-size:' + Math.max(9, Math.min(12, BT * 0.24)) + 'px"></div>'; });
    s.players.forEach(function (p) { h += '<div class="piece" id="pc' + p.id + '" style="--pc:' + p.color + '"><div class="pin">P' + (p.id + 1) + '</div><div class="ring"></div>' + spr(charSpec(p), BT * 1.05, BT * 1.15) + '</div>'; });
    B.innerHTML = h;
    B.onclick = function (e) { if (U.dragMoved) return; var t = e.target.closest('[data-t]'); if (t && !modalOpen && !U.choosingDir) tileInfo(+t.dataset.t); };
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
  function tileHTML(t) {
    var g = U.g, s = g.s, T = BT, html = '', style = '', cls = 'ptile', fs = Math.max(8.5, T * 0.21);
    var lbl = function (txt, col) { return '<div class="lbl" style="font-size:' + fs + 'px;line-height:' + (fs * 1.35) + 'px;' + (col ? 'border-color:' + col : '') + '">' + txt + '</div>'; };
    if (t.type === 'shop') {
      var d = s.districts[t.district], biz = BUSINESS.find(function (b) { return b.id === t.biz; }) || BUSINESS[0];
      if (t.owner >= 0) {
        var o = s.players[t.owner], bw = Math.max(3, T * 0.09);
        cls += ' owned'; style += 'border:' + bw + 'px solid ' + o.color + ';background:' + hexA(o.color, .35) + ';box-shadow:0 0 0 2px #fff,0 0 ' + T * 0.25 + 'px ' + o.color + ';';
        html += '<div class="bld">' + spr(['lvl', t.level - 1], T * 1.12, T * 1.02) + '</div><div class="lv" style="font-size:' + fs * 0.9 + 'px">Lv' + t.level + '</div><div class="own" style="border-color:' + o.color + ';width:' + T * 0.5 + 'px;height:' + T * 0.5 + 'px">' + spr(charSpec(o), T * 0.42, T * 0.42) + '</div>' + lbl(fmt(g.shopRent(t)), o.color);
        if (g.noRent(t)) html += '<div style="position:absolute;top:10%;font-size:' + T * 0.4 + 'px">🔧</div>';
      } else {
        style += 'border:' + Math.max(2, T * 0.05) + 'px dashed ' + d.color + ';';
        html += '<div class="forsale">' + spr(['lvl', biz.spr], T * 0.78, T * 0.7) + '</div>' + lbl(fmt(g.buyPrice(t)), d.color);
      }
    } else if (t.type === 'vacant' && t.special) {
      var b = SPECIAL_BUILDINGS.find(function (x) { return x.id === t.special; }), ow = s.players[t.spOwner];
      style += ow ? 'border:' + Math.max(3, T * 0.09) + 'px solid ' + ow.color + ';background:' + hexA(ow.color, .3) + ';' : '';
      html = '<div class="bld">' + spr(b.spr, T * 1.05, T * 0.95) + '</div>' + (ow ? '<div class="own" style="border-color:' + ow.color + ';width:' + T * 0.5 + 'px;height:' + T * 0.5 + 'px">' + spr(charSpec(ow), T * 0.42, T * 0.42) + '</div>' : '') + lbl(b.th);
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
      el.className = r.cls + (el.classList.contains('hl') ? ' hl' : '');
      el.style.cssText = 'left:' + (t.x * SC - T * big / 2) + 'px;top:' + (t.y * SC - T * big / 2) + 'px;width:' + T * big + 'px;height:' + T * big + 'px;border-radius:' + T * 0.22 + 'px;' + r.style;
      el.innerHTML = r.html;
    });
    // lots: buildings of owned shops in that district
    MAPS[s.mapIdx].districts.forEach(function (d, i) {
      var el = document.getElementById('lot' + i); if (!el) return;
      var owned = s.districts[i].tiles.map(function (id) { return s.tiles[id]; }).filter(function (t) { return t.owner >= 0; });
      el.innerHTML = owned.map(function (t) { var o = s.players[t.owner]; return '<div class="lotb" style="border-color:' + o.color + '">' + spr(['lvl', t.level - 1], BT * 1.2, BT * 1.1) + '</div>'; }).join('');
    });
  }
  function refreshLabels() {
    var g = U.g, s = g.s;
    s.districts.forEach(function (d, i) {
      var el = document.getElementById('dl' + i); if (!el) return;
      var owners = d.tiles.map(function (id) { return s.tiles[id].owner; }), mono = owners[0] >= 0 && owners.every(function (o) { return o === owners[0]; });
      el.style.borderColor = mono ? s.players[owners[0]].color : d.color;
      el.innerHTML = '<span style="background:' + d.color + '"></span>' + esc(d.th) + ' • ' + d.price + ' G' + (mono ? ' 👑' + esc(s.players[owners[0]].name) : '');
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
      });
    });
  }
  function refresh() {
    if (!U.g) return;
    var g = U.g, s = g.s;
    refreshTiles(); refreshLabels(); placePieces(); renderPlayers(); renderStocks(); renderItems();
    $('#roundPill').innerHTML = spr(['items', 19], 42, 42) + 'รอบ ' + Math.min(s.round, s.settings.maxRounds) + ' / ' + s.settings.maxRounds;
    $('#targetPill').innerHTML = '<span style="font-size:30px">🎯</span><div><small>เป้าหมายทรัพย์สิน</small><div class="v">' + fmt(s.settings.target) + ' G</div></div>';
  }
  U.refresh = refresh;
  function renderPlayers() {
    var g = U.g, s = g.s, cur = g.cp();
    var rank = s.players.slice().sort(function (a, b) { if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1; return g.netWorth(b) - g.netWorth(a); }).map(function (p) { return p.id; });
    $('#pbar').innerHTML = s.players.map(function (p) {
      var rk = rank.indexOf(p.id) + 1;
      return '<div class="pcard ' + (p.id === cur.id && !s.over ? 'turn ' : '') + (p.bankrupt ? 'bk' : '') + '" data-p="' + p.id + '" style="--pc:' + p.color + ';--pcl:' + hexA(p.color, .32) + '">' + (rk === 1 && !p.bankrupt ? '<div class="crown">👑</div>' : '') +
        '<div style="flex:none">' + spr(charSpec(p), 78, 88) + '</div><div class="col" style="gap:1px;flex:1;min-width:0">' +
        '<div class="row" style="gap:5px"><span class="pno">P' + (p.id + 1) + '</span><span class="nm">' + esc(p.name) + '</span>' + (p.isAI ? '<span class="aitag">AI·' + { beginner: 'Easy', normal: 'Normal', advanced: 'Adv' }[p.ai.level] + '</span>' : '') + '</div>' +
        '<div class="cash coin">' + fmt(p.cash) + ' G</div>' +
        '<div class="row" style="gap:6px"><span class="nwpill">ทรัพย์สิน ' + fmt(g.netWorth(p)) + ' G</span><div class="suits">' + SUITS.map(function (k) { return '<span class="' + (p.suits[k] ? 'on' : '') + '" style="' + (p.suits[k] ? 'color:' + SUIT_COLOR[k] : '') + '">' + SUIT_GLYPH[k] + '</span>'; }).join('') + '</div></div></div>' +
        '<div class="rankb">#' + rk + '</div></div>';
    }).join('');
  }
  $('#pbar').onclick = function (e) { var c = e.target.closest('[data-p]'); if (c && !modalOpen) playerInfo(U.g.s.players[+c.dataset.p]); };
  function renderStocks() {
    var g = U.g, s = g.s, me = s.players[U.view];
    $('#stockBox').innerHTML = '<div style="font-weight:900;font-size:14px;display:flex;justify-content:space-between"><span>📈 หุ้นเขตธุรกิจ</span><span class="muted">ราคา • ถือ</span></div>' + s.districts.map(function (d, i) {
      var h = d.hist, ch = h.length > 1 ? d.price - h[h.length - 2] : 0;
      return '<div class="srow" data-d="' + i + '"><span class="dot" style="background:' + d.color + '"></span><span class="grow" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + d.name + '</span><b>' + d.price + '</b><span style="width:20px;color:' + (ch > 0 ? '#2c8a2c' : ch < 0 ? '#c0392b' : '#999') + '">' + (ch > 0 ? '▲' : ch < 0 ? '▼' : '•') + '</span><span style="width:34px;text-align:right">' + (me ? me.shares[i] : 0) + '</span></div>';
    }).join('');
  }
  $('#stockBox').onclick = function (e) { var r = e.target.closest('[data-d]'); if (r && !modalOpen) districtInfo(+r.dataset.d); };
  function renderItems() {
    var g = U.g, s = g.s, cur = g.cp(), p = !cur.isAI ? cur : s.players[U.view];
    if (!p) { $('#itemBar').innerHTML = ''; return; }
    var slots = g.loadoutSlots(p);
    var card = function (sl, i) {
      var d = g.itemDef(sl.id), ready = g.canUsePre(p, sl) && !p.isAI && U.preRollActive;
      var st = sl.used ? '<span class="st used">ใช้แล้ว</span>' : d.when === 'preRoll' ? '<span class="st ready">' + (ready ? 'แตะเพื่อใช้' : 'พร้อมใช้') + '</span>' : '<span class="st on">✓ ใช้งานอยู่</span>';
      return '<div class="itemSlot ' + (sl.used ? 'used ' : '') + (ready ? 'ready' : '') + '" data-sl="' + i + '">' + spr(d.spr, 56, 50) + '<div class="in">' + d.name + '</div>' + st + '</div>';
    };
    var eq = p.loadout.eq.map(function (sl, i) { return card(sl, i); }).join('') || '<div class="muted" style="font-size:12px;font-weight:800;padding:8px">ไม่มีอุปกรณ์</div>';
    var sc = p.loadout.sc ? card(p.loadout.sc, p.loadout.eq.length) : '<div class="muted" style="font-size:12px;font-weight:800;padding:8px">ไม่มี</div>';
    var left = p.loadout.eq.filter(function (x) { return !x.used; }).length;
    $('#itemBar').innerHTML = '<div class="igroup grow"><div class="h">🎒 ไอเทมติดตัว (' + left + '/' + p.loadout.eq.length + ')</div><div class="islots">' + eq + '</div></div><div class="igroup"><div class="h">🃏 การ์ดพิเศษ (' + (p.loadout.sc && !p.loadout.sc.used ? 1 : 0) + ')</div><div class="islots">' + sc + '</div></div>';
    $('#itemBar').dataset.pid = p.id;
  }
  $('#itemBar').onclick = function (e) {
    var el = e.target.closest('[data-sl]'); if (!el || modalOpen) return;
    var g = U.g, p = g.s.players[+$('#itemBar').dataset.pid], sl = g.loadoutSlots(p)[+el.dataset.sl], d = g.itemDef(sl.id);
    var can = g.canUsePre(p, sl) && !p.isAI && U.preRollActive;
    var whenTxt = { preRoll: 'กดใช้ก่อนทอยลูกเต๋า', postRoll: 'ระบบจะถามหลังทอยลูกเต๋า', rent: 'ระบบจะถามเมื่อกำลังจะจ่ายค่าเช่า', tax: 'ระบบจะถามเมื่อกำลังจะเสียภาษี', gain: 'ระบบจะถามเมื่อได้รับเงินรางวัลจากเหตุการณ์', upgrade: 'ระบบจะถามก่อนยืนยันการอัปเกรด', buy: 'ระบบจะถามก่อนยืนยันการซื้อร้าน', negative: 'ระบบจะถามเมื่อเจอการ์ดผลเสีย', lose: 'ระบบจะถามเมื่อจะเสียเงินจากการ์ด/เทศกาล' }[d.when];
    modal({ title: d.name, body: '<div class="col" style="align-items:center;min-width:400px">' + spr(d.spr, 140, 120) + '<div style="font-size:18px;font-weight:800">' + d.th + '</div><div class="chip">เงื่อนไข: ' + whenTxt + '</div><div class="chip">คงเหลือ ' + (sl.used ? 0 : 1) + ' / 1 ครั้ง' + (sl.used ? ' • Used' : '') + '</div></div>', buttons: [{ t: 'Use', v: 'use', cls: 'green', dis: !can }, { t: 'ปิด', v: null }] })
      .then(function (v) {
        if (v !== 'use') return;
        return modal({ title: 'ยืนยันการใช้ ' + d.name + '?', body: '<div style="text-align:center;font-weight:800">' + d.th + '</div>', buttons: [{ t: 'ใช้เลย', v: 1, cls: 'green' }, { t: 'ยกเลิก', v: 0 }] })
          .then(async function (ok) { if (ok) { await g.usePreRoll(p, sl); consumeUsed(g); sfx('coin'); refresh(); if (g.s.teleportBank && U.preRollResolve) U.preRollResolve(); else if (U.preRollRender) U.preRollRender(); } });
      });
  };
  var LOG_ICON = { gain: ['items', 14, 3, 0], lose: ['items', 34], rent: ['ui', 39], buy: ['items', 39], card: ['ui', 41], div: ['ui', 38], bad: ['items', 33], win: ['items', 8] };
  function logIcon(m, k) {
    if (LOG_ICON[k]) return LOG_ICON[k];
    if (/ทอย/.test(m)) return ['dice', 11]; if (/หุ้น/.test(m)) return ['ui', 38]; if (/สัญลักษณ์/.test(m)) return ['rec', 5]; if (/ธนาคาร|เงินเดือน/.test(m)) return ['items', 42]; if (/วาร์ป|ย้าย/.test(m)) return ['ui', 46]; if (/ใช้ /.test(m)) return ['items', 15];
    return ['ui', 43];
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
  function setAct(html) { $('#actMain').innerHTML = html; }
  function setTurn(p, mine) {
    $('#turnRibbon').textContent = mine ? 'เทิร์นของคุณ' : 'เทิร์นของ ' + p.name;
    $('#turnChar').style.setProperty('--pc', p.color);
    $('#turnChar').innerHTML = spr(charSpec(p), 104, 104) + '<div class="tn"><b>P' + (p.id + 1) + '</b>' + esc(p.name) + '</div>';
    $('#actBtns').innerHTML = '';
  }

  // ---------- info popups (tap) ----------
  function tileInfo(id) {
    var g = U.g, s = g.s, t = s.tiles[id];
    if (t.type === 'shop') return shopInfo(t);
    if (t.type === 'bank') return bankInfo(s.players[U.view] || g.cp());
    var info = TILE_INFO[t.ch], desc = {
      suit: 'เดินผ่านหรือหยุดเพื่อเก็บสัญลักษณ์ ' + SUIT_GLYPH[t.suit] + ' — ครบ 4 แบบแล้วกลับธนาคารเพื่อรับเงินเดือน', chance: 'เปิดการ์ด 1 ใบจากตาราง 100 ช่อง', lucky: 'รับเงินจากกองภาษีเมือง 50% (ขั้นต่ำ ' + CONFIG.luckyMin + ' G) • กองตอนนี้ ' + fmt(s.taxPool) + ' G', superlucky: 'รับกองภาษีเมืองทั้งหมด (ขั้นต่ำ ' + CONFIG.superLuckyMin + ' G) • กองตอนนี้ ' + fmt(s.taxPool) + ' G',
      tax: 'จ่ายภาษี 300 G หรือ 3% ของเงินสด (สูงสุด 1,000 G)', casino: 'เล่นสล็อตแมชชีน (เดิมพัน 100–500 G รางวัลสูงสุด 2,500 G)', broker: 'ซื้อ/ขายหุ้นทุกเขต', vacant: t.special ? SPECIAL_BUILDINGS.find(function (b) { return b.id === t.special; }).desc + (t.spOwner >= 0 ? ' • เจ้าของ: ' + s.players[t.spOwner].name : '') : 'ซื้อที่ดินและสร้างอาคารพิเศษ: ด่านเก็บเงิน, ที่จอดรถ, สวนดอกไม้, ตลาด, โรงแรม, ออนเซ็น',
      warp: 'หยุดแล้ววาร์ปไปอีกฝั่งของแผนที่', rest: 'พักผ่อน รับ ' + CONFIG.restBonus + ' G', festival: 'งานเทศกาล — ขายของได้เงิน หรือเป็นเจ้าภาพจ่ายให้ทุกคน', event: 'เหตุการณ์ในเมืองแบบสุ่ม (การ์ดหมวด I)',
    }[t.type];
    modal({ title: (t.special ? SPECIAL_BUILDINGS.find(function (b) { return b.id === t.special; }).th : info.name), body: '<div class="col" style="align-items:center;min-width:420px">' + (t.type === 'suit' ? '<div style="font-size:90px;color:' + SUIT_COLOR[t.suit] + '">' + SUIT_GLYPH[t.suit] + '</div>' : spr(t.special ? SPECIAL_BUILDINGS.find(function (b) { return b.id === t.special; }).spr : info.icon, 140, 120)) + '<div style="font-size:18px;font-weight:800;text-align:center;max-width:520px">' + desc + '</div></div>', buttons: [{ t: 'ปิด', v: 1 }] });
  }
  function shopInfo(t) {
    var g = U.g, s = g.s, d = s.districts[t.district], biz = BUSINESS.find(function (b) { return b.id === t.biz; });
    var owner = t.owner >= 0 ? s.players[t.owner] : null, c = owner ? g.ownedIn(owner.id, t.district) : 0, n = d.tiles.length;
    var nextCost = owner && t.level < 8 ? fmt(g.upgradeCostRaw(t, t.level + 1)) + ' G' : '-';
    var kv = '<div class="kv"><span>เขต</span><b style="color:' + d.color + '">' + d.th + '</b><span>ประเภทธุรกิจ</span><b>' + biz.name + '</b><span>เจ้าของ</span><b>' + (owner ? esc(owner.name) : 'ว่าง (ซื้อได้)') + '</b><span>ระดับ</span><b>' + (owner ? 'Lv' + t.level + ' ' + CONFIG.levelName[t.level] : '-') + '</b><span>ราคาซื้อ</span><b>' + fmt(g.buyPrice(t)) + ' G</b><span>มูลค่าปัจจุบัน</span><b>' + fmt(owner ? g.shopValue(t) : g.buyPrice(t)) + ' G</b><span>ค่าเช่า</span><b>' + (owner ? fmt(g.shopRent(t)) : fmt(Math.round(CONFIG.levelRent[1] * t.f))) + ' G</b><span>ค่าอัปเกรดระดับถัดไป</span><b>' + nextCost + '</b>' +
      (owner ? '<span>โบนัสเขต (ถือ ' + c + '/' + n + ')</span><b>×' + g.distMult(t).toFixed(2) + (c >= n ? ' 👑 Monopoly' : '') + '</b><span>ลงทุนได้สูงสุด</span><b>Lv' + g.levelCap(t) + '</b><span>ราคาซื้อกิจการ (5x)</span><b>' + fmt(g.shopValue(t) * 5) + ' G</b>' : '') + '</div>';
    var levels = '<div class="row" style="gap:2px;margin-top:8px">' + [1, 2, 3, 4, 5, 6, 7, 8].map(function (L) { return '<div style="text-align:center;opacity:' + (owner && L <= t.level ? 1 : .35) + '">' + spr(['lvl', L - 1], 52, 46) + '<div style="font-size:11px;font-weight:900">Lv' + L + '</div></div>'; }).join('') + '</div>';
    modal({ title: t.name, width: 640, body: '<div class="row" style="align-items:flex-start;gap:16px"><div style="border:5px solid ' + d.color + ';border-radius:18px;padding:8px;background:#fff">' + spr(owner ? ['lvl', t.level - 1] : ['lvl', biz.spr], 150, 140) + '</div>' + kv + '</div>' + levels, buttons: [{ t: 'ดูหุ้นเขตนี้', v: 'd', cls: 'blue small' }, { t: 'ปิด', v: null }] })
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
    modal({ title: '<span style="color:' + d.color + '">■</span> ' + d.th, width: 640, body: '<div class="kv"><span>ราคาหุ้น</span><b>' + d.price + ' G</b><span>หุ้นคงเหลือในตลาด</span><b>' + g.sharesAvail(i) + ' / ' + CONFIG.stock.total + '</b><span>มูลค่าธุรกิจรวม</span><b>' + fmt(g.districtValue(i)) + ' G</b><span>ร้านมีเจ้าของ</span><b>' + d.tiles.filter(function (id) { return s.tiles[id].owner >= 0; }).length + ' / ' + d.tiles.length + '</b></div><div style="margin:8px 0">' + spark(d.hist, d.color, 580, 90) + '</div><div class="row" style="align-items:flex-start;gap:20px"><div class="col grow"><b>ร้านในเขต</b>' + shops + '</div><div class="col grow"><b>ผู้ถือหุ้น</b>' + holders + '</div></div>', buttons: [{ t: 'ปิด', v: 1 }] });
  }
  function playerInfo(p) {
    var g = U.g, s = g.s;
    var shops = g.shopsOf(p).map(function (t) { return '<div class="row" style="font-size:14px;font-weight:800"><span style="color:' + s.districts[t.district].color + '">■</span><span class="grow">' + t.name + ' Lv' + t.level + '</span><span>' + fmt(g.shopValue(t)) + '</span></div>'; }).join('') || '<div class="muted">ยังไม่มีร้าน</div>';
    var st = p.shares.map(function (n, i) { return n ? '<div class="row" style="font-size:14px;font-weight:800"><span style="color:' + s.districts[i].color + '">■</span><span class="grow">' + s.districts[i].name + '</span><span>' + n + ' × ' + s.districts[i].price + '</span></div>' : ''; }).join('') || '<div class="muted">ไม่มีหุ้น</div>';
    var rank = s.players.slice().sort(function (a, b) { return g.netWorth(b) - g.netWorth(a); }).indexOf(p) + 1;
    modal({ title: esc(p.name) + (p.isAI ? ' (AI ' + p.ai.level + ' • ' + p.ai.persona + ')' : ''), width: 760, body: '<div class="row" style="align-items:flex-start;gap:16px"><div style="text-align:center">' + spr(charSpec(p), 150, 160) + '<div class="chip">อันดับ #' + rank + '</div></div><div class="col grow"><div class="kv"><span>เงินสด</span><b>' + fmt(p.cash) + ' G</b><span>มูลค่าร้าน/อาคาร</span><b>' + fmt(g.propertyValue(p)) + ' G</b><span>มูลค่าหุ้น</span><b>' + fmt(g.stockValue(p)) + ' G</b>' + (p.safe ? '<span>บัญชีคุ้มครอง</span><b>' + fmt(p.safe) + ' G</b>' : '') + '<span>ทรัพย์สินรวม</span><b>' + fmt(g.netWorth(p)) + ' G</b><span>ระดับ</span><b>Lv' + p.level + ' (เงินเดือนถัดไป ' + fmt(g.salary(p)) + ' G)</b><span>หนี้ค้างชำระ</span><b>' + (p.cash < 0 ? fmt(-p.cash) : 0) + ' G</b></div>' + (p.hist.length > 1 ? '<div><b>ประวัติทรัพย์สิน</b><br>' + spark(p.hist, p.color, 480, 60) + '</div>' : '') + '<div class="row" style="align-items:flex-start;gap:14px"><div class="col grow"><b>ร้านค้า</b>' + shops + '</div><div class="col grow"><b>หุ้น</b>' + st + '</div></div></div></div>', buttons: [{ t: 'ปิด', v: 1 }] });
  }
  function bankInfo(p) {
    var g = U.g;
    modal({ title: '🏦 ธนาคาร', body: '<div class="kv" style="min-width:420px"><span>ผู้เล่น</span><b>' + esc(p.name) + '</b><span>เงินสด</span><b>' + fmt(p.cash) + ' G</b><span>สัญลักษณ์</span><b>' + SUITS.map(function (k) { return '<span style="color:' + (p.suits[k] ? SUIT_COLOR[k] : '#ccc') + '">' + SUIT_GLYPH[k] + '</span>'; }).join(' ') + '</b><span>เงินเดือนถ้ากลับธนาคารพร้อมสัญลักษณ์ครบ</span><b>' + fmt(g.salary(p)) + ' G</b><span>มูลค่าหุ้น</span><b>' + fmt(g.stockValue(p)) + ' G</b><span>ทรัพย์สินรวม / เป้าหมาย</span><b>' + fmt(g.netWorth(p)) + ' / ' + fmt(g.s.settings.target) + '</b><span>หนี้</span><b>' + (p.cash < 0 ? fmt(-p.cash) : 0) + ' G</b><span>กองภาษีเมือง (Lucky)</span><b>' + fmt(g.s.taxPool) + ' G</b></div>', buttons: [{ t: 'ปิด', v: 1 }] });
  }

  // ---------- Stock trading panel ----------
  function stockPanel(p, mode, title, extraTabs) {
    var g = U.g, s = g.s, custom = {};
    return modal({
      title: title, width: 1000, close: true, xValue: 'done', bgClose: false, buttons: [{ t: 'เสร็จสิ้น', v: 'done', cls: 'green' }],
      body: '<div id="spBody"></div>',
      mount: function (box) {
        var body = box.querySelector('#spBody');
        function draw() {
          var fee = p.flags.stockFeeZero ? 0 : CONFIG.stock.buyFee;
          var rows = s.districts.map(function (d, i) {
            var max = g.maxBuyShares(p, i);
            var buyBtns = mode !== 'sell' ? [1, 5, 10, 25, 50].map(function (n) { return '<button class="small green" data-b="' + i + ':' + n + '" ' + (n > max ? 'disabled' : '') + '>+' + n + '</button>'; }).join('') + '<input data-ci="' + i + '" type="number" min="1" placeholder="จำนวน" style="width:76px;font-size:16px;padding:6px;border:2px solid #6b4226;border-radius:10px;font-family:inherit" value="' + (custom[i] || '') + '"><button class="small" data-bc="' + i + '">ซื้อ</button>' : '';
            var sellBtns = mode !== 'buy' ? [1, 5, 10, 25].map(function (n) { return '<button class="small pink" data-s="' + i + ':' + n + '" ' + (n > p.shares[i] ? 'disabled' : '') + '>-' + n + '</button>'; }).join('') + '<button class="small pink" data-s="' + i + ':' + p.shares[i] + '" ' + (!p.shares[i] ? 'disabled' : '') + '>ขายหมด</button>' : '';
            return '<div class="row" style="border-bottom:2px dashed #e5cfae;padding:6px 0;gap:8px"><span style="width:16px;height:30px;border-radius:5px;background:' + d.color + ';border:2px solid #6b4226"></span><div style="width:200px"><b>' + d.name + '</b><div style="font-size:12px;font-weight:700">ราคา ' + d.price + ' G • ถือ ' + p.shares[i] + ' • ซื้อได้อีก ' + max + '</div></div>' + spark(d.hist, d.color, 90, 34) + '<div class="row" style="gap:4px;flex-wrap:wrap;flex:1">' + buyBtns + sellBtns + '</div></div>';
          }).join('');
          body.innerHTML = '<div class="row" style="justify-content:center;gap:10px;margin-bottom:6px"><span class="chip coin">' + fmt(p.cash) + ' G</span><span class="chip">ค่าธรรมเนียมซื้อ ' + (fee * 100) + '% • ขาย ' + CONFIG.stock.sellFee * 100 + '%</span><span class="chip">ถือได้สูงสุด ' + CONFIG.stock.maxPerPlayer + ' หุ้น/เขต</span></div>' + rows;
          body.querySelectorAll('[data-b]').forEach(function (b) { b.onclick = function () { var a = b.dataset.b.split(':'); if (g.buyStock(p, +a[0], +a[1])) { sfx('coin'); refresh(); draw(); } }; });
          body.querySelectorAll('[data-ci]').forEach(function (inp) { inp.oninput = function () { custom[inp.dataset.ci] = inp.value; }; });
          body.querySelectorAll('[data-bc]').forEach(function (b) { b.onclick = function () { var i = +b.dataset.bc, n = Math.floor(+custom[i] || 0); if (n <= 0) return; if (n > g.maxBuyShares(p, i)) { toast('ซื้อได้สูงสุด ' + g.maxBuyShares(p, i) + ' หุ้น'); return; } var d = s.districts[i]; var cost = Math.ceil(n * d.price * (1 + fee)); modal({ title: 'ยืนยันซื้อหุ้น', body: '<div style="text-align:center;font-weight:800">' + d.name + ' ' + n + ' หุ้น × ' + d.price + ' G + ค่าธรรมเนียม = <b>' + fmt(cost) + ' G</b></div>', buttons: [{ t: 'ซื้อ', v: 1, cls: 'green' }, { t: 'ยกเลิก', v: 0 }] }).then(function (ok) { if (ok && g.buyStock(p, i, n)) { custom[i] = ''; sfx('coin'); refresh(); } stockPanel(p, mode, title); }); }; });
          body.querySelectorAll('[data-s]').forEach(function (b) {
            b.onclick = function () {
              var a = b.dataset.s.split(':'), i = +a[0], n = +a[1], pv = g.sellPreview(p, i, n);
              var doSell = function () { g.sellStock(p, i, n); sfx('coin'); refresh(); };
              if (n >= 25) { modal({ title: 'ยืนยันขายหุ้น ' + n + ' หุ้น', body: '<div style="text-align:center;font-weight:800">ได้รับสุทธิ ' + fmt(pv.net) + ' G (หักค่าธรรมเนียม 2%)<br>ผลกระทบแรงขาย: ราคาหุ้น ' + s.districts[i].price + ' → ' + pv.newPrice + ' G</div>', buttons: [{ t: 'ขาย', v: 1, cls: 'pink' }, { t: 'ยกเลิก', v: 0 }] }).then(function (ok) { if (ok) doSell(); stockPanel(p, mode, title); }); }
              else { doSell(); draw(); }
            };
          });
        }
        draw();
      },
    });
  }
  function myShopsModal(p) {
    var g = U.g, list = g.shopsOf(p);
    if (!list.length) return alertBox('🏪 ร้านของฉัน', 'ยังไม่มีร้าน — หยุดที่ช่องร้านว่าง (กรอบเส้นประ) เพื่อซื้อ แล้วร้านจะเปลี่ยนเป็นกรอบสีของคุณ');
    modal({ title: '🏪 ร้านของ ' + esc(p.name) + ' (' + list.length + ' ร้าน)', width: 820, body: '<div class="col">' + list.map(function (t) { var d = g.s.districts[t.district], c = g.ownedIn(p.id, t.district); return '<div class="opt" data-sh="' + t.id + '" style="border-color:' + p.color + '"><span class="sw" style="background:' + d.color + '"></span>' + spr(['lvl', t.level - 1], 54, 48) + '<div class="col grow" style="gap:0"><span>' + t.name + ' • Lv' + t.level + '</span><span style="font-size:12px">' + d.th + ' (ถือ ' + c + '/' + d.tiles.length + ') • ลงทุนได้ถึง Lv' + g.levelCap(t) + '</span></div><span>ค่าเช่า <b>' + fmt(g.shopRent(t)) + '</b> • มูลค่า <b>' + fmt(g.shopValue(t)) + '</b></span></div>'; }).join('') + '<div class="muted" style="font-size:13px;font-weight:800">อัปเกรดได้เมื่อหยุดที่ร้านของตัวเอง หรือหยุดที่ธนาคาร</div></div>', buttons: [{ t: 'ปิด', v: null }], mount: function (box, close) { box.querySelectorAll('[data-sh]').forEach(function (e) { e.onclick = function () { close(+e.dataset.sh); }; }); } })
      .then(function (id) { if (id !== null && id !== undefined) shopInfo(g.s.tiles[id]); });
  }
  function sellShopsPanel(p) {
    var g = U.g;
    var list = g.shopsOf(p); if (!list.length) { toast('คุณยังไม่มีร้าน'); return Promise.resolve(); }
    return modal({ title: '🏚️ ขายร้านให้ธนาคาร (75% − ค่าธรรมเนียม 5%)', width: 760, body: '<div class="col">' + list.map(function (t) { var v = Math.floor(g.shopValue(t) * CONFIG.shopSellRate * (1 - CONFIG.shopSellFee)); return '<div class="opt" data-sh="' + t.id + '"><span class="sw" style="background:' + g.s.districts[t.district].color + '"></span>' + spr(['lvl', t.level - 1], 50, 44) + '<span class="grow">' + t.name + ' Lv' + t.level + '</span><span>มูลค่า ' + fmt(g.shopValue(t)) + ' → ได้รับ <b>' + fmt(v) + ' G</b></span></div>'; }).join('') + '</div>', buttons: [{ t: 'ปิด', v: null }], mount: function (box, close) { box.querySelectorAll('[data-sh]').forEach(function (e) { e.onclick = function () { close(+e.dataset.sh); }; }); } })
      .then(function (id) { if (id === null || id === undefined) return; var t = g.s.tiles[id]; return modal({ title: 'ยืนยันขาย ' + t.name + '?', body: '<div style="text-align:center;font-weight:800">ร้านจะกลับเป็นของว่าง และมูลค่าเขตจะลดลง</div>', buttons: [{ t: 'ขาย', v: 1, cls: 'pink' }, { t: 'ยกเลิก', v: 0 }] }).then(function (ok) { if (ok) { g.sellShopToBank(p, t); sfx('coin'); refresh(); } }); });
  }
  function upgradeUI(p, t, o) {
    var g = U.g, d = g.s.districts[t.district], c = g.ownedIn(p.id, t.district), n = d.tiles.length;
    var opts = o.list.map(function (x) { var nr = Math.min(CONFIG.rentCap, Math.round(CONFIG.levelRent[x.level] * t.f * g.distMult(t) * g.eventMod(t))); return '<div class="opt" data-lv="' + x.level + '" style="flex-direction:column;width:132px;text-align:center;gap:2px">' + spr(['lvl', x.level - 1], 96, 80) + '<div>Lv' + x.level + '</div><div style="font-size:12px">' + CONFIG.levelName[x.level] + '</div><div class="coin" style="font-size:14px">' + fmt(x.cost) + '</div><div style="font-size:12px">ค่าเช่า ' + fmt(nr) + '</div></div>'; }).join('');
    var locked = []; for (var L = o.cap + 1; L <= 8; L++) locked.push(L);
    return modal({ title: '🏗️ อัปเกรด ' + t.name + ' (Lv' + t.level + ')', width: 980, body: '<div style="text-align:center;font-weight:800;margin-bottom:8px">ถือ ' + c + '/' + n + ' ร้านใน <span style="color:' + d.color + '">' + d.th + '</span> → ลงทุนได้สูงสุด <b>Lv' + o.cap + '</b>' + (locked.length ? ' • ซื้อร้านในเขตนี้เพิ่มเพื่อปลดล็อก Lv' + locked.join(', ') : ' 👑') + ' • เงินสด ' + fmt(p.cash) + ' G</div><div class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">' + opts + '</div>', buttons: [{ t: 'ไม่อัปเกรด', v: 0, cls: 'gray' }], mount: function (box, close) { box.querySelectorAll('[data-lv]').forEach(function (e) { e.onclick = function () { close(+e.dataset.lv); }; }); } });
  }

  // ---------- IO adapter: human = UI, AI = ai.js + short visual delays ----------
  function makeIO(g, tok) {
    var A = window.AI;
    function aiWait(ms) { return wait(ms); }
    var io = {
      log: function (m, k) { addLog(m, k); },
      toast: toast,
      money: function (p, amt) { floatText(p, amt); renderPlayers(); if (amt > 0) sfx('coin'); },
      autosave: function (s) { consumeUsed(g); try { localStorage.setItem('rfs_save_auto', JSON.stringify(s)); localStorage.setItem('rfs_save_auto_meta', JSON.stringify({ map: MAPS[s.mapIdx].th, round: s.round, date: new Date().toLocaleString('th-TH') })); } catch (e) { } },
      turnStart: async function (p) {
        if (!p.isAI) U.view = p.id;
        setTurn(p, !p.isAI);
        refresh(); if (CAM.follow && CAM.z > 1.05) centerOnTile(p.pos, true);
        if (!p.isAI && g.s.players.filter(function (q) { return !q.isAI; }).length > 1) await modal({ title: 'ตาของ ' + esc(p.name), body: '<div style="text-align:center">' + spr(charSpec(p), 140, 140) + '<div style="font-weight:800">ส่ง iPad ให้ ' + esc(p.name) + '</div></div>', buttons: [{ t: 'พร้อมแล้ว!', v: 1, cls: 'pink' }], close: false });
      },
      preRoll: function (p) {
        if (p.isAI) { setAct('<div style="font-size:20px">💭 กำลังคิด...</div><div>' + esc(p.name) + '</div>'); return aiWait(500).then(function () { return A.preRoll(g, p); }).then(function () { refresh(); }); }
        return new Promise(function (resolve) {
          U.preRollActive = true;
          var done = function () { U.preRollActive = false; U.preRollResolve = null; U.preRollRender = null; renderItems(); resolve(); };
          U.preRollResolve = done;
          var render = function () {
            setAct('<div class="bigdice" id="rollBtn">' + (U.lastRoll ? '<div class="bub">' + U.lastRoll + '</div>' : '') + spr(['dice', 0], 92, 88) + '<div class="t">ทอยลูกเต๋า</div></div>');
            $('#actBtns').innerHTML = '<div class="abtn c1" id="aShops">' + spr(['ui', 39], 40, 34) + 'ร้านของฉัน</div><div class="abtn c2" id="aMine">' + spr(['items', 39], 40, 34) + 'ทรัพย์สิน</div><div class="abtn c3" id="aSellSh">' + spr(['spc', 17], 40, 34) + 'ขาย/แลก</div><div class="abtn c4" id="aSellSt">' + spr(['ui', 38], 40, 34) + 'หุ้น</div>';
            $('#rollBtn').onclick = function () { if (modalOpen) return; $('#actBtns').innerHTML = ''; done(); };
            $('#aSellSt').onclick = function () { stockPanel(p, 'sell', '📈 หุ้นของคุณ — ขายได้ต้นเทิร์น (ซื้อที่ธนาคาร/Broker)').then(function () { refresh(); render(); }); };
            $('#aSellSh').onclick = function () { sellShopsPanel(p).then(function () { refresh(); render(); }); };
            $('#aMine').onclick = function () { playerInfo(p); };
            $('#aShops').onclick = function () { myShopsModal(p); };
            renderItems();
          };
          U.preRollRender = render; render();
        });
      },
      showDice: async function (p, roll) {
        setAct('<div class="msg">' + esc(p.name) + ' ทอยลูกเต๋า...</div>');
        var L = $('#diceLayer'), skin = (!p.isAI && g.s.dice) ? +g.s.dice.split('_')[1] : 0;
        L.classList.add('on');
        for (var i = 0; i < 9; i++) { L.innerHTML = spr(['dice', i % 2 ? 13 + (i % 6) : skin], 200, 200, 'transform:rotate(' + (i * 40) + 'deg)'); sfx('dice'); await wait(70); }
        L.innerHTML = spr(['dice', 6 + roll], 220, 220) + '<div class="num">' + roll + '</div>'; sfx('card'); U.lastRoll = roll;
        await wait(750); L.classList.remove('on'); L.innerHTML = '';
        setAct(spr(['dice', 6 + roll], 64, 64) + '<div>' + esc(p.name) + ' ได้ ' + roll + ' แต้ม!</div>');
      },
      step: async function (p, id, rem) {
        var el = document.getElementById('pc' + p.id); placePieces(); if (CAM.follow && CAM.z > 1.05) centerOnTile(id, true); el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); sfx('step');
        setAct('<div style="font-size:20px">👣 กำลังเดิน...</div><div>เหลืออีก ' + rem + ' ช่อง</div>');
        await wait(200);
      },
      teleport: async function (p, from, to) { var el = document.getElementById('pc' + p.id); el.style.opacity = 0; await wait(250); placePieces(); el.style.opacity = 1; await wait(250); },
      chooseDir: function (p, opts, rem) {
        if (p.isAI) return aiWait(250).then(function () { return A.chooseDir(g, p, opts, rem); });
        return new Promise(function (resolve) {
          U.choosingDir = true;
          var cur = g.tile(p.pos);
          setAct('<div class="msg">เลือกทิศทาง ➜<br><span style="font-size:14px">เหลืออีก ' + rem + ' ช่อง • แตะลูกศรสีชมพู</span></div>');
          var arrows = opts.map(function (id) { var t = g.tile(id), dx = t.x - cur.x, dy = t.y - cur.y, ch = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? '➜' : '⬅') : (dy > 0 ? '⬇' : '⬆'); var a = document.createElement('div'); a.className = 'dirArrow'; a.textContent = ch; var az = Math.max(46, BT * 1.15) / CAM.z * (CAM.z > 1 ? 1.15 : 1); a.style.width = a.style.height = az + 'px'; a.style.fontSize = az * 0.55 + 'px'; a.style.left = (t.x * SC - az / 2) + 'px'; a.style.top = (t.y * SC - az / 2) + 'px'; a.onclick = function (e) { e.stopPropagation(); arrows.forEach(function (x) { x.remove(); }); U.choosingDir = false; resolve(id); }; $('#board').appendChild(a); return a; });
        });
      },
      landed: async function (p, t) { var el = document.getElementById('t' + t.id); if (el) { el.classList.add('hl'); setTimeout(function () { el.classList.remove('hl'); }, 900); } await wait(250); },
      confirmBuy: function (p, t, price, disc) {
        if (p.isAI) { var r = A.confirmBuy(g, p, t, price); return aiWait(350).then(function () { if (r) toast('🏠 ' + esc(p.name) + ' ซื้อ ' + t.name); return r; }); }
        var d = g.s.districts[t.district], biz = BUSINESS.find(function (b) { return b.id === t.biz; }), c = g.ownedIn(p.id, t.district) + 1, n = d.tiles.length;
        var bonus = (CONFIG.districtBonus[c] || 1.1) * (c >= n ? CONFIG.monopolyBonus : 1);
        return modal({ title: '🏪 ' + t.name + ' ว่างอยู่!', width: 620, body: '<div class="row" style="gap:16px;align-items:flex-start"><div style="border:5px solid ' + d.color + ';border-radius:18px;padding:8px;background:#fff">' + spr(['lvl', biz.spr], 150, 130) + '</div><div class="kv"><span>เขต</span><b style="color:' + d.color + '">' + d.th + '</b><span>ธุรกิจ</span><b>' + biz.name + '</b><span>ราคา</span><b>' + fmt(price) + ' G</b>' + (disc.length ? '<span>ส่วนลด</span><b>' + disc.join(', ') + '</b>' : '') + '<span>ค่าเช่าเริ่มต้น (Lv1)</span><b>' + fmt(Math.round(CONFIG.levelRent[1] * t.f * bonus)) + ' G</b><span>ถ้าซื้อ: ถือในเขต</span><b>' + c + '/' + n + (c >= n ? ' 👑 Monopoly!' : '') + '</b><span>โบนัสเขต</span><b>×' + bonus.toFixed(2) + '</b><span>ลงทุนได้ถึง</span><b>Lv' + (c >= n ? 8 : CONFIG.levelCapByCount[c]) + '</b><span>เงินสดหลังซื้อ</span><b>' + fmt(p.cash - price) + ' G</b></div></div>', buttons: [{ t: spr(['ui', 3], 120, 56), v: true, cls: 'gray', }, { t: 'ไม่ซื้อ', v: false }] });
      },
      chooseUpgrade: function (p, t, o) {
        if (p.isAI) { var r = A.chooseUpgrade(g, p, t, o); return aiWait(300).then(function () { return r; }); }
        return upgradeUI(p, t, o);
      },
      confirmBuyout: function (p, t, cost) {
        if (p.isAI) { var r = A.confirmBuyout(g, p, t, cost); return aiWait(300).then(function () { return r; }); }
        var o = g.s.players[t.owner];
        return modal({ title: '🤝 ซื้อกิจการ ' + t.name + '?', body: '<div style="text-align:center;font-weight:800;font-size:17px">' + spr(['lvl', t.level - 1], 140, 120) + '<br>เจ้าของ: ' + esc(o.name) + '<br>ราคาซื้อกิจการ (5× มูลค่า) = <b>' + fmt(cost) + ' G</b><br>เงินสดของคุณ ' + fmt(p.cash) + ' G</div>', buttons: [{ t: 'ซื้อกิจการ', v: true, cls: 'pink' }, { t: 'ไม่ซื้อ', v: false }] });
      },
      rent: async function (p, owner, t, rent) {
        sfx('bad');
        if (!p.isAI) await modal({ title: '🏪 จ่ายค่าเช่า ' + t.name, body: '<div class="kv" style="min-width:420px"><span>ค่าเช่าทั้งหมด</span><b>' + fmt(rent) + ' G</b><span>เจ้าของ ' + esc(owner.name) + ' (85%)</span><b>' + fmt(Math.floor(rent * .85)) + ' G</b><span>ภาษีเมือง (5%)</span><b>' + fmt(Math.floor(rent * .05)) + ' G</b><span>กองทุนปันผลเขต (10%)</span><b>' + fmt(rent - Math.floor(rent * .85) - Math.floor(rent * .05)) + ' G</b></div>', buttons: [{ t: 'จ่าย', v: 1, cls: 'pink' }], auto: 4000 });
        else toast('🏪 ' + esc(p.name) + ' จ่ายค่าเช่า ' + fmt(rent) + ' G ให้ ' + esc(owner.name));
        floatText(p, -rent); floatText(owner, Math.floor(rent * .85));
      },
      bank: async function (p, stopped) {
        refresh();
        if (p.isAI) { await aiWait(300); await A.bank(g, p, stopped); refresh(); return; }
        var shops = g.shopsOf(p);
        if (stopped && shops.length) {
          while (true) {
            var pick = await modal({ title: '🏦 หยุดที่ธนาคาร — ลงทุนร้านได้ทุกแห่ง', width: 820, body: '<div class="col">' + g.shopsOf(p).map(function (t) { var o = g.upgradeOptions(p, t); return '<div class="opt" data-sh="' + t.id + '" style="' + (o.list.length ? '' : 'opacity:.5') + '"><span class="sw" style="background:' + g.s.districts[t.district].color + '"></span>' + spr(['lvl', t.level - 1], 50, 44) + '<span class="grow">' + t.name + ' Lv' + t.level + ' (สูงสุด Lv' + o.cap + ')</span><span>' + (o.list.length ? 'อัปเกรดได้ ' + o.list.length + ' ระดับ' : o.blocked ? 'ถูกระงับ' : 'อัปเกรดไม่ได้') + '</span></div>'; }).join('') + '</div>', buttons: [{ t: 'ไปซื้อหุ้น ▶', v: null, cls: 'green' }], mount: function (box, close) { box.querySelectorAll('[data-sh]').forEach(function (e) { e.onclick = function () { close(+e.dataset.sh); }; }); } });
            if (pick === null || pick === undefined) break;
            var t = g.tile(pick), o = g.upgradeOptions(p, t); if (!o.list.length) { toast('ร้านนี้อัปเกรดไม่ได้ตอนนี้'); continue; }
            var to = await upgradeUI(p, t, o); if (to) { await g.doUpgrade(p, t, to); refresh(); }
          }
        }
        await stockPanel(p, 'buy', '🏦 ธนาคาร — ซื้อหุ้น' + (Game.suitsDone(p) ? '' : ' • สัญลักษณ์ ' + SUITS.map(function (k) { return p.suits[k] ? SUIT_GLYPH[k] : '·'; }).join(' ')));
        refresh();
      },
      broker: async function (p) { if (p.isAI) { await aiWait(300); await A.broker(g, p); refresh(); return; } await stockPanel(p, 'both', '📊 Stock Broker — ซื้อ/ขายหุ้น'); refresh(); },
      promotion: async function (p, sal) {
        sfx('win');
        if (p.isAI) { toast('🎉 ' + esc(p.name) + ' เลื่อนเป็น Lv' + p.level + ' รับเงินเดือน ' + fmt(sal) + ' G'); floatText(p, sal); await aiWait(500); return; }
        var pv = g.propertyValue(p);
        await modal({ title: '🎉 เลื่อนระดับเป็น Lv' + p.level + '!', body: '<div class="kv" style="min-width:420px"><span>เงินเดือนพื้นฐาน</span><b>' + CONFIG.baseSalary + '</b><span>ระดับ × 100</span><b>' + fmt((p.level - 1) * CONFIG.salaryPerLevel) + '</b><span>2% ของทรัพย์สิน (' + fmt(pv) + ')</span><b>' + fmt(Math.round(pv * CONFIG.salaryPropPct)) + '</b><span>รวมเงินเดือน (รวมโบนัส)</span><b style="color:#2c8a2c">+' + fmt(sal) + ' G</b></div><div style="text-align:center;margin-top:6px;font-weight:800">สัญลักษณ์ถูกล้าง เริ่มเก็บรอบใหม่!</div>', buttons: [{ t: 'เยี่ยม!', v: 1, cls: 'green' }] });
        floatText(p, sal);
      },
      suit: async function (p, suit) { sfx('card'); renderPlayers(); toast('<span style="color:' + SUIT_COLOR[suit] + ';font-size:22px">' + SUIT_GLYPH[suit] + '</span> ' + esc(p.name) + ' เก็บสัญลักษณ์!', 1200); },
      built: async function (p, t) { sfx('build'); refresh(); var el = document.getElementById('t' + t.id); if (el) { el.classList.add('hl'); setTimeout(function () { el.classList.remove('hl'); }, 900); } await wait(300); },
      pickCard: async function (p, grid) {
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
        var html = '<div class="cardFace" style="border-color:' + catColor + '"><div class="cat" style="background:' + catColor + '">หมวด ' + c.cat + ' • ' + CARD_CATS[c.cat] + '</div><div class="art">' + spr(art, 210, 200) + '</div><div class="nm">' + c.name + '</div><div class="ds">' + c.desc + '</div><div class="id">Card ID: C' + String(c.id).padStart(3, '0') + (cell !== undefined ? ' • ช่อง ' + (Math.floor(cell / 10) + 1) + '-' + (cell % 10 + 1) : '') + (c.neg ? ' • ผลเสีย' : '') + '</div></div>';
        sfx(c.neg ? 'bad' : 'card');
        await modal({ title: esc(p.name) + ' ได้การ์ด', body: html, buttons: [{ t: 'ตกลง', v: 1, cls: 'green' }], auto: p.isAI ? 2200 : 0, close: false });
      },
      choose: function (p, req) {
        if (p.isAI) return aiWait(300).then(function () { return A.choose(g, p, req); });
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
      casinoBet: function (p, bets) {
        if (p.isAI) return Promise.resolve(A.casinoBet(g, p, bets));
        return modal({ title: '🎰 คาสิโน', width: 940, body: '<div style="width:900px;height:506px;background:url(assets/bg_casino.webp) center/100% 100%;border-radius:16px;border:4px solid #6b4226"></div><div style="text-align:center;font-weight:800;margin-top:6px">3 ตัวเหมือน = x3 (🐻 x4, 7 x5) • 2 ตัวเหมือน = x1.5 • รางวัลสูงสุด ' + fmt(CONFIG.casino.maxWin) + ' G</div>', buttons: bets.map(function (b) { return { t: 'เดิมพัน ' + b, v: b, cls: 'pink' }; }).concat([{ t: 'ไม่เล่น', v: 0 }]), close: false });
      },
      casinoShow: function (p, reels, bet, win) {
        var syms = ['🍒', '🔔', '⭐', '🐻', '7'];
        return modal({ title: '🎰 ' + esc(p.name) + ' เดิมพัน ' + bet + ' G', width: 940, close: false, body: '<div style="position:relative;width:900px;height:506px;background:url(assets/bg_casino.webp) center/100% 100%;border-radius:16px;border:4px solid #6b4226"><div class="reel" id="r0" style="position:absolute;left:371px;top:191px;width:108px;height:124px"></div><div class="reel" id="r1" style="position:absolute;left:492px;top:191px;width:105px;height:124px"></div><div class="reel" id="r2" style="position:absolute;left:611px;top:191px;width:110px;height:124px"></div></div><div id="cres" style="text-align:center;font-weight:900;font-size:24px;margin-top:6px">หมุน...</div>', buttons: [{ t: 'ตกลง', v: 1, cls: 'green' }], auto: p.isAI ? 2600 : 0,
          mount: function (box) {
            var k = 0, iv = setInterval(function () { for (var i = 0; i < 3; i++) { var e = box.querySelector('#r' + i); if (e && k < 10 + i * 5) e.textContent = syms[(k + i * 2) % 5]; else if (e) e.textContent = reels[i]; } k++; sfx('dice'); if (k > 22) { clearInterval(iv); var r = box.querySelector('#cres'); if (r) r.innerHTML = win ? '🎉 ชนะ +' + fmt(win) + ' G!' : 'เสียใจด้วย ลองใหม่ครั้งหน้า'; sfx(win ? 'win' : 'bad'); } }, 80);
          } });
      },
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

  // ---------- game menu / save / load ----------
  $('#btnGameMenu').onclick = function () {
    if (modalOpen) return;
    modal({ title: 'เมนูเกม', body: '<div class="col" style="min-width:380px"><button class="green" data-m="save">💾 บันทึกเกม</button><button class="blue" data-m="guide">📖 คู่มือ</button><button data-m="settings">⚙️ ตั้งค่า (ความเร็ว/เสียง)</button><button class="pink" data-m="quit">🏠 ออกไปหน้าหลัก (บันทึกอัตโนมัติ)</button></div>', mount: function (box, close) { box.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { close(b.dataset.m); }; }); } })
      .then(function (v) {
        if (v === 'save') saveModal(); else if (v === 'guide') guideModal(); else if (v === 'settings') settingsModal().then(refresh);
        else if (v === 'quit') { U.token++; U.g = null; $('#diceLayer').classList.remove('on'); show('menu'); }
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
  function showResult(g) {
    var s = g.s, owner = s.players[s.ownerIdx || 0];
    var rk = s.ranking || s.players.map(function (p) { return { id: p.id, nw: g.netWorth(p) }; }).sort(function (a, b) { return b.nw - a.nw; });
    var myRank = rk.findIndex(function (r) { return r.id === owner.id; });
    var reward = !owner.isAI ? Meta.matchReward(myRank, s.winner === owner.id, g.netWorth(owner)) : null;
    try { var L = JSON.parse(localStorage.getItem('rfs_results') || '[]'); L.unshift({ map: MAPS[s.mapIdx].th, rank: myRank + 1, nw: g.netWorth(owner), date: new Date().toLocaleDateString('th-TH') }); localStorage.setItem('rfs_results', JSON.stringify(L.slice(0, 20))); } catch (e) { }
    var W = 560, H = 220, mx = Math.max.apply(null, s.players.map(function (p) { return Math.max.apply(null, p.hist.concat([g.netWorth(p), 1])); }));
    var lines = s.players.map(function (p) { var h = p.hist.concat([g.netWorth(p)]); if (h.length < 2) h = [h[0], h[0]]; return '<polyline fill="none" stroke="' + p.color + '" stroke-width="4" points="' + h.map(function (v, i) { return (i / (h.length - 1) * W).toFixed(1) + ',' + (H - v / mx * (H - 10)).toFixed(1); }).join(' ') + '"/>'; }).join('');
    var ranks = rk.map(function (r, i) { var p = s.players[r.id]; return '<div class="row panel" style="padding:8px 14px;gap:14px;' + (i === 0 ? 'background:#fff3a8' : '') + '">' + spr(['ui', [55, 57, 59, 61][i]], 140, 40) + spr(charSpec(p), 70, 74) + '<div class="grow"><div style="font-weight:900;font-size:20px;color:' + p.color + '">' + esc(p.name) + (p.bankrupt ? ' 💥' : '') + '</div><div style="font-weight:800">ทรัพย์สิน ' + fmt(r.nw) + ' G • ร้าน ' + g.shopsOf(p).length + ' • Lv' + p.level + '</div></div></div>'; }).join('');
    $('#result').innerHTML = '<div class="scrhead"><div class="title">🏆 ผลการแข่งขัน — ' + MAPS[s.mapIdx].th + '</div><button class="green" id="resMenu">กลับหน้าหลัก</button></div><div class="scrbody"><div class="row" style="align-items:flex-start;gap:20px"><div class="col" style="width:600px">' + ranks + '<div class="panel" style="padding:10px;font-weight:800">' + esc(s.endReason || '') + '</div></div><div class="col" style="width:610px"><div class="panel" style="padding:12px"><b>กราฟทรัพย์สินรายรอบ</b><svg width="' + W + '" height="' + H + '" style="margin-top:6px;background:#fffdf5;border-radius:12px">' + lines + '</svg></div>' + (reward ? '<div class="panel" style="padding:12px;text-align:center;font-weight:900;font-size:20px">🎁 รางวัล: +' + fmt(reward.gold) + ' Gold Coin' + (reward.diamond ? ' • +' + reward.diamond + ' 💎' : '') + '<div style="font-size:14px">ใช้ซื้อไอเทมในร้านค้าได้เลย!</div></div>' : '') + '<div class="panel" style="padding:12px;text-align:center">' + (s.winner !== null && s.winner !== undefined ? spr(charSpec(s.players[s.winner]), 200, 200) + '<div style="font-size:26px;font-weight:900">' + esc(s.players[s.winner].name) + ' ชนะ!</div>' : '') + '</div></div></div></div>';
    $('#resMenu').onclick = function () { show('menu'); };
    show('result'); sfx('win');
  }

  // =====================================================================
  // SHOP (7 categories) — real purchases into Inventory, atomic, with history
  // =====================================================================
  var SH = { cat: 'rec', sort: 'popular' };
  var SHOP_CATS = [['rec', '⭐ ไอเทมแนะนำ'], ['deco', '🏠 อาคาร/ของตกแต่ง'], ['chars', '🐻 ตัวละคร/ชุด'], ['equip', '🎲 อุปกรณ์เกม'], ['cards', '🃏 การ์ดพิเศษ'], ['packs', '🎁 แพ็กเกจพิเศษ'], ['exch', '💱 แลกเปลี่ยน'], ['hist', '🧾 ประวัติ']];
  function openShop(cat) { SH.cat = cat || 'rec'; renderShop(); show('shop'); }
  function renderShop() {
    var P = Meta.p;
    var head = '<div class="scrhead"><button class="small" id="shBack">◀ กลับ</button>' + spr(['ui', 2, 3, 0], 60, 56) + '<div class="title">ร้านค้า SHOP</div><span class="chip coin" style="font-size:18px">' + fmt(P.gold) + '</span><span class="chip" style="font-size:18px">💎 ' + fmt(P.diamond) + '</span><button class="small" id="shInv">🎒 Inventory</button></div>';
    var tabs = '<div class="tabs" style="margin-bottom:12px">' + SHOP_CATS.map(function (c) { return '<div class="tab ' + (SH.cat === c[0] ? 'on' : '') + '" data-cat="' + c[0] + '">' + c[1] + '</div>'; }).join('') + '</div>';
    var body = '';
    if (SH.cat === 'exch') {
      body = '<div class="row" style="gap:14px;justify-content:center">' + EXCHANGE.map(function (x) { return '<div class="sitem" style="width:260px">' + spr(x.spr, 140, 110) + '<div class="nm">' + x.th + '</div><button class="green" data-ex="' + x.id + '">แลก</button></div>'; }).join('') + '</div><div class="panel" style="margin-top:14px;padding:12px;font-weight:800">Gold Coin: ได้จากการเล่นเกม ภารกิจ และรางวัลประจำวัน • Diamond: ได้จากรางวัลพิเศษ Achievement และกิจกรรม (ใช้ซื้อสินค้าพรีเมียม)</div>';
    } else if (SH.cat === 'hist') {
      body = '<div class="panel" style="padding:10px"><table style="width:100%;font-weight:700;border-collapse:collapse"><tr style="background:#ffe2a8"><th>เวลา</th><th>ประเภท</th><th>รายการ</th><th>จำนวน</th><th>Transaction</th></tr>' + (P.hist.map(function (h) { return '<tr><td>' + new Date(h.t).toLocaleString('th-TH') + '</td><td>' + h.kind + '</td><td>' + esc(h.name || h.id || '') + '</td><td>' + (h.amt ? (h.amt > 0 ? '+' : '') + fmt(h.amt) + (h.cur === 'gold' ? ' G' : h.cur === 'diamond' ? ' 💎' : '') : '-') + '</td><td style="font-size:11px">' + h.tx + '</td></tr>'; }).join('') || '<tr><td colspan=5 style="text-align:center">ยังไม่มีประวัติ</td></tr>') + '</table></div>';
    } else {
      var list;
      if (SH.cat === 'rec') {
        var ids = ['pk_begin', 'eq_golden', 'SC_upg', 'pk_lucky', 'x3', 'eq_rent', 'cz0', 'deco_40', 'SC_cash', 'eq_travel', 'dice_2', 'pk_deco', 'b4', 'eq_lucky', 'SC_stock'];
        list = ids.map(Meta.item).filter(Boolean);
        var srt = SH.sort;
        if (srt === 'new') list = list.filter(function (i) { return Meta.tags(i.id).indexOf('new') >= 0; });
        if (srt === 'sale') list = list.filter(function (i) { return Meta.tags(i.id).indexOf('sale') >= 0; });
        if (srt === 'limited') list = list.filter(function (i) { return Meta.tags(i.id).indexOf('limited') >= 0; });
        if (srt === 'notown') list = list.filter(function (i) { return !Meta.owned(i.id); });
        if (srt === 'popular') list.sort(function (a, b) { return (Meta.tags(b.id).indexOf('hot') >= 0) - (Meta.tags(a.id).indexOf('hot') >= 0); });
        body += '<div class="tabs" style="margin-bottom:10px">' + [['popular', '🔥 ยอดนิยม'], ['new', '🆕 ใหม่'], ['sale', '💸 ลดราคา'], ['limited', '⏰ จำกัดเวลา'], ['notown', '🎒 ที่ยังไม่มี']].map(function (x) { return '<div class="tab ' + (SH.sort === x[0] ? 'on' : '') + '" data-srt="' + x[0] + '" style="font-size:13px;padding:5px 10px">' + x[1] + '</div>'; }).join('') + '</div>';
      } else list = Meta.all().filter(function (i) { return i.cat === SH.cat; });
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
        modal({ title: 'ยืนยันการซื้อ', body: '<div class="col" style="align-items:center;min-width:420px">' + spr(it.spr, 150, 120) + '<div style="font-weight:900;font-size:20px">' + it.name + '</div><div style="font-weight:700">' + it.desc + '</div><div class="chip">ราคา ' + fmt(price) + (it.cur === 'gold' ? ' Gold Coin' : ' Diamond') + '</div></div>', buttons: [{ t: 'ซื้อ', v: 1, cls: 'green' }, { t: 'ยกเลิก', v: 0 }] })
          .then(function (ok) { if (!ok) return; var r = Meta.buy(it.id); toast((r.ok ? '✅ ' : '⚠️ ') + r.msg); if (r.ok) sfx('coin'); renderShop(); });
      };
    });
    document.querySelectorAll('#shop [data-ex]').forEach(function (e) { e.onclick = function () { var x = EXCHANGE.find(function (y) { return y.id === e.dataset.ex; }); var r = Meta.exchange(x); toast((r.ok ? '✅ ' : '⚠️ ') + r.msg); renderShop(); }; });
  }

  // =====================================================================
  // INVENTORY
  // =====================================================================
  var INV_TABS = ['Characters', 'Costumes', 'Buildings', 'Decorations', 'Game Equipment', 'Special Cards', 'Packages', 'Dice Skins', 'Other Items'];
  var IV = { tab: 'Game Equipment' };
  function openInventory(tab) { if (tab) IV.tab = tab; renderInventory(); show('inventory'); }
  function renderInventory() {
    var P = Meta.p, items = [];
    if (IV.tab === 'Characters') { ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'x0', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'].forEach(function (k) { if (P.chars[k]) items.push({ id: k, name: Meta.charName(k), spr: Meta.charSprite(k, 'chars'), q: 1, eq: P.equip.char === k }); }); }
    else if (IV.tab === 'Costumes') { CHARACTERS.forEach(function (c, i) { items.push({ id: 'chars' + i, name: 'ชุดเริ่มต้น ' + c.name, spr: ['chars', i], q: 1 }); if (P.costumes['cz' + i]) items.push({ id: 'cz' + i, name: 'ชุดพิเศษ ' + c.name, spr: ['cozy', i], q: 1 }); }); }
    else if (IV.tab === 'Dice Skins') { DICE_SKINS.forEach(function (d) { if (P.dice[d.id]) items.push({ id: d.id, name: d.name, spr: d.spr, q: 1, eq: P.equip.dice === d.id }); }); }
    else if (IV.tab === 'Packages') { items = []; }
    else if (IV.tab === 'Other Items') { items = []; }
    else {
      Meta.all().forEach(function (it) { if (it.type === IV.tab && Meta.owned(it.id)) items.push({ id: it.id, name: it.name, spr: it.spr, q: Meta.owned(it.id), desc: it.desc, eq: P.equip.eq.indexOf(it.id) >= 0 || P.equip.sc === it.id }); });
    }
    var grid = items.length ? '<div class="invgrid">' + items.map(function (i) { return '<div class="invitem ' + (i.eq ? 'eqd' : '') + '" data-iv="' + i.id + '"><span class="q">x' + i.q + '</span>' + spr(i.spr, 90, 84) + '<div>' + i.name + '</div>' + (i.eq ? '<div style="font-size:11px;color:#2c8a2c">ติดตั้ง/ใช้งานอยู่</div>' : '') + '</div>'; }).join('') + '</div>' : '<div class="panel" style="padding:20px;text-align:center;font-weight:800">' + (IV.tab === 'Packages' ? 'แพ็กเกจจะถูกแยกสินค้าเข้า Inventory ตามประเภทอัตโนมัติเมื่อซื้อ' : 'ยังไม่มีไอเทมในหมวดนี้') + '</div>';
    $('#inventory').innerHTML = '<div class="scrhead"><button class="small" id="ivBack">◀ กลับ</button><div class="title">🎒 Inventory</div><span class="chip coin">' + fmt(P.gold) + '</span><span class="chip">💎 ' + P.diamond + '</span><button class="small pink" id="ivShop">ไปร้านค้า</button></div><div class="scrbody"><div class="tabs" style="margin-bottom:12px">' + INV_TABS.map(function (t) { return '<div class="tab ' + (IV.tab === t ? 'on' : '') + '" data-ivt="' + t + '">' + t + '</div>'; }).join('') + '</div>' + grid + '</div>';
    $('#ivBack').onclick = function () { show('menu'); };
    $('#ivShop').onclick = function () { openShop(); };
    document.querySelectorAll('[data-ivt]').forEach(function (e) { e.onclick = function () { IV.tab = e.dataset.ivt; renderInventory(); }; });
    document.querySelectorAll('[data-iv]').forEach(function (e) {
      e.onclick = function () {
        var id = e.dataset.iv;
        if (IV.tab === 'Characters') { P.equip.char = id; Meta.save(); toast('ตั้ง ' + Meta.charName(id) + ' เป็นตัวละครหลัก'); renderInventory(); }
        else if (IV.tab === 'Dice Skins') { P.equip.dice = id; Meta.save(); toast('เปลี่ยนสกินลูกเต๋าแล้ว'); renderInventory(); }
        else if (IV.tab === 'Costumes') { var i = +id.replace(/\D/g, ''); P.equip.char = 'b' + i; P.equip.costume = /^cz/.test(id) ? 'cozy' : 'chars'; Meta.save(); toast('เปลี่ยนชุดแล้ว'); renderInventory(); }
        else if (IV.tab === 'Buildings' || IV.tab === 'Decorations') openProfile();
        else { var it = Meta.item(id); modal({ title: it.name, body: '<div class="col" style="align-items:center;min-width:380px">' + spr(it.spr, 130, 110) + '<div style="font-weight:800">' + it.desc + '</div><div class="chip">มี ' + Meta.owned(id) + ' ชิ้น</div><div class="muted" style="font-size:13px">ติดตั้งได้ในหน้า Pre-Match Setup ก่อนเริ่มเกม</div></div>', buttons: [{ t: 'ปิด', v: 1 }] }); }
      };
    });
  }

  // =====================================================================
  // PROFILE DECORATION (personal town — cosmetic only)
  // =====================================================================
  var PF = { sel: null, move: null };
  function openProfile() { renderProfile(); show('profile'); }
  function renderProfile() {
    var P = Meta.p, cols = 8, rows = 4;
    var placedCount = {}; P.town.forEach(function (x) { placedCount[x.id] = (placedCount[x.id] || 0) + 1; });
    var cells = '';
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var it = P.town.find(function (x) { return x.c === c && x.r === r; });
      cells += '<div class="tcell ' + (PF.move && PF.move.c === c && PF.move.r === r ? 'sel' : '') + '" data-tc="' + c + ':' + r + '" style="left:' + c * 120 + 'px;top:' + (40 + r * 118) + 'px">' + (it ? spr(Meta.item(it.id).spr, 112, 108, it.flip ? 'transform:scaleX(-1)' : '') : '') + '</div>';
    }
    var owned = Object.keys(P.deco).filter(function (k) { return P.deco[k] > 0; });
    var side = owned.map(function (k) { var it = Meta.item(k), free = P.deco[k] - (placedCount[k] || 0); return '<div class="invitem ' + (PF.sel === k ? 'eqd' : '') + (free <= 0 ? ' dim' : '') + '" data-dk="' + k + '"><span class="q">' + free + '/' + P.deco[k] + '</span>' + spr(it.spr, 70, 64) + '<div style="font-size:11px">' + it.name + '</div></div>'; }).join('') || '<div class="muted">ยังไม่มีของตกแต่ง — ซื้อได้ที่ร้านค้า</div>';
    $('#profile').innerHTML = '<div class="scrhead"><button class="small" id="pfBack">◀ กลับ</button>' + spr(Meta.charSprite(P.equip.char, P.equip.costume), 60, 60) + '<div class="title">เมืองของ ' + esc(P.name) + ' (Profile Decoration)</div><span class="chip">Lv ' + P.level + '</span><span class="chip">ชนะ ' + P.stats.wins + '/' + P.stats.games + '</span><button class="small pink" id="pfShop">ซื้อของตกแต่ง</button></div>' +
      '<div class="scrbody"><div class="row" style="align-items:flex-start;gap:14px"><div><div class="town">' + cells + '</div><div style="font-weight:800;margin-top:6px;font-size:14px">' + (PF.move ? '👉 แตะช่องว่างเพื่อย้าย' : PF.sel ? '👉 แตะช่องในเมืองเพื่อวาง ' + Meta.item(PF.sel).name : 'เลือกของตกแต่งด้านขวา แล้วแตะช่องเพื่อวาง • แตะของที่วางแล้วเพื่อย้าย/หมุน/ถอด') + ' • ของตกแต่งไม่มีผลต่อการแข่งขัน</div></div><div class="panel" style="padding:8px;width:270px;max-height:640px;overflow:auto"><b>ของตกแต่งที่มี</b><div class="invgrid" style="grid-template-columns:1fr 1fr">' + side + '</div></div></div></div>';
    $('#pfBack').onclick = function () { PF.sel = null; PF.move = null; show('menu'); };
    $('#pfShop').onclick = function () { openShop('deco'); };
    document.querySelectorAll('[data-dk]').forEach(function (e) { e.onclick = function () { var k = e.dataset.dk, free = P.deco[k] - (placedCount[k] || 0); if (free <= 0) { toast('วางครบจำนวนที่มีแล้ว'); return; } PF.sel = PF.sel === k ? null : k; PF.move = null; renderProfile(); }; });
    document.querySelectorAll('[data-tc]').forEach(function (e) {
      e.onclick = function () {
        var a = e.dataset.tc.split(':'), c = +a[0], r = +a[1], it = P.town.find(function (x) { return x.c === c && x.r === r; });
        if (PF.move) { if (!it) { PF.move.c = c; PF.move.r = r; } PF.move = null; Meta.save(); renderProfile(); return; }
        if (it) {
          modal({ title: Meta.item(it.id).name, body: '<div style="text-align:center">' + spr(Meta.item(it.id).spr, 150, 130) + '</div>', buttons: [{ t: '↔ ย้าย', v: 'm', cls: 'blue' }, { t: '🔄 หมุน', v: 'f' }, { t: '🗑 ถอดออก', v: 'd', cls: 'pink' }, { t: 'ปิด', v: null }] })
            .then(function (v) { if (v === 'm') PF.move = it; if (v === 'f') it.flip = !it.flip; if (v === 'd') P.town.splice(P.town.indexOf(it), 1); Meta.save(); renderProfile(); });
          return;
        }
        if (PF.sel) { P.town.push({ id: PF.sel, c: c, r: r, flip: false }); var free = P.deco[PF.sel] - P.town.filter(function (x) { return x.id === PF.sel; }).length; if (free <= 0) PF.sel = null; Meta.save(); renderProfile(); }
      };
    });
  }

  // ---------- music ----------
  Music.setVol(U.vol);
  Music.onSong(function (sg) { var n = $('#nowPlay'); if (n) n.textContent = '♪ ' + sg.title; if (U.music && Music.playing) toast('🎵 เพลงใหม่: ' + esc(sg.title), 1800); });
  function firstGesture() { if (U.music && !Music.playing) Music.start(document.getElementById('game').classList.contains('on') ? 'game' : 'menu'); }
  document.addEventListener('pointerdown', firstGesture, true);
  $('#nowPlay').onclick = function (e) { e.stopPropagation(); if (!Music.playing) { U.music = true; saveSettings(); Music.start(); } else Music.next(); };
  // ---------- boot ----------
  renderMenu();
  if (Meta.loginState().canClaim) setTimeout(dailyLogin, 600);
})();
