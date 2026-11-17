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
    CHARACTERS.forEach(function (c, i) { if (c.price) out.push({ id: 'b' + i, cat: 'chars', type: 'Characters', name: c.name, desc: 'ตัวละคร ' + c.sub + ' สำหรับเดินบนกระดาน (Cosmetic)', price: c.price, cur: 'gold', spr: ['chars', i], uniq: true }); });
    CHARACTERS.forEach(function (c, i) { out.push({ id: 'cz' + i, cat: 'chars', type: 'Costumes', name: 'ชุดพิเศษ: ' + c.name, desc: 'ชุดใหม่สำหรับ ' + c.name + ' เปลี่ยนก่อนเริ่มเกมได้', price: 2000 + i * 250, cur: 'gold', spr: ['cozy', i], uniq: true }); });
    EXTRA_CHARS.forEach(function (c, i) { out.push({ id: 'x' + i, cat: 'chars', type: 'Characters', name: c.name, desc: 'ตัวละครใหม่ (Cosmetic)', price: c.d, cur: 'diamond', spr: ['extra', i], uniq: true }); });
    DICE_SKINS.forEach(function (d) { if (d.price) out.push({ id: d.id, cat: 'chars', type: 'Dice Skins', name: d.name, desc: 'สกินลูกเต๋า (Cosmetic)', price: d.price, cur: d.cur, spr: d.spr, uniq: true }); });
    return out;
  }
  var CAT = null;
  function item(id) { if (!CAT) CAT = catalog(); return CAT.find(function (x) { return x.id === id; }); }
  function all() { if (!CAT) CAT = catalog(); return CAT; }
  // tags for "Recommended" sorting
  var TAGS = { pk_begin: ['hot', 'new'], eq_golden: ['hot'], SC_upg: ['hot'], pk_lucky: ['sale', 'limited'], x3: ['new'], eq_rent: ['hot'], deco_40: ['new'], cz0: ['sale'], pk_deco: ['limited'], SC_cash: ['hot'], eq_travel: ['new'], dice_2: ['sale'] };
  function tags(id) { return TAGS[id] || []; }
  function priceOf(it) { return tags(it.id).indexOf('sale') >= 0 ? Math.round(it.price * 0.8) : it.price; }

  function owned(id) {
    if (/^b\d$/.test(id)) return P.chars[id] ? 1 : 0;
    if (/^x\d$/.test(id)) return P.chars[id] ? 1 : 0;
    if (/^cz\d$/.test(id)) return P.costumes[id] ? 1 : 0;
    if (/^dice_/.test(id)) return P.dice[id] ? 1 : 0;
    if (/^deco_/.test(id)) return P.deco[id] || 0;
    return P.inv[id] || 0;
  }
  function addItem(id, n) {
    n = n || 1;
    if (/^[bx]\d$/.test(id)) P.chars[id] = 1;
    else if (/^cz\d$/.test(id)) P.costumes[id] = 1;
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
  function matchReward(rank, won, nw) {
    var gold = [2500, 1200, 700, 400][rank] || 300, dia = won ? 10 : rank === 1 ? 3 : 0;
    P.gold += gold; P.diamond += dia; P.stats.games++; if (won) P.stats.wins++; P.stats.best = Math.max(P.stats.best, nw);
    P.xp += 100 + (won ? 150 : 0); while (P.xp >= P.level * 300) { P.xp -= P.level * 300; P.level++; }
    P.hist.unshift({ tx: txid(), t: Date.now(), kind: 'reward', name: 'รางวัลจบเกม อันดับ ' + (rank + 1), cur: 'gold', amt: gold });
    save(); return { gold: gold, diamond: dia };
  }
  function charSprite(key, costume) {
    if (/^x\d$/.test(key)) return ['extra', +key.slice(1)];
    var i = +key.slice(1);
    return [costume === 'cozy' && P && P.costumes['cz' + i] ? 'cozy' : 'chars', i];
  }
  function charName(key) { return /^x/.test(key) ? EXTRA_CHARS[+key.slice(1)].name : CHARACTERS[+key.slice(1)].name; }
  return { load: load, save: save, reset: reset, get p() { return P; }, all: all, item: item, tags: tags, priceOf: priceOf, owned: owned, buy: buy, exchange: exchange, consume: consume, validLoadout: validLoadout, loginState: loginState, claimLogin: claimLogin, matchReward: matchReward, charSprite: charSprite, charName: charName, addItem: addItem };
})();
