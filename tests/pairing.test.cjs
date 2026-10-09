const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../pairing.js');
const state = (l, f) => S.updateRoster(S.empty(), Array.from({length:l}, (_,i)=>`L${i}`), Array.from({length:f}, (_,i)=>`F${i}`));
const rng = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

test('coverage, unique pairs and balanced appearances in equal and unequal groups', () => {
  for (const [l, f] of [[1,1],[4,4],[2,7],[7,2],[1,6],[6,1],[3,5],[5,3]]) {
    const s = state(l, f), before = JSON.stringify(s), p = S.generate(s, 12, rng(42));
    const total = Array(Math.min(l,f)).fill(0);
    for (const pairs of p.rounds) {
      assert.equal(pairs.length, Math.max(l,f));
      assert.equal(new Set(pairs.map(p=>p.join(':'))).size, pairs.length);
      assert.equal(new Set(pairs.map(p=>p[0])).size, l);
      assert.equal(new Set(pairs.map(p=>p[1])).size, f);
      const counts = Array(Math.min(l,f)).fill(0);
      pairs.forEach(([a,b]) => { const i = l <= f ? a : b; counts[i]++; total[i]++; });
      assert.ok(Math.max(...counts)-Math.min(...counts)<=1);
      assert.ok(Math.max(...total)-Math.min(...total)<=1);
    }
    assert.equal(JSON.stringify(s), before);
    S.generate(s, 3); assert.equal(JSON.stringify(s), before);
  }
});
test('working history produces full pair variety before repeating for equal groups', () => {
  const p = S.generate(state(4,4), 4, rng(3));
  assert.equal(new Set(p.rounds.flat().map(p=>p.join(':'))).size,16);
});
test('global assignment avoids a greedy expensive final pair', () => {
  const s=state(2,2); s.history=[[0,1],[1,100]];
  const p=S.generate(s,1,rng(7));
  assert.equal(p.rounds[0].reduce((sum,[l,f])=>sum+s.history[l][f],0),2);
});
test('equal choices vary with random seeds', () => {
  const options = new Set(Array.from({length:20},(_,i)=>JSON.stringify(S.generate(state(3,3),1,rng(i)).rounds[0].sort())));
  assert.ok(options.size>1);
});
test('roster edits preserve history by normalized name and drop removed pairs', () => {
  const s=state(2,2); s.history=[[3,4],[5,6]];
  const next=S.updateRoster(s,['l1','New'],['F1','f0']);
  assert.deepEqual(next.history,[[6,5],[0,0]]);
});
test('reject invalid rosters and history without mutating state', () => {
  assert.throws(()=>S.roster(['A'],[' a ']));
  assert.throws(()=>S.roster(['Ａ'],['A']));
  assert.throws(()=>S.roster(['A',''],[]));
  assert.throws(()=>S.roster([null],[]));
  assert.throws(()=>S.roster(['Two\nNames'],[]));
  for(const value of [-1,1.5,'1',null,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>S.count(value));
  for(const amount of [0,-1,1.5,NaN,Infinity]) assert.throws(()=>S.generate(state(1,1),amount));
  assert.throws(()=>S.generate(state(0,1),1));
});
test('record exactly once, and reject stale or explicitly invalidated plans', () => {
  const s=state(2,3), p=S.generate(s,3,rng(8)), before=JSON.stringify(s);
  const recorded=S.record(s,p);
  assert.equal(recorded.history.flat().reduce((a,b)=>a+b,0),9);
  assert.equal(JSON.stringify(s),before);
  assert.throws(()=>S.record(recorded,p)); assert.throws(()=>S.record(s,p));
  const stale=S.generate(s,1); const changed=S.validate(s); changed.history[0][0]++;
  assert.throws(()=>S.record(changed,stale));
  assert.throws(()=>S.record(S.updateRoster(s,['L0'],s.followers),stale));
  stale.outdated=true; assert.throws(()=>S.record(s,stale));
});
test('state validation copies valid history and rejects malformed state', () => {
  const s=state(2,3); s.history[1][2]=42;
  const copy = S.validate(s);
  assert.deepEqual(copy,s);
  assert.notEqual(copy.history,s.history);
  assert.notEqual(copy.history[1],s.history[1]);
  for(const malformed of [null,{}, {...s,version:2}, {...s,leaders:'bad'}, {...s,history:[]}, {...s,history:[[0],[0]]}, {...s,history:[[0,0,0],[0,0,-1]]}]) assert.throws(()=>S.validate(malformed));
  assert.equal(s.history[1][2],42);
});
test('overflow is rejected without partial recording', () => {
  const s=state(1,1); s.history[0][0]=Number.MAX_SAFE_INTEGER;
  assert.throws(()=>S.generate(s,1)); assert.equal(s.history[0][0],Number.MAX_SAFE_INTEGER);
});

test('unequal groups use working counts to explore every pair', () => {
  for (const [l,f] of [[2,3],[3,2],[1,5],[5,1]]) {
    const p=S.generate(state(l,f),Math.min(l,f),rng(812));
    assert.equal(new Set(p.rounds.flat().map(pair=>pair.join(':'))).size,l*f);
  }
});
test('assignments match exhaustive minimum history cost on small random matrices', () => {
  const random=rng(931);
  for (const [l,f] of [[2,2],[2,3],[3,2],[3,4]]) {
    for (let sample=0;sample<15;sample++) {
      const s=state(l,f); s.history=s.history.map(row=>row.map(()=>Math.floor(random()*20)));
      const small=Math.min(l,f), big=Math.max(l,f), counts=Array(small).fill(0);
      let minimum=Infinity;
      function visit(b,cost) {
        if(b===big) {
          if(Math.max(...counts)-Math.min(...counts)<=1 && Math.min(...counts)>0) minimum=Math.min(minimum,cost);
          return;
        }
        for(let a=0;a<small;a++) {
          if(counts[a]===Math.ceil(big/small)) continue;
          counts[a]++; visit(b+1,cost+(l<=f?s.history[a][b]:s.history[b][a])); counts[a]--;
        }
      }
      visit(0,0);
      const actual=S.generate(s,1,random).rounds[0].reduce((sum,[a,b])=>sum+s.history[a][b],0);
      assert.equal(actual,minimum);
    }
  }
});
