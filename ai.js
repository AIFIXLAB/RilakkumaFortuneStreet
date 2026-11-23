// ===================== AI OPPONENTS =====================
// Levels: beginner / normal / advanced. Personas bias choices (Investor, Tycoon, Aggressive, Defensive, Balanced).
(function (root) {
  var D = (typeof module !== 'undefined') ? require('./data.js') : root;
  var Game = (typeof module !== 'undefined') ? require('./engine.js') : root.Game;
  var C = D.CONFIG;

  // Score for landing on a tile (used for paths, taxi, golden dice)
  Game.prototype.landScore = function (p, t) {
    var g = this;
    switch (t.type) {
      case 'bank': return Game.suitsDone(p) ? 900 : 60;
      case 'shop':
        if (t.owner < 0) return p.cash >= g.buyPrice(t) ? 250 + g.ownedIn(p.id, t.district) * 120 : 0;
        if (t.owner === p.id || g.mate(t.owner, p)) return 120 + (g.maxCapital(t) > 0 && p.cash > 1500 ? 260 : 0);
        return -g.shopRent(t) * (1 + (g.shopRent(t) > p.cash ? 3 : 0)) / 2;
      case 'chance': return 90; case 'splot': return !t.special ? (p.cash > 2500 ? 140 : 20) : g.mate(t.spOwner, p) ? (t.special === 'sp_party' ? 100 * (g.alive().length - 1) : t.special === 'sp_windmill' ? g.alive().reduce(function (a, q) { return a + (q.id !== p.id ? Math.max(0, q.cash) * 0.05 : 0); }, 0) : t.special === 'sp_portal' ? 200 : 10) : t.special === 'sp_portal' ? -g.netWorth(p) * 0.05 : t.special === 'sp_party' ? -100 * (g.alive().length - 1) : t.special === 'sp_windmill' ? -120 * g.activeBuffs(p).length - (g.loadoutSlots(p).some(function (x) { return !x.used; }) ? 150 : 0) - 120 * D.SUITS.filter(function (k) { return p.suits[k]; }).length : -50; case 'rollon': return 150; case 'switch': return 20; case 'road': return 0; case 'lucky': return 140; case 'superlucky': return 220; case 'tax': return -150;
      case 'casino': return 30; case 'broker': return 60; case 'vacant': return t.special ? (t.spOwner === p.id || t.spOwner < 0 ? 10 : -300) : 50;
      case 'suit': return (p.suits[t.suit] ? 10 : 160) + 90; case 'rest': return 50; case 'festival': return 60; case 'event': return 60; case 'warp': return 40;
    }
    return 0;
  };

  function reserve(g, p) {
    var lvl = p.ai.level;
    if (lvl === 'beginner') return 400;
    // biggest rival rent on the board
    var maxRent = 0;
    g.s.tiles.forEach(function (t) { if (t.type === 'shop' && t.owner >= 0 && !g.mate(t.owner, p)) maxRent = Math.max(maxRent, g.shopRent(t)); });
    var base = lvl === 'advanced' ? 900 + maxRent * 0.8 : 700 + maxRent * 0.5;
    if (p.ai.persona === 'Defensive') base *= 1.5;
    if (p.ai.persona === 'Aggressive') base *= 0.7;
    return base * (AI.reserveMult || 1);
  }
  function noise(g, p) { return p.ai.level === 'beginner' ? 0.6 : p.ai.level === 'normal' ? 0.25 : 0.05; }

  function pathScore(g, p, path) {
    var s = 0, suits = Object.assign({}, p.suits), bank = g.bankId();
    for (var i = 0; i < path.length; i++) {
      var t = g.tile(path[i]);
      if (t.type === 'suit' && !suits[t.suit]) { suits[t.suit] = 1; s += 140; }
      if (t.type === 'bank') s += D.SUITS.every(function (x) { return suits[x]; }) ? 1000 : 40;
      if (t.special === 'toll' && t.spOwner >= 0 && t.spOwner !== p.id) s -= 200;
      if (t.special === 'sp_toll' && t.spOwner >= 0 && t.spOwner !== p.id) s -= (t.toll || 100) * 1.5;
    }
    var end = g.tile(path[path.length - 1]);
    s += g.landScore(p, end);
    // long-term: head toward bank when suits complete, toward missing suits otherwise
    if (D.SUITS.every(function (x) { return suits[x]; })) s -= g.dist(end.id, bank) * 25;
    else {
      var md = 99; g.s.tiles.forEach(function (t) { if (t.type === 'suit' && !suits[t.suit]) md = Math.min(md, g.dist(end.id, t.id)); });
      s -= md * 8;
    }
    return s;
  }

  var AI = { reserveMult: 1,
    preRoll: async function (g, p) {
      // sell stock if very low cash
      if (p.cash < 300) { for (var d = 0; d < p.shares.length && p.cash < 800; d++) if (p.shares[d]) g.sellStock(p, d, Math.min(p.shares[d], Math.ceil((800 - p.cash) / g.s.districts[d].price))); }
      var slots = g.loadoutSlots(p);
      for (var i = 0; i < slots.length; i++) {
        var sl = slots[i], def = g.itemDef(sl.id); if (sl.used || !def || def.when !== 'preRoll') continue;
        if (def.id === 'eq_golden') {
          // choose exact roll with best outcome
          var best = 0, bv = -1e9; for (var n = 1; n <= 6; n++) { g.endpoints(p.pos, p.prev, n).forEach(function (e) { var v = pathScore(g, p, e.path); if (v > bv) { bv = v; best = n; } }); }
          if (bv > 300) { AI._golden = best; await g.usePreRoll(p, sl); AI._golden = null; }
          continue;
        }
        if (def.id === 'eq_travel' || def.id === 'SC_home') { if (Game.suitsDone(p) && g.dist(p.pos, g.bankId()) > 6) await g.usePreRoll(p, sl); continue; }
        if (def.id === 'SC_value' && !g.shopsOf(p).length) continue;
        if (def.id === 'eq_stock' && !p.shares.some(Boolean)) continue;
        await g.usePreRoll(p, sl);
      }
    },
    chooseNumber: function (g, p, title, a, b) { if (AI._golden) return AI._golden; return Math.max(a, Math.min(b, b)); },
    chooseDir: function (g, p, opts, remaining) {
      if (g.r() < noise(g, p) * 0.5) return opts[Math.floor(g.r() * opts.length)];
      var best = opts[0], bv = -1e9;
      opts.forEach(function (o) {
        var ends = g.endpoints(o, p.pos, remaining - 1), v = -1e9;
        ends.forEach(function (e) { v = Math.max(v, pathScore(g, p, [o].concat(e.path))); });
        if (!ends.length) v = pathScore(g, p, [o]);
        if (v > bv) { bv = v; best = o; }
      });
      return best;
    },
    confirmBuy: function (g, p, t, price) {
      var r = reserve(g, p) * (p.ai.persona === 'Tycoon' ? 0.6 : 1);
      if (p.ai.persona === 'Investor' && g.ownedIn(p.id, t.district) === 0 && g.r() < 0.3) return false;
      var linked = t.n.some(function (id) { var u = g.tile(id); return u.type === 'shop' && u.owner === p.id; });
      return p.cash - price >= r * (linked ? 0.3 : 0.5);
    },
    chooseInvest: function (g, p, t, o) {
      var r = reserve(g, p), spare = p.cash - r;
      var aggr = p.ai.level === 'beginner' ? 0.45 : p.ai.level === 'normal' ? 0.7 : 0.9;
      if (p.ai.persona === 'Tycoon' || p.ai.persona === 'Aggressive') aggr += 0.1; if (p.ai.persona === 'Investor') aggr -= 0.1;
      if (spare < 300) return null;
      // best target: highest rent gain per gold (dominated / big districts first)
      var best = null, bv = 0;
      o.list.forEach(function (x) { var m = g.maxInvest(p, x.tile); if (m <= 0) return; var a = Math.min(m, Math.floor(spare * aggr / 10) * 10); if (a < Math.min(200, m)) return; var gain = g.rentAfterInvest(x.tile, a) - g.shopRent(x.tile); var v = gain / a + (x.tile.id === t.id ? 0.01 : 0); if (v > bv) { bv = v; best = { id: x.tile.id, amount: a }; } });
      return best;
    },
    confirmBuyout: function (g, p, t, cost) {
      if (p.ai.level === 'beginner') return false;
      var after = g.ownedIn(p.id, t.district) + 1, n = g.s.districts[t.district].tiles.length;
      var want = after >= n ? 1 : after >= 2 ? 0.6 : 0.2;
      if (p.ai.persona === 'Aggressive') want += 0.3;
      return p.cash - cost > reserve(g, p) * 1.3 && g.r() < want;
    },
    bank: async function (g, p, stopped) {
      var r = reserve(g, p);
      await AI.stocks(g, p, r);
    },
    stocks: async function (g, p, r) {
      if (p.ai.level === 'beginner' && g.r() < 0.6) return;
      var spare = p.cash - r * 1.2; if (spare < 300) return;
      var frac = p.ai.persona === 'Investor' ? 0.6 : p.ai.persona === 'Defensive' ? 0.15 : 0.3;
      if (p.ai.level === 'advanced') frac += 0.1;
      var bestD = -1, bv = -1e9;
      g.s.districts.forEach(function (d, i) {
        var mine = g.ownedIn(p.id, i), val = g.districtValue(i), dom = d.tiles.every(function (id) { return g.tile(id).owner === p.id; });
        var v = mine * 3 + (dom ? 8 : 0) + (val / 4000) - d.price / 150 + (p.ai.level === 'advanced' ? (d.hist.length > 2 ? (d.price - d.hist[d.hist.length - 3]) / d.price * 10 : 0) : 0);
        if (g.maxBuyShares(p, i) <= 0) v = -1e9;
        if (v > bv) { bv = v; bestD = i; }
      });
      if (bestD < 0) return;
      var n = Math.min(g.maxBuyShares(p, bestD), Math.floor(spare * frac / g.s.districts[bestD].price));
      n = Math.min(99, n >= 50 ? Math.floor(n / 10) * 10 : n);
      if (n >= 5) g.buyStock(p, bestD, n);
    },
    broker: async function (g, p) {
      // advanced: take profit on held districts with poor prospects
      if (p.ai.level !== 'beginner') p.shares.forEach(function (n, d) { if (n && g.ownedIn(p.id, d) === 0 && g.s.districts[d].hist.length > 3 && g.s.districts[d].price > g.s.districts[d].hist[0] * 1.6 && g.r() < 0.5) g.sellStock(p, d, n); });
      await AI.stocks(g, p, reserve(g, p));
    },
    pickCard: function (g, p, grid) {
      var free = []; grid.forEach(function (u, i) { if (!u) free.push(i); });
      if (p.ai.level === 'beginner' || !g.s.gridOwner) return free[Math.floor(g.r() * free.length)];
      // aim for the longest streak of own colour
      var o = g.s.gridOwner, best = free[0], bv = -1;
      free.forEach(function (c) { o[c] = p.id; var v = g.cardRun(c, p.id) + g.r() * (p.ai.level === 'normal' ? 1.5 : 0.3); o[c] = -1; if (v > bv) { bv = v; best = c; } });
      return best;
    },
    choose: function (g, p, req) {
      if (!req.options.length) return null;
      var nz = noise(g, p), best = req.options[0], bv = -1e9;
      req.options.forEach(function (o) { var v = (o.score || 0) * (1 + (g.r() - 0.5) * nz); if (v > bv) { bv = v; best = o; } });
      return best.value;
    },
    confirmUse: function (g, p, def, ctx) {
      if (def.when === 'gain') return ctx.amt >= 800;
      if (def.when === 'upgrade') return ctx.cost >= 600;
      if (def.when === 'tax') return ctx.amt >= 300;
      if (def.when === 'postRoll') {
        if (def.id === 'eq_lucky') { var ends = g.endpoints(p.pos, p.prev, ctx.roll); var v = Math.max.apply(null, ends.map(function (e) { return pathScore(g, p, e.path); })); return v < -200; }
        var ends2 = g.endpoints(p.pos, p.prev, ctx.roll), v2 = Math.max.apply(null, ends2.map(function (e) { return pathScore(g, p, e.path); }));
        var add = def.id === 'eq_move' ? 1 : 2, ends3 = g.endpoints(p.pos, p.prev, ctx.roll + add), v3 = Math.max.apply(null, ends3.map(function (e) { return pathScore(g, p, e.path); }));
        return v3 > v2 + 150;
      }
      return true;
    },
    confirmDeal: function (g, q, text, gainForQ) { return gainForQ >= 0 ? g.r() < 0.7 : (q.cash > 4000 && g.r() < 0.4); },
    auctionBid: function (g, q, t, current) { var v = g.shopValue(t), want = v * (g.ownedIn(q.id, t.district) ? 1.4 : 1.05); var bid = Math.round(Math.min(want, q.cash - reserve(g, q)) / 10) * 10; return bid > current ? bid : 0; },
    casinoBet: function (g, p, bets) { if (!bets.length || p.ai.persona === 'Defensive' || p.cash < 3000) return 0; return g.r() < 0.5 ? bets[0] : 0; },
    chooseSpecialHouse: function (g, p, t, opts) {
      var r = reserve(g, p), aff = opts.filter(function (o) { return p.cash - o.cost >= r * 0.8; });
      if (!aff.length) return null;
      var traffic = t.n.length > 2 || g.s.tiles.some(function (x) { return x.type === 'bank' && g.dist(x.id, t.id) <= 4; });
      var pref = traffic ? ['sp_toll', 'sp_portal', 'sp_party', 'sp_windmill'] : ['sp_portal', 'sp_toll', 'sp_party', 'sp_windmill'];
      if (p.ai.level === 'beginner') return aff[Math.floor(g.r() * aff.length)].b.id;
      aff.sort(function (a, b) { return pref.indexOf(a.b.id) - pref.indexOf(b.b.id); });
      return aff[0].b.id;
    },
    dragonBet: function (g, p, pot, opts) {
      if (p.ai.level === 'beginner') return Math.random() < 0.4 ? opts[0] : 0;
      var best = 0, bv = -120;
      opts.forEach(function (b) { var c = g.dragonChance(b), ev = c * pot - (1 - c) * (b + 120); if (ev > bv && b <= p.cash * 0.3) { bv = ev; best = b; } });
      return best;
    },
    portalChoice: function (g, p, owner, t, big, small) {
      var best = -1e9;
      if (owner.id === p.id) { g.s.tiles.forEach(function (x) { if (x.id !== t.id) best = Math.max(best, g.landScore(p, x)); }); return best > 60; }
      if (p.ai.level === 'beginner') return false;
      best = -1e9; g.s.tiles.forEach(function (x) { if (x.id !== t.id) best = Math.max(best, g.landScore(p, x)); });
      return best - (big - small) / 10 > 250 && p.cash > big + 500;
    },
    pickTile: function (g, p, title, ids) {
      var best = ids[0], bv = -1e9; ids.forEach(function (id) { var v = g.landScore(p, g.tile(id)) + g.r() * 20; if (v > bv) { bv = v; best = id; } }); return best;
    },
    chooseBuilding: function (g, p, t, opts) {
      var r = reserve(g, p); var aff = opts.filter(function (o) { return p.cash - o.cost >= r * 1.2; });
      if (!aff.length) return null;
      var pref = ['toll', 'onsen', 'hotel', 'parking', 'market', 'garden'];
      if (p.ai.level === 'beginner') return aff[Math.floor(g.r() * aff.length)].b.id;
      aff.sort(function (a, b) { return pref.indexOf(a.b.id) - pref.indexOf(b.b.id); });
      return aff[0].b.id;
    },
  };

  if (typeof module !== 'undefined') module.exports = AI; else root.AI = AI;
})(this);
