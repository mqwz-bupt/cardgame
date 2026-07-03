// 入口：startGame() 产生 state，渲染整个 UI。
// Phase 3：接入玩家操作 — 部署 / 变羊术 / 阶段流转 / 重开。

import { UNITS, SPELLS, WEATHERS, ALL_CARDS } from './data/cards.js';
import {
  startGame, revealPhase, runBattlePhase, endTurn, runDrawPhase,
  playUnit, playPolymorph, canPlayUnit, enemyDeploy,
  needsTarget, getValidTargets,
  runBattleIter,
  SIDES, PHASES, cellKey, cloneState
} from './game/index.js';

// ---------- DOM 工具 ----------
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

// ---------- 位置映射 ----------
const LOCAL_POS_BY_ROW_COL = {
  'back-2':  1, 'front-2': 2,
  'back-1':  3, 'front-1': 4,
  'back-0':  5, 'front-0': 6
};
const BOARD_POSITIONS = [
  { side: SIDES.ENEMY,  row: 'back',  col: 0 },
  { side: SIDES.ENEMY,  row: 'back',  col: 1 },
  { side: SIDES.ENEMY,  row: 'back',  col: 2 },
  { side: SIDES.ENEMY,  row: 'front', col: 0 },
  { side: SIDES.ENEMY,  row: 'front', col: 1 },
  { side: SIDES.ENEMY,  row: 'front', col: 2 },
  { side: SIDES.PLAYER, row: 'front', col: 0 },
  { side: SIDES.PLAYER, row: 'front', col: 1 },
  { side: SIDES.PLAYER, row: 'front', col: 2 },
  { side: SIDES.PLAYER, row: 'back',  col: 0 },
  { side: SIDES.PLAYER, row: 'back',  col: 1 },
  { side: SIDES.PLAYER, row: 'back',  col: 2 }
];

// ---------- 可变状态 ----------
let gameState = startGame();
// 交互状态机：
//   idle: 未选
//   await_discard: 已选要打的手牌（playedIdx），等弃牌代价
//   await_deploy_cell: 已选要打 + 弃牌，等空格部署
//   await_poly_target: 已选变羊术（polyIdx），等敌单位
let interact = { mode: 'idle', playedIdx: null, discardIdx: null, polyIdx: null, targetUid: null };
let toastMsg = null;
let toastTimer = null;
// 战斗动画状态：{ steps, idx, finalState, timer, current }
//   idx 当前已播放到的 step 序号（-1 = 入场态、未播放任何 step）
//   current 刚渲染的 step（renderCell 用它高亮攻击者/目标）
let battleAnim = null;
const BATTLE_STEP_MS = 1400;      // 每步间隔：给攻击移动/弹道更清楚的阅读时间
const BATTLE_ENTRY_DELAY_MS = 500; // 进入战斗态 → 第一步的延迟

// ---------- 音效（WebAudio 程序生成） ----------
let audioCtx = null;
let muted = false;
let lastPlayedLogLen = 0;
try { muted = localStorage.getItem('cardgame-muted') === '1'; } catch {}

function ensureAudio() {
  if (muted) return null;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { audioCtx = null; }
  }
  return audioCtx;
}

function playTone(freq, duration, type='sine', volume=0.08) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playSlide(fromHz, toHz, duration, type='triangle', volume=0.08) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromHz, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(toHz, ctx.currentTime + duration);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

const SOUND_MAP = {
  unit_deployed:   () => playTone(523, 0.10, 'square', 0.05),
  unit_died:       () => playTone(110, 0.25, 'sawtooth', 0.08),
  unit_damaged:    () => playTone(330, 0.06, 'square', 0.05),
  polymorph_cast:  () => playSlide(880, 220, 0.32, 'triangle', 0.08),
  lord_hit:        () => { playTone(146, 0.30, 'sawtooth', 0.12); playTone(73, 0.40, 'sine', 0.08); },
  weather_changed: () => playTone(1320, 0.12, 'sine', 0.05),
  necromancer_trigger: () => playSlide(220, 660, 0.20, 'triangle', 0.06)
};

function playSoundsForNewLogs(state) {
  const log = state.log;
  for (let i = lastPlayedLogLen; i < log.length; i++) {
    const fn = SOUND_MAP[log[i].type];
    if (fn) fn();
  }
  lastPlayedLogLen = log.length;
}

function setState(next) {
  gameState = next;
  render();
  playSoundsForNewLogs(next);
}

function setInteract(next) {
  interact = next;
  render();
}

function showToast(msg) {
  toastMsg = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMsg = null; render(); }, 2200);
  render();
}

