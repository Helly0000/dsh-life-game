/* ============================================================================
 * bundle.spec.mjs — does the BUILT artifact actually work?
 *
 *   node build.mjs && node test/bundle.spec.mjs
 *
 * The unit suite exercises src/game.js. This one loads lib/client.js the way the
 * page does: a fake window.__ModuleLoader__, a fake <head>, a React externals
 * lookup — then mounts the package and renders the panel for real.
 * ========================================================================== */
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const BUNDLE = path.join(here, '..', 'lib', 'client.js')
const PKG = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'))

let failures = 0
function ok(name, cond, detail) {
  if (cond) console.log('  \u2713 ' + name)
  else { failures++; console.log('  \u2717 ' + name + (detail === undefined ? '' : '  \u2192 ' + detail)) }
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected),
    'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected))
}

/* ------------------------------------------------------- the fake page ---- */
const MODULES = []          // what the bundle registered
const STYLE_TAGS = []       // what the styles shim appended
const storage = new Map()

globalThis.window = {
  __ModuleLoader__: { load: (registration) => MODULES.push(registration) },
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  devicePixelRatio: 2, innerWidth: 1400, innerHeight: 900,
}
globalThis.document = {
  createElement: (tag) => ({ tagName: tag, dataset: {}, textContent: '', parentNode: null }),
  head: {
    children: [],
    appendChild(el) { el.parentNode = this; this.children.push(el); STYLE_TAGS.push(el) },
    removeChild(el) { const i = this.children.indexOf(el); if (i >= 0) this.children.splice(i, 1) },
  },
}

/* ------------------------------------------------------------- mini React -- */
function makeReact() {
  const slots = new Map()
  const effects = []
  let cursor = 0
  let current = []
  let dirty = false
  const React = {
    createElement(type, props) {
      const kids = []
      const push = (v) => { if (Array.isArray(v)) v.forEach(push); else kids.push(v) }
      for (let i = 2; i < arguments.length; i++) push(arguments[i])
      return { type, props: props || {}, children: kids }
    },
    useState(init) {
      const i = cursor++
      const own = current
      if (!(i in own)) own[i] = { v: typeof init === 'function' ? init() : init }
      return [own[i].v, (n) => { own[i].v = typeof n === 'function' ? n(own[i].v) : n; dirty = true }]
    },
    useRef(init) {
      const i = cursor++
      const own = current
      if (!(i in own)) own[i] = { current: init }
      return own[i]
    },
    useEffect(fn, deps) { const i = cursor++; effects.push({ store: current, i, fn, deps }) },
  }
  const same = (a, b) => a !== undefined && b !== undefined && a.length === b.length && a.every((v, k) => Object.is(v, b[k]))

  function attach(tree) {
    if (!tree || typeof tree !== 'object') return
    const ref = tree.props && tree.props.ref
    if (ref && typeof ref === 'object') {
      ref.current = tree.type === 'canvas'
        ? {
          width: 0, height: 0, style: {}, parentElement: { clientWidth: 900 },
          getContext: () => ctx2d(), setPointerCapture: () => {},
          getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 300 }),
        }
        : {
          clientWidth: 1000, clientHeight: 760,
          getBoundingClientRect: () => ({ left: 40, top: 60, width: 1000, height: 760 }),
          setPointerCapture: () => {},
        }
    }
    for (const ch of tree.children || []) attach(ch)
  }
  function expand(node) {
    if (!node || typeof node !== 'object') return node
    if (typeof node.type === 'function') {
      if (!slots.has(node.type)) slots.set(node.type, [])
      const outer = current
      current = slots.get(node.type)
      cursor = 0
      const built = node.type(node.props)
      current = outer
      return expand(built)
    }
    node.children = (node.children || []).map(expand)
    return node
  }
  function render(component, props) {
    let tree = null
    for (let pass = 0; pass < 6; pass++) {
      effects.length = 0
      dirty = false
      tree = expand({ type: component, props: props || {}, children: [] })
      attach(tree)
      for (const e of effects) {
        const slot = e.store[e.i]
        if (slot && slot.ran && same(slot.deps, e.deps)) continue
        if (slot && slot.ran && typeof slot.cleanup === 'function') slot.cleanup()
        const cleanup = e.fn()
        e.store[e.i] = { ran: true, deps: e.deps, cleanup: typeof cleanup === 'function' ? cleanup : null }
      }
      if (!dirty) break
    }
    return tree
  }
  return { React, render }
}
const ctx2d = () => {
  const noop = () => {}
  return {
    setTransform: noop, clearRect: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    fillRect: noop, strokeRect: noop, stroke: noop, fill: noop,
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: '', globalAlpha: 1,
  }
}
function walk(node, fn) {
  if (!node || typeof node !== 'object') return
  fn(node)
  for (const ch of node.children || []) walk(ch, fn)
}

