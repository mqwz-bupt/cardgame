// 牌库 & 抽牌单测（双方共用单一牌库模型）
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, SIDES } from '../src/game/state.js';
import { drawCards } from '../src/game/deck.js';
import { ALL_CARDS } from '../src/data/cards.js';

// 固定种子 rng（线性同余），方便断言
function makeRng(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

test('createInitialState: 共用牌库共 40 张，每张 uid 唯一', () => {
  const state = createInitialState({ rng: makeRng(42) });
  assert.equal(state.deck.length, 40);
  const uids = new Set(state.deck.map(c => c.uid));
  assert.equal(uids.size, 40);
  assert.equal(state.discard.length, 0);
});

test('createInitialState: 卡牌分布正确（剑士 4 张、变羊术 2 张、雨 2 张）', () => {
  const state = createInitialState({ rng: makeRng(7) });
  const counts = {};
  for (const c of state.deck) counts[c.cardId] = (counts[c.cardId] || 0) + 1;
  assert.equal(counts.swordsman, 4);
  assert.equal(counts.archer, 4);
  assert.equal(counts.shield, 4);
  assert.equal(counts.axe, 4);
  assert.equal(counts.polymorph, 2);
  assert.equal(counts.rain, 2);
  assert.equal(counts.sun, 2);
  assert.equal(counts.snow, 2);
});

test('drawCards: 抽 7 张到 hand，牌库减 7', () => {
  const rng = makeRng(100);
  let state = createInitialState({ rng });
  state = drawCards(state, SIDES.PLAYER, 7);
  assert.equal(state.players[SIDES.PLAYER].hand.length, 7);
  assert.equal(state.deck.length, 33);
});

test('drawCards: 牌库空时弃牌堆洗回', () => {
  const rng = makeRng(1);
  let state = createInitialState({ rng });
  // 把牌库设为只剩 1 张，弃牌堆放 5 张
  state.deck = [{ cardId: 'axe', uid: 'shared-axe-1' }];
  state.discard = Array.from({ length: 5 }, (_, i) => ({ cardId: 'axe', uid: `d-${i}` }));
  state.players[SIDES.PLAYER].hand = [];

  state = drawCards(state, SIDES.PLAYER, 3);
  const total = state.deck.length + state.discard.length;
  assert.equal(total, 3);
  assert.equal(state.players[SIDES.PLAYER].hand.length, 3);
});

test('drawCards: 手牌超 10 截断到 10', () => {
  let state = createInitialState({ rng: makeRng(2) });
  state.deck = Array.from({ length: 20 }, (_, i) => ({ cardId: 'axe', uid: `a-${i}` }));
  state.discard = [];
  state.players[SIDES.PLAYER].hand = Array.from({ length: 9 }, (_, i) => ({ cardId: 'axe', uid: `h-${i}` }));

  state = drawCards(state, SIDES.PLAYER, 3);
  assert.equal(state.players[SIDES.PLAYER].hand.length, 10);
});

test('drawCards: 牌库空+弃牌堆回库时，state.rng=null 不抛错（T4 卡死回归）', () => {
  // 不传 rng → state.rng 为 null（生产环境默认）
  let state = createInitialState();
  assert.equal(state.rng, null);
  state.deck = [];
  state.discard = Array.from({ length: 5 }, (_, i) => ({ cardId: 'axe', uid: `d-${i}` }));
  state.players[SIDES.PLAYER].hand = [];
  // 不应抛 "rng is not a function"
  state = drawCards(state, SIDES.PLAYER, 3);
  assert.equal(state.players[SIDES.PLAYER].hand.length, 3);
});

test('drawCards: 抽到天气卡时自动触发+补抽，不留滞手牌（40 卡组 100 次蒙特卡洛）', () => {
  let stuckCount = 0;
  for (let trial = 0; trial < 100; trial++) {
    let state = createInitialState();  // 默认 rng=null（生产路径）
    state.players[SIDES.PLAYER].hand = [];
    state = drawCards(state, SIDES.PLAYER, 7);
    const weatherInHand = state.players[SIDES.PLAYER].hand.filter(c => {
      const d = ALL_CARDS[c.cardId];
      return d && d.kind === 'weather';
    }).length;
    if (weatherInHand > 0) stuckCount++;
  }
  assert.equal(stuckCount, 0);
});