// ---------- 卡牌面 ----------
function renderCardArt(def) {
  const cls = ['card-art', `art-${def.id}`, `art-kind-${def.kind}`, def.ability && `art-ability-${def.ability}`]
    .filter(Boolean).join(' ');
  if (def.kind === 'unit') {
    return el('div', { class: cls, 'aria-label': def.name }, [
      el('span', { class: 'art-ground' }),
      el('span', { class: 'art-body' }),
      el('span', { class: 'art-head' }),
      el('span', { class: 'art-weapon' }),
      el('span', { class: 'art-detail' })
    ]);
  }
  return el('div', { class: cls, 'aria-label': def.name }, [
    el('span', { class: 'art-orb' }),
    el('span', { class: 'art-detail' }),
    el('span', { class: 'art-drop art-drop-a' }),
    el('span', { class: 'art-drop art-drop-b' }),
    el('span', { class: 'art-drop art-drop-c' })
  ]);
}

function renderCardFace(def, opts = {}) {
  const isSpell = def.kind === 'spell';
  const isWeather = def.kind === 'weather';
  const typeLabel = isSpell ? '法术' : isWeather ? '天气' : '单位';
  const abilityCls = def.ability ? `ability-${def.ability}` : 'ability-none';
  const cls = ['card', `card-${def.kind}`, isSpell && 'card-spell', isWeather && 'card-weather', abilityCls,
               ...(Array.isArray(opts.classes) ? opts.classes : [opts.classes])]
    .filter(Boolean).join(' ');
  const hp = opts.hp ?? def.hp;
  const children = [
    el('div', { class: 'card-banner' }),
    el('div', { class: 'card-shine' }),
    el('div', { class: 'card-type', text: typeLabel }),
    renderCardArt(def),
    el('div', { class: 'card-name', text: def.name })
  ];
  if (def.kind === 'unit') {
    children.push(el('div', { class: 'card-stats' }, [
      el('span', { class: 'stat-hp', text: `HP ${hp}/${def.hp}` }),
      el('span', { class: 'stat-atk', text: `ATK ${def.atk}` })
    ]));
    if (def.ability) {
      children.push(el('div', { class: 'card-ability', text: abilityLabel(def.ability) }));
    }
  } else {
    children.push(el('div', { class: 'card-desc' }, def.desc));
  }
  return el('div', {
    class: cls,
    'data-kind': def.kind,
    'data-card-id': def.id,
    'data-ability': def.ability || ''
  }, children);
}

function abilityLabel(ability) {
  const map = {
    pierce: '穿刺', any_target: '任意射', guard: '替伤',
    bomb: '炸弹', bomb_pre: '先发', solo_strike: '孤立先手', thorns: '反伤',
    chain: '连杀', lifesteal: '吸血', flex: '灵活',
    death_draw: '死亡抽牌', reposition: '移动'
  };
  return map[ability] || ability;
}

// ---------- 主公面板 ----------
function renderLordPanel(side, lord, lastEvent) {
  // 最近一条 lord_hit 命中本方 → 闪红
  const recentlyHit = lastEvent && lastEvent.type === 'lord_hit' && lastEvent.side === side;
  // 战斗动画：当前 step 命中此方主公
  const step = battleAnim && battleAnim.current;
  const isLordTarget = step && step.kind === 'lord_attack' && step.targetPos && step.targetPos.side === side;
  const cls = ['lord-panel', recentlyHit && 'recently-hit', isLordTarget && 'taking-damage'].filter(Boolean).join(' ');
  return el('div', { class: cls }, [
    el('div', { class: 'lord-title', text: side === SIDES.ENEMY ? '敌方主公' : '我方主公' }),
    el('div', { class: 'lord-hp' },
      Array.from({ length: 3 }, (_, i) =>
        el('span', { class: ['hp-pip', i < lord.hp && 'filled'].filter(Boolean).join(' ') })
      )
    ),
    lord.extraDrawNextTurn > 0
      ? el('div', { class: 'lord-bonus', text: `下回合 +${lord.extraDrawNextTurn} 抽` })
      : null,
    isLordTarget ? el('div', { class: 'dmg-pop lord-dmg', text: `-${step.dmg}` }) : null
  ]);
}

// ---------- 手牌（玩家） ----------
function renderPlayerHand(hand) {
  const cards = hand.map((c, idx) => {
    const def = ALL_CARDS[c.cardId];
    const isSelected = (interact.mode === 'await_discard' && interact.playedIdx === idx)
                     || (interact.mode === 'await_deploy_cell' && interact.playedIdx === idx)
                     || (interact.mode === 'await_poly_target' && interact.polyIdx === idx);
    const isDiscardPick = interact.mode === 'await_discard' && interact.discardIdx === idx;
    const node = renderCardFace(def, {
      classes: ['hand-card', isSelected && 'selected', isDiscardPick && 'discard-pick']
    });
    node.setAttribute('data-hand-idx', idx);
    node.setAttribute('style', `--card-delay:${Math.min(idx, 10) * 34}ms`);
    node.addEventListener('click', () => onPlayerHandClick(idx));
    return node;
  });
  return el('div', { class: 'hand player-hand' }, cards);
}

