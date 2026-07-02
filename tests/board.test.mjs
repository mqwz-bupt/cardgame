// 战场坐标辅助单测
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, SIDES } from '../src/game/state.js';
import { mirrorCol, sameColumnEnemies, getAdjacentFriendly, listOccupiedCells, hasNoUnits } from '../src/game/board.js';

test('mirrorCol: 我方 col 2 ↔ 敌方 col 0', () => {
  assert.equal(mirrorCol(0), 2);
  assert.equal(mirrorCol(1), 1);
  assert.equal(mirrorCol(2), 0);
});

test('hasNoUnits: 空战场返回 true', () => {
  const s = createInitialState();
  assert.equal(hasNoUnits(s, SIDES.PLAYER), true);
  assert.equal(hasNoUnits(s, SIDES.ENEMY), true);
});

test('listOccupiedCells: 按本方编号 1-6 排序', () => {
  const s = createInitialState();
  s.players[SIDES.PLAYER].board['back-2'] = { uid: 'a', def: { id: 'axe' }, hp: 3, revealed: true };
  s.players[SIDES.PLAYER].board['front-0'] = { uid: 'b', def: { id: 'axe' }, hp: 3, revealed: true };
  const list = listOccupiedCells(s, SIDES.PLAYER);
  assert.equal(list.length, 2);
  assert.equal(list[0].localPos, 1);   // back-2
  assert.equal(list[1].localPos, 6);   // front-0
});

test('sameColumnEnemies: 我方 col 2 → 敌方 col 0 前后排', () => {
  const s = createInitialState();
  s.players[SIDES.ENEMY].board['front-0'] = { uid: 'x', def: { id: 'axe' }, hp: 3, revealed: true };
  s.players[SIDES.ENEMY].board['back-0']  = { uid: 'y', def: { id: 'axe' }, hp: 3, revealed: true };
  const [front, back] = sameColumnEnemies(s, SIDES.PLAYER, 2);
  assert.equal(front.uid, 'x');
  assert.equal(back.uid, 'y');
});

test('getAdjacentFriendly: 中列单位的相邻友军', () => {
  const s = createInitialState();
  s.players[SIDES.PLAYER].board['front-1'] = { uid: 'me', def: { id: 'shield' }, hp: 2, revealed: true };
  s.players[SIDES.PLAYER].board['front-0'] = { uid: 'left', def: { id: 'shield' }, hp: 2, revealed: true };
  s.players[SIDES.PLAYER].board['front-2'] = { uid: 'right', def: { id: 'shield' }, hp: 2, revealed: true };
  s.players[SIDES.PLAYER].board['back-1']  = { uid: 'back', def: { id: 'shield' }, hp: 2, revealed: true };
  const adj = getAdjacentFriendly(s, SIDES.PLAYER, 'front', 1);
  assert.equal(adj.length, 3);
});
