/* ============================================================================
 * life-game smoke test — no browser, no react-dom.
 *
 *   node test/smoke.mjs
 *
 * Three gates:
 *   1. the source parses and evaluates through the EXACT wrapper the DSH client
 *      uses (new Function with the same parameter list);
 *   2. the simulation rules are correct (glider, blinker, block, gun) and the
 *      clock only runs while a view is attached;
 *   3. the seats are the right ones (sidebar panel row + main panel + optional
 *      float), the components render and re-render, and input reaches the world.
 * ========================================================================== */
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const SRC = fs.readFileSync(path.join(here, '..', 'src', 'game.js'), 'utf8')
const CUT = '/* --------------------------------------------------------------- 插件体 -- */'

/* ------------------------------------------------------------- mini React -- */
function makeReact() {
  const slotMap = new Map()  // component fn -> that instance's hook slots
  let slots = []             // slots of the component currently rendering
  let cursor = 0
  let effects = []
  let dirty = false

  const React = {
    createElement(type, props) {
      // React flattens nested child arrays; the fake must too, or an icon passed
      // as one array argument would never be walked.
      const kids = []
      const push = (v) => { if (Array.isArray(v)) v.forEach(push); else kids.push(v) }
      for (let i = 2; i < arguments.length; i++) push(arguments[i])
      return { type, props: props || {}, children: kids }
    },
    useState(init) {
      const i = cursor++
      const own = slots
      if (!(i in own)) own[i] = { v: typeof init === 'function' ? init() : init }
      const slot = own[i]
      return [slot.v, (next) => {
        slot.v = typeof next === 'function' ? next(slot.v) : next
        dirty = true
      }]
    },
    useRef(init) {
      const i = cursor++
      const own = slots
      if (!(i in own)) own[i] = { current: init }
      return own[i]
    },
    useEffect(fn, deps) {
      const i = cursor++
      effects.push({ store: slots, i: i, fn: fn, deps: deps })
    },
  }

  const sameDeps = (a, b) => a !== undefined && b !== undefined && a.length === b.length && a.every((v, k) => Object.is(v, b[k]))

  function attach(tree) {
    if (!tree || typeof tree !== 'object') return
    const ref = tree.props && tree.props.ref
    if (ref && typeof ref === 'object') ref.current = tree.type === 'canvas' ? makeCanvas(900, 300) : makeBox()
    for (const ch of tree.children || []) attach(ch)
  }

  function expand(node) {
    if (!node || typeof node !== 'object') return node
    if (typeof node.type === 'function') {
      const key = node.type
      if (!slotMap.has(key)) slotMap.set(key, [])
      const outer = slots
      slots = slotMap.get(key)
      cursor = 0
      const built = node.type(node.props)
      slots = outer
      return expand(built)
    }
    node.children = (node.children || []).map(expand)
    return node
  }

  function runEffects() {
    for (const e of effects) {
      const slot = e.store[e.i]
      if (slot && slot.ran && sameDeps(slot.deps, e.deps)) continue
      if (slot && slot.ran && typeof slot.cleanup === 'function') slot.cleanup()
      const cleanup = e.fn()
      e.store[e.i] = { ran: true, deps: e.deps, cleanup: typeof cleanup === 'function' ? cleanup : null }
    }
  }

  function render(component, props) {
    let tree = null
    for (let pass = 0; pass < 6; pass++) {
      effects = []
      dirty = false
      tree = expand({ type: component, props: props || {}, children: [] })
      attach(tree)
      runEffects()
      if (!dirty) break
    }
    return tree
  }

  return { React, render }
}

/* ---------------------------------------------------------- fake DOM bits -- */
const DRAWN = { fillRect: 0, stroke: 0, fill: 0 }
const DOC = { w: 1000, h: 760 }   // the fake centre column

