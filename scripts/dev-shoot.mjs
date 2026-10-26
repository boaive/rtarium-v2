// Development aid (from V1): headless Edge over CDP. node scripts/dev-shoot.mjs shots.json
// shots.json: { width, height, mobile?, shots: [{ url, out, wait?, eval?, afterEval?, hover?: [x,y], wheel?: [x,y,dy,ticks], full? }] }
// GPU=1 renders on the machine's graphics card (much faster, real-time animation); default is SwiftShader
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'

const cfgPath = resolve(process.argv[2])
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
const outDir = dirname(cfgPath)
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
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profile}`,
    `--window-size=${cfg.width ?? 1440},${cfg.height ?? 900}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** closes the browser and everything it started: on Windows, killing the parent leaves its renderer, GPU and utility processes running */
let ws
let closed = false
async function shutdown() {
  if (closed) return
  closed = true
  try {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ id: 999999, method: 'Browser.close' }))
      await sleep(400)
      ws.close()
    }
  } catch {}
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' })
  else edge.kill('SIGKILL')
}
process.on('uncaughtException', async (e) => {
  console.error(e)
  await shutdown()
  process.exit(1)
})
process.on('SIGINT', async () => {
  await shutdown()
  process.exit(130)
})

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('Edge did not start')
}

ws = new WebSocket(await target())
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
const logs = []
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const t = msg.params.type
    if (t === 'error' || t === 'warning') logs.push(`[${t}] ` + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400))
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 600))
  }
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id
    pending.set(n, res)
    ws.send(JSON.stringify({ id: n, method, params }))
  })

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: cfg.width ?? 1440,
  height: cfg.height ?? 900,
  deviceScaleFactor: cfg.dpr ?? 1,
  mobile: Boolean(cfg.mobile),
})
if (cfg.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true })
// media: e.g. [{ "name": "prefers-reduced-motion", "value": "reduce" }]
if (cfg.media) await send('Emulation.setEmulatedMedia', { features: cfg.media })

let lastUrl = ''
for (const s of cfg.shots) {
  if (s.url && s.url !== lastUrl) {
    await send('Page.navigate', { url: s.url })
    lastUrl = s.url
    // wait for the opening scene (or its fallback) to report ready
    for (let i = 0; i < 120; i++) {
      await sleep(500)
      const r = await send('Runtime.evaluate', { expression: "Boolean(document.querySelector('.stage.is-ready')) || !document.querySelector('.stage')", returnByValue: true })
      if (r.result?.result?.value) break
    }
    await sleep(s.load ?? 1500)
  }
  if (s.seek) {
    const [sid, sp] = s.seek
    const r = await send('Runtime.evaluate', {
      expression: `(() => { const el = document.getElementById(${JSON.stringify(sid)}); if (!el) return 'missing ' + ${JSON.stringify(sid)}; const top = el.getBoundingClientRect().top + scrollY; const span = Math.max(0, el.offsetHeight - innerHeight); scrollTo(0, top + span * ${sp}); return Math.round(scrollY) })()`,
      returnByValue: true,
    })
    if (typeof r.result?.result?.value === 'string') console.log('seek:', r.result.result.value)
  }
  if (s.eval) {
    const r = await send('Runtime.evaluate', { expression: s.eval, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) logs.push('[eval] ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400))
    else if (r.result?.result?.value !== undefined && s.print) console.log(s.out ?? 'eval', '=>', JSON.stringify(r.result.result.value))
  }
  if (s.hover) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.hover[0], y: s.hover[1] })
  // wheel: [x, y, deltaY, ticks?] turns the wheel, one tick of deltaY every 16 ms
  if (s.wheel) {
    const [x, y, dy, ticks = 1] = s.wheel
    for (let i = 0; i < ticks; i++) {
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy })
      await sleep(16)
    }
  }
  if (s.click) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: s.click[0], y: s.click[1], button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: s.click[0], y: s.click[1], button: 'left', clickCount: 1 })
  }
  await sleep(s.wait ?? 1200)
  if (s.out) {
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: s.quality ?? 72 })
    if (shot.result?.data) {
      writeFileSync(join(outDir, s.out), Buffer.from(shot.result.data, 'base64'))
      console.log('saved', s.out)
    } else console.log('FAILED', s.out, JSON.stringify(shot).slice(0, 300))
  }
}
if (logs.length) console.log('--- console ---\n' + [...new Set(logs)].slice(0, 30).join('\n'))
await shutdown()
process.exit(0)