function renderEnemyHand(hand) {
  return el('div', { class: 'hand enemy-hand' },
    Array.from({ length: hand.length }, (_, idx) =>
      el('div', { class: 'card-back', style: `--card-delay:${Math.min(idx, 10) * 30}ms` }, [
        el('div', { class: 'card-back-sigil', text: '✦' })
      ])
    )
  );
}

// ---------- 战场 ----------
function renderCell(slot, state) {
  const key = cellKey(slot.row, slot.col);
  const board = state.players[slot.side].board;
  const unit = board[key];
  const localPos = LOCAL_POS_BY_ROW_COL[key];
  const sideTag = slot.side === SIDES.ENEMY ? '敌' : '我';
  const isPolyTarget = interact.mode === 'await_poly_target'
                     && slot.side === SIDES.ENEMY
                     && unit;
  const isDeployTarget = interact.mode === 'await_deploy_cell'
                       && slot.side === SIDES.PLAYER
                       && !unit;
  // 战斗中玩家选目标：高亮当前需要选目标的攻击者 + 可选敌方格
  const inAwaitTarget = battleAnim && battleAnim.current && battleAnim.current.kind === 'await_target';
  const isCurrentAttacker = inAwaitTarget
                         && slot.side === SIDES.PLAYER
                         && unit
                         && battleAnim.current.attackerUid === unit.uid;
  const isTargetableCell = inAwaitTarget
                         && slot.side === SIDES.ENEMY
                         && unit
                         && battleAnim.current.validTargets.some(
                              v => v.row === slot.row && v.col === slot.col
                            );
  // 战斗动画：当前 step 的攻击者高亮 + 目标受击
  const step = battleAnim && battleAnim.current;
  const isAttacking = step && step.attackerPos
                   && step.attackerPos.side === slot.side
                   && step.attackerPos.row === slot.row
                   && step.attackerPos.col === slot.col;
  const isTakingDamage = step && step.targetPos && step.targetPos.row !== undefined
                      && step.targetPos.side === slot.side
                      && step.targetPos.row === slot.row
                      && step.targetPos.col === slot.col;
  const cls = ['cell',
               `cell-${slot.side}`,
               `row-${slot.row}`,
               unit ? 'occupied' : 'empty',
               isPolyTarget && 'targetable',
               isDeployTarget && 'targetable',
               isCurrentAttacker && 'attacker-active',
               isTargetableCell && 'targetable',
               isAttacking && 'attacking',
               isTakingDamage && 'taking-damage']
    .filter(Boolean).join(' ');
  const children = [
    el('div', { class: 'cell-glow' }),
    el('span', { class: 'pos-label', text: `${sideTag}·${localPos}` })
  ];
  if (unit) {
    const card = renderCardFace(unit.def, {
      hp: unit.hp,
      classes: ['in-cell', unit.revealed ? 'revealed' : 'face-down']
    });
    if (!unit.revealed) {
      card.textContent = '';
      card.setAttribute('data-kind', 'hidden');
      card.appendChild(el('div', { class: 'card-back-sigil', text: '✦' }));
      card.appendChild(el('div', { class: 'card-name', text: '暗置' }));
    }
    children.push(card);
  }
  if (isTakingDamage) children.push(el('div', { class: 'dmg-pop', text: `-${step.dmg}` }));
  const cellNode = el('div', {
    class: cls,
    'data-side': slot.side,
    'data-row': slot.row,
    'data-col': slot.col,
    'data-ability': (step && step.attackerAbility) || (unit && unit.def && unit.def.ability) || ''
  }, children);
  if (isPolyTarget || isDeployTarget || isTargetableCell || isCurrentAttacker) {
    cellNode.addEventListener('click', () => onCellClick(slot));
  }
  return cellNode;
}

function slotVisualPoint(pos) {
  if (!pos) return null;
  if (pos.row === undefined || pos.col === undefined) {
    return {
      side: pos.side,
      col: 1,
      row: pos.side === SIDES.ENEMY ? -0.78 : 4.78,
      isLord: true
    };
  }
  const row = pos.side === SIDES.ENEMY
    ? (pos.row === 'back' ? 0 : 1)
    : (pos.row === 'front' ? 2 : 3);
  return { side: pos.side, col: pos.col, row, isLord: false };
}

