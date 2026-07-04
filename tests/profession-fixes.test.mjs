import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createInitialState, SIDES } from '../src/game/state.js';
import { UNITS } from '../src/data/cards.js';
import { playUnit } from '../src/game/deploy.js';
import { runBattleIter } from '../src/game/battle.js';
import { getSoloStrikeTargets, getValidTargets } from '../src/game/targeting.js';

function placeUnit(state, side, row, col, def, hp = def.hp) {
  state.players[side].board[`${row}-${col}`] = {
    uid: `${side}-${row}-${col}-${def.id}`,
    def: { ...def },
    hp,
    revealed: true
  };
  return state.players[side].board[`${row}-${col}`];
}

function nextStep(iter, choice = null) {
  const r = iter.next(choice);
  assert.equal(r.done, false);
  return r.value;
}

test('vampire deploys after selecting discard and sacrifice cards', () => {
  const s = createInitialState({ recipe: [] });
  s.players[SIDES.PLAYER].hand = [
    { cardId: 'vampire', uid: 'vampire-0' },
    { cardId: 'axe', uid: 'axe-0' },
    { cardId: 'swordsman', uid: 'swordsman-0' }
  ];

  assert.throws(() => playUnit(s, SIDES.PLAYER, 0, 'front', 1, 1), /vampire_needs_sacrifice/);
  const next = playUnit(s, SIDES.PLAYER, 0, 'front', 1, 1, 2);

  assert.equal(next.players[SIDES.PLAYER].board['front-1'].def.id, 'vampire');
  assert.deepEqual(next.discard.map(c => c.cardId), ['axe', 'swordsman']);
  assert.equal(next.players[SIDES.PLAYER].hand.length, 0);
});

test('priest can choose a damaged friendly unit and heal it', () => {
  const s = createInitialState({ recipe: [] });
  const priest = placeUnit(s, SIDES.PLAYER, 'back', 2, UNITS.priest, 2);
  placeUnit(s, SIDES.PLAYER, 'front', 1, UNITS.axe, 2);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe, 3);

  const valids = getValidTargets(s, { side: SIDES.PLAYER, row: 'back', col: 2, unit: priest });
  assert.ok(valids.some(v => v.side === SIDES.PLAYER && v.row === 'front' && v.col === 1));

  const iter = runBattleIter(s);
  const wait = nextStep(iter);
  assert.equal(wait.kind, 'await_target');
  assert.equal(wait.attackerAbility, 'flex');
  const heal = nextStep(iter, { side: SIDES.PLAYER, row: 'front', col: 1 });
  assert.equal(heal.kind, 'heal');
  assert.equal(heal.healed, 1);
  assert.equal(heal.snapshot.players[SIDES.PLAYER].board['front-1'].hp, 3);
});

test('solo strike targets one unit per chosen column and runs after bomb pre', () => {
  const s = createInitialState({ recipe: [] });
  s.firstAttacker = SIDES.PLAYER;
  const bomber = placeUnit(s, SIDES.PLAYER, 'back', 2, UNITS.bomber, 1);
  bomber.deployedAtTurnNo = s.turnNo;
  placeUnit(s, SIDES.PLAYER, 'front', 1, UNITS.thief, 2);
  placeUnit(s, SIDES.ENEMY, 'front', 0, UNITS.axe, 3);
  placeUnit(s, SIDES.ENEMY, 'back', 0, UNITS.axe, 3);
  placeUnit(s, SIDES.ENEMY, 'back', 1, UNITS.axe, 3);

  const thief = s.players[SIDES.PLAYER].board['front-1'];
  const soloTargets = getSoloStrikeTargets(s, { side: SIDES.PLAYER, row: 'front', col: 1, unit: thief });
  assert.deepEqual(soloTargets.map(t => `${t.row}-${t.col}`), ['front-0', 'back-1']);

  const iter = runBattleIter(s);
  const steps = [];
  let choice = null;
  while (true) {
    const r = iter.next(choice);
    if (r.done) break;
    steps.push(r.value);
    if (r.value.kind === 'await_target') {
      const v = r.value.validTargets[0];
      choice = { side: v.side, row: v.row, col: v.col };
    } else {
      choice = null;
    }
  }

  const bombIdx = steps.findIndex(st => st.attackerAbility === 'bomb_pre' && st.kind === 'attack');
  const soloWaitIdx = steps.findIndex(st => st.attackerAbility === 'solo_strike' && st.kind === 'await_target');
  const soloAttackIdx = steps.findIndex(st => st.attackerAbility === 'solo_strike' && st.kind === 'attack');
  assert.ok(bombIdx >= 0);
  assert.ok(soloWaitIdx > bombIdx);
  assert.ok(soloAttackIdx > soloWaitIdx);
});
