const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function path(d, cls = 'svg-line') {
  return svgEl('path', { class: cls, d });
}

function circle(cx, cy, r, cls = 'svg-fill') {
  return svgEl('circle', { class: cls, cx, cy, r });
}

function rect(x, y, width, height, rx, cls = 'svg-fill') {
  return svgEl('rect', { class: cls, x, y, width, height, rx });
}

function iconLayer(children) {
  return svgEl('g', { transform: 'translate(10 10)' }, children);
}

const TYPE_LABEL = {
  unit: '单位',
  spell: '法术',
  weather: '天气'
};

const ABILITY_LABEL = {
  pierce: '穿刺',
  any_target: '任意射',
  guard: '替伤',
  bomb: '炸弹',
  bomb_pre: '先发',
  solo_strike: '孤立先手',
  thorns: '反伤',
  chain: '连杀',
  lifesteal: '吸血',
  flex: '灵活',
  death_draw: '死亡抽牌',
  reposition: '移动'
};

function person(extra = []) {
  return [
    svgEl('ellipse', { class: 'svg-shadow', cx: 50, cy: 85, rx: 24, ry: 6 }),
    circle(50, 29, 10, 'svg-skin'),
    rect(39, 42, 22, 28, 9, 'svg-tunic'),
    path('M42 66 L34 84 M58 66 L66 84'),
    path('M39 50 L27 60 M61 50 L73 60'),
    ...extra
  ];
}

function iconSwordsman() {
  return person([
    path('M66 28 L82 12 M78 10 L84 16 M62 32 L70 40', 'svg-metal')
  ]);
}

function iconArcher() {
  return person([
    path('M70 23 C86 38 86 62 70 77'),
    path('M70 23 L70 77'),
    path('M58 52 L86 52', 'svg-metal')
  ]);
}

function iconShield() {
  return person([
    path('M24 41 C24 34 43 34 43 41 L43 62 C43 72 34 78 24 81 C14 78 5 72 5 62 L5 41 C5 34 24 34 24 41 Z', 'svg-blue-fill'),
    path('M24 41 L24 75')
  ]);
}

function iconAxe() {
  return person([
    path('M65 22 L81 74', 'svg-wood'),
    path('M74 17 C88 19 91 31 80 39 C72 33 69 25 74 17 Z', 'svg-metal')
  ]);
}

function iconBomber() {
  return person([
    circle(76, 61, 12, 'svg-dark-fill'),
    path('M82 51 C83 43 89 41 93 45', 'svg-fuse'),
    path('M89 39 L94 34 M91 45 L98 43', 'svg-spark')
  ]);
}

function iconPriest() {
  return person([
    svgEl('ellipse', { class: 'svg-halo', cx: 50, cy: 15, rx: 17, ry: 6 }),
    path('M76 30 L76 82', 'svg-wood'),
    path('M66 42 L86 42 M76 32 L76 52', 'svg-gold')
  ]);
}

function iconVampire() {
  return [
    svgEl('ellipse', { class: 'svg-shadow', cx: 50, cy: 85, rx: 24, ry: 6 }),
    path('M23 42 C31 27 41 43 50 41 C59 43 69 27 77 42 L69 81 C58 73 42 73 31 81 Z', 'svg-cape'),
    circle(50, 29, 10, 'svg-skin'),
    rect(40, 43, 20, 27, 8, 'svg-tunic'),
    path('M45 34 L48 38 M55 34 L52 38', 'svg-fang')
  ];
}

function iconBerserker() {
  return person([
    path('M39 21 L30 14 M61 21 L70 14', 'svg-rage'),
    path('M29 31 L15 15 M19 13 L12 20', 'svg-metal'),
    path('M71 31 L85 15 M81 13 L88 20', 'svg-metal')
  ]);
}

function iconKnight() {
  return [
    svgEl('ellipse', { class: 'svg-shadow', cx: 50, cy: 85, rx: 28, ry: 6 }),
    path('M21 62 C26 44 50 43 62 56 C69 54 79 58 84 68 L82 80 L24 80 Z', 'svg-horse'),
    circle(67, 44, 9, 'svg-skin'),
    rect(59, 53, 17, 20, 7, 'svg-tunic'),
    path('M71 30 L86 16', 'svg-metal')
  ];
}

