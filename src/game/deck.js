// 牌库操作：洗牌、抽牌（处理天气/上限/回库）。
// 双方共用单一牌库（state.deck / state.discard）。
// 所有函数返回新 state（不可变）。

import { ALL_CARDS } from '../data/cards.js';
import { cloneState } from './state.js';
import { shuffle } from './rng.js';

const HAND_LIMIT = 10;

// 抽 1 张（不处理天气/上限）。若牌库空，先洗弃牌堆回库。
function drawOne(state, side) {
  if (state.deck.length === 0) {
    if (state.discard.length === 0) {
      return { state, drawn: null };
    }
    state = cloneState(state);
    // state.rng 在生产环境为 null，需透传 undefined 才能走 shuffle 的默认 Math.random
    state.deck = shuffle(state.discard, state.rng || undefined);
    state.discard = [];
  }
  const drawn = state.deck[0];
  state = cloneState(state);
  state.deck = state.deck.slice(1);
  state.players[side] = {
    ...state.players[side],
    hand: [...state.players[side].hand, drawn]
  };
  return { state, drawn };
}

// 触发天气卡：从手牌移除 → 进弃牌堆 → 应用效果
function triggerWeather(state, side, card, def) {
  state = cloneState(state);
  state.players[side] = {
    ...state.players[side],
    hand: state.players[side].hand.filter(c => c.uid !== card.uid)
  };
  state.discard = [...state.discard, card];
  state = applyWeather(state, def.id, side);
  pushLog(state, { type: 'weather_triggered', side, weather: def.id });
  return state;
}

// 截断某方手牌到上限（超出的进弃牌堆）
function truncateHand(state, side) {
  const hand = state.players[side].hand;
  if (hand.length <= HAND_LIMIT) return state;
  const kept = hand.slice(0, HAND_LIMIT);
  const discarded = hand.slice(HAND_LIMIT);
  state = cloneState(state);
  state.players[side] = { ...state.players[side], hand: kept };
  state.discard = [...state.discard, ...discarded];
  pushLog(state, { type: 'hand_truncated', side, discarded });
  return state;
}

// 抽 n 张基础牌：处理天气卡生效 + 自动补抽。
// 抽到 weather 时不计入 n，立即触发效果并继续抽，直到抽够 n 张非天气牌或牌库+弃牌堆都空。
export function drawCards(state, side, n) {
  let remaining = n;
  // 安全上限：防止极端场景下天气链引发死循环
  let safety = n + 30;
  while (remaining > 0 && safety-- > 0) {
    const r = drawOne(state, side);
    if (!r.drawn) break;
    state = r.state;
    const def = ALL_CARDS[r.drawn.cardId];
    if (def && def.kind === 'weather') {
      // 天气卡：触发效果，不递减 remaining（继续补抽到 n 张非天气牌）
      state = triggerWeather(state, side, r.drawn, def);
    } else {
      remaining--;
    }
  }
  // 清理可能因 sun 效果（raw drawOne）滞留手牌的天气卡
  state = flushWeatherFromHand(state, side);
  return truncateHand(state, side);
}

// 迭代触发手牌中残留的天气卡（如 sun 效果补抽到的天气）
function flushWeatherFromHand(state, side) {
  let safety = 10;
  while (safety-- > 0) {
    const wcard = state.players[side].hand.find(c => {
      const d = ALL_CARDS[c.cardId];
      return d && d.kind === 'weather';
    });
    if (!wcard) return state;
    const def = ALL_CARDS[wcard.cardId];
    state = triggerWeather(state, side, wcard, def);
  }
  return state;
}

// 应用天气：替换当前天气
// 太阳在该回合让双方各额外抽 1（用 raw drawOne，避免与 drawCards 互相递归）
export function applyWeather(state, weatherId, triggeredBy) {
  state = cloneState(state);
  const old = state.weather;
  state.weather = weatherId;
  pushLog(state, { type: 'weather_changed', from: old, to: weatherId, triggeredBy });

  if (weatherId === 'sun') {
    // 太阳：双方各 +1。若这 +1 抽到天气卡，会在下一次正常 drawCards 时触发。
    // 这里用 raw drawOne 防止递归（drawCards 内部已迭代处理天气）。
    const pr = drawOne(state, 'player');
    state = pr.state;
    const er = drawOne(state, 'enemy');
    state = er.state;
    state = truncateHand(state, 'player');
    state = truncateHand(state, 'enemy');
  }
  return state;
}

function pushLog(state, event) {
  state.log.push({ ...event, turnNo: state.turnNo });
}
