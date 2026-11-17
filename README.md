# RILAKKUMA FORTUNE STREET — v0.1 (Playable Prototype)

HTML5 board game, playable on iPad (landscape, touch) and in any modern browser. It runs fully offline.
Open `index.html` through any static web server, or use the published artifact link.

## How to play
1. **เข้าเกม** (Play) or **เล่นกับ AI** (Play with AI) → choose 1 of the 4 maps, set up P1–P4 (Human / AI Easy·Normal·Adv / Off), and pick the match length.
2. **Pre-Match Setup**: choose a character and costume, up to 2 pieces of equipment, and 1 special card → **Ready & Start Game**.
3. Each turn: tap **ทอยลูกเต๋า** (Roll) → at junctions, tap the pink arrow to pick a direction → a popup appears depending on the tile you land on.
4. Tap a tile, a player card or the stock panel at any time to see details.

## Systems implemented (per GDD + SHOP spec)
| System | Status |
|---|---|
| **4 painted maps from the owner's art** used as the real board: Sakura Park (117 tiles/10 districts/50 shops), Hydrangea Isles (38/5/19), Snow Village (29/4/12), Riverside Town (30/5/12 + buildings shown on the 4 lots) | ✅ |
| Shops turn **the owner's colour** (border + glow + character badge) once bought | ✅ |
| Map zoom/pan: pinch, drag, scroll, ＋/－ buttons, ⤢ fit, 🎯 jump to current player, 📷 auto-follow | ✅ |
| 10×10 card grid: opened cards take the player's colour; a streak of 3+ in a row/column/diagonal gives a bonus (3→300 … 10→5,000 G) | ✅ |
| **Districts:** shops in the same district share a border colour and a coloured zone, with a district name plate on the board | ✅ |
| **Fortune Street-style district bonus:** 2 shops +5%, 3 shops +10%, all shops = Monopoly ×1.20; investment cap rises with shops owned (1→Lv4, 2→Lv6, 3→Lv7, all→Lv8) | ✅ |
| 8-level upgrades (small house → luxury hotel), building art changes per level | ✅ |
| Rent = Base × District × Monopoly × Event (cap 5,000) → 85% owner / 5% city tax / 10% dividend pool | ✅ |
| Stocks for 5 districts (1,000 shares; max 500 per player; buy fee 1%, sell fee 2%; ±15% per move; floor 10 G) | ✅ |
| Automatic dividends with duplicate-payment guard (Transaction ID) | ✅ |
| Bank: 4 suits → salary 300 + Lv×100 + 2% of property value, level up, invest in any shop when stopping there | ✅ |
| Taxes: rent tax, Tax tile (300 G or 3%, cap 1,000), property tax every 5 turns (cap 500), sale fees | ✅ |
| Buy shop / 5× buyout / sell back at 75% / trade / auction (via cards) | ✅ |
| Vacant land + 6 special buildings (Toll Gate, Parking, Flower Garden, Market, Hotel, Onsen) | ✅ |
| All 100 chance cards with effects, picked from a 10×10 card grid | ✅ |
| Lucky / Super Lucky (pay out from the city tax pool), Casino slot machine (capped winnings), Warp, Festival, Event, Rest, Broker | ✅ |
| AI with 3 difficulty levels × 5 personalities | ✅ |
| Automatic liquidation for bankruptcy (stocks → buildings → shops) / win condition (target + return to bank) / round limit | ✅ |
| Save/Load: auto-save every turn + 3 manual slots + Continue | ✅ |
| SHOP with 7 categories (Recommended + sorting, Buildings & Decorations, Characters & Costumes, Equipment, Special Cards, Packages, Currency Exchange) + purchase history | ✅ |
| Inventory (9 categories), profile decoration (personal town), 7-day daily login, end-of-match rewards | ✅ |
| Pre-match loadout: 2 equipment + 1 special card, each usable once per match, with a confirm dialog. The Use button is disabled when the situation doesn't fit. Items are deducted from Inventory only when actually used | ✅ |
| Online / Tournament | ⏳ Next phase (Offline first, per GDD §29) |

## Project structure (data-driven)
```
index.html   – layout + CSS (1280×860 stage, auto-scaled to fit the iPad)
data.js      – CONFIG (all economy values), MAPS (ASCII grid), 100 cards, SHOP catalog
engine.js    – game logic (no DOM) – runs in both browser and Node
ai.js        – AI decision-making
meta.js      – profile / shop / inventory / daily login (localStorage)
ui.js        – touch UI, popups, animations
music.js     – procedural kawaii J-pop BGM generator (WebAudio, new song every time)
atlas.js     – sprite coordinates sliced from the owner's asset sheets
assets/      – asset sheets converted to WebP
tools/       – sim.js (Economy Simulator), slice2.py (asset slicer)
```

### Adding a new map (from painted art)
Add an entry to `MAPS` in `data.js` with `bg` (an image in assets/) and `paths`: each path is a string of `x,y,TYPE` tokens in image pixel coordinates. Consecutive tokens are connected, `>` closes a loop, and tokens at the same position become the same tile (that is how junctions are made).
TYPE: `#n` = shop of district n, `+` after a type = draw the game icon over a plain painted tile, `P` = walkway, `B` bank, `H D C S` suits, `?` chance, `L/U` lucky, `T` tax, `K` casino, `M` broker, `V` vacant land, `W` warp (pairs), `R` rest, `F` festival, `E` event.

### Balance tuning
Edit `CONFIG` in `data.js`, then run `node tools/sim.js 200` to test with the AI.
Simulation results with the GDD default values (120 AI-only matches per setting):
- Quick (target 20,000): ~48 rounds on average
- Standard (target 30,000): ~80 rounds on average; no runaway economy, and the AI finishes every match
- Advanced AI wins noticeably more often than Beginner
