// 战斗阶段主流程（生成器版）：
//   1) 战斗开始时一次性结算所有地刺反伤（双方同时）
//   2) 按全局序号 1→12 遍历，每个序号取对应 (side, localPos) 单位结算攻击
//   3) 玩家方 any_target/bomb/flex 单位 → yield 'await_target' 让 UI 暂停等玩家选
//   4) 敌方 any_target/bomb/flex 单位 → 内部 AI 自动选 hp+atk 最高目标，不暂停
//   5) 狂战士连杀、亡灵法师死亡抽牌、骑士移动
//
// 所有暗置卡在 REVEAL 阶段已翻为 revealed=true。

import { SIDES, cellKey, cloneState, ROW_COL_BY_LOCAL_POS } from './state.js';
import { listOccupiedCells, hasNoUnits } from './board.js';
import {
  computeAttackTargets, applyDamage, applyLifesteal,
  canRangedHitUnderRain
} from './attack.js';
import { attackLord, checkWin } from './judge.js';
import { drawCards } from './deck.js';
import { needsTarget, getValidTargets, pickEnemyTarget } from './targeting.js';

// 全局序号 1-12 → {side, localPos}
// 先手方拿奇数（1,3,5,7,9,11）对应本方编号 1,2,3,4,5,6
// 后手方拿偶数（2,4,6,8,10,12）对应本方编号 1,2,3,4,5,6
function buildOrder(firstAttacker) {
  const second = firstAttacker === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
  const out = [];
  for (let localPos = 1; localPos <= 6; localPos++) {
    out.push({ globalNo: localPos * 2 - 1, side: firstAttacker, localPos });
    out.push({ globalNo: localPos * 2,     side: second,       localPos });
  }
  return out;
}

// 直接扣血不走替伤（地刺专用）。返回新 state。
function damageUnitDirect(state, side, row, col, dmg) {
  const unit = state.players[side].board[cellKey(row, col)];
  if (!unit) return state;
  state = cloneState(state);
  const newHp = unit.hp - dmg;
  state.players[side].board[cellKey(row, col)] = newHp > 0 ? { ...unit, hp: newHp } : null;
  if (newHp <= 0) {
    state.discard = [...state.discard, { cardId: unit.def.id, uid: unit.uid }];
    state.globalDeathCount += 1;
    state.log.push({ type: 'unit_died', side, row, col, unit, turnNo: state.turnNo });
  }
  return state;
}

// 亡灵法师触发：globalDeathCount 每满 4 的倍数触发一次
// 双方各自检查己方场上是否有亡灵法师；有则该方抽 1
function maybeTriggerNecromancer(state) {
  if (state.globalDeathCount <= 0 || state.globalDeathCount % 4 !== 0) return state;
  for (const side of [SIDES.PLAYER, SIDES.ENEMY]) {
    for (const c of listOccupiedCells(state, side)) {
      if (c.unit.def.ability === 'death_draw') {
        state = drawCards(state, side, 1);
        state.log.push({ type: 'necromancer_trigger', side, turnNo: state.turnNo });
        break;
      }
    }
  }
  return state;
}

