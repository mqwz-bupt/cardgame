// 卡牌定义 — 单一事实来源，规则文档同步
// kind: 'unit' | 'spell' | 'weather'

export const UNITS = {
  swordsman: {
    id: 'swordsman', kind: 'unit', name: '剑士', hp: 2, atk: 1, icon: '⚔️',
    ability: 'pierce',
    desc: '穿刺：攻击时对目标列的全部敌方单位各造成 1 点伤害'
  },
  archer: {
    id: 'archer', kind: 'unit', name: '弓箭手', hp: 2, atk: 1, icon: '🏹',
    ability: 'any_target',
    desc: '每回合可攻击敌方任意位置'
  },
  shield: {
    id: 'shield', kind: 'unit', name: '盾兵', hp: 2, atk: 1, icon: '🛡️',
    ability: 'guard',
    desc: '被动：为上下左右相邻友军抵挡伤害，将伤害转移到自身'
  },
  axe: {
    id: 'axe', kind: 'unit', name: '斧兵', hp: 3, atk: 1, icon: '🪓',
    ability: null,
    desc: '无特殊能力'
  },
  bomber: {
    id: 'bomber', kind: 'unit', name: '炸弹人', hp: 1, atk: 1, icon: '💣',
    ability: 'bomb',
    desc: '亮出时对敌方任意位置造成 1 点伤害；之后每回合可任意位置攻击'
  },
  thief: {
    id: 'thief', kind: 'unit', name: '盗贼', hp: 2, atk: 1, icon: '🗡️',
    ability: 'solo_strike',
    desc: '上下左右无友军时，无视位置率先发动攻击'
  },
  spike: {
    id: 'spike', kind: 'unit', name: '地刺', hp: 3, atk: 1, icon: '🌵',
    ability: 'thorns',
    desc: '无法主动攻击；每回合对同位置敌军扣 1 血（无视盾兵替伤），自身也扣 1 血'
  },
  berserker: {
    id: 'berserker', kind: 'unit', name: '狂战士', hp: 2, atk: 1, icon: '😤',
    ability: 'chain',
    desc: '击杀敌军后立刻再攻击一次（无限连杀）'
  },
  vampire: {
    id: 'vampire', kind: 'unit', name: '吸血战士', hp: 3, atk: 1, icon: '🦇',
    ability: 'lifesteal',
    desc: '放置需献祭 1 张手牌；攻击时回血=造成的伤害'
  },
  priest: {
    id: 'priest', kind: 'unit', name: '祭司', hp: 2, atk: 1, icon: '✨',
    ability: 'flex',
    desc: '可选攻击或治疗：攻击敌方任意前排（该列无前排时可打后排）；治疗+1 任意友军'
  },
  necromancer: {
    id: 'necromancer', kind: 'unit', name: '亡灵法师', hp: 2, atk: 1, icon: '💀',
    ability: 'death_draw',
    desc: '全场每死亡 4 张牌，自己抽 1 张（攻击范围同祭司）'
  },
  knight: {
    id: 'knight', kind: 'unit', name: '骑士', hp: 2, atk: 1, icon: '🐴',
    ability: 'reposition',
    desc: '攻击完成后可在己方阵地移动一次'
  }
};

export const SPELLS = {
  polymorph: {
    id: 'polymorph', kind: 'spell', name: '变羊术', icon: '🐑',
    desc: '将敌方战场上任意一张牌变为 1/1 绵羊（任意时机立即释放，无需弃手牌）'
  }
};

export const WEATHERS = {
  rain: {
    id: 'rain', kind: 'weather', name: '雨', icon: '🌧️',
    desc: '弓箭手 / 炸弹人在敌方该列前排未死时，无法攻击该列后排'
  },
  sun: {
    id: 'sun', kind: 'weather', name: '太阳', icon: '☀️',
    desc: '当前回合双方各额外摸 1 张'
  },
  snow: {
    id: 'snow', kind: 'weather', name: '雪', icon: '❄️',
    desc: '无法优先攻击正前方；改为先左前或右前的敌军'
  }
};

// 牌库构成：4 张 × 4 核心单位 + 2 张 × 8 其余单位 + 2 张变羊术 + 2 张 × 3 天气
// 总数：16 + 16 + 2 + 6 = 40 张
export const DECK_RECIPE = [
  { id: 'swordsman', count: 4 },
  { id: 'archer', count: 4 },
  { id: 'shield', count: 4 },
  { id: 'axe', count: 4 },
  { id: 'bomber', count: 2 },
  { id: 'thief', count: 2 },
  { id: 'spike', count: 2 },
  { id: 'berserker', count: 2 },
  { id: 'vampire', count: 2 },
  { id: 'priest', count: 2 },
  { id: 'necromancer', count: 2 },
  { id: 'knight', count: 2 },
  { id: 'polymorph', count: 2 },
  { id: 'rain', count: 2 },
  { id: 'sun', count: 2 },
  { id: 'snow', count: 2 }
];

export const ALL_CARDS = { ...UNITS, ...SPELLS, ...WEATHERS };

// 变羊术生成物
export const SHEEP = {
  id: '__sheep__', kind: 'unit', name: '绵羊', hp: 1, atk: 1, icon: '🐑',
  ability: null,
  desc: '被变羊术变形的单位'
};
