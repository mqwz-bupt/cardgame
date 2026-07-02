// 游戏状态 schema 与工厂。
// 所有游戏逻辑都基于此 state，纯函数更新（不可变）。

import { DECK_RECIPE } from '../data/cards.js';
import { shuffle as shuffleDeck } from './rng.js';

export const PHASES = Object.freeze({
  DRAW: 'DRAW',
  DEPLOY: 'DEPLOY',
  REVEAL: 'REVEAL',
  BATTLE: 'BATTLE',
  END: 'END'
});

export const SIDES = Object.freeze({ PLAYER: 'player', ENEMY: 'enemy' });

export const ROWS = ['front', 'back'];
export const COLS = [0, 1, 2];

// 本方编号 1-6 ↔ (row, col) 双向映射，源自"5,3,1 / 6,4,2"布局
// 1=后右 2=前右 3=后中 4=前中 5=后左 6=前左
export const LOCAL_POS_BY_ROW_COL = {
  'back-2': 1, 'front-2': 2,
  'back-1': 3, 'front-1': 4,
  'back-0': 5, 'front-0': 6
};
export const ROW_COL_BY_LOCAL_POS = Object.fromEntries(
  Object.entries(LOCAL_POS_BY_ROW_COL).map(([k, v]) => [v, k])
);

export function cellKey(row, col) { return `${row}-${col}`; }
export function parseCellKey(key) {
  const [row, colStr] = key.split('-');
  return { row, col: Number(colStr) };
}

// 内部：根据 recipe 构建牌库（每张牌生成独立实例 uid）
function buildDeckFromRecipe(recipe, side) {
  const cards = [];
  let n = 0;
  for (const { id, count } of recipe) {
    for (let i = 0; i < count; i++) {
      cards.push({
        cardId: id,
        uid: `${side}-${id}-${n++}`
      });
    }
  }
  return cards;
}

// 创建一个新单位实例（牌库中的单位被放到战场时包装）
export function createUnitInstance(cardDef, uid, options = {}) {
  return {
    uid,
    def: cardDef,
    hp: cardDef.hp,
    revealed: !!options.revealed
  };
}

// 创建初始 state
export function createInitialState(options = {}) {
  const recipe = options.recipe || DECK_RECIPE;
  const firstAttacker = options.firstAttacker || SIDES.PLAYER;

  // 双方共用单一牌库（40 张），创建后立即洗牌
  const sharedDeck = shuffleDeck(buildDeckFromRecipe(recipe, 'shared'), options.rng || undefined);

  return {
    turnNo: 1,
    firstAttacker,
    phase: PHASES.DRAW,
    weather: null,
    globalDeathCount: 0,
    rng: options.rng || null,
    deck: sharedDeck,
    discard: [],
    targetOverrides: {},  // uid → {side, row, col}（瞄准阶段写入）
    players: {
      [SIDES.PLAYER]: createEmptyPlayer(),
      [SIDES.ENEMY]: createEmptyPlayer()
    },
    log: [],
    winner: null
  };
}

function createEmptyPlayer() {
  return {
    lord: { hp: 3, extraDrawNextTurn: 0 },
    hand: [],
    board: createEmptyBoard()
  };
}

function createEmptyBoard() {
  const board = {};
  for (const row of ROWS) {
    for (const col of COLS) {
      board[cellKey(row, col)] = null;
    }
  }
  return board;
}

// 不可变更新工具：返回浅拷贝的 state（结构共享），用于纯函数 reducer
export function cloneState(state) {
  return {
    ...state,
    deck: state.deck ? state.deck.slice() : state.deck,
    discard: state.discard ? state.discard.slice() : state.discard,
    targetOverrides: { ...(state.targetOverrides || {}) },
    players: {
      [SIDES.PLAYER]: clonePlayer(state.players[SIDES.PLAYER]),
      [SIDES.ENEMY]: clonePlayer(state.players[SIDES.ENEMY])
    },
    log: state.log.slice()
  };
}

function clonePlayer(p) {
  return {
    ...p,
    lord: { ...p.lord },
    hand: p.hand.slice(),
    board: { ...p.board }
  };
}

// 辅助：取对方 side
export function opponentOf(side) {
  return side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
}