function makeCtx2d() {
  const noop = () => {}
  return {
    setTransform: noop, clearRect: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    fillRect: () => { DRAWN.fillRect++ }, strokeRect: noop, stroke: () => { DRAWN.stroke++ }, fill: () => { DRAWN.fill++ },
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: '', globalAlpha: 1,
  }
}
function makeCanvas(w, h) {
  return {
    width: 0, height: 0, style: {},
    parentElement: { clientWidth: w },
    getContext: () => makeCtx2d(),
    getBoundingClientRect: () => ({ left: 100, top: 200, width: w, height: h }),
    setPointerCapture: () => {},
  }
}
function makeBox() {
  return {
    clientWidth: DOC.w, clientHeight: DOC.h,
    getBoundingClientRect: () => ({ left: 40, top: 60, width: DOC.w, height: DOC.h }),
    setPointerCapture: () => {},
  }
}
function walk(node, fn) {
  if (!node || typeof node !== 'object') return
  fn(node)
  for (const ch of node.children || []) walk(ch, fn)
}
function findAll(node, pred) {
  const out = []
  walk(node, (n) => { if (pred(n)) out.push(n) })
  return out
}

/* ---------------------------------------------------------------- harness -- */
/** The exact wrapper the DSH client runner builds around a package body. */
const wrapper = (code) => new Function(
  'React', 'console', 'styles', 'host', 'harness',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'fetch', 'require',
  'process', 'Buffer',
  'return (async () => {\n' + code + '\n})()',
)

let failures = 0
function ok(name, cond, detail) {
  if (cond) console.log('  \u2713 ' + name)
  else {
    failures++
    console.log('  \u2717 ' + name + (detail === undefined ? '' : '  \u2192 ' + detail))
  }
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected),
    'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected))
}

const THEME_STUB = {
  getTheme: () => ({
    active: { colorScheme: 'dark', tokens: { '--dsw-alias-bg-base': '#0b0d12', '--dsw-alias-brand-primary': '#ff8800' } },
  }),
}

/** A switchable locale service stand-in, so a language flip can be tested. */
function makeLocaleStub(dicts) {
  let active = 'zh'
  const subs = new Set()
  return {
    get active() { return active },
    set(id) { active = id; subs.forEach((fn) => fn()) },
    api: {
      bind: () => (key) => (dicts[active][key] === undefined ? key : dicts[active][key]),
      register: () => () => {},
      subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn) } },
      getLocale: () => ({ active: active, locales: [], revision: 0 }),
    },
  }
}

/** A minimal Web Storage stand-in. */
function makeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    get size() { return map.size },
  }
}

/* =============================== 1. parse ================================= */
console.log('\n[1] parse through the DSH client wrapper')
const EXPORTS = '{ createSim: createSim, createStore: createStore, RULES: RULES, RULE_BY_KEY: RULE_BY_KEY,'
  + ' PATTERNS: PATTERNS, PATTERN_BY_KEY: PATTERN_BY_KEY, CELL_CHOICES: CELL_CHOICES, CSS: CSS,'
  + ' LifeIcon: LifeIcon, BoardCanvas: BoardCanvas, PopulationChart: PopulationChart, Transport: Transport,'
  + ' SpeedRail: SpeedRail, Hud: Hud, PatternRow: PatternRow, PanelView: PanelView, FloatView: FloatView, FloatHost: FloatHost,'
  + ' DICTS: DICTS, LOCALES: LOCALES, readPrefs: readPrefs, writePrefs: writePrefs, PREFS_KEY: PREFS_KEY,'
  + ' makeTranslate: makeTranslate, installLocale: installLocale }'
const body = SRC.slice(0, SRC.indexOf(CUT)) + '\nreturn ' + EXPORTS + '\n'

let api = null
try {
  api = await wrapper(body)(makeReact().React, console, { insert: () => () => {} }, {}, {})
  ok('source parses and evaluates as a Function body', true)
} catch (err) {
  ok('source parses and evaluates as a Function body', false, err.message)
}
ok('the plugin-body split marker exists', SRC.indexOf(CUT) > 0)

/* =============================== 2. rules ================================= */
console.log('\n[2] simulation rules')
const alive = (sim) => {
  const out = []
  for (let y = 0; y < sim.rows; y++) for (let x = 0; x < sim.cols; x++) if (sim.get(x, y) === 1) out.push(x + ',' + y)
  return out.sort()
}

