// 敌方 AI 主路径单测
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, SIDES, PHASES } from '../src/game/state.js';
import { UNITS } from '../src/data/cards.js';
import { enemyDeploy } from '../src/game/ai.js';

function setHand(state, side, cards) {
  state.players[side].hand = cards.map((c, i) => ({ cardId: c, uid: `${side}-${c}-${i}` }));
}

test('enemyDeploy: 出 axe 弃 1 张代价 + phase 不变', () => {
  const s = createInitialState({ recipe: [] });
  setHand(s, SIDES.ENEMY, ['axe', 'axe']);
  const next = enemyDeploy(s);
  // enemyDeploy 不改 phase
  assert.equal(next.phase, s.phase);
  assert.equal(next.players[SIDES.ENEMY].hand.length, 0);
  assert.equal(next.discard.length, 1);
  const occ = Object.values(next.players[SIDES.ENEMY].board).filter(u => u);
  assert.equal(occ.length, 1);
  assert.equal(occ[0].def.id, 'axe');
  assert.equal(occ[0].revealed, false);
});

test('enemyDeploy: 多回合依次填满 front 排，再填 back', () => {
  const s = createInitialState({ recipe: [] });
  setHand(s, SIDES.ENEMY, Array.from({ length: 12 }, () => 'axe'));
  const next = enemyDeploy(s);
  const b = next.players[SIDES.ENEMY].board;
  assert.ok(b['front-0']);
  assert.ok(b['front-1']);
  assert.ok(b['front-2']);
  assert.ok(b['back-0']);
  assert.ok(b['back-1']);
  assert.ok(b['back-2']);
});

test('enemyDeploy: 战场满 → 不再部署', () => {
  const s = createInitialState({ recipe: [] });
  for (const row of ['front', 'back']) {
    for (const col of [0, 1, 2]) {
      s.players[SIDES.ENEMY].board[`${row}-${col}`] = {
        uid: `e-${row}-${col}`,
        def: { ...UNITS.axe },
        hp: 3,
        revealed: false
      };
    }
  }
  setHand(s, SIDES.ENEMY, ['axe', 'axe']);
  const next = enemyDeploy(s);
  assert.equal(next.players[SIDES.ENEMY].hand.length, 2);
});

test('enemyDeploy: 手牌只 1 张 → 不部署', () => {
  const s = createInitialState({ recipe: [] });
  setHand(s, SIDES.ENEMY, ['axe']);
  const next = enemyDeploy(s);
  assert.equal(next.players[SIDES.ENEMY].hand.length, 1);
  const occ = Object.values(next.players[SIDES.ENEMY].board).filter(u => u);
  assert.equal(occ.length, 0);
});

test('enemyDeploy: 优先释放变羊术到玩家最强单位', () => {
  const s = createInitialState({ recipe: [] });
  setHand(s, SIDES.ENEMY, ['polymorph', 'axe']);
  s.players[SIDES.PLAYER].board['front-0'] = {
    uid: 'p-axe-0', def: { ...UNITS.axe }, hp: 1, revealed: true
  };
  s.players[SIDES.PLAYER].board['front-1'] = {
    uid: 'p-axe-1', def: { ...UNITS.axe }, hp: 3, revealed: true
  };
  const next = enemyDeploy(s);
  assert.equal(next.players[SIDES.PLAYER].board['front-1'].def.id, '__sheep__');
  assert.equal(next.players[SIDES.PLAYER].board['front-1'].hp, 1);
  assert.equal(next.players[SIDES.PLAYER].board['front-0'].def.id, 'axe');
  assert.equal(next.players[SIDES.PLAYER].board['front-0'].hp, 1);
});

test('enemyDeploy: 玩家 hp<2 单位不变羊（不浪费）', () => {
  const s = createInitialState({ recipe: [] });
  setHand(s, SIDES.ENEMY, ['polymorph', 'axe']);
  s.players[SIDES.PLAYER].board['front-0'] = {
    uid: 'p-1', def: { ...UNITS.axe }, hp: 1, revealed: true
  };
  const next = enemyDeploy(s);
  // 玩家单位未被变羊（仍是 axe）
  assert.equal(next.players[SIDES.PLAYER].board['front-0'].def.id, 'axe');
  assert.equal(next.players[SIDES.PLAYER].board['front-0'].hp, 1);
  // log 里不应有 polymorph_cast 事件
  assert.ok(!next.log.some(e => e.type === 'polymorph_cast'));
});

test('enemyDeploy: 单位牌威胁排序 — 剑士优于斧兵', () => {
  const s = createInitialState({ recipe: [] });
  setHand(s, SIDES.ENEMY, ['swordsman', 'axe', 'axe', 'axe']);
  const next = enemyDeploy(s);
  const occ = Object.values(next.players[SIDES.ENEMY].board).filter(u => u);
  assert.equal(occ.length, 2);
  assert.ok(occ.some(u => u.def.id === 'swordsman'));
});

test('enemyDeploy: 吸血战士需手牌 >= 3 — 不足时转出其他单位', () => {
  // 2 张 vampire+axe：吸血战士付不起 → AI 转去部署 axe（弃 vampire 代价）
  const s = createInitialState({ recipe: [] });
  setHand(s, SIDES.ENEMY, ['vampire', 'axe']);
  const next = enemyDeploy(s);
  const occ = Object.values(next.players[SIDES.ENEMY].board).filter(u => u);
  assert.equal(occ.length, 1);
  assert.equal(occ[0].def.id, 'axe');
  assert.equal(next.discard.length, 1);
  assert.equal(next.discard[0].cardId, 'vampire');

  // 3 张 vampire+axe+axe：吸血战士可以部署
  const s2 = createInitialState({ recipe: [] });
  setHand(s2, SIDES.ENEMY, ['vampire', 'axe', 'axe']);
  const next2 = enemyDeploy(s2);
  const occ2 = Object.values(next2.players[SIDES.ENEMY].board).filter(u => u);
  assert.equal(occ2.length, 1);
  assert.equal(occ2[0].def.id, 'vampire');
});
