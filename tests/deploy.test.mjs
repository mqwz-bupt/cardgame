// 出牌阶段：部署单位 / 释放变羊术 单测
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, SIDES } from '../src/game/state.js';
import { UNITS, SPELLS, SHEEP } from '../src/data/cards.js';
import {
  canPlayUnit, playUnit, playPolymorph
} from '../src/game/deploy.js';

function freshState() {
  return createInitialState({ recipe: [] });  // 空牌库
}

function setHand(state, side, cards) {
  state.players[side].hand = cards.map((c, i) => ({ cardId: c, uid: `${side}-${c}-${i}` }));
}

test('canPlayUnit: 手牌不足 2 张拒绝', () => {
  const s = freshState();
  setHand(s, SIDES.PLAYER, ['axe']);  // 只 1 张
  const r = canPlayUnit(s, SIDES.PLAYER, 0, 'front', 0, null);
  assert.equal(r.ok, false);
  assert.match(r.reason, /cannot_afford/);
});

test('canPlayUnit: 代价弃同一张拒绝', () => {
  const s = freshState();
  setHand(s, SIDES.PLAYER, ['axe', 'swordsman']);
  const r = canPlayUnit(s, SIDES.PLAYER, 0, 'front', 0, 0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'discard_same_as_play');
});

test('canPlayUnit: 目标格已占拒绝', () => {
  const s = freshState();
  setHand(s, SIDES.PLAYER, ['axe', 'swordsman']);
  s.players[SIDES.PLAYER].board['front-0'] = {
    uid: 'u', def: { ...UNITS.axe }, hp: 3, revealed: false
  };
  const r = canPlayUnit(s, SIDES.PLAYER, 0, 'front', 0, 1);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'cell_occupied');
});

test('canPlayUnit: 吸血战士需手牌 >= 3', () => {
  const s = freshState();
  setHand(s, SIDES.PLAYER, ['vampire', 'axe']);
  const r = canPlayUnit(s, SIDES.PLAYER, 0, 'front', 0, 1);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'vampire_needs_sacrifice');
});

test('playUnit: 出 axe 弃 1 张作为代价', () => {
  const s = freshState();
  setHand(s, SIDES.PLAYER, ['axe', 'swordsman']);
  const next = playUnit(s, SIDES.PLAYER, 0, 'front', 2, 1);
  assert.equal(next.players[SIDES.PLAYER].hand.length, 0);
  assert.equal(next.discard.length, 1);
  assert.equal(next.discard[0].cardId, 'swordsman');
  const unit = next.players[SIDES.PLAYER].board['front-2'];
  assert.ok(unit);
  assert.equal(unit.def.id, 'axe');
  assert.equal(unit.hp, 3);
  assert.equal(unit.revealed, false);
});

test('playPolymorph: 敌方目标变 1/1 绵羊 + 我方手牌 -1', () => {
  const s = freshState();
  setHand(s, SIDES.PLAYER, ['polymorph', 'axe']);
  s.players[SIDES.ENEMY].board['front-1'] = {
    uid: 'enemy-swordsman-0',
    def: { ...UNITS.swordsman },
    hp: 2,
    revealed: true
  };
  const before = s.players[SIDES.PLAYER].hand.length;
  const next = playPolymorph(s, SIDES.PLAYER, 0, 'front', 1);
  const sheeped = next.players[SIDES.ENEMY].board['front-1'];
  assert.ok(sheeped);
  assert.equal(sheeped.def.id, '__sheep__');
  assert.equal(sheeped.hp, 1);
  assert.equal(sheeped.def.atk, 1);
  assert.equal(sheeped.revealed, true);
  assert.equal(next.players[SIDES.PLAYER].hand.length, before - 1);
  assert.equal(next.discard.length, 1);
  assert.equal(next.discard[0].cardId, 'polymorph');
});

test('playPolymorph: 无目标抛错', () => {
  const s = freshState();
  setHand(s, SIDES.PLAYER, ['polymorph']);
  assert.throws(() => playPolymorph(s, SIDES.PLAYER, 0, 'front', 0), /polymorph_no_target/);
});

test('playPolymorph: 非变羊术索引抛错', () => {
  const s = freshState();
  setHand(s, SIDES.PLAYER, ['axe']);
  s.players[SIDES.ENEMY].board['front-0'] = {
    uid: 'e', def: { ...UNITS.axe }, hp: 3, revealed: true
  };
  assert.throws(() => playPolymorph(s, SIDES.PLAYER, 0, 'front', 0), /polymorph_invalid/);
});
