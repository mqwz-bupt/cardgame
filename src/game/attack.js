// 攻击目标选择 + 伤害结算。纯查询/不可变。

import { SIDES, cellKey, cloneState } from './state.js';
import {
  mirrorCol, getAdjacentFriendly
} from './board.js';

// 选目标：返回单个目标 {side, row, col, unit} 或 null
// targetOverride 用于弓箭手/炸弹人/祭司等由玩家或 AI 指定目标
export function selectTarget(state, attacker, targetOverride = null) {
  if (targetOverride) return targetOverride;
  const def = attacker.unit.def;
  if (def.ability === 'any_target') {
    // 弓箭手/炸弹人：调用方必须传 targetOverride；未传时退化为常规（容错）
    return selectRegularTarget(state, attacker);
  }
  if (state.weather === 'snow') {
    return selectTargetUnderSnow(state, attacker);
  }
  return selectRegularTarget(state, attacker);
}

// 常规攻击目标优先级：
// 1) 同列对面前排 → 2) 同列对面后排 → 3) 其他列前排 → 4) 其他列后排
function selectRegularTarget(state, attacker) {
  const enemy = attacker.side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
  const enemyCol = mirrorCol(attacker.col);

  const sameFront = state.players[enemy].board[cellKey('front', enemyCol)];
  if (sameFront) return { side: enemy, row: 'front', col: enemyCol, unit: sameFront };
  const sameBack = state.players[enemy].board[cellKey('back', enemyCol)];
  if (sameBack) return { side: enemy, row: 'back', col: enemyCol, unit: sameBack };

  const otherCols = [0, 1, 2].filter(c => c !== enemyCol);
  for (const c of otherCols) {
    const front = state.players[enemy].board[cellKey('front', c)];
    if (front) return { side: enemy, row: 'front', col: c, unit: front };
  }
  for (const c of otherCols) {
    const back = state.players[enemy].board[cellKey('back', c)];
    if (back) return { side: enemy, row: 'back', col: c, unit: back };
  }
  return null;  // 敌方战场全空 → 主公攻击（由 battle.js 处理）
}

// 雪天：先打斜前（其他列前排），再打正前
function selectTargetUnderSnow(state, attacker) {
  const enemy = attacker.side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
  const enemyCol = mirrorCol(attacker.col);
  const otherCols = [0, 1, 2].filter(c => c !== enemyCol);

  for (const c of otherCols) {
    const front = state.players[enemy].board[cellKey('front', c)];
    if (front) return { side: enemy, row: 'front', col: c, unit: front };
  }
  const sameFront = state.players[enemy].board[cellKey('front', enemyCol)];
  if (sameFront) return { side: enemy, row: 'front', col: enemyCol, unit: sameFront };
  for (const c of otherCols) {
    const back = state.players[enemy].board[cellKey('back', c)];
    if (back) return { side: enemy, row: 'back', col: c, unit: back };
  }
  const sameBack = state.players[enemy].board[cellKey('back', enemyCol)];
  if (sameBack) return { side: enemy, row: 'back', col: enemyCol, unit: sameBack };
  return null;
}

// 雨天判断：弓箭手/炸弹人能否打某目标
export function canRangedHitUnderRain(state, attacker, target) {
  if (state.weather !== 'rain') return true;
  const def = attacker.unit.def;
  if (def.ability !== 'any_target' && def.id !== 'bomber') return true;
  // 目标在后排 → 要求同列对面前排为空
  if (target.row === 'back') {
    const enemy = attacker.side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
    const front = state.players[enemy].board[cellKey('front', target.col)];
    if (front) return false;
  }
  return true;
}

// 计算一次攻击的全部受击单位（剑士穿刺扩展为一列）
// 返回：[{side, row, col, unit, dmg}]
export function computeAttackTargets(state, attacker, targetOverride = null) {
  const def = attacker.unit.def;
  const target = selectTarget(state, attacker, targetOverride);
  if (!target) return [];

  if (def.ability === 'pierce') {
    // 剑士穿刺：目标列前后排各 1 点
    const enemyCol = target.col;
    const enemy = target.side;
    const out = [];
    const front = state.players[enemy].board[cellKey('front', enemyCol)];
    const back = state.players[enemy].board[cellKey('back', enemyCol)];
    if (front) out.push({ side: enemy, row: 'front', col: enemyCol, unit: front, dmg: attacker.unit.def.atk });
    if (back)  out.push({ side: enemy, row: 'back',  col: enemyCol, unit: back,  dmg: attacker.unit.def.atk });
    return out;
  }

  return [{ ...target, dmg: attacker.unit.def.atk }];
}

// 对一个目标应用伤害（处理盾兵替伤）。
// returns { state, killed: UnitInstance[] }
//   killed 包括因本次伤害死亡的所有单位（含替伤盾兵）
export function applyDamage(state, attacker, target) {
  const dmg = target.dmg;
  if (dmg <= 0) return { state, killed: [] };

  // 走替伤判定：找相邻友军中的存活盾兵
  const adjShields = getAdjacentFriendly(state, target.side, target.row, target.col)
    .filter(a => a.unit.def.ability === 'guard' && a.unit.hp > 0);

  if (adjShields.length > 0) {
    // MVP 简化：选第一个盾兵挡伤；后续 AI/玩家可决策
    const shield = adjShields[0];
    return damageUnit(state, shield.side, shield.row, shield.col, dmg);
  }
  return damageUnit(state, target.side, target.row, target.col, dmg);
}

// 对指定格的单位扣血；返回新 state 与 killed 数组
function damageUnit(state, side, row, col, dmg) {
  const unit = state.players[side].board[cellKey(row, col)];
  if (!unit) return { state, killed: [] };
  state = cloneState(state);
  const newHp = unit.hp - dmg;
  const newUnit = { ...unit, hp: newHp };
  state.players[side].board[cellKey(row, col)] = newHp > 0 ? newUnit : null;
  if (newHp <= 0) {
    // 死亡：进弃牌堆（双方共用），更新全局死亡计数
    state.discard = [...state.discard, { cardId: unit.def.id, uid: unit.uid }];
    state.globalDeathCount += 1;
    state.log.push({ type: 'unit_died', side, row, col, unit, turnNo: state.turnNo });
    return { state, killed: [unit] };
  }
  state.log.push({ type: 'unit_damaged', side, row, col, hpBefore: unit.hp, hpAfter: newHp, dmg, turnNo: state.turnNo });
  return { state, killed: [] };
}

// 处理：吸血战士攻击回血（攻击者回血=本次实际造成的伤害）
export function applyLifesteal(state, attacker, actualDmgDealt) {
  if (actualDmgDealt <= 0) return state;
  if (attacker.unit.def.ability !== 'lifesteal') return state;
  state = cloneState(state);
  const before = state.players[attacker.side].board[cellKey(attacker.row, attacker.col)];
  if (!before) return state;  // 攻击者已死亡
  const healed = Math.min(before.def.hp, before.hp + actualDmgDealt);
  state.players[attacker.side].board[cellKey(attacker.row, attacker.col)] = { ...before, hp: healed };
  return state;
}