/* ============================ 1. the bundle =============================== */
console.log('\n[1] the built bundle registers itself')
const code = fs.readFileSync(BUNDLE, 'utf8')
ok('the bundle exists and is substantial', code.length > 20000, code.length + ' bytes')
// Execute it the way the page does: a plain script that only REGISTERS a factory.
new Function(code)()
eq('it registers exactly one module', MODULES.length, 1)
const registration = MODULES[0]
eq('the registered id is the package name', registration.id, PKG.name)
ok('the registration is a factory', typeof registration.factory === 'function')

let reactRequests = 0
const requireStub = (id) => {
  if (id === 'react') { reactRequests++; return mini.React }
  throw new Error('unexpected external: ' + id)
}
const mini = makeReact()
const plugin = registration.factory(requireStub)
ok('the factory asked for react as an external', reactRequests === 1)
ok('the factory returns a plugin object', !!plugin && typeof plugin.apply === 'function')
eq('the plugin is named', plugin.name, 'life-game')
eq('and still requires the timer service', plugin.inject, ['timer'])

/* ============================ 2. mounting ================================= */
console.log('\n[2] mounting it contributes real UI')
const seats = []
let intervalCb = null
// A tagging translator: every visible string must come back tagged with its key
// and the active locale, which is how we prove nothing is hardcoded.
let activeLocale = 'zh'
const localeStub = {
  bind: () => (key) => activeLocale + ':' + key,
  register: () => () => {},
  subscribe: () => () => {},
  getLocale: () => ({ active: activeLocale, locales: [], revision: 0 }),
}
const theEffects = []
const ctx = {
  get: (n) => (n === 'slots' ? SLOTS : n === 'theme' ? { getTheme: () => ({ active: { tokens: {} } }) } : n === 'locale' ? localeStub : undefined),
  effect: (fn) => { const d = fn(); theEffects.push(d); return () => { if (typeof d === 'function') d() } },
  on: () => () => {},
  interval: (fn) => { intervalCb = fn; return () => { intervalCb = null } },
}
const SLOTS = {
  inject: (key, cb) => { const d = cb(); return () => { if (typeof d === 'function') d() } },
  register: (opts, comp) => { seats.push({ opts, comp }); return () => {} },
}

storage.set('dsh-life-game:prefs', JSON.stringify({ sizeKey: 'm', cell: 12, speed: 45, rule: 'highlife' }))
let applyErr = null
try { plugin.apply(ctx) } catch (err) { applyErr = err }
ok('apply() runs inside the fake page', applyErr === null, applyErr && applyErr.stack)

eq('three seats are taken', seats.map((s) => s.opts.name),
  ['sidebar.panellist', 'main', 'shell.overlay'])
eq('the sidebar row id and localized label', [seats[0].opts.id, seats[0].opts.label()], ['life-game', 'zh:app.name'])
eq('the main panel key', seats[1].opts.key, 'life-game')
eq('the float seat id', seats[2].opts.id, 'life-game-float')

eq('the styles shim injected one stylesheet', STYLE_TAGS.length, 1)
eq('the stylesheet is tagged with the plugin', STYLE_TAGS[0].dataset.plugin, PKG.name)
ok('the stylesheet carries the game CSS', STYLE_TAGS[0].textContent.indexOf('.lgp-root') > 0)

ok('a clock was registered', typeof intervalCb === 'function')

/* ============================ 3. the panel ================================ */
console.log('\n[3] the panel renders and honours stored preferences')
const store = seats[1].comp().props.store
const sim = seats[1].comp().props.sim
eq('stored sizeKey was restored', store.get().sizeKey, 'm')
eq('stored zoom was restored', store.get().cell, 12)
eq('stored speed was restored', store.get().speed, 45)
eq('stored rule was restored', store.get().rule, 'highlife')
eq('the restored preset sized the world', [sim.cols, sim.rows], [64, 38])

const tree = mini.render(seats[1].comp, {})
eq('the panel renders a div', tree.type, 'div')
const texts = []
walk(tree, (n) => { for (const c of n.children) if (typeof c === 'string') texts.push(c) })
ok('the panel title comes from the translator', texts.indexOf('zh:app.title') >= 0)
ok('the transport buttons come from the translator',
  texts.indexOf('zh:btn.step') >= 0 && texts.indexOf('zh:btn.random') >= 0)
const hardcoded = texts.filter((s) => /[\u4e00-\u9fff]/.test(s))
ok('no hardcoded CJK survives in the rendered tree', hardcoded.length === 0, hardcoded.join(' | '))

activeLocale = 'en'
eq('the sidebar row localizes on demand', seats[0].opts.label(), 'en:app.name')
activeLocale = 'zh'

/* ============================ 4. teardown ================================= */
console.log('\n[4] unloading leaves nothing behind')
for (const dispose of theEffects) { if (typeof dispose === 'function') dispose() }
eq('the stylesheet is removed with the plugin', document.head.children.length, 0)

console.log('')
if (failures === 0) console.log('\u2713 all checks passed')
else { console.log('\u2717 ' + failures + ' check(s) failed'); process.exitCode = 1 }
