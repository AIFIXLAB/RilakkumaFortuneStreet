// ===================== PROFILE • SHOP • INVENTORY • DAILY LOGIN (persistent, localStorage) =====================
var Meta = (function () {
  var KEY = 'rfs_profile_v1';
  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function fresh() {
    return {
      v: 1, name: 'ผู้เล่น', gold: 10000, diamond: 50, xp: 0, level: 1,
      inv: { eq_lucky: 1, eq_rent: 1, eq_move: 1, SC_cash: 1 },
      chars: { b0: 1, b1: 1, b2: 1, b3: 1 }, costumes: {}, dice: { dice_0: 1 }, deco: { deco_21: 1, deco_43: 1 },
      equip: { char: 'b0', costume: 'chars', dice: 'dice_0', eq: ['eq_lucky', 'eq_rent'], sc: 'SC_cash' },
      town: [{ id: 'deco_21', c: 3, r: 2, flip: false }],
      login: { last: null, streak: 0, claimed: [] }, hist: [], stats: { games: 0, wins: 0, best: 0 }, mail: [{ t: Date.now(), m: 'ยินดีต้อนรับสู่ Rilakkuma Fortune Street! รับ 10,000 G และ 50 💎 เป็นของขวัญเริ่มต้น' }],
    };
  }
  var P = null;
  function load() { try { P = JSON.parse(localStorage.getItem(KEY)); } catch (e) { P = null; } if (!P || P.v !== 1) P = fresh();
    Object.keys(P.deco).forEach(function (k) { if (!item(k)) delete P.deco[k]; }); P.town = P.town.filter(function (x) { return item(x.id); });
    // characters that were wrongly stored as items (steam/royal/easter) → move into the character collection
    Object.keys(P.inv).forEach(function (k) { if (/^[bxjgersk]\d+$/.test(k)) { if (P.inv[k] > 0) P.chars[k] = 1; delete P.inv[k]; } });
    Object.keys(P.inv).forEach(function (k) { if (!item(k)) delete P.inv[k]; });
    // costumes were removed: refund what was paid
    var cz = Object.keys(P.costumes || {}); if (cz.length) { var ref = cz.reduce(function (a, k) { return a + 2000 + (+k.slice(2) || 0) * 250; }, 0); P.gold += ref; P.costumeRefund = ref; P.costumes = {}; save(); }
    if (P.equip) P.equip.costume = 'chars';
    if (P.equip && !P.chars[P.equip.char]) P.equip.char = 'b0';
    return P; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { } }
  function reset() { P = fresh(); save(); }

  // ---- catalog (unified item lookup) ----
  function catalog() {
    var out = [];
    EQUIPMENT.forEach(function (e) { out.push({ id: e.id, cat: 'equip', type: 'Game Equipment', name: e.name, desc: e.th, price: e.price, cur: e.cur, spr: e.spr, stack: true }); });
    SPECIAL_CARDS.forEach(function (e) { out.push({ id: e.id, cat: 'cards', type: 'Special Cards', name: e.name, desc: e.th, price: e.price, cur: e.cur, spr: e.spr, stack: true }); });
    PACKAGES.forEach(function (e) { out.push({ id: e.id, cat: 'packs', type: 'Packages', name: e.name, desc: e.th, price: e.price, cur: e.cur, spr: e.spr, pack: e.gives }); });
    if (0) DECOS.forEach(function (e) { out.push({ id: e.id, cat: 'deco', type: e.id.match(/deco_(2\d|3\d)$/) ? 'Buildings' : 'Decorations', name: e.name, desc: 'ของตกแต่งโปรไฟล์ — ไม่มีผลต่อการแข่งขัน', price: e.price, cur: e.cur, spr: e.spr, stack: true }); });
    CHARACTERS.forEach(function (c, i) { if (c.price) out.push({ id: 'b' + i, cat: 'chars', type: 'Characters', name: c.name, desc: skillDesc('b' + i), price: c.price, cur: 'gold', spr: ['chars', i], uniq: true }); });
    JOB_CHARS.forEach(function (c, i) { out.push({ id: 'j' + i, cat: 'chars', type: 'Characters', name: c.name, desc: skillDesc('j' + i), price: c.price, cur: 'gold', spr: ['jobs', i], uniq: true }); });
    GOLD_CHARS.forEach(function (c, i) { out.push({ id: 'g' + i, cat: 'chars', type: 'Characters', name: c.name, desc: skillDesc('g' + i), price: c.d, cur: 'diamond', spr: ['gold', i], uniq: true, gold: true }); });
    EXTRA_CHARS.forEach(function (c, i) { out.push({ id: 'x' + i, cat: 'chars', type: 'Characters', name: c.name, desc: skillDesc('x' + i), price: c.d, cur: 'diamond', spr: ['extra', i], uniq: true }); });
    EASTER_CHARS.forEach(function (c, i) { out.push({ id: 'e' + i, cat: 'chars', type: 'Characters', name: c.name, desc: '🥚 หายาก — ได้จากไข่อีสเตอร์สุ่มเท่านั้น • ' + skillDesc('e' + i), price: 0, cur: 'egg', spr: ['easter', i], uniq: true, eggOnly: true }); });
    STEAM_CHARS.forEach(function (c, i) { out.push({ id: 's' + i, cat: 'chars', type: 'Characters', name: c.name, desc: '🚂 ชุดรถจักรไอน้ำ • ' + skillDesc('s' + i), price: c.d, cur: 'diamond', spr: ['steam', i], uniq: true }); });
    ROYAL_CHARS.forEach(function (c, i) { out.push({ id: 'r' + i, cat: 'chars', type: 'Characters', name: c.name, desc: '🎫 ชุดรอยัลทอง — แลกด้วยตั๋วรถไฟทอง ' + c.t + ' ใบเท่านั้น • ' + skillDesc('r' + i), price: c.t, cur: 'ticket', spr: ['royal', i], uniq: true, eggOnly: true, gold: true }); });
    BKK_CHARS.forEach(function (c, i) { out.push({ id: 'k' + i, cat: 'chars', type: 'Characters', name: c.name, desc: '🛺 ชุดกรุงเทพฯ (ใช้เข้าแมพ Bangkok City ได้) • ' + skillDesc('k' + i), price: c.price, cur: c.cur, spr: ['bkk', i], uniq: true, bkk: true }); });
    DICE_SKINS.forEach(function (d) { if (d.price) out.push({ id: d.id, cat: 'equip', type: 'Dice Skins', name: d.name, desc: d.desc ? '✨ ' + d.desc : 'สกินลูกเต๋า (Cosmetic)', price: d.price, cur: d.cur, spr: d.spr, uniq: true }); });
    return out;
  }
  function skillDesc(k) { var s = CHAR_SKILLS[k]; return s ? '⭐ สกิลติดตัว “' + s.name + '”: ' + s.desc + (s.ename ? ' • ' + (s.etag || '🥚') + ' โบนัส' + (s.elabel || 'อีเวนต์อีสเตอร์') + ' “' + s.ename + '”: ' + s.edesc : '') : ''; }
  var CAT = null;
  function item(id) { if (!CAT) CAT = catalog(); return CAT.find(function (x) { return x.id === id; }); }
  function all() { if (!CAT) CAT = catalog(); return CAT; }
  // tags for "Recommended" sorting
  var TAGS = { dice_13: ['new'], dice_14: ['new'], dice_15: ['new'], dice_16: ['new'], dice_17: ['new', 'hot'], dice_18: ['new'], dice_19: ['new'], dice_20: ['new', 'hot'], pk_begin: ['hot', 'new'], eq_golden: ['hot'], SC_upg: ['hot'], pk_lucky: ['sale', 'limited'], x3: ['new'], eq_rent: ['hot'], deco_40: ['new'], g2: ['new', 'limited'], j11: ['new'], dice_7: ['new'], dice_11: ['new', 'hot'], pk_deco: ['limited'], SC_cash: ['hot'], eq_travel: ['new'], dice_2: ['sale'] };
  function tags(id) { return TAGS[id] || []; }
  function priceOf(it) { return tags(it.id).indexOf('sale') >= 0 ? Math.round(it.price * 0.8) : it.price; }

  function owned(id) {
    if (/^[bxjgersk]\d+$/.test(id)) return P.chars[id] ? 1 : 0;
    if (/^dice_/.test(id)) return P.dice[id] ? 1 : 0;
    if (/^deco_/.test(id)) return P.deco[id] || 0;
    return P.inv[id] || 0;
  }
  function addItem(id, n) {
    n = n || 1;
    if (/^[bxjgersk]\d+$/.test(id)) P.chars[id] = 1;
    else if (/^dice_/.test(id)) P.dice[id] = 1;
    else if (/^deco_/.test(id)) P.deco[id] = (P.deco[id] || 0) + n;
    else P.inv[id] = (P.inv[id] || 0) + n;
  }
  function canAfford(cur, amt) { return (cur === 'gold' ? P.gold : P.diamond) >= amt; }
  function txid() { return 'S' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  // Atomic purchase: verify → deduct → grant → record
  function buy(id, qty) {
    var it = item(id); if (!it) return { ok: false, msg: 'ไม่พบสินค้า' };
    qty = Math.max(1, Math.floor(qty || 1)); if (it.uniq) qty = 1;
    var price = priceOf(it), total = price * qty;
    if (it.uniq && owned(id)) return { ok: false, msg: 'มีสินค้านี้แล้ว' };
    if (!canAfford(it.cur, total)) return { ok: false, msg: it.cur === 'gold' ? 'Gold Coin ไม่พอ' : 'Diamond ไม่พอ' };
    if (it.cur === 'gold') P.gold -= total; else P.diamond -= total;
    for (var i = 0; i < qty; i++) {
      if (it.pack) { if (it.pack.gold) P.gold += it.pack.gold; if (it.pack.diamond) P.diamond += it.pack.diamond; Object.keys(it.pack.items || {}).forEach(function (k) { addItem(k, it.pack.items[k]); }); }
      else addItem(id, 1);
    }
    P.hist.unshift({ tx: txid(), t: Date.now(), kind: 'buy', id: id, name: it.name + (qty > 1 ? ' ×' + qty : ''), cur: it.cur, amt: -total }); P.hist = P.hist.slice(0, 80);
    save(); return { ok: true, msg: 'ซื้อ ' + it.name + (qty > 1 ? ' ×' + qty : '') + ' สำเร็จ! เพิ่มเข้า Inventory แล้ว' };
  }
  function exchange(ex) {
    var payCur = ex.pay.gold ? 'gold' : 'diamond', amt = ex.pay.gold || ex.pay.diamond;
    if (!canAfford(payCur, amt)) return { ok: false, msg: 'ยอดคงเหลือไม่พอ' };
    if (payCur === 'gold') P.gold -= amt; else P.diamond -= amt;
    if (ex.get.gold) P.gold += ex.get.gold; if (ex.get.diamond) P.diamond += ex.get.diamond;
    P.hist.unshift({ tx: txid(), t: Date.now(), kind: 'exchange', name: ex.th, cur: payCur, amt: -amt }); save();
    return { ok: true, msg: 'แลกเปลี่ยนสำเร็จ' };
  }
  // consume a single-use item that was actually used in a match
  function consume(id) { if (P.inv[id] > 0) { P.inv[id]--; P.hist.unshift({ tx: txid(), t: Date.now(), kind: 'use', id: id, name: (item(id) || {}).name, cur: '-', amt: 0 }); } var e = P.equip; save(); }
  function validLoadout() {
    var e = P.equip, eq = (e.eq || []).filter(function (id, i, a) { return id && owned(id) > 0 && item(id) && a.indexOf(id) === i; }).slice(0, 3);
    var sc = e.sc && owned(e.sc) > 0 && item(e.sc) ? e.sc : null;
    return { eq: eq, sc: sc };
  }
  // daily login
  function loginState() {
    var t = today(), L = P.login;
    var canClaim = L.last !== t;
    var day = canClaim ? (isYesterday(L.last) ? (L.streak % 7) : 0) : ((L.streak - 1) % 7);
    return { canClaim: canClaim, day: day, streak: L.streak };
  }
  function isYesterday(s) { if (!s) return false; var d = new Date(); d.setDate(d.getDate() - 1); return s === d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function claimLogin() {
    var st = loginState(); if (!st.canClaim) return null;
    var L = P.login; if (!isYesterday(L.last)) L.streak = 0;
    var r = DAILY_REWARDS[L.streak % 7];
    if (r.gold) P.gold += r.gold; if (r.diamond) P.diamond += r.diamond; if (r.item) addItem(r.item, r.n || 1);
    L.streak++; L.last = today(); L.claimed.unshift({ d: L.last, day: (L.streak - 1) % 7 + 1, r: r }); L.claimed = L.claimed.slice(0, 30);
    P.hist.unshift({ tx: txid(), t: Date.now(), kind: 'login', name: 'Daily Login วันที่ ' + ((L.streak - 1) % 7 + 1), cur: r.gold ? 'gold' : 'diamond', amt: r.gold || r.diamond || 0 });
    save(); return r;
  }
  var BOX_BY_RANK = [5, 3, 2, 1];
  function addBoxes(n, rare) { P.boxes = (P.boxes || 0) + n; if (rare) P.jackpotNext = 1; save(); }
  function matchReward(rank, won, nw, noBoxes) {
    var gold = [4000, 2000, 1200, 600][rank] || 400, dia = won ? 15 : rank === 1 ? 5 : 2, boxes = noBoxes ? 0 : (BOX_BY_RANK[rank] || 1);
    P.gold += gold; P.diamond += dia; P.boxes = (P.boxes || 0) + boxes; P.jackpotNext = rank === 0 ? 1 : 0; P.stats.games++; if (won) P.stats.wins++; P.stats.best = Math.max(P.stats.best, nw);
    P.xp += 100 + (won ? 150 : 0); while (P.xp >= P.level * 300) { P.xp -= P.level * 300; P.level++; }
    P.hist.unshift({ tx: txid(), t: Date.now(), kind: 'reward', name: 'รางวัลจบเกม อันดับ ' + (rank + 1), cur: 'gold', amt: gold });
    save(); return { gold: gold, diamond: dia, boxes: boxes };
  }
  // ---- mystery boxes (reward for finishing a match) ----
  function pickW(list) { var t = list.reduce(function (a, x) { return a + x[0]; }, 0), r = Math.random() * t; for (var i = 0; i < list.length; i++) { r -= list[i][0]; if (r <= 0) return list[i][1]; } return list[list.length - 1][1]; }
  function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
  function openBox() {
    if (!(P.boxes > 0)) return null;
    P.boxes--;
    var rare = all().filter(function (x) { return x.uniq && !x.eggOnly && !owned(x.id); }), kind = P.jackpotNext && rare.length ? 'rare' : pickW([[30, 'gold'], [18, 'diamond'], [24, 'equip'], [18, 'card'], [10, 'rare']]);
    P.jackpotNext = 0;
    var out = [];
    if (kind === 'rare' && !rare.length) kind = 'gold';
    if (kind === 'gold') { var g = rnd([1000, 1500, 2000, 2500, 3000, 5000]); P.gold += g; out.push({ ic: '🪙', name: fmtN(g) + ' Gold', big: g >= 3000 }); }
    if (kind === 'diamond') { var d = rnd([8, 10, 15, 20, 30]); P.diamond += d; out.push({ ic: '💎', name: d + ' Diamond', big: d >= 20 }); }
    if (kind === 'equip' || kind === 'card' || kind === 'deco') {
      var pool = all().filter(function (x) { return x.cat === (kind === 'equip' ? 'equip' : kind === 'card' ? 'cards' : 'deco') && !x.uniq; }), it = rnd(pool), n = kind === 'deco' ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2);
      addItem(it.id, n); out.push({ spr: it.spr, name: it.name + ' ×' + n });
    }
    if (kind === 'rare') { var it2 = rnd(rare); addItem(it2.id, 1); out.push({ spr: it2.spr, name: it2.name, big: true, tag: it2.type }); }
    // every box also has a bonus pouch
    var bonus = 300 + Math.floor(Math.random() * 6) * 100; P.gold += bonus; out.push({ ic: '🪙', name: '+' + fmtN(bonus) + ' Gold โบนัส', small: true });
    P.hist.unshift({ tx: txid(), t: Date.now(), kind: 'box', name: 'กล่องสุ่ม: ' + out.map(function (o) { return o.name; }).join(', '), cur: '-', amt: 0 });
    save(); return { kind: kind, items: out };
  }
  function fmtN(n) { return Math.round(n).toLocaleString('en-US'); }
  var SHEET = { b: 'chars', x: 'extra', j: 'jobs', g: 'gold', e: 'easter', r: 'royal', s: 'steam', k: 'bkk' }, NAMES = { b: CHARACTERS, x: EXTRA_CHARS, j: JOB_CHARS, g: GOLD_CHARS, e: EASTER_CHARS, r: ROYAL_CHARS, s: STEAM_CHARS, k: BKK_CHARS };
  function addTickets(n) { P.tickets = (P.tickets || 0) + n; save(); }
  function redeemRoyal(k) { var c = ROYAL_CHARS[+k.slice(1)]; if (!c) return { ok: false, msg: 'ไม่พบตัวละคร' }; if (P.chars[k]) return { ok: false, msg: 'มีตัวละครนี้แล้ว' }; if ((P.tickets || 0) < c.t) return { ok: false, msg: 'ตั๋วรถไฟทองไม่พอ (ต้องใช้ ' + c.t + ' ใบ)' }; P.tickets -= c.t; P.chars[k] = 1; P.hist.unshift({ tx: txid(), t: Date.now(), kind: 'buy', id: k, name: c.name + ' (แลกตั๋วทอง ' + c.t + ' ใบ)', cur: '-', amt: 0 }); save(); return { ok: true, msg: '👑 ได้ ' + c.name + ' แล้ว!' }; }
  // ---- Bangkok lucky bags (blue 50k / purple 70k / red 100k) ----
  var BAG = {
    blue: { w: [[38, 'gold'], [22, 'diamond'], [20, 'equip'], [14, 'card'], [6, 'char']], gold: [1500, 2000, 2500, 3000, 4000], dia: [8, 10, 12, 15, 20], n: [2, 3], bonus: [300, 800], chars: function (k) { return BKK_CHARS[+k.slice(1)].cur === 'gold'; } },
    purple: { w: [[32, 'gold'], [25, 'diamond'], [16, 'equip'], [13, 'card'], [11, 'char'], [3, 'boxes']], gold: [3000, 4000, 5000, 6000, 7000], dia: [15, 20, 25, 30, 35], n: [3, 4], bonus: [800, 1500], chars: function () { return true; } },
    red: { w: [[26, 'gold'], [25, 'diamond'], [12, 'equip'], [10, 'card'], [19, 'char'], [8, 'boxes']], gold: [6000, 8000, 10000, 12000, 15000], dia: [30, 40, 50, 60, 80], n: [4, 5], bonus: [1500, 3000], chars: function () { return true; } },
  };
  function addBags(tier, n) { P.bags = P.bags || {}; P.bags[tier] = (P.bags[tier] || 0) + n; save(); }
  function bagCount(tier) { return (P.bags && P.bags[tier]) || 0; }
  function openBag(tier) {
    var B = BAG[tier]; if (!B || !(bagCount(tier) > 0)) return null;
    P.bags[tier]--;
    var kind = pickW(B.w), out = [], locked = BKK_CHARS.map(function (c, i) { return 'k' + i; }).filter(function (k) { return !P.chars[k] && B.chars(k); });
    if (kind === 'char' && !locked.length) kind = 'diamond';
    if (kind === 'char') { var k = rnd(locked); P.chars[k] = 1; out.push({ spr: ['bkk', +k.slice(1)], name: charName(k), big: true, tag: 'ตัวละครกรุงเทพฯ' }); }
    if (kind === 'gold') { var g = rnd(B.gold); P.gold += g; out.push({ ic: '🪙', name: fmtN(g) + ' Gold', big: g >= B.gold[3] }); }
    if (kind === 'diamond') { var d = rnd(B.dia); P.diamond += d; out.push({ ic: '💎', name: d + ' Diamond', big: d >= B.dia[3] }); }
    if (kind === 'equip' || kind === 'card') { var pool = all().filter(function (x) { return x.cat === (kind === 'equip' ? 'equip' : 'cards') && !x.uniq; }), it = rnd(pool), n = rnd(B.n); addItem(it.id, n); out.push({ spr: it.spr, name: it.name + ' ×' + n }); }
    if (kind === 'boxes') { var nb = tier === 'red' ? 5 : 3; P.boxes = (P.boxes || 0) + nb; out.push({ ic: '🎁', name: 'กล่องสุ่ม ×' + nb, big: true }); }
    var bonus = B.bonus[0] + Math.floor(Math.random() * ((B.bonus[1] - B.bonus[0]) / 100 + 1)) * 100; P.gold += bonus; out.push({ ic: '🪙', name: '+' + fmtN(bonus) + ' Gold โบนัส', small: true });
    P.hist.unshift({ tx: txid(), t: Date.now(), kind: 'box', name: 'ถุงโชคดี: ' + out.map(function (o) { return o.name; }).join(', '), cur: '-', amt: 0 }); P.hist = P.hist.slice(0, 80);
    save(); return { kind: kind, items: out };
  }
  // ---- Easter mystery eggs (event reward; the only source of the 8 Easter characters) ----
  function addEggs(n) { P.eeggs = (P.eeggs || 0) + n; save(); }
  function openEgg() {
    if (!(P.eeggs > 0)) return null;
    P.eeggs--;
    var locked = EASTER_CHARS.map(function (c, i) { return 'e' + i; }).filter(function (k) { return !P.chars[k]; });
    var kind = pickW([[8, 'char'], [17, 'diamond'], [35, 'gold'], [22, 'equip'], [18, 'card']]), out = [];
    if (kind === 'char') {
      if (locked.length) { var k = rnd(locked); P.chars[k] = 1; out.push({ spr: ['easter', +k.slice(1)], name: charName(k), big: true, tag: 'ตัวละครหายาก' }); }
      else { P.diamond += 40; out.push({ ic: '💎', name: '40 Diamond (มีตัวละครอีสเตอร์ครบแล้ว)', big: true }); }
    }
    if (kind === 'diamond') { var d = rnd([10, 12, 15, 20, 25]); P.diamond += d; out.push({ ic: '💎', name: d + ' Diamond', big: d >= 20 }); }
    if (kind === 'gold') { var g = rnd([800, 1200, 1500, 2000, 3000]); P.gold += g; out.push({ ic: '🪙', name: fmtN(g) + ' Gold', big: g >= 3000 }); }
    if (kind === 'equip' || kind === 'card') { var pool = all().filter(function (x) { return x.cat === (kind === 'equip' ? 'equip' : 'cards') && !x.uniq; }), it = rnd(pool), n = 2 + Math.floor(Math.random() * 2); addItem(it.id, n); out.push({ spr: it.spr, name: it.name + ' ×' + n }); }
    P.hist.unshift({ tx: txid(), t: Date.now(), kind: 'box', name: 'ไข่อีสเตอร์: ' + out.map(function (o) { return o.name; }).join(', '), cur: '-', amt: 0 });
    save(); return { kind: kind, items: out };
  }
  function charSprite(key) { key = key || 'b0'; return [SHEET[key[0]] || 'chars', +key.slice(1) || 0]; }
  function charName(key) { key = key || 'b0'; var L = NAMES[key[0]] || CHARACTERS, c = L[+key.slice(1)]; return c ? c.name : ''; }
  function charSkill(key) { return CHAR_SKILLS[key] || null; }
  return { addBags: addBags, bagCount: bagCount, openBag: openBag, BAG: BAG, addTickets: addTickets, redeemRoyal: redeemRoyal, addEggs: addEggs, openEgg: openEgg, load: load, save: save, reset: reset, get p() { return P; }, all: all, item: item, tags: tags, priceOf: priceOf, owned: owned, buy: buy, exchange: exchange, consume: consume, validLoadout: validLoadout, loginState: loginState, claimLogin: claimLogin, matchReward: matchReward, addBoxes: addBoxes, charSkill: charSkill, skillDesc: skillDesc, openBox: openBox, BOX_BY_RANK: BOX_BY_RANK, charSprite: charSprite, charName: charName, addItem: addItem };
})();