if (api) {
  const LIFE = api.RULE_BY_KEY.life

  /** An empty world plus its store, so the sim can be driven head-on. */
  function world(cols, rows) {
    const store = api.createStore({ running: false, speed: 20, rule: 'life', wrap: true, tool: 'draw', pattern: '' })
    const sim = api.createSim(store, THEME_STUB)
    sim.alloc(cols, rows, 0)
    return { store: store, sim: sim }
  }

  {  // glider translates (+1,+1) every 4 generations on a torus
    const w = world(20, 20)
    w.sim.stamp(api.PATTERN_BY_KEY.glider, 5, 5)
    eq('glider stamps 5 cells', alive(w.sim).length, 5)
    const before = alive(w.sim)
    for (let i = 0; i < 4; i++) w.sim.step(LIFE, true)
    eq('glider reappears moved (+1,+1) after 4 generations', alive(w.sim),
      before.map((k) => { const p = k.split(','); return (Number(p[0]) + 1) + ',' + (Number(p[1]) + 1) }).sort())
    eq('glider generation counter', w.sim.gen, 4)
    eq('glider population', w.sim.pop, 5)
  }

  {  // blinker: period 2
    const w = world(10, 10)
    w.sim.set(4, 5, 1); w.sim.set(5, 5, 1); w.sim.set(6, 5, 1)
    w.sim.step(LIFE, true)
    eq('blinker flips to vertical', alive(w.sim), ['5,4', '5,5', '5,6'])
    w.sim.step(LIFE, true)
    eq('blinker flips back', alive(w.sim), ['4,5', '5,5', '6,5'])
  }

  {  // block: still life
    const w = world(10, 10)
    w.sim.set(3, 3, 1); w.sim.set(4, 3, 1); w.sim.set(3, 4, 1); w.sim.set(4, 4, 1)
    for (let i = 0; i < 10; i++) w.sim.step(LIFE, true)
    eq('block survives 10 generations unchanged', alive(w.sim), ['3,3', '3,4', '4,3', '4,4'])
  }

  {  // a blinker straddling the seam only blinks when the world wraps
    const dead = world(12, 12)
    const torus = world(12, 12)
    for (const w of [dead, torus]) { w.sim.set(11, 5, 1); w.sim.set(0, 5, 1); w.sim.set(1, 5, 1) }
    dead.sim.step(LIFE, false)
    torus.sim.step(LIFE, true)
    eq('dead boundary breaks a seam-spanning blinker', alive(dead.sim), [])
    eq('torus wraps it into a real blinker', alive(torus.sim), ['0,4', '0,5', '0,6'])
  }

  {  // Gosper glider gun emits gliders forever
    const w = world(70, 70)
    const gun = api.PATTERN_BY_KEY.gun
    eq('gun pattern is 36 cells', gun.cells.length, 36)
    w.sim.stamp(gun, 22, 22)
    const startPop = w.sim.pop
    for (let i = 0; i < 150; i++) w.sim.step(LIFE, false)
    ok('gun keeps growing after 150 generations', w.sim.pop > startPop, 'pop ' + startPop + ' \u2192 ' + w.sim.pop)
    eq('gun block still alive at (4,22)-(5,23)',
      [w.sim.get(4, 22), w.sim.get(5, 22), w.sim.get(4, 23), w.sim.get(5, 23)], [1, 1, 1, 1])
  }

  {  // rule tables
    const hl = api.RULE_BY_KEY.highlife
    ok('highlife is B36/S23', hl.b[6] === 1 && hl.b[3] === 1 && hl.s[2] === 1 && hl.b[2] === 0 && hl.s[3] === 1)
    const seeds = api.RULE_BY_KEY.seeds
    ok('seeds births on 2 and survives nothing', seeds.b[2] === 1 && seeds.s.every((v) => v === 0))
    ok('every rule has a distinct key', new Set(api.RULES.map((r) => r.key)).size === api.RULES.length)
  }

  {  // bookkeeping + reset semantics
    const w = world(16, 16)
    w.sim.seed(0.5)
    eq('seed() reports the true population', w.sim.pop, alive(w.sim).length)
    const snapshot = alive(w.sim)
    for (let i = 0; i < 5; i++) w.sim.step(LIFE, true)
    w.sim.reset()
    eq('reset() restores the seeded soup', alive(w.sim), snapshot)
    eq('reset() rewinds the generation counter', w.sim.gen, 0)
    w.sim.clear()
    eq('clear() empties the board', w.sim.pop, 0)
    w.sim.set(2, 2, 1)
    eq('set() keeps pop in step', w.sim.pop, 1)
    w.sim.set(2, 2, 1)
    eq('set() is idempotent', w.sim.pop, 1)
  }

  {  // the clock: unattached views cost nothing, attached ones advance
    const w = world(24, 24)
    const realNow = Date.now
    let clock = 1000
    Date.now = () => clock
    try {
      w.store.patch({ running: true, speed: 20 })
      for (let i = 0; i < 40; i++) { clock += 25; w.sim.tick() }
      eq('an unwatched world never steps', w.sim.gen, 0)

      eq('watched is false with no canvas', w.sim.watched, false)
      const canvas = makeCanvas(240, 240)
      w.sim.attachBoard(canvas, 10, 1)
      eq('watched is true once a canvas attaches', w.sim.watched, true)
      for (let i = 0; i < 40; i++) { clock += 25; w.sim.tick() }
      const advanced = w.sim.gen
      ok('the clock advances ~20 generations per second', advanced >= 18 && advanced <= 22, 'advanced ' + advanced)

      w.sim.detachBoard(canvas)
      const frozen = w.sim.gen
      for (let i = 0; i < 20; i++) { clock += 25; w.sim.tick() }
      eq('detaching the view freezes the world', w.sim.gen, frozen)

      w.sim.attachBoard(canvas, 10, 1)
      w.store.patch({ running: false })
      for (let i = 0; i < 20; i++) { clock += 25; w.sim.tick() }
      eq('a paused world does not advance', w.sim.gen, frozen)
    } finally {
      Date.now = realNow
    }
  }

  ok('the grid is drawn once per paint', DRAWN.fillRect > 0, 'fillRect calls: ' + DRAWN.fillRect)
}

