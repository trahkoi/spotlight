/* Shared by the file:// app and Node's built-in test runner. */
(function (root) {
  'use strict';
  const key = name => name.trim().normalize('NFKC').toLowerCase();
  function names(values) {
    if (!Array.isArray(values)) throw new Error('Each roster must be a list of names.');
    return values.map(name => {
      if (typeof name !== 'string' || !name.trim()) throw new Error('Names cannot be empty.');
      if (/[\r\n]/.test(name)) throw new Error('Each name must fit on one line.');
      return name.trim();
    });
  }
  function roster(leaders, followers) {
    leaders = names(leaders); followers = names(followers);
    const seen = new Set();
    for (const name of [...leaders, ...followers]) {
      if (seen.has(key(name))) throw new Error(`Duplicate name: ${name}. Each person must have one role.`);
      seen.add(key(name));
    }
    return { leaders, followers };
  }
  function count(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('History counts must be non-negative safe whole numbers.');
    return value;
  }
  function validate(data) {
    if (!data || data.version !== 1) throw new Error('Unsupported Spotlight state version.');
    const people = roster(data.leaders, data.followers);
    if (!Array.isArray(data.history) || data.history.length !== people.leaders.length) throw new Error('History rows must match the leaders.');
    const history = data.history.map(row => {
      if (!Array.isArray(row) || row.length !== people.followers.length) throw new Error('History columns must match the followers.');
      return row.map(count);
    });
    return { version: 1, ...people, history };
  }
  const empty = () => ({ version: 1, leaders: [], followers: [], history: [] });
  function updateRoster(state, leaders, followers) {
    const people = roster(leaders, followers);
    const li = new Map(state.leaders.map((n, i) => [key(n), i]));
    const fi = new Map(state.followers.map((n, i) => [key(n), i]));
    return { version: 1, ...people, history: people.leaders.map(l => people.followers.map(f => state.history[li.get(key(l))]?.[fi.get(key(f))] ?? 0)) };
  }
  function shuffle(items, random) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
  // Lexicographic costs: enforce round coverage, balance total appearances,
  // then minimize historical pair counts and randomly break ties.
  // BigInt keeps history counts exact.
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const less = (a, b) => !b || a.some((v, i) => v < b[i] && a.slice(0, i).every((x, j) => x === b[j]));
  function round(history, leaderCount, followerCount, appearances, random) {
    const leadersSmall = leaderCount <= followerCount;
    const small = Math.min(leaderCount, followerCount), big = Math.max(leaderCount, followerCount);
    const sink = small + big + 1, graph = Array.from({ length: sink + 1 }, () => []);
    const zero = [0n, 0n, 0n, 0n];
    function edge(from, to, capacity, cost) {
      const forward = { to, capacity, cost, reverse: graph[to].length };
      const reverse = { to: from, capacity: 0, cost: cost.map(v => -v), reverse: graph[from].length };
      graph[from].push(forward); graph[to].push(reverse);
      return forward;
    }
    const base = Math.floor(big / small), pairs = [];
    for (const s of shuffle(Array.from({ length: small }, (_, i) => i), random)) {
      edge(0, s + 1, base, [-1n, 0n, 0n, 0n]);
      if (big % small) edge(0, s + 1, 1, [0n, BigInt(appearances[s]), 0n, 0n]);
      for (const b of shuffle(Array.from({ length: big }, (_, i) => i), random)) {
        const l = leadersSmall ? s : b, f = leadersSmall ? b : s;
        pairs.push({ l, f, s, edge: edge(s + 1, small + b + 1, 1, [0n, 0n, BigInt(history[l][f]), BigInt(Math.floor(random() * 1000000000))]) });
      }
    }
    for (let b = 0; b < big; b++) edge(small + b + 1, sink, 1, zero);
    // Successive shortest augmenting paths allow earlier assignments to move
    // when that improves the complete round, unlike a greedy pair selection.
    for (let flow = 0; flow < big; flow++) {
      const distance = Array(graph.length).fill(null), previous = [];
      distance[0] = zero;
      for (let pass = 0; pass < graph.length - 1; pass++) {
        let changed = false;
        for (let u = 0; u < graph.length; u++) {
          if (!distance[u]) continue;
          graph[u].forEach((e, i) => {
            const next = add(distance[u], e.cost);
            if (e.capacity && less(next, distance[e.to])) {
              distance[e.to] = next; previous[e.to] = [u, i]; changed = true;
            }
          });
        }
        if (!changed) break;
      }
      for (let v = sink; v !== 0;) {
        const [u, i] = previous[v], e = graph[u][i];
        e.capacity--; graph[v][e.reverse].capacity++; v = u;
      }
    }
    return shuffle(pairs.filter(p => p.edge.capacity === 0).map(({ l, f, s }) => {
      appearances[s]++; return [l, f];
    }), random);
  }
  function generate(state, amount, random = Math.random) {
    validate(state);
    if (!state.leaders.length || !state.followers.length) throw new Error('Add at least one leader and one follower.');
    if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Choose a positive whole number of rounds.');
    const history = state.history.map(row => [...row]), rounds = [];
    const appearances = Array(Math.min(state.leaders.length, state.followers.length)).fill(0);
    for (let r = 0; r < amount; r++) {
      const pairs = round(history, state.leaders.length, state.followers.length, appearances, random);
      for (const [l, f] of pairs) history[l][f] = count(history[l][f] + 1);
      rounds.push(pairs);
    }
    return { rounds, source: JSON.stringify(state), leaders: [...state.leaders], followers: [...state.followers], recorded: false, outdated: false };
  }
  function record(state, plan) {
    if (!plan || plan.recorded || plan.outdated || plan.source !== JSON.stringify(state)) throw new Error('Regenerate this plan before recording it.');
    const result = validate(state);
    for (const pairs of plan.rounds) for (const [l, f] of pairs) result.history[l][f] = count(result.history[l][f] + 1);
    plan.recorded = true;
    return result;
  }
  const api = { key, roster, count, validate, empty, updateRoster, generate, record };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Spotlight = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
