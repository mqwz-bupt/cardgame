// 敌方贪心 AI：DEPLOY 阶段自动决策。
// 策略：
//   1) 先释放变羊术：选玩家方 hp >= 2 的最强单位
//   2) 反复部署最强威胁单位，直到无法继续（手牌不够付代价 / 战场满 / 无单位牌）
// 所有函数返回新 state（不可变）。

import { SIDES } from './state.js';
import { ALL_CARDS } from '../data/cards.js';
import { playUnit, playPolymorph, canPlayUnit } from './deploy.js';
import { listOccupiedCells, listEmptyCells } from './board.js';

// 单位威胁值（贪心权重）— 决定 AI 出牌优先级和代价弃牌选择
const THREAT = {
  swordsman: 6, berserker: 6, vampire: 5, archer: 5,
  bomber: 4, priest: 4, necromancer: 4,
  thief: 3, knight: 3, shield: 3,
  axe: 2, spike: 1
};

// 在 DEPLOY 阶段为敌方做贪心决策；返回新 state
export function enemyDeploy(state) {
  let s = state;
  let safety = 30;
  let acted = true;
  while (acted && safety-- > 0) {
    acted = false;
    const poly = tryPolymorph(s);
    if (poly) { s = poly; acted = true; continue; }
    const dep = tryDeployUnit(s);
    if (dep) { s = dep; acted = true; continue; }
  }
  return s;
}

// 找变羊术释放目标：玩家 hp >= 2 的最强单位
function tryPolymorph(state) {
  const hand = state.players[SIDES.ENEMY].hand;
  const polyIdx = hand.findIndex(c => c.cardId === 'polymorph');
  if (polyIdx < 0) return null;

  const playerCells = listOccupiedCells(state, SIDES.PLAYER);
  if (playerCells.length === 0) return null;

  playerCells.sort((a, b) =>
    (b.unit.hp + b.unit.def.atk) - (a.unit.hp + a.unit.def.atk)
  );
  const target = playerCells[0];
  if (target.unit.hp < 2) return null;
  return playPolymorph(state, SIDES.ENEMY, polyIdx, target.row, target.col);
}

// 部署最强单位；返回新 state 或 null（无法部署）
function tryDeployUnit(state) {
  const hand = state.players[SIDES.ENEMY].hand;
  const empty = listEmptyCells(state, SIDES.ENEMY);
  if (empty.length === 0) return null;
  if (hand.length < 2) return null;

  // 单位牌按威胁降序
  const units = [];
  for (let i = 0; i < hand.length; i++) {
    const def = ALL_CARDS[hand[i].cardId];
    if (def && def.kind === 'unit') {
      units.push({ idx: i, def, threat: THREAT[def.id] ?? 1 });
    }
  }
  units.sort((a, b) => b.threat - a.threat);

  for (const u of units) {
    // 吸血战士需手牌 >= 3（献祭 1 张 + 代价 1 张）
    if (u.def.ability === 'lifesteal' && hand.length < 3) continue;

    // 选代价弃牌：威胁最低的非当前牌
    const others = [];
    for (let i = 0; i < hand.length; i++) {
      if (i === u.idx) continue;
      const d = ALL_CARDS[hand[i].cardId];
      others.push({ idx: i, threat: THREAT[d.id] ?? 1 });
    }
    // 吸血战士要 2 张代价（献祭 + 代价），其余 1 张
    const needCount = u.def.ability === 'lifesteal' ? 2 : 1;
    if (others.length < needCount) continue;
    others.sort((a, b) => a.threat - b.threat);
    const discardIdx = others[0].idx;
    const sacrificeIdx = needCount === 2 ? others[1].idx : null;

    // 选位置：优先 front 中列 → front 其他列 → back 中列
    const pos = pickDeployCell(empty, u.def);
    const check = canPlayUnit(state, SIDES.ENEMY, u.idx, pos.row, pos.col, discardIdx);
    if (!check.ok) continue;

    return playUnit(state, SIDES.ENEMY, u.idx, pos.row, pos.col, discardIdx, sacrificeIdx);
  }
  return null;
}

// 部署位置优先级：front 中 → front 边 → back 中 → back 边
function pickDeployCell(empty, def) {
  const pref = [
    { row: 'front', col: 1 },
    { row: 'front', col: 0 },
    { row: 'front', col: 2 },
    { row: 'back', col: 1 },
    { row: 'back', col: 0 },
    { row: 'back', col: 2 }
  ];
  for (const p of pref) {
    if (empty.some(e => e.row === p.row && e.col === p.col)) return p;
  }
  return empty[0];
}
