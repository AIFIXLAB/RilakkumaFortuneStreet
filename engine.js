// ===================== RILAKKUMA FORTUNE STREET — GAME ENGINE =====================
// Pure game logic. All decisions go through an async `io` adapter (human UI or AI),
// so the same engine runs in the browser and in headless economy simulations.
(function (root) {
  var D = (typeof module !== 'undefined') ? require('./data.js') : root;
  var C = D.CONFIG;

  function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var FOOD_BIZ = ['food', 'cafe', 'bakery'];
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
    var hasDragon = b.tiles.some(function (t) { return t.type === 'dragon'; });
    var s = {
      dragonPot: hasDragon ? C.dragon.seed : undefined,
      v: 1, mapIdx: opts.mapIdx, tiles: b.tiles, districts: b.districts, w: b.w, h: b.h, painted: b.painted,
      teams: !!opts.teams, teamInfo: opts.teams ? (opts.teamInfo || [{ n: 'ชมพู', c: '#ff5d8f', e: '💗' }, { n: 'ฟ้า', c: '#3d8bfd', e: '🔷' }]) : null,
      settings: { target: opts.target || C.targetNetWorth, maxRounds: opts.maxRounds || C.maxRounds, startCash: opts.startCash || C.startCash, rules: Object.assign({}, C.rules, opts.rules || {}) },
      players: opts.players.map(function (o, i) {
        return {
          id: i, name: o.name, char: o.char, costume: o.costume || 'chars', color: (opts.teams && opts.teamInfo && o.team >= 0 && opts.teamInfo[o.team]) ? opts.teamInfo[o.team].c : (o.color || D.PLAYER_COLORS[i]), dice: o.dice || null, isAI: !!o.isAI,
          ai: { level: o.aiLevel || 'normal', persona: o.persona || 'Balanced' },
          team: (opts.teams && o.team >= 0) ? o.team : -1,
          cash: (opts.startCash || C.startCash) + ((D.CHAR_SKILLS && D.CHAR_SKILLS[o.char] && D.CHAR_SKILLS[o.char].fx.startCash) || 0), pos: bank.id, prev: null, level: 1, suits: {}, shares: b.districts.map(function () { return 0; }),
          safe: 0, flags: {}, bankrupt: false, turns: 0, promotions: 0,
          loadout: { eq: (o.loadout && o.loadout.eq || []).map(function (id) { return { id: id, used: false }; }), sc: (o.loadout && o.loadout.sc) ? { id: o.loadout.sc, used: false } : null },
          hist: [],
        };
      }),
      cur: 0, round: 1, turnNo: 0, deck: [], grid: [], taxPool: 0, effects: [], log: [], tx: 0, over: false, winner: null,
      train: opts.train ? { normal: 0, phase: false, count: 0 } : undefined,
      bkk: opts.bkk ? { tier: opts.bkk.tier || 0, kind: opts.bkk.kind || 'solo' } : undefined,
      easter: opts.easter ? { stage: opts.easter.stage || 0, kind: opts.easter.kind || 'solo', mission: opts.easter.mission || 'eggs', prev: opts.easter.prev || [], eggs: {}, laid: 0, bunny: { pos: -1, prev: null, left: 0, cool: 1 } } : undefined,
      seed: opts.seed || (Date.now() & 0xffffff), rngCalls: 0, cardHistory: [], phase: 'idle', forcedDice: null,
    };
    var g = new Game(s, null);
    s.tiles.forEach(function (t) { if (t.type === 'chance' && t.ch === '?') { t.type = 'splot'; t.ch = 'Q'; t.name = 'ที่ดินบ้านพิเศษ'; } });
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
  // character passive skill: value of effect k for player p (0 if none)
  P.cs = function (p, k) { var f = p.flags || {}, r = this.s.round, add = 0;
    if (k === 'cardLuck') { if (f.luckUntil >= r) add += 0.5; if (f.charmLuck) add += 0.3; }
    if (k === 'negShield' && f.amulet) add += 0.35;
    if (f.noSkillUntil && r <= f.noSkillUntil) return add; var sk = D.CHAR_SKILLS && D.CHAR_SKILLS[p.char]; return ((sk && sk.fx[k]) || 0) + add; };
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
  // ---------- team mode (2 vs 2): teammates share district bonuses, pay no rent to each other and can invest in each other's shops ----------
  P.mate = function (a, b) { if (a === null || a === undefined || b === null || b === undefined) return false; var pa = typeof a === 'number' ? this.s.players[a] : a, pb = typeof b === 'number' ? this.s.players[b] : b; if (!pa || !pb) return false; return pa.id === pb.id || (!!this.s.teams && pa.team >= 0 && pa.team === pb.team); };
  P.teamOf = function (p) { return this.s.teams && p.team >= 0 ? this.s.players.filter(function (q) { return q.team === p.team; }) : [p]; };
  P.teamWorth = function (p) { var self = this; return this.teamOf(p).reduce(function (a, q) { return a + (q.bankrupt ? 0 : self.netWorth(q)); }, 0); };
  P.rankWorth = function (p) { return this.s.teams ? this.teamWorth(p) : this.netWorth(p); };
  P.bestPlayer = function () { var self = this; var al = this.alive().sort(function (a, b) { return self.rankWorth(b) - self.rankWorth(a) || self.netWorth(b) - self.netWorth(a); }); return al[0]; };
  P.ownedIn = function (owner, d) { var self = this; return this.s.districts[d].tiles.filter(function (id) { var o = self.s.tiles[id].owner; return o >= 0 && (o === owner || self.mate(o, owner)); }).length; };
  P.distMult = function (t) {
    if (t.owner < 0) return 1;
    var c = this.ownedIn(t.owner, t.district), n = this.s.districts[t.district].tiles.length;
    return (1 + C.distStep * (c - 1)) * (c >= n ? C.domination : 1);
  };
  P.chainTiles = function (t) { // shops of the same owner connected along the road
    if (t.type !== 'shop' || t.owner < 0) return [];
    var self = this, seen = {}, q = [t.id], out = []; seen[t.id] = 1;
    while (q.length) { var c = self.tile(q.shift()); out.push(c.id); c.n.forEach(function (n) { var u = self.tile(n); if (!seen[n] && u.type === 'shop' && u.owner >= 0 && (u.owner === t.owner || self.mate(u.owner, t.owner))) { seen[n] = 1; q.push(n); } }); }
    return out;
  };
  P.chainLen = function (t) { return this.chainTiles(t).length; };
  P.chainMult = function (t) { var c = this.chainLen(t); return c < 2 ? 1 : Math.min(C.chainMax, 1 + C.chainStep * (c - 1)); };
  P.dominated = function (t) { return t.owner >= 0 && this.ownedIn(t.owner, t.district) >= this.s.districts[t.district].tiles.length; };
  P.rawValue = function (t) { return (t.base + (t.invest || 0) + t.bonusVal) * (1 + t.bonusPct); };
  P.buyPrice = function (t) { return t.base; };
  P.baseValue = function (t) { return Math.round(this.rawValue(t)); };
  P.shopValue = function (t) { if (t.type !== 'shop' || t.owner < 0) return 0; return Math.round(this.rawValue(t) * this.distMult(t) * this.chainMult(t)); };
  P.valueAfterInvest = function (t, add) { return Math.round((t.base + (t.invest || 0) + add + t.bonusVal) * (1 + t.bonusPct) * this.distMult(t) * this.chainMult(t)); };
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
    t.baseLevel = Math.min(8, L);
    t.level = Math.min(8, L + Math.max(0, this.chainLen(t) - 1));
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
      if (e.biz && e.biz.indexOf(t.biz) < 0) return;
      m *= e.mult;
    });
    if (s.bkk && t.owner >= 0 && FOOD_BIZ.indexOf(t.biz) >= 0) { var bf = this.cs(s.players[t.owner], 'bkFood'); if (bf) m *= 1 + bf; }
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
    if (this.cs(p, 'salaryBonus')) sal = Math.round(sal * (1 + this.cs(p, 'salaryBonus')));
    if (this.s.bkk) sal = Math.round(sal * 1.8);
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
  P.valueChanged = function (d) { var self = this; this.s.tiles.forEach(function (t) { self.refreshLevel(t); }); this.s.districts.forEach(function (x, i) { self.updateStock(i, i === d ? 'มูลค่าเขตเปลี่ยน' : null); }); };
  P.buyFee = function (p) { return (!this.rules().tax || p.flags.stockFeeZero) ? 0 : C.stock.buyFee; };
  P.sellFee = function () { return this.rules().tax ? C.stock.sellFee : 0; };
  P.sharesAvail = function () { return 1e9; };
  P.maxBuyShares = function (p, d) { if (p.flags && p.flags.stockBuyDone) return 0; var price = this.stockBuyPrice(p, d); return Math.max(0, Math.min(C.maxStockBuy, Math.floor(p.cash / (price * (1 + this.buyFee(p)))))); };
  P.buyStock = function (p, d, n) {
    n = Math.floor(n); if (n <= 0) return false;
    if (n > this.maxBuyShares(p, d)) return false; // atomic guard
    var price = this.stockBuyPrice(p, d), cost = Math.ceil(n * price * (1 + this.buyFee(p)));
    p.cash -= cost; p.shares[d] += n; p.flags.stockBuyDone = 1; this.txid('buyStock');
    this.log('🧾 ' + p.name + ' ซื้อหุ้น ' + this.s.districts[d].name + ' ' + n + ' หุ้น (' + fmt(cost) + ' G)');
    if (n >= 10) this.stockMove(d, 0.03 + n / 2000, 'ซื้อหุ้นจำนวนมาก');
    return true;
  };
  P.stockBuyPrice = function (p, d) { var pr = this.s.districts[d].price, k = this.cs(p, 'stockDisc'); return k ? Math.max(1, Math.round(pr * (1 - k) * 100) / 100) : pr; };
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
    if (this._inCard && C.cardGoldMult) amt = Math.round(amt * C.cardGoldMult / 10) * 10;
    amt = Math.round(amt); if (amt <= 0) return 0;
    var gb = this._inCard ? this.cs(p, 'cardGold') : this.cs(p, 'tileGold'); if (gb) { var add = Math.round(amt * gb); amt += add; this.log('✨ สกิลตัวละคร ' + p.name + ' +' + fmt(add) + ' G'); }
    if (event) { var u = await this.offerReactive(p, 'gain', { amt: amt, why: why }); if (u) { var extra = Math.min(amt, 3000); amt += extra; this.log('✨ Double Coin! +' + fmt(extra) + ' G'); } }
    if (p.flags.x2Until >= this.s.round) { amt *= 2; this.log('✖️2 ตั๋วสองเท่า: ' + p.name + ' ได้เงิน 2 เท่า'); }
    p.cash += amt; this.txid('gain'); this.log('💰 ' + p.name + ' +' + fmt(amt) + ' G' + (why ? ' (' + why + ')' : ''), 'gain');
    if (this.io && this.io.money) this.io.money(p, amt);
    return amt;
  };
  P.lose = async function (p, amt, why, event, toPool) {
    amt = Math.round(amt); if (amt <= 0) return 0;
    if (p.flags.halfUntil >= this.s.round) { amt = Math.round(amt / 2); this.log('🏷️ ตั๋วลดราคา: ' + p.name + ' จ่ายแค่ครึ่งเดียว'); }
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
    // human: choose what to sell yourself (Fortune Street style)
    if (!p.isAI && this.io && this.io.debtSell) {
      for (var gd = 0; gd < 40 && p.cash < 0 && this.hasAssets(p); gd++) { var r = await this.io.debtSell(p, -p.cash); if (r === 'auto') break; }
      if (p.cash >= 0) return;
    }
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
  P.hasAssets = function (p) { var self = this; return p.shares.some(function (n) { return n > 0; }) || this.s.tiles.some(function (t) { return (t.type === 'shop' && t.owner === p.id) || (t.special && t.spOwner === p.id); }); };
  P.specialSellValue = function (t) { var b = D.SPECIAL_BUILDINGS.find(function (x) { return x.id === t.special; }); return b ? Math.floor(b.cost * C.shopSellRate * (1 - C.shopSellFee)) : 0; };
  P.sellSpecialToBank = function (p, t) {
    if (!t.special || t.spOwner !== p.id) return 0;
    var b = D.SPECIAL_BUILDINGS.find(function (x) { return x.id === t.special; }), v = this.specialSellValue(t);
    p.cash += v; t.special = null; t.spOwner = -1; t.toll = 0; this.txid('sellSpecial');
    this.log('🏚️ ' + p.name + ' ขาย ' + (b ? b.th : 'บ้านพิเศษ') + ' ให้ธนาคาร +' + fmt(v) + ' G'); return v;
  };
  P.shopSellValue = function (t) { return Math.floor(this.shopValue(t) * C.shopSellRate * (1 - C.shopSellFee)); };
  P.sellShopToBank = function (p, t, forced) {
    var before = this.districtValue(t.district), v = Math.floor(this.shopValue(t) * C.shopSellRate * (1 - C.shopSellFee) * (1 + this.cs(p, 'sellBonus')));
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
    if (alive.length === 1 || (this.s.teams && alive.every(function (q) { return q.team === alive[0].team; }))) this.finish(this.bestPlayer(), 'ผู้เล่นฝ่ายตรงข้ามล้มละลายทั้งหมด');
    else if (this.rules().endOnBankrupt) { var best = this.bestPlayer(); this.finish(best, p.name + ' ล้มละลาย — เกมจบ ผู้มีทรัพย์สินสูงสุดชนะ'); }
  };
  P.finish = function (winner, why) {
    if (this.s.over) return;
    var self = this;
    this.s.over = true; this.s.winner = winner ? winner.id : null; this.s.endReason = why; this.s.winTeam = winner && this.s.teams ? winner.team : null;
    this.s.ranking = this.s.players.slice().sort(function (a, b) { if (self.s.teams && winner && (a.team === winner.team) !== (b.team === winner.team)) return a.team === winner.team ? -1 : 1; if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1; if (winner && a.id === winner.id) return -1; if (winner && b.id === winner.id) return 1; return self.netWorth(b) - self.netWorth(a); }).map(function (p) { return { id: p.id, nw: self.netWorth(p) }; });
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
    if (s.easter && !s.over) await this.bunnyTurn();
    if (s.train && !s.over) {
      if (s.train.phase) { s.train.phase = false; s.train.normal = 0; if (this.io.trainPhase) await this.io.trainPhase(false); }
      else if (++s.train.normal >= D.TRAIN.every && s.round < s.settings.maxRounds) { s.train.phase = true; s.train.count = (s.train.count || 0) + 1; this.log('🚂 ครบ ' + D.TRAIN.every + ' รอบ! รอบนี้ทุกคนได้ขับรถไฟ (ลูกเต๋า 2 ลูก)', 'gain'); if (this.io.trainPhase) await this.io.trainPhase(true); }
    }
    s.round++;
    if (s.round > s.settings.maxRounds) {
      this.finish(this.bestPlayer(), 'ครบ ' + s.settings.maxRounds + ' รอบ — ' + (s.teams ? 'ทีมที่มีทรัพย์สินรวมสูงสุด' : 'ทรัพย์สินสูงสุด'));
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

      case 'SC_tax': p.flags.taxHalf = 1; p.flags.taxExempt = 1; this.log('🧾 ' + p.name + ' ลดภาษี 50% + ยกเว้นภาษีทรัพย์สิน 1 ครั้ง'); break;
      case 'SC_bomb': case 'eq_bomb': { var bp = def.id === 'SC_bomb' ? 0.40 : 0.25, bs = await this.pickRivalShop(p, '💣 เลือกร้านคู่แข่งที่จะระเบิด (-' + Math.round(bp * 100) + '%)'); if (!bs) { sl.used = false; return false; } var b3 = this.districtValue(bs.district); bs.bonusPct = Math.max(-0.6, (bs.bonusPct || 0) - bp); this.valueChanged(bs.district, b3); this.log('💣 ' + p.name + ' ระเบิด ' + bs.name + ' มูลค่า -' + Math.round(bp * 100) + '%', 'lose'); break; }
      case 'SC_quick': case 'eq_key': p.flags.buyHalf = 1; this.log('🏷️ ' + p.name + ' ซื้อร้านครั้งถัดไปลด 50%'); break;
      case 'SC_skip': p.flags.skipBad = 1; this.log('🚧 ' + p.name + ' ข้ามช่องร้ายเทิร์นนี้'); break;
      case 'SC_event': await this.drawChance(p); break;
      case 'eq_free': p.flags.timeStopUntil = Math.max(p.flags.timeStopUntil || 0, s.round); p.flags.freeRide = 1; this.log('🎫 ' + p.name + ' ผ่านทางฟรีรอบนี้'); break;
      case 'eq_fix': { var neg = this.shopsOf(p).filter(function (x) { return (x.bonusPct || 0) < 0; }); if (neg.length) { neg.forEach(function (x) { x.bonusPct = 0; }); neg.forEach(function (x) { self.valueChanged(x.district); }); this.log('🔧 ซ่อมร้านที่ถูกลดมูลค่า ' + neg.length + ' ร้าน'); } else { var fx = await this.pickOwnShop(p, 'เลือกร้านเพื่อเพิ่มมูลค่า +10%'); if (!fx) { sl.used = false; return false; } fx.bonusPct += 0.10; this.valueChanged(fx.district); } break; }
      case 'eq_two': p.flags.twoDice = 1; this.log('🎲🎲 ' + p.name + ' ทอยลูกเต๋า 2 ลูกเทิร์นนี้'); break;
      case 'eq_mkey': { var mk = s.tiles.filter(function (x) { return x.id !== p.pos && /^(bank|casino|broker|splot)$/.test(x.type); }).map(function (x) { return x.id; }); var mt = await this.io.pickTile(p, '🗝️ เลือกจุดสำคัญที่จะไป', mk); if (mt === null || mt === undefined) { sl.used = false; return false; } s.warpTo = mt; break; }
      case 'eq_sand': { var ext = false; ['x2Until', 'halfUntil', 'luckUntil', 'timeStopUntil'].forEach(function (k) { if (p.flags[k] >= s.round) { p.flags[k] += 2; ext = true; } }); if (!ext) p.flags.luckUntil = s.round + 1; this.log('⏳ ' + p.name + (ext ? ' ยืดเวลาเอฟเฟกต์ +2 รอบ' : ' โชคดีขึ้น 2 รอบ')); break; }
      case 'eq_flip': p.flags.insurance = 1; this.log('🧪 ' + p.name + ' การ์ดร้ายใบถัดไปไม่มีผล'); break;
      case 'eq_sbox': { var rr = this.r(); if (rr < 0.4) await this.gain(p, 6000, 'กล่องสุ่มระดับ S'); else if (rr < 0.7 || !this.shopsOf(p).length) { var d5 = this.bestShopDistrict(p); this.giveShares(p, d5, 25); this.valueChanged(d5); this.log('🎁 หุ้นฟรี 25 หุ้น'); } else { var sb = await this.pickOwnShop(p, 'กล่อง S: เลือกร้าน +25%'); if (sb) { sb.bonusPct += 0.25; this.valueChanged(sb.district); } } break; }
      case 'eq_gold': await this.gain(p, 5000, 'หีบทองพิเศษ'); break;
      case 'eq_map': { var pool = s.tiles.filter(function (x) { return x.id !== p.pos && x.type !== 'bank'; }); s.warpTo = pool[Math.floor(this.r() * pool.length)].id; this.log('🗺️ แผนที่ลึกลับพา ' + p.name + ' ไปช่องสุ่ม!'); break; }
      case 'eq_compass': { var miss = s.tiles.filter(function (x) { return x.type === 'suit' && !p.suits[x.suit]; }); if (!miss.length) { await this.gain(p, 1500, 'เข็มทิศ (ดอกครบแล้ว)'); break; } miss.sort(function (a, b) { return self.dist(p.pos, a.id) - self.dist(p.pos, b.id); }); s.warpTo = miss[0].id; this.log('🧭 เข็มทิศพา ' + p.name + ' ไปเก็บดอก'); break; }
      case 'SC_again': case 'eq_extra': p.flags.extraTurn = (p.flags.extraTurn || 0) + 1; this.log('🎲 เทิร์นนี้ทอยได้อีก 1 ครั้ง'); break;
      case 'SC_warp': case 'eq_warpw': { var wt = await this.io.pickTile(p, '🌀 เลือกช่องที่จะวาร์ปไป', s.tiles.filter(function (x) { return x.id !== p.pos; }).map(function (x) { return x.id; })); if (wt === null || wt === undefined) { sl.used = false; return false; } s.warpTo = wt; break; }
      case 'SC_spot': { var spots = s.tiles.filter(function (x) { return x.id !== p.pos && /^(bank|casino|broker|splot|lucky|superlucky)$/.test(x.type); }).map(function (x) { return x.id; }); var st = await this.io.pickTile(p, '⭐ เลือกจุดสำคัญที่จะไป', spots); if (st === null || st === undefined) { sl.used = false; return false; } s.warpTo = st; break; }
      case 'SC_big': await this.gain(p, 10000, 'รับเงินก้อนโต'); break;
      case 'eq_bag': await this.gain(p, 3000, 'ถุงเงินพิเศษ'); break;
      case 'SC_chest': await this.gain(p, 2000 + Math.floor(this.r() * 9) * 500, 'หีบสมบัติ'); break;
      case 'eq_ibox': await this.gain(p, 1000 + Math.floor(this.r() * 11) * 500, 'หีบสุ่มไอเทม'); break;
      case 'SC_gift': if (this.r() < 0.6) await this.gain(p, 1000 + Math.floor(this.r() * 9) * 500, 'สุ่มของรางวัล'); else { var dg = Math.floor(this.r() * s.districts.length); this.giveShares(p, dg, 15); this.log('🎁 ได้หุ้นฟรี ' + s.districts[dg].name + ' 15 หุ้น'); } break;
      case 'SC_x2': case 'eq_x2t': p.flags.x2Until = s.round; this.log('✖️2 ' + p.name + ' รายได้ 2 เท่ารอบนี้'); break;
      case 'SC_half': case 'eq_halft': p.flags.halfUntil = s.round; this.log('🏷️ ' + p.name + ' ค่าใช้จ่ายลด 50% รอบนี้'); break;
      case 'SC_plus': case 'eq_upgt': { var pct = def.id === 'SC_plus' ? 0.25 : 0.20, up = await this.pickOwnShop(p, 'เลือกร้านเพื่อเพิ่มมูลค่า +' + Math.round(pct * 100) + '%'); if (!up) { sl.used = false; return false; } var b1 = this.districtValue(up.district); up.bonusPct += pct; this.valueChanged(up.district, b1); this.log('🏠⬆️ ' + up.name + ' มูลค่า +' + Math.round(pct * 100) + '%'); break; }
      case 'SC_minus': { var rs = await this.pickRivalShop(p, 'เลือกร้านคู่แข่งที่จะลดมูลค่า -20%'); if (!rs) { sl.used = false; return false; } var b2 = this.districtValue(rs.district); rs.bonusPct = Math.max(-0.5, (rs.bonusPct || 0) - 0.20); this.valueChanged(rs.district, b2); this.log('🏚️⬇️ ' + rs.name + ' มูลค่า -20%'); break; }
      case 'SC_swap': { var mineS = await this.pickOwnShop(p, 'เลือกร้านของเราที่จะสลับ'); if (!mineS) { sl.used = false; return false; } var theirs = await this.pickRivalShop(p, 'เลือกร้านคู่แข่งที่จะสลับด้วย'); if (!theirs) { sl.used = false; return false; } var o2 = theirs.owner; theirs.owner = p.id; mineS.owner = o2; this.refreshLevel(theirs); this.refreshLevel(mineS); this.log('🔄 ' + p.name + ' สลับ ' + mineS.name + ' ↔ ' + theirs.name); break; }
      case 'SC_lucky': p.flags.luckUntil = s.round + 2; this.log('🍀 ' + p.name + ' โชคดีขึ้น 3 รอบ'); break;
      case 'SC_guard': p.flags.insurance = 1; p.flags.rentShield = 1; this.log('🛡️ ' + p.name + ' ป้องกันผลร้าย + กันค่าเช่า 1 ครั้ง'); break;
      case 'SC_boom': { var touched = {}; this.shopsOf(p).forEach(function (x) { x.bonusPct += 0.15; touched[x.district] = 1; }); Object.keys(touched).forEach(function (d) { self.valueChanged(+d); }); this.log('📈 ร้านทั้งหมดของ ' + p.name + ' มูลค่า +15%'); break; }
      case 'SC_storm': { var others = s.players.filter(function (q) { return q !== p && !q.bankrupt; }), poss = others.map(function (q) { return q.pos; }); for (var si = poss.length - 1; si > 0; si--) { var sj = Math.floor(this.r() * (si + 1)), tmp = poss[si]; poss[si] = poss[sj]; poss[sj] = tmp; } for (var sk = 0; sk < others.length; sk++) { var q = others[sk], f0 = q.pos; if (f0 === poss[sk]) continue; q.pos = poss[sk]; q.prev = null; if (this.io.teleport) await this.io.teleport(q, f0, q.pos); } this.log('🌪️ พายุ! สลับตำแหน่งผู้เล่นคนอื่น'); break; }
      case 'SC_master': { var w2 = await this.io.pickTile(p, '👑 การ์ดรอยัล — เลือกช่องที่จะวาร์ปไป', s.tiles.filter(function (x) { return x.id !== p.pos; }).map(function (x) { return x.id; })); if (w2 === null || w2 === undefined) { sl.used = false; return false; } s.warpTo = w2; this.log('👑 ' + p.name + ' ใช้การ์ดรอยัลวาร์ป'); break; }
      case 'eq_event': await this.drawChance(p); break;
      case 'eq_clock': p.flags.timeStopUntil = s.round + 1; this.log('⏱️ ' + p.name + ' หยุดเวลา — บ้านพิเศษไม่มีผลรอบนี้'); break;
      case 'eq_charm': p.flags.charmLuck = 1; this.log('🧧 เครื่องรางโชค: โชคดีขึ้นตลอดเกม'); break;
      case 'eq_amulet': p.flags.amulet = 1; this.log('🛡️ เครื่องรางป้องกัน: กันผลร้ายตลอดเกม'); break;

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
    var self = this, list = this.s.tiles.filter(function (t) { return t.type === 'shop' && t.owner >= 0 && !self.mate(t.owner, p); });
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

  // =====================================================================
  // EASTER EVENT — the bunny hops around after every round and lays eggs
  // =====================================================================

  // =====================================================================
  // STEAM TRAIN — every 5 rounds everybody drives the train (2 dice) and rams whoever is on the way
  // =====================================================================
  P.crash = async function (p, q) {
    var s = this.s, io = this.io, T = D.TRAIN, self = this;
    if (this.r() < this.cs(q, 'crashGuard')) { this.log('🛡️ ' + q.name + ' หลบรถไฟของ ' + p.name + ' ได้ทัน!'); if (io.trainCrash) await io.trainCrash(p, q, { kind: 'dodge' }); return; }
    var kinds = [];
    if (q.cash > 0) kinds.push('cash', 'cash');
    if (D.SUITS.some(function (k) { return q.suits[k]; })) kinds.push('suit');
    var slots = this.loadoutSlots(q).filter(function (sl) { return !sl.used; }), buffs = this.activeBuffs ? this.activeBuffs(q) : [];
    if (slots.length || buffs.length) kinds.push('card');
    var sk = D.CHAR_SKILLS[q.char]; if (sk && !(q.flags.noSkillUntil >= s.round)) kinds.push('skill');
    var kind = kinds.length ? kinds[Math.floor(this.r() * kinds.length)] : 'none', info = { kind: kind };
    if (kind === 'cash') {
      var amt = Math.min(q.cash, Math.max(T.crashCashMin, Math.min(T.crashCashMax, Math.round(q.cash * T.crashCashPct / 10) * 10)));
      q.cash -= amt; var loot = Math.round(amt * this.cs(p, 'crashLoot') / 10) * 10; p.cash += loot; s.taxPool += amt - loot;
      info.amt = amt; info.loot = loot;
      this.log('🚂💥 ' + q.name + ' โดนรถไฟชน! เงินหล่น ' + fmt(amt) + ' G' + (loot ? ' (' + p.name + ' เก็บได้ ' + fmt(loot) + ')' : ' (ตกลงกองภาษีเมือง)'), 'lose');
    } else if (kind === 'suit') {
      var own = D.SUITS.filter(function (k) { return q.suits[k]; }), su = own[Math.floor(this.r() * own.length)]; q.suits[su] = false; info.suit = su;
      this.log('🚂💥 ' + q.name + ' โดนรถไฟชน! ดอก ' + D.SUIT_GLYPH[su] + ' กระเด็นหาย', 'lose');
    } else if (kind === 'card') {
      var pick = Math.floor(this.r() * (slots.length + buffs.length));
      if (pick < slots.length) { slots[pick].used = true; slots[pick].lost = true; var def = this.itemDef(slots[pick].id); info.item = def ? def.name : slots[pick].id; }
      else { var b = buffs[pick - slots.length]; q.flags[b[0]] = 0; info.item = b[2]; }
      this.log('🚂💥 ' + q.name + ' โดนรถไฟชน! การ์ด/ไอเทม “' + info.item + '” หล่นหาย', 'lose');
    } else if (kind === 'skill') {
      q.flags.noSkillUntil = s.round + T.noSkillRounds; info.skill = sk.name; info.until = q.flags.noSkillUntil;
      this.log('🚂💥 ' + q.name + ' โดนรถไฟชน! สกิล “' + sk.name + '” ใช้ไม่ได้ ' + T.noSkillRounds + ' รอบ', 'lose');
    }
    if (io.trainCrash) await io.trainCrash(p, q, info);
    var from = q.pos; q.pos = this.bankId(); q.prev = null;
    if (io.teleport) await io.teleport(q, from, q.pos);
  };
  P.landPlatform = async function (p, t) {
    var s = this.s, self = this, others = s.tiles.filter(function (x) { return x.type === 'platform' && x.id !== t.id; });
    if (!others.length) return;
    var opts = others.map(function (x) { return { value: x.id, label: '🚉 ชานชาลา ' + (x.name2 || ('#' + x.id)), sub: s.districts[self.nearDistrict(x)] ? 'ใกล้' + s.districts[self.nearDistrict(x)].th : '' }; });
    opts.push({ value: -1, label: '🚶 ไม่ขึ้นรถไฟ อยู่ที่เดิม' });
    var to = await this.choose(p, { title: '🚉 ขึ้นรถไฟฟรี! ไปลงชานชาลาไหน?', kind: 'tile', options: opts, ai: 'random' });
    if (to === null || to === undefined || to < 0) return;
    var from = p.pos; p.pos = to; p.prev = null; this.log('🚉 ' + p.name + ' นั่งรถไฟไปอีกชานชาลา');
    if (this.io.teleport) await this.io.teleport(p, from, to);
  };
  P.nearDistrict = function (t) { var best = -1, bd = 1e9; this.s.tiles.forEach(function (x) { if (x.type === 'shop' && x.district >= 0) { var d = Math.abs(x.x - t.x) + Math.abs(x.y - t.y); if (d < bd) { bd = d; best = x.district; } } }); return best; };
  P.landPrank = async function (p, t) {
    var s = this.s, io = this.io, kinds = ['swap', 'back', 'steal'], kind = kinds[Math.floor(this.r() * 3)];
    var title = { swap: '🎁 กล่องแกล้ง: สลับตำแหน่งกับใคร?', back: '🎁 กล่องแกล้ง: ส่งใครกลับสถานี?', steal: '🎁 กล่องแกล้ง: แอบหยิบเงิน 5% จากใคร?' }[kind];
    if (io.prankRoll) await io.prankRoll(p, kind);
    var q = await this.pickPlayer(p, title); if (!q) return;
    if (this.r() < this.cs(q, 'crashGuard') / 2) { this.log('🛡️ ' + q.name + ' รู้ทันกล่องแกล้ง!'); if (io.toast) io.toast('🛡️ ' + q.name + ' รู้ทันกล่องแกล้ง!'); return; }
    if (kind === 'swap') { var a = p.pos, b = q.pos; p.pos = b; q.pos = a; p.prev = null; q.prev = null; this.log('🎁 ' + p.name + ' สลับตำแหน่งกับ ' + q.name + '!'); if (io.teleport) { await io.teleport(p, a, b); await io.teleport(q, b, a); } }
    else if (kind === 'back') { var f = q.pos; q.pos = this.bankId(); q.prev = null; this.log('🎁 ' + p.name + ' ส่ง ' + q.name + ' กลับสถานี!'); if (io.teleport) await io.teleport(q, f, q.pos); }
    else { var amt = Math.min(q.cash, Math.min(2500, Math.round(q.cash * 0.05 / 10) * 10)); q.cash -= amt; p.cash += amt; this.log('🎁 ' + p.name + ' แอบหยิบเงิน ' + q.name + ' ' + fmt(amt) + ' G'); if (io.toast) io.toast('🎁 ' + p.name + ' แอบหยิบเงิน ' + q.name + ' ' + fmt(amt) + ' G'); }
  };
  P.bunnyTurn = async function () {
    var s = this.s, E = s.easter, b = E.bunny, io = this.io, self = this;
    if (b.left <= 0) {
      if (--b.cool > 0) return;
      var spots = s.tiles.filter(function (t) { return t.type !== 'bank' && !E.eggs[t.id]; });
      b.pos = spots[Math.floor(this.r() * spots.length)].id; b.prev = null; b.left = D.EASTER.bunnyStay; b.visits = (b.visits || 0) + 1;
      this.log('🐰 กระต่ายอีสเตอร์มาแล้ว! จะอยู่ ' + b.left + ' รอบ', 'gain');
      if (io.bunnyArrive) await io.bunnyArrive(b.pos);
      await this.layEgg(b.pos);
      return;
    }
    var roll = 1 + Math.floor(this.r() * 6), path = [];
    for (var k = 0; k < roll; k++) { var o = this.nextOptions(b.pos, b.prev), nx = o[Math.floor(this.r() * o.length)]; b.prev = b.pos; b.pos = nx; path.push(nx); }
    if (io.bunnyMove) await io.bunnyMove(roll, path);
    await this.layEgg(b.pos);
    b.left--;
    if (b.left <= 0) { b.cool = D.EASTER.bunnyCool + 1; this.log('🐰 กระต่ายอีสเตอร์กลับบ้านไปก่อน... จะกลับมาอีกใน ' + D.EASTER.bunnyCool + ' รอบ'); if (io.bunnyLeave) await io.bunnyLeave(b.pos); b.pos = -1; }
  };
  P.layEgg = async function (pos) {
    var s = this.s, E = s.easter, t = this.tile(pos);
    if (t.type === 'bank' || E.eggs[pos]) { var o = t.n.filter(function (x) { return !E.eggs[x] && s.tiles[x].type !== 'bank'; }); if (!o.length) return; pos = o[0]; }
    E.eggs[pos] = this.r() < D.EASTER.golden ? 'g' : 'n'; E.laid = (E.laid || 0) + 1;
    if (this.io.eggLaid) await this.io.eggLaid(pos, E.eggs[pos]);
  };
  P.eggCheck = async function (p, t) {
    var s = this.s, E = s.easter; if (!E || !E.eggs[t.id]) return;
    var kind = E.eggs[t.id]; delete E.eggs[t.id];
    var golden = kind === 'g' || this.r() < this.cs(p, 'eggLuck'), cnt = golden ? 3 : 1;
    if (this.r() < this.cs(p, 'eggBonus')) cnt++;
    var rw = { golden: golden, cnt: cnt }, roll = this.r() * 100, self = this;
    if (roll < 40) { rw.kind = 'cash'; rw.amt = Math.round((golden ? 1500 + this.r() * 1500 : 300 + this.r() * 700) * (1 + this.cs(p, 'eggCash')) / 10) * 10; }
    else if (roll < 62) { rw.kind = 'stock'; rw.d = t.district >= 0 ? t.district : Math.floor(this.r() * s.districts.length); rw.n = (golden ? 10 : 5) * (1 + this.cs(p, 'eggStock')); }
    else if (roll < 78) { var miss = D.SUITS.filter(function (k) { return !p.suits[k]; }); if (miss.length) { rw.kind = 'suit'; rw.suit = miss[Math.floor(this.r() * miss.length)]; } else { rw.kind = 'cash'; rw.amt = golden ? 2000 : 600; } }
    else if (roll < 90) { rw.kind = 'more'; rw.extra = golden ? 3 : 2; cnt += rw.extra; rw.cnt = cnt; }
    else { var mine = s.tiles.filter(function (x) { return x.type === 'shop' && x.owner === p.id; }); if (mine.length) { rw.kind = 'boost'; var sh = mine[Math.floor(this.r() * mine.length)]; sh.bonusPct = (sh.bonusPct || 0) + (golden ? 0.2 : 0.1); rw.tile = sh.id; } else { rw.kind = 'cash'; rw.amt = golden ? 2000 : 500; } }
    p.eggs = (p.eggs || 0) + cnt; if (golden) p.geggs = (p.geggs || 0) + 1;
    if (rw.kind === 'stock') p.shares[rw.d] += rw.n;
    if (rw.kind === 'suit') p.suits[rw.suit] = true;
    this.log('🥚 ' + p.name + ' เก็บ' + (golden ? 'ไข่ทอง' : 'ไข่อีสเตอร์') + ' +' + cnt + ' ฟอง', 'gain');
    if (this.io.egg) await this.io.egg(p, rw, t.id);
    if (rw.kind === 'cash') await this.gain(p, rw.amt, golden ? 'ไข่ทองอีสเตอร์' : 'ไข่อีสเตอร์', false);
  };
  // stage score: net worth + eggs + mission bonus (same on every machine)
  P.easterMetric = function (p, id) {
    var self = this, s = this.s;
    switch (id) {
      case 'eggs': return p.eggs || 0;
      case 'shops': return this.shopsOf(p).length;
      case 'stock': return this.stockValue(p);
      case 'cash': return p.cash;
      case 'levels': return this.shopsOf(p).reduce(function (a, t) { return a + (t.level || 0); }, 0);
      case 'suits': return p.promotions || 0;
      case 'golden': return p.geggs || 0;
      case 'cards': return p.cardsOpened || 0;
    }
    return 0;
  };
  P.easterScores = function () {
    var s = this.s, E = s.easter, self = this, M = D.EASTER.missions.find(function (m) { return m.id === E.mission; }) || D.EASTER.missions[0];
    var vals = s.players.map(function (p) { return self.easterMetric(p, M.id); }), best = Math.max.apply(null, vals);
    return s.players.map(function (p, i) {
      var nw = p.bankrupt ? 0 : self.netWorth(p), eggs = p.eggs || 0;
      var bonus = M.per ? (p.geggs || 0) * M.per : (best > 0 && vals[i] === best ? D.EASTER.missionBonus : 0);
      var pts = eggs * Math.round(self.cs(p, 'eggPts') || 0);
      var stage = nw + eggs * D.EASTER.eggScore + pts + bonus, prev = (E.prev && E.prev[i]) || 0;
      return { id: p.id, name: p.name, nw: nw, eggs: eggs, geggs: p.geggs || 0, metric: vals[i], bonus: bonus, pts: pts, stage: stage, total: prev + stage };
    });
  };
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
    if (p.flags.skipTurn) { p.flags.skipTurn = 0; this.log('🚗 ' + p.name + ' ติดอยู่ในรถติด — ข้ามตานี้'); if (io.toast) io.toast('🚗 ' + p.name + ' รถติด! ข้าม 1 ตา'); p.turns++; await this.nextPlayer(); return; }
    s.phase = 'preRoll'; p.flags.rollOn = 0; s.forcedDice = null; s.teleportBank = false; s.warpTo = null; p.flags.stockFeeZero = false; p.flags.investedTurn = 0; p.flags.stockBuyDone = 0;
    if (io.autosave) io.autosave(s);
    if (io.turnStart) await io.turnStart(p);
    await io.preRoll(p); // human: waits for roll button (may use items/sell); AI: decides & uses items
    if (s.over) return;
    if (s.warpTo != null && s.tiles[s.warpTo]) {
      s.phase = 'move'; var wf = p.pos, wt = s.warpTo; s.warpTo = null; p.pos = wt; p.prev = null; if (io.teleport) await io.teleport(p, wf, wt);
      if (this.tile(wt).type === 'bank') await this.arriveBank(p, true); else await this.land(p);
    } else if (s.teleportBank) {
      s.phase = 'move'; var from = p.pos; p.pos = this.bankId(); p.prev = null; if (io.teleport) await io.teleport(p, from, p.pos);
      await this.arriveBank(p, true);
    } else {
      s.phase = 'roll';
      var driving = !!(s.train && s.train.phase), roll, forced;
      if (driving) { var dd = io.rollTwo ? await io.rollTwo(p, [this.dice(), this.dice()]) : [this.dice(), this.dice()]; roll = dd[0] + dd[1] + Math.round(this.cs(p, 'trainDice')); forced = false; s.forcedDice = null; p.flags.train = 1; this.log('🚂 ' + p.name + ' ขับรถไฟ ทอยได้ ' + dd[0] + '+' + dd[1]); }
      else if (p.flags.twoDice && !s.forcedDice) { p.flags.twoDice = 0; var d2r = io.rollTwo ? await io.rollTwo(p, [this.dice(), this.dice()]) : [this.dice(), this.dice()]; roll = d2r[0] + d2r[1]; forced = false; this.log('🎲🎲 ' + p.name + ' ทอยได้ ' + d2r[0] + '+' + d2r[1]); }
      else { roll = s.forcedDice || (io.rollDice && !p.isAI ? await io.rollDice(p) : this.dice()); forced = !!s.forcedDice; s.forcedDice = null;
      if (io.showDice && (p.isAI || forced || !io.rollDice)) await io.showDice(p, roll); }
      s.phase = 'postRoll';
      for (var guard = 0; guard < 4; guard++) {
        var u = await this.offerReactive(p, 'postRoll', { roll: roll });
        if (!u) break;
        if (u === 'eq_lucky') { roll = io.rollDice && !p.isAI ? await io.rollDice(p) : this.dice(); this.log('🎲 ทอยใหม่ได้ ' + roll); if (io.showDice && p.isAI) await io.showDice(p, roll); }
        if (u === 'eq_move') roll += 1;
        if (u === 'SC_step') roll += 2;
        if (u === 'SC_go3') roll += 3;
        if (u === 'eq_fast') roll += 5;
        if (u === 'SC_redice') { roll = io.rollDice && !p.isAI ? await io.rollDice(p) : this.dice(); this.log('🎲 เปลี่ยนผลเต๋าได้ ' + roll); if (io.showDice && p.isAI) await io.showDice(p, roll); }
      }
      s.phase = 'move';
      this.log('🎲 ' + p.name + ' ทอยได้ ' + roll + ' แต้ม');
      await this.move(p, roll);
      p.flags.train = 0;
      if (p.flags.skipBad) { p.flags.skipBad = 0; var lt = this.tile(p.pos); if ((lt.type === 'shop' && lt.owner >= 0 && !this.mate(lt.owner, p)) || lt.type === 'tax') { this.log('🚧 ' + p.name + ' ข้าม ' + (lt.name || 'ช่องร้าย') + ' ไปช่องถัดไป'); await this.move(p, 1); } }
      if (!s.over && !p.bankrupt) await this.land(p);
    }
    while (p.flags.extraTurn > 0 && !s.over && !p.bankrupt) {
      p.flags.extraTurn--; this.log('🎲 ' + p.name + ' ได้ทอยเพิ่มอีก 1 ครั้ง!', 'gain'); if (io.toast) io.toast('🎲 ' + p.name + ' ทอยเพิ่มอีก 1 ครั้ง!');
      var r2 = io.rollDice && !p.isAI ? await io.rollDice(p) : this.dice(); if (io.showDice && p.isAI) await io.showDice(p, r2);
      await this.move(p, r2); if (!s.over && !p.bankrupt) await this.land(p);
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
    var tax = Math.round(Math.min(C.propertyTaxCap, Math.round(dev * C.propertyTaxPct)) * (1 - this.cs(p, 'taxDisc'))); if (tax <= 0) return;
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
    if (p.flags.train) { var self0 = this, hit = this.s.players.filter(function (q) { return q !== p && !q.bankrupt && q.pos === t.id && !self0.mate(p, q); }); if (this.s.teams) this.s.players.forEach(function (q) { if (q !== p && !q.bankrupt && q.pos === t.id && self0.mate(p, q)) self0.log('🤝 รถไฟของ ' + p.name + ' ผ่าน ' + q.name + ' (ทีมเดียวกัน ไม่ชน)'); }); for (var hi = 0; hi < hit.length; hi++) await this.crash(p, hit[hi]); }
    if (this.s.easter && this.s.easter.eggs[t.id]) await this.eggCheck(p, t);
    if (t.type === 'bank') { await this.arriveBank(p, final); return; }
    if (t.type === 'suit' && !p.suits[t.suit]) { p.suits[t.suit] = true; this.log('🃏 ' + p.name + ' เก็บสัญลักษณ์ ' + D.SUIT_GLYPH[t.suit]); if (this.io.suit) await this.io.suit(p, t.suit); }
    if (t.special === 'sp_toll' && t.spOwner >= 0) {
      if (!this.mate(t.spOwner, p) && !(p.flags.timeStopUntil >= this.s.round)) {
        var tollOwner = this.s.players[t.spOwner], fee2 = Math.round((t.toll || 100) * (1 - this.cs(p, 'tollDisc')));
        if (p.flags.freeRide) { p.flags.freeRide = 0; this.log('🚕 ' + p.name + ' ใช้สกิลผ่านด่านฟรี'); }
        else if (!tollOwner.bankrupt) {
          var paid2 = await this.lose(p, fee2, 'ค่าผ่านทางประตูของ ' + tollOwner.name);
          if (paid2) { tollOwner.cash += paid2; if (this.io.toll) await this.io.toll(p, tollOwner, t, paid2); }
        }
        t.toll = (t.toll || 100) + 10;
      }
    }
    if (t.type === 'gate') {
      if (D.SUITS.every(function (k) { return p.suits[k]; })) { this.log('🔓 ' + p.name + ' มีสัญลักษณ์ครบ 4 — ผ่านประตูล็อกฟรี'); }
      else { var gf = C.gateFee; this.log('🔐 ' + p.name + ' จ่ายค่าเปิดประตูล็อก ' + fmt(gf) + ' G'); if (this.io.toast) this.io.toast('🔐 ' + p.name + ' จ่ายค่าเปิดประตู ' + fmt(gf) + ' G'); await this.lose(p, gf, 'ค่าเปิดประตูล็อก'); this.s.taxPool += gf; }
    }
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
    if (this.cs(p, 'bankBonus')) { p.cash += this.cs(p, 'bankBonus'); this.log('✨ สกิล ' + p.name + ': ผ่านธนาคาร +' + fmt(this.cs(p, 'bankBonus')) + ' G', 'gain'); }
    if (p.safe > 0) { var back = Math.round(p.safe * 1.05); this.log('🏦 คืนเงินบัญชีคุ้มครอง ' + fmt(back) + ' G'); p.cash += back; p.safe = 0; }
    if (this.rankWorth(p) >= s.settings.target) { this.finish(p, (s.teams ? 'ทรัพย์สินรวมของทีมถึงเป้าหมาย ' : 'ทรัพย์สินถึงเป้าหมาย ') + fmt(s.settings.target) + ' G และกลับถึงธนาคาร'); return; }
    s.phase = 'bank';
    await this.io.bank(p, stopped); // buy stocks (and upgrade any shop when stopped)
    s.phase = 'move';
    if (stopped) p.prev = null; // free direction next turn
  };

  // ---------- LANDING ----------
  // ---------- dragon castle: bet, attack the dragon, win the whole pot ----------
  P.dragonChance = function (bet, p) { return Math.min(0.9, (C.dragon.hit[bet] || 0.15) + (p ? this.cs(p, 'dragonLuck') : 0)); };
  P.landDragon = async function (p, t) {
    var s = this.s, io = this.io, D2 = C.dragon;
    if (s.dragonPot === undefined) s.dragonPot = D2.seed;
    var opts = D2.bets.filter(function (b) { return p.cash >= b; });
    if (!opts.length) { this.log('🐉 ' + p.name + ' เงินไม่พอสู้มังกร'); if (io.toast) io.toast('🐉 เงินไม่พอสู้มังกร'); return; }
    var bet = await io.dragonBet(p, s.dragonPot, opts);
    if (!bet || opts.indexOf(bet) < 0) { this.log('🏰 ' + p.name + ' ไม่สู้มังกร'); return; }
    p.cash -= bet;
    var win = this.r() < this.dragonChance(bet, p);
    if (win) {
      var prize = s.dragonPot + bet; p.cash += prize; s.dragonPot = D2.seed;
      this.log('⚔️ ' + p.name + ' โจมตีมังกรสำเร็จ! ได้เงินสะสม ' + fmt(prize) + ' G', 'gain');
      if (io.dragonResult) await io.dragonResult(p, { win: true, bet: bet, prize: prize, pot: s.dragonPot });
      return;
    }
    s.dragonPot += bet;
    var self = this, pool = s.tiles.filter(function (x) { return x.id !== t.id && x.type !== 'dragon' && x.type !== 'bank' && x.type !== 'road'; });
    var dest = pool[Math.floor(this.r() * pool.length)].id;
    this.log('💨 ' + p.name + ' โจมตีพลาด! เสีย ' + fmt(bet) + ' G (เงินสะสม ' + fmt(s.dragonPot) + ' G) และถูกลมมังกรพัดกระเด็น!', 'rent');
    if (io.dragonResult) await io.dragonResult(p, { win: false, bet: bet, pot: s.dragonPot, dest: dest });
    var from = p.pos; p.pos = dest; p.prev = null; if (io.teleport) await io.teleport(p, from, dest);
    if (!s.over && !p.bankrupt) await this.land(p);
  };
  P.land = async function (p) {
    var t = this.tile(p.pos), io = this.io, s = this.s, self = this;
    s.phase = 'land';
    if (t.type === 'suit' && !p.suits[t.suit]) { p.suits[t.suit] = true; this.log('🃏 ' + p.name + ' เก็บสัญลักษณ์ ' + D.SUIT_GLYPH[t.suit]); if (io.suit) await io.suit(p, t.suit); }
    if (io.landed) await io.landed(p, t);
    switch (t.type) {
      case 'bank': break; // handled in arriveBank
      case 'shop': await this.landShop(p, t); break;
      case 'suit': this.log('🃏 ' + p.name + ' หยุดตรงช่องสัญลักษณ์พอดี — ได้เปิดการ์ด!', 'card'); await this.drawChance(p); break;
      case 'chance': await this.drawChance(p); break;
      case 'splot': await this.landSpecialPlot(p, t); break;
      case 'dragon': await this.landDragon(p, t); break;
      case 'lucky': { var amt = Math.max(C.luckyMin, Math.floor(s.taxPool * 0.5)); s.taxPool = Math.max(0, s.taxPool - amt); await this.gain(p, amt, 'ช่อง Lucky (กองภาษีเมือง)', true); break; }
      case 'superlucky': { var amt2 = Math.max(C.superLuckyMin, s.taxPool); s.taxPool = 0; await this.gain(p, amt2, 'ช่อง Super Lucky (กองภาษีทั้งหมด)', true); break; }
      case 'tax': {
        var tax = Math.round(Math.min(C.taxTile.cap, Math.max(C.taxTile.flat, Math.round(p.cash * C.taxTile.pct))) * (1 - this.cs(p, 'taxDisc')));
        var u = await this.offerReactive(p, 'tax', { amt: tax }); if (u) { this.log('🛡️ Tax Shield ป้องกันภาษี'); break; }
        if (p.flags.taxHalf) { tax = Math.round(tax / 2); p.flags.taxHalf = 0; }
        await this.lose(p, tax, 'ช่องภาษี', false, true); break;
      }
      case 'casino': await this.casino(p); break;
      case 'broker': await io.broker(p); break;
      case 'vacant': await this.landVacant(p, t); break;
      case 'warp': { var from = p.pos; p.pos = t.warpTo; p.prev = null; this.log('🌀 ' + p.name + ' วาร์ปไปอีกเกาะ'); if (io.teleport) await io.teleport(p, from, p.pos); break; }
      case 'rest': await this.gain(p, C.restBonus, 'พักผ่อน'); break;
      case 'platform': await this.landPlatform(p, t); break;
      case 'prank': await this.landPrank(p, t); break;
      case 'switch': {
        // reverse direction: next turn walks back the way we came
        var self2 = this, fwd = t.n.filter(function (n) { return n !== p.prev && self2.tile(n).type !== 'road' && self2.tile(n).type !== 'bank'; })[0];
        if (fwd !== undefined) p.prev = fwd;
        this.log('🔄 ' + p.name + ' ตกช่องสลับ — เทิร์นหน้าเดินกลับทิศ!');
        if (io.toast) io.toast('🔄 ' + p.name + ' สลับทิศเดิน!');
        break;
      }
      case 'boost': case 'ice': {
        var nb = t.type === 'boost' ? C.boostSteps : C.iceSteps;
        p.flags.boostChain = (p.flags.boostChain || 0) + 1; if (p.flags.boostChain > 3) { p.flags.boostChain = 0; break; }
        this.log((t.type === 'boost' ? '⏩ ' + p.name + ' พุ่งไปข้างหน้าอีก ' : '⛸️ ' + p.name + ' ลื่นไถลไปอีก ') + nb + ' ช่อง!');
        if (io.toast) io.toast(t.type === 'boost' ? '⏩ ' + p.name + ' พุ่งไปอีก ' + nb + ' ช่อง!' : '⛸️ ' + p.name + ' ลื่นไถลไปอีก ' + nb + ' ช่อง!');
        await this.move(p, nb); if (!s.over && !p.bankrupt) await this.land(p);
        p.flags.boostChain = 0;
        break;
      }
      case 'whirl': {
        var pool2 = s.tiles.filter(function (x) { return x.id !== t.id && x.type !== 'bank' && x.type !== 'road' && x.type !== 'whirl' && x.type !== 'warp'; });
        var dst = pool2[Math.floor(this.r() * pool2.length)].id, from2 = p.pos;
        this.log('🌀 ' + p.name + ' ถูกวังวนดูดไปโผล่ที่ ' + (this.tile(dst).name || 'ช่องอื่น') + '!');
        if (io.toast) io.toast('🌀 วังวนดูด ' + p.name + ' ไปอีกที่!');
        p.pos = dst; p.prev = null; if (io.teleport) await io.teleport(p, from2, dst);
        if (!s.over && !p.bankrupt) await this.land(p);
        break;
      }
      case 'wheel': {
        var W = C.wheel, tot = W.reduce(function (a, x) { return a + x[0]; }, 0), rr = this.r() * tot, k3 = 0;
        for (; k3 < W.length; k3++) { rr -= W[k3][0]; if (rr <= 0) break; }
        k3 = Math.min(k3, W.length - 1); var out = W[k3];
        if (io.wheel) await io.wheel(p, k3);
        if (out[1] === 'g') await this.gain(p, out[2], 'วงล้อเสี่ยงโชค', true);
        else if (out[1] === 'l') await this.lose(p, out[2], 'วงล้อเสี่ยงโชค');
        else if (out[1] === 'card') await this.drawChance(p);
        else if (out[1] === 'stock') { var dd = Math.floor(this.r() * s.districts.length); p.shares[dd] += 5; this.log('📈 ' + p.name + ' ได้หุ้นฟรี 5 หุ้น เขต ' + s.districts[dd].th); }
        else if (out[1] === 'warp') { var pool3 = s.tiles.filter(function (x) { return x.type === 'shop' && x.owner < 0; }); if (!pool3.length) pool3 = s.tiles.filter(function (x) { return x.type === 'lucky' || x.type === 'superlucky'; }); if (pool3.length) { var d3 = pool3[Math.floor(this.r() * pool3.length)].id, f3 = p.pos; p.pos = d3; p.prev = null; if (io.teleport) await io.teleport(p, f3, d3); await this.land(p); } }
        else if (out[1] === 'again') { var r3 = io.rollDice && !p.isAI ? await io.rollDice(p) : this.dice(); if (io.showDice && (p.isAI || !io.rollDice)) await io.showDice(p, r3); this.log('🎲 ' + p.name + ' ทอยต่อได้ ' + r3 + ' แต้ม'); await this.move(p, r3); if (!s.over && !p.bankrupt) await this.land(p); }
        break;
      }
      case 'rollon': {
        p.flags.rollOn = (p.flags.rollOn || 0) + 1; if (p.flags.rollOn > 3) { p.flags.rollOn = 0; break; }
        this.log('🎲 ' + p.name + ' ตกช่องลูกเต๋า — ทอยอีกครั้ง!');
        if (io.toast) io.toast('🎲 ' + p.name + ' ได้ทอยอีกครั้ง!');
        var r2 = io.rollDice && !p.isAI ? await io.rollDice(p) : this.dice();
        if (io.showDice && (p.isAI || !io.rollDice)) await io.showDice(p, r2);
        this.log('🎲 ' + p.name + ' ทอยได้ ' + r2 + ' แต้ม');
        await this.move(p, r2); if (!s.over && !p.bankrupt) await this.land(p);
        break;
      }
      case 'festival': {
        if (this.r() < 0.6) await this.gain(p, this.rand(3, 8) * 100, 'เทศกาล: ขายของได้', true);
        else { var others = this.alive().filter(function (q) { return q.id !== p.id; }); var each = 100; this.log('🎏 ' + p.name + ' เป็นเจ้าภาพงานเทศกาล จ่ายคนละ 100 G'); var paid = await this.lose(p, each * others.length, 'เจ้าภาพเทศกาล', true); if (paid) others.forEach(function (q) { q.cash += each; }); }
        break;
      }
      case 'event': { if (s.bkk || MAPB(s)) { await this.bkkEvent(p); break; } var ev = 81 + Math.floor(this.r() * 10); await this.applyCard(p, ev); break; }
      case 'manhole': await this.bkManhole(p, false); break;
      case 'cross': await this.bkCross(p); break;
      case 'bts': case 'mrt': await this.bkStation(p, [t.type], (t.type === 'bts' ? '🚈 สถานี BTS' : 'Ⓜ️ สถานี MRT') + ' — นั่งไปลงสถานีไหน?'); break;
      case 'tuktuk': await this.bkTuktuk(p); break;
      case 'pier': await this.bkPier(p); break;
    }
  };
  // ---------- BANGKOK CITY ----------
  function MAPB(s) { return D.MAPS[s.mapIdx] && D.MAPS[s.mapIdx].bkk; }
  P.bk = function (p, k) { return this.s.bkk || MAPB(this.s) ? this.cs(p, k) : 0; };
  P.bkGo = async function (p, to, msg) { if (to === null || to === undefined || to < 0 || to === p.pos) return false; var from = p.pos; p.pos = to; p.prev = null; this.log(msg); if (this.io.toast) this.io.toast(msg); if (this.io.teleport) await this.io.teleport(p, from, to); var tb = this.bk(p, 'bkTravel'); if (tb) await this.gain(p, tb, 'สกิลเที่ยวกรุงเทพฯ', false); return true; };
  P.bkWalk = async function (p, n, why) { p.flags.boostChain = (p.flags.boostChain || 0) + 1; if (p.flags.boostChain > 3) { p.flags.boostChain = 0; return; } this.log(why + ' ' + p.name + ' เดินหน้า ' + n + ' ช่อง'); if (this.io.toast) this.io.toast(why + ' เดินหน้า ' + n + ' ช่อง!'); await this.move(p, n); if (!this.s.over && !p.bankrupt) await this.land(p); p.flags.boostChain = 0; };
  P.bkStation = async function (p, types, title) {
    var s = this.s, self = this, cur = p.pos, list = s.tiles.filter(function (x) { return types.indexOf(x.type) >= 0 && x.id !== cur; });
    if (!list.length) return;
    var opts = list.map(function (x) { var d = self.nearDistrict(x); return { value: x.id, label: (x.type === 'bts' ? '🚈 BTS ' : x.type === 'mrt' ? 'Ⓜ️ MRT ' : x.type === 'pier' ? '⛴️ ท่าเรือ ' : '🕳️ ท่อ ') + (d >= 0 ? s.districts[d].th : '#' + x.id), sub: d >= 0 ? 'ใกล้' + s.districts[d].th : '' }; });
    opts.push({ value: -1, label: '🚶 ไม่ไป อยู่ที่เดิม' });
    var to = await this.choose(p, { title: title, kind: 'tile', options: opts, ai: 'random' });
    return this.bkGo(p, to, '🚈 ' + p.name + ' นั่งรถไฟฟ้าไป' + (to >= 0 ? this.tile(to).name : ''));
  };
  P.bkManhole = async function (p, pick) {
    var s = this.s, cur = p.pos, list = s.tiles.filter(function (x) { return x.type === 'manhole' && x.id !== cur; }); if (!list.length) return;
    var to;
    if (pick) { var self = this; to = await this.choose(p, { title: '🕳️ ท่อระบายน้ำลับ — วาร์ปไปท่อไหน?', kind: 'tile', ai: 'random', options: list.map(function (x) { var d = self.nearDistrict(x); return { value: x.id, label: '🕳️ ท่อ' + (d >= 0 ? 'ย่าน' + s.districts[d].th : ''), sub: '' }; }).concat([{ value: -1, label: 'ไม่ลงท่อ' }]) }); if (to === null || to === undefined || to < 0) return; }
    else to = list[Math.floor(this.r() * list.length)].id;
    await this.bkGo(p, to, '🕳️ ' + p.name + ' ตกท่อ! โผล่อีกฝั่งเมือง');
    if (this.r() < 0.5) { if (this.bk(p, 'bkDodge') && this.r() < this.bk(p, 'bkDodge')) this.log('🛡️ ' + p.name + ' หลบค่าลอดท่อได้'); else await this.lose(p, 100, 'ค่าลอดท่อ'); } else await this.gain(p, 200, 'เจอเงินในท่อ', true);
  };
  P.bkCross = async function (p) {
    var st = 1 + Math.floor(this.r() * 3) + Math.round(this.bk(p, 'bkStep'));
    var c = await this.choose(p, { title: '🚸 ทางม้าลาย — เลือก 1 อย่าง', kind: 'list', options: [{ value: 'cash', label: '💰 รับเงินสนับสนุน ' + fmt(Math.round(200 * (1 + this.bk(p, 'bkEvt')))) + ' G', score: 2 }, { value: 'walk', label: '🚶 เดินต่อ +' + st + ' ช่อง', score: 1 }] });
    if (c === 'walk') await this.bkWalk(p, st, '🚸'); else await this.gain(p, Math.round(200 * (1 + this.bk(p, 'bkEvt'))), 'ทางม้าลาย', true);
  };
  P.bkTuktuk = async function (p) {
    var n = 1 + Math.floor(this.r() * 6) + Math.round(this.bk(p, 'bkStep'));
    if (this.io.toast) this.io.toast('🛺 ' + p.name + ' ขึ้นตุ๊กตุ๊ก! พุ่งไป ' + n + ' ช่อง');
    var lot = this.r();
    if (lot < 0.35) this.bkItem(p); else if (lot < 0.7) await this.gain(p, Math.round((200 + Math.floor(this.r() * 7) * 100) * (1 + this.bk(p, 'bkEvt'))), 'ลุ้นรางวัลตุ๊กตุ๊ก', true);
    var tb = this.bk(p, 'bkTravel'); if (tb) await this.gain(p, tb, 'สกิลเที่ยวกรุงเทพฯ', false);
    await this.bkWalk(p, n, '🛺');
  };
  P.bkPier = async function (p) {
    var st = 1 + Math.floor(this.r() * 3) + Math.round(this.bk(p, 'bkStep')), cur = p.pos, other = this.s.tiles.filter(function (x) { return x.type === 'pier' && x.id !== cur; });
    var opts = other.map(function (x) { return { value: 'p' + x.id, label: '⛴️ ล่องเรือไปท่าเรืออีกฝั่ง (+300 G)', score: 2 }; }); opts.push({ value: 'walk', label: '🚶 เดินต่อ +' + st + ' ช่อง', score: 1 }); opts.push({ value: 'stay', label: 'อยู่ที่ท่าเรือ', score: 0 });
    var c = await this.choose(p, { title: '⛴️ เรือด่วนเจ้าพระยา', kind: 'list', options: opts });
    if (c === 'walk') await this.bkWalk(p, st, '⛴️');
    else if (c && c[0] === 'p') { if (await this.bkGo(p, +c.slice(1), '⛴️ ' + p.name + ' ล่องเรือข้ามฟาก')) await this.gain(p, 300, 'โบนัสเรือด่วน', true); }
  };
  P.bkItem = function (p) { var pool = ['rentShield', 'insurance', 'rentHalf', 'taxHalf', 'buyoutDisc', 'winterSale', 'builderDisc', 'freeRide'], k = pool[Math.floor(this.r() * pool.length)]; buff(this, p, k); if (this.io.toast) { var b = (D.BUFFS || []).find(function (x) { return x[0] === k; }) || [k, '✨', k]; this.io.toast('🎁 ' + p.name + ' ได้ไอเทม ' + b[1] + ' ' + b[2]); } return k; };
  P.bkkEvent = async function (p) {
    var s = this.s, io = this.io, idx = Math.floor(this.r() * D.BKK_EVENTS.length), ev = D.BKK_EVENTS[idx], mul = 1 + this.bk(p, 'bkEvt'), self = this;
    var dodged = !!ev.bad && this.bk(p, 'bkDodge') > 0 && this.r() < this.bk(p, 'bkDodge');
    this.log('🏙️ ' + p.name + ' เจออีเวนต์: ' + ev.name, 'card');
    if (io.bkEvent) await io.bkEvent(p, idx, dodged);
    if (dodged) { this.log('🛡️ สกิลของ ' + p.name + ' หลบอีเวนต์ร้ายได้!'); return; }
    var money = function (a, b) { return Math.round((a + Math.floor(self.r() * ((b - a) / 100 + 1)) * 100) * mul); };
    switch (idx) {
      case 0: p.flags.skipTurn = 1; await this.lose(p, 200, 'ค่าเดินทางรถติด'); break;
      case 1: this.addEffect({ kind: 'rentMult', mult: 0.5, rounds: 1, name: 'ฝนตกกรุงเทพฯ' }); break;
      case 2: this.addEffect({ kind: 'rentMult', mult: 1.5, rounds: 1, name: 'สงกรานต์' }); break;
      case 3: if (this.r() < 0.5) await this.gain(p, money(300, 1000), 'ลอยกระทง', true); else this.bkItem(p); break;
      case 4: this.addEffect({ kind: 'rentMult', mult: 2, rounds: 1, biz: FOOD_BIZ, name: 'เยาวราชคึกคัก' }); break;
      case 5: {
        var pool = ['rentShield', 'insurance', 'rentHalf', 'buyoutDisc', 'builderDisc'], k = pool[Math.floor(this.r() * pool.length)], bb = (D.BUFFS || []).find(function (x) { return x[0] === k; }) || [k, '✨', k], price = Math.round(1500 * (0.3 + this.r() * 0.4) / 10) * 10;
        var c5 = await this.choose(p, { title: '🛍️ ตลาดนัดจตุจักร', kind: 'list', options: [{ value: 'buy', label: '🏷️ ซื้อ ' + bb[1] + ' ' + bb[2] + ' ราคาพิเศษ ' + fmt(price) + ' G (ปกติ 1,500)', sub: bb[3], score: p.cash > price * 3 ? 2 : 0 }, { value: 'rand', label: '🎁 สุ่มรับไอเทมฟรี 1 ชิ้น (อาจได้เงินแทน)', score: 1 }] });
        if (c5 === 'buy' && p.cash >= price) { p.cash -= price; buff(this, p, k); } else if (this.r() < 0.6) this.bkItem(p); else await this.gain(p, money(200, 600), 'ตลาดนัด', true);
        break;
      }
      case 6: await this.bkStation(p, ['bts'], '🚈 BTS พาเที่ยว — เลือกสถานี'); break;
      case 7: await this.bkStation(p, ['mrt'], 'Ⓜ️ MRT ลอดเมือง — เลือกสถานี'); break;
      case 8: await this.bkPier(p); break;
      case 9: await this.bkManhole(p, true); break;
      case 10: { var c10 = await this.choose(p, { title: '🚸 ทางม้าลาย', kind: 'list', options: [{ value: 'cash', label: '💰 รับเงินสนับสนุน ' + fmt(Math.round(200 * mul)) + ' G', score: 2 }, { value: 'walk', label: '🚶 เดินหน้า 1 ช่อง', score: 1 }] }); if (c10 === 'walk') await this.bkWalk(p, 1, '🚸'); else await this.gain(p, Math.round(200 * mul), 'ทางม้าลาย', true); break; }
      case 11: if (this.r() < 0.5) await this.gain(p, money(300, 1000), 'ทำบุญไหว้พระ', true); else buff(this, p, 'rentShield'); break;
      case 12: p.flags.saleUntil = s.round; this.log('🛍️ ' + p.name + ' ซื้อร้าน/อัปเกรดลด 30% ในรอบนี้'); break;
      case 13: this.addEffect({ kind: 'rentMult', mult: 1.5, rounds: 2, owner: p.id, biz: FOOD_BIZ, name: 'สตรีทฟู้ด' }); break;
      case 14: { var W = [[20, 0], [30, 300], [25, 800], [15, 1500], [7, 2200], [3, 3000]], tot = 100, rr = this.r() * tot, pz = 0; for (var wi = 0; wi < W.length; wi++) { rr -= W[wi][0]; if (rr <= 0) { pz = W[wi][1]; break; } } if (io.toast) io.toast('🎡 งานวัด: ' + (pz ? 'ได้ ' + fmt(Math.round(pz * mul)) + ' G!' : 'ไม่ถูกรางวัล')); if (pz) await this.gain(p, Math.round(pz * mul), 'มินิเกมงานวัด', true); else this.log('🎡 ' + p.name + ' เล่นงานวัดไม่ถูกรางวัล'); break; }
      case 15: { var c15 = await this.choose(p, { title: '🗳️ เลือกตั้ง กทม. — เลือกนโยบาย', kind: 'list', options: [{ value: 'half', label: '🏪 ลดค่าเช่าที่ต้องจ่าย 50% (1 รอบ)', score: 1 }, { value: 'cash', label: '💰 รับเงิน ' + fmt(Math.round(1000 * mul)) + ' G', score: 3 }, { value: 'walk', label: '🚶 เดินหน้า 2 ช่อง', score: 0 }] }); if (c15 === 'half') p.flags.payHalfUntil = s.round + 1; else if (c15 === 'walk') await this.bkWalk(p, 2, '🗳️'); else await this.gain(p, Math.round(1000 * mul), 'นโยบายเลือกตั้ง', true); break; }
    }
  };
  P.landShop = async function (p, t) {
    var io = this.io, s = this.s, self = this;
    if (t.owner < 0) {
      var price = this.buyPrice(t), disc = [];
      if (p.flags.newBranch) { price = Math.max(0, price - 500); disc.push('New Branch -500'); }
      if (p.flags.winterSale) { price = Math.round(price * 0.9); disc.push('Winter Sale -10%'); }
      if (p.flags.buyHalf) { price = Math.round(price * 0.5); disc.push('ซื้อด่วน -50%'); }
      if (p.flags.saleUntil >= s.round) { price = Math.round(price * 0.7); disc.push('มหกรรมช้อปปิ้ง -30%'); }
      var bf = this.cs(p, 'bizFree'), bd = this.cs(p, 'bizDisc'), bdi = this.cs(p, 'buyDisc');
      if (bf && bf.indexOf(t.biz) >= 0) { price = 0; disc.push('สกิลตัวละคร: เปิดร้านนี้ฟรี!'); }
      else { if (bd && bd.biz.indexOf(t.biz) >= 0) { price = Math.round(price * (1 - bd.v)); disc.push('สกิลตัวละคร -' + Math.round(bd.v * 100) + '%'); } if (bdi) { price = Math.round(price * (1 - bdi)); disc.push('สกิลตัวละคร -' + Math.round(bdi * 100) + '%'); } }
      if (p.cash < price) { this.log(p.name + ' เงินไม่พอซื้อ ' + t.name); if (io.info) await io.info(p, t, 'เงินไม่พอซื้อร้านนี้'); return; }
      var yes = await io.confirmBuy(p, t, price, disc);
      if (!yes) return;
      var u = await this.offerReactive(p, 'buy', { price: price }); if (u) price = Math.round(price * 0.7);
      if (p.cash < price) return;
      var before = this.districtValue(t.district);
      p.cash -= price; t.owner = p.id; t.invest = 0; this.txid('buyShop');
      p.flags.newBranch = 0; p.flags.winterSale = 0; p.flags.buyHalf = 0;
      this.log('🏠 ' + p.name + ' ซื้อ ' + t.name + ' (' + fmt(price) + ' G)', 'buy');
      this.valueChanged(t.district, before);
      if (io.built) await io.built(p, t);
      return;
    }
    if (t.owner === p.id || this.mate(t.owner, p)) { if (t.owner !== p.id) this.log('🤝 ' + p.name + ' ตกร้านเพื่อนร่วมทีม — ไม่ต้องจ่ายค่าเช่า ช่วยลงทุนได้'); await this.offerInvest(p, t); return; }
    // rival shop: pay rent
    var owner = s.players[t.owner], rent = this.shopRent(t);
    if (this.noRent(t)) { this.log('🔧 ' + t.name + ' ปิดปรับปรุง — ไม่เก็บค่าเช่า'); rent = 0; }
    if (rent > 0) {
      var shielded = false;
      if (p.flags.rentShield > 0) { p.flags.rentShield = 0; shielded = true; if (this.io.toast) this.io.toast('🛡️ ' + p.name + ' ใช้สกิลกันค่าเช่า!'); this.log('🛡️ ' + p.name + ' ใช้การ์ด Rent Shield'); }
      else { var used = await this.offerReactive(p, 'rent', { rent: rent, tile: t }); if (used) { shielded = true; this.log('🛡️ ' + p.name + ' ใช้ ' + used + ' ไม่ต้องจ่ายค่าเช่า'); } }
      if (!shielded) {
        if (p.flags.rentHalf) { rent = Math.round(rent / 2); p.flags.rentHalf = 0; this.log('⚖️ Rent Dispute ลดค่าเช่า 50%'); }
        if (this.cs(p, 'rentDodge') && this.r() < this.cs(p, 'rentDodge')) { this.log('💨 สกิล ' + p.name + ': หลบค่าเช่าได้!'); if (this.io.toast) this.io.toast('💨 ' + p.name + ' ใช้สกิลหลบค่าเช่า!'); rent = 0; }
        if (rent && this.cs(p, 'rentDisc')) rent = Math.round(rent * (1 - this.cs(p, 'rentDisc')));
        if (rent && p.flags.payHalfUntil >= s.round) { rent = Math.round(rent / 2); this.log('🗳️ นโยบายลดค่าเช่า 50% ของ ' + p.name); }
        if (rent > 0) await this.payRent(p, owner, t, rent);
      }
    }
    if (s.over || p.bankrupt || owner.bankrupt || t.owner !== owner.id) return;
    // buyout (5x)
    var cost = Math.round(this.shopValue(t) * C.buyoutMult * (1 - (p.flags.buyoutDisc || 0)) * (1 - this.cs(p, 'buyoutDisc')));
    if (p.cash >= cost) {
      var go = await io.confirmBuyout(p, t, cost);
      if (go) {
        if (owner.flags.shopProtect) { owner.flags.shopProtect = 0; this.log('🛡️ ' + owner.name + ' มี Shop Protection — ซื้อกิจการไม่สำเร็จ'); if (io.info) await io.info(p, t, owner.name + ' ป้องกันการซื้อกิจการ'); return; }
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
    var self = this, s = this.s, tx = this.txid('rent');
    if (p.flags.halfUntil >= s.round) { rent = Math.round(rent / 2); this.log('🏷️ ตั๋วลดราคา: ค่าเช่าลด 50%'); }
    var city = this.rules().tax ? Math.floor(rent * C.split.city) : 0, ownerInc = rent - city;
    if (owner.flags.x2Until >= s.round) { owner.cash += ownerInc; this.log('✖️2 ' + owner.name + ' ได้ค่าเช่า 2 เท่า'); }
    this.log('🏪 ' + p.name + ' จ่ายค่าเช่า ' + t.name + ' ' + fmt(rent) + ' G → ' + owner.name + ' ' + fmt(ownerInc) + ' G', 'rent');
    if (this.io.rent) await this.io.rent(p, owner, t, rent, ownerInc, city);
    p.cash -= rent; owner.cash += ownerInc; s.taxPool += city;
    var rb = this.cs(owner, 'rentBonus'); if (rb) { var rbx = Math.round(rent * rb); owner.cash += rbx; this.log('✨ สกิล ' + owner.name + ': โบนัสค่าเช่า +' + fmt(rbx) + ' G'); }
    // dividends: 20% of the price, paid by the bank, split among the district's stockholders by share ratio
    if (!s.paidTx) s.paidTx = {};
    if (!s.paidTx[tx]) {
      s.paidTx[tx] = 1;
      var pct = Math.min(C.maxDividendPool, C.dividendPct + s.effects.filter(function (e) { return e.kind === 'divBonus'; }).reduce(function (a, e) { return a + e.mult; }, 0));
      var pool = rent * pct, total = s.players.reduce(function (a, q) { return a + (q.bankrupt ? 0 : q.shares[t.district]); }, 0), dist = [];
      if (total > 0) s.players.forEach(function (q) {
        if (q.bankrupt || !q.shares[t.district]) return;
        var boost = s.effects.some(function (e) { return e.kind === 'divBoost' && e.owner === q.id; }) ? 1.5 : 1;
        var amt = Math.floor(pool * q.shares[t.district] / total * boost * (1 + self.cs(q, 'divBonus')));
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
    var list = this.s.tiles.filter(function (x) { return x.type === 'shop' && x.district === t.district && x.owner >= 0 && self.mate(x.owner, p); }).map(function (x) {
      var blocked = self.s.effects.some(function (e) { return e.kind === 'noUpgrade' && e.tile === x.id; });
      return { tile: x, cap: blocked ? 0 : self.maxCapital(x), blocked: blocked };
    });
    return { list: list, turnLeft: left, cash: p.cash, disc: this.investDiscount(p), free: p.flags.freeUpgrade ? 1000 : 0, hotel: p.flags.hotelDisc ? 500 : 0 };
  };
  P.investCost = function (p, amount) { var c = amount * this.investDiscount(p) * (1 - this.cs(p, 'investDisc')); if (p.flags.saleUntil >= this.s.round) c *= 0.7; if (p.flags.freeUpgrade) c -= 1000; if (p.flags.hotelDisc) c -= 500; return Math.max(0, Math.round(c)); };
  P.levelStep = function (t) { // capital needed to raise the building by exactly one level
    var cur = t.base + (t.invest || 0), r = cur / t.base, L = 1;
    C.levelRatio.forEach(function (x, i) { if (r >= x) L = i + 1; });
    if (L >= C.levelRatio.length) return Infinity;
    return Math.max(10, Math.ceil((t.base * C.levelRatio[L] - cur) / 10) * 10);
  };
  P.maxInvest = function (p, t) { // max amount of capital for this shop: cash, capital cap, one level per investment
    var cap = Math.min(this.maxCapital(t), Math.max(0, C.investCap - (p.flags.investedTurn || 0)), this.levelStep(t));
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
      await this.doInvest(p, this.tile(pick.id), pick.amount);
      return; // one shop, one level per landing
    }
  };
  P.doInvest = async function (p, t, amount) {
    if (t.owner < 0 || !this.mate(t.owner, p)) return false;
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
  // ---------- SPECIAL HOUSES on the purple “?” plots ----------
  P.landSpecialPlot = async function (p, t) {
    var io = this.io, s = this.s, self = this;
    if (!t.special) {
      var opts = D.SPECIAL_BUILDINGS.filter(function (b) { return b.plot; }).map(function (b) { return { b: b, cost: Math.max(0, b.cost - (p.flags.vacantDisc || 0)) }; });
      if (!opts.some(function (o) { return o.cost <= p.cash; })) { if (io.info && !p.isAI) await io.info(p, t, 'เงินไม่พอสร้างบ้านพิเศษ'); return; }
      var pick = await io.chooseSpecialHouse(p, t, opts);
      var o = opts.find(function (x) { return x.b.id === pick; }); if (!o || p.cash < o.cost) return;
      p.cash -= o.cost; t.special = o.b.id; t.spOwner = p.id; if (o.b.id === 'sp_toll') t.toll = 100; p.flags.vacantDisc = 0; this.txid('spHouse');
      this.log('🏰 ' + p.name + ' สร้าง ' + o.b.th + ' (' + fmt(o.cost) + ' G)', 'buy');
      if (io.built) await io.built(p, t);
      return;
    }
    if (t.spOwner < 0) return;
    if (p.flags.timeStopUntil >= s.round && t.spOwner !== p.id) { this.log('⏱️ ' + p.name + ' หยุดเวลา — บ้านพิเศษไม่มีผล'); return; }
    if (this.mate(t.spOwner, p) && t.special !== 'sp_portal' && t.special !== 'sp_party' && t.special !== 'sp_windmill') return;
    var owner = s.players[t.spOwner]; if (owner.bankrupt) return;
    if (owner.id !== p.id && this.mate(owner, p)) owner = p; // a teammate's house works as if it were yours
    if (t.special === 'sp_portal') {
      var mine = owner.id === p.id, nw = Math.max(0, this.netWorth(p)), big = mine ? 0 : Math.round(nw * 0.10 * (1 - this.cs(p, 'tollDisc'))), small = mine ? 0 : Math.round(nw * 0.05 * (1 - this.cs(p, 'tollDisc')));
      var buyCost = mine ? 0 : Math.round(nw * 0.20);
      var warp = await io.portalChoice(p, owner, t, big, small, buyCost);
      if (warp === 'buy' && !mine) {
        var paid = await this.lose(p, buyCost, 'ซื้อบ้านประตูทะลุมิติของ ' + owner.name); owner.cash += paid;
        if (!p.bankrupt) { t.spOwner = p.id; this.txid('spHouse'); this.log('🌀🏠 ' + p.name + ' ซื้อบ้านประตูทะลุมิติต่อจาก ' + owner.name + ' ' + fmt(paid) + ' G (20% ของทรัพย์สิน)', 'rent'); if (io.built) await io.built(p, t); }
        return;
      }
      if (mine) { this.log('🌀 ' + p.name + (warp ? ' ใช้ประตูทะลุมิติของตัวเอง วาร์ปฟรี!' : ' อยู่ที่ประตูทะลุมิติของตัวเอง (ไม่วาร์ป)')); }
      else {
        var got = await this.lose(p, warp ? big : small, 'ประตูทะลุมิติของ ' + owner.name); owner.cash += got;
        this.log('🌀 ' + p.name + ' จ่าย ' + fmt(got) + ' G ให้ ' + owner.name + (warp ? ' แล้ววาร์ป!' : ' (ไม่วาร์ป)'), 'rent');
      }
      if (warp && !p.bankrupt && !s.over) {
        var dest = await io.pickTile(p, '🌀 เลือกช่องที่จะวาร์ปไป', s.tiles.filter(function (x) { return x.id !== t.id; }).map(function (x) { return x.id; }));
        if (dest === null || dest === undefined || !s.tiles[dest]) return;
        var from = p.pos; p.pos = dest; p.prev = null; if (io.teleport) await io.teleport(p, from, dest);
        var d2 = this.tile(dest); if (d2.type === 'bank') await this.arriveBank(p, true); else await this.land(p);
      }
    } else if (t.special === 'sp_party') {
      this.log(owner.id === p.id ? '🎉 ' + p.name + ' จัดปาร์ตี้ที่บ้านตัวเอง — ทุกคนต้องมาร่วม!' : '🎉 ' + p.name + ' ตกบ้านปาร์ตี้ของ ' + owner.name + ' — ทุกคนมารวมกัน!', 'rent');
      if (io.party) await io.party(p, owner, t);
      var all = this.alive();
      for (var i = 0; i < all.length; i++) { var q = all[i]; if (q.pos !== t.id) { var f0 = q.pos; q.pos = t.id; q.prev = null; if (io.teleport) await io.teleport(q, f0, t.id); } }
      for (var j = 0; j < all.length; j++) { var q2 = all[j]; if (this.mate(q2, owner) || q2.bankrupt) continue; var g2 = await this.lose(q2, 100, 'ค่าเข้าร่วมปาร์ตี้ของ ' + owner.name); owner.cash += g2; if (s.over) return; }
    } else if (t.special === 'sp_windmill' && owner.id === p.id) {
      // owner on own windmill: the wind blows 5% of every other player's cash to the owner
      var stolen = [];
      for (var w = 0; w < s.players.length; w++) { var v = s.players[w]; if (this.mate(v, p) || v.bankrupt || v.cash <= 0) continue; var amt = Math.floor(v.cash * 0.05); if (amt <= 0) continue; v.cash -= amt; p.cash += amt; stolen.push({ id: v.id, amt: amt }); }
      this.log('🌪️ ' + p.name + ' ปล่อยลมกังหัน ขโมยเงิน 5% จากทุกคน รวม ' + fmt(stolen.reduce(function (a, x) { return a + x.amt; }, 0)) + ' G', 'gain');
      if (io.windSteal) await io.windSteal(p, t, stolen);
    } else if (t.special === 'sp_windmill') {
      // the wind blows away EVERY card the player carries: all card skills + all unused loadout items/special card (this match)
      // the wind blows away: 2 random card skills + 1 collected suit + 1 carried item/special card
      var list = this.activeBuffs(p), lost = [], lostItems = [];
      for (var k = 0; k < 2 && list.length; k++) { var b = list.splice(Math.floor(this.r() * list.length), 1)[0]; p.flags[b[0]] = 0; if (b[0] === 'upgDisc') p.flags.upgDiscUntil = 0; lost.push(b); }
      var have = D.SUITS.filter(function (k2) { return p.suits[k2]; });
      if (have.length) { var su = have[Math.floor(this.r() * have.length)]; p.suits[su] = false; lostItems.push(D.SUIT_GLYPH[su] + ' สัญลักษณ์' + ({ heart: 'หัวใจ', diamond: 'ข้าวหลามตัด', clover: 'ดอกจิก', spade: 'โพดำ' }[su] || '')); }
      var free = this.loadoutSlots(p).filter(function (x) { return !x.used; });
      if (free.length) { var sl = free[Math.floor(this.r() * free.length)]; sl.used = true; sl.blown = true; sl.consumed = true; var d0 = this.itemDef(sl.id); lostItems.push('🎒 ' + (d0 ? d0.name : sl.id)); }
      var tot = lost.length + lostItems.length;
      this.log('🌬️ ' + p.name + ' ตกบ้านกังหันลมของ ' + owner.name + (tot ? ' — การ์ดปลิวหาย ' + tot + ' ใบ: ' + lost.map(function (b) { return b[1] + b[2]; }).concat(lostItems).join(', ') : ' — ไม่มีการ์ดให้ปลิว'), 'bad');
      if (io.windmill) await io.windmill(p, owner, t, lost, lostItems);
    }
  };
  P.landVacant = async function (p, t) {
    if (!t.special) {
      var opts = D.SPECIAL_BUILDINGS.filter(function (b) { return !b.plot; }).map(function (b) { return { b: b, cost: Math.max(0, b.cost - (p.flags.vacantDisc || 0)) }; }).filter(function (o) { return o.cost <= p.cash; });
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
    var C2 = C.casino, bets = C2.bets.filter(function (b) { return b <= p.cash; });
    if (!bets.length) return;
    var pick = await this.io.casinoBet(p, bets);
    if (!pick || !pick.bet || bets.indexOf(pick.bet) < 0) return;
    var bet = pick.bet, side = pick.side === 'lo' ? 'lo' : 'hi';
    var dice = [this.dice(), this.dice(), this.dice()], sum = dice[0] + dice[1] + dice[2], triple = dice[0] === dice[1] && dice[1] === dice[2];
    var res = sum >= 11 ? 'hi' : 'lo', won = res === side && !triple, win = 0, refund = false;
    if (won) { win = bet * 2; if (this.cs(p, 'casinoLuck')) win += Math.round(bet * this.cs(p, 'casinoLuck')); win = Math.min(win, C2.maxWin); }
    else if (this.cs(p, 'casinoLuck') && this.r() < this.cs(p, 'casinoLuck') / 2) { win = bet; refund = true; }
    p.cash -= bet; this.s.taxPool += Math.round(bet * 0.1); this.txid('casino');
    if (this.io.casinoShow) await this.io.casinoShow(p, dice, bet, win, side, refund);
    if (win) p.cash += win;
    this.log('🎲 ' + p.name + ' แทง' + (side === 'hi' ? 'สูง' : 'ต่ำ') + ' ' + fmt(bet) + ' G • ออก ' + dice.join('-') + ' = ' + sum + (triple ? ' (ตอง)' : '') + (won ? ' ชนะ +' + fmt(win - bet) + ' G' : refund ? ' (สกิลคืนทุน)' : ' เสียเดิมพัน'), won ? 'gain' : undefined);
  };

  // ---------- CHANCE CARDS ----------
  P.drawChance = async function (p) {
    var s = this.s;
    if (s.grid.every(Boolean)) { this.newDeck(); this.log('🔄 สับกองการ์ดใหม่'); }
    p.cardsOpened = (p.cardsOpened || 0) + 1;
    if (s.train && this.r() < D.TRAIN.ticket + this.cs(p, 'ticketLuck')) { p.tickets = (p.tickets || 0) + 1; this.log('🎫 ' + p.name + ' ได้ตั๋วรถไฟทอง!', 'gain'); if (this.io.ticket) await this.io.ticket(p); }
    var cell = await this.io.pickCard(p, s.grid.slice());
    if (s.grid[cell]) cell = s.grid.indexOf(false);
    s.grid[cell] = true; if (!s.gridOwner) s.gridOwner = s.grid.map(function () { return -1; }); s.gridOwner[cell] = p.id;
    var run = this.cardRun(cell, p.id);
    var lk = this.cs(p, 'cardLuck'), cd0 = this.cardDef(s.deck[cell]);
    if (lk && (cd0.neg || cd0.cat !== 'A') && this.r() < lk) { // lucky character: swap for an unopened money card
      var self0 = this, alt = s.deck.map(function (id, i) { return i; }).filter(function (i) { return !s.grid[i] && self0.cardDef(s.deck[i]).cat === 'A' && !self0.cardDef(s.deck[i]).neg; });
      if (alt.length) { var j0 = alt[Math.floor(this.r() * alt.length)], tmp = s.deck[cell]; s.deck[cell] = s.deck[j0]; s.deck[j0] = tmp; this.log('🍀 สกิล ' + p.name + ': ได้การ์ดเงินแทน!'); }
    }
    var self1 = this, sig = function () { return { t: s.tiles.map(function (t) { return t.type === 'shop' || t.type === 'vacant' ? [t.owner, t.level, t.invest || 0, t.bonusVal || 0, t.bonusPct || 0, t.type].join(',') : ''; }), d: s.districts.map(function (d, i) { return d.price + '|' + s.players.map(function (q) { return q.shares[i] || 0; }).join(','); }) }; };
    var before = sig();
    this._inCard = true;
    try { await this.applyCard(p, s.deck[cell], cell); } finally { this._inCard = false; }
    if (this.io.cardFx && !s.over) {
      var after = sig(), ct = [], cd = [];
      after.t.forEach(function (v, i) { if (v !== before.t[i]) ct.push(i); });
      after.d.forEach(function (v, i) { if (v !== before.d[i]) cd.push(i); });
      if (ct.length || cd.length) await this.io.cardFx(p, ct, cd);
    }
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
    if (c.neg && this.cs(p, 'negShield') && this.r() < this.cs(p, 'negShield')) { this.log('🩺 สกิล ' + p.name + ': ป้องกันผลเสียของการ์ด'); if (this.io.toast) this.io.toast('🩺 สกิล ' + p.name + ' ป้องกันผลเสียการ์ด!'); return; }
    if (c.neg) {
      if (p.flags.insurance > 0) { p.flags.insurance = 0; this.log('🛡️ Insurance ป้องกันผลเสียของการ์ด'); if (this.io.toast) this.io.toast('🛡️ Insurance ป้องกันผลเสีย!'); return; }
      var u = await this.offerReactive(p, 'negative', { card: c }); if (u) { this.log('🛡️ ป้องกันผลเสียด้วย ' + u); return; }
    }
    var fx = CARD_FX[id]; if (fx) await fx(this, p, c);
  };

  var CARD_FX = {};
  // one-time skill: same kind never stacks — the new card replaces the old one
  function buff(g, p, key, val) {
    var b = (D.BUFFS || []).find(function (x) { return x[0] === key; }) || [key, '✨', key];
    if (p.flags[key]) g.log('🔁 ' + p.name + ' ได้สกิล “' + b[2] + '” ซ้ำ — ใบใหม่แทนที่ใบเดิม (ไม่สะสม)');
    else g.log('✨ ' + p.name + ' ได้สกิล ' + b[1] + ' ' + b[2] + ' (ใช้ได้ครั้งเดียว)');
    p.flags[key] = val || 1;
  }
  Game.buff = buff;
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
  CARD_FX[17] = function (g, p) { buff(g, p, 'upgDisc', 0.2); p.flags.upgDiscUntil = g.s.round + 1; };
  CARD_FX[18] = function (g, p, c) { if (g.shopsOf(p).length) return g.gain(p, 500, c.name, true); g.log('ไม่มีร้าน — ไม่มีผล'); };
  CARD_FX[19] = function (g, p) { buff(g, p, 'newBranch'); };
  CARD_FX[20] = async function (g, p) { var d = await g.pickDistrict(p, 'เลือกเขต Business Boom', true); var b = g.districtValue(d); g.shopsOf(p).forEach(function (t) { if (t.district === d) t.bonusPct += 0.05; }); g.valueChanged(d, b); };
  CARD_FX[21] = gainFx(500);
  CARD_FX[22] = function (g, p) { buff(g, p, 'builderDisc'); };
  CARD_FX[23] = function (g, p) { buff(g, p, 'freeUpgrade'); };
  CARD_FX[24] = function (g, p) { buff(g, p, 'vacantDisc', 1000); };
  CARD_FX[25] = function (g, p) { buff(g, p, 'maintHalf', g.s.round + 1); };
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
  CARD_FX[34] = function (g, p) { buff(g, p, 'hotelDisc'); };
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
  CARD_FX[60] = function (g, p) { buff(g, p, 'freeRide'); };
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
  CARD_FX[63] = function (g, p) { buff(g, p, 'buyoutDisc', 0.1); };
  CARD_FX[64] = function (g, p) { buff(g, p, 'rentHalf'); };
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
  CARD_FX[69] = function (g, p) { buff(g, p, 'buyoutDisc', 0.1); };
  CARD_FX[70] = function (g, p) { g.s.players.forEach(function (q) { if (q.id !== p.id) q.flags.buyoutDisc = 0; }); };
  CARD_FX[71] = function (g, p) { buff(g, p, 'rentShield'); };
  CARD_FX[72] = function (g, p) { buff(g, p, 'taxHalf'); };
  CARD_FX[73] = function (g, p) { var ids = g.shopsOf(p).map(function (t) { return t.id; }); g.s.effects = g.s.effects.filter(function (e) { return !((e.kind === 'noRent' || e.kind === 'noUpgrade') && ids.indexOf(e.tile) >= 0); }); };
  CARD_FX[74] = function (g, p) { buff(g, p, 'insurance'); };
  CARD_FX[75] = function (g, p) { var v = Math.min(1000, Math.max(0, p.cash)); p.cash -= v; p.safe += v; g.log('🔐 ฝากเงิน ' + fmt(v) + ' G ในบัญชีคุ้มครอง'); };
  CARD_FX[76] = function (g, p) { p.shares.forEach(function (n, d) { if (n) g.addEffect({ kind: 'priceLock', district: d, rounds: 1 }); }); };
  CARD_FX[77] = function (g, p) { buff(g, p, 'shopProtect'); };
  CARD_FX[78] = function (g, p) { buff(g, p, 'maintFree'); };
  CARD_FX[79] = function (g, p) { buff(g, p, 'taxExempt'); };
  CARD_FX[80] = function (g, p, c) { if (p.cash < 1000) return g.gain(p, 1000, c.name, true); g.log('เงินสดมากกว่า 1,000 G — ไม่มีผล'); };
  CARD_FX[81] = gainFx(500);
  CARD_FX[82] = async function (g, p) { var d = await g.pickDistrict(p, 'Weekend Market — เลือกเขต', true); var list = g.s.districts[d].tiles.map(function (id) { return g.tile(id); }).filter(function (t) { return t.owner >= 0; }); for (var i = 0; i < list.length; i++) { var q = g.s.players[list[i].owner]; if (!q.bankrupt) await g.gain(q, 300, 'Weekend Market', false); } };
  CARD_FX[83] = function (g) { g.addEffect({ kind: 'rentMult', district: 3, mult: 1.2, rounds: 2 }); };
  CARD_FX[84] = function (g) { g.addEffect({ kind: 'rentMult', hotels: true, mult: 0.9, rounds: 1 }); };
  CARD_FX[85] = function (g) { g.addEffect({ kind: 'rentMult', hotels: true, mult: 1.1, rounds: 1 }); };
  CARD_FX[86] = function (g, p) { buff(g, p, 'winterSale'); };
  CARD_FX[87] = function (g) { g.s.districts.forEach(function (d, i) { g.stockMove(i, 0.03, 'City Development'); }); };
  CARD_FX[88] = async function (g, p) { var d = await g.pickDistrict(p, 'Public Construction — เลือกเขต', true); var b = g.districtValue(d); g.shopsOf(p).forEach(function (t) { if (t.district === d) t.bonusPct += 0.05; }); g.valueChanged(d, b); };
  CARD_FX[89] = function (g, p, c) { if (g.shopsOf(p).length >= 3) return g.gain(p, 1000, c.name, true); };
  CARD_FX[90] = async function (g, p) { var a = g.alive(); for (var i = 0; i < a.length; i++) await g.lose(a[i], 200, 'City Tax Day', false, true); };
  CARD_FX[91] = gainFx(500);
  CARD_FX[92] = function (g, p, c) { return g.lose(p, 300, c.name, true, true); };
  CARD_FX[93] = function (g, p, c) { return g.lose(p, 500, c.name, true); };
  CARD_FX[94] = async function (g, p, c) { var r = g.rand(0, 3); if (r === 0) await g.gain(p, g.rand(3, 15) * 100, 'ของขวัญ', true); else if (r === 1) { g.giveShares(p, g.bestHeldDistrict(p), 5); } else if (r === 2) { buff(g, p, 'rentShield'); } else { buff(g, p, 'insurance'); } };
  CARD_FX[95] = function (g, p) { var l = g.shopsOf(p); if (l.length) { var t = l[Math.floor(g.r() * l.length)]; g.addEffect({ kind: 'noRent', tile: t.id, rounds: 1 }); g.log('🔧 ' + t.name + ' เสีย — ไม่เก็บค่าเช่า 1 รอบ'); } };
  CARD_FX[97] = async function (g, p, c) { g.giveShares(p, g.bestHeldDistrict(p), 5); await g.gain(p, 500, c.name, true); };
  CARD_FX[98] = async function (g, p) { var a = g.dice(), b = g.dice(); var n = await g.choose(p, { title: 'Lucky Dice — เลือกผล', kind: 'num', options: [{ value: a, label: '🎲 ' + a, score: a }, { value: b, label: '🎲 ' + b, score: b }] }); return cardMove(g, p, n); };
  CARD_FX[99] = function (g, p) { buff(g, p, 'insurance'); };
  CARD_FX[100] = async function (g, p, c) { await g.gain(p, 1000, c.name, true); var t = await g.pickOwnShop(p, 'Fortune Day — ร้านมูลค่า +5%'); if (t) { var b = g.districtValue(t.district); t.bonusPct += 0.05; g.valueChanged(t.district, b); } };

  function SUITS_DONE(p) { return D.SUITS.every(function (s) { return p.suits[s]; }); }
  Game.suitsDone = SUITS_DONE;
  P.activeBuffs = function (p) { var r = this.s.round; return (D.BUFFS || []).filter(function (b) { var v = p.flags[b[0]]; if (!v) return false; if (b[0] === 'upgDisc') return !p.flags.upgDiscUntil || p.flags.upgDiscUntil >= r; if (b[0] === 'maintHalf') return v >= r; return true; }); };
  Game.buildBoard = buildBoard;
  Game.fmt = fmt;
  Game.CARD_FX = CARD_FX;

  // run loop
  P.run = async function () { var n = 0; while (!this.s.over) { await this.playTurn(); if (++n > 100000) break; } return this.s; };

  if (typeof module !== 'undefined') module.exports = Game; else root.Game = Game;
})(this);
