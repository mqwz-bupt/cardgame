// 攻击目标选择 + 伤害结算单测
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, SIDES } from '../src/game/state.js';
import { UNITS } from '../src/data/cards.js';
import {
  selectTarget, computeAttackTargets, applyDamage, canRangedHitUnderRain
} from '../src/game/attack.js';

function placeUnit(state, side, row, col, def, hp) {
  state.players[side].board[`${row}-${col}`] = {
    uid: `${side}-${row}-${col}`,
    def: { ...def },
    hp: hp ?? def.hp,
    revealed: true
  };
  return state;
}

test('selectTarget: 常规优先打同列对面前排', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.axe);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe);
  placeUnit(s, SIDES.ENEMY, 'front', 1, UNITS.axe);
  const target = selectTarget(s, { side: SIDES.PLAYER, row: 'front', col: 2, unit: s.players.player.board['front-2'] });
  assert.equal(target.col, 0);
  assert.equal(target.row, 'front');
});

test('selectTarget: 同列前排空 → 打同列后排', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.axe);
  placeUnit(s, SIDES.ENEMY, 'back', 0, UNITS.axe);
  const target = selectTarget(s, { side: SIDES.PLAYER, row: 'front', col: 2, unit: s.players.player.board['front-2'] });
  assert.equal(target.row, 'back');
  assert.equal(target.col, 0);
});

test('selectTarget: 敌方战场全空返回 null（主公攻击）', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.axe);
  const target = selectTarget(s, { side: SIDES.PLAYER, row: 'front', col: 2, unit: s.players.player.board['front-2'] });
  assert.equal(target, null);
});

test('computeAttackTargets: 剑士穿刺对一列两组目标', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.swordsman);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe);
  placeUnit(s, SIDES.ENEMY, 'back', 0, UNITS.axe);
  const targets = computeAttackTargets(s, { side: SIDES.PLAYER, row: 'front', col: 2, unit: s.players.player.board['front-2'] });
  assert.equal(targets.length, 2);
  assert.equal(targets[0].row, 'front');
  assert.equal(targets[1].row, 'back');
});

test('applyDamage: 直接扣血', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe, 3);
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.axe);
  const target = { side: SIDES.ENEMY, row: 'front', col: 0, unit: s.players.enemy.board['front-0'], dmg: 1 };
  const r = applyDamage(s, { side: SIDES.PLAYER, row: 'front', col: 2, unit: s.players.player.board['front-2'] }, target);
  assert.equal(r.state.players.enemy.board['front-0'].hp, 2);
  assert.equal(r.killed.length, 0);
});

test('applyDamage: 盾兵替伤 — 相邻盾兵扣血', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 1, UNITS.shield, 2);
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.axe, 3);
  placeUnit(s, SIDES.ENEMY, 'front', 2, UNITS.axe);
  const target = { side: SIDES.PLAYER, row: 'front', col: 0, unit: s.players.player.board['front-0'], dmg: 1 };
  const r = applyDamage(s, { side: SIDES.ENEMY, row: 'front', col: 2, unit: s.players.enemy.board['front-2'] }, target);
  assert.equal(r.state.players.player.board['front-0'].hp, 3);
  assert.equal(r.state.players.player.board['front-1'].hp, 1);
});

test('applyDamage: 死亡进弃牌堆，全局死亡计数 +1', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe, 1);
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.axe);
  const target = { side: SIDES.ENEMY, row: 'front', col: 0, unit: s.players.enemy.board['front-0'], dmg: 1 };
  const r = applyDamage(s, { side: SIDES.PLAYER, row: 'front', col: 2, unit: s.players.player.board['front-2'] }, target);
  assert.equal(r.state.players.enemy.board['front-0'], null);
  assert.equal(r.state.discard.length, 1);
  assert.equal(r.state.globalDeathCount, 1);
});

test('canRangedHitUnderRain: 雨天弓箭手不能越过前排打后排', () => {
  let s = createInitialState();
  s.weather = 'rain';
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.archer);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe);
  const attacker = { side: SIDES.PLAYER, row: 'front', col: 2, unit: s.players.player.board['front-2'] };
  const blockedTarget = { side: SIDES.ENEMY, row: 'back', col: 0, unit: null };
  assert.equal(canRangedHitUnderRain(s, attacker, blockedTarget), false);
  s.players[SIDES.ENEMY].board['front-0'] = null;
  assert.equal(canRangedHitUnderRain(s, attacker, blockedTarget), true);
});

test('selectTarget 雪天: 先斜前后打正前', () => {
  let s = createInitialState();
  s.weather = 'snow';
  placeUnit(s, SIDES.PLAYER, 'front', 1, UNITS.axe);
  placeUnit(s, SIDES.ENEMY, 'front', 1, UNITS.axe);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe);
  const target = selectTarget(s, { side: SIDES.PLAYER, row: 'front', col: 1, unit: s.players.player.board['front-1'] });
  assert.equal(target.col, 0);
});