function findDefByStepUid(snapshot, uid) {
  if (!snapshot || !uid) return null;
  for (const side of [SIDES.PLAYER, SIDES.ENEMY]) {
    const board = snapshot.players[side].board;
    for (const unit of Object.values(board)) {
      if (unit && unit.uid === uid) return unit.def;
    }
  }
  return null;
}

function findDefByName(name) {
  return Object.values(ALL_CARDS).find(def => def.name === name) || null;
}

function attackStyle(from, to) {
  if (!from || !to) return '';
  const point = p => ({
    x: ((p.col + 0.5) / 3) * 100,
    y: ((p.row + 0.5) / 4) * 100
  });
  const a = point(from);
  const b = point(to);
  const approach = {
    x: a.x + (b.x - a.x) * 0.78,
    y: a.y + (b.y - a.y) * 0.78
  };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const dist = Math.max(18, Math.hypot(dx, dy));
  const vars = [
    `--from-x:${a.x.toFixed(3)}%`,
    `--from-y:${a.y.toFixed(3)}%`,
    `--to-x:${b.x.toFixed(3)}%`,
    `--to-y:${b.y.toFixed(3)}%`,
    `--approach-x:${approach.x.toFixed(3)}%`,
    `--approach-y:${approach.y.toFixed(3)}%`,
    `--shot-angle:${angle.toFixed(2)}deg`,
    `--shot-distance:${dist.toFixed(3)}%`
  ];
  return vars.join(';');
}

function attackVisualKind(step) {
  const ability = step.attackerAbility || '';
  if (ability === 'any_target') return 'ranged';
  if (ability === 'bomb' || ability === 'bomb_pre') return 'bomb';
  if (ability === 'flex' || ability === 'death_draw') return 'magic';
  if (ability === 'thorns' || step.kind === 'thorns') return 'thorns';
  return 'melee';
}

function renderBattleVfx(step) {
  if (!step || !step.targetPos || (!step.attackerPos && step.kind !== 'thorns')) return null;
  if (!['attack', 'lord_attack', 'thorns'].includes(step.kind)) return null;

  const from = slotVisualPoint(step.attackerPos || step.targetPos);
  const to = slotVisualPoint(step.targetPos);
  const def = findDefByStepUid(step.snapshot, step.attackerUid) || findDefByName(step.attackerName);
  const visualKind = attackVisualKind(step);
  const sideCls = step.attackerPos && step.attackerPos.side === SIDES.ENEMY ? 'from-enemy' : 'from-player';
  const cls = ['battle-vfx', `vfx-${visualKind}`, `vfx-${step.kind}`, sideCls, step.killed && 'vfx-kill']
    .filter(Boolean).join(' ');
  const children = [];

  if (visualKind === 'melee' && def) {
    children.push(el('div', { class: 'attack-card-wrap' }, [
      renderCardFace(def, { classes: ['motion-card'] }),
      el('span', { class: 'slash-mark' })
    ]));
  } else {
    children.push(el('span', { class: 'attack-origin' }));
    children.push(el('span', { class: 'attack-projectile' }, [
      el('span', { class: 'projectile-head' })
    ]));
    children.push(el('span', { class: 'impact-burst' }));
  }

  children.push(el('span', { class: 'impact-ring' }));
  return el('div', { class: cls, style: attackStyle(from, to), 'aria-hidden': 'true' }, children);
}

function renderBoard(state) {
  const cls = ['board', state.weather ? `weather-${state.weather}` : 'weather-none', `phase-${state.phase}`]
    .filter(Boolean).join(' ');
  const cells = BOARD_POSITIONS.map(slot => renderCell(slot, state));
  const vfx = renderBattleVfx(battleAnim && battleAnim.current);
  return el('div', { class: cls }, [...cells, vfx]);
}

// ---------- 信息条 + 阶段按钮 ----------
function renderInfoBar(state) {
  const weather = state.weather ? ALL_CARDS[state.weather] : null;
  const themeBtn = el('button', {
    class: 'theme-btn icon-btn',
    text: document.body.dataset.theme === 'dark' ? '日' : '月',
    title: '切换主题'
  });
  themeBtn.addEventListener('click', toggleTheme);
  const muteBtn = el('button', {
    class: 'theme-btn icon-btn',
    text: muted ? '静' : '音',
    title: '开关音效'
  });
  muteBtn.addEventListener('click', toggleMute);
  return el('div', {
    class: ['info-bar', weather ? `info-weather-${weather.id}` : 'info-weather-none'].join(' ')
  }, [
    el('div', { class: 'game-title' }, [
      el('span', { class: 'game-emblem', text: '✦' }),
      el('span', { text: '卡牌对战' })
    ]),
    el('div', { class: 'info-chip phase-indicator', text: phaseLabel(state.phase) }),
    el('div', { class: 'info-chip weather-indicator' }, [
      el('span', { text: '天气：' }),
      el('span', { text: weather ? weather.name : '— 无 —' })
    ]),
    el('div', { class: 'info-chip deck-count', text:
      `共用牌库 ${state.deck.length} · 弃牌 ${state.discard.length}`
    }),
    el('div', { class: 'info-chip turn-indicator', text:
      `回合 ${state.turnNo} · 先手 ${state.firstAttacker === SIDES.PLAYER ? '我' : '敌'}`
    }),
    el('div', { class: 'info-actions' }, [themeBtn, muteBtn])
  ]);
}

