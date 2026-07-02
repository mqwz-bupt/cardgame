// 战斗中按需选目标 单测：any_target/bomb/flex 单位的可击目标查询
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, SIDES } from '../src/game/state.js';
import { UNITS } from '../src/data/cards.js';
import {
  needsTarget, getValidTargets, pickEnemyTarget
} from '../src/game/targeting.js';

function placeUnit(state, side, row, col, def, hp) {
  state.players[side].board[`${row}-${col}`] = {
    uid: `${side}-${row}-${col}`,
    def: { ...def },
    hp: hp ?? def.hp,
    revealed: true
  };
  return state;
}

test('needsTarget: any_target/bomb/flex 返回 true', () => {
  assert.equal(needsTarget(UNITS.archer), true);
  assert.equal(needsTarget(UNITS.bomber), true);
  assert.equal(needsTarget(UNITS.priest), true);
  assert.equal(needsTarget(UNITS.axe), false);
  assert.equal(needsTarget(UNITS.swordsman), false);
});

test('getValidTargets: 返回所有敌方单位（晴天）', () => {
  const s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.archer);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe);
  placeUnit(s, SIDES.ENEMY, 'back', 1, UNITS.axe);
  const valids = getValidTargets(s, { side: SIDES.PLAYER, row: 'front', col: 0, unit: s.players.player.board['front-0'] });
  assert.equal(valids.length, 2);
});

test('getValidTargets: 雨天弓箭手不能越过该列前排打后排', () => {
  const s = createInitialState();
  s.weather = 'rain';
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.archer);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe);   // 同列前排有单位
  placeUnit(s, SIDES.ENEMY, 'back', 0, UNITS.axe);    // 同列后排
  placeUnit(s, SIDES.ENEMY, 'back', 1, UNITS.axe);    // 其他列后排（无前排）
  const valids = getValidTargets(s, { side: SIDES.PLAYER, row: 'front', col: 0, unit: s.players.player.board['front-0'] });
  // 应能打：front-0（同列前排）、back-1（其他列后排，无前排阻挡）
  assert.equal(valids.length, 2);
  assert.ok(valids.some(v => v.row === 'front' && v.col === 0));
  assert.ok(valids.some(v => v.row === 'back' && v.col === 1));
});

test('pickEnemyTarget: 选 hp+atk 最高的目标', () => {
  const s = createInitialState();
  placeUnit(s, SIDES.ENEMY, 'front', 1, UNITS.archer);
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.axe);   // 3 hp
  placeUnit(s, SIDES.PLAYER, 'front', 1, UNITS.axe, 1); // 1 hp
  const t = pickEnemyTarget(s, { side: SIDES.ENEMY, row: 'front', col: 1, unit: s.players.enemy.board['front-1'] });
  assert.ok(t);
  // 应选 hp+atk 最高的 → front-0（3+1=4）
  assert.equal(t.row, 'front');
  assert.equal(t.col, 0);
});

test('pickEnemyTarget: 无目标返回 null', () => {
  const s = createInitialState();
  placeUnit(s, SIDES.ENEMY, 'front', 1, UNITS.archer);
  const t = pickEnemyTarget(s, { side: SIDES.ENEMY, row: 'front', col: 1, unit: s.players.enemy.board['front-1'] });
  assert.equal(t, null);
});
