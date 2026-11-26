// Development aid: records a phone's opening tour (Home's hero, src/sections/Hero.tsx) as a film the scroll plays, for
// where there is no 3D (the fallback: HeroFilm). Headless Edge at a phone's size draws the real stage; for each step of
// the tour (screens, `window.__tourAt`, set exactly, no easing) the page waits for the stage to settle and the screen is
// taken whole, the ground's yellow and its wash into white with it, the words hidden. Frames go to ffmpeg as an H.264
// MP4 with a keyframe every few frames (a film to seek in, both ways, not to play), and the first frame as its poster.
//
//   GPU=1 node scripts/tour-film.mjs [url] [out.mp4] [--per 48] [--to 3.9] [--crf 23] [--settle 24]
//
// --per: frames a screen of tour; --to: where the tour ends (screens: all white by 3.85, HANDOFF.at in Hero.tsx);
// --settle: frames drawn between two taken, for the camera's own easing to come to rest (StageScene).
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
const url = pos[0] ?? 'http://localhost:5180/?lite=0'
const out = pos[1] ?? 'public/video/tour/tour.mp4'
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? def : args[i + 1]
}
const per = Number(opt('per', 48))
const to = Number(opt('to', 3.9))
const crf = Number(opt('crf', 23))
const settle = Number(opt('settle', 24))
const width = 375
const height = 812
const dpr = 2

const port = 9300 + Math.floor(Math.random() * 500)
const profile = mkdtempSync(join(tmpdir(), 'edge-tour-'))
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
// (the stage drawn at the screen's own two pixels to the CSS pixel, sharper than a phone's own 1.5)
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__filmDpr = ${dpr}` })
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Page.navigate', { url })
let ready = false
for (let i = 0; i < 160 && !ready; i++) {
  await sleep(500)
  ready = await evaluate("Boolean(window.__stage) && !document.getElementById('opener') && !!document.querySelector('.stage canvas')").catch(() => false)
}
if (!ready) {
  console.error('the page never came ready\n' + logs.join('\n'))
  await shutdown()
  process.exit(1)
}

// the words, the header and everything but the ground and the stage hidden; the tour held at its start
await evaluate(`(() => {
  const s = document.createElement('style')
  s.textContent = '#root * { visibility: hidden !important; } #root .ground, #root .ground *, #root .stage, #root .stage * { visibility: visible !important; } #root ~ * { visibility: hidden !important; }'
  document.head.append(s)
  window.scrollTo(0, 0)
  window.__tourAt = 0
  window.dispatchEvent(new Event('scroll'))
  return true
})()`)
// (the opening's weave, out of the film)
await sleep(4000)

const frames = Math.round(to * per) + 1
console.log(`${url}: ${frames} frames (0 to ${to} screens, ${per} a screen), ${width * dpr}x${height * dpr}`)
const ff = spawn(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    // (sought in, both ways, by the scroll: a keyframe every four frames and none from the future, so any frame is at most
    // three decodes from one)
    '-g', '4', '-bf', '0', '-movflags', '+faststart', '-an',
    out,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
)
const t0 = Date.now()
let first = null
for (let f = 0; f < frames; f++) {
  const at = Math.min(to, f / per)
  await evaluate(`new Promise((done) => {
    window.__tourAt = ${at}
    window.dispatchEvent(new Event('scroll'))
    let n = 0
    const step = () => (++n >= ${settle} ? done(true) : requestAnimationFrame(step))
    requestAnimationFrame(step)
  })`)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const buf = Buffer.from(shot.result.data, 'base64')
  if (f === 0) first = buf
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
  if (f % 12 === 0) process.stdout.write(`\r  frame ${f}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)} s   `)
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