function toggleTheme() {
  const cur = document.body.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.body.dataset.theme = next;
  try { localStorage.setItem('cardgame-theme', next); } catch {}
  render();
}

function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('cardgame-muted', muted ? '1' : '0'); } catch {}
  if (!muted) ensureAudio();
  render();
}

function phaseLabel(phase) {
  const map = {
    [PHASES.DRAW]: '抽牌', [PHASES.DEPLOY]: '部署',
    [PHASES.REVEAL]: '翻面',
    [PHASES.BATTLE]: '战斗', [PHASES.END]: '结束'
  };
  return `阶段：${map[phase] || phase}`;
}

function renderActionBar(state) {
  let btn = null;
  if (state.phase === PHASES.DEPLOY) {
    btn = el('button', { class: 'action-btn', text: '完成部署 → 翻面' });
    btn.addEventListener('click', onCommitDeploy);
  } else if (state.phase === PHASES.REVEAL) {
    btn = el('button', { class: 'action-btn', text: '进入战斗 →' });
    btn.addEventListener('click', onCommitReveal);
  } else if (state.phase === PHASES.END) {
    btn = el('button', { class: 'action-btn primary pulse', text: '结束回合 →' });
    btn.addEventListener('click', onCommitEnd);
  } else if (state.phase === PHASES.BATTLE) {
    btn = el('button', { class: 'action-btn disabled', text: '战斗中...', disabled: true });
  } else {
    btn = el('button', { class: 'action-btn disabled', text: '等待中...', disabled: true });
  }
  const hint = el('div', { class: 'action-hint', text: interactHint() });
  const bar = el('div', {
    class: ['action-bar', `action-${state.phase}`, interact.mode !== 'idle' && 'is-choosing']
      .filter(Boolean).join(' ')
  }, [hint, btn]);
  return bar;
}

function interactHint() {
  if (gameState.winner) return '游戏已结束 — 点击「重新开始」开新一局';
  // 战斗阶段 hint 覆盖 mode
  if (gameState.phase === PHASES.BATTLE) {
    if (!battleAnim || !battleAnim.current) return '战斗结算中...';
    const step = battleAnim.current;
    if (step.kind === 'await_target') {
      const name = step.attackerName || '单位';
      return `轮到「${name}」攻击：点击高亮敌方格选目标`;
    }
    if (step.kind === 'thorns') return `地刺反伤（-${step.dmg}）`;
    const who = step.attackerPos ? `${step.attackerPos.side === SIDES.PLAYER ? '我方' : '敌方'} 攻击` : '';
    return `${who}（-${step.dmg}）`;
  }
  // END 阶段 hint：明确告诉玩家点按钮继续
  if (gameState.phase === PHASES.END) {
    return '战斗结束 — 点击下方「结束回合 →」进入下一回合';
  }
  switch (interact.mode) {
    case 'idle':
      return '点击手牌：选一张要打出的牌，或直接点变羊术释放';
    case 'await_discard':
      return '点击另一张手牌：作为出牌代价弃掉';
    case 'await_deploy_cell':
      return '点击己方空位：放置单位（暗置）';
    case 'await_poly_target':
      return '点击敌方战场单位：变为 1/1 绵羊';
    default: return '';
  }
}

// ---------- 玩家区 ----------
function renderPlayerArea(side, state) {
  const hand = side === SIDES.ENEMY
    ? renderEnemyHand(state.players[side].hand)
    : renderPlayerHand(state.players[side].hand);
  const lastEvent = state.log[state.log.length - 1];
  return el('div', { class: ['player-area', `area-${side}`].join(' ') }, [
    renderLordPanel(side, state.players[side].lord, lastEvent),
    hand
  ]);
}

// ---------- Toast ----------
function renderToast() {
  if (!toastMsg) return null;
  return el('div', { class: 'toast' }, toastMsg);
}

// ---------- 日志面板 ----------
function sideTag(s) { return s === SIDES.PLAYER ? '我' : '敌'; }
function cardName(id) {
  const def = ALL_CARDS[id];
  return def ? def.name : id;
}

