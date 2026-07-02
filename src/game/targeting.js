// 战斗中按需选目标的辅助：
// any_target/bomb/flex 单位轮到自己攻击时，玩家点选或 AI 自动选目标。
// 所有函数返回纯查询结果。

import { SIDES } from './state.js';
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

// AI 选目标：hp+atk 最高的可击单位；无可击返回 null
export function pickEnemyTarget(state, attacker) {
  const valid = getValidTargets(state, attacker);
  if (valid.length === 0) return null;
  valid.sort((a, b) => (b.unit.hp + b.unit.def.atk) - (a.unit.hp + a.unit.def.atk));
  return valid[0];
}
