// 最小の対戦画面。状態は src/core のエンジンが持ち、ここは表示と入力だけを扱う。
import './style.css';
import {
  applyAction,
  canRedraw,
  createRng,
  effectFor,
  handOptions,
  infestationThreshold,
  newGame,
  POINTS,
  SIDE_LABEL,
  SPECIES_LABEL,
  summary,
  type GameState,
  type PointId,
  type Rng,
  type Side,
} from '../core';
import { chooseAction } from '../core/ai';

interface App {
  screen: 'title' | 'game';
  human: Side;
  game: GameState | null;
  selectedUid: number | null;
  /** 手詰まり防止で捨てるカードを選んでいる */
  discardMode: boolean;
  cpuBusy: boolean;
  aiRng: Rng;
}

const params = new URLSearchParams(location.search);
/** CPU の1手ごとの待ち時間(ms)。?cpuDelay=0 で即時(テスト用) */
const CPU_DELAY = Number(params.get('cpuDelay') ?? 450);
/** ?seed=123 で対戦を再現できる */
const SEED_PARAM = params.get('seed');

const root = document.getElementById('app')!;
const app: App = { screen: 'title', human: 'termite', game: null, selectedUid: null, discardMode: false, cpuBusy: false, aiRng: createRng(1) };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function startGame(side: Side) {
  const seed = SEED_PARAM ?? String(Date.now());
  app.human = side;
  app.game = newGame({ seed });
  app.aiRng = createRng(`${seed}-cpu`);
  app.selectedUid = null;
  app.screen = 'game';
  render();
  void runCpuIfNeeded();
}

async function runCpuIfNeeded() {
  const g0 = app.game;
  if (!g0 || g0.finished || g0.current === app.human || app.cpuBusy) return;
  app.cpuBusy = true;
  render();
  try {
    while (app.game && !app.game.finished && app.game.current !== app.human) {
      if (CPU_DELAY > 0) await sleep(CPU_DELAY);
      app.game = applyAction(app.game, chooseAction(app.game, app.aiRng));
      render();
    }
  } finally {
    app.cpuBusy = false;
    render();
  }
}

function humanPlay(uid: number, target?: PointId) {
  if (!app.game) return;
  app.game = applyAction(app.game, { type: 'play', uid, target });
  app.selectedUid = null;
  render();
}

function humanEndTurn(discardUid?: number) {
  if (!app.game || app.game.current !== app.human || app.cpuBusy) return;
  app.game = applyAction(app.game, { type: 'endTurn', discardUid });
  app.selectedUid = null;
  app.discardMode = false;
  render();
  void runCpuIfNeeded();
}

function renderTitle(): string {
  return `
  <section class="title">
    <h1>シロアリボージョ(仮)</h1>
    <p>シロアリ側と防除業者側に分かれて戦うカードゲーム。<br>陣営を選んで CPU と対戦します。</p>
    <button class="side-btn termite" data-action="choose" data-side="termite" data-testid="choose-termite">シロアリ側で遊ぶ</button>
    <p>8ポイント中5ポイントを完全侵食(3枚)すれば勝ち</p>
    <button class="side-btn pest" data-action="choose" data-side="pest" data-testid="choose-pest">防除業者側で遊ぶ</button>
    <p>シロアリの山札がなくなるまで家を守りきれば勝ち</p>
  </section>`;
}