function iconSpike() {
  return [
    svgEl('ellipse', { class: 'svg-shadow', cx: 50, cy: 86, rx: 24, ry: 6 }),
    path('M48 80 C42 61 45 36 51 21 C59 42 61 62 55 80 Z', 'svg-green-fill'),
    path('M47 52 L29 39 M56 54 L75 39 M47 68 L27 66 M56 68 L76 66')
  ];
}

function iconNecromancer() {
  return person([
    path('M23 80 C30 50 39 41 50 41 C61 41 70 50 77 80 Z', 'svg-cape'),
    circle(74, 62, 11, 'svg-bone'),
    path('M69 62 L79 62 M74 57 L74 67')
  ]);
}

function iconPolymorph() {
  return [
    svgEl('ellipse', { class: 'svg-shadow', cx: 50, cy: 83, rx: 25, ry: 6 }),
    path('M28 55 C30 42 43 36 58 40 C72 43 78 53 75 65 C70 77 44 76 33 68 C29 65 27 61 28 55 Z', 'svg-bone'),
    circle(29, 50, 9, 'svg-bone'),
    path('M24 43 L19 35 M33 43 L38 35 M41 68 L37 80 M61 68 L66 80')
  ];
}

function iconSheep() {
  return [
    svgEl('ellipse', { class: 'svg-shadow', cx: 50, cy: 85, rx: 25, ry: 6 }),
    path('M25 57 C25 45 36 38 49 39 C64 35 77 44 77 59 C77 72 63 78 46 76 C32 75 25 68 25 57 Z', 'svg-bone'),
    circle(29, 51, 8, 'svg-bone'),
    path('M22 45 L16 38 M35 44 L42 37 M39 74 L36 88 M61 74 L65 88'),
    circle(27, 51, 1.5, 'svg-dark-fill')
  ];
}

function iconRogue() {
  return person([
    path('M32 34 C40 23 58 23 67 35', 'svg-dark-line'),
    path('M68 30 L86 18 M82 16 L88 22', 'svg-metal'),
    path('M37 65 L24 76 M59 66 L76 76')
  ]);
}

function iconDefault() {
  return [
    svgEl('ellipse', { class: 'svg-shadow', cx: 50, cy: 84, rx: 25, ry: 6 }),
    path('M30 24 H70 C77 24 81 29 81 36 V72 C81 79 76 84 69 84 H31 C24 84 19 79 19 72 V36 C19 29 24 24 30 24 Z', 'svg-bone'),
    path('M39 43 C39 33 62 32 62 44 C62 52 51 53 50 62'),
    circle(50, 73, 2.5, 'svg-dark-fill')
  ];
}

function iconWeather(id) {
  if (id === 'sun') {
    return [
      circle(50, 48, 18, 'svg-gold-fill'),
      path('M50 13 L50 25 M50 71 L50 83 M15 48 L27 48 M73 48 L85 48 M25 23 L34 32 M66 64 L75 73 M75 23 L66 32 M34 64 L25 73', 'svg-gold')
    ];
  }
  if (id === 'snow') {
    return [
      path('M50 17 L50 81 M25 32 L75 66 M75 32 L25 66', 'svg-blue'),
      path('M42 25 L50 17 L58 25 M42 73 L50 81 L58 73 M28 42 L25 32 L35 30 M72 56 L75 66 L65 68', 'svg-blue')
    ];
  }
  return [
    path('M24 50 C27 35 39 32 47 39 C54 26 77 34 76 52 C76 63 66 69 55 69 L35 69 C27 69 22 62 24 50 Z', 'svg-blue-fill'),
    path('M34 77 L29 88 M50 77 L45 88 M66 77 L61 88', 'svg-blue')
  ];
}

const ICONS = {
  swordsman: iconSwordsman,
  archer: iconArcher,
  shieldman: iconShield,
  shield: iconShield,
  axeman: iconAxe,
  axe: iconAxe,
  bomber: iconBomber,
  rogue: iconRogue,
  thief: iconRogue,
  cactus: iconSpike,
  spike: iconSpike,
  priest: iconPriest,
  vampire: iconVampire,
  berserker: iconBerserker,
  knight: iconKnight,
  necromancer: iconNecromancer,
  sheep: iconSheep,
  __sheep__: iconSheep,
  polymorph: iconPolymorph
};

