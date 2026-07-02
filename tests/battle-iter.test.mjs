// P8-2 战斗生成器单测：runBattleIter 在 needsTarget 单位前 yield await_target
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, SIDES } from '../src/game/state.js';
import { UNITS } from '../src/data/cards.js';
import { runBattleIter, runBattle } from '../src/game/battle.js';

function placeUnit(state, side, row, col, def, hp) {
  state.players[side].board[`${row}-${col}`] = {
    uid: `${side}-${row}-${col}`,
    def: { ...def },
    hp: hp ?? def.hp,
    revealed: true
  };
  return state;
}

test('runBattleIter: 玩家弓箭手 → yield await_target，玩家 choice 后继续', () => {
  let s = createInitialState();
  s.firstAttacker = SIDES.PLAYER;
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.archer);   // 玩家弓箭手
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe);       // 敌方斧兵

  const iter = runBattleIter(s);
  // 第一步应是玩家弓箭手的 await_target
  const first = iter.next();
  assert.equal(first.done, false);
  assert.equal(first.value.kind, 'await_target');
  assert.equal(first.value.attackerAbility, 'any_target');
  assert.ok(first.value.validTargets.length > 0);

  // 玩家选择打 col 0
  const choice = { side: SIDES.ENEMY, row: 'front', col: 0 };
  const second = iter.next(choice);
  assert.equal(second.done, false);
  assert.equal(second.value.kind, 'attack');
  assert.equal(second.value.dmg, 1);

  // 继续直到 done
  let last = second;
  while (!last.done) {
    last = iter.next(null);
    if (!last.done && last.value.kind === 'await_target') {
      assert.fail('敌方不应 yield await_target');
    }
  }
  assert.ok(last.done);
  // return 值是最终 state
  // 弓箭手 atk=1 vs 斧兵 hp=3 → 斧兵剩 2 血（然后敌方斧兵反击杀弓箭手）
  assert.equal(last.value.players.enemy.board['front-0']?.hp, 2);
});

test('runBattleIter: 敌方弓箭手 → AI 自动选，无 await_target', () => {
  let s = createInitialState();
  s.firstAttacker = SIDES.ENEMY;
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.archer);
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.axe);

  const iter = runBattleIter(s);
  const seen = [];
  let last;
  do {
    last = iter.next(null);
    if (!last.done) seen.push(last.value.kind);
  } while (!last.done);
  // 不应有 await_target
  assert.ok(!seen.includes('await_target'), '敌方应自动选，不应暂停: ' + JSON.stringify(seen));
  // 应该有 attack
  assert.ok(seen.includes('attack'));
});

test('runBattle 与 runBattleIter 最终 state 一致（自动选）', () => {
  let s = createInitialState();
  s.firstAttacker = SIDES.PLAYER;
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.axe);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe);
  const direct = runBattle(s);
  // drain iter，遇 await_target 用 AI 同款逻辑自动选
  const iter = runBattleIter(s);
  let last;
  let choice = null;
  do {
    last = iter.next(choice);
    choice = null;
    if (!last.done && last.value.kind === 'await_target') {
      const v = last.value.validTargets;
      v.sort((a, b) => (b.unit.hp + b.unit.def.atk) - (a.unit.hp + a.unit.def.atk));
      choice = { side: v[0].side, row: v[0].row, col: v[0].col };
    }
  } while (!last.done);
  const drained = last.value;
  assert.equal(drained.players.enemy.board['front-0']?.hp ?? null,
               direct.players.enemy.board['front-0']?.hp ?? null);
});