function renderGame(g: GameState): string {
  const me = app.human;
  const cpu: Side = me === 'termite' ? 'pest' : 'termite';
  const sm = summary(g);
  const myTurn = g.current === me && !g.finished;
  const opts = handOptions(g, me);
  const selected = opts.find((o) => o.uid === app.selectedUid && o.usable);
  const targetable = new Set<PointId>(selected?.needsTarget ? selected.targets : []);
  const lastLog = g.log.slice(-3);
  const ap = g.players[me].ap;

  const board = POINTS.map((p) => {
    const st = g.points.find((x) => x.id === p.id)!;
    const need = infestationThreshold(g, p.id);
    const chips = st.stack
      .map((c) => {
        const d = g.defs[c.defId];
        const short = d.name.replace('アリ-', '');
        return `<span class="chip ${d.species ?? ''}">${esc(short)}</span>`;
      })
      .join('');
    const cls = ['point', st.destroyed ? 'destroyed' : '', targetable.has(p.id) ? 'targetable' : ''].join(' ');
    return `<button class="${cls}" data-action="point" data-point="${p.id}" data-testid="point-${p.id}" ${targetable.has(p.id) ? '' : 'tabindex="-1"'}>
      <span class="pname">${esc(p.name)}</span>
      <span class="pmeta">${esc(p.condition)}|${p.allowed.map((s) => SPECIES_LABEL[s]).join('・')}</span>
      <span class="count" data-testid="count-${p.id}">${st.stack.length}/${need}</span>
      <span class="stack">${chips}</span>
      ${st.destroyed ? '<span class="dlabel">完全侵食</span>' : ''}
    </button>`;
  }).join('');

  const hand = opts
    .map((o) => {
      const d = g.defs[o.defId];
      const status = effectFor(d).status;
      const clickable = myTurn && !app.cpuBusy && (app.discardMode || o.usable);
      const cls = ['card', d.side === 'neutral' ? '' : d.side, clickable ? '' : 'unusable', o.uid === app.selectedUid ? 'selected' : ''].join(' ');
      return `<button class="${cls}" data-action="card" data-uid="${o.uid}" data-testid="hand-card" data-usable="${o.usable && myTurn}">
        <span class="cost">コスト${d.cost ?? '-'}</span>
        <span class="cname">${esc(d.name)}</span>
        <span class="ctag">${esc(d.category)}</span>
        ${status === 'todo' ? '<span class="todo">効果未実装</span>' : status === 'partial' ? '<span class="todo">効果一部未実装</span>' : ''}
      </button>`;
    })
    .join('');

  const selDef = selected ? g.defs[selected.defId] : null;
  let hint = '';
  if (g.finished) hint = '';
  else if (!myTurn) hint = 'CPU が考えています…';
  else if (app.discardMode) hint = '捨てるカードを選んでください(1枚引いてからターン終了)';
  else if (selected?.needsTarget) hint = '光っているポイントを選んでください';
  else if (selected) hint = '「使う」で使います';
  else hint = 'カードを選んでください';

  const result = g.finished
    ? `<div class="result" data-testid="result">
        <div class="result-box">
          <h2>${g.winner === me ? 'あなたの勝ち' : g.winner === null ? '引き分け' : 'あなたの負け'}</h2>
          <p>${g.winner ? `${SIDE_LABEL[g.winner]}の勝利(${g.winReason === 'infestation' ? '5ポイント完全侵食' : 'シロアリ山札切れ'})` : 'ターン数の上限'}<br>${sm.turn}ターン</p>
          <button data-action="restart" data-testid="restart">もう一度</button>
        </div>
      </div>`
    : '';

  return `
  <header class="hud">
    <div class="turn"><span>ターン ${sm.turn}</span><span class="turn-badge ${myTurn ? 'me' : ''}" data-testid="turn-owner">${g.finished ? '終了' : myTurn ? 'あなたの番' : 'CPU の番'}</span></div>
    <div>あなた:${SIDE_LABEL[me]}</div><div>CPU:${SIDE_LABEL[cpu]}</div>
    <div>行動力 <span class="ap" data-testid="ap">${'●'.repeat(myTurn ? ap : 0)}${'○'.repeat(Math.max(0, g.config.apPerTurn - (myTurn ? ap : 0)))}</span></div>
    <div>完全侵食 <b data-testid="destroyed">${sm.destroyed}/${sm.pointsToWin}</b></div>
    <div>シロアリ山札 ${sm.deck.termite}枚</div><div>防除山札 ${sm.deck.pest}枚</div>
  </header>
  <section class="board" data-testid="board">${board}</section>
  <section class="log" data-testid="log">${lastLog.map((l) => `<div>[${l.side === me ? 'あなた' : 'CPU'}] ${esc(l.text)}</div>`).join('')}</section>
  <section class="hand-area">
    <div class="hand-label"><span>手札 ${opts.length}枚</span><span>CPU の手札 ${g.players[cpu].hand.length}枚</span></div>
    <div class="hand" data-testid="hand">${hand}</div>
    ${selDef ? `<div class="card-detail">${esc(selDef.name)}:${esc(selDef.effect)}</div>` : ''}
    <div class="hint" data-testid="hint">${hint}</div>
    <div class="actions">
      ${selected && !selected.needsTarget ? '<button class="btn-use" data-action="use" data-testid="use-card">使う</button>' : ''}
      ${
        app.discardMode
          ? '<button class="btn-sub" data-action="cancel-discard" data-testid="cancel-redraw">やめる</button>'
          : myTurn && !app.cpuBusy && !selected && canRedraw(g, me)
            ? '<button class="btn-sub" data-action="redraw" data-testid="redraw">1枚捨てて引き直す</button>'
            : ''
      }
      <button class="btn-end" data-action="end" data-testid="end-turn" ${myTurn && !app.cpuBusy && !app.discardMode ? '' : 'disabled'}>ターン終了</button>
    </div>
  </section>
  ${result}`;
}

function render() {
  root.innerHTML = app.screen === 'title' || !app.game ? renderTitle() : renderGame(app.game);
}

root.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const g = app.game;
  if (action === 'choose') return startGame(el.dataset.side as Side);
  if (action === 'restart') {
    app.screen = 'title';
    app.game = null;
    app.discardMode = false;
    return render();
  }
  if (!g || g.finished || g.current !== app.human || app.cpuBusy) return;
  if (action === 'end') return humanEndTurn();
  if (action === 'redraw') {
    app.discardMode = true;
    return render();
  }
  if (action === 'cancel-discard') {
    app.discardMode = false;
    return render();
  }
  if (action === 'card' && app.discardMode) return humanEndTurn(Number(el.dataset.uid));
  if (action === 'card') {
    const uid = Number(el.dataset.uid);
    const o = handOptions(g, app.human).find((x) => x.uid === uid);
    if (!o?.usable) return;
    app.selectedUid = app.selectedUid === uid ? null : uid;
    return render();
  }
  if (action === 'use' && app.selectedUid !== null) return humanPlay(app.selectedUid);
  if (action === 'point' && app.selectedUid !== null) {
    const o = handOptions(g, app.human).find((x) => x.uid === app.selectedUid);
    const pid = el.dataset.point as PointId;
    if (o?.needsTarget && o.targets.includes(pid)) humanPlay(o.uid, pid);
  }
});

render();