/* ============================ 3. seats + views ============================ */
console.log('\n[3] seats and views')
{
  const mini = makeReact()
  const LOCALE = makeLocaleStub(api.DICTS)
  const registered = []
  let intervalCb = null
  const slotsStub = {
    inject: (key, cb) => { const d = cb(); return () => { if (typeof d === 'function') d() } },
    register: (opts, comp) => { registered.push({ opts: opts, comp: comp }); return () => {} },
  }
  const ctxStub = {
    get: (n) => (n === 'slots' ? slotsStub : n === 'theme' ? THEME_STUB : n === 'locale' ? LOCALE.api : undefined),
    effect: (fn) => { const d = fn(); return () => { if (typeof d === 'function') d() } },
    on: () => () => {},
    interval: (fn) => { intervalCb = fn; return () => { intervalCb = null } },
  }

  const plugin = await wrapper(SRC)(mini.React, console, { insert: () => () => {} }, {}, {})
  ok('the body returns a plugin object', !!plugin && typeof plugin.apply === 'function')
  eq('the plugin declares the timer dependency', plugin.inject, ['timer'])

  let applyErr = null
  try { plugin.apply(ctxStub) } catch (err) { applyErr = err }
  ok('apply() runs without throwing', applyErr === null, applyErr && applyErr.stack)

  const seats = registered.map((r) => r.opts.name)
  eq('exactly three seats are taken', registered.length, 3)
  eq('seats are the sidebar row, the main panel and the float', seats, ['sidebar.panellist', 'main', 'shell.overlay'])
  eq('the sidebar row id', registered[0].opts.id, 'life-game')
  eq('the sidebar row hands the side a label thunk, not a frozen string',
    typeof registered[0].opts.label, 'function')
  eq('the main panel key', registered[1].opts.key, 'life-game')
  eq('the float id', registered[2].opts.id, 'life-game-float')
  ok('the crowded sidebar footer strip is left alone', seats.indexOf('sidebar.footer.action') < 0)
  ok('a clock was registered by apply()', typeof intervalCb === 'function')

  ok('the sidebar label is a thunk, so it localizes at projection time',
    typeof registered[0].opts.label === 'function')
  eq('the label thunk answers in the active locale', registered[0].opts.label(), '生命游戏')
  LOCALE.set('en')
  eq('the label thunk follows a language switch', registered[0].opts.label(), 'Life')
  LOCALE.set('zh')

  // ---- the sidebar row only supplies a glyph; the sidebar owns the button ----
  const iconTree = mini.render(registered[0].comp, { size: 18, active: true })
  eq('the sidebar row renders the glider glyph', iconTree.type, 'svg')
  eq('the glyph has five cells', iconTree.children.length, 5)
  eq('the glyph honours the requested size', [iconTree.props.width, iconTree.props.height], [18, 18])

  // ---- the main panel ----
  const store = registered[1].comp().props.store
  const sim = registered[1].comp().props.sim
  ok('the panel shares the plugin store', !!store && typeof store.get === 'function')
  ok('the panel shares the plugin world', !!sim && typeof sim.alloc === 'function')

  let panel = mini.render(registered[1].comp, {})
  const repaint = () => { panel = mini.render(registered[1].comp, {}) }
  eq('the panel renders a div', panel.type, 'div')

  const expectCols = Math.floor((DOC.w - 46) / 9)
  const expectRows = Math.floor((DOC.h - 250) / 9)
  eq('the board fits the centre column', [sim.cols, sim.rows], [expectCols, expectRows])
  eq('the world is attached to the panel canvas', sim.watched, true)
  ok('the mount effect painted the board', DRAWN.fillRect > 0)

  const kinds = new Set()
  walk(panel, (n) => kinds.add(typeof n.type === 'string' ? n.type : (n.type && n.type.name)))
  ok('every element has a real type', !kinds.has('undefined') && !kinds.has('null'), [...kinds].join(','))
  for (const want of ['canvas', 'button', 'select', 'input', 'svg', 'rect']) ok('the panel contains <' + want + '>', kinds.has(want))

  const buttons = () => findAll(panel, (n) => n.type === 'button')
  const byText = (text) => buttons().filter((b) => b.children.some((c) => typeof c === 'string' && c.indexOf(text) >= 0))[0] || null
  const boardCanvas = () => findAll(panel, (n) => n.type === 'canvas' && !!n.props.onPointerDown)[0] || null

  ok('the transport is there', !!byText('单步') && !!byText('随机') && !!byText('清空') && !!byText('重置'))
  ok('the board-size control is there', !!byText('自适应'))
  ok('the return-to-conversation button is there', !!byText('返回对话'))

  // ---- the clock drives the rendered panel ----
  const realNow = Date.now
  let clock = 5000
  Date.now = () => clock
  try {
    store.patch({ running: true, speed: 20 })
    const gen0 = store.get().gen
    for (let i = 0; i < 40; i++) { clock += 25; intervalCb() }
    const advanced = store.get().gen - gen0
    ok('the panel clock advances generations', advanced > 0, 'gen +' + advanced)
    ok('generations track the requested rate', advanced >= 18 && advanced <= 22, 'advanced ' + advanced)
    ok('population is republished to the store', store.get().pop > 0)
    ok('history accumulates for the sparkline', DRAWN.stroke > 0)
    store.patch({ running: false })
    for (let i = 0; i < 5; i++) { clock += 25; intervalCb() }
  } finally {
    Date.now = realNow
  }

  // ---- painting on the board ----
  repaint()
  const stepBtn = byText('单步')
  const before = store.get().gen
  stepBtn.props.onClick()
  eq('single step advances exactly one generation', store.get().gen, before + 1)

  repaint()
  const clearBtn = byText('清空')
  clearBtn.props.onClick()
  repaint()
  eq('clear empties the board', store.get().pop, 0)

  const cell = store.get().cell
  const ev = (x, y, extra) => Object.assign({
    clientX: 100 + x * cell + Math.floor(cell / 2), clientY: 200 + y * cell + Math.floor(cell / 2),
    button: 0, pointerId: 1, preventDefault: () => {}, stopPropagation: () => {},
  }, extra || {})

  let cv = boardCanvas()
  cv.props.onPointerDown(ev(3, 3))
  cv.props.onPointerUp(ev(3, 3))
  eq('clicking paints a single cell', store.get().pop, 1)

  cv.props.onPointerDown(ev(6, 3))
  cv.props.onPointerMove(ev(7, 3))
  cv.props.onPointerMove(ev(8, 3))
  cv.props.onPointerUp(ev(8, 3))
  eq('dragging paints the whole stroke', store.get().pop, 4)

  cv.props.onPointerDown(ev(3, 3), { button: 2 })
  cv.props.onPointerUp(ev(3, 3))
  eq('right-click erases', store.get().pop, 3)

  const gunChip = buttons().filter((b) => b.children.indexOf('高斯帕机枪') >= 0)[0]
  ok('the pattern chips are there', !!gunChip)
  gunChip.props.onClick()
  eq('picking a pattern switches to stamp mode', store.get().tool, 'stamp')
  eq('picking a pattern records it', store.get().pattern, 'gun')

  repaint()
  const beforeStamp = store.get().pop
  cv = boardCanvas()
  cv.props.onPointerDown(ev(30, 20))
  eq('stamping the gun adds its 36 cells', store.get().pop - beforeStamp, 36)
  store.patch({ tool: 'draw' })

  // ---- controls ----
  repaint()
  const range = findAll(panel, (n) => n.type === 'input')[0]
  range.props.onChange({ target: { value: '60' } })
  eq('the speed slider writes a number, not a string', store.get().speed, 60)

  const select = findAll(panel, (n) => n.type === 'select')[0]
  select.props.onChange({ target: { value: 'daynight' } })
  eq('the rule selector writes the rule key', store.get().rule, 'daynight')
  store.patch({ rule: 'life' })

  const smallCell = buttons().filter((b) => b.children.indexOf('6px') >= 0)[0]
  ok('the cell-size control is there', !!smallCell)
  smallCell.props.onClick()
  repaint()
  eq('changing the cell size re-fits the board', [sim.cols, sim.rows],
    [Math.floor((DOC.w - 46) / 6), Math.floor((DOC.h - 250) / 6)])
  eq('changing the cell size reseeds', sim.gen, 0)

  // ---- board size and zoom are separate knobs ----
  const presetBtn = (needle) => buttons().filter((b) => b.children.some((c) => typeof c === 'string' && c.indexOf(needle) >= 0))[0]

  const smallBtn = presetBtn('40\u00d724')
  ok('the 小 40x24 preset is there', !!smallBtn)
  smallBtn.props.onClick()
  repaint()
  eq('picking a preset allocates exactly that board', [sim.cols, sim.rows], [40, 24])

  const zoomedGen = sim.gen
  presetBtn('14px').props.onClick()
  repaint()
  eq('zoom does not resize a preset board', [sim.cols, sim.rows], [40, 24])
  eq('zoom does not reseed a preset board', sim.gen, zoomedGen)
  eq('zoom is stored on the board', store.get().cell, 14)

  const autoBtn = presetBtn('自适应')
  autoBtn.props.onClick()
  repaint()
  eq('自适应 re-fits the world to the column at the current zoom', [sim.cols, sim.rows],
    [Math.floor((DOC.w - 46) / 14), Math.floor((DOC.h - 250) / 14)])
  ok('a fitted board never overflows the column', sim.cols * store.get().cell <= DOC.w, sim.cols + ' cols')

  // ---- the floating window ----
  let floatTree = mini.render(registered[2].comp, {})
  eq('the float seat renders nothing while closed', floatTree, null)
  store.patch({ float: true })
  floatTree = mini.render(registered[2].comp, {})
  ok('toggling float mounts the window', !!floatTree && floatTree.type === 'div')
  const floatCanvases = findAll(floatTree, (n) => n.type === 'canvas' && !!n.props.onPointerDown)
  eq('the float renders its own board', floatCanvases.length, 1)
  const floatClose = findAll(floatTree, (n) => n.type === 'button' && n.props.className === 'lgf-x')[0]
  ok('the float has its own close button', !!floatClose)
  floatClose.props.onClick()
  eq('closing the float writes the store', store.get().float, false)
  floatTree = mini.render(registered[2].comp, {})
  eq('the closed float unmounts', floatTree, null)

  // ---- the float toggle inside the panel ----
  repaint()
  const floatBtn = buttons().filter((b) => b.children.some((c) => typeof c === 'string' && c.indexOf('浮窗') >= 0))[0]
  ok('the panel has a float toggle', !!floatBtn)
  floatBtn.props.onClick()
  eq('the panel toggle opens the float', store.get().float, true)
}

