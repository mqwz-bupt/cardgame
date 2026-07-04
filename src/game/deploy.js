// 出牌：暗置单位 / 释放法术。
// 所有函数返回新 state（不可变）。

import { SIDES, cellKey, cloneState, createUnitInstance } from './state.js';
import { ALL_CARDS, SHEEP } from '../data/cards.js';

// 检查能否出单位牌（代价是否付得起）
// handIdx 要打的手牌索引；discardIdx 选作代价弃的另一张索引
// 返回 {ok: boolean, reason?: string}
export function canPlayUnit(state, side, handIdx, row, col, discardIdx, sacrificeIdx = null) {
  const hand = state.players[side].hand;
  const target = hand[handIdx];
  if (!target) return { ok: false, reason: 'invalid_hand_idx' };
  const def = ALL_CARDS[target.cardId];
  if (!def || def.kind !== 'unit') return { ok: false, reason: 'not_unit' };

  if (state.players[side].board[cellKey(row, col)]) {
    return { ok: false, reason: 'cell_occupied' };
  }

  // 代价：必须弃另一张手牌（除了要打的这张）
  // 手牌只剩这一张时无法支付
  if (hand.length < 2) return { ok: false, reason: 'cannot_afford_discard' };
  if (discardIdx === undefined || discardIdx === null) {
    return { ok: false, reason: 'need_discard' };
  }
  if (discardIdx === handIdx) return { ok: false, reason: 'discard_same_as_play' };
  if (!hand[discardIdx]) return { ok: false, reason: 'invalid_discard_idx' };

  // 吸血战士放置需额外献祭 1 张（总共弃 2 张其他手牌）
  // 简化签名：要求 hand.length >= 3
  if (def.ability === 'lifesteal' && hand.length < 3) {
    return { ok: false, reason: 'vampire_needs_sacrifice' };
  }
  if (def.ability === 'lifesteal' && sacrificeIdx !== null && sacrificeIdx !== undefined) {
    if (sacrificeIdx === handIdx) return { ok: false, reason: 'sacrifice_same_as_play' };
    if (sacrificeIdx === discardIdx) return { ok: false, reason: 'sacrifice_same_as_discard' };
    if (!hand[sacrificeIdx]) return { ok: false, reason: 'invalid_sacrifice_idx' };
  }

  return { ok: true };
}

// 出单位牌到 (row, col)，并弃掉 discardIdx 的手牌作为代价。
// 吸血战士：再弃一张 sacrificeIdx。
// 返回新 state。
export function playUnit(state, side, handIdx, row, col, discardIdx, sacrificeIdx = null) {
  const check = canPlayUnit(state, side, handIdx, row, col, discardIdx, sacrificeIdx);
  if (!check.ok) throw new Error(`playUnit rejected: ${check.reason}`);

  const hand = state.players[side].hand;
  const target = hand[handIdx];
  const def = ALL_CARDS[target.cardId];

  state = cloneState(state);
  const player = state.players[side];

  // 构造要丢弃的索引集（吸血战士加 sacrificeIdx）
  const toDiscardIdx = [discardIdx];
  if (def.ability === 'lifesteal') {
    if (sacrificeIdx === null || sacrificeIdx === undefined) {
      throw new Error('vampire_needs_sacrifice');
    }
    if (sacrificeIdx === handIdx) throw new Error('sacrifice_same_as_play');
    if (sacrificeIdx === discardIdx) throw new Error('sacrifice_same_as_discard');
    if (!hand[sacrificeIdx]) throw new Error('invalid_sacrifice_idx');
    toDiscardIdx.push(sacrificeIdx);
  }

  // 取出要打的那张牌与代价牌（先记录，删除时下标会变）
  const playedCard = hand[handIdx];
  const discardCards = toDiscardIdx.map(i => hand[i]);

  // 重建手牌：把所有 toDiscardIdx + handIdx 都移除
  const removeSet = new Set([handIdx, ...toDiscardIdx]);
  const newHand = hand.filter((_, i) => !removeSet.has(i));

  // 单位实例放进 board
  const unit = {
    ...createUnitInstance(def, playedCard.uid, { revealed: false }),
    deployedAtTurnNo: state.turnNo
  };
  player.board[cellKey(row, col)] = unit;

  player.hand = newHand;
  state.discard = [...state.discard, ...discardCards];

  state.log.push({
    type: 'unit_deployed', side, row, col, cardId: def.id, hidden: true,
    turnNo: state.turnNo
  });
  return state;
}

// 释放变羊术（免费）：将敌方战场上任意单位变为 1/1 绵羊
// spellIdx 是手牌中变羊术的索引；row/col 是敌方目标格
export function playPolymorph(state, side, spellIdx, enemyRow, enemyCol) {
  const enemy = side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
  const target = state.players[enemy].board[cellKey(enemyRow, enemyCol)];
  if (!target) throw new Error('polymorph_no_target');

  const hand = state.players[side].hand;
  const card = hand[spellIdx];
  if (!card || card.cardId !== 'polymorph') {
    throw new Error('polymorph_invalid_spell_idx');
  }

  state = cloneState(state);
  // 变羊：保留 uid（实例不变），替换 def 为绵羊，hp/atk=1
  const sheeped = {
    uid: target.uid,
    def: { ...SHEEP },
    hp: 1,
    revealed: true
  };
  state.players[enemy].board[cellKey(enemyRow, enemyCol)] = sheeped;

  // 从手牌移除变羊术；进弃牌堆（双方共用）
  state.players[side] = {
    ...state.players[side],
    hand: hand.filter((_, i) => i !== spellIdx)
  };
  state.discard = [...state.discard, card];

  state.log.push({
    type: 'polymorph_cast', side, targetSide: enemy, row: enemyRow, col: enemyCol,
    originalCardId: target.def.id, turnNo: state.turnNo
  });
  return state;
}
