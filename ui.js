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
    var S = ATLAS[spec[0]]; if (!S) return '';
    var b = typeof spec[1] === 'string' ? S.n[spec[1]] : S.b[spec[1]]; if (!b) return '';
    if (spec[2]) { var n = spec[2], k = spec[3] || 0; b = [b[0] + b[2] / n * k, b[1], b[2] / n, b[3]]; }
    var sc = Math.min(w / b[2], h / b[3]);
    return '<div class="spr" style="width:' + (b[2] * sc).toFixed(1) + 'px;height:' + (b[3] * sc).toFixed(1) + 'px;background-image:url(' + S.url + ');background-size:' + (S.W * sc).toFixed(1) + 'px ' + (S.H * sc).toFixed(1) + 'px;background-position:-' + (b[0] * sc).toFixed(1) + 'px -' + (b[1] * sc).toFixed(1) + 'px;' + (extraStyle || '') + '"></div>';
  }
  U.spr = spr;
  function setHTML(el, html) { if (el && el._h !== html) { el._h = html; el.innerHTML = html; } }
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
    if (ls.canClaim) h += '<div class="badge" style="left:70px;top:140px">!</div><div class="badge" style="left:1176px;top:8px">!</div>';
    $('#menuHot').innerHTML = h; $('#menuHot').style.cssText = 'position:absolute;left:0;top:69px;width:1280px;height:721px';
  }
  $('#menuHot').addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act;
    if (act === 'play') playMenu(false);
    else if (act === 'ai') playMenu(true);
    else if (act === 'online') onlineMenu();
    else if (act === 'tour') alertBox('🏆 ทัวร์นาเมนต์', 'จะเปิดหลังระบบออนไลน์พร้อม — ระหว่างนี้ลองเล่น “Long Match” กับ AI ระดับ Advanced ได้เลย!');
    else if (act === 'shop') openShop('rec');
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
  function hubModal() {
    var it = function (k, n, t) { return '<div class="hubit" data-hb="' + k + '">' + spr(['ui', n], 150, 120) + '</div>'; };
    modal({ title: 'เมนู', width: 720, body: '<div class="hub">' + it('settings', 'settings') + it('lessons', 'guide') + it('music', 'music') + it('load', 'load') + it('inv', 'assets') + it('prof', 'chars') + it('achv', 'achv') + it('rank', 'rank') + '</div>',
      mount: function (box, close) { box.querySelectorAll('[data-hb]').forEach(function (e) { e.onclick = function () { close(e.dataset.hb); }; }); } })
      .then(function (v) { ({ settings: settingsModal, lessons: lessonsModal, guide: guideModal, music: function () { if (!Music.playing) { U.music = true; saveSettings(); Music.start('menu'); } else Music.next(); toast('🎵 ' + (Music.song ? esc(Music.song.title) : '')); }, load: loadModal, inv: function () { openInventory('Game Equipment'); }, prof: openProfile, achv: achievements, rank: rankingModal }[v] || function () { })(); });
  }
  function backBtns() { document.querySelectorAll('.backbtn').forEach(function (b) { if (!b.innerHTML) b.innerHTML = spr(['ui', 'prev'], 70, 70); }); }
  backBtns();
  document.querySelectorAll('[data-back]').forEach(function (b) { b.onclick = function () { show(b.dataset.back || 'menu'); }; });

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
    var P = Meta.p, A = [['ชนะครั้งแรก', P.stats.wins >= 1], ['เล่นครบ 5 เกม', P.stats.games >= 5], ['เศรษฐีหมื่นห้า (NW 15,000+)', P.stats.best >= 15000], ['เจ้าสัว (NW 30,000+)', P.stats.best >= 30000], ['นักสะสม (ของตกแต่ง 5 ชิ้น)', Object.keys(P.deco).length >= 5], ['เพื่อนครบแก๊ง (ตัวละคร 8 ตัว)', Object.keys(P.chars).length >= 8]];
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
      '<b>🎲 ทอยลูกเต๋า:</b> ลูกเต๋าหมุนอยู่ตลอด แตะเพื่อหยุดเอง • ตอนเดินจะมีตัวเลขก้าวที่เหลือบนหัว มี 📍 บอกจุดที่อาจตก กด <b>↩ ย้อน</b> เพื่อเดินถอยกลับได้ก่อนกด “หยุดตรงนี้”<br>' +
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
      '<b>🏰 บ้านพิเศษ (ช่อง ? สีม่วง):</b> ตกแล้วสร้างได้ 1 ใน 4 — 🌀 ประตูทะลุมิติ (คนตกเลือกวาร์ป จ่าย 10% ทรัพย์สิน / ไม่วาร์ป 5%) • 🎉 บ้านปาร์ตี้ (เรียกทุกคนมารวม จ่ายคนละ 100) • 🚧 ประตูเก็บค่าผ่านทาง (ผ่านต้องจ่าย เพิ่ม +10 G ทุกครั้ง) • 🌬️ บ้านกังหันลม (สกิลการ์ดปลิวหาย 2 ใบ)<br>' +
      '<b>🃏 การ์ด:</b> หยุดตรงช่องสัญลักษณ์พอดีเพื่อเปิดการ์ด<br>' +
      '<b>🌈 พิเศษ:</b> เปิดการ์ดให้สีตัวเองเรียงแถว 3+ ช่องรับโบนัส • ไอเทม/การ์ดพิเศษติดตัวใช้ได้อย่างละครั้ง</div>';
    return modal({ title: '📖 คู่มือการเล่น', width: 980, body: html, buttons: [{ t: 'เข้าใจแล้ว!', v: 1, cls: 'green' }] });
  }

  // =====================================================================
  // SETUP
  // =====================================================================
  var LENGTHS = [{ n: 'Quick', t: 25000, d: '~25 รอบ' }, { n: 'Standard', t: 40000, d: '~40 รอบ' }, { n: 'Long', t: 60000, d: '~50 รอบ' }, { n: 'Marathon', t: 100000, d: '~70 รอบ' }];
  U.rules = { target: 40000, rounds: 100, tax: false, endOnBankrupt: true };
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
    renderRules();
  }
  function renderRules() {
    var R = U.rules, box = $('#rulesBox');
    box.innerHTML = '<div class="row" style="align-items:center;gap:14px"><b style="font-size:18px">🎯 เป้าหมายทรัพย์สิน</b>' +
      '<button class="small rbtn" data-tg="-5000">−5,000</button><button class="small rbtn" data-tg="-1000">−1,000</button>' +
      '<input class="tgt" id="tgtIn" inputmode="numeric" value="' + fmt(R.target) + '">' +
      '<button class="small rbtn" data-tg="1000">+1,000</button><button class="small rbtn" data-tg="5000">+5,000</button>' +
      '<span class="muted" style="font-size:13px;font-weight:700">(เงินเริ่มต้น 10,000 G • ตั้งได้ 15,000–999,000)</span></div>' +
      '<div class="row" style="margin-top:8px;align-items:center"><b>ปุ่มลัด:</b>' + LENGTHS.map(function (l) { return '<button class="small rbtn ' + (R.target === l.t ? 'on' : '') + '" data-tp="' + l.t + '">' + l.n + ' ' + fmt(l.t) + ' <span style="font-size:11px">' + l.d + '</span></button>'; }).join('') + '</div>' +
      '<div class="row" style="margin-top:10px;align-items:center;gap:12px"><b>กติกา:</b>' +
      '<div class="tog ' + (R.tax ? 'on' : '') + '" data-rule="tax"><i></i>มีภาษี (ช่องภาษี/ภาษีทรัพย์สิน/ค่าธรรมเนียมหุ้น)</div>' +
      '<div class="tog ' + (R.endOnBankrupt ? 'on' : '') + '" data-rule="endOnBankrupt"><i></i>มีคนล้มละลาย = จบเกม (แบบเกมจริง)</div>' +
      '<span>รอบสูงสุด</span>' + [50, 100, 200].map(function (n) { return '<button class="small rbtn ' + (R.rounds === n ? 'on' : '') + '" data-rd="' + n + '">' + n + '</button>'; }).join('') + '</div>';
    var clampT = function (v) { return Math.max(15000, Math.min(999000, Math.round(v / 1000) * 1000)); };
    box.querySelectorAll('[data-tg]').forEach(function (b) { b.onclick = function () { R.target = clampT(R.target + +b.dataset.tg); saveRules(); renderRules(); }; });
    box.querySelectorAll('[data-tp]').forEach(function (b) { b.onclick = function () { R.target = +b.dataset.tp; saveRules(); renderRules(); }; });
    box.querySelectorAll('[data-rd]').forEach(function (b) { b.onclick = function () { R.rounds = +b.dataset.rd; saveRules(); renderRules(); }; });
    box.querySelectorAll('[data-rule]').forEach(function (b) { b.onclick = function () { R[b.dataset.rule] = !R[b.dataset.rule]; saveRules(); renderRules(); }; });
    var inp = box.querySelector('#tgtIn');
    inp.onfocus = function () { inp.value = R.target; inp.select(); };
    inp.onchange = inp.onblur = function () { var v = parseInt(String(inp.value).replace(/[^0-9]/g, ''), 10); if (v) { R.target = clampT(v); saveRules(); } renderRules(); };
    inp.onkeydown = function (e) { if (e.key === 'Enter') inp.blur(); };
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
    var R = U.rules, slots = U.sel.slots;
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
    var s = Game.create({ mapIdx: U.sel.map, players: players, target: R.target, maxRounds: R.rounds, rules: { tax: R.tax, endOnBankrupt: R.endOnBankrupt }, seed: Math.floor(Math.random() * 1e9) });
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
    U.token++; var tok = U.token;
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
        while (!g.s.over && tok === U.token) { await g.playTurn(); if (tok !== U.token) return; refresh(); }
        if (tok === U.token) { consumeUsed(g); localStorage.removeItem('rfs_save_auto'); if (U.online) Online.end(g); await wait(600); showResult(g); }
      } catch (err) { if (err !== 'abort') { console.error(err); toast('⚠️ ' + (err && err.message || err)); } }
    })();
  }
  // ---------- 3D dice (faces from the project's dice art) ----------
  var FACE_ROT = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
  var TINT = { dice_1: '#ffe9c7', dice_2: '#ffd34d', dice_3: '#ffb3c6', dice_4: '#a9d8ff', dice_5: '#bfe8a8', dice_6: '#d9a066' };
  function cubeHTML(size, tint) {
    var h = size / 2, f = function (n, tr) { return '<div class="fc" style="background-position:' + (n - 1) * 20 + '% 0;transform:' + tr + ' translateZ(' + h + 'px)' + (tint ? ';--tint:' + tint : '') + '"></div>'; };
    var inner = ['rotateY(0)', 'rotateY(180deg)', 'rotateY(90deg)', 'rotateY(-90deg)', 'rotateX(90deg)', 'rotateX(-90deg)'].map(function (tr) { return '<div class="in" style="transform:' + tr + ' translateZ(' + (h - 3) + 'px)"></div>'; }).join('');
    return '<div class="dicewrap"><div class="cube spin" style="width:' + size + 'px;height:' + size + 'px">' + inner + f(1, 'rotateY(0)') + f(6, 'rotateY(180deg)') + f(2, 'rotateY(90deg)') + f(5, 'rotateY(-90deg)') + f(3, 'rotateX(90deg)') + f(4, 'rotateX(-90deg)') + '</div><div class="diceshadow"></div></div>';
  }
  function spinner(el, size, tint) {
    el.innerHTML = cubeHTML(size, tint); var cube = el.querySelector('.cube'), stopped = false, snd = setInterval(function () { sfx('dice'); }, 140);
    return { stop: function (forced) {
      if (stopped) return null; stopped = true; clearInterval(snd);
      var v = forced || (1 + Math.floor(Math.random() * 6)), r = FACE_ROT[v];
      var cs = getComputedStyle(cube).transform; cube.classList.remove('spin'); cube.style.transform = cs === 'none' ? '' : cs; void cube.offsetWidth;
      cube.style.transition = 'transform .75s cubic-bezier(.15,1.35,.4,1)';
      cube.style.transform = 'rotateX(' + (r[0] - 720 - 15) + 'deg) rotateY(' + (r[1] + 720 + 20) + 'deg)';
      setTimeout(function () { cube.style.transform = 'rotateX(' + (r[0] - 12) + 'deg) rotateY(' + (r[1] + 18) + 'deg)'; }, 760);
      el.querySelector('.dicewrap').classList.add('bounce'); sfx('card');
      return v;
    } };
  }
  function diceTint(p) { return !p.isAI && U.g && U.g.s.dice ? TINT[U.g.s.dice] : null; }
  async function orderIntro(g) {
    var s = g.s, res = {};
    var html = '<div class="row" style="gap:14px;justify-content:center">' + s.players.map(function (p) { return '<div id="oc' + p.id + '" style="text-align:center;border:5px solid ' + p.color + ';border-radius:22px;padding:8px;background:#fff;width:180px">' + spr(charSpec(p), 100, 100) + '<div style="font-weight:700">' + esc(p.name) + '</div><div class="ordice" id="od' + p.id + '"></div><div id="ol' + p.id + '" style="font-weight:700;font-size:15px;min-height:44px">' + (p.isAI ? 'กำลังทอย...' : '<button class="pink small" id="ob' + p.id + '">✋ หยุด!</button>') + '</div></div>'; }).join('') + '</div><div style="text-align:center;margin-top:8px;font-weight:700">แตะ “หยุด!” หรือแตะลูกเต๋าเพื่อหยุดลูกเต๋าของคุณ • แต้มมากสุดได้เริ่มก่อน</div>';
    await modal({ title: '🎲 ทอยลูกเต๋าจัดลำดับผู้เล่น', width: 840, body: html, close: false, buttons: [{ t: 'เริ่มเกม!', v: 1, cls: 'pink', dis: true }], mount: function (box) {
      var btn = box.querySelector('.mbtns button'), left = s.players.length;
      s.players.forEach(function (p) {
        var sp = spinner(box.querySelector('#od' + p.id), 70);
        var stop = function () { if (res[p.id]) return; res[p.id] = sp.stop(); sfx('card'); box.querySelector('#ol' + p.id).innerHTML = '<b style="font-size:22px">' + res[p.id] + ' แต้ม</b>'; if (--left === 0) { btn.disabled = false; finalize(); } };
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
  function charSpec(p) { if (/^x/.test(p.char)) return ['extra', +p.char.slice(1)]; var i = +p.char.slice(1); return [p.costume === 'cozy' ? 'cozy' : 'chars', i]; }
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
    s.players.forEach(function (p) { h += '<div class="piece" id="pc' + p.id + '" style="--pc:' + p.color + '"><div class="pin">P' + (p.id + 1) + '</div><div class="ring"></div>' + spr(charSpec(p), BT * 1.05, BT * 1.15) + '</div>'; });
    B.innerHTML = h;
    B.onclick = function (e) { if (U.dragMoved) return; var t = e.target.closest('[data-t]'); if (t && U.planTap && !modalOpen && U.planTap(+t.dataset.t)) return; if (t && !modalOpen && !U.choosingDir) tileInfo(+t.dataset.t); };
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
        var ch = g.chainLen(t);
        html += '<div class="bld">' + spr(['lvl', t.level - 1], T * 1.12, T * 1.02) + '</div><div class="lv" style="font-size:' + fs * 0.9 + 'px">' + (ch > 1 ? '🔗' + ch : 'Lv' + t.level) + '</div><div class="own" style="border-color:' + o.color + ';width:' + T * 0.5 + 'px;height:' + T * 0.5 + 'px">' + spr(charSpec(o), T * 0.42, T * 0.42) + '</div>' + lbl(fmt(g.shopRent(t)), o.color);
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
      });
    });
  }
  function refresh() {
    if (!U.g) return;
    var g = U.g, s = g.s;
    refreshTiles(); refreshLabels(); placePieces(); renderPlayers(); renderStocks(); renderItems();
    $('#roundPill').innerHTML = spr(['items', 19], 36, 36) + 'รอบ ' + Math.min(s.round, s.settings.maxRounds) + ' / ' + s.settings.maxRounds;
    if (!$('#btnGameMenu').innerHTML) $('#btnGameMenu').innerHTML = spr(['ui', 'settings'], 70, 54);
    $('#spdBtn').textContent = 'ความเร็ว: ' + speedLabel();
    $('#targetPill').innerHTML = '<span style="font-size:30px">🎯</span><div><small>เป้าหมายทรัพย์สิน</small><div class="v">' + fmt(s.settings.target) + ' G</div></div>';
  }
  U.refresh = refresh;
  function renderPlayers() {
    var g = U.g, s = g.s, cur = g.cp();
    var rank = s.players.slice().sort(function (a, b) { if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1; return g.netWorth(b) - g.netWorth(a); }).map(function (p) { return p.id; });
    setHTML($('#pbar'), s.players.map(function (p) {
      var rk = rank.indexOf(p.id) + 1;
      return '<div class="pcard ' + (p.id === cur.id && !s.over ? 'turn ' : '') + (p.bankrupt ? 'bk' : '') + '" data-p="' + p.id + '" style="--pc:' + p.color + ';--pcl:' + hexA(p.color, .35) + '">' + (rk === 1 && !p.bankrupt ? '<div class="crown">👑</div>' : '') +
        '<div class="pchar">' + spr(charSpec(p), 84, 92) + '</div>' +
        '<div class="ptop"><span class="pno">P' + (p.id + 1) + '</span><span class="nm">' + esc(p.name) + '</span></div>' +
        '<div class="cash coin">' + fmt(p.cash) + '</div>' +
        '<span class="nwpill">ทรัพย์สิน ' + fmt(g.netWorth(p)) + '</span>' +
        '<div class="lvl">' + (p.seat && !p.remote ? '<span style="color:#d0342c">📴 หลุด</span> • ' : '') + 'Lv' + p.level + (p.isAI ? ' • AI ' + { beginner: 'Easy', normal: 'Normal', advanced: 'Adv' }[p.ai.level] : '') + '</div>' +
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
      var st = sl.used ? '<span class="st used">ใช้แล้ว</span>' : d.when === 'preRoll' ? '<span class="st ready">' + (ready ? 'แตะเพื่อใช้' : 'พร้อมใช้') + '</span>' : '<span class="st on">✓ ใช้งานอยู่</span>';
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
          .then(async function (ok) { if (ok) { await g.usePreRoll(p, sl); consumeUsed(g); sfx('coin'); refresh(); if (g.s.teleportBank && U.preRollResolve) U.preRollResolve(); else if (U.preRollRender) U.preRollRender(); } });
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
    modal({ title: esc(p.name) + (p.isAI ? ' (AI ' + p.ai.level + ' • ' + p.ai.persona + ')' : ''), width: 760, body: '<div class="row" style="align-items:flex-start;gap:16px"><div style="text-align:center">' + spr(charSpec(p), 150, 160) + '<div class="chip">อันดับ #' + rank + '</div></div><div class="col grow"><div class="kv"><span>เงินสด</span><b>' + fmt(p.cash) + ' G</b><span>มูลค่าร้าน/อาคาร</span><b>' + fmt(g.propertyValue(p)) + ' G</b><span>มูลค่าหุ้น</span><b>' + fmt(g.stockValue(p)) + ' G</b>' + (p.safe ? '<span>บัญชีคุ้มครอง</span><b>' + fmt(p.safe) + ' G</b>' : '') + '<span>ทรัพย์สินรวม</span><b>' + fmt(g.netWorth(p)) + ' G</b><span>ระดับ</span><b>Lv' + p.level + ' (เงินเดือนถัดไป ' + fmt(g.salary(p)) + ' G)</b><span>หนี้ค้างชำระ</span><b>' + (p.cash < 0 ? fmt(-p.cash) : 0) + ' G</b></div>' + (p.hist.length > 1 ? '<div><b>ประวัติทรัพย์สิน</b><br>' + spark(p.hist, p.color, 480, 60) + '</div>' : '') + '<div><b>🛡️ สกิลจากการ์ดที่มีอยู่</b><div class="col" style="margin-top:4px">' + buffsHTML(p) + '</div></div><div class="row" style="align-items:flex-start;gap:14px"><div class="col grow"><b>ร้านค้า</b>' + shops + '</div><div class="col grow"><b>หุ้น</b>' + st + '</div></div></div></div>', buttons: [{ t: 'ปิด', v: 1 }] });
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
          var fee = g.buyFee(p), sfee = g.sellFee();
          var rows = s.districts.map(function (d, i) {
            var max = g.maxBuyShares(p, i);
            var cq = Math.min(max, Math.floor(+custom[i] || 0)), buyBtns = mode !== 'sell' ? [5, 10, 25, 50, 99].map(function (n) { return '<button class="small ' + (cq === Math.min(n, max) && cq ? 'green' : '') + '" data-b="' + i + ':' + n + '" ' + (max <= 0 ? 'disabled' : '') + '>' + n + '</button>'; }).join('') + '<input data-ci="' + i + '" type="number" min="1" placeholder="จำนวน" style="width:84px;font-size:16px;padding:6px;border:2px solid #6b4226;border-radius:10px;font-family:inherit" value="' + (custom[i] || '') + '" ' + (max <= 0 ? 'disabled' : '') + '><button class="small green" data-bc="' + i + '" ' + (cq > 0 ? '' : 'disabled') + '>ซื้อ' + (cq > 0 ? ' ' + cq + ' หุ้น = ' + fmt(Math.ceil(cq * d.price * (1 + fee))) + ' G' : '') + '</button>' : '';
            var sellBtns = mode !== 'buy' ? [1, 5, 10, 25].map(function (n) { return '<button class="small pink" data-s="' + i + ':' + n + '" ' + (n > p.shares[i] ? 'disabled' : '') + '>-' + n + '</button>'; }).join('') + '<button class="small pink" data-s="' + i + ':' + p.shares[i] + '" ' + (!p.shares[i] ? 'disabled' : '') + '>ขายหมด</button>' : '';
            var own = d.tiles.map(function (id) { return s.tiles[id]; }); return '<div class="row" style="border-bottom:2px dashed #e5cfae;padding:6px 0;gap:8px"><span style="width:16px;height:30px;border-radius:5px;background:' + d.color + ';border:2px solid #6b4226"></span><div style="width:210px;cursor:pointer" data-peek="' + i + '"><b>' + esc(d.th) + ' <span style="font-size:13px;color:#3f86f0">📍ดูบนแผนที่</span></b><div style="display:flex;gap:2px;margin:1px 0">' + own.map(function (t) { return '<span title="' + esc(t.name) + '" style="width:16px;height:16px;border-radius:5px;border:2px solid ' + (t.owner >= 0 ? s.players[t.owner].color : '#ccc') + ';background:' + (t.owner >= 0 ? hexA(s.players[t.owner].color, .5) : '#fff') + ';font-size:9px;display:flex;align-items:center;justify-content:center;font-weight:700">' + (t.owner >= 0 ? t.level : '') + '</span>'; }).join('') + '</div><div style="font-size:12px;font-weight:700">ราคา ' + d.price + ' G • ถือ ' + p.shares[i] + ' • ซื้อได้อีก ' + max + '</div></div>' + spark(d.hist, d.color, 90, 34) + '<div class="row" style="gap:4px;flex-wrap:wrap;flex:1">' + buyBtns + sellBtns + '</div></div>';
          }).join('');
          body.innerHTML = '<div class="row" style="justify-content:center;gap:10px;margin-bottom:6px"><span class="chip coin">' + fmt(p.cash) + ' G</span>' + (fee || sfee ? '<span class="chip">ค่าธรรมเนียมซื้อ ' + (fee * 100) + '% • ขาย ' + (sfee * 100) + '%</span>' : '<span class="chip">ไม่มีค่าธรรมเนียม</span>') + (mode !== 'sell' ? (p.flags.stockBuyDone ? '<span class="chip" style="background:#d8f5d0">✅ ซื้อหุ้นแล้วในเทิร์นนี้</span>' : '<span class="chip" style="background:#fff3c4">ซื้อหุ้นได้ 1 ครั้ง/เทิร์น • เลือก 1 เขต (สูงสุด 99 หุ้น)</span>') : '') + '<span class="chip">💡 แตะชื่อเขตเพื่อดูบนแผนที่</span></div>' + rows;
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
    });
  }
  function landPreview(p, t) {
    var g = U.g, s = g.s;
    if (t.type === 'shop') {
      if (t.owner < 0) return '📍 <b>' + esc(t.name) + '</b><br>ร้านว่าง • ซื้อได้ ' + fmt(g.buyPrice(t)) + ' G' + (p.cash < g.buyPrice(t) ? '<br><span style="color:#d0342c">เงินไม่พอ</span>' : '');
      if (t.owner === p.id) return '📍 <b>' + esc(t.name) + '</b> (ร้านคุณ)<br>อัปเกรดร้าน 1 หลังได้ 1 ระดับ';
      return '📍 <b>' + esc(t.name) + '</b> ของ ' + esc(s.players[t.owner].name) + '<br><span style="color:#d0342c;font-size:16px">ต้องจ่าย ' + fmt(g.shopRent(t)) + ' G</span>';
    }
    if (t.type === 'bank') return '📍 <b>ธนาคาร</b><br>' + (Game.suitsDone(p) ? 'เลื่อนระดับ + เงินเดือน ' + fmt(g.salary(p)) + ' G!' : 'ซื้อหุ้น • เลือกทิศได้อิสระ');
    if (t.type === 'splot') { if (!t.special) return '📍 <b>ที่ดินบ้านพิเศษ</b><br>สร้างบ้านพิเศษได้!'; var sb2 = SPECIAL_BUILDINGS.find(function (x) { return x.id === t.special; }); if (t.spOwner === p.id) return '📍 ' + sb2.th + ' (ของคุณ)'; return '📍 <b>' + sb2.th + '</b> ของ ' + esc(s.players[t.spOwner].name) + '<br><span style="color:#d0342c">' + (t.special === 'sp_portal' ? 'จ่าย 5–10% ของทรัพย์สิน' : t.special === 'sp_party' ? 'ทุกคนจ่ายคนละ 100 G' : t.special === 'sp_toll' ? 'จ่าย ' + fmt(t.toll || 100) + ' G' : 'สกิลการ์ดปลิวหาย 2 ใบ') + '</span>'; }
    if (t.type === 'switch') return '📍 <b>ช่องสลับ 🔄</b><br>เทิร์นหน้าจะเดินกลับทิศ';
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
      autosave: function (s) { consumeUsed(g); try { localStorage.setItem('rfs_save_auto', JSON.stringify(s)); localStorage.setItem('rfs_save_auto_meta', JSON.stringify({ map: MAPS[s.mapIdx].th, round: s.round, date: new Date().toLocaleString('th-TH') })); } catch (e) { } },
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
          var done = function () { U.preRollActive = false; U.preRollResolve = null; U.preRollRender = null; renderItems(); resolve(); };
          U.preRollResolve = done;
          var render = function () {
            setAct('<div class="uibtn" id="rollBtn">' + spr(['ui', 'roll'], 244, 118) + '</div>' + (U.lastRoll ? '<div class="lastroll">ครั้งก่อน ' + U.lastRoll + '</div>' : ''));
            $('#actBtns').innerHTML = '<div class="uibtn" id="aShops">' + spr(['ui', 'manage'], 150, 58) + '</div><div class="uibtn" id="aMine">' + spr(['ui', 'assets'], 150, 58) + '</div><div class="uibtn" id="aSellSh">' + spr(['ui', 'sell'], 150, 58) + '</div><div class="uibtn" id="aSellSt">' + spr(['ui', 'stockmkt'], 150, 58) + '</div>';
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
              setAct('<div style="font-size:18px">เดินอีก <b style="font-size:26px;color:#ff5d8f">' + rem + '</b> ก้าว</div><div class="lp">' + (opts.length > 1 || manual ? '👆 แตะช่อง 📍 ที่กระพริบเพื่อเดินไปเลย<br>หรือแตะลูกศรเลือกทางทีละก้าว' : 'กำลังเดิน...') + '<br>📍 = จุดที่อาจตก</div>');
              $('#actBtns').innerHTML = '<div class="mvbtns"><button class="blue" id="mvUndo" ' + (path.length ? '' : 'disabled') + '>↩ ย้อน 1 ก้าว</button><button class="small" id="mvReset" ' + (path.length ? '' : 'disabled') + '>⏮ เริ่มเดินใหม่</button></div>';
              if (busy) { }
              else if (opts.length === 1 && !manual) timer = setTimeout(function () { step(opts[0]); }, 230 / U.speed + 80);
              else opts.forEach(function (id) { var t = g.tile(id), dx = t.x - cur.x, dy = t.y - cur.y, ch = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? '➜' : '⬅') : (dy > 0 ? '⬇' : '⬆'); var a = document.createElement('div'); a.className = 'dirArrow'; a.textContent = ch; var az = Math.max(46, BT * 1.05) / Math.max(1, CAM.z * 0.8); a.style.width = a.style.height = az + 'px'; a.style.fontSize = az * 0.55 + 'px'; a.style.left = (t.x * SC - az / 2) + 'px'; a.style.top = (t.y * SC - az / 2) + 'px'; a.onclick = function (e) { e.stopPropagation(); step(id); }; B.appendChild(a); });
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
        var sp = spinner(L.querySelector('#spinD'), 150, null);
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
          setAct('<div class="msg">เลือกทิศทาง ➜<br><span style="font-size:14px">เหลืออีก ' + rem + ' ช่อง • แตะลูกศรสีชมพู</span></div>');
          var arrows = opts.map(function (id) { var t = g.tile(id), dx = t.x - cur.x, dy = t.y - cur.y, ch = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? '➜' : '⬅') : (dy > 0 ? '⬇' : '⬆'); var a = document.createElement('div'); a.className = 'dirArrow'; a.textContent = ch; var az = Math.max(46, BT * 1.15) / CAM.z * (CAM.z > 1 ? 1.15 : 1); a.style.width = a.style.height = az + 'px'; a.style.fontSize = az * 0.55 + 'px'; a.style.left = (t.x * SC - az / 2) + 'px'; a.style.top = (t.y * SC - az / 2) + 'px'; a.onclick = function (e) { e.stopPropagation(); arrows.forEach(function (x) { x.remove(); }); U.choosingDir = false; resolve(id); }; $('#board').appendChild(a); return a; });
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
      chooseSpecialHouse: async function (p, t, opts) {
        if (U.tut && !p.isAI) await Tutorial.event('special');
        if (p.isAI) return aiWait(350).then(function () { var r = A.chooseSpecialHouse(g, p, t, opts); if (r) toast('🏰 ' + esc(p.name) + ' สร้าง ' + SPECIAL_BUILDINGS.find(function (b) { return b.id === r; }).th); return r; });
        return modal({ title: '🏰 สร้างบ้านพิเศษ', width: 1000, xValue: null, body: '<div style="text-align:center;font-weight:700;margin-bottom:8px">เลือก 1 แบบ — ใครมาตก/เดินผ่านจะโดนเอฟเฟกต์ของบ้าน • เงินสด ' + fmt(p.cash) + ' G</div><div class="sphgrid">' + opts.map(function (o) { var ok = o.cost <= p.cash; return '<div class="sphopt ' + (ok ? '' : 'dimo') + '" data-sb="' + o.b.id + '">' + spr(o.b.spr, 170, 160) + '<b>' + o.b.th + '</b><span>' + o.b.desc + '</span><div class="coin" style="font-size:18px">' + fmt(o.cost) + '</div></div>'; }).join('') + '</div>', buttons: [{ t: 'ยังไม่สร้าง', v: null, cls: 'gray' }],
          mount: function (box, close) { box.querySelectorAll('[data-sb]').forEach(function (e) { e.onclick = function () { if (e.classList.contains('dimo')) { toast('เงินไม่พอ'); return; } close(e.dataset.sb); }; }); } });
      },
      portalChoice: function (p, owner, t, big, small) {
        if (p.isAI) return aiWait(400).then(function () { var r = A.portalChoice(g, p, owner, t, big, small); toast('🌀 ' + esc(p.name) + (r ? ' จ่าย ' + fmt(big) + ' G แล้ววาร์ป!' : ' จ่าย ' + fmt(small) + ' G (ไม่วาร์ป)')); return r; });
        return modal({ title: '🌀 ประตูทะลุมิติของ ' + esc(owner.name), width: 680, close: false, body: '<div class="row" style="gap:16px;align-items:center">' + spr(['sph', 0], 160, 160) + '<div style="font-weight:700;font-size:17px;line-height:1.7">วาร์ปไปช่องไหนก็ได้ในแผนที่!<br>• วาร์ป: จ่าย <b style="color:#d0342c">' + fmt(big) + ' G</b> (10% ของทรัพย์สิน)<br>• ไม่วาร์ป: จ่าย <b style="color:#d0342c">' + fmt(small) + ' G</b> (5%)</div></div>', buttons: [{ t: '🌀 วาร์ป (' + fmt(big) + ' G)', v: true, cls: 'purple' }, { t: 'ไม่วาร์ป (' + fmt(small) + ' G)', v: false }] });
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
        await modal({ title: '🎉 ปาร์ตี้ที่บ้านของ ' + esc(owner.name) + '!', width: 700, close: false, body: '<div style="text-align:center">' + spr(['sph', 1], 180, 180) + '<div style="font-weight:700;font-size:18px">' + esc(p.name) + ' ตกบ้านปาร์ตี้ — ทุกคนถูกเรียกมารวมกันที่นี่!<br>ทุกคน (ยกเว้นเจ้าของ) จ่ายคนละ 100 G</div><div class="row" style="justify-content:center;gap:6px;margin-top:6px">' + g.alive().map(function (q) { return spr(charSpec(q), 70, 70); }).join('') + '</div></div>', buttons: [{ t: 'ไปปาร์ตี้!', v: 1, cls: 'pink' }], auto: p.isAI ? 2200 : 0 });
      },
      windmill: async function (p, owner, t, lost) {
        sfx('bad');
        await modal({ title: '🌬️ บ้านกังหันลมของ ' + esc(owner.name), width: 640, close: false, body: '<div style="text-align:center">' + spr(['sph', 3], 170, 170) + '<div style="font-weight:700;font-size:18px">' + (lost.length ? 'ลมพัดสกิลการ์ดของ ' + esc(p.name) + ' ปลิวหายไป ' + lost.length + ' ใบ!<div style="font-size:26px;margin-top:4px">' + lost.map(function (b) { return b[1] + ' ' + b[2]; }).join('<br>') + '</div>' : esc(p.name) + ' ไม่มีสกิลการ์ดสะสมไว้ — รอดตัว!') + '</div></div>', buttons: [{ t: 'ตกลง', v: 1 }], auto: p.isAI ? 2000 : 0 });
        refresh();
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
    modal({ title: 'เมนูเกม', body: '<div class="col" style="min-width:380px"><button class="green" data-m="save">💾 บันทึกเกม</button><button class="blue" data-m="guide">📖 คู่มือ</button><button data-m="settings">⚙️ ตั้งค่า (ความเร็ว/เสียง)</button><button class="pink" data-m="quit">🏠 ออกไปหน้าหลัก (บันทึกอัตโนมัติ)</button></div>', mount: function (box, close) { box.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { close(b.dataset.m); }; }); } })
      .then(function (v) {
        if (v === 'save') saveModal(); else if (v === 'guide') guideModal(); else if (v === 'settings') settingsModal().then(refresh);
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
  function showResult(g) { victoryScene(g).then(function () { showResultPage(g); }); }
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
        '<div class="vtitle"><span class="ttl">🏆 ' + esc(win.name) + ' ชนะ!</span></div><div class="vreason">' + esc(s.endReason || '') + '</div>' +
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
  function showResultPage(g) {
    var s = g.s, owner = s.players[s.ownerIdx || 0];
    var rk = s.ranking || s.players.map(function (p) { return { id: p.id, nw: g.netWorth(p) }; }).sort(function (a, b) { return b.nw - a.nw; });
    var myRank = rk.findIndex(function (r) { return r.id === owner.id; });
    var reward = !owner.isAI ? Meta.matchReward(myRank, s.winner === owner.id, g.netWorth(owner)) : null;
    try { var L = JSON.parse(localStorage.getItem('rfs_results') || '[]'); L.unshift({ map: MAPS[s.mapIdx].th, rank: myRank + 1, nw: g.netWorth(owner), date: new Date().toLocaleDateString('th-TH') }); localStorage.setItem('rfs_results', JSON.stringify(L.slice(0, 20))); } catch (e) { }
    var W = 560, H = 220, mx = Math.max.apply(null, s.players.map(function (p) { return Math.max.apply(null, p.hist.concat([g.netWorth(p), 1])); }));
    var lines = s.players.map(function (p) { var h = p.hist.concat([g.netWorth(p)]); if (h.length < 2) h = [h[0], h[0]]; return '<polyline fill="none" stroke="' + p.color + '" stroke-width="4" points="' + h.map(function (v, i) { return (i / (h.length - 1) * W).toFixed(1) + ',' + (H - v / mx * (H - 10)).toFixed(1); }).join(' ') + '"/>'; }).join('');
    var ranks = rk.map(function (r, i) { var p = s.players[r.id]; return '<div class="row panel" style="padding:8px 14px;gap:14px;' + (i === 0 ? 'background:#fff3a8' : '') + '">' + spr(['ui', [55, 57, 59, 61][i]], 140, 40) + spr(charSpec(p), 70, 74) + '<div class="grow"><div style="font-weight:900;font-size:20px;color:' + p.color + '">' + esc(p.name) + (p.bankrupt ? ' 💥' : '') + '</div><div style="font-weight:800">ทรัพย์สิน ' + fmt(r.nw) + ' G • ร้าน ' + g.shopsOf(p).length + ' • Lv' + p.level + '</div></div></div>'; }).join('');
    $('#result').innerHTML = '<div class="scrhead"><div class="title"><span class="ttl">🏆 ผลการแข่งขัน — ' + MAPS[s.mapIdx].th + '</span></div><div class="uibtn" id="resMenu">' + spr(['ui', 'home'], 110, 80) + '</div></div><div class="scrbody"><div class="row" style="align-items:flex-start;gap:20px"><div class="col" style="width:600px">' + ranks + '<div class="panel" style="padding:10px;font-weight:800">' + esc(s.endReason || '') + '</div></div><div class="col" style="width:610px"><div class="panel" style="padding:12px"><b>กราฟทรัพย์สินรายรอบ</b><svg width="' + W + '" height="' + H + '" style="margin-top:6px;background:#fffdf5;border-radius:12px">' + lines + '</svg></div>' + (reward ? '<div class="panel" style="padding:12px;text-align:center;font-weight:900;font-size:20px">🎁 รางวัล: +' + fmt(reward.gold) + ' Gold Coin' + (reward.diamond ? ' • +' + reward.diamond + ' 💎' : '') + '<div style="font-size:14px">ใช้ซื้อไอเทมในร้านค้าได้เลย!</div></div>' : '') + '<div class="panel" style="padding:12px;text-align:center">' + (s.winner !== null && s.winner !== undefined ? spr(charSpec(s.players[s.winner]), 200, 200) + '<div style="font-size:26px;font-weight:900">' + esc(s.players[s.winner].name) + ' ชนะ!</div>' : '') + '</div></div></div></div>';
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
    $('#inventory').innerHTML = '<div class="scrhead">' + '<div class="uibtn backbtn" id="ivBack">' + spr(['ui', 'prev'], 70, 70) + '</div>' + '<div class="title"><span class="ttl">🎒 คลังไอเทม</span></div><span class="chip coin">' + fmt(P.gold) + '</span><span class="chip">💎 ' + P.diamond + '</span><div class="uibtn" id="ivShop">' + spr(['ui', 'shop'], 100, 72) + '</div></div><div class="scrbody"><div class="tabs" style="margin-bottom:12px">' + INV_TABS.map(function (t) { return '<div class="tab ' + (IV.tab === t ? 'on' : '') + '" data-ivt="' + t + '">' + t + '</div>'; }).join('') + '</div>' + grid + '</div>';
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
    $('#profile').innerHTML = '<div class="scrhead">' + '<div class="uibtn backbtn" id="pfBack">' + spr(['ui', 'prev'], 70, 70) + '</div>' + spr(Meta.charSprite(P.equip.char, P.equip.costume), 64, 70) + '<div class="title"><span class="ttl">เมืองของ ' + esc(P.name) + '</span></div><span class="chip">Lv ' + P.level + '</span><span class="chip">ชนะ ' + P.stats.wins + '/' + P.stats.games + '</span><button class="small pink" id="pfShop">ซื้อของตกแต่ง</button></div>' +
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

  // =====================================================================
  // TUTORIAL MODE — a guide (Korilakkuma) explains each system the first time it happens
  // =====================================================================
  var LESSONS = {
    intro: ['ยินดีต้อนรับสู่ Fortune Street! 🐻', 'เป้าหมายของเกมคือทำให้ <b>ทรัพย์สินรวม</b> (เงินสด + มูลค่าร้าน + หุ้น) ถึง <b>เป้าหมาย</b> ที่มุมขวาบน แล้ว <b>กลับเข้าธนาคาร</b> 🏦 ก่อนคนอื่น<br>ด้านซ้ายคือการ์ดผู้เล่น ดูเงินสด ทรัพย์สิน และอันดับได้ตลอด แตะการ์ดเพื่อดูรายละเอียด'],
    dice: ['ทอยลูกเต๋า 🎲', 'ลูกเต๋าจะ <b>หมุนอยู่ตลอด</b> — แตะที่ลูกเต๋าเมื่อไหร่ก็หยุดเมื่อนั้น<br>ได้กี่แต้มก็เดินเท่านั้น (1–6)'],
    plan: ['เลือกทางเดิน 👣', 'ตัวเลขบนหัวคือ <b>ก้าวที่เหลือ</b> • ช่องที่มี <b>📍</b> คือจุดที่เราอาจไปตก<br><b>แตะช่อง 📍 ที่กระพริบ</b> เพื่อเดินไปช่องนั้นเลย หรือแตะ <b>ลูกศรสีชมพู</b> เลือกทางทีละก้าว • เดินผิดกด <b>↩ ย้อน 1 ก้าว</b> ได้<br>ก้าวสุดท้ายจะบอกว่าตกช่องอะไร แล้วกด <b>✔ หยุดตรงนี้</b>'],
    buy: ['ซื้อร้าน 🏠', 'ช่องร้านที่เป็น <b>กรอบเส้นประ</b> คือร้านว่าง ซื้อได้เลย!<br>ซื้อแล้วกรอบจะกลายเป็น <b>สีของเรา</b> ใครมาตกต้องจ่ายค่าเช่าให้เรา<br>ร้านที่ <b>สีพื้นเดียวกัน</b> อยู่ <b>เขตเดียวกัน</b> — ซื้อหลายร้านในเขตเดียวกันจะยิ่งแพงขึ้น'],
    chain: ['ร้านติดกัน 🔗', 'ร้านของเราที่ <b>อยู่ติดกันบนถนน</b> จะเชื่อมกันเป็นแถว (แบบ Itadaki)!<br>ทุกร้านในแถว <b>ค่าเช่าเพิ่ม 20% ต่อร้านที่ติดกัน</b> (สูงสุด ×1.8) และ <b>อาคารขยายขึ้น 1 ขั้นต่อร้าน</b><br>ตัวเลข 🔗 บนร้านบอกความยาวแถว'],
    district: ['เขตธุรกิจ 🌈', 'ยิ่งถือหลายร้านใน <b>เขตเดียวกัน</b> มูลค่าและค่าเช่าทุกร้านในเขตยิ่งสูง (+25% ต่อร้าน)<br>ถ้าได้ <b>ครบทั้งเขต = ผูกขาด 👑</b> ค่าเช่าคูณเพิ่มอีก 1.5 เท่า และลงทุนได้เยอะขึ้นมาก!'],
    invest: ['ลงทุนสร้างร้านให้แพง 🏗️ (หัวใจของเกม!)', 'ตกที่ <b>ร้านของตัวเอง</b> = ลงทุนได้! เลือกอัปเกรดร้านของเราใน <b>เขตเดียวกัน</b> ได้ <b>1 หลัง ขึ้นทีละ 1 ระดับ</b><br>ร้านจะค่อย ๆ โตจากบ้านเล็ก ➜ <b>โรงแรมหรู</b> ค่าเช่าพุ่ง และ <b>ราคาหุ้นเขตก็ขึ้น</b><br>สร้างร้านแพง ๆ แล้วรอให้คู่แข่งมาตก! 💸'],
    rentPay: ['จ่ายค่าเช่า 💸', 'ตกร้านคนอื่นต้องจ่ายค่าเช่า ร้านยิ่งลงทุนมากยิ่งแพง!<br>ถ้ามีเงินพอ ระบบจะถามว่าอยากซื้อกิจการร้านนั้นไหม (ต้องจ่าย 5 เท่าของมูลค่า)'],
    rentGet: ['มีคนมาตกร้านเรา! 💰', 'เราได้ค่าเช่าเต็ม ๆ เลย — นี่แหละเหตุผลที่ต้องลงทุนร้านให้แพง!<br>และผู้ถือหุ้นเขตนั้นได้ <b>ปันผล 20%</b> จากธนาคารด้วย'],
    bank: ['ธนาคาร & หุ้น 📈', 'ผ่านหรือหยุดที่ธนาคารซื้อหุ้นได้ <b>1 ครั้งต่อเทิร์น เลือก 1 เขต</b> (ไม่เกิน 99 หุ้น)<br><b>ราคาหุ้นขึ้นเมื่อร้านในเขตถูกลงทุน</b> • ทุกครั้งที่มีคนจ่ายค่าเช่าในเขต ผู้ถือหุ้นได้ <b>ปันผล 20%</b><br>ทริค: ซื้อหุ้นเขตที่เราผูกขาด แล้วลงทุนร้านให้หุ้นพุ่ง!'],
    suit: ['สัญลักษณ์ ♥ ♦ ♣ ♠', 'เดินผ่านช่องสัญลักษณ์เพื่อเก็บให้ <b>ครบ 4 แบบ</b> แล้วกลับธนาคาร<br>= <b>เลื่อนระดับ + รับเงินเดือน</b> (ยิ่งมีร้านมากเงินเดือนยิ่งเยอะ)<br>ถ้า <b>หยุดตรงช่องสัญลักษณ์พอดี</b> จะได้เปิดการ์ดด้วย! 🃏'],
    promo: ['เลื่อนระดับ! 🎉', 'เงินเดือน = พื้นฐาน + เลเวล + 10% ของมูลค่าร้านทั้งหมด<br>เก็บสัญลักษณ์ใหม่แล้ววนกลับมารับอีกได้เรื่อย ๆ'],
    special: ['บ้านพิเศษ 🏰', 'ช่อง <b>? สีม่วง</b> คือที่ดินบ้านพิเศษ! ตกแล้วเลือกสร้าง 1 ใน 4 แบบ<br>🌀 <b>ประตูทะลุมิติ</b> คนตกเลือกวาร์ปได้แต่จ่าย 10% ของทรัพย์สิน (ไม่วาร์ป 5%)<br>🎉 <b>บ้านปาร์ตี้</b> เรียกทุกคนมารวม จ่ายคนละ 100 G<br>🚧 <b>ประตูเก็บค่าผ่านทาง</b> ใครเดินผ่านต้องจ่าย และแพงขึ้น +10 G ทุกครั้ง<br>🌬️ <b>บ้านกังหันลม</b> สกิลการ์ดของคนที่ตกปลิวหาย 2 ใบ'],
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
    var seat = Online.savedSeat();
    modal({ title: '🌐 โหมดออนไลน์', width: 680, body: '<div class="col" style="gap:14px;align-items:center">' + (seat ? '<div class="opt bigopt pmD" data-on="rejoin" style="width:100%">' + spr(['ui', 'auto'], 96, 74) + '<div class="col" style="gap:0"><span style="font-size:22px">🔄 กลับเข้าห้อง ' + seat.code + '</span><span style="font-size:13px">เกมที่หลุดออกมา — กลับไปเล่นที่นั่งเดิมของคุณ</span></div></div>' : '') +
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
        if (v === 'host') Online.host(cb); else Online.join(v.slice(5), cb);
      });
  }
  function lobbyModal() {
    var R = Online.room;
    modal({ title: R.role === 'host' ? '🏠 ห้องของคุณ' : '🚪 ห้อง ' + R.code, width: 1000, bgClose: false, xValue: 'leave', body: '<div id="lobbyB"></div>', mount: function () { renderLobby(); } })
      .then(function (v) { if (v === 'leave' && Online.room && !Online.room.started) { Online.leave(); toast('ออกจากห้องแล้ว'); } });
  }
  function renderLobby() {
    var B = document.getElementById('lobbyB'), R = Online.room; if (!B || !R) return;
    var host = R.role === 'host', S = R.settings || {}, ps = R.players || [];
    var slots = [0, 1, 2, 3].map(function (i) { var x = ps[i]; return '<div style="border-color:' + PLAYER_COLORS[i] + '">' + (x ? spr(Meta.charSprite(x.char, x.costume || 'chars'), 80, 90) + '<div>P' + (i + 1) + ' ' + esc(x.name) + '</div><div style="font-size:12px;color:#2c9a2c">' + (i === 0 ? '👑 โฮสต์' : '✅ พร้อม') + '</div>' : '<div style="padding-top:40px;opacity:.5">' + (S.fillAI ? '🤖 AI จะมาเติม' : 'รอผู้เล่น...') + '</div>') + '</div>'; }).join('');
    var settings = host ?
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:10px"><b>แผนที่:</b>' + MAPS.map(function (m, i) { return '<button class="small rbtn ' + (S.map === i ? 'on' : '') + '" data-lm="' + i + '">' + m.th + '</button>'; }).join('') + '</div>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px"><b>เป้าหมาย:</b>' + [25000, 40000, 60000, 100000].map(function (t) { return '<button class="small rbtn ' + (S.target === t ? 'on' : '') + '" data-lt="' + t + '">' + fmt(t) + '</button>'; }).join('') +
      '<div class="tog ' + (S.fillAI ? 'on' : '') + '" data-lf="fillAI"><i></i>เติม AI ให้ครบ 4 คน</div><div class="tog ' + (S.tax ? 'on' : '') + '" data-lf="tax"><i></i>มีภาษี</div></div>'
      : '<div style="text-align:center;font-weight:700;margin-top:10px">แผนที่: ' + (MAPS[S.map] || MAPS[0]).th + ' • เป้าหมาย ' + fmt(S.target || 40000) + ' G' + (S.fillAI ? ' • เติม AI' : '') + '</div>';
    B.innerHTML = '<div class="row" style="justify-content:center;gap:16px"><span style="font-weight:700">รหัสห้อง</span><span class="roomcode">' + R.code + '</span><span class="chip">' + (Online.kind === 'p2p' ? '🌐 ออนไลน์ P2P' : '📱 โหมดทดสอบเครื่องเดียว') + '</span></div>' +
      '<div style="text-align:center;font-weight:700;margin:6px 0">' + (host ? 'ส่งรหัสนี้ให้เพื่อน แล้วเพื่อนกด “โหมดออนไลน์ → เข้าห้องด้วยรหัส”' : 'เข้าห้องแล้ว! รอโฮสต์เริ่มเกม...') + '</div>' +
      '<div class="lobbyP">' + slots + '</div>' + settings +
      (host ? '<div style="text-align:center;margin-top:12px"><button class="pink" id="lobStart" style="font-size:22px">▶ เริ่มเกม (' + ps.length + ' คน)</button></div>' : '');
    if (!host) return;
    B.querySelectorAll('[data-lm]').forEach(function (e) { e.onclick = function () { Online.setSetting('map', +e.dataset.lm); renderLobby(); }; });
    B.querySelectorAll('[data-lt]').forEach(function (e) { e.onclick = function () { Online.setSetting('target', +e.dataset.lt); renderLobby(); }; });
    B.querySelectorAll('[data-lf]').forEach(function (e) { e.onclick = function () { Online.setSetting(e.dataset.lf, !S[e.dataset.lf]); renderLobby(); }; });
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
    renderLobby: renderLobby, closeModal: function () { if (U._closeModal) U._closeModal(); },
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
  if (Meta.loginState().canClaim) setTimeout(dailyLogin, 600);
})();