/* ===================== 4. preferences (durable bundle) ==================== */
console.log('\n[4] preferences')
{
  const storage = makeStorage()
  globalThis.window = { localStorage: storage, devicePixelRatio: 2, innerWidth: 1400, innerHeight: 900 }

  const durableBody = 'const LIFE_DURABLE = true\n' + body
  const durable = await wrapper(durableBody)(makeReact().React, console, { insert: () => () => {} }, {}, {})
  const KEY = durable.PREFS_KEY

  durable.writePrefs({ sizeKey: 'l', cell: 12, speed: 60, wrap: false, rule: 'highlife', float: true, gen: 99 })
  const back = durable.readPrefs()
  eq('a written section round-trips', [back.sizeKey, back.cell, back.speed, back.wrap, back.rule, back.float],
    ['l', 12, 60, false, 'highlife', true])
  ok('transient fields are not persisted', back.gen === undefined)

  storage.setItem(KEY, JSON.stringify({ sizeKey: 'nope', cell: 5, speed: 999, rule: 'x', floatPos: 'bad', running: 'yes' }))
  eq('invalid fields are dropped, not trusted', durable.readPrefs(), {})

  storage.setItem(KEY, JSON.stringify({ sizeKey: 's', floatPos: { x: 12.6, y: -3.2 } }))
  eq('a valid float position is kept and rounded', durable.readPrefs().floatPos, { x: 13, y: -3 })

  storage.setItem(KEY, '{not json at all')
  eq('corrupt storage falls back to defaults', durable.readPrefs(), {})

  storage.removeItem(KEY)
  const store = durable.createStore({ running: true, speed: 14, sizeKey: 'auto', cell: 9, wrap: true, rule: 'life' })
  const sim = durable.createSim(store, THEME_STUB)
  sim.prefsTouched()
  ok('nothing is written before the clock flushes', storage.getItem(KEY) === null)
  sim.tick()
  ok('the clock flushes a touched store', storage.getItem(KEY) !== null)
  eq('the flushed snapshot carries the live values', JSON.parse(storage.getItem(KEY)).speed, 14)

  // the dynamic half of the contract: a dynamic package persists nothing
  storage.removeItem(KEY)
  api.writePrefs({ speed: 30 })
  ok('the dynamic evaluation writes nothing', storage.getItem(KEY) === null)
  eq('and reads nothing back', api.readPrefs(), {})

  delete globalThis.window
}