export function getIconKey(def = {}) {
  const id = def.visualKey || def.iconKey || def.id || '';
  const name = def.name || '';
  const map = {
    swordsman: 'swordsman',
    archer: 'archer',
    shieldman: 'shieldman',
    shield: 'shieldman',
    axeman: 'axeman',
    axe: 'axeman',
    bomber: 'bomber',
    rogue: 'rogue',
    thief: 'rogue',
    cactus: 'cactus',
    spike: 'cactus',
    berserker: 'berserker',
    vampire: 'vampire',
    priest: 'priest',
    necromancer: 'necromancer',
    knight: 'knight',
    sheep: 'sheep',
    polymorph: 'polymorph',
    rain: 'rain',
    sun: 'sun',
    snow: 'snow',
    __sheep__: 'sheep'
  };
  if (map[id]) return map[id];
  if (name.includes('剑士')) return 'swordsman';
  if (name.includes('弓箭')) return 'archer';
  if (name.includes('盾')) return 'shieldman';
  if (name.includes('斧')) return 'axeman';
  if (name.includes('炸弹')) return 'bomber';
  if (name.includes('盗贼')) return 'rogue';
  if (name.includes('地刺')) return 'cactus';
  if (name.includes('狂战')) return 'berserker';
  if (name.includes('吸血')) return 'vampire';
  if (name.includes('祭司')) return 'priest';
  if (name.includes('亡灵')) return 'necromancer';
  if (name.includes('骑士')) return 'knight';
  if (name.includes('绵羊')) return 'sheep';
  if (name.includes('变羊')) return 'polymorph';
  if (name.includes('雨')) return 'rain';
  if (name.includes('太阳')) return 'sun';
  if (name.includes('雪')) return 'snow';
  return 'default';
}

function renderCardSvg(def) {
  const iconKey = getIconKey(def);
  const makeIcon = ICONS[iconKey]
    || (def.kind === 'weather' ? () => iconWeather(iconKey) : iconDefault);
  return svgEl('svg', {
    class: 'card-illustration-svg',
    viewBox: '0 0 120 120',
    role: 'img',
    'aria-label': def.name,
    focusable: 'false'
  }, iconLayer(makeIcon(def)));
}

function renderTooltip(def) {
  const text = def.desc || def.description || def.skill || '';
  if (!text) return null;
  return el('div', { class: 'card-tooltip', role: 'tooltip' }, text);
}

export function abilityLabel(ability) {
  return ABILITY_LABEL[ability] || ability;
}

export function renderCard(def, opts = {}) {
  const isSpell = def.kind === 'spell';
  const isWeather = def.kind === 'weather';
  const size = opts.size || 'hand';
  const iconKey = getIconKey(def);
  const abilityCls = def.ability ? `ability-${def.ability}` : 'ability-none';
  const classes = [
    'card',
    `card--${size}`,
    `card-${def.kind}`,
    isSpell && 'card-spell',
    isWeather && 'card-weather',
    abilityCls,
    ...(Array.isArray(opts.classes) ? opts.classes : [opts.classes])
  ].filter(Boolean).join(' ');
  const hp = opts.hp ?? def.hp;
  const typeLabel = TYPE_LABEL[def.kind] || def.type || '卡牌';
  const children = [
    el('div', { class: 'card-paper-grain' }),
    el('div', { class: 'card-type-badge', text: typeLabel }),
    el('div', { class: 'card-title-area' }, [
      el('div', { class: 'card-name-banner' }, [
        el('div', { class: 'card-name', text: def.name })
      ])
    ]),
    el('div', { class: 'card-illustration' }, renderCardSvg(def)),
    def.kind === 'unit' && def.ability
      ? el('div', { class: 'card-ability', text: abilityLabel(def.ability) })
      : null
  ];

  if (def.kind === 'unit') {
    children.push(el('div', { class: 'card-stats' }, [
      el('div', { class: 'stat-block stat-hp' }, [
        el('span', { class: 'stat-label', text: 'HP' }),
        el('span', { class: 'stat-value', text: `${hp}/${def.hp}` })
      ]),
      el('div', { class: 'stat-block stat-atk' }, [
        el('span', { class: 'stat-label', text: 'ATK' }),
        el('span', { class: 'stat-value', text: `${def.atk}` })
      ])
    ]));
  } else {
    children.push(el('div', { class: 'card-desc' }, def.desc || ''));
  }

  children.push(renderTooltip(def));

  return el('div', {
    class: classes,
    tabindex: '0',
    'data-kind': def.kind,
    'data-card-id': def.id,
    'data-icon-key': iconKey,
    'data-ability': def.ability || ''
  }, children);
}
