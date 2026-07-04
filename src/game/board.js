// 战场坐标辅助：本方编号、对手列、相邻、按全局序号遍历。
// 屏幕布局（玩家视角）：
//   敌后排:  5  3  1     ← 敌方本方编号 5/3/1 在 col 0/1/2
//   敌前排:  6  4  2
//   ─────────────
//   我前排:  6  4  2     ← 我方本方编号 6/4/2 在 col 0/1/2
//   我后排:  5  3  1
//
// 我方"右列"=col 2；敌方"右列"从敌方自己视角是 col 2，但屏幕上看是 col 0。
// 因此"镜像"：我方 col 2 ↔ 敌方 col 0；我方 col 1 ↔ 敌方 col 1；我方 col 0 ↔ 敌方 col 2。

import { SIDES, ROWS, COLS, LOCAL_POS_BY_ROW_COL, ROW_COL_BY_LOCAL_POS, cellKey } from './state.js';

// 镜像列：给定 side 与该 side 的本方 col，返回对方 side 看到的 col
export function mirrorCol(col) {
  return 2 - col;
}

// 给 side + 本方编号（1-6），返回 {row, col}
export function cellFromLocalPos(side, localPos) {
  const key = ROW_COL_BY_LOCAL_POS[localPos];
  if (!key) throw new Error(`invalid localPos ${localPos}`);
  const [row, colStr] = key.split('-');
  return { row, col: Number(colStr) };
}

// 给 side + (row, col)，返回本方编号 1-6
export function localPosOfCell(side, row, col) {
  return LOCAL_POS_BY_ROW_COL[cellKey(row, col)];
}

// 取格子的单位实例（只读）
export function getUnit(state, side, row, col) {
  return state.players[side].board[cellKey(row, col)];
}

// 取对方在"我方 (row, col) 镜像列上"的同 row 单位（即"同列对面"）
export function getOpposingUnit(state, side, row, col) {
  const enemy = side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
  return state.players[enemy].board[cellKey(row, mirrorCol(col))];
}

// 同列对面前排 + 后排（返回数组，按攻击优先级：先 front 后 back）
export function sameColumnEnemies(state, side, col) {
  const enemy = side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
  const enemyCol = mirrorCol(col);
  return [
    state.players[enemy].board[cellKey('front', enemyCol)],
    state.players[enemy].board[cellKey('back', enemyCol)]
  ];
}

// 取上下左右相邻友军（用于盾兵替伤、盗贼孤立判定）
// 返回对象带 side 字段，方便下游 damageUnit 使用
export function getAdjacentFriendly(state, side, row, col) {
  const result = [];
  const candidates = [
    { row, col: col - 1 },
    { row, col: col + 1 },
    { row: row === 'front' ? 'back' : 'front', col }
  ];
  for (const c of candidates) {
    if (c.col < 0 || c.col > 2) continue;
    const u = state.players[side].board[cellKey(c.row, c.col)];
    if (u) result.push({ ...c, side, unit: u });
  }
  return result;
}

export function hasAdjacentEmptyCell(state, side, row, col) {
  const candidates = [
    { row, col: col - 1 },
    { row, col: col + 1 },
    { row: row === 'front' ? 'back' : 'front', col }
  ];
  return candidates.some(c => (
    c.col >= 0
    && c.col <= 2
    && !state.players[side].board[cellKey(c.row, c.col)]
  ));
}

// 列出某方所有非空格（按本方编号 1-6 排序）
export function listOccupiedCells(state, side) {
  const out = [];
  for (const row of ROWS) {
    for (const col of COLS) {
      const u = state.players[side].board[cellKey(row, col)];
      if (u) out.push({ side, row, col, unit: u, localPos: LOCAL_POS_BY_ROW_COL[cellKey(row, col)] });
    }
  }
  return out.sort((a, b) => a.localPos - b.localPos);
}

// 列出某方所有空格
export function listEmptyCells(state, side) {
  const out = [];
  for (const row of ROWS) {
    for (const col of COLS) {
      if (!state.players[side].board[cellKey(row, col)]) {
        out.push({ side, row, col, localPos: LOCAL_POS_BY_ROW_COL[cellKey(row, col)] });
      }
    }
  }
  return out;
}

// 是否完全没有单位（主公直接受攻击判定用）
export function hasNoUnits(state, side) {
  for (const row of ROWS) {
    for (const col of COLS) {
      if (state.players[side].board[cellKey(row, col)]) return false;
    }
  }
  return true;
}
