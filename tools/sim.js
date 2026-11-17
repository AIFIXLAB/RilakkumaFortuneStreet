const path=__dirname+'/../';
const D=require(path+'data.js'), Game=require(path+'engine.js'), AI=require(path+'ai.js');
function aiIO(g){return {
 preRoll:p=>AI.preRoll(g,p), chooseDir:(p,o,r)=>AI.chooseDir(g,p,o,r), confirmBuy:(p,t,pr)=>AI.confirmBuy(g,p,t,pr),
 chooseUpgrade:(p,t,o)=>AI.chooseUpgrade(g,p,t,o), confirmBuyout:(p,t,c)=>AI.confirmBuyout(g,p,t,c), bank:(p,s)=>AI.bank(g,p,s),
 broker:p=>AI.broker(g,p), pickCard:(p,gr)=>AI.pickCard(g,p,gr), choose:(p,r)=>AI.choose(g,p,r), confirmUse:(p,d,c)=>AI.confirmUse(g,p,d,c),
 confirmDeal:(q,t,v)=>AI.confirmDeal(g,q,t,v), auctionBid:(q,t,c)=>AI.auctionBid(g,q,t,c), casinoBet:(p,b)=>AI.casinoBet(g,p,b),
 chooseBuilding:(p,t,o)=>AI.chooseBuilding(g,p,t,o), chooseNumber:(p,t,a,b)=>AI.chooseNumber(g,p,t,a,b),
}}
// map validation
D.MAPS.forEach((m,i)=>{const b=Game.buildBoard(i);const shops=b.tiles.filter(t=>t.type==='shop');
 const seen=new Set([0]),q=[0];while(q.length){const t=b.tiles[q.shift()];t.n.forEach(n=>{if(!seen.has(n)){seen.add(n);q.push(n)}})}
 const dead=b.tiles.filter(t=>t.n.length<2).map(t=>t.ch+'@'+t.x+','+t.y);
 const suits=b.tiles.filter(t=>t.type==='suit').length;
 console.log(m.id,'tiles',b.tiles.length,'shops',shops.length,'per district',b.districts.map(d=>d.tiles.length).join('/'),'connected',seen.size===b.tiles.length,'suits',suits,'dead-ends',dead.join(' '),'banks',b.tiles.filter(t=>t.type==='bank').length);
});
(async()=>{
 const N=+process.argv[2]||40; const res=[]; const lv=['beginner','normal','advanced'];
 for(let k=0;k<N;k++){
  const st=Game.create({mapIdx:k%4,seed:1000+k,players:[0,1,2,3].map(i=>({name:'AI'+i,char:i,isAI:true,aiLevel:lv[(i+k)%3],persona:D.AI_PERSONAS[(i+k)%5],loadout:{eq:['eq_lucky','eq_rent'],sc:'SC_cash'}}))});
  const g=new Game(st,null); g.io=aiIO(g);
  const t0=Date.now(); await g.run(); const s=g.s;
  res.push({map:k%4,rounds:s.round,winner:s.winner,why:s.endReason,bk:s.players.filter(p=>p.bankrupt).length,ms:Date.now()-t0,
   nw:s.players.map(p=>g.netWorth(p)),lvl:s.players.map(p=>p.ai.level), maxLv:Math.max(...s.tiles.map(t=>t.level)), prices:s.districts.map(d=>d.price)});
 }
 res.forEach(r=>console.log(JSON.stringify(r)));
 const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
 console.log('avg rounds',avg(res.map(r=>r.rounds)).toFixed(1),'bankrupt/game',avg(res.map(r=>r.bk)).toFixed(2));
 const wins={}; res.forEach(r=>{if(r.winner!=null){const l=r.lvl[r.winner];wins[l]=(wins[l]||0)+1}}); console.log('wins by level',wins);
})();