const LOG_LABEL = {
  game_start:    () => '对局开始',
  phase_reveal:  () => '双方翻面',
  phase_battle:  () => '进入战斗',
  phase_draw:    () => '抽牌阶段',
  turn_end:      e => `第 ${e.turnNo} 回合结束`,
  weather_changed:  e => `天气：${e.to ? cardName(e.to) : '无'}（原 ${e.from ? cardName(e.from) : '无'}）`,
  weather_triggered: e => `${sideTag(e.side)} 抽到天气：${cardName(e.weather)}`,
  unit_deployed: e => `${sideTag(e.side)} 部署 ${cardName(e.cardId)}`,
  unit_died:     e => `${sideTag(e.side)} ${cardName(e.unit?.def?.id)} 阵亡`,
  unit_damaged:  e => `${sideTag(e.side)} 单位 -${e.dmg}（剩 ${e.hpAfter} 血）`,
  polymorph_cast: e => `${sideTag(e.side)} 释放变羊术`,
  lord_hit:      e => `${sideTag(e.side)} 主公 -1（剩 ${e.hpAfter}）`,
  necromancer_trigger: e => `${sideTag(e.side)} 亡灵法师触发抽 1`,
  hand_truncated: e => `${sideTag(e.side)} 手牌超 10 弃 ${e.discarded?.length || 0} 张`
};

function renderLogPanel(state) {
  const log = state.log;
  const recent = log.slice(-40).reverse();
  const items = recent.map((e, i) => {
    const fn = LOG_LABEL[e.type];
    const text = fn ? fn(e) : null;
    if (!text) return null;
    const cls = ['log-item', `log-${e.type}`, i === 0 && 'log-new']
      .filter(Boolean).join(' ');
    return el('div', { class: cls, text });
  }).filter(Boolean);
  return el('div', { class: 'log-panel' }, [
    el('div', { class: 'log-header', text: '事件日志' }),
    el('div', { class: 'log-list' }, items.length > 0 ? items : [el('div', { class: 'log-empty', text: '暂无事件' })])
  ]);
}

// ---------- 胜负覆盖层 ----------
function renderOverlay(state) {
  if (!state.winner) return null;
  const youWon = state.winner === SIDES.PLAYER;
  const btn = el('button', { class: 'action-btn primary', text: '重新开始' });
  btn.addEventListener('click', () => {
    if (battleAnim && battleAnim.timer) clearTimeout(battleAnim.timer);
    if (battleAnim && battleAnim.watchdog) clearTimeout(battleAnim.watchdog);
    battleAnim = null;
    lastPlayedLogLen = 0;
    setState(startGame());
    setInteract({ mode: 'idle', playedIdx: null, discardIdx: null, polyIdx: null, targetUid: null });
  });
  return el('div', { class: 'overlay' }, [
    el('div', { class: 'overlay-panel' }, [
      el('div', { class: 'overlay-title', text: youWon ? '胜利' : '失败' }),
      el('div', { class: 'overlay-sub', text: youWon ? '敌方主公倒下了' : '我方主公倒下了' }),
      btn
    ])
  ]);
}

// ---------- 主渲染 ----------
function render() {
  const root = document.getElementById('game-root');
  const stepKind = battleAnim && battleAnim.current && battleAnim.current.kind;
  root.className = [
    'game-root',
    `phase-${gameState.phase}`,
    gameState.weather ? `weather-${gameState.weather}` : 'weather-none',
    stepKind && 'is-battle-step',
    stepKind && `step-${stepKind}`
  ].filter(Boolean).join(' ');
  root.textContent = '';
  root.appendChild(renderInfoBar(gameState));
  root.appendChild(renderPlayerArea(SIDES.ENEMY, gameState));
  root.appendChild(el('div', { class: 'board-wrap' }, [renderBoard(gameState)]));
  root.appendChild(renderPlayerArea(SIDES.PLAYER, gameState));
  root.appendChild(renderActionBar(gameState));
  root.appendChild(renderLogPanel(gameState));
  const toast = renderToast();
  if (toast) root.appendChild(toast);
  const overlay = renderOverlay(gameState);
  if (overlay) root.appendChild(overlay);
}

