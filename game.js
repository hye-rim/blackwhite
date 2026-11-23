'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 흑과 백: 화면·입력·소리. 규칙과 컴퓨터는 logic.js (LOGIC_BW)
(() => {
const L = LOGIC_BW;
const $ = (id) => document.getElementById(id);
const TUT = /[?&]tutorial=1/.test(location.search);
const REC_KEY = 'blackwhiteRec', WINS_KEY = 'blackwhiteWins', MUTE_KEY = 'blackwhiteMuted';
const LEVELS = [{ id: 'easy', name: '쉬움', desc: '아무 타일이나 내요' }, { id: 'normal', name: '보통', desc: '이길 확률을 계산해요' }, { id: 'hard', name: '어려움', desc: '끝까지 미리 두어 보며 골라요' }];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let rec = (() => { try { const o = JSON.parse(store.get(REC_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } })();   // { 난이도: { w, l, d } }
let muted = store.get(MUTE_KEY) === '1';
const saveRec = () => { store.set(REC_KEY, JSON.stringify(rec)); store.set(WINS_KEY, String(Object.values(rec).reduce((a, r) => a + (r.w || 0), 0))); };

// ---------- 소리 ----------
let audio = null;
function tone(freq, dur, type = 'sine', vol = 0.08, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  select: () => tone(600, 0.04, 'triangle', 0.06),
  place: () => tone(220, 0.07, 'square', 0.05),
  flip: () => tone(420, 0.06, 'triangle', 0.07, 200),
  win: () => seq([659, 784, 1047], 80, 'triangle', 0.08),
  lose: () => seq([330, 262], 110, 'sawtooth', 0.05),
  draw: () => tone(440, 0.1, 'sine', 0.06),
  end: () => seq([523, 659, 784, 1047, 1319], 100, 'triangle', 0.1),
  over: () => seq([392, 330, 262, 196], 140, 'sawtooth', 0.06),
};

// ---------- 상태 ----------
let st = null, level = 'normal', sel = null, busy = false, phase = 'title', timers = [];
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

function startGame(lv) {
  clearTimers(); level = lv; phase = 'play'; busy = false; sel = null;
  st = L.newGame({ seed: TUT ? 5 : (Date.now() % 99991) + 1, level: TUT ? 'easy' : lv, leader: TUT ? 'you' : (Math.random() < 0.5 ? 'you' : 'cpu') });
  $('overlay').classList.add('hidden'); $('result').textContent = ''; render(); next();
}

// 다음에 할 일: 컴퓨터 차례면 잠깐 생각한 뒤 내고, 내 차례면 기다린다
function next() {
  if (!st || st.over) return;
  const side = L.turnOf(st);
  if (side === 'cpu') {
    busy = true; $('msg').textContent = '컴퓨터가 타일을 고르는 중...'; render();
    later(() => { const t = L.choose(st, 'cpu'); L.play(st, 'cpu', t); handleEvents(); sfx.place(); busy = false; render(); if (revealed) return showRound(); next(); }, 650);       // 컴퓨터가 후공이면 이 수로 판이 끝난다
  } else {
    busy = false; sel = null;
    const lead = st.leader === 'you';
    $('msg').textContent = lead ? '내가 먼저 내요! 타일을 골라 「내기」를 눌러요' : `컴퓨터는 ${st.table.cpu !== null && L.colorOf(st.table.cpu) === 'black' ? '검은' : '흰'} 타일을 냈어요. 내 타일을 골라요`;
    render();
  }
}

function handleEvents() {
  for (const e of st.events) {
    if (e.t === 'round') {
      revealed = { you: e.you, cpu: e.cpu, winner: e.winner }; tutorialSignal('round');
    }
  }
}
let revealed = null;

function playMine() {
  if (!st || busy || sel === null || L.turnOf(st) !== 'you') return;
  const t = sel; sel = null; busy = true; sfx.place();
  L.play(st, 'you', t); tutorialSignal('play');
  handleEvents(); render();
  if (revealed) return showRound();
  next();
}

// 둘 다 냈을 때: 뒤집어 보여 주고 이긴 쪽을 알린 다음 다음 판(또는 끝)
function showRound() {
  const r = revealed; revealed = null; busy = true; sfx.flip();
  $('cpuSlot').innerHTML = tileHtml(r.cpu, 'big', r.winner === 'cpu' ? 'win' : r.winner === 'you' ? 'lose' : '');
  $('mySlot').innerHTML = tileHtml(r.you, 'big', r.winner === 'you' ? 'win' : r.winner === 'cpu' ? 'lose' : '');
  $('result').textContent = r.winner === 'you' ? `이겼어요! ${r.you} > ${r.cpu}` : r.winner === 'cpu' ? `졌어요… ${r.you} < ${r.cpu}` : `비겼어요 (${r.you} = ${r.cpu})`;
  (r.winner === 'you' ? sfx.win : r.winner === 'cpu' ? sfx.lose : sfx.draw)();
  renderHud(); renderRows(); renderStrip();
  later(() => {
    $('cpuSlot').innerHTML = ''; $('mySlot').innerHTML = ''; $('result').textContent = '';
    if (st.over) return finish();
    busy = false; render(); next();
  }, 1700);
}

function finish() {
  phase = 'over'; busy = true;
  const rr = rec[level] || (rec[level] = { w: 0, l: 0, d: 0 });
  if (!TUT) { if (st.winner === 'you') rr.w++; else if (st.winner === 'cpu') rr.l++; else rr.d++; saveRec(); }
  (st.winner === 'you' ? sfx.end : sfx.over)(); tutorialSignal('over');
  const ln = LEVELS.find((l) => l.id === level).name;
  showOverlay(`<h2>${st.winner === 'you' ? '이겼어요! 🎉' : st.winner === 'cpu' ? '졌어요…' : '무승부'}</h2><p><b>${st.score.you}</b> 대 <b>${st.score.cpu}</b></p>`
    + (!TUT ? `<dl class="stats"><dt>${ln} 전적</dt><dd>${rr.w}승 ${rr.l}패 ${rr.d}무</dd></dl>` : '')
    + `<div class="col"><button id="btnAgain">${TUT ? '확인' : '한 판 더'}</button>${TUT ? '' : '<button class="sub" id="btnMenu">난이도 고르기</button>'}</div>`);
  $('btnAgain').onclick = () => (TUT ? showTitle() : startGame(level));
  if ($('btnMenu')) $('btnMenu').onclick = showTitle;
}

// ---------- 그리기 ----------
function tileHtml(n, size = '', extra = '') {
  const c = n === null ? '' : L.colorOf(n);
  return `<div class="tile ${c} ${size} ${extra}">${n === null ? '' : n}</div>`;
}
function backHtml(color, size = '') { return `<div class="tile ${color} back ${size}"></div>`; }
function renderHud() { $('roundN').textContent = `${Math.min(L.ROUNDS, st ? st.round : 1)}/${L.ROUNDS}`; $('myScore').textContent = st ? st.score.you : 0; $('cpuScore').textContent = st ? st.score.cpu : 0; }
function renderRows() {
  // 컴퓨터: 쓴 타일은 숫자를 보여 주고(흐리게), 남은 타일은 색만
  $('cpuRow').innerHTML = L.TILES.map((n) => (st.hands.cpu.includes(n) ? backHtml(L.colorOf(n)) : st.table.cpu === n ? backHtml(L.colorOf(n), 'used') : tileHtml(n, '', 'used'))).join('');
  const myTurn = !busy && L.turnOf(st) === 'you';
  $('myRow').innerHTML = L.TILES.map((n) => (st.hands.you.includes(n)
    ? `<div class="tile ${L.colorOf(n)} hand${sel === n ? ' sel' : ''}${myTurn ? '' : ' dis'}" data-n="${n}">${n}</div>`
    : tileHtml(n, '', 'used'))).join('');
  // 가운데: 이번 판에 엎어 낸 타일(색만)
  if (!revealed) {
    $('cpuSlot').innerHTML = st.table.cpu !== null ? backHtml(L.colorOf(st.table.cpu), 'big') : '<div class="tile big slot"></div>';
    $('mySlot').innerHTML = st.table.you !== null ? backHtml(L.colorOf(st.table.you), 'big') : '<div class="tile big slot"></div>';
  }
  $('playBtn').disabled = !(myTurn && sel !== null);
}
function renderStrip() { $('strip').innerHTML = st.history.map((h) => `<i class="${h.winner === 'you' ? 'w' : h.winner === 'cpu' ? 'l' : 'd'}"></i>`).join('') + '<i></i>'.repeat(Math.max(0, L.ROUNDS - st.history.length)); }
function render() { if (!st) return; renderHud(); renderRows(); renderStrip(); }

// ---------- 입력 ----------
$('myRow').addEventListener('click', (e) => {
  const el = e.target.closest('.tile.hand'); if (!el || busy || !st || L.turnOf(st) !== 'you') return;
  const n = Number(el.dataset.n); sel = sel === n ? null : n; sfx.select(); renderRows(); if (sel !== null) tutorialSignal('select');
});
$('playBtn').onclick = playMine;
addEventListener('keydown', (e) => {
  const k = e.key;
  if (k >= '0' && k <= '8' && st && !busy && L.turnOf(st) === 'you' && st.hands.you.includes(Number(k))) { sel = Number(k); sfx.select(); renderRows(); tutorialSignal('select'); }
  else if (k === 'Enter' || k === ' ') { if (phase !== 'play') { const b = document.querySelector('#overlay button'); if (b) b.click(); } else playMine(); }
  else if (k.toLowerCase() === 'm') toggleMute();
});
function toggleMute() { muted = !muted; store.set(MUTE_KEY, muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = toggleMute; $('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 처음 화면 ----------
function showOverlay(html) { const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden'); }
function showTitle() {
  phase = 'title'; clearTimers(); busy = true;
  const rules = `<p>각자 <b>0~8 타일 9장</b>. 짝수는 <b>검은색</b>, 홀수는 <b>흰색</b>이에요.<br>한 판에 한 장씩 엎어 내서 <b>큰 수가 이겨요</b>. 먼저 내는 쪽(선)이 낸 <b>색</b>은 상대도 볼 수 있어요.<br>이긴 사람이 다음 판 선! 9판 중 많이 이기면 승리!</p>`;
  if (TUT) { showOverlay(`<h1>흑과 백 ⚫⚪</h1>${rules}<div class="col"><button id="btnStart">시작하기</button></div>`); $('btnStart').onclick = () => startGame('easy'); return; }
  const rows = LEVELS.map((l) => { const r = rec[l.id] || {}; return `<button data-lv="${l.id}">${l.name}<small>${l.desc}${r.w || r.l || r.d ? ` · ${r.w || 0}승 ${r.l || 0}패 ${r.d || 0}무` : ''}</small></button>`; }).join('');
  showOverlay(`<h1>흑과 백 ⚫⚪</h1>${rules}<div class="col">${rows}</div>`);
  for (const b of document.querySelectorAll('#overlay [data-lv]')) b.onclick = () => startGame(b.dataset.lv);
}

st = L.newGame({ seed: 1 }); render(); showTitle();
/* @test-hooks:start */
window.__bw = { get st() { return st; }, get busy() { return busy; }, get sel() { return sel; }, get phase() { return phase; }, startGame, playMine };
/* @test-hooks:end */
})();
