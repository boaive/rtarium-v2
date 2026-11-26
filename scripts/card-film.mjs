// Development aid: records a phone card of Home (About, Innovation, Tech Space: a row's figure, drawn by StageScene) as
// the film that stands in for it where there is no 3D (the fallback, Chapter.tsx `CardFilm`). Headless Edge at a phone's
// size draws the real stage; the card's own clock is set a frame at a time (`window.__cardAt`, s since it was reached),
// so the film moves exactly as the 3D card does: its turn at its own pace, its sway, its mortar running in. The card's
// canvas is read straight off the page, its ground painted under it.
//
//   GPU=1 node scripts/card-film.mjs <row id> <out.mp4> [--len s] [--fps n] [--crf n] [--flat] [--thickness mm]
//
// --len: the film's length; a whole turn (360 / the card's spin) or sway makes a seamless loop. An opening (the mortar
// running in) is part of the length: the page loops the film back to where it ends (CardFilm, `from`).
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const row = args[0]
const out = args[1]
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? def : args[i + 1]
}
const len = Number(opt('len', 180))
const fps = Number(opt('fps', 15))
const crf = Number(opt('crf', 22))
const flat = args.includes('--flat')
const thickness = opt('thickness', '')
const url = opt('url', 'http://localhost:5180/?lite=0')
if (!row || !out) {
  console.error('usage: node scripts/card-film.mjs <row id> <out.mp4> [--len s] [--fps n] [--crf n] [--flat] [--thickness mm]')
  process.exit(2)
}
const width = 375
const height = 812

const port = 9300 + Math.floor(Math.random() * 500)
const profile = mkdtempSync(join(tmpdir(), 'edge-card-'))
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
    `--window-size=${width},${height}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws
async function shutdown() {
  try {
    ws?.close()
  } catch {}
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' })
  else edge.kill('SIGKILL')
}
process.on('uncaughtException', async (e) => {
  console.error(e)
  await shutdown()
  process.exit(1)
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
  } else if (msg.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 600))
  else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') logs.push('[error] ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400))
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id
    pending.set(n, res)
    ws.send(JSON.stringify({ id: n, method, params }))
  })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600))
  return r.result?.result?.value
}

await send('Page.enable')
await send('Runtime.enable')
// (drawn at twice the CSS pixel, sharper than a phone's own 1.5)
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__filmDpr = 2' })
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Page.navigate', { url })
let ready = false
for (let i = 0; i < 160 && !ready; i++) {
  await sleep(500)
  ready = await evaluate("Boolean(window.__stage) && !document.getElementById('opener') && !!document.querySelector('canvas.eb-fig__canvas')").catch(() => false)
}
if (!ready) {
  console.error('the page never came ready\n' + logs.join('\n'))
  await shutdown()
  process.exit(1)
}

// the row brought to the top of the screen (its figure the one in view, and a card that fades on as its section arrives,
// Non-Corrosive, shown); the comparison and the thickness set if asked
const size = await evaluate(`(async () => {
  window.__cardAt = 0;
  ${thickness ? `;(await import('/src/three/stageStore.ts')).setShared({ thickness: ${Number(thickness)} });` : ''}
  const row = document.getElementById(${JSON.stringify(row)})
  window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY)
  await new Promise((r) => setTimeout(r, 3000))
  // (Monolithic plays its comparison as it is reached, a flat mesh for a moment and then RTARIUM: the flat mesh is set
  // after it, and held)
  ${flat ? 'window.__stage.stage.flat = 1; await new Promise((r) => setTimeout(r, 3000));' : ''}
  const c = row.querySelector('canvas.eb-fig__canvas')
  return [c.width, c.height]
})()`)
// (a film's sides must be even)
const [cw, ch] = size.map((n) => n - (n % 2))
const frames = Math.round(len * fps)
console.log(`${row}: ${frames} frames (${len} s at ${fps} fps), ${cw}x${ch}`)

const ff = spawn(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-g', String(fps * 4), '-bf', '3', '-movflags', '+faststart', '-an',
    out,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
)
const t0 = Date.now()
let first = null
for (let f = 0; f < frames; f++) {
  const data = await evaluate(`new Promise((done) => {
    window.__cardAt = ${f / fps}
    let n = 0
    const step = () => {
      if (++n < 3) return requestAnimationFrame(step)
      const row = document.getElementById(${JSON.stringify(row)})
      const c = row.querySelector('canvas.eb-fig__canvas')
      const v = row.querySelector('.eb-fig__view')
      let e = v
      let bg = 'rgb(242, 240, 233)'
      while (e) {
        const b = getComputedStyle(e).backgroundColor
        if (b !== 'rgba(0, 0, 0, 0)') { bg = b; break }
        e = e.parentElement
      }
      const o = (window.__filmOut ??= document.createElement('canvas'))
      o.width = ${cw}
      o.height = ${ch}
      const g = o.getContext('2d')
      g.fillStyle = bg
      g.fillRect(0, 0, o.width, o.height)
      g.drawImage(c, 0, 0)
      done(o.toDataURL('image/png'))
    }
    requestAnimationFrame(step)
  })`)
  const buf = Buffer.from(String(data).replace(/^data:image\/png;base64,/, ''), 'base64')
  if (f === 0) first = buf
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
  if (f % 60 === 0) process.stdout.write(`\r  frame ${f}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)} s   `)
}
ff.stdin.end()
await new Promise((r) => ff.on('close', r))
const poster = out.replace(/\.mp4$/, '.jpg')
const pf = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'png_pipe', '-i', '-', '-q:v', '3', poster], { stdio: ['pipe', 'inherit', 'inherit'] })
pf.stdin.end(first)
await new Promise((r) => pf.on('close', r))
console.log(`\nsaved ${out} and ${poster}`)
if (logs.length) console.log('--- console ---\n' + [...new Set(logs)].slice(0, 20).join('\n'))
await shutdown()
process.exit(0)
