// 主公血量 + 胜负判定。

import { cloneState } from './state.js';

// 主公受 1 次攻击：hp -1，并标记下回合额外多抽 2
export function attackLord(state, side) {
  state = cloneState(state);
  const lord = state.players[side].lord;
  lord.hp = Math.max(0, lord.hp - 1);
  // 补偿：下回合该方额外多抽 2
  state.players[side].lord = {
    ...lord,
    extraDrawNextTurn: lord.extraDrawNextTurn + 2
  };
  state.log.push({
    type: 'lord_hit', side, hpAfter: lord.hp, turnNo: state.turnNo
  });
  if (lord.hp <= 0) {
    state.winner = side === 'player' ? 'enemy' : 'player';
    state.log.push({ type: 'game_over', winner: state.winner, turnNo: state.turnNo });
  }
  return state;
}

// 胜负判定：返回 'player' | 'enemy' | null
export function checkWin(state) {
  if (state.players.player.lord.hp <= 0) return 'enemy';
  if (state.players.enemy.lord.hp <= 0) return 'player';
  return state.winner || null;
}

// 在抽牌阶段开始时取走 extraDrawNextTurn 计数（一次性消耗）
export function consumeExtraDraw(state, side) {
  const n = state.players[side].lord.extraDrawNextTurn;
  if (n <= 0) return { state, extra: 0 };
  state = cloneState(state);
  state.players[side].lord = {
    ...state.players[side].lord,
    extraDrawNextTurn: 0
  };
  return { state, extra: n };
}
