// Development aid: how smoothly a phone page scrolls. Headless Edge over CDP, a phone's screen, the CPU slowed (THROTTLE,
// default 4), real touch swipes down the page from a section's top; per section: frame gaps, long tasks, and the
// functions that took the most time. node scripts/dev-probe.mjs <url> <sectionId> [<sectionId>...]
// GPU=1 renders on the machine's graphics card (as dev-shoot.mjs)
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, ...ids] = process.argv.slice(2)
const THROTTLE = Number(process.env.THROTTLE ?? 4)
const SWIPES = Number(process.env.SWIPES ?? 8)
const port = 9300 + Math.floor(Math.random() * 500)
const profile = mkdtempSync(join(tmpdir(), 'edge-cdp-'))
const edge = spawn(
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    ...(process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu-rasterization'] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']),
    '--ignore-gpu-blocklist',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    `--user-data-dir=${profile}`,
    '--window-size=412,820',
    'about:blank',
  ],
  { stdio: 'ignore' },
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws
const done = () => {
  try {
    ws?.close()
  } catch {}
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' })
  else edge.kill('SIGKILL')
}
process.on('uncaughtException', (e) => {
  console.error(e)
  done()
  process.exit(1)
})
let page
for (let i = 0; i < 60 && !page; i++) {
  try {
    page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')
  } catch {}
  if (!page) await sleep(250)
}
ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id
    pending.set(n, res)
    ws.send(JSON.stringify({ id: n, method, params }))
  })
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 820, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
// every shader program linked: its name and what sets it apart, and whether the opening still showed (LINKS=1)
if (process.env.LINKS)
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { window.__links = []; const P = WebGL2RenderingContext.prototype; const src = new WeakMap(); const att = new WeakMap();
      const ss = P.shaderSource; P.shaderSource = function (sh, s) { src.set(sh, s); return ss.call(this, sh, s) };
      const as = P.attachShader; P.attachShader = function (pr, sh) { const s = src.get(sh) || ''; if (/gl_FragColor|pc_fragColor|fragColor|void main/.test(s) && s.includes('SHADER_NAME')) att.set(pr, s); else if (!att.has(pr)) att.set(pr, s); return as.call(this, pr, sh) };
      const lp = P.linkProgram; P.linkProgram = function (pr) { const s = att.get(pr) || ''; const name = (s.match(/#define SHADER_NAME (\S+)/) || [])[1] || '?'; const defs = (s.match(/#define (USE_SHADOWMAP|NUM_CLIPPING_PLANES \d+|USE_ENVMAP|DEPTH_PACKING \d+|USE_INSTANCING|USE_TRANSMISSION|ALPHATEST|OPAQUE|USE_MAP)/g) || []).map(d => d.replace('#define ', '')).join(','); if (!window.__ctx) window.__ctx = new Map(); if (!window.__ctx.has(this)) window.__ctx.set(this, window.__ctx.size); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; window.__links.push([Math.round(performance.now()), !!document.querySelector('.opener'), name, defs, 'ctx' + window.__ctx.get(this), (h >>> 0).toString(36), this.canvas.closest && (this.canvas.closest('section[id]')?.id || '?')]); (window.__src = window.__src || {})[(h >>> 0).toString(36)] = s; return lp.call(this, pr) } })()`,
  })
if (process.env.DRAWS)
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { window.__draws = {}; const P = WebGL2RenderingContext.prototype; for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = P[f]; P[f] = function (...a) { const c = this.canvas; const id = c.__sid || (c.__sid = (c.closest && (c.closest('section[id]')?.id || 'stage')) || '?'); window.__draws[id] = (window.__draws[id] || 0) + 1; return o.apply(this, a) } } })()`,
  })
await send('Page.navigate', { url })
// the opening gone, the cookie banner declined, a moment for the page to settle
for (let i = 0; i < 120; i++) {
  await sleep(500)
  if (await ev("!document.querySelector('.opener') && document.readyState === 'complete' && !!document.querySelector('#main section')")) break
}
const opened = await ev('performance.now()')
await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Decline')?.click(), 0")
await sleep(2500)
await send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
console.log(await ev(`location.pathname+' | '+[...document.querySelectorAll('section[id]')].map(s=>s.id).join(',')+' | links '+(window.__links||[]).length+' | '+(document.querySelector('.opener')?'opener':'')`))
if (process.env.LINKS) console.log('links during opening:', await ev(`(window.__links||[]).map(l=>l[0]+(l[2]==='S'?'s':'')).join(' ')`))
console.log('canvases at lift:', await ev(`[...document.querySelectorAll('.fc-canvas')].map(c=>(c.closest('section[id]')?.id||'?')+(c.querySelector('canvas')?'+':'-')).join(' ')`))
console.log(`opening gone at ${(opened / 1000).toFixed(1)} s; CPU slowed ${THROTTLE}x`)

// FILM=<dir>: no swipes; the first section scrolled to and filmed, a frame each ~100 ms for SECONDS (default 14)
if (process.env.FILM) {
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync(process.env.FILM, { recursive: true })
  await send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const top = await ev(`Math.round(document.getElementById(${JSON.stringify(ids[0])}).getBoundingClientRect().top+scrollY)`)
  await ev(`scrollTo(0, ${top}), 0`)
  const t0 = Date.now()
  let i = 0
  while (Date.now() - t0 < Number(process.env.SECONDS ?? 14) * 1000) {
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 })
    writeFileSync(join(process.env.FILM, `f${String(i).padStart(3, '0')}-${Date.now() - t0}.jpg`), Buffer.from(shot.result.data, 'base64'))
    i++
    await sleep(60)
  }
  console.log('filmed', i, 'frames')
  done()
  process.exit(0)
}
// BARS=1: the deck's size read, the screen made 56 px taller (the browser's bar sliding away), read again
if (process.env.BARS) {
  const read = `(()=>{const l=document.querySelector('#${ids[0]} .fdeck__list'); return [l.style.getPropertyValue('--deck-scale'), l.style.getPropertyValue('--card-h'), l.classList.contains('is-fit')].join(' ')})()`
  await ev(`(()=>{const s=document.getElementById('${ids[0]}'); scrollTo(0, s.getBoundingClientRect().top+scrollY); return 0})()`)
  await sleep(800)
  console.log('before', await ev(read))
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 876, deviceScaleFactor: 2, mobile: true })
  await sleep(800)
  console.log('bar gone', await ev(read))
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 820, deviceScaleFactor: 2, mobile: true })
  await sleep(800)
  console.log('bar back', await ev(read))
  done()
  process.exit(0)
}
await send('Profiler.enable')
// WHOLE=1: from the top of the page to its foot in swipes; each long task, where the page was, and what ran in it
if (process.env.WHOLE) {
  await send('Profiler.setSamplingInterval', { interval: 200 })
  await ev(`(()=>{ scrollTo(0,0); window.__lts=[]; new PerformanceObserver((l)=>l.getEntries().forEach(e=>{ const at=document.elementsFromPoint(206,300).map(x=>x.closest('section[id]')?.id).find(Boolean)||'?'; window.__lts.push([Math.round(e.startTime), Math.round(e.duration), Math.round(scrollY), at]) })).observe({type:'longtask'}); return 0 })()`)
  await sleep(1500)
  const t0 = await ev('performance.now()')
  await send('Profiler.start')
  const pt = (y) => [{ x: 206, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
  for (let i = 0; i < Number(process.env.SWIPES ?? 40); i++) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(660) })
    for (let k = 1; k <= 10; k++) {
      await sleep(16)
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(660 - (480 * k) / 10) })
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(500)
    if (await ev('scrollY + innerHeight >= document.documentElement.scrollHeight - 4')) break
  }
  const prof = (await send('Profiler.stop')).result.profile
  const lts = await ev('JSON.stringify(window.__lts)')
  const byId = new Map(prof.nodes.map((n) => [n.id, n]))
  const parent = new Map()
  for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  // each sample's time (ms, in the page's clock), from the profile's start
  let t = 0
  const times = prof.timeDeltas.map((d) => (t += d) / 1000)
  const p0 = prof.startTime / 1000
  const nm = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`
  for (const [start, dur, y, at] of JSON.parse(lts)) {
    const from = start - t0
    const to = from + dur
    const self = new Map()
    const roots = new Map()
    prof.samples.forEach((sid, i) => {
      const ts = times[i]
      if (ts < from || ts > to) return
      const n = byId.get(sid)
      const k = nm(n)
      if (k.startsWith('(idle)')) return
      self.set(k, (self.get(k) ?? 0) + (prof.timeDeltas[i] ?? 0))
      // the frame under the root: what started this work
      let top = n
      for (let p = parent.get(n.id); p && byId.get(p).callFrame.functionName !== '(root)'; p = parent.get(p)) top = byId.get(p)
      const rk = nm(top)
      roots.set(rk, (roots.get(rk) ?? 0) + (prof.timeDeltas[i] ?? 0))
    })
    const fmt = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${(v / 1000).toFixed(0)}ms ${k}`).join(' | ')
    console.log(`long task ${dur} ms at y ${y} in #${at}`)
    console.log(`   started by: ${fmt(roots)}`)
    console.log(`   self:       ${fmt(self)}`)
  }
  if (process.env.LINKS) {
    const L = JSON.parse(await ev('JSON.stringify((window.__links||[]).filter(l => !l[1]))'))
    console.log(`programs linked after the opening: ${L.length}`)
    for (const l of L) console.log('   ', Math.round(l[0] - t0), 'ms', l.slice(2).join(' '))
    // each late one against the nearest made in the opening, in the same canvas: the lines only one of them has
    const diffs = process.env.DIFFJS ? await ev((await import('node:fs')).readFileSync(process.env.DIFFJS, 'utf8')) : ''
    console.log(diffs)
  }
  done()
  process.exit(0)
}
await send('Profiler.setSamplingInterval', { interval: 200 })
for (const sid of ids) {
  const top = await ev(`(()=>{const el=document.getElementById(${JSON.stringify(sid)}); if(!el) return null; return Math.round(el.getBoundingClientRect().top+scrollY)})()`)
  if (top == null) {
    console.log(`#${sid}: missing`)
    continue
  }
  await ev(`scrollTo(0, ${Math.max(0, top - 820 + Number(process.env.LEAD ?? 0))}), 0`)
  if (process.env.TRACE) console.log('  under finger', await ev(`(()=>{const o=[]; for(let e=document.elementFromPoint(206,600); e; e=e.parentElement){const c=getComputedStyle(e); o.push(e.tagName+'.'+String(e.className).slice(0,30)+(c.touchAction!=='auto'?' TA='+c.touchAction:'')+(c.overflowY!=='visible'?' OY='+c.overflowY:''))} return o.join(' < ')})()`))
  if (process.env.TRACE) console.log('  start y', await ev('Math.round(scrollY)'), await ev('getComputedStyle(document.documentElement).overflow+"/"+getComputedStyle(document.body).overflow+" "+document.documentElement.className'))
  await sleep(1500)
  if (process.env.DRAWS) await ev('(window.__draws = {}, 0)')
  await ev(`(()=>{ window.__f=[]; window.__lt=[]; let last=performance.now(); const tick=(t)=>{ window.__f.push(t-last); last=t; if(window.__on) requestAnimationFrame(tick) }; window.__on=true; requestAnimationFrame(tick);
    window.__po?.disconnect(); window.__po=new PerformanceObserver((l)=>l.getEntries().forEach(e=>window.__lt.push(Math.round(e.duration)))); window.__po.observe({type:'longtask', buffered:false}); return 0 })()`)
  await send('Profiler.start')
  // LAG=<js returning [expected, shown]>: every frame, how far what is shown is from where the scroll has it
  if (process.env.LAG) await ev(`(()=>{ window.__lag=[]; const f=()=>{ try { const [a,b]=(${process.env.LAG}); window.__lag.push(Math.abs(a-b)) } catch(e){}; if(!window.__lagOff) requestAnimationFrame(f) }; requestAnimationFrame(f); return 0 })()`)
  if (process.env.TRACE) await ev(`(()=>{window.__ys=[]; const t0=performance.now(); addEventListener('scroll',()=>__ys.push(Math.round(performance.now()-t0)+':'+Math.round(scrollY)),{passive:true}); return 0})()`)
  for (let i = 0; i < SWIPES; i++) {
    // a finger: down, up the screen 480 px in about a third of a second, off (a fling)
    const pt = (y) => [{ x: 206, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(process.env.UP ? 180 : 660) })
    for (let k = 1; k <= 14; k++) {
      await sleep(22)
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(process.env.UP ? 180 + (480 * k) / 14 : 660 - (480 * k) / 14) })
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(700)
    if (process.env.TRACE && !process.env.SHOW) console.log('  ys', (await ev('__ys.splice(0).join(" ")')).slice(0, 600))
    if (process.env.TRACE) console.log('  after swipe', i + 1, 'y', await ev('Math.round(scrollY)'), 'top of section', top, process.env.SHOW ? await ev(process.env.SHOW) : '')
  }
  const prof = (await send('Profiler.stop')).result.profile
  if (process.env.DRAWS) console.log('  draws while scrolling it:', await ev('JSON.stringify(window.__draws)'))
  if (process.env.LAG) console.log('  lag per frame: max', await ev('(window.__lagOff=true, Math.max(...__lag).toFixed(3))'), 'frames over 0.05:', await ev('__lag.filter(x=>x>0.05).length'), 'of', await ev('__lag.length'))
  const r = await ev(`(()=>{ window.__on=false; const f=window.__f.slice(1).sort((a,b)=>a-b); const n=f.length; const q=(p)=>f[Math.min(n-1,Math.floor(p*n))]; return {frames:n, p50:q(.5), p90:q(.9), p99:q(.99), max:f[n-1], over50:f.filter(x=>x>50).length, longtasks:window.__lt, y: Math.round(scrollY)} })()`)
  console.log('canvases after:', await ev(`[...document.querySelectorAll('.fc-canvas')].map(c=>(c.closest('section[id]')?.id||'?')+(c.querySelector('canvas')?'+':'-')).join(' ')`))
  if (process.env.LINKS) {
    const L = await ev('JSON.stringify((window.__links||[]).filter(l => !l[1]))')
    console.log(`  programs linked after the opening: ${JSON.parse(L).length}`)
    for (const l of JSON.parse(L).slice(0, 40)) console.log('   ', l.join(' '))
    console.log('  same canvas, linked during the opening:', await ev(`(()=>{const L=window.__links; const late=L.filter(l=>!l[1]); return late.map(l=>{const early=L.filter(e=>e[1]&&e[4]===l[4]); const same=early.some(e=>e[5]===l[5]); return l[4]+':'+l[5]+(same?'=':'!')+' early '+early.length}).join(' | ')})()`))
    if (process.env.DIFF) console.log(await ev(`(()=>{const L=window.__links; const late=L.find(l=>!l[1]); const early=L.filter(e=>e[1]&&e[4]===late[4]); const a=window.__src[late[5]].split('\n'); let best=null,bd=1e9; for(const e of early){const b=window.__src[e[5]].split('\n'); const d=a.filter(x=>!b.includes(x)).length+b.filter(x=>!a.includes(x)).length; if(d<bd){bd=d;best=b}} return best? ('late-only: '+a.filter(x=>!best.includes(x)).slice(0,12).join(' ‖ ')+'\nearly-only: '+best.filter(x=>!a.includes(x)).slice(0,12).join(' ‖ ')) : 'no early'})()`))
  }
  // self time per function
  const self = new Map()
  const byId = new Map(prof.nodes.map((n) => [n.id, n]))
  const dt = prof.timeDeltas
  prof.samples.forEach((s, i) => {
    const n = byId.get(s)
    const cf = n.callFrame
    const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber}${process.env.COLS ? ':' + cf.columnNumber : ''}`
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0))
  })
  const total = [...self.values()].reduce((a, b) => a + b, 0)
  const top10 = [...self.entries()]
    .filter(([k]) => !k.startsWith('(idle)') && !k.startsWith('(program)'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
  console.log(`\n#${sid}: frames ${r.frames}, p50 ${r.p50?.toFixed(1)} ms, p90 ${r.p90?.toFixed(1)}, p99 ${r.p99?.toFixed(1)}, max ${r.max?.toFixed(0)}, frames over 50 ms ${r.over50}; long tasks [${r.longtasks.join(', ')}]; ended at y ${r.y}`)
  console.log(`  busy ${(([...self.entries()].filter(([k]) => !k.startsWith('(idle)')).reduce((a, [, v]) => a + v, 0) / total) * 100).toFixed(0)}% of ${(total / 1e6).toFixed(1)} s`)
  for (const [k, v] of top10) console.log(`  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`)
  // who calls the costly native ones (WHO=getBoundingClientRect,getProgramInfoLog): their callers' chains, by time
  if (process.env.WHO) {
    const parent = new Map()
    for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
    const nm = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`
    for (const who of process.env.WHO.split(',')) {
      const chains = new Map()
      prof.samples.forEach((s, i) => {
        const n = byId.get(s)
        if (n.callFrame.functionName !== who) return
        const c = []
        for (let p = parent.get(n.id); p && c.length < 5; p = parent.get(p)) c.push(nm(byId.get(p)))
        const k = c.join(' < ')
        chains.set(k, (chains.get(k) ?? 0) + (dt[i] ?? 0))
      })
      console.log(`  ${who} from:`)
      for (const [k, v] of [...chains].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`    ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`)
    }
  }
}
done()
process.exit(0)