// ---------- 事件处理 ----------
function onPlayerHandClick(idx) {
  if (gameState.winner) return;
  if (gameState.phase !== PHASES.DEPLOY) {
    showToast('当前阶段不能出牌');
    return;
  }
  const card = gameState.players[SIDES.PLAYER].hand[idx];
  if (!card) return;
  const def = ALL_CARDS[card.cardId];

  // 变羊术：直接进入 targeting
  if (def.kind === 'spell') {
    if (def.id === 'polymorph') {
      // 必须有敌方目标
      const enemyBoard = gameState.players[SIDES.ENEMY].board;
      const hasTarget = Object.values(enemyBoard).some(u => u);
      if (!hasTarget) { showToast('敌方战场无单位'); return; }
      setInteract({ mode: 'await_poly_target', playedIdx: null, discardIdx: null, polyIdx: idx, targetUid: null });
    }
    return;
  }

  // 天气卡不在手牌直接打出（规则上天气是被动触发的）
  if (def.kind === 'weather') {
    showToast('天气卡会在抽到时自动生效');
    return;
  }

  // 单位牌
  if (interact.mode === 'idle') {
    // 手牌至少 2 张才能付代价
    if (gameState.players[SIDES.PLAYER].hand.length < 2) {
      showToast('手牌不足：出单位需弃另一张手牌作为代价');
      return;
    }
    if (def.ability === 'lifesteal' && gameState.players[SIDES.PLAYER].hand.length < 3) {
      showToast('吸血战士放置需献祭：手牌至少 3 张');
      return;
    }
    setInteract({ mode: 'await_discard', playedIdx: idx, discardIdx: null, polyIdx: null, targetUid: null });
    return;
  }

  // 已经选了 playedIdx，本次点击是选弃牌
  if (interact.mode === 'await_discard') {
    if (idx === interact.playedIdx) {
      // 再次点击同一张 = 取消
      setInteract({ mode: 'idle', playedIdx: null, discardIdx: null, polyIdx: null, targetUid: null });
      return;
    }
    setInteract({ ...interact, discardIdx: idx, mode: 'await_deploy_cell' });
    return;
  }

  if (interact.mode === 'await_deploy_cell') {
    // 等空格，但再次点 playedIdx 表示取消
    if (idx === interact.playedIdx) {
      setInteract({ mode: 'idle', playedIdx: null, discardIdx: null, polyIdx: null, targetUid: null });
    }
    return;
  }

  if (interact.mode === 'await_poly_target') {
    // 在 polymorph 状态下点击手牌 = 取消 polymorph
    setInteract({ mode: 'idle', playedIdx: null, discardIdx: null, polyIdx: null, targetUid: null });
  }
}

function onCellClick(slot) {
  if (gameState.winner) return;

  // 战斗中玩家选目标：点击高亮敌方格 → 把选择传回战斗迭代器
  if (battleAnim && battleAnim.current && battleAnim.current.kind === 'await_target') {
    if (slot.side !== SIDES.ENEMY) return;
    const valid = battleAnim.current.validTargets.some(v => v.row === slot.row && v.col === slot.col);
    if (!valid) { showToast('该目标不可选（可能是雨天限制）'); return; }
    resumeBattle({ side: SIDES.ENEMY, row: slot.row, col: slot.col });
    return;
  }

  if (interact.mode === 'await_poly_target' && slot.side === SIDES.ENEMY) {
    const target = gameState.players[SIDES.ENEMY].board[cellKey(slot.row, slot.col)];
    if (!target) return;
    try {
      const next = playPolymorph(gameState, SIDES.PLAYER, interact.polyIdx, slot.row, slot.col);
      setState(next);
      setInteract({ mode: 'idle', playedIdx: null, discardIdx: null, polyIdx: null, targetUid: null });
    } catch (e) {
      showToast('释放失败：' + e.message);
    }
    return;
  }

  if (interact.mode === 'await_deploy_cell' && slot.side === SIDES.PLAYER) {
    if (gameState.players[SIDES.PLAYER].board[cellKey(slot.row, slot.col)]) {
      showToast('该格已有单位');
      return;
    }
    const def = ALL_CARDS[gameState.players[SIDES.PLAYER].hand[interact.playedIdx].cardId];
    const check = canPlayUnit(gameState, SIDES.PLAYER, interact.playedIdx, slot.row, slot.col, interact.discardIdx);
    if (!check.ok) {
      showToast('无法部署：' + check.reason);
      return;
    }
    try {
      const next = playUnit(gameState, SIDES.PLAYER, interact.playedIdx, slot.row, slot.col, interact.discardIdx);
      setState(next);
      setInteract({ mode: 'idle', playedIdx: null, discardIdx: null, polyIdx: null, targetUid: null });
    } catch (e) {
      showToast('部署失败：' + e.message);
    }
  }
}

function onCommitDeploy() {
  if (gameState.phase !== PHASES.DEPLOY) return;
  // 敌方 AI 先完成暗部署，再翻面
  let next = enemyDeploy(gameState);
  next = revealPhase(next);
  setState(next);
  setInteract({ mode: 'idle', playedIdx: null, discardIdx: null, polyIdx: null, targetUid: null });
}

