'use strict';

// 흑과 백 규칙·컴퓨터 시험. 실행: node --test (디렉터리)
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

// 한 판을 끝까지 둔다. youLevel 이 없으면 you 도 컴퓨터(level)가 둔다
function playGame(seed, youLevel, cpuLevel) {
  const st = L.newGame({ seed, level: cpuLevel });
  const you = L.newGame({ seed: seed + 1 }); void you;
  while (!st.over) {
    const side = L.turnOf(st);
    const saved = st.level; st.level = side === 'you' ? youLevel : cpuLevel;
    const t = L.choose(st, side); st.level = saved;
    assert.ok(L.play(st, side, t).ok);
  }
  return st;
}

test('colors: even tiles are black, odd tiles are white', () => {
  assert.deepStrictEqual(L.TILES.map(L.colorOf), ['black', 'white', 'black', 'white', 'black', 'white', 'black', 'white', 'black']);
});

test('new game: both hands have nine tiles, nobody has a point, you lead', () => {
  const st = L.newGame({ seed: 1 });
  assert.deepStrictEqual(st.hands.you, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepStrictEqual(st.hands.cpu, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.strictEqual(st.round, 1); assert.strictEqual(st.leader, 'you'); assert.strictEqual(L.turnOf(st), 'you');
});

test('turn order: the leader plays first, then the other side; a tile can only be played once and only on your turn', () => {
  const st = L.newGame({ seed: 1 });
  assert.strictEqual(L.play(st, 'cpu', 3).why, 'turn');
  assert.ok(L.play(st, 'you', 5).ok);
  assert.strictEqual(L.play(st, 'you', 6).why, 'turn');
  assert.strictEqual(L.turnOf(st), 'cpu');
  assert.strictEqual(L.play(st, 'cpu', 99).why, 'tile');
  assert.ok(L.play(st, 'cpu', 3).ok);
  assert.strictEqual(st.hands.you.includes(5), false);
});

test('a round: the bigger tile wins a point and leads next; a tie gives no point and keeps the leader', () => {
  const st = L.newGame({ seed: 1 });
  L.play(st, 'you', 3); L.play(st, 'cpu', 7);
  assert.deepStrictEqual(st.score, { you: 0, cpu: 1 }); assert.strictEqual(st.leader, 'cpu'); assert.strictEqual(st.round, 2);
  assert.strictEqual(st.history[0].winner, 'cpu');
  L.play(st, 'cpu', 4); L.play(st, 'you', 4);
  assert.deepStrictEqual(st.score, { you: 0, cpu: 1 }); assert.strictEqual(st.leader, 'cpu'); assert.strictEqual(st.history[1].winner, null);
});

test('events tell the colors of the face-down tiles, then the result', () => {
  const st = L.newGame({ seed: 1 });
  L.play(st, 'you', 3); assert.deepStrictEqual(st.events, [{ t: 'played', side: 'you', color: 'white' }]);
  L.play(st, 'cpu', 8);
  assert.strictEqual(st.events[0].color, 'black'); assert.strictEqual(st.events[1].t, 'round'); assert.strictEqual(st.events[1].winner, 'cpu');
});

test('the game lasts nine rounds, then the one with more points wins', () => {
  const st = L.newGame({ seed: 2 });
  for (let r = 0; r < 9; r++) { const lead = L.turnOf(st); L.play(st, lead, st.hands[lead][0]); const f = L.turnOf(st); L.play(st, f, st.hands[f][0]); }
  assert.ok(st.over); assert.strictEqual(st.history.length, 9);
  assert.strictEqual(st.score.you + st.score.cpu + st.history.filter((h) => !h.winner).length, 9);
  assert.strictEqual(L.turnOf(st), null); assert.strictEqual(L.play(st, 'you', 1).why, 'over');
  const w = st.score.you > st.score.cpu ? 'you' : st.score.cpu > st.score.you ? 'cpu' : null; assert.strictEqual(st.winner, w);
});

test('the computer only plays tiles it has, on every level and in every seat', () => {
  for (const level of ['easy', 'normal', 'hard']) for (let seed = 1; seed <= 20; seed++) {
    const st = L.newGame({ seed, level, leader: seed % 2 ? 'you' : 'cpu' });
    while (!st.over) { const side = L.turnOf(st); const t = L.choose(st, side); assert.ok(st.hands[side].includes(t), `${level}/${seed}`); L.play(st, side, t); }
  }
});

test('the computer knows only what it may know: as follower the candidates are the unused tiles of the shown color', () => {
  const st = L.newGame({ seed: 1, leader: 'you' });
  L.play(st, 'you', 4);                                                    // 검은색
  const c = L.candidatesFor(st, 'cpu');
  assert.deepStrictEqual(c, [0, 2, 4, 6, 8]);
  L.play(st, 'cpu', 2);                                                    // 정산: you 4 > cpu 2, you 선
  L.play(st, 'you', 2); const c2 = L.candidatesFor(st, 'cpu');             // 2 는 이미 나온 흑이 아님(내가 아직 안 썼다) → 후보 [0,2,6,8]? 4 는 썼다
  assert.deepStrictEqual(c2, [0, 2, 6, 8]);
  const lead = L.newGame({ seed: 1, leader: 'cpu' });
  assert.deepStrictEqual(L.candidatesFor(lead, 'cpu'), L.TILES, 'as leader every unused tile of the foe is possible');
});

test('a smarter computer beats a random one (many games, fixed seeds)', () => {
  for (const [level, need] of [['normal', 0.62], ['hard', 0.68]]) {
    let win = 0, lose = 0, n = 200;
    for (let seed = 1; seed <= n; seed++) {
      const st = playGame(seed * 3, 'easy', level);
      if (st.winner === 'cpu') win++; else if (st.winner === 'you') lose++;
    }
    assert.ok(win / (win + lose) >= need, `${level} won ${win}, lost ${lose}`);
  }
});

test('normal and hard are not worse than each other by much (hard is at least as good as normal)', () => {
  let hardWins = 0, normalWins = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const st = playGame(seed * 7, 'normal', 'hard');
    if (st.winner === 'cpu') hardWins++; else if (st.winner === 'you') normalWins++;
  }
  assert.ok(hardWins >= normalWins * 0.9, `hard ${hardWins} vs normal ${normalWins}`);
});

test('same seed and levels make the same game', () => {
  const run = () => { const st = playGame(5, 'normal', 'hard'); return JSON.stringify(st.history); };
  assert.strictEqual(run(), run());
});
