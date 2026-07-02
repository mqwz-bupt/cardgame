// 战斗阶段主流程单测
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, SIDES } from '../src/game/state.js';
import { UNITS } from '../src/data/cards.js';
import { runBattle, runBattleIter } from '../src/game/battle.js';

function placeUnit(state, side, row, col, def, hp) {
  state.players[side].board[`${row}-${col}`] = {
    uid: `${side}-${row}-${col}`,
    def: { ...def },
    hp: hp ?? def.hp,
    revealed: true
  };
  return state;
}

test('双方 axe 同列对面互扣 1 血', () => {
  let s = createInitialState();
  s.firstAttacker = SIDES.PLAYER;
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.axe);   // localPos 2 = global 3
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe);    // localPos 6 = global 12
  s = runBattle(s);
  assert.equal(s.players[SIDES.PLAYER].board['front-2'].hp, 2);
  assert.equal(s.players[SIDES.ENEMY].board['front-0'].hp, 2);
});

test('击杀进弃牌堆 + globalDeathCount +1', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.axe);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe, 1); // 1hp 一击毙
  s = runBattle(s);
  assert.equal(s.players[SIDES.ENEMY].board['front-0'], null);
  assert.equal(s.discard.length, 1);
  assert.equal(s.globalDeathCount, 1);
});

test('剑士穿刺对同列前后排各扣 1 血', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.swordsman);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe);
  placeUnit(s, SIDES.ENEMY, 'back', 0, UNITS.axe);
  s = runBattle(s);
  assert.equal(s.players[SIDES.ENEMY].board['front-0'].hp, 2);
  assert.equal(s.players[SIDES.ENEMY].board['back-0'].hp, 2);
});

test('狂战士击杀后连杀', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.berserker);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe, 1);
  placeUnit(s, SIDES.ENEMY, 'back', 0, UNITS.axe, 1);
  s = runBattle(s);
  assert.equal(s.players[SIDES.ENEMY].board['front-0'], null);
  assert.equal(s.players[SIDES.ENEMY].board['back-0'], null);
  assert.equal(s.globalDeathCount, 2);
});

test('地刺反伤无视盾兵替伤', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.spike);  // 3hp
  placeUnit(s, SIDES.ENEMY, 'front', 2, UNITS.axe);     // 3hp, 与 spike 同位（mirror col 0↔2）
  placeUnit(s, SIDES.ENEMY, 'front', 1, UNITS.shield);  // 2hp, 与 axe 相邻，本应替伤
  s = runBattle(s);
  // spike 自伤 + 被 axe/shield 攻击致死（与本测试断言无关）
  // 关键：axe 被地刺扣 1（盾兵未替伤，证明 bypass）
  assert.equal(s.players[SIDES.ENEMY].board['front-2'].hp, 2);
  // shield 完全未替伤 → 保持 2hp（若替伤则应为 1）
  assert.equal(s.players[SIDES.ENEMY].board['front-1'].hp, 2);
});

test('地刺无同位置敌军时不自扣血', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.spike);  // 3hp，对位 front-2 无敌军
  s = runBattle(s);
  // 无对位敌军 → spike 既不自伤也不反伤，保持 3hp
  assert.equal(s.players[SIDES.PLAYER].board['front-0'].hp, 3);
});

test('炸弹人先发: 本回合部署时对任意位置（含后排）造成 1', () => {
  let s = createInitialState();
  // 标记为本回合（turnNo=1）部署
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.bomber);  // localPos 2，先手方
  s.players[SIDES.PLAYER].board['front-0'].deployedAtTurnNo = 1;
  // 敌军后排 axe：在常规近战无法触及的位置，验证「无视位置」
  placeUnit(s, SIDES.ENEMY, 'back', 2, UNITS.axe);       // 3hp
  s = runBattle(s);
  const axe = s.players[SIDES.ENEMY].board['back-2'];
  const axeHpOrGone = axe ? axe.hp : null;
  assert.ok(
    axeHpOrGone === null || axeHpOrGone < 3,
    `炸弹人先发未对 back-2 敌军造成伤害，axe=${axeHpOrGone}`
  );
});

test('炸弹人先发: 非本回合部署时不发动（变弓箭手）', () => {
  let s = createInitialState();
  // turnNo 默认为 1；标记为上一回合（turnNo=0）部署 → 本回合不再先发
  placeUnit(s, SIDES.PLAYER, 'front', 0, UNITS.bomber);
  s.players[SIDES.PLAYER].board['front-0'].deployedAtTurnNo = 0;
  // 敌军后排 axe：先发未发动 → axe 不会被 bomber 在先发阶段命中
  // 主轮 bomber 走弓箭手逻辑：能任意位置射，所以仍可能击中，但属于正常攻击非先发
  placeUnit(s, SIDES.ENEMY, 'back', 2, UNITS.axe);       // 3hp
  // 改用迭代器观察是否有 bomb_pre yield
  const iter = runBattleIter(s);
  const steps = [];
  let choice = null;
  while (true) {
    const { value, done } = iter.next(choice);
    if (done) break;
    if (value.kind === 'await_target') {
      const valids = value.validTargets;
      valids.sort((a, b) => (b.unit.hp + b.unit.def.atk) - (a.unit.hp + a.unit.def.atk));
      choice = { side: valids[0].side, row: valids[0].row, col: valids[0].col };
    } else {
      choice = null;
    }
    steps.push(value);
  }
  const bombPreSteps = steps.filter(st => st.attackerAbility === 'bomb_pre');
  assert.equal(bombPreSteps.length, 0, '不应该有 bomb_pre 步骤');
});

test('敌方战场空 → 单位直接打主公（-1 hp + 下回合 +2 抽）', () => {
  let s = createInitialState();
  placeUnit(s, SIDES.PLAYER, 'back', 2, UNITS.axe);     // localPos 1 = global 1
  s = runBattle(s);
  assert.equal(s.players[SIDES.ENEMY].lord.hp, 2);
  assert.equal(s.players[SIDES.ENEMY].lord.extraDrawNextTurn, 2);
});

test('globalDeathCount 到 4 触发亡灵法师抽 1', () => {
  let s = createInitialState();
  s.players[SIDES.PLAYER].hand = [];
  s.globalDeathCount = 3;
  placeUnit(s, SIDES.PLAYER, 'back', 0, UNITS.necromancer);
  placeUnit(s, SIDES.PLAYER, 'front', 2, UNITS.axe);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe, 1);  // 1hp, 死后 count→4
  s = runBattle(s);
  assert.equal(s.globalDeathCount, 4);
  assert.equal(s.discard.length, 1);
  assert.ok(s.players[SIDES.PLAYER].hand.length >= 1);
  assert.ok(s.log.some(e => e.type === 'necromancer_trigger' && e.side === SIDES.PLAYER));
});