function onCommitReveal() {
  if (gameState.phase !== PHASES.REVEAL) return;
  // 翻面完成 → 直接进入战斗动画（玩家在战斗中按序号轮到自己 any_target 单位时再选目标）
  startBattleAnimation(gameState);
}

function onCommitTargeting() {
  // 已废弃：TARGETING 阶段被删除，此函数保留为空避免外部调用报错
  return;
}

// 启动战斗动画：进入 BATTLE 阶段，按 900ms/步节奏推进 runBattleIter 生成的步骤。
// needsTarget 单位轮到玩家时 → 暂停 await_target 等玩家点；敌方 AI 自动选。
// 无跳过，强制看完。结束后切到 END 阶段。
function startBattleAnimation(srcState) {
  if (battleAnim && battleAnim.timer) clearTimeout(battleAnim.timer);
  if (battleAnim && battleAnim.watchdog) clearTimeout(battleAnim.watchdog);

  const entry = cloneState(srcState);
  entry.phase = PHASES.BATTLE;
  entry.log = [...entry.log, { type: 'phase_battle', turnNo: entry.turnNo }];

  battleAnim = { iter: null, finalState: null, timer: null, current: null, watchdog: null };
  // 创建生成器（runBattleIter 内部会 clone，不会污染 entry）
  battleAnim.iter = runBattleIter(entry);

  gameState = entry;
  lastPlayedLogLen = gameState.log.length;
  playSoundsForNewLogs(entry);
  render();

  // 间隔后开始推进第一步
  battleAnim.timer = setTimeout(advanceBattleStep, BATTLE_ENTRY_DELAY_MS);
}

// 推进到下一个 yield；choice 仅在玩家从 await_target 恢复时传入
function advanceBattleStep(choice = null) {
  if (!battleAnim) return;
  let value, done;
  try {
    ({ value, done } = battleAnim.iter.next(choice));
  } catch (err) {
    // 迭代器抛错 → 强制结束战斗，避免卡死
    console.error('[battle] iterator threw:', err);
    const fallback = cloneState(gameState);
    fallback.phase = PHASES.END;
    battleAnim = null;
    setState(fallback);
    return;
  }

  if (done) {
    // 生成器 return = 战斗结束的最终 state
    const finalState = value;
    const endState = cloneState(finalState);
    endState.phase = PHASES.END;
    battleAnim = null;
    setState(endState);
    return;
  }
  const step = value;

  battleAnim.current = step;
  gameState = step.snapshot;
  playSoundsForNewLogs(step.snapshot);
  // 击中音
  if (step.kind === 'lord_attack') {
    playTone(146, 0.25, 'sawtooth', 0.10);
    playTone(73, 0.35, 'sine', 0.06);
  } else if (step.kind === 'attack') {
    playTone(550, 0.08, 'square', 0.05);
  } else if (step.kind === 'thorns') {
    playTone(220, 0.12, 'triangle', 0.05);
  }
  render();

  // await_target → 暂停等玩家点；其他 → 900ms 后推进
  if (step.kind === 'await_target') {
    // 安全网：30 秒玩家没点 → 自动选第一个有效目标
    if (battleAnim.watchdog) clearTimeout(battleAnim.watchdog);
    battleAnim.watchdog = setTimeout(() => {
      if (!battleAnim || !battleAnim.current || battleAnim.current.kind !== 'await_target') return;
      const v = battleAnim.current.validTargets[0];
      if (v) {
        console.warn('[battle] auto-picking target after 30s timeout');
        resumeBattle({ side: v.side, row: v.row, col: v.col });
      }
    }, 30000);
    return;
  }
  battleAnim.timer = setTimeout(advanceBattleStep, BATTLE_STEP_MS);
}

// 玩家在 await_target 状态下点击高亮敌方格 → 传回选择并恢复战斗
function resumeBattle(choice) {
  if (!battleAnim || !battleAnim.current || battleAnim.current.kind !== 'await_target') return;
  if (battleAnim.watchdog) { clearTimeout(battleAnim.watchdog); battleAnim.watchdog = null; }
  // 短暂延迟，让玩家看清自己的选择
  battleAnim.timer = setTimeout(() => advanceBattleStep(choice), 220);
}

function onCommitEnd() {
  if (gameState.phase !== PHASES.END) return;
  let next = endTurn(gameState);     // phase=DRAW, turnNo+1, swap firstAttacker
  next = runDrawPhase(next);          // phase=DEPLOY
  setState(next);
  setInteract({ mode: 'idle', playedIdx: null, discardIdx: null, polyIdx: null, targetUid: null });
}

// ---------- 启动 ----------
try {
  const saved = localStorage.getItem('cardgame-theme');
  if (saved === 'dark') document.body.dataset.theme = 'dark';
} catch {}
render();
