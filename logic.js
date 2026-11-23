'use strict';
// 흑과 백(더 지니어스): 각자 0~8 타일 아홉 장. 한 장씩 내서 큰 수가 그 판을 이긴다. 짝수는 검은색, 홀수는 흰색.
// 먼저 내는 사람(선)이 타일을 엎어 내면 상대는 그 '색'만 보고 한 장을 엎어 낸다. 둘 다 내면 뒤집어서 겨룬다. 아홉 판 중 많이 이긴 쪽이 승리.
// 규칙·컴퓨터 상대는 화면 없이 여기서 (LOGIC_BW).
const LOGIC_BW = (() => {
  const TILES = [0, 1, 2, 3, 4, 5, 6, 7, 8], ROUNDS = 9;
  const colorOf = (t) => (t % 2 === 0 ? 'black' : 'white');
  const other = (side) => (side === 'you' ? 'cpu' : 'you');

  function rng(seed) {
    let t = (seed >>> 0) || 1;
    return () => {
      t = (t + 0x6D2B79F5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 한 판: you(나)·cpu(컴퓨터)의 남은 타일, 점수, 이번 판에 낸 타일, 지난 판 기록
  function newGame(opts = {}) {
    const rand = opts.rand || rng(opts.seed || 1);
    return {
      rand, level: opts.level || 'normal', round: 1, leader: opts.leader || 'you',
      hands: { you: TILES.slice(), cpu: TILES.slice() }, score: { you: 0, cpu: 0 },
      table: { you: null, cpu: null },            // 이번 판에 엎어 낸 타일(둘 다 내면 곧 정산)
      history: [], over: false, winner: null, events: [],
    };
  }

  // 지금 타일을 낼 차례인 쪽: 선이 먼저, 그다음 상대
  function turnOf(st) {
    if (st.over) return null;
    if (st.table[st.leader] === null) return st.leader;
    return st.table[other(st.leader)] === null ? other(st.leader) : null;
  }

  function play(st, side, tile) {
    st.events = [];
    if (st.over) return { ok: false, why: 'over' };
    if (turnOf(st) !== side) return { ok: false, why: 'turn' };
    if (!st.hands[side].includes(tile)) return { ok: false, why: 'tile' };
    st.hands[side] = st.hands[side].filter((t) => t !== tile);
    st.table[side] = tile;
    st.events.push({ t: 'played', side, color: colorOf(tile) });
    if (st.table.you !== null && st.table.cpu !== null) resolve(st);
    return { ok: true };
  }

  // 정산: 큰 수가 이기고, 이긴 쪽이 다음 판 선. 같은 수면 비기고 선은 그대로
  function resolve(st) {
    const a = st.table.you, b = st.table.cpu;
    const winner = a > b ? 'you' : b > a ? 'cpu' : null;
    if (winner) st.score[winner]++;
    st.history.push({ round: st.round, you: a, cpu: b, winner, leader: st.leader });
    st.events.push({ t: 'round', round: st.round, you: a, cpu: b, winner });
    st.table = { you: null, cpu: null };
    if (winner) st.leader = winner;
    if (st.round >= ROUNDS) {
      st.over = true; st.winner = st.score.you > st.score.cpu ? 'you' : st.score.cpu > st.score.you ? 'cpu' : null;
      st.events.push({ t: 'over', winner: st.winner });
    } else st.round++;
  }

  // ---------- 컴퓨터 ----------
  const randomPick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
  const usedBy = (st, side) => st.history.map((h) => h[side]);

  // 컴퓨터(side)가 알 수 있는 정보만으로 계산한다: 상대가 낼 수 있는 타일의 후보
  //  - 내가 선이면: 상대는 아직 안 낸 타일 중 아무거나(상대 손은 공개 정보)
  //  - 내가 후공이면: 선이 엎어 낸 타일은 '아직 안 쓴 타일 중 보이는 색인 것' 중 하나
  function candidatesFor(st, side) {
    const foe = other(side);
    if (st.leader === side) return st.hands[foe].slice();
    const color = colorOf(st.table[foe]), used = new Set(usedBy(st, foe));
    return TILES.filter((t) => !used.has(t) && colorOf(t) === color);
  }

  // 남은 판을 양쪽 다 무작위로 두어 끝까지 가 보고 내 점수 차를 돌려 준다
  function rollout(me, op, diff, rounds, rand) {
    me = me.slice(); op = op.slice();
    for (let r = 0; r < rounds; r++) {
      const a = me.splice(Math.floor(rand() * me.length), 1)[0], b = op.splice(Math.floor(rand() * op.length), 1)[0];
      if (a > b) diff++; else if (b > a) diff--;
    }
    return diff;
  }

  // 컴퓨터(side)가 낼 타일 고르기. level: easy(무작위) · normal(이길 확률을 계산) · hard(끝까지 무작위로 두어 보며 이길 확률을 계산)
  function choose(st, side) {
    const mine = st.hands[side], foe = other(side), rand = st.rand;
    if (st.level === 'easy') return randomPick(mine, rand);
    const cand = candidatesFor(st, side), follower = st.leader !== side;
    const diff0 = st.score[side] - st.score[foe], roundsAfter = ROUNDS - st.round;
    const foeUnused = follower ? TILES.filter((t) => !usedBy(st, foe).includes(t)) : st.hands[foe];     // 후공일 때 상대의 아직 안 쓴 타일(낸 것 포함)
    let best = null;
    for (const t of mine) {
      let value;
      if (st.level === 'normal') {
        let win = 0, draw = 0; for (const o of cand) { if (t > o) win++; else if (t === o) draw++; }
        const p = (win + draw * 0.5) / cand.length;
        value = p * 10 - t * (p >= 0.999 ? 0.2 : 0.12) + (p < 0.34 ? (8 - t) * 0.25 : 0);
        value += rand() * 1.3;                                                                     // 늘 같은 수만 두면 읽히니 조금 흔든다       // 이길 확률, 확실히 이기면 가장 작은 걸로, 질 판이면 작은 걸 버림
      } else {
        const N = 160, rest = mine.filter((x) => x !== t); let sum = 0;
        for (let k = 0; k < N; k++) {
          const o = randomPick(cand, rand), d = diff0 + (t > o ? 1 : t < o ? -1 : 0);
          const end = rollout(rest, foeUnused.filter((x) => x !== o), d, roundsAfter, rand);
          sum += end > 0 ? 1 : end === 0 ? 0.5 : 0;
        }
        value = sum / N;
      }
      if (!best || value > best.value + 1e-9) best = { t, value };
    }
    return best.t;
  }

  return { TILES, ROUNDS, colorOf, other, rng, newGame, turnOf, play, choose, candidatesFor };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LOGIC_BW;