// 战斗主流程生成器。
// yields（step 类型）：
//   { kind: 'thorns',     snapshot, attackerUid: null, attackerPos: null, attackerName, attackerAbility, targetUid, targetPos, dmg, killed }
//   { kind: 'attack',     snapshot, attackerUid, attackerPos, attackerName, attackerAbility, targetUid, targetPos, dmg, killed }
//   { kind: 'lord_attack',snapshot, attackerUid, attackerPos, attackerName, attackerAbility, targetPos: {side}, dmg, killed: false }
//   { kind: 'await_target', snapshot, attackerUid, attackerPos, attackerName, attackerAbility, validTargets }
// returns: 战斗结束后的最终 state
export function* runBattleIter(srcState) {
  let state = cloneState(srcState);

  // 1. 地刺反伤（战斗开始时一次性结算）
  state = yield* runThornsIter(state);
  if (checkWin(state)) return state;

  // 2. 炸弹人「先发」：在常规 #1 位攻击之前，对任意敌方位置打 1。
  //    玩家方 yield await_target 让玩家选；敌方 AI 自动选 hp+atk 最高。
  state = yield* runBomberPreIter(state);
  if (checkWin(state)) return state;

  // 2. 按全局序号遍历
  const order = buildOrder(state.firstAttacker);
  for (const { side, localPos } of order) {
    const key = ROW_COL_BY_LOCAL_POS[localPos];
    const [row, colStr] = key.split('-');
    const col = Number(colStr);
    const unit = state.players[side].board[cellKey(row, col)];
    if (!unit) continue;
    if (unit.hp <= 0) continue;
    if (unit.def.ability === 'thorns') continue;

    const attacker = { side, row, col, unit };
    const enemySide = side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;

    // 敌方全空 → 直接打主公
    if (hasNoUnits(state, enemySide)) {
      const before = state.players[enemySide].lord.hp;
      state = attackLord(state, enemySide);
      const after = state.players[enemySide].lord.hp;
      yield {
        kind: 'lord_attack',
        snapshot: cloneState(state),
        attackerUid: unit.uid,
        attackerPos: { side, row, col },
        attackerName: unit.def.name,
        attackerAbility: unit.def.ability,
        targetPos: { side: enemySide },
        dmg: before - after,
        killed: false
      };
      if (checkWin(state)) return state;
      continue;
    }

    // needsTarget 单位：玩家方暂停选；敌方 AI 自动选
    let choice = null;
    if (needsTarget(unit.def)) {
      if (side === SIDES.PLAYER) {
        const valids = getValidTargets(state, attacker);
        if (valids.length === 0) continue; // 全被雨天挡住 → 跳过
        const playerChoice = yield {
          kind: 'await_target',
          snapshot: cloneState(state),
          attackerUid: unit.uid,
          attackerPos: { side, row, col },
          attackerName: unit.def.name,
          attackerAbility: unit.def.ability,
          validTargets: valids
        };
        if (!playerChoice) continue;
        const chosen = valids.find(v =>
          v.side === playerChoice.side && v.row === playerChoice.row && v.col === playerChoice.col
        );
        if (!chosen) continue;
        choice = chosen;
      } else {
        const picked = pickEnemyTarget(state, attacker);
        if (!picked) continue;
        choice = picked;
      }
    }

    // 执行攻击（处理 chain 循环）
    if (unit.def.ability === 'chain') {
      let chainKilled = true;
      let safety = 50;
      while (chainKilled && safety-- > 0) {
        const r = yield* runOneAttackIter(state, attacker, choice);
        state = r.state;
        if (!state.players[side].board[cellKey(row, col)]) break; // 攻击者死
        if (r.killed) {
          state = maybeTriggerNecromancer(state);
          if (checkWin(state)) return state;
          chainKilled = true;
        } else {
          chainKilled = false;
        }
      }
    } else {
      const r = yield* runOneAttackIter(state, attacker, choice);
      state = r.state;
      if (r.killed) state = maybeTriggerNecromancer(state);
      if (checkWin(state)) return state;
    }
  }

  return state;
}

// 单次攻击生成器：可能 yield 多个 attack step（剑士穿刺多目标等）
function* runOneAttackIter(state, attacker, targetOverride) {
  const def = attacker.unit.def;

  if (targetOverride && !canRangedHitUnderRain(state, attacker, targetOverride)) {
    return { state, killed: false };
  }

  const targets = computeAttackTargets(state, attacker, targetOverride);
  if (targets.length === 0) {
    return { state, killed: false };
  }

  let totalDmg = 0;
  let anyKill = false;
  for (const t of targets) {
    const beforeHp = t.unit.hp;
    const beforeUid = t.unit.uid;
    const beforePos = { side: t.side, row: t.row, col: t.col };
    const r = applyDamage(state, attacker, t);
    state = r.state;
    const dealt = r.killed.length > 0 ? beforeHp : t.dmg;
    totalDmg += dealt;
    if (r.killed.length > 0) anyKill = true;
    yield {
      kind: 'attack',
      snapshot: cloneState(state),
      attackerUid: attacker.unit.uid,
      attackerPos: { side: attacker.side, row: attacker.row, col: attacker.col },
      attackerName: attacker.unit.def.name,
      attackerAbility: attacker.unit.def.ability,
      targetUid: beforeUid,
      targetPos: beforePos,
      dmg: dealt,
      killed: r.killed.length > 0
    };
  }

  if (def.ability === 'lifesteal' && totalDmg > 0) {
    state = applyLifesteal(state, attacker, totalDmg);
  }
  return { state, killed: anyKill };
}