/* ============================== 5. bilingual ============================== */
console.log('\n[5] bilingual')
{
  const zh = api.DICTS.zh
  const en = api.DICTS.en
  eq('both dictionaries are shipped', api.LOCALES, ['zh', 'en'])
  eq('en covers exactly the zh keys', Object.keys(en).sort().join('|'), Object.keys(zh).sort().join('|'))
  ok('every value is a non-empty string',
    api.LOCALES.every((id) => Object.values(api.DICTS[id]).every((v) => typeof v === 'string' && v.length > 0)))
  ok('no key is left in Chinese inside the English dictionary',
    Object.keys(en).every((k) => !/[\u4e00-\u9fff]/.test(en[k])), Object.keys(en).filter((k) => /[\u4e00-\u9fff]/.test(en[k])).join(','))

  const LOC = makeLocaleStub(api.DICTS)
  const t = api.makeTranslate(LOC.api)
  eq('the bound translator reads the active locale', t('btn.run'), '运行')
  LOC.set('en')
  eq('...and follows a switch', t('btn.run'), 'Run')
  eq('the English title is the real one', t('app.title'), "Conway's Game of Life")

  const fallback = api.makeTranslate(undefined)
  eq('without a locale service the static dictionary answers', fallback('btn.run'), '运行')
  eq('an unknown key degrades to the key itself', fallback('nope.nope'), 'nope.nope')
}

/* ============================== summary =================================== */
console.log('')
if (failures === 0) console.log('\u2713 all checks passed')
else {
  console.log('\u2717 ' + failures + ' check(s) failed')
  process.exitCode = 1
}
