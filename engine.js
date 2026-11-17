// ===================== RILAKKUMA FORTUNE STREET — GAME ENGINE =====================
// Pure game logic. All decisions go through an async `io` adapter (human UI or AI),
// so the same engine runs in the browser and in headless economy simulations.
(function (root) {
  var D = (typeof module !== 'undefined') ? require('./data.js') : root;
  var C = D.CONFIG;

  function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmt(n) { return (Math.round(n)).toLocaleString('en-US'); }

  // ---------- Map builder ----------
  function buildPainted(M) {
    var tiles = [], dCount = {}, edges = {};
    function find(x, y) { for (var i = 0; i < tiles.length; i++) if (Math.abs(tiles[i].x - x) <= 16 && Math.abs(tiles[i].y - y) <= 16) return tiles[i]; return null; }
    function link(a, b) { if (a === b) return; if (a.n.indexOf(b.id) < 0) a.n.push(b.id); if (b.n.indexOf(a.id) < 0) b.n.push(a.id); }
    M.paths.forEach(function (path) {
      var toks = path.trim().split(/\s+/), loop = toks[toks.length - 1] === '>'; if (loop) toks.pop();
      var seq = toks.map(function (tk) {
        var a = tk.split(','), x = +a[0], y = +a[1], code = a[2], ov = /\+$/.test(code); code = code.replace('+', '');
        var t = find(x, y); if (t) return t;
        t = { id: tiles.length, x: x, y: y, ch: code, n: [], owner: -1, level: 0, bonusPct: 0, bonusVal: 0, special: null, spOwner: -1, district: -1, ov: ov };
        if (code[0] === '#') {
          var d = +code.slice(1) - 1, k = dCount[d] = (dCount[d] || 0), dd = M.districts[d], def = dd.shops[k] || [dd.th + ' ' + (k + 1), D.BUSINESS[k % D.BUSINESS.length].id];
          dCount[d]++; t.type = 'shop'; t.ch = 'S' + d; t.district = d; t.name = def[0]; t.biz = def[1];
          t.f = dd.f; t.base = Math.round(dd.f * C.shopBase[k % C.shopBase.length] / 10) * 10; t.invest = 0;
        } else { var info = D.TILE_INFO[code]; t.type = info.type; t.name = info.name; if (info.suit) t.suit = info.suit; }
        tiles.push(t); return t;
      });
      for (var i = 1; i < seq.length; i++) link(seq[i - 1], seq[i]);
      if (loop) link(seq[seq.length - 1], seq[0]);
    });
    return tiles;
  }
  function buildBoard(mapIdx) {
    var M = D.MAPS[mapIdx], tiles = [], at = {};
    if (M.paths) {
      tiles = buildPainted(M);
      var warps0 = tiles.filter(function (t) { return t.type === 'warp'; });
      for (var w = 0; w + 1 < warps0.length; w += 2) { warps0[w].warpTo = warps0[w + 1].id; warps0[w + 1].warpTo = warps0[w].id; }
      var dists = M.districts.map(function (d, i) { return { name: d.name, th: d.th, color: d.color, f: d.f, tiles: tiles.filter(function (t) { return t.district === i; }).map(function (t) { return t.id; }), price: C.stock.start, hist: [C.stock.start], held: 0 }; });
      tiles.forEach(function (t) { if (t.type === 'vacant') t.near = nearestDistrict(tiles, t.id); });
      return { tiles: tiles, districts: dists, w: M.img[0], h: M.img[1], painted: true };
    }
    var dCount = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    M.grid.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var ch = row[x]; if (ch === '.' || ch === ' ') continue;
        var t = { id: tiles.length, x: x, y: y, ch: ch, n: [], owner: -1, level: 0, bonusPct: 0, bonusVal: 0, special: null, spOwner: -1, district: -1 };
        if (ch >= '1' && ch <= '9') {
          var d = +ch - 1, k = dCount[d]++, def = M.districts[d].shops[k] || ['ร้านค้า', 'cafe'];
          t.type = 'shop'; t.district = d; t.name = def[0]; t.biz = def[1];
          t.f = M.districts[d].f; t.base = Math.round(t.f * C.shopBase[k % C.shopBase.length] / 10) * 10; t.invest = 0;
        } else {
          var info = D.TILE_INFO[ch]; t.type = info.type; t.name = info.name; if (info.suit) t.suit = info.suit;
        }
        at[x + ',' + y] = t.id; tiles.push(t);
      }
    });
    tiles.forEach(function (t) {
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var o = at[(t.x + d[0]) + ',' + (t.y + d[1])]; if (o !== undefined) t.n.push(o); });
    });
    // warp pairs
    var warps = tiles.filter(function (t) { return t.type === 'warp'; });
    for (var i = 0; i + 1 < warps.length; i += 2) { warps[i].warpTo = warps[i + 1].id; warps[i + 1].warpTo = warps[i].id; }
    // vacant land belongs (for Market bonus) to nearest district
    var districts = M.districts.map(function (d, i) {
      return { name: d.name, th: d.th, color: d.color, f: d.f, tiles: tiles.filter(function (t) { return t.district === i; }).map(function (t) { return t.id; }), price: C.stock.start, hist: [C.stock.start], held: 0 };
    });
    tiles.forEach(function (t) { if (t.type === 'vacant') t.near = nearestDistrict(tiles, t.id); });
    return { tiles: tiles, districts: districts, painted: false, w: Math.max.apply(null, M.grid.map(function (r) { return r.length; })), h: M.grid.length };
  }
  function nearestDistrict(tiles, start) {
    var seen = {}, q = [start]; seen[start] = 1;
    while (q.length) { var id = q.shift(), t = tiles[id]; if (t.type === 'shop') return t.district; t.n.forEach(function (n) { if (!seen[n]) { seen[n] = 1; q.push(n); } }); }
    return 0;
  }

  // ---------- Game ----------
  function Game(state, io) { this.s = state; this.io = io; this.rng = mulberry(state.seed); this.rngCalls = 0; for (var i = 0; i < (state.rngCalls || 0); i++) { this.rng(); this.rngCalls++; } }

  Game.create = function (opts) {
    // opts: {mapIdx, players:[{name,char,costume,isAI,aiLevel,persona,loadout}], target, maxRounds, startCash, seed}
    var b = buildBoard(opts.mapIdx);
    var bank = b.tiles.find(function (t) { return t.type === 'bank'; });
    var s = {
      v: 1, mapIdx: opts.mapIdx, tiles: b.tiles, districts: b.districts, w: b.w, h: b.h, painted: b.painted,
      settings: { target: opts.target || C.targetNetWorth, maxRounds: opts.maxRounds || C.maxRounds, startCash: opts.startCash || C.startCash, rules: Object.assign({}, C.rules, opts.rules || {}) },
      players: opts.players.map(function (o, i) {
        return {
          id: i, name: o.name, char: o.char, costume: o.costume || 'chars', color: D.PLAYER_COLORS[i], isAI: !!o.isAI,
          ai: { level: o.aiLevel || 'normal', persona: o.persona || 'Balanced' },
          cash: opts.startCash || C.startCash, pos: bank.id, prev: null, level: 1, suits: {}, shares: b.districts.map(function () { return 0; }),
          safe: 0, flags: {}, bankrupt: false, turns: 0, promotions: 0,
          loadout: { eq: (o.loadout && o.loadout.eq || []).map(function (id) { return { id: id, used: false }; }), sc: (o.loadout && o.loadout.sc) ? { id: o.loadout.sc, used: false } : null },
          hist: [],
        };
      }),
      cur: 0, round: 1, turnNo: 0, deck: [], grid: [], taxPool: 0, effects: [], log: [], tx: 0, over: false, winner: null,
      seed: opts.seed || (Date.now() & 0xffffff), rngCalls: 0, cardHistory: [], phase: 'idle', forcedDice: null,
    };
    var g = new Game(s, null);
    if (!s.settings.rules.tax) s.tiles.forEach(function (t) { if (t.type === 'tax') { t.type = 'chance'; t.ch = '?'; t.name = 'Chance'; } });
    s.districts.forEach(function (d, i) { d.adj = 1; d.price = Math.max(1, Math.round(g.fairPrice(i))); d.hist = [d.price]; });
    // turn order: roll dice, highest first
    var rolls = s.players.map(function (p) { return { p: p, r: g.dice() * 10 + g.rng() }; });
    rolls.sort(function (a, b) { return b.r - a.r; });
    s.order = rolls.map(function (r) { return r.p.id; });
    s.orderRolls = rolls.map(function (r) { return { id: r.p.id, roll: Math.floor(r.r / 10) }; });
    g.newDeck();
    return s;
  };

  var P = Game.prototype;
  P.r = function () { this.s.rngCalls++; return this.rng(); };
  P.rand = function (a, b) { return a + Math.floor(this.r() * (b - a + 1)); };
  P.dice = function () { return this.rand(1, 6); };
  P.tile = function (id) { return this.s.tiles[id]; };
  P.cp = function () { return this.s.players[this.s.order[this.s.cur]]; };
  P.alive = function () { return this.s.players.filter(function (p) { return !p.bankrupt; }); };
  P.log = function (msg, kind) { this.s.log.push({ r: this.s.round, m: msg, k: kind || '' }); if (this.s.log.length > 300) this.s.log.shift(); if (this.io && this.io.log) this.io.log(msg, kind); };
  P.txid = function (kind) { return 'TX' + (++this.s.tx) + '-' + kind; };
  P.newDeck = function () {
    var ids = D.CARD_DEFS.map(function (c) { return c[0]; });
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(this.r() * (i + 1)); var t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    this.s.deck = ids; this.s.grid = ids.map(function () { return false; }); this.s.gridOwner = ids.map(function () { return -1; });
  };

  // ---------- Economy: values ----------
  P.ownedIn = function (owner, d) { var self = this; return this.s.districts[d].tiles.filter(function (id) { return self.s.tiles[id].owner === owner; }).length; };
  P.distMult = function (t) {
    if (t.owner < 0) return 1;
    var c = this.ownedIn(t.owner, t.district), n = this.s.districts[t.district].tiles.length;
    return (1 + C.distStep * (c - 1)) * (c >= n ? C.domination : 1);
  };
  P.dominated = function (t) { return t.owner >= 0 && this.ownedIn(t.owner, t.district) >= this.s.districts[t.district].tiles.length; };
  P.rawValue = function (t) { return (t.base + (t.invest || 0) + t.bonusVal) * (1 + t.bonusPct); };
  P.buyPrice = function (t) { return t.base; };
  P.baseValue = function (t) { return Math.round(this.rawValue(t)); };
  P.shopValue = function (t) { if (t.type !== 'shop' || t.owner < 0) return 0; return Math.round(this.rawValue(t) * this.distMult(t)); };
  P.valueAfterInvest = function (t, add) { return Math.round((t.base + (t.invest || 0) + add + t.bonusVal) * (1 + t.bonusPct) * this.distMult(t)); };
  P.maxCapital = function (t) { // remaining capital that can be invested in this shop
    if (t.owner < 0) return 0;
    var c = this.ownedIn(t.owner, t.district), cap = t.base * (C.capPerShop * c + 1) * (this.dominated(t) ? C.domination : 1);
    return Math.max(0, Math.round(cap - (t.invest || 0)));
  };
  P.priceFor = function (value) { var v = value / C.yieldScale; return value * (0.2 - 0.15 * Math.pow(0.2, 0.005 * v)); };
  P.refreshLevel = function (t) {
    if (t.type !== 'shop' || t.owner < 0) { t.level = 0; return; }
    var r = (t.base + (t.invest || 0)) / t.base, L = 1;
    C.levelRatio.forEach(function (x, i) { if (r >= x) L = i + 1; });
    t.level = Math.min(8, L);
  };
  P.refreshDistrictLevels = function (d) { var self = this; this.s.districts[d].tiles.forEach(function (id) { self.refreshLevel(self.s.tiles[id]); }); };
  P.eventMod = function (t) {
    var m = 1, s = this.s, self = this;
    s.effects.forEach(function (e) {
      if (e.kind !== 'rentMult') return;
      if (e.tile !== undefined && e.tile !== t.id) return;
      if (e.owner !== undefined && e.owner !== t.owner) return;
      if (e.district !== undefined && e.district !== t.district) return;
      if (e.hotels && t.level < 6) return;
      m *= e.mult;
    });
    // Market special building: +5% to its district
    s.tiles.forEach(function (v) { if (v.special === 'market' && v.near === t.district) m *= 1.05; });
    return m;
  };
  P.noRent = function (t) { return this.s.effects.some(function (e) { return e.kind === 'noRent' && e.tile === t.id; }); };
  P.shopRent = function (t) {
    if (t.type !== 'shop' || t.owner < 0) return 0;
    var r = Math.min(C.rentCap, Math.round(this.priceFor(this.shopValue(t)) * this.eventMod(t)));
    return isFinite(r) ? r : 0;
  };
  P.rentAfterInvest = function (t, add) { return Math.min(C.rentCap, Math.round(this.priceFor(this.valueAfterInvest(t, add)) * this.eventMod(t))); };
  P.districtValue = function (d) { var self = this; return this.s.districts[d].tiles.reduce(function (a, id) { var t = self.s.tiles[id]; return a + (t.owner >= 0 ? self.shopValue(t) : t.base); }, 0); };
  P.specialValue = function (p) { return this.s.tiles.reduce(function (a, t) { if (t.special && t.spOwner === p.id) { var b = D.SPECIAL_BUILDINGS.find(function (x) { return x.id === t.special; }); return a + b.cost; } return a; }, 0); };
  P.propertyValue = function (p) { var self = this; return this.s.tiles.reduce(function (a, t) { return a + (t.owner === p.id ? self.shopValue(t) : 0); }, 0) + this.specialValue(p); };
  P.stockValue = function (p) { var s = this.s; return p.shares.reduce(function (a, n, d) { return a + n * s.districts[d].price; }, 0); };
  P.netWorth = function (p) { return p.cash + p.safe + this.propertyValue(p) + this.stockValue(p); };
  P.shopsOf = function (p) { var id = p.id; return this.s.tiles.filter(function (t) { return t.type === 'shop' && t.owner === id; }); };
  P.salary = function (p) {
    var sal = C.baseSalary + p.level * C.salaryPerLevel + Math.floor(this.propertyValue(p) * C.salaryPropPct);
    var gardens = this.s.tiles.filter(function (t) { return t.special === 'garden' && t.spOwner === p.id; }).length;
    if (gardens) sal += Math.min(400 * gardens, Math.round(sal * 0.05 * gardens));
    return sal;
  };

  // ---------- Stock market ----------
  P.rules = function () { return (this.s.settings && this.s.settings.rules) || C.rules; };
  P.fairPrice = function (d) { var D0 = this.s.districts[d]; return this.districtValue(d) / (C.stockDiv * D0.tiles.length); };
  P.updateStock = function (d, why) {
    var D0 = this.s.districts[d]; if (D0.adj === undefined) D0.adj = 1;
    var old = D0.price; D0.price = Math.max(C.stock.min, Math.round(this.fairPrice(d) * D0.adj));
    if (D0.price !== old) { D0.hist.push(D0.price); if (D0.hist.length > 40) D0.hist.shift(); if (why) this.log('📈 หุ้น ' + D0.name + ' ' + (D0.price > old ? '▲' : '▼') + ' ' + old + ' → ' + D0.price + ' G (' + why + ')'); }
  };
  P.stockMove = function (d, pct, why) {
    var D0 = this.s.districts[d]; if (D0.adj === undefined) D0.adj = 1;
    if (pct < 0 && this.s.effects.some(function (e) { return e.kind === 'priceLock' && e.district === d; })) { this.log('🔒 Price Lock ป้องกันหุ้น ' + D0.name + ' ไม่ให้ลดลง'); return; }
    pct = clamp(pct, -C.stock.maxMove, C.stock.maxMove);
    D0.adj = clamp(D0.adj * (1 + pct), 0.3, 4);
    this.updateStock(d, why);
  };
  P.valueChanged = function (d) { this.refreshDistrictLevels(d); this.updateStock(d, 'มูลค่าเขตเปลี่ยน'); };
  P.buyFee = function (p) { return (!this.rules().tax || p.flags.stockFeeZero) ? 0 : C.stock.buyFee; };
  P.sellFee = function () { return this.rules().tax ? C.stock.sellFee : 0; };
  P.sharesAvail = function () { return 1e9; };
  P.maxBuyShares = function (p, d) { var price = this.s.districts[d].price; return Math.max(0, Math.min(C.maxStockBuy, Math.floor(p.cash / (price * (1 + this.buyFee(p)))))); };
  P.buyStock = function (p, d, n) {
    n = Math.floor(n); if (n <= 0) return false;
    if (n > this.maxBuyShares(p, d)) return false; // atomic guard
    var price = this.s.districts[d].price, cost = Math.ceil(n * price * (1 + this.buyFee(p)));
    p.cash -= cost; p.shares[d] += n; this.txid('buyStock');
    this.log('🧾 ' + p.name + ' ซื้อหุ้น ' + this.s.districts[d].name + ' ' + n + ' หุ้น (' + fmt(cost) + ' G)');
    if (n >= 10) this.stockMove(d, 0.03 + n / 2000, 'ซื้อหุ้นจำนวนมาก');
    return true;
  };
  P.sellStock = function (p, d, n) {
    n = Math.min(Math.floor(n), p.shares[d]); if (n <= 0) return 0;
    var price = this.s.districts[d].price, net = Math.floor(n * price * (1 - this.sellFee()));
    p.shares[d] -= n; p.cash += net; this.txid('sellStock');
    this.log('🧾 ' + p.name + ' ขายหุ้น ' + this.s.districts[d].name + ' ' + n + ' หุ้น (+' + fmt(net) + ' G)');
    if (n >= 10) this.stockMove(d, -(0.03 + n / 2000), 'ขายหุ้นจำนวนมาก');
    return net;
  };
  P.sellPreview = function (p, d, n) { var price = this.s.districts[d].price; return { net: Math.floor(n * price * (1 - this.sellFee())), newPrice: n >= 10 ? Math.max(C.stock.min, Math.round(price * (1 - 0.03 - n / 2000))) : price }; };
  P.giveShares = function (p, d, n) {
    if (n <= 0) return 0;
    p.shares[d] += n; this.log('🎁 ' + p.name + ' ได้รับหุ้นฟรี ' + this.s.districts[d].name + ' ' + n + ' หุ้น'); return n;
  };

  // ---------- Money ----------
  P.gain = async function (p, amt, why, event) {
    amt = Math.round(amt); if (amt <= 0) return 0;
    if (event) { var u = await this.offerReactive(p, 'gain', { amt: amt, why: why }); if (u) { var extra = Math.min(amt, 3000); amt += extra; this.log('✨ Double Coin! +' + fmt(extra) + ' G'); } }
    p.cash += amt; this.txid('gain'); this.log('💰 ' + p.name + ' +' + fmt(amt) + ' G' + (why ? ' (' + why + ')' : ''), 'gain');
    if (this.io && this.io.money) this.io.money(p, amt);
    return amt;
  };
  P.lose = async function (p, amt, why, event, toPool) {
    amt = Math.round(amt); if (amt <= 0) return 0;
    if (event) { var u = await this.offerReactive(p, 'lose', { amt: amt, why: why }); if (u) { this.log('👛 Safe Wallet ป้องกันการเสียเงิน ' + fmt(amt) + ' G'); return 0; } }
    p.cash -= amt; this.txid('lose'); if (toPool) this.s.taxPool += amt;
    this.log('💸 ' + p.name + ' -' + fmt(amt) + ' G' + (why ? ' (' + why + ')' : ''), 'lose');
    if (this.io && this.io.money) this.io.money(p, -amt);
    if (p.cash < 0) await this.resolveDebt(p);
    return amt;
  };
  P.resolveDebt = async function (p) {
    if (p.cash >= 0) return;
    var s = this.s, self = this, sold = [];
    // 1) safe deposit 2) stocks 3) special buildings 4) shops (cheapest first)
    if (p.safe > 0) { p.cash += p.safe; sold.push('บัญชีคุ้มครอง ' + fmt(p.safe)); p.safe = 0; }
    var order = s.districts.map(function (d, i) { return i; }).sort(function (a, b) { return p.shares[b] * s.districts[b].price - p.shares[a] * s.districts[a].price; });
    for (var k = 0; k < order.length && p.cash < 0; k++) {
      var d = order[k]; if (!p.shares[d]) continue;
      var per = s.districts[d].price * (1 - C.stock.sellFee), need = Math.ceil(-p.cash / per);
      var n = Math.min(p.shares[d], need); var net = this.sellStock(p, d, n); sold.push('หุ้น ' + s.districts[d].name + ' ' + n + ' หุ้น');
    }
    var specials = s.tiles.filter(function (t) { return t.special && t.spOwner === p.id; });
    while (p.cash < 0 && specials.length) { var t = specials.shift(); var b = D.SPECIAL_BUILDINGS.find(function (x) { return x.id === t.special; }); var v = Math.floor(b.cost * C.shopSellRate * (1 - C.shopSellFee)); p.cash += v; sold.push(b.th + ' ' + fmt(v)); t.special = null; t.spOwner = -1; }
    var shops = this.shopsOf(p).sort(function (a, b) { return self.shopValue(a) - self.shopValue(b); });
    while (p.cash < 0 && shops.length) { var sh = shops.shift(); var v2 = this.sellShopToBank(p, sh, true); sold.push(sh.name + ' ' + fmt(v2)); }
    if (sold.length && this.io && this.io.notify) await this.io.notify(p, '⚠️ ' + p.name + ' เงินสดติดลบ ระบบขายทรัพย์สินอัตโนมัติ', sold.join(' • '));
    if (p.cash < 0) await this.bankrupt(p);
  };
  P.sellShopToBank = function (p, t, forced) {
    var before = this.districtValue(t.district), v = Math.floor(this.shopValue(t) * C.shopSellRate * (1 - C.shopSellFee));
    p.cash += v; t.owner = -1; t.level = 0; t.invest = 0; t.bonusPct = 0; t.bonusVal = 0;
    this.s.effects = this.s.effects.filter(function (e) { return e.tile !== t.id; });
    this.txid('sellShop'); this.log('🏚️ ' + p.name + ' ขาย ' + t.name + ' ให้ธนาคาร +' + fmt(v) + ' G' + (forced ? ' (ชำระหนี้)' : ''));
    this.valueChanged(t.district); return v;
  };
  P.bankrupt = async function (p) {
    p.bankrupt = true; p.cash = 0; p.safe = 0;
    var self = this;
    this.s.tiles.forEach(function (t) { if (t.owner === p.id) { t.owner = -1; t.level = 0; t.invest = 0; t.bonusPct = 0; t.bonusVal = 0; } if (t.spOwner === p.id) { t.special = null; t.spOwner = -1; } });
    p.shares = p.shares.map(function () { return 0; });
    this.log('💥 ' + p.name + ' ล้มละลาย! ทรัพย์สินคืนสู่ตลาด', 'bad');
    if (this.io && this.io.notify) await this.io.notify(p, '💥 ' + p.name + ' ล้มละลาย', 'ร้านทั้งหมดถูกคืนเป็นของว่างเพื่อให้ผู้อื่นซื้อได้');
    var alive = this.alive(), self2 = this;
    if (alive.length === 1) this.finish(alive[0], 'ผู้เล่นคนอื่นล้มละลายทั้งหมด');
    else if (this.rules().endOnBankrupt) { var best = alive.sort(function (a, b) { return self2.netWorth(b) - self2.netWorth(a); })[0]; this.finish(best, p.name + ' ล้มละลาย — เกมจบ ผู้มีทรัพย์สินสูงสุดชนะ'); }
  };
  P.finish = function (winner, why) {
    if (this.s.over) return;
    var self = this;
    this.s.over = true; this.s.winner = winner ? winner.id : null; this.s.endReason = why;
    this.s.ranking = this.s.players.slice().sort(function (a, b) { if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1; if (winner && a.id === winner.id) return -1; if (winner && b.id === winner.id) return 1; return self.netWorth(b) - self.netWorth(a); }).map(function (p) { return { id: p.id, nw: self.netWorth(p) }; });
    this.log('🏆 เกมจบ: ' + (winner ? winner.name + ' ชนะ!' : '') + ' (' + why + ')', 'win');
  };

  // ---------- Effects ----------
  P.addEffect = function (e) { e.until = this.s.round + (e.rounds || 1) - 1; this.s.effects.push(e); };
  P.endRound = async function () {
    var s = this.s, self = this, r = s.round;
    var due = s.effects.filter(function (e) { return e.kind === 'smartInvest' && e.until <= r; });
    for (var i = 0; i < due.length; i++) { var p = s.players[due[i].owner]; if (!p.bankrupt) await this.gain(p, 500, 'Smart Investment', false); }
    s.effects = s.effects.filter(function (e) { return e.until > r; });
    s.players.forEach(function (p) { if (p.flags.upgDiscUntil && p.flags.upgDiscUntil <= r) { p.flags.upgDisc = 0; } });
    s.players.forEach(function (p) { p.hist.push(self.netWorth(p)); });
    s.round++;
    if (s.round > s.settings.maxRounds) {
      var best = this.alive().sort(function (a, b) { return self.netWorth(b) - self.netWorth(a); })[0];
      this.finish(best, 'ครบ ' + s.settings.maxRounds + ' รอบ — ทรัพย์สินสูงสุด');
    }
  };

  // ---------- Loadout items ----------
  P.itemDef = function (id) { return D.EQUIPMENT.find(function (e) { return e.id === id; }) || D.SPECIAL_CARDS.find(function (e) { return e.id === id; }); };
  P.loadoutSlots = function (p) { var out = p.loadout.eq.slice(); if (p.loadout.sc) out.push(p.loadout.sc); return out; };
  P.offerReactive = async function (p, when, ctx) {
    var slots = this.loadoutSlots(p);
    for (var i = 0; i < slots.length; i++) {
      var sl = slots[i], def = this.itemDef(sl.id); if (sl.used || !def || def.when !== when) continue;
      var ok = await this.io.confirmUse(p, def, ctx);
      if (ok) { sl.used = true; this.txid('item'); this.log('🎒 ' + p.name + ' ใช้ ' + def.name); return def.id; }
    }
    return null;
  };
  P.canUsePre = function (p, sl) { var def = this.itemDef(sl.id); return !sl.used && def && def.when === 'preRoll' && this.s.phase === 'preRoll' && this.cp() === p; };
  P.usePreRoll = async function (p, sl) {
    if (!this.canUsePre(p, sl)) return false;
    var def = this.itemDef(sl.id), s = this.s, self = this;
    sl.used = true; this.txid('item'); this.log('🎒 ' + p.name + ' ใช้ ' + def.name);
    switch (def.id) {
      case 'eq_golden': s.forcedDice = await this.io.chooseNumber(p, 'Golden Dice — เลือกแต้ม', 1, 6); break;
      case 'eq_stock': { var d = this.bestHeldDistrict(p); this.stockMove(d, 0.10, 'Stock Boost'); break; }
      case 'eq_travel': case 'SC_home': s.teleportBank = true; break;
      case 'SC_cash': await this.gain(p, 1500, 'Bonus Cash'); break;
      case 'SC_stock': { var d2 = this.bestShopDistrict(p); this.giveShares(p, d2, 20); this.valueChanged(d2, this.districtValue(d2)); break; }
      case 'SC_div': this.addEffect({ kind: 'divBonus', mult: 0.10, rounds: 3 }); this.log('💹 กองทุนปันผล +10% เป็นเวลา 3 รอบ'); break;
      case 'SC_value': { var sh = await this.pickOwnShop(p, 'เลือกร้านเพื่อเพิ่มมูลค่า +10%'); if (sh) { var b = this.districtValue(sh.district); sh.bonusPct += 0.10; this.valueChanged(sh.district, b); this.log('⭐ ' + sh.name + ' มูลค่า +10%'); } else { sl.used = false; } break; }
    }
    return true;
  };
  P.bestHeldDistrict = function (p) { var best = 0; p.shares.forEach(function (n, d) { if (n > p.shares[best]) best = d; }); if (!p.shares[best]) best = this.bestShopDistrict(p); return best; };
  P.bestShopDistrict = function (p) { var self = this, best = 0, bc = -1; this.s.districts.forEach(function (d, i) { var c = self.ownedIn(p.id, i); if (c > bc) { bc = c; best = i; } }); return best; };

  // ---------- Pickers (through io.choose) ----------
  P.choose = function (p, req) { return Promise.resolve(this.io.choose(p, req)); };
  P.pickDistrict = function (p, title, good) {
    var self = this;
    return this.choose(p, { title: title, kind: 'district', options: this.s.districts.map(function (d, i) {
      var mine = p.shares[i] * 3 + self.ownedIn(p.id, i) * 40, theirs = self.s.players.reduce(function (a, q) { return q.id === p.id ? a : a + q.shares[i] + self.ownedIn(q.id, i) * 30; }, 0);
      return { value: i, label: d.name, sub: 'หุ้น ' + d.price + ' G • คุณถือ ' + p.shares[i], color: d.color, score: good ? mine - theirs * 0.2 : theirs - mine * 2 };
    }) });
  };
  P.pickOwnShop = function (p, title, filter) {
    var self = this, list = this.shopsOf(p).filter(filter || function () { return true; });
    if (!list.length) return Promise.resolve(null);
    return this.choose(p, { title: title, kind: 'shop', options: list.map(function (t) { return { value: t.id, label: t.name, sub: 'Lv' + t.level + ' • มูลค่า ' + fmt(self.shopValue(t)), color: self.s.districts[t.district].color, score: self.shopValue(t) }; }) })
      .then(function (id) { return id === null || id === undefined ? null : self.tile(id); });
  };
  P.pickRivalShop = function (p, title) {
    var self = this, list = this.s.tiles.filter(function (t) { return t.type === 'shop' && t.owner >= 0 && t.owner !== p.id; });
    if (!list.length) return Promise.resolve(null);
    return this.choose(p, { title: title, kind: 'shop', options: list.map(function (t) { return { value: t.id, label: t.name, sub: self.s.players[t.owner].name + ' • ค่าเช่า ' + fmt(self.shopRent(t)), color: self.s.districts[t.district].color, score: self.shopRent(t) }; }) })
      .then(function (id) { return id === null || id === undefined ? null : self.tile(id); });
  };
  P.pickPlayer = function (p, title) {
    var self = this, list = this.alive().filter(function (q) { return q.id !== p.id; });
    if (!list.length) return Promise.resolve(null);
    return this.choose(p, { title: title, kind: 'player', options: list.map(function (q) { return { value: q.id, label: q.name, sub: 'เงินสด ' + fmt(q.cash), color: q.color, score: q.cash }; }) })
      .then(function (id) { return id === null || id === undefined ? null : self.s.players[id]; });
  };

  // ---------- Path helpers ----------
  P.nextOptions = function (pos, prev) { var t = this.tile(pos); var o = t.n.filter(function (x) { return x !== prev; }); return o.length ? o : t.n.slice(); };
  P.dist = function (from, to) { // BFS distance ignoring direction
    if (from === to) return 0; var seen = {}, q = [[from, 0]]; seen[from] = 1;
    while (q.length) { var c = q.shift(), t = this.tile(c[0]); for (var i = 0; i < t.n.length; i++) { var n = t.n[i]; if (n === to) return c[1] + 1; if (!seen[n]) { seen[n] = 1; q.push([n, c[1] + 1]); } } }
    return 99;
  };
  P.endpoints = function (pos, prev, steps) { // all (tile, path) reachable in exactly `steps` with no back-tracking
    var out = [], self = this;
    (function walk(p, pv, k, path) { if (k === 0) { out.push({ end: p, path: path }); return; } self.nextOptions(p, pv).forEach(function (n) { walk(n, p, k - 1, path.concat([n])); }); })(pos, prev, steps, []);
    return out;
  };
  P.bankId = function () { return this.s.tiles.find(function (t) { return t.type === 'bank'; }).id; };

  // ---------- TURN ----------
  P.playTurn = async function () {
    var s = this.s, p = this.cp(), io = this.io;
    if (s.over) return;
    if (p.bankrupt) { await this.nextPlayer(); return; }
    s.phase = 'preRoll'; s.forcedDice = null; s.teleportBank = false; p.flags.stockFeeZero = false; p.flags.investedTurn = 0;
    if (io.autosave) io.autosave(s);
    if (io.turnStart) await io.turnStart(p);
    await io.preRoll(p); // human: waits for roll button (may use items/sell); AI: decides & uses items
    if (s.over) return;
    if (s.teleportBank) {
      s.phase = 'move'; var from = p.pos; p.pos = this.bankId(); p.prev = null; if (io.teleport) await io.teleport(p, from, p.pos);
      await this.arriveBank(p, true);
    } else {
      s.phase = 'roll';
      var roll = s.forcedDice || (io.rollDice && !p.isAI ? await io.rollDice(p) : this.dice()); var forced = !!s.forcedDice; s.forcedDice = null;
      if (io.showDice && (p.isAI || forced || !io.rollDice)) await io.showDice(p, roll);
      s.phase = 'postRoll';
      for (var guard = 0; guard < 4; guard++) {
        var u = await this.offerReactive(p, 'postRoll', { roll: roll });
        if (!u) break;
        if (u === 'eq_lucky') { roll = io.rollDice && !p.isAI ? await io.rollDice(p) : this.dice(); this.log('🎲 ทอยใหม่ได้ ' + roll); if (io.showDice && p.isAI) await io.showDice(p, roll); }
        if (u === 'eq_move') roll += 1;
        if (u === 'SC_step') roll += 2;
      }
      s.phase = 'move';
      this.log('🎲 ' + p.name + ' ทอยได้ ' + roll + ' แต้ม');
      await this.move(p, roll);
      if (!s.over && !p.bankrupt) await this.land(p);
    }
    if (s.over) return;
    // property tax every N turns of this player
    p.turns++;
    if (!p.bankrupt && this.rules().tax && p.turns % C.propertyTaxEvery === 0) await this.propertyTax(p);
    if (s.over) return;
    await this.nextPlayer();
  };
  P.nextPlayer = async function () {
    var s = this.s; s.phase = 'idle'; s.turnNo++;
    s.cur++;
    if (s.cur >= s.order.length) { s.cur = 0; await this.endRound(); }
  };
  P.propertyTax = async function (p) {
    var dev = this.propertyValue(p); if (dev <= 0) return;
    var tax = Math.min(C.propertyTaxCap, Math.round(dev * C.propertyTaxPct));
    if (p.flags.taxExempt) { p.flags.taxExempt = 0; this.log('🧾 ' + p.name + ' ได้รับยกเว้นภาษีทรัพย์สิน (การ์ด)'); return; }
    var u = await this.offerReactive(p, 'tax', { amt: tax, kind: 'property' }); if (u) { this.log('🛡️ Tax Shield ป้องกันภาษีทรัพย์สิน'); return; }
    if (p.flags.taxHalf) { tax = Math.round(tax / 2); p.flags.taxHalf = 0; }
    await this.lose(p, tax, 'ภาษีทรัพย์สิน 1% ทุก ' + C.propertyTaxEvery + ' เทิร์น', false, true);
  };
  P.move = async function (p, steps, noLand) {
    var io = this.io;
    if (io.planPath && !p.isAI) {
      var path = await io.planPath(p, steps);
      for (var i = 0; i < path.length; i++) {
        p.prev = p.pos; p.pos = path[i];
        if (io.step) await io.step(p, path[i], path.length - 1 - i, true);
        await this.onPass(p, this.tile(path[i]), i === path.length - 1);
        if (this.s.over || p.bankrupt) return;
      }
      return;
    }
    for (var k = steps; k > 0; k--) {
      var opts = this.nextOptions(p.pos, p.prev), next = opts[0];
      if (opts.length > 1) next = await io.chooseDir(p, opts, k);
      p.prev = p.pos; p.pos = next;
      if (io.step) await io.step(p, next, k - 1);
      await this.onPass(p, this.tile(next), k === 1);
      if (this.s.over || p.bankrupt) return;
    }
  };
  P.moveBack = async function (p, steps) { // reverse direction
    for (var k = steps; k > 0; k--) { var opts = this.nextOptions(p.pos, null), back = p.prev !== null && opts.indexOf(p.prev) >= 0 ? p.prev : opts[0]; p.prev = p.pos; p.pos = back; if (this.io.step) await this.io.step(p, back, k - 1); }
  };
  P.onPass = async function (p, t, final) {
    if (t.type === 'bank') { await this.arriveBank(p, final); return; }
    if (t.type === 'suit' && !p.suits[t.suit]) { p.suits[t.suit] = true; this.log('🃏 ' + p.name + ' เก็บสัญลักษณ์ ' + D.SUIT_GLYPH[t.suit]); if (this.io.suit) await this.io.suit(p, t.suit); }
    if (t.special === 'toll' && t.spOwner >= 0 && t.spOwner !== p.id) {
      if (p.flags.freeRide) { p.flags.freeRide = 0; this.log('🚕 Free Ride — ไม่ต้องจ่ายค่าผ่านทาง'); }
      else { var fee = Math.min(500, 100 + 20 * Math.floor(this.s.round / 2)); var owner = this.s.players[t.spOwner]; await this.lose(p, fee, 'ค่าผ่านทาง ' + owner.name); if (!owner.bankrupt) owner.cash += fee; }
    }
  };
  P.arriveBank = async function (p, stopped) {
    var s = this.s;
    if (SUITS_DONE(p)) {
      var sal = this.salary(p); p.suits = {}; p.level = Math.min(C.maxLevel, p.level + 1); p.promotions++;
      this.log('🎉 ' + p.name + ' เลื่อนระดับเป็น Lv.' + p.level + ' รับเงินเดือน ' + fmt(sal) + ' G', 'gain');
      p.cash += sal; this.txid('salary');
      if (this.io.promotion) await this.io.promotion(p, sal);
    }
    if (p.safe > 0) { var back = Math.round(p.safe * 1.05); this.log('🏦 คืนเงินบัญชีคุ้มครอง ' + fmt(back) + ' G'); p.cash += back; p.safe = 0; }
    if (this.netWorth(p) >= s.settings.target) { this.finish(p, 'ทรัพย์สินถึงเป้าหมาย ' + fmt(s.settings.target) + ' G และกลับถึงธนาคาร'); return; }
    s.phase = 'bank';
    await this.io.bank(p, stopped); // buy stocks (and upgrade any shop when stopped)
    s.phase = 'move';
    if (stopped) p.prev = null; // free direction next turn
  };

  // ---------- LANDING ----------
  P.land = async function (p) {
    var t = this.tile(p.pos), io = this.io, s = this.s, self = this;
    s.phase = 'land';
    if (io.landed) await io.landed(p, t);
    switch (t.type) {
      case 'bank': break; // handled in arriveBank
      case 'shop': await this.landShop(p, t); break;
      case 'suit': this.log('🃏 ' + p.name + ' หยุดตรงช่องสัญลักษณ์พอดี — ได้เปิดการ์ด!', 'card'); await this.drawChance(p); break;
      case 'chance': await this.drawChance(p); break;
      case 'lucky': { var amt = Math.max(C.luckyMin, Math.floor(s.taxPool * 0.5)); s.taxPool = Math.max(0, s.taxPool - amt); await this.gain(p, amt, 'ช่อง Lucky (กองภาษีเมือง)', true); break; }
      case 'superlucky': { var amt2 = Math.max(C.superLuckyMin, s.taxPool); s.taxPool = 0; await this.gain(p, amt2, 'ช่อง Super Lucky (กองภาษีทั้งหมด)', true); break; }
      case 'tax': {
        var tax = Math.min(C.taxTile.cap, Math.max(C.taxTile.flat, Math.round(p.cash * C.taxTile.pct)));
        var u = await this.offerReactive(p, 'tax', { amt: tax }); if (u) { this.log('🛡️ Tax Shield ป้องกันภาษี'); break; }
        if (p.flags.taxHalf) { tax = Math.round(tax / 2); p.flags.taxHalf = 0; }
        await this.lose(p, tax, 'ช่องภาษี', false, true); break;
      }
      case 'casino': await this.casino(p); break;
      case 'broker': await io.broker(p); break;
      case 'vacant': await this.landVacant(p, t); break;
      case 'warp': { var from = p.pos; p.pos = t.warpTo; p.prev = null; this.log('🌀 ' + p.name + ' วาร์ปไปอีกเกาะ'); if (io.teleport) await io.teleport(p, from, p.pos); break; }
      case 'rest': await this.gain(p, C.restBonus, 'พักผ่อน'); break;
      case 'festival': {
        if (this.r() < 0.6) await this.gain(p, this.rand(3, 8) * 100, 'เทศกาล: ขายของได้', true);
        else { var others = this.alive().filter(function (q) { return q.id !== p.id; }); var each = 100; this.log('🎏 ' + p.name + ' เป็นเจ้าภาพงานเทศกาล จ่ายคนละ 100 G'); var paid = await this.lose(p, each * others.length, 'เจ้าภาพเทศกาล', true); if (paid) others.forEach(function (q) { q.cash += each; }); }
        break;
      }
      case 'event': { var ev = 81 + Math.floor(this.r() * 10); await this.applyCard(p, ev); break; }
    }
  };
  P.landShop = async function (p, t) {
    var io = this.io, s = this.s, self = this;
    if (t.owner < 0) {
      var price = this.buyPrice(t), disc = [];
      if (p.flags.newBranch) { price = Math.max(0, price - 500); disc.push('New Branch -500'); }
      if (p.flags.winterSale) { price = Math.round(price * 0.9); disc.push('Winter Sale -10%'); }
      if (p.cash < price) { this.log(p.name + ' เงินไม่พอซื้อ ' + t.name); if (io.info) await io.info(p, t, 'เงินไม่พอซื้อร้านนี้'); return; }
      var yes = await io.confirmBuy(p, t, price, disc);
      if (!yes) return;
      var u = await this.offerReactive(p, 'buy', { price: price }); if (u) price = Math.round(price * 0.7);
      if (p.cash < price) return;
      var before = this.districtValue(t.district);
      p.cash -= price; t.owner = p.id; t.invest = 0; this.txid('buyShop');
      p.flags.newBranch = 0; p.flags.winterSale = 0;
      this.log('🏠 ' + p.name + ' ซื้อ ' + t.name + ' (' + fmt(price) + ' G)', 'buy');
      this.valueChanged(t.district, before);
      if (io.built) await io.built(p, t);
      return;
    }
    if (t.owner === p.id) { await this.offerInvest(p, t); return; }
    // rival shop: pay rent
    var owner = s.players[t.owner], rent = this.shopRent(t);
    if (this.noRent(t)) { this.log('🔧 ' + t.name + ' ปิดปรับปรุง — ไม่เก็บค่าเช่า'); rent = 0; }
    if (rent > 0) {
      var shielded = false;
      if (p.flags.rentShield > 0) { p.flags.rentShield--; shielded = true; this.log('🛡️ ' + p.name + ' ใช้การ์ด Rent Shield'); }
      else { var used = await this.offerReactive(p, 'rent', { rent: rent, tile: t }); if (used) { shielded = true; this.log('🛡️ ' + p.name + ' ใช้ ' + used + ' ไม่ต้องจ่ายค่าเช่า'); } }
      if (!shielded) {
        if (p.flags.rentHalf) { rent = Math.round(rent / 2); p.flags.rentHalf = 0; this.log('⚖️ Rent Dispute ลดค่าเช่า 50%'); }
        await this.payRent(p, owner, t, rent);
      }
    }
    if (s.over || p.bankrupt || owner.bankrupt || t.owner !== owner.id) return;
    // buyout (5x)
    var cost = Math.round(this.shopValue(t) * C.buyoutMult * (1 - (p.flags.buyoutDisc || 0)));
    if (p.cash >= cost) {
      var go = await io.confirmBuyout(p, t, cost);
      if (go) {
        if (owner.flags.shopProtect) { owner.flags.shopProtect--; this.log('🛡️ ' + owner.name + ' มี Shop Protection — ซื้อกิจการไม่สำเร็จ'); if (io.info) await io.info(p, t, owner.name + ' ป้องกันการซื้อกิจการ'); return; }
        var b1 = this.districtValue(t.district);
        p.cash -= cost; owner.cash += Math.round(cost * 0.6); p.flags.buyoutDisc = 0; this.txid('buyout');
        t.owner = p.id;
        this.log('🤝 ' + p.name + ' ซื้อกิจการ ' + t.name + ' จาก ' + owner.name + ' ' + fmt(cost) + ' G', 'buy');
        this.valueChanged(t.district, b1);
        if (io.built) await io.built(p, t);
      }
    }
  };
  P.payRent = async function (p, owner, t, rent) {
    var s = this.s, tx = this.txid('rent');
    var city = this.rules().tax ? Math.floor(rent * C.split.city) : 0, ownerInc = rent - city;
    this.log('🏪 ' + p.name + ' จ่ายค่าเช่า ' + t.name + ' ' + fmt(rent) + ' G → ' + owner.name + ' ' + fmt(ownerInc) + ' G', 'rent');
    if (this.io.rent) await this.io.rent(p, owner, t, rent, ownerInc, city);
    p.cash -= rent; owner.cash += ownerInc; s.taxPool += city;
    // dividends: 20% of the price, paid by the bank, split among the district's stockholders by share ratio
    if (!s.paidTx) s.paidTx = {};
    if (!s.paidTx[tx]) {
      s.paidTx[tx] = 1;
      var pct = Math.min(C.maxDividendPool, C.dividendPct + s.effects.filter(function (e) { return e.kind === 'divBonus'; }).reduce(function (a, e) { return a + e.mult; }, 0));
      var pool = rent * pct, total = s.players.reduce(function (a, q) { return a + (q.bankrupt ? 0 : q.shares[t.district]); }, 0), dist = [];
      if (total > 0) s.players.forEach(function (q) {
        if (q.bankrupt || !q.shares[t.district]) return;
        var boost = s.effects.some(function (e) { return e.kind === 'divBoost' && e.owner === q.id; }) ? 1.5 : 1;
        var amt = Math.floor(pool * q.shares[t.district] / total * boost);
        if (amt > 0) { q.cash += amt; dist.push(q.name + ' +' + fmt(amt)); }
      });
      if (dist.length) { this.log('💹 ปันผล ' + s.districts[t.district].name + ': ' + dist.join(', '), 'div'); if (this.io.dividend) await this.io.dividend(t, dist); }
      var keys = Object.keys(s.paidTx); if (keys.length > 200) delete s.paidTx[keys[0]];
    }
    if (p.cash < 0) await this.resolveDebt(p);
  };
  // ---------- INVEST (Fortune Street: land on your shop → invest in your shops of that district) ----------
  P.investDiscount = function (p) { var d = 1; if (p.flags.upgDisc) d *= (1 - p.flags.upgDisc); if (p.flags.builderDisc) d *= 0.8; return d; };
  P.investOptions = function (p, t) {
    var self = this, left = Math.max(0, C.investCap - (p.flags.investedTurn || 0));
    var list = this.shopsOf(p).filter(function (x) { return x.district === t.district; }).map(function (x) {
      var blocked = self.s.effects.some(function (e) { return e.kind === 'noUpgrade' && e.tile === x.id; });
      return { tile: x, cap: blocked ? 0 : self.maxCapital(x), blocked: blocked };
    });
    return { list: list, turnLeft: left, cash: p.cash, disc: this.investDiscount(p), free: p.flags.freeUpgrade ? 1000 : 0, hotel: p.flags.hotelDisc ? 500 : 0 };
  };
  P.investCost = function (p, amount) { var c = amount * this.investDiscount(p); if (p.flags.freeUpgrade) c -= 1000; if (p.flags.hotelDisc) c -= 500; return Math.max(0, Math.round(c)); };
  P.maxInvest = function (p, t) { // max amount of capital for this shop given cash, cap and per-turn limit
    var cap = Math.min(this.maxCapital(t), Math.max(0, C.investCap - (p.flags.investedTurn || 0)));
    for (var a = cap; a > 0; a -= 10) if (this.investCost(p, a) <= p.cash) return a;
    return 0;
  };
  P.offerInvest = async function (p, t) {
    for (var guard = 0; guard < 8; guard++) {
      var o = this.investOptions(p, t);
      if (!o.list.some(function (x) { return x.cap > 0; })) { if (guard === 0 && this.io.info && !p.isAI) await this.io.info(p, t, 'ร้านในเขตนี้ลงทุนเต็มแล้ว — ซื้อร้านในเขตเดียวกันเพิ่มเพื่อขยายทุนสูงสุด'); return; }
      if (o.turnLeft <= 0 || p.cash <= 0) return;
      var pick = await this.io.chooseInvest(p, t, o);
      if (!pick || !pick.amount) return;
      if (!(await this.doInvest(p, this.tile(pick.id), pick.amount))) return;
      if (this.s.over) return;
    }
  };
  P.doInvest = async function (p, t, amount) {
    if (t.owner !== p.id) return false;
    amount = Math.min(Math.round(amount), this.maxInvest(p, t)); if (amount <= 0) return false;
    var cost = this.investCost(p, amount);
    var u = await this.offerReactive(p, 'upgrade', { tile: t, cost: cost });
    if (u === 'eq_upg') cost = Math.round(cost * 0.7);
    if (u === 'SC_upg') cost = Math.max(0, cost - 1500);
    if (p.cash < cost) return false; // atomic
    var oldRent = this.shopRent(t), oldLv = t.level;
    p.cash -= cost; t.invest = (t.invest || 0) + amount; p.flags.investedTurn = (p.flags.investedTurn || 0) + amount; this.txid('invest');
    p.flags.freeUpgrade = 0; p.flags.builderDisc = 0; p.flags.hotelDisc = 0;
    this.valueChanged(t.district);
    this.log('🏗️ ' + p.name + ' ลงทุน ' + t.name + ' ' + fmt(amount) + ' G (จ่าย ' + fmt(cost) + ') ค่าเช่า ' + fmt(oldRent) + ' → ' + fmt(this.shopRent(t)) + ' G' + (t.level > oldLv ? ' • ขยายเป็น ' + C.levelName[t.level] : ''), 'buy');
    if (this.io.built) await this.io.built(p, t, oldLv);
    return true;
  };
  // compatibility helpers used by cards / UI
  P.levelCap = function (t) { return t.owner < 0 ? 0 : 8; };
  P.upgradeCostRaw = function (t) { return Math.round(t.base * 0.5); };
  P.doUpgrade = async function (p, t) { return this.doInvest(p, t, Math.min(this.maxInvest(p, t), Math.round(t.base * 0.5))); };
  P.landVacant = async function (p, t) {
    if (!t.special) {
      var opts = D.SPECIAL_BUILDINGS.map(function (b) { return { b: b, cost: Math.max(0, b.cost - (p.flags.vacantDisc || 0)) }; }).filter(function (o) { return o.cost <= p.cash; });
      if (!opts.length) return;
      var pick = await this.io.chooseBuilding(p, t, opts);
      if (!pick) return;
      var o = opts.find(function (x) { return x.b.id === pick; }); if (!o || p.cash < o.cost) return;
      p.cash -= o.cost; t.special = o.b.id; t.spOwner = p.id; p.flags.vacantDisc = 0; this.txid('build');
      this.log('🏗️ ' + p.name + ' สร้าง ' + o.b.th + ' บนที่ดินเปล่า (' + fmt(o.cost) + ' G)', 'buy');
      if (this.io.built) await this.io.built(p, t);
      return;
    }
    if (t.spOwner === p.id || t.spOwner < 0) return;
    var owner = this.s.players[t.spOwner], fee = { parking: 400, hotel: 500, onsen: 600 }[t.special] || 0;
    if (fee) { var paid = await this.lose(p, fee, 'ค่าบริการ ' + t.special + ' ของ ' + owner.name); if (!owner.bankrupt) owner.cash += paid; }
  };
  P.casino = async function (p) {
    var bet = await this.io.casinoBet(p, C.casino.bets.filter(function (b) { return b <= p.cash; }));
    if (!bet) return;
    var syms = ['🍒', '🔔', '⭐', '🐻', '7'], reels = [0, 0, 0].map(function () { return syms[Math.floor(this.r() * syms.length)]; }, this);
    var win = 0;
    if (reels[0] === reels[1] && reels[1] === reels[2]) win = bet * (reels[0] === '7' ? 5 : reels[0] === '🐻' ? 4 : 3);
    else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) win = Math.round(bet * 1.5);
    win = Math.min(win, C.casino.maxWin);
    p.cash -= bet; this.s.taxPool += Math.round(bet * 0.2); this.txid('casino');
    if (this.io.casinoShow) await this.io.casinoShow(p, reels, bet, win);
    if (win) { p.cash += win; this.log('🎰 ' + p.name + ' ชนะคาสิโน +' + fmt(win) + ' G', 'gain'); } else this.log('🎰 ' + p.name + ' เสียเดิมพัน ' + bet + ' G');
  };

  // ---------- CHANCE CARDS ----------
  P.drawChance = async function (p) {
    var s = this.s;
    if (s.grid.every(Boolean)) { this.newDeck(); this.log('🔄 สับกองการ์ดใหม่'); }
    var cell = await this.io.pickCard(p, s.grid.slice());
    if (s.grid[cell]) cell = s.grid.indexOf(false);
    s.grid[cell] = true; if (!s.gridOwner) s.gridOwner = s.grid.map(function () { return -1; }); s.gridOwner[cell] = p.id;
    var run = this.cardRun(cell, p.id);
    await this.applyCard(p, s.deck[cell], cell);
    if (run >= 3 && !s.over && !p.bankrupt) {
      var bonus = C.cardLine[Math.min(10, run)] || 0;
      this.log('🌈 ' + p.name + ' ต่อแถวสีของตัวเองได้ ' + run + ' ช่อง! โบนัส ' + fmt(bonus) + ' G', 'gain');
      if (this.io.lineBonus) await this.io.lineBonus(p, run, bonus, this.cardRunCells(cell, p.id));
      p.cash += bonus; this.txid('cardLine');
    }
  };
  // longest straight run (row/col/diagonal) of one player's colour through a grid cell
  P.cardRunCells = function (cell, pid) {
    var o = this.s.gridOwner, r0 = Math.floor(cell / 10), c0 = cell % 10, best = [cell];
    [[0, 1], [1, 0], [1, 1], [1, -1]].forEach(function (d) {
      var cells = [cell];
      [1, -1].forEach(function (sg) { var r = r0 + d[0] * sg, c = c0 + d[1] * sg; while (r >= 0 && r < 10 && c >= 0 && c < 10 && o[r * 10 + c] === pid) { cells.push(r * 10 + c); r += d[0] * sg; c += d[1] * sg; } });
      if (cells.length > best.length) best = cells;
    });
    return best;
  };
  P.cardRun = function (cell, pid) { return this.cardRunCells(cell, pid).length; };
  P.cardDef = function (id) { var c = D.CARD_DEFS.find(function (x) { return x[0] === id; }); return { id: c[0], name: c[1], desc: c[2], cat: c[3], art: c[4], neg: !!c[5] }; };
  P.applyCard = async function (p, id, cell) {
    var c = this.cardDef(id), s = this.s, tx = this.txid('card' + id);
    s.cardHistory.push({ r: s.round, p: p.id, id: id }); if (s.cardHistory.length > 100) s.cardHistory.shift();
    this.log('🃏 ' + p.name + ' เปิดการ์ด #' + id + ' ' + c.name + ': ' + c.desc, 'card');
    if (this.io.showCard) await this.io.showCard(p, c, cell);
    if (c.neg) {
      if (p.flags.insurance > 0) { p.flags.insurance--; this.log('🛡️ Insurance ป้องกันผลเสียของการ์ด'); if (this.io.toast) this.io.toast('🛡️ Insurance ป้องกันผลเสีย!'); return; }
      var u = await this.offerReactive(p, 'negative', { card: c }); if (u) { this.log('🛡️ ป้องกันผลเสียด้วย ' + u); return; }
    }
    var fx = CARD_FX[id]; if (fx) await fx(this, p, c);
  };

  var CARD_FX = {};
  function gainFx(n) { return function (g, p, c) { return g.gain(p, n, c.name, true); }; }
  CARD_FX[1] = gainFx(500); CARD_FX[2] = gainFx(1000); CARD_FX[3] = gainFx(2000); CARD_FX[5] = gainFx(3000); CARD_FX[9] = gainFx(500);
  CARD_FX[4] = function (g, p, c) { return g.gain(p, g.rand(5, 30) * 100, c.name, true); };
  CARD_FX[6] = function (g, p, c) { return g.gain(p, Math.min(1000, Math.round(Math.max(0, p.cash) * 0.05)), c.name, true); };
  CARD_FX[7] = function (g, p, c) { return g.gain(p, Math.min(2000, 500 * g.shopsOf(p).length), c.name, true); };
  CARD_FX[8] = async function (g, p, c) { var d = await g.pickDistrict(p, 'เลือกเขตเพื่อรับหุ้นฟรี 5 หุ้น', true); g.giveShares(p, d, 5); };
  CARD_FX[10] = function (g, p, c) { return g.gain(p, g.rand(10, 50) * 100, c.name, true); };
  CARD_FX[11] = function (g, p) { g.addEffect({ kind: 'rentMult', owner: p.id, mult: 1.10, rounds: 1 }); };
  CARD_FX[12] = async function (g, p) { var t = await g.pickOwnShop(p, 'เลือกร้านเพิ่มมูลค่า 500 G'); if (t) { var b = g.districtValue(t.district); t.bonusVal += 500; g.valueChanged(t.district, b); } };
  CARD_FX[13] = function (g, p, c) { return g.gain(p, Math.min(1500, 300 * g.shopsOf(p).length), c.name, true); };
  CARD_FX[14] = async function (g, p) {
    var t = await g.pickOwnShop(p, 'Free Renovation — ลงทุนครึ่งราคา', function (t) { return g.maxCapital(t) > 0; }); if (!t) return;
    var amt = Math.min(g.maxCapital(t), t.base), cost = Math.round(amt * 0.5); if (p.cash < cost) { g.log('เงินไม่พอสำหรับ Free Renovation'); return; }
    p.cash -= cost; t.invest += amt; g.valueChanged(t.district); g.log('🏗️ ' + t.name + ' ลงทุน ' + fmt(amt) + ' G (จ่ายครึ่งราคา ' + fmt(cost) + ' G)'); if (g.io.built) await g.io.built(p, t);
  };
  CARD_FX[15] = async function (g, p) { var t = await g.pickOwnShop(p, 'เลือกร้านโปรโมชันค่าเช่า +20%'); if (t) g.addEffect({ kind: 'rentMult', tile: t.id, mult: 1.2, rounds: 2 }); };
  CARD_FX[16] = function (g, p, c) { if (g.shopsOf(p).length >= 2) return g.gain(p, 1000, c.name, true); g.log('ต้องมีร้านอย่างน้อย 2 แห่ง'); };
  CARD_FX[17] = function (g, p) { p.flags.upgDisc = 0.2; p.flags.upgDiscUntil = g.s.round + 1; };
  CARD_FX[18] = function (g, p, c) { if (g.shopsOf(p).length) return g.gain(p, 500, c.name, true); g.log('ไม่มีร้าน — ไม่มีผล'); };
  CARD_FX[19] = function (g, p) { p.flags.newBranch = 1; };
  CARD_FX[20] = async function (g, p) { var d = await g.pickDistrict(p, 'เลือกเขต Business Boom', true); var b = g.districtValue(d); g.shopsOf(p).forEach(function (t) { if (t.district === d) t.bonusPct += 0.05; }); g.valueChanged(d, b); };
  CARD_FX[21] = gainFx(500);
  CARD_FX[22] = function (g, p) { p.flags.builderDisc = 1; };
  CARD_FX[23] = function (g, p) { p.flags.freeUpgrade = 1; };
  CARD_FX[24] = function (g, p) { p.flags.vacantDisc = 1000; };
  CARD_FX[25] = function (g, p) { p.flags.maintHalf = g.s.round + 1; };
  CARD_FX[26] = function (g, p) { var ds = {}; g.shopsOf(p).forEach(function (t) { if (!(t.district in ds)) ds[t.district] = g.districtValue(t.district); t.bonusPct += 0.05; }); Object.keys(ds).forEach(function (d) { g.valueChanged(+d, ds[d]); }); };
  CARD_FX[27] = function (g, p) { g.addEffect({ kind: 'smartInvest', owner: p.id, rounds: 1 }); };
  CARD_FX[28] = async function (g, p) { var l = g.shopsOf(p); if (!l.length) return; var t = l[Math.floor(g.r() * l.length)]; g.addEffect({ kind: 'noUpgrade', tile: t.id, rounds: 1 }); g.log('🚧 ' + t.name + ' อัปเกรดไม่ได้ 1 รอบ'); };
  function maint(n) { return function (g, p, c) { if (p.flags.maintFree) { p.flags.maintFree = 0; g.log('ยกเว้นค่าบำรุงรักษา'); return; } if (p.flags.maintHalf && p.flags.maintHalf >= g.s.round) n = Math.round(n / 2); return g.lose(p, n, c.name, true, true); }; }
  CARD_FX[29] = maint(300); CARD_FX[96] = maint(500);
  CARD_FX[30] = function (g, p, c) { if (g.shopsOf(p).length) return g.gain(p, 1000, c.name, true); };
  function hotels(g, p) { return g.shopsOf(p).filter(function (t) { return t.level >= 6; }); }
  CARD_FX[31] = function (g, p, c) { if (hotels(g, p).length) return g.gain(p, 1000, c.name, true); g.log('ยังไม่มีโรงแรม (Lv6+)'); };
  CARD_FX[32] = function (g) { g.addEffect({ kind: 'rentMult', hotels: true, mult: 1.15, rounds: 1 }); };
  CARD_FX[33] = gainFx(500);
  CARD_FX[34] = function (g, p) { p.flags.hotelDisc = 1; };
  CARD_FX[35] = function (g, p, c) { if (hotels(g, p).length) return g.gain(p, 1500, c.name, true); g.log('ยังไม่มีโรงแรม'); };
  CARD_FX[36] = function (g, p) { var h = hotels(g, p); if (h.length) g.addEffect({ kind: 'noRent', tile: h[0].id, rounds: 1 }); };
  CARD_FX[37] = async function (g, p) { var d = await g.pickDistrict(p, 'เลือกเขต Travel Promotion', true); var b = g.districtValue(d); hotels(g, p).forEach(function (t) { if (t.district === d) t.bonusPct += 0.05; }); g.valueChanged(d, b); };
  CARD_FX[38] = function (g, p, c) { var n = hotels(g, p).length + g.s.tiles.filter(function (t) { return t.spOwner === p.id && (t.special === 'hotel' || t.special === 'onsen'); }).length; if (n) return g.gain(p, 300 * n, c.name, true); };
  CARD_FX[39] = function (g, p, c) { if (g.shopsOf(p).some(function (t) { return t.level >= 5; })) return g.gain(p, 2000, c.name, true); };
  CARD_FX[40] = function (g) { g.addEffect({ kind: 'rentMult', hotels: true, mult: 1.2, rounds: 1 }); };
  CARD_FX[41] = async function (g, p) { var d = await g.pickDistrict(p, 'Market Rise: เลือกเขต +10%', true); g.stockMove(d, 0.10, 'Market Rise'); };
  CARD_FX[42] = async function (g, p) { var d = await g.pickDistrict(p, 'Market Fall: เลือกเขต -10%', false); g.stockMove(d, -0.10, 'Market Fall'); };
  CARD_FX[43] = function (g, p) { g.addEffect({ kind: 'divBoost', owner: p.id, rounds: 1 }); };
  CARD_FX[44] = async function (g, p) { var d = await g.pickDistrict(p, 'เลือกเขตรับหุ้นฟรี 10 หุ้น', true); g.giveShares(p, d, 10); };
  CARD_FX[45] = function (g, p, c) { var n = p.shares.reduce(function (a, b) { return a + b; }, 0); var v = Math.min(2000, Math.floor(n / 50) * 500); if (v) return g.gain(p, v, c.name, true); };
  CARD_FX[46] = function (g, p) { p.flags.stockFeeZero = true; };
  CARD_FX[47] = async function (g, p) { var d = await g.pickDistrict(p, 'Market Panic: เลือกเขต -5%', false); g.stockMove(d, -0.05, 'Market Panic'); };
  CARD_FX[48] = function (g) { g.s.districts.forEach(function (d, i) { g.stockMove(i, 0.03, 'Bull Market'); }); };
  CARD_FX[49] = function (g) { g.s.districts.forEach(function (d, i) { g.stockMove(i, -0.03, 'Bear Market'); }); };
  CARD_FX[50] = function (g, p, c) { if (p.shares.filter(Boolean).length >= 3) return g.gain(p, 1000, c.name, true); };
  async function cardMove(g, p, n) { await g.move(p, n); if (!g.s.over && !p.bankrupt) await g.land(p); }
  CARD_FX[51] = function (g, p) { return cardMove(g, p, 2); };
  CARD_FX[52] = function (g, p) { return cardMove(g, p, 3); };
  CARD_FX[53] = async function (g, p) { var n = await g.io.chooseNumber(p, 'Short Route — เดินเพิ่มกี่ช่อง?', 1, 3); return cardMove(g, p, n); };
  async function jumpTo(g, p, list, title) {
    if (!list.length) return;
    var id = await g.choose(p, { title: title, kind: 'tile', options: list.map(function (t) { return { value: t.id, label: t.name + (t.type === 'shop' ? (t.owner >= 0 ? ' (' + g.s.players[t.owner].name + ')' : ' (ว่าง)') : ''), color: t.district >= 0 ? g.s.districts[t.district].color : '#ccc', score: g.landScore ? g.landScore(p, t) : 0 }; }) });
    var from = p.pos; p.pos = id; p.prev = null; if (g.io.teleport) await g.io.teleport(p, from, id);
    var t = g.tile(id); if (t.type === 'bank') await g.arriveBank(p, true); else await g.land(p);
  }
  CARD_FX[54] = function (g, p) { var near = g.s.tiles.filter(function (t) { var d = g.dist(p.pos, t.id); return d > 0 && d <= 6; }); return jumpTo(g, p, near, 'Taxi — เลือกช่องปลายทาง (≤6 ช่อง)'); };
  function travelPoints(g) { return g.s.tiles.filter(function (t) { return t.type === 'bank' || t.type === 'broker' || t.type === 'warp' || t.type === 'casino'; }); }
  CARD_FX[55] = function (g, p) { return jumpTo(g, p, g.s.tiles.filter(function (t) { return t.type === 'broker'; }), 'Train — ไปสถานี Stock Broker'); };
  CARD_FX[56] = function (g, p) { var w = g.s.tiles.filter(function (t) { return t.type === 'warp'; }); return jumpTo(g, p, w.length ? w : [g.tile(g.bankId())], 'Harbor Trip'); };
  CARD_FX[57] = async function (g, p) { await g.moveBack(p, 2); await g.land(p); };
  CARD_FX[58] = function (g, p) { return jumpTo(g, p, travelPoints(g), 'Fast Travel — เลือกจุดเดินทาง'); };
  CARD_FX[59] = function (g, p) { p.prev = null; };
  CARD_FX[60] = function (g, p) { p.flags.freeRide = 1; };
  CARD_FX[61] = async function (g, p) {
    var mine = g.shopsOf(p); if (!mine.length) { g.log('ไม่มีร้านสำหรับแลกเปลี่ยน'); return; }
    var their = await g.pickRivalShop(p, 'Trade Offer — เลือกร้านคู่แข่งที่ต้องการ'); if (!their) return;
    var my = await g.pickOwnShop(p, 'เลือกร้านของคุณที่จะแลก'); if (!my) return;
    var diff = Math.max(0, g.shopValue(their) - g.shopValue(my)); var q = g.s.players[their.owner];
    if (p.cash < diff) { g.log('เงินไม่พอจ่ายส่วนต่าง'); return; }
    var ok = await g.io.confirmDeal(q, 'แลกร้าน ' + their.name + ' ↔ ' + my.name + (diff ? ' + เงิน ' + fmt(diff) + ' G' : ''), g.shopValue(my) + diff - g.shopValue(their));
    if (!ok) { g.log(q.name + ' ปฏิเสธการแลกเปลี่ยน'); return; }
    var b1 = g.districtValue(their.district), b2 = g.districtValue(my.district);
    p.cash -= diff; q.cash += diff; their.owner = p.id; my.owner = q.id; g.txid('trade');
    g.log('🔁 ' + p.name + ' แลก ' + my.name + ' กับ ' + their.name + ' ของ ' + q.name); g.valueChanged(their.district, b1); g.valueChanged(my.district, b2);
  };
  CARD_FX[62] = async function (g, p) {
    var t = await g.pickOwnShop(p, 'Business Auction — เลือกร้านที่จะประมูล'); if (!t) return;
    var base = Math.round(g.shopValue(t) * 0.75), best = null, bid = base;
    var others = g.alive().filter(function (q) { return q.id !== p.id; });
    for (var i = 0; i < others.length; i++) { var q = others[i]; var b = await g.io.auctionBid(q, t, bid); if (b && b > bid && b <= q.cash) { best = q; bid = b; } }
    if (!best) { g.log('ไม่มีผู้เสนอราคา — ยกเลิกการประมูล'); return; }
    var b1 = g.districtValue(t.district); best.cash -= bid; p.cash += bid; t.owner = best.id; g.txid('auction');
    g.log('🔨 ' + best.name + ' ชนะประมูล ' + t.name + ' ' + fmt(bid) + ' G'); g.valueChanged(t.district, b1);
  };
  CARD_FX[63] = function (g, p) { p.flags.buyoutDisc = 0.1; };
  CARD_FX[64] = function (g, p) { p.flags.rentHalf = 1; };
  CARD_FX[65] = async function (g, p) { var q = await g.pickPlayer(p, 'Friendly Deal — ขอ 500 G จาก'); if (!q) return; var ok = await g.io.confirmDeal(q, p.name + ' ขอเงิน 500 G (Friendly Deal)', -500); if (ok && q.cash >= 500) { q.cash -= 500; p.cash += 500; g.log('🤝 ' + q.name + ' ให้ ' + p.name + ' 500 G'); } else g.log(q.name + ' ปฏิเสธ'); };
  CARD_FX[66] = async function (g, p) {
    var t = await g.pickOwnShop(p, 'Shop Transfer — เลือกร้านที่จะเสนอขาย'); if (!t) return;
    var q = await g.pickPlayer(p, 'เสนอขายให้ใคร'); if (!q) return;
    var price = Math.round(g.shopValue(t) * 1.1); if (q.cash < price) { g.log(q.name + ' เงินไม่พอ'); return; }
    var ok = await g.io.confirmDeal(q, 'ซื้อ ' + t.name + ' จาก ' + p.name + ' ราคา ' + fmt(price) + ' G', g.shopValue(t) - price + (g.ownedIn(q.id, t.district) + 1) * 300);
    if (!ok) { g.log(q.name + ' ปฏิเสธข้อเสนอ'); return; }
    var b = g.districtValue(t.district); q.cash -= price; p.cash += price; t.owner = q.id; g.txid('transfer'); g.log('🏷️ ' + q.name + ' ซื้อ ' + t.name + ' จาก ' + p.name + ' ' + fmt(price) + ' G'); g.valueChanged(t.district, b);
  };
  CARD_FX[67] = async function (g, p) { var t = await g.pickRivalShop(p, 'Business Competition — ร้านคู่แข่งค่าเช่า -10%'); if (t) g.addEffect({ kind: 'rentMult', tile: t.id, mult: 0.9, rounds: 1 }); };
  CARD_FX[68] = function (g, p, c) { var ok = g.shopsOf(p).some(function (t) { return g.s.districts[t.district].tiles.some(function (id) { var o = g.tile(id).owner; return o >= 0 && o !== p.id; }); }); if (ok) return g.gain(p, 500, c.name, true); };
  CARD_FX[69] = function (g, p) { p.flags.buyoutDisc = 0.1; };
  CARD_FX[70] = function (g, p) { g.s.players.forEach(function (q) { if (q.id !== p.id) q.flags.buyoutDisc = 0; }); };
  CARD_FX[71] = function (g, p) { p.flags.rentShield = (p.flags.rentShield || 0) + 1; };
  CARD_FX[72] = function (g, p) { p.flags.taxHalf = 1; };
  CARD_FX[73] = function (g, p) { var ids = g.shopsOf(p).map(function (t) { return t.id; }); g.s.effects = g.s.effects.filter(function (e) { return !((e.kind === 'noRent' || e.kind === 'noUpgrade') && ids.indexOf(e.tile) >= 0); }); };
  CARD_FX[74] = function (g, p) { p.flags.insurance = (p.flags.insurance || 0) + 1; };
  CARD_FX[75] = function (g, p) { var v = Math.min(1000, Math.max(0, p.cash)); p.cash -= v; p.safe += v; g.log('🔐 ฝากเงิน ' + fmt(v) + ' G ในบัญชีคุ้มครอง'); };
  CARD_FX[76] = function (g, p) { p.shares.forEach(function (n, d) { if (n) g.addEffect({ kind: 'priceLock', district: d, rounds: 1 }); }); };
  CARD_FX[77] = function (g, p) { p.flags.shopProtect = (p.flags.shopProtect || 0) + 1; };
  CARD_FX[78] = function (g, p) { p.flags.maintFree = 1; };
  CARD_FX[79] = function (g, p) { p.flags.taxExempt = 1; };
  CARD_FX[80] = function (g, p, c) { if (p.cash < 1000) return g.gain(p, 1000, c.name, true); g.log('เงินสดมากกว่า 1,000 G — ไม่มีผล'); };
  CARD_FX[81] = gainFx(500);
  CARD_FX[82] = async function (g, p) { var d = await g.pickDistrict(p, 'Weekend Market — เลือกเขต', true); var list = g.s.districts[d].tiles.map(function (id) { return g.tile(id); }).filter(function (t) { return t.owner >= 0; }); for (var i = 0; i < list.length; i++) { var q = g.s.players[list[i].owner]; if (!q.bankrupt) await g.gain(q, 300, 'Weekend Market', false); } };
  CARD_FX[83] = function (g) { g.addEffect({ kind: 'rentMult', district: 3, mult: 1.2, rounds: 2 }); };
  CARD_FX[84] = function (g) { g.addEffect({ kind: 'rentMult', hotels: true, mult: 0.9, rounds: 1 }); };
  CARD_FX[85] = function (g) { g.addEffect({ kind: 'rentMult', hotels: true, mult: 1.1, rounds: 1 }); };
  CARD_FX[86] = function (g, p) { p.flags.winterSale = 1; };
  CARD_FX[87] = function (g) { g.s.districts.forEach(function (d, i) { g.stockMove(i, 0.03, 'City Development'); }); };
  CARD_FX[88] = async function (g, p) { var d = await g.pickDistrict(p, 'Public Construction — เลือกเขต', true); var b = g.districtValue(d); g.shopsOf(p).forEach(function (t) { if (t.district === d) t.bonusPct += 0.05; }); g.valueChanged(d, b); };
  CARD_FX[89] = function (g, p, c) { if (g.shopsOf(p).length >= 3) return g.gain(p, 1000, c.name, true); };
  CARD_FX[90] = async function (g, p) { var a = g.alive(); for (var i = 0; i < a.length; i++) await g.lose(a[i], 200, 'City Tax Day', false, true); };
  CARD_FX[91] = gainFx(500);
  CARD_FX[92] = function (g, p, c) { return g.lose(p, 300, c.name, true, true); };
  CARD_FX[93] = function (g, p, c) { return g.lose(p, 500, c.name, true); };
  CARD_FX[94] = async function (g, p, c) { var r = g.rand(0, 3); if (r === 0) await g.gain(p, g.rand(3, 15) * 100, 'ของขวัญ', true); else if (r === 1) { g.giveShares(p, g.bestHeldDistrict(p), 5); } else if (r === 2) { p.flags.rentShield = (p.flags.rentShield || 0) + 1; g.log('🎁 ได้รับ Rent Shield'); } else { p.flags.insurance = (p.flags.insurance || 0) + 1; g.log('🎁 ได้รับ Insurance'); } };
  CARD_FX[95] = function (g, p) { var l = g.shopsOf(p); if (l.length) { var t = l[Math.floor(g.r() * l.length)]; g.addEffect({ kind: 'noRent', tile: t.id, rounds: 1 }); g.log('🔧 ' + t.name + ' เสีย — ไม่เก็บค่าเช่า 1 รอบ'); } };
  CARD_FX[97] = async function (g, p, c) { g.giveShares(p, g.bestHeldDistrict(p), 5); await g.gain(p, 500, c.name, true); };
  CARD_FX[98] = async function (g, p) { var a = g.dice(), b = g.dice(); var n = await g.choose(p, { title: 'Lucky Dice — เลือกผล', kind: 'num', options: [{ value: a, label: '🎲 ' + a, score: a }, { value: b, label: '🎲 ' + b, score: b }] }); return cardMove(g, p, n); };
  CARD_FX[99] = function (g, p) { p.flags.insurance = (p.flags.insurance || 0) + 1; };
  CARD_FX[100] = async function (g, p, c) { await g.gain(p, 1000, c.name, true); var t = await g.pickOwnShop(p, 'Fortune Day — ร้านมูลค่า +5%'); if (t) { var b = g.districtValue(t.district); t.bonusPct += 0.05; g.valueChanged(t.district, b); } };

  function SUITS_DONE(p) { return D.SUITS.every(function (s) { return p.suits[s]; }); }
  Game.suitsDone = SUITS_DONE;
  Game.buildBoard = buildBoard;
  Game.fmt = fmt;
  Game.CARD_FX = CARD_FX;

  // run loop
  P.run = async function () { var n = 0; while (!this.s.over) { await this.playTurn(); if (++n > 100000) break; } return this.s; };

  if (typeof module !== 'undefined') module.exports = Game; else root.Game = Game;
})(this);
