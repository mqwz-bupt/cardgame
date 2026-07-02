// 主公血量 & 胜负判定单测
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, SIDES } from '../src/game/state.js';
import { attackLord, checkWin, consumeExtraDraw } from '../src/game/judge.js';

test('attackLord: hp -1 + 下回合多抽 2', () => {
  let s = createInitialState();
  s = attackLord(s, SIDES.PLAYER);
  assert.equal(s.players[SIDES.PLAYER].lord.hp, 2);
  assert.equal(s.players[SIDES.PLAYER].lord.extraDrawNextTurn, 2);
});

test('attackLord: hp 归零判定败北', () => {
  let s = createInitialState();
  s.players[SIDES.PLAYER].lord.hp = 1;
  s = attackLord(s, SIDES.PLAYER);
  assert.equal(s.players[SIDES.PLAYER].lord.hp, 0);
  assert.equal(s.winner, SIDES.ENEMY);
});

test('checkWin: 双方都满血返回 null', () => {
  const s = createInitialState();
  assert.equal(checkWin(s), null);
});

test('checkWin: 一方血量 0 返回对方胜', () => {
  const s = createInitialState();
  s.players[SIDES.PLAYER].lord.hp = 0;
  assert.equal(checkWin(s), SIDES.ENEMY);
});

test('consumeExtraDraw: 取走补偿计数并清零', () => {
  let s = createInitialState();
  s.players[SIDES.PLAYER].lord.extraDrawNextTurn = 2;
  const r = consumeExtraDraw(s, SIDES.PLAYER);
  assert.equal(r.extra, 2);
  assert.equal(r.state.players[SIDES.PLAYER].lord.extraDrawNextTurn, 0);
});

test('consumeExtraDraw: 计数为 0 时返回 extra=0 不修改 state', () => {
  const s = createInitialState();
  const r = consumeExtraDraw(s, SIDES.PLAYER);
  assert.equal(r.extra, 0);
  assert.equal(r.state, s);
});
