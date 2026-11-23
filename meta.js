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
    DECOS.forEach(function (e) { out.push({ id: e.id, cat: 'deco', type: e.id.match(/deco_(2\d|3\d)$/) ? 'Buildings' : 'Decorations', name: e.name, desc: 'ของตกแต่งโปรไฟล์ — ไม่มีผลต่อการแข่งขัน', price: e.price, cur: e.cur, spr: e.spr, stack: true }); });
    CHARACTERS.forEach(function (c, i) { if (c.price) out.push({ id: 'b' + i, cat: 'chars', type: 'Characters', name: c.name, desc: skillDesc('b' + i), price: c.price, cur: 'gold', spr: ['chars', i], uniq: true }); });
    JOB_CHARS.forEach(function (c, i) { out.push({ id: 'j' + i, cat: 'chars', type: 'Characters', name: c.name, desc: skillDesc('j' + i), price: c.price, cur: 'gold', spr: ['jobs', i], uniq: true }); });
    GOLD_CHARS.forEach(function (c, i) { out.push({ id: 'g' + i, cat: 'chars', type: 'Characters', name: c.name, desc: skillDesc('g' + i), price: c.d, cur: 'diamond', spr: ['gold', i], uniq: true, gold: true }); });
    EXTRA_CHARS.forEach(function (c, i) { out.push({ id: 'x' + i, cat: 'chars', type: 'Characters', name: c.name, desc: skillDesc('x' + i), price: c.d, cur: 'diamond', spr: ['extra', i], uniq: true }); });
    DICE_SKINS.forEach(function (d) { if (d.price) out.push({ id: d.id, cat: 'chars', type: 'Dice Skins', name: d.name, desc: d.desc ? '✨ ' + d.desc : 'สกินลูกเต๋า (Cosmetic)', price: d.price, cur: d.cur, spr: d.spr, uniq: true }); });
    return out;
  }
  function skillDesc(k) { var s = CHAR_SKILLS[k]; return s ? '⭐ สกิลติดตัว “' + s.name + '”: ' + s.desc : ''; }
  var CAT = null;
  function item(id) { if (!CAT) CAT = catalog(); return CAT.find(function (x) { return x.id === id; }); }
  function all() { if (!CAT) CAT = catalog(); return CAT; }
  // tags for "Recommended" sorting
  var TAGS = { pk_begin: ['hot', 'new'], eq_golden: ['hot'], SC_upg: ['hot'], pk_lucky: ['sale', 'limited'], x3: ['new'], eq_rent: ['hot'], deco_40: ['new'], g2: ['new', 'limited'], j11: ['new'], dice_7: ['new'], dice_11: ['new', 'hot'], pk_deco: ['limited'], SC_cash: ['hot'], eq_travel: ['new'], dice_2: ['sale'] };
  function tags(id) { return TAGS[id] || []; }
  function priceOf(it) { return tags(it.id).indexOf('sale') >= 0 ? Math.round(it.price * 0.8) : it.price; }

  function owned(id) {
    if (/^[bxjg]\d+$/.test(id)) return P.chars[id] ? 1 : 0;
    if (/^dice_/.test(id)) return P.dice[id] ? 1 : 0;
    if (/^deco_/.test(id)) return P.deco[id] || 0;
    return P.inv[id] || 0;
  }
  function addItem(id, n) {
    n = n || 1;
    if (/^[bxjg]\d+$/.test(id)) P.chars[id] = 1;
    else if (/^dice_/.test(id)) P.dice[id] = 1;
    else if (/^deco_/.test(id)) P.deco[id] = (P.deco[id] || 0) + n;
    else P.inv[id] = (P.inv[id] || 0) + n;
  }
  function canAfford(cur, amt) { return (cur === 'gold' ? P.gold : P.diamond) >= amt; }
  function txid() { return 'S' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  // Atomic purchase: verify → deduct → grant → record
  function buy(id) {
    var it = item(id); if (!it) return { ok: false, msg: 'ไม่พบสินค้า' };
    var price = priceOf(it);
    if (it.uniq && owned(id)) return { ok: false, msg: 'มีสินค้านี้แล้ว' };
    if (!canAfford(it.cur, price)) return { ok: false, msg: it.cur === 'gold' ? 'Gold Coin ไม่พอ' : 'Diamond ไม่พอ' };
    if (it.cur === 'gold') P.gold -= price; else P.diamond -= price;
    if (it.pack) { if (it.pack.gold) P.gold += it.pack.gold; if (it.pack.diamond) P.diamond += it.pack.diamond; Object.keys(it.pack.items || {}).forEach(function (k) { addItem(k, it.pack.items[k]); }); }
    else addItem(id, 1);
    P.hist.unshift({ tx: txid(), t: Date.now(), kind: 'buy', id: id, name: it.name, cur: it.cur, amt: -price }); P.hist = P.hist.slice(0, 80);
    save(); return { ok: true, msg: 'ซื้อ ' + it.name + ' สำเร็จ! เพิ่มเข้า Inventory แล้ว' };
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
    var e = P.equip, eq = (e.eq || []).filter(function (id, i, a) { return id && owned(id) > 0 && a.indexOf(id) === i; }).slice(0, 2);
    var sc = e.sc && owned(e.sc) > 0 ? e.sc : null;
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
  function matchReward(rank, won, nw) {
    var gold = [4000, 2000, 1200, 600][rank] || 400, dia = won ? 15 : rank === 1 ? 5 : 2, boxes = BOX_BY_RANK[rank] || 1;
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
    var rare = all().filter(function (x) { return x.uniq && !owned(x.id); }), kind = P.jackpotNext && rare.length ? 'rare' : pickW([[26, 'gold'], [16, 'diamond'], [22, 'equip'], [16, 'card'], [10, 'deco'], [10, 'rare']]);
    P.jackpotNext = 0;
    var out = [];
    if (kind === 'rare' && !rare.length) kind = 'gold';
    if (kind === 'gold') { var g = rnd([1000, 1500, 2000, 2500, 3000, 5000]); P.gold += g; out.push({ ic: '🪙', name: fmtN(g) + ' Gold', big: g >= 3000 }); }
    if (kind === 'diamond') { var d = rnd([8, 10, 15, 20, 30]); P.diamond += d; out.push({ ic: '💎', name: d + ' Diamond', big: d >= 20 }); }
    if (kind === 'equip' || kind === 'card' || kind === 'deco') {
      var pool = all().filter(function (x) { return x.cat === (kind === 'equip' ? 'equip' : kind === 'card' ? 'cards' : 'deco'); }), it = rnd(pool), n = kind === 'deco' ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2);
      addItem(it.id, n); out.push({ spr: it.spr, name: it.name + ' ×' + n });
    }
    if (kind === 'rare') { var it2 = rnd(rare); addItem(it2.id, 1); out.push({ spr: it2.spr, name: it2.name, big: true, tag: it2.type }); }
    // every box also has a bonus pouch
    var bonus = 300 + Math.floor(Math.random() * 6) * 100; P.gold += bonus; out.push({ ic: '🪙', name: '+' + fmtN(bonus) + ' Gold โบนัส', small: true });
    P.hist.unshift({ tx: txid(), t: Date.now(), kind: 'box', name: 'กล่องสุ่ม: ' + out.map(function (o) { return o.name; }).join(', '), cur: '-', amt: 0 });
    save(); return { kind: kind, items: out };
  }
  function fmtN(n) { return Math.round(n).toLocaleString('en-US'); }
  var SHEET = { b: 'chars', x: 'extra', j: 'jobs', g: 'gold' }, NAMES = { b: CHARACTERS, x: EXTRA_CHARS, j: JOB_CHARS, g: GOLD_CHARS };
  function charSprite(key) { key = key || 'b0'; return [SHEET[key[0]] || 'chars', +key.slice(1) || 0]; }
  function charName(key) { key = key || 'b0'; var L = NAMES[key[0]] || CHARACTERS, c = L[+key.slice(1)]; return c ? c.name : ''; }
  function charSkill(key) { return CHAR_SKILLS[key] || null; }
  return { load: load, save: save, reset: reset, get p() { return P; }, all: all, item: item, tags: tags, priceOf: priceOf, owned: owned, buy: buy, exchange: exchange, consume: consume, validLoadout: validLoadout, loginState: loginState, claimLogin: claimLogin, matchReward: matchReward, charSkill: charSkill, skillDesc: skillDesc, openBox: openBox, BOX_BY_RANK: BOX_BY_RANK, charSprite: charSprite, charName: charName, addItem: addItem };
})();
