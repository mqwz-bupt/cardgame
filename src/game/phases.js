// 阶段机：DRAW → DEPLOY → REVEAL → BATTLE → END → DRAW...
// 所有阶段入口返回新 state（不可变）。

import { PHASES, SIDES, createInitialState, cloneState, cellKey } from './state.js';
import { drawCards } from './deck.js';
import { consumeExtraDraw } from './judge.js';
import { runBattle } from './battle.js';
import { listOccupiedCells, getAdjacentFriendly, hasNoUnits } from './board.js';
import { applyDamage, computeAttackTargets } from './attack.js';

const STARTING_HAND = 7;
const DRAW_PER_TURN = 3;

// 新建一局：构建 state，洗牌，双方各抽 7 张。phase=DEPLOY（首回合直接进入暗置）
export function startGame(options = {}) {
  let state = createInitialState(options);
  state = drawCards(state, SIDES.PLAYER, STARTING_HAND);
  state = drawCards(state, SIDES.ENEMY, STARTING_HAND);
  state = cloneState(state);
  state.phase = PHASES.DEPLOY;
  state.log.push({ type: 'game_start', turnNo: state.turnNo });
  return state;
}

// REVEAL：翻所有暗置卡；触发盗贼孤立先手。
// 注：炸弹人「先发」改为在战斗阶段开始时（#1 位之前）发动，见 battle.js。
export function revealPhase(state) {
  state = cloneState(state);
  for (const side of [SIDES.PLAYER, SIDES.ENEMY]) {
    for (const key of Object.keys(state.players[side].board)) {
      const u = state.players[side].board[key];
      if (u) state.players[side].board[key] = { ...u, revealed: true };
    }
  }
  state.phase = PHASES.REVEAL;
  state.log.push({ type: 'phase_reveal', turnNo: state.turnNo });

  state = triggerOnReveal(state);
  return state;
}

// 亮出时效果：
//   - 盗贼孤立先手：上下左右无友军则立即按常规优先级攻击一次
function triggerOnReveal(state) {
  // 盗贼孤立先手
  const thieves = [];
  for (const side of [SIDES.PLAYER, SIDES.ENEMY]) {
    for (const c of listOccupiedCells(state, side)) {
      if (c.unit.def.ability === 'solo_strike') thieves.push(c);
    }
  }
  thieves.sort((a, b) => a.localPos - b.localPos);
  for (const t of thieves) {
    const adj = getAdjacentFriendly(state, t.side, t.row, t.col);
    if (adj.length > 0) continue;  // 不孤立
    const enemy = t.side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
    if (hasNoUnits(state, enemy)) continue;
    const attacker = { side: t.side, row: t.row, col: t.col, unit: t.unit };
    const targets = computeAttackTargets(state, attacker);
    if (targets.length > 0) {
      const r = applyDamage(state, attacker, targets[0]);
      state = r.state;
    }
  }
  return state;
}

// 战斗阶段
export function runBattlePhase(state) {
  state = cloneState(state);
  state.phase = PHASES.BATTLE;
  state.log.push({ type: 'phase_battle', turnNo: state.turnNo });
  state = runBattle(state);
  state.phase = PHASES.END;
  return state;
}

// 结束本回合：交换先手、turnNo+1、推进到下回合 DRAW
export function endTurn(state) {
  state = cloneState(state);
  state.turnNo += 1;
  state.firstAttacker = state.firstAttacker === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
  state.phase = PHASES.DRAW;
  state.log.push({ type: 'turn_end', turnNo: state.turnNo });
  return state;
}

// 下回合的抽牌阶段：双方各抽 3 + extraDrawNextTurn 补偿
export function runDrawPhase(state) {
  state = cloneState(state);
  state.phase = PHASES.DRAW;
  state.log.push({ type: 'phase_draw', turnNo: state.turnNo });

  for (const side of [SIDES.PLAYER, SIDES.ENEMY]) {
    const { state: s2, extra } = consumeExtraDraw(state, side);
    state = s2;
    state = drawCards(state, side, DRAW_PER_TURN + extra);
  }
  state = cloneState(state);
  state.phase = PHASES.DEPLOY;
  return state;
}