// 地刺反伤生成器：每对（地刺, 同位置敌军）的两次扣血各产生一个 step
function* runThornsIter(state) {
  const thornCells = [];
  for (const side of [SIDES.PLAYER, SIDES.ENEMY]) {
    for (const c of listOccupiedCells(state, side)) {
      if (c.unit.def.ability === 'thorns') thornCells.push(c);
    }
  }
  thornCells.sort((a, b) => a.localPos - b.localPos);

  for (const t of thornCells) {
    if (t.unit.hp <= 0) continue;
    const enemy = t.side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
    const enemyCol = 2 - t.col;
    const targetUnit = state.players[enemy].board[cellKey(t.row, enemyCol)];

    // 规则：地刺只对"同位置敌军"造成伤害，并同步扣自身 1 血。
    // 没有同位置敌军时，地刺不主动扣血。
    if (!targetUnit) continue;

    // 自身扣 1
    {
      const uid = t.unit.uid;
      state = damageUnitDirect(state, t.side, t.row, t.col, 1);
      yield {
        kind: 'thorns',
        snapshot: cloneState(state),
        attackerUid: null,
        attackerPos: null,
        attackerName: '地刺',
        attackerAbility: 'thorns',
        targetUid: uid,
        targetPos: { side: t.side, row: t.row, col: t.col },
        dmg: 1,
        killed: !state.players[t.side].board[cellKey(t.row, t.col)]
      };
    }
    // 同位置敌军扣 1
    {
      const uid = targetUnit.uid;
      state = damageUnitDirect(state, enemy, t.row, enemyCol, 1);
      yield {
        kind: 'thorns',
        snapshot: cloneState(state),
        attackerUid: null,
        attackerPos: null,
        attackerName: '地刺',
        attackerAbility: 'thorns',
        targetUid: uid,
        targetPos: { side: enemy, row: t.row, col: enemyCol },
        dmg: 1,
        killed: !state.players[enemy].board[cellKey(t.row, enemyCol)]
      };
    }
  }
  return state;
}

// 炸弹人「先发」生成器：在常规序号 #1 攻击之前，每个炸弹人对任意敌方位置打 1。
// 玩家方炸弹人 → yield 'await_target' 让玩家选目标；敌方炸弹人 → AI 选 hp+atk 最高。
function* runBomberPreIter(state) {
  const bomberCells = [];
  for (const side of [SIDES.PLAYER, SIDES.ENEMY]) {
    for (const c of listOccupiedCells(state, side)) {
      if (c.unit.def.ability === 'bomb') bomberCells.push(c);
    }
  }
  bomberCells.sort((a, b) => a.localPos - b.localPos);

  for (const b of bomberCells) {
    if (b.unit.hp <= 0) continue;
    // 先发只在该单位被部署的回合发动一次；之后回合按常规弓箭手逻辑走
    if (b.unit.deployedAtTurnNo !== state.turnNo) continue;
    const enemy = b.side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
    if (hasNoUnits(state, enemy)) continue;

    const attacker = { side: b.side, row: b.row, col: b.col, unit: b.unit };
    const valids = getValidTargets(state, attacker);
    if (valids.length === 0) continue;

    let choice = null;
    if (b.side === SIDES.PLAYER) {
      const playerChoice = yield {
        kind: 'await_target',
        snapshot: cloneState(state),
        attackerUid: b.unit.uid,
        attackerPos: { side: b.side, row: b.row, col: b.col },
        attackerName: b.unit.def.name,
        attackerAbility: 'bomb_pre',
        validTargets: valids
      };
      if (!playerChoice) continue;
      const chosen = valids.find(v =>
        v.side === playerChoice.side && v.row === playerChoice.row && v.col === playerChoice.col
      );
      if (!chosen) continue;
      choice = { ...chosen, dmg: 1 };
    } else {
      const picked = pickEnemyTarget(state, attacker);
      if (!picked) continue;
      choice = { ...picked, dmg: 1 };
    }

    const beforeHp = choice.unit.hp;
    const beforeUid = choice.unit.uid;
    const beforePos = { side: choice.side, row: choice.row, col: choice.col };
    const r = applyDamage(state, attacker, choice);
    state = r.state;
    yield {
      kind: 'attack',
      snapshot: cloneState(state),
      attackerUid: b.unit.uid,
      attackerPos: { side: b.side, row: b.row, col: b.col },
      attackerName: b.unit.def.name,
      attackerAbility: 'bomb_pre',
      targetUid: beforeUid,
      targetPos: beforePos,
      dmg: r.killed.length > 0 ? beforeHp : 1,
      killed: r.killed.length > 0
    };
    if (checkWin(state)) return state;
  }
  return state;
}

// 兼容包装：drains runBattleIter 生成器，返回最终 state
// await_target 在测试/纯逻辑场景下用 AI 同款逻辑自动选（hp+atk 最高）
export function runBattle(state) {
  const iter = runBattleIter(state);
  let choice = null;
  while (true) {
    const { value, done } = iter.next(choice);
    if (done) return value;
    choice = null;
    if (value && value.kind === 'await_target') {
      const valids = value.validTargets;
      if (valids.length === 0) continue;
      valids.sort((a, b) => (b.unit.hp + b.unit.def.atk) - (a.unit.hp + a.unit.def.atk));
      const t = valids[0];
      choice = { side: t.side, row: t.row, col: t.col };
    }
  }
}
