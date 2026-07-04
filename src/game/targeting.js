// 战斗中按需选目标的辅助：
// any_target/bomb/flex 单位轮到自己攻击时，玩家点选或 AI 自动选目标。
// 所有函数返回纯查询结果。

import { SIDES, cellKey } from './state.js';
import { listOccupiedCells } from './board.js';
import { canRangedHitUnderRain } from './attack.js';

// 这些能力的单位由「调用方指定目标」（玩家在战斗中点选；敌方 AI 自动选）
export const NEEDS_TARGET_ABILITIES = new Set(['any_target', 'bomb', 'flex']);

export function needsTarget(def) {
  return NEEDS_TARGET_ABILITIES.has(def.ability);
}

// 返回某攻击者可选的敌方目标格列表：[{side, row, col, unit}]
// 规则：敌方所有战场单位；雨天时远程单位（弓箭手/炸弹人）不能越过该列前排打后排
export function getValidTargets(state, attacker) {
  if (attacker.unit.def.ability === 'flex') {
    return getPriestTargets(state, attacker);
  }

  const enemy = attacker.side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
  const out = [];
  for (const c of listOccupiedCells(state, enemy)) {
    const target = { side: enemy, row: c.row, col: c.col, unit: c.unit };
    if (canRangedHitUnderRain(state, attacker, target)) {
      out.push(target);
    }
  }
  return out;
}

export function getColumnPriorityTargets(state, attacker) {
  const enemy = attacker.side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
  const out = [];
  for (const col of [0, 1, 2]) {
    const front = state.players[enemy].board[cellKey('front', col)];
    if (front) {
      out.push({ side: enemy, row: 'front', col, unit: front, mode: 'attack' });
      continue;
    }
    const back = state.players[enemy].board[cellKey('back', col)];
    if (back) out.push({ side: enemy, row: 'back', col, unit: back, mode: 'attack' });
  }
  return out;
}

export function getPriestTargets(state, attacker) {
  const attackTargets = getColumnPriorityTargets(state, attacker);
  const healTargets = listOccupiedCells(state, attacker.side)
    .filter(c => c.unit.hp < c.unit.def.hp)
    .map(c => ({ side: attacker.side, row: c.row, col: c.col, unit: c.unit, mode: 'heal' }));
  return [...attackTargets, ...healTargets];
}

export function getSoloStrikeTargets(state, attacker) {
  return getColumnPriorityTargets(state, attacker);
}

// AI 选目标：hp+atk 最高的可击单位；无可击返回 null
export function pickEnemyTarget(state, attacker) {
  const valid = getValidTargets(state, attacker);
  if (valid.length === 0) return null;
  if (attacker.unit.def.ability === 'flex') {
    const heals = valid.filter(v => v.side === attacker.side);
    if (heals.length > 0) {
      heals.sort((a, b) => (
        (b.unit.def.hp - b.unit.hp) - (a.unit.def.hp - a.unit.hp)
      ));
      return heals[0];
    }
  }
  valid.sort((a, b) => (b.unit.hp + b.unit.def.atk) - (a.unit.hp + a.unit.def.atk));
  return valid[0];
}
