// 可注入随机数生成器。生产用 Math.random，测试可固定种子。
// 默认导出一个函数，返回 [0, 1) 浮点数。

export function defaultRng() {
  return Math.random();
}

// Fisher-Yates 洗牌（不可变：返回新数组）
export function shuffle(array, rng = defaultRng) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 从数组随机取一个；数组空返回 undefined
export function pickRandom(array, rng = defaultRng) {
  if (array.length === 0) return undefined;
  return array[Math.floor(rng() * array.length)];
}
