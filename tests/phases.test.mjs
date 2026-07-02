// 阶段机单测：DRAW → DEPLOY → REVEAL → BATTLE → END
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, SIDES, PHASES } from '../src/game/state.js';
import { UNITS } from '../src/data/cards.js';
import {
  startGame, revealPhase, runBattlePhase, endTurn, runDrawPhase
} from '../src/game/phases.js';

function placeUnit(state, side, row, col, def, hp, revealed = false) {
  state.players[side].board[`${row}-${col}`] = {
    uid: `${side}-${row}-${col}`,
    def: { ...def },
    hp: hp ?? def.hp,
    revealed
  };
  return state;
}

// 单位-only recipe，避免天气卡在首抽触发额外抽牌
const UNITS_ONLY_RECIPE = [
  { id: 'swordsman', count: 4 },
  { id: 'archer', count: 4 },
  { id: 'shield', count: 4 },
  { id: 'axe', count: 4 }
];

test('startGame: 双方各 7 张手牌 + phase=DEPLOY', () => {
  const s = startGame({ recipe: UNITS_ONLY_RECIPE });
  assert.equal(s.phase, PHASES.DEPLOY);
  assert.equal(s.players[SIDES.PLAYER].hand.length, 7);
  assert.equal(s.players[SIDES.ENEMY].hand.length, 7);
});

test('revealPhase: 暗置单位全部翻面 + phase=REVEAL', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.axe, 3, false);
  placeUnit(s, SIDES.ENEMY, 'front', 2, UNITS.axe, 3, false);
  s = revealPhase(s);
  assert.equal(s.phase, PHASES.REVEAL);
  assert.equal(s.players[SIDES.PLAYER].board['front-0'].revealed, true);
  assert.equal(s.players[SIDES.ENEMY].board['front-2'].revealed, true);
});

test('revealPhase: 炸弹人不在亮出阶段造成伤害（先发改在战斗开始）', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.bomber, 1, false);
  placeUnit(s, SIDES.ENEMY, 'front', 2, UNITS.axe, 3, true);  // mirror col 0
  s = revealPhase(s);
  // reveal 不再扣血；axe 保持 3hp（伤害将在战斗开始时由先发触发）
  assert.equal(s.players[SIDES.ENEMY].board['front-2'].hp, 3);
});

test('revealPhase: 盗贼孤立先手攻击', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.thief, 2, false);  // 无相邻友军
  placeUnit(s, SIDES.ENEMY, 'front', 2, UNITS.axe, 3, true);      // mirror col 0
  s = revealPhase(s);
  assert.equal(s.players[SIDES.ENEMY].board['front-2'].hp, 2);
});

test('runBattlePhase: 进入 BATTLE 后转 END + 战斗结算', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.axe);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe);
  s = runBattlePhase(s);
  assert.equal(s.phase, PHASES.END);
  assert.equal(s.players[SIDES.PLAYER].board['front-2'].hp, 2);
  assert.equal(s.players[SIDES.ENEMY].board['front-0'].hp, 2);
});

test('endTurn: turnNo+1 + firstAttacker 交换 + phase=DRAW', () => {
  let s = createInitialState();
  s.firstAttacker = SIDES.PLAYER;
  s = endTurn(s);
  assert.equal(s.turnNo, 2);
  assert.equal(s.firstAttacker, SIDES.ENEMY);
  assert.equal(s.phase, PHASES.DRAW);
});

test('runDrawPhase: 双方各抽 3 张 + phase=DEPLOY', () => {
  let s = createInitialState();
  // 用纯 axe 牌库避免天气触发（双方共用）
  s.deck = Array.from({length: 20}, (_, i) => ({cardId:'axe', uid:`shared-axe-${i}`}));
  s.discard = [];
  s.players[SIDES.PLAYER].hand = [];
  s.players[SIDES.ENEMY].hand = [];
  s = runDrawPhase(s);
  assert.equal(s.phase, PHASES.DEPLOY);
  assert.equal(s.players[SIDES.PLAYER].hand.length, 3);
  assert.equal(s.players[SIDES.ENEMY].hand.length, 3);
});

test('runDrawPhase: extraDrawNextTurn 补偿生效（PLAYER +2）', () => {
  let s = createInitialState();
  s.deck = Array.from({length: 20}, (_, i) => ({cardId:'axe', uid:`shared-axe-${i}`}));
  s.discard = [];
  s.players[SIDES.PLAYER].hand = [];
  s.players[SIDES.ENEMY].hand = [];
  s.players[SIDES.PLAYER].lord.extraDrawNextTurn = 2;
  s = runDrawPhase(s);
  assert.equal(s.players[SIDES.PLAYER].hand.length, 5);   // 3 + 2
  assert.equal(s.players[SIDES.ENEMY].hand.length, 3);
  assert.equal(s.players[SIDES.PLAYER].lord.extraDrawNextTurn, 0);
});
