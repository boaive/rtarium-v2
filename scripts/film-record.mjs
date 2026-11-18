// Development aid: records a dev film page (src/dev/FilmCard.tsx) frame by frame in headless Edge, piping each frame
// into ffmpeg as a looping H.264 MP4 for phones, with its first frame as the poster (JPEG).
//
//   node scripts/film-record.mjs <url> <out.mp4> [--size 300x400] [--dpr 2.7] [--fps 24] [--crf 28]
//
// The page sets window.__cardFilm = { ready(), frame(seconds), length, warm }: the opening is played through `warm`
// seconds without recording, then `length` seconds are recorded, each frame the same step of time apart however long it
// takes to draw. GPU=1 draws on the machine's graphics card (much faster); default is SwiftShader.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const url = args[0]
const out = args[1]
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? def : args[i + 1]
}
const [width, height] = opt('size', '300x400').split('x').map(Number)
const dpr = Number(opt('dpr', 2.7))
const fps = Number(opt('fps', 24))
const crf = Number(opt('crf', 28))
if (!url || !out) {
  console.error('usage: node scripts/film-record.mjs <url> <out.mp4> [--size WxH] [--dpr N] [--fps N] [--crf N]')
  process.exit(2)
}

const port = 9300 + Math.floor(Math.random() * 500)
const profile = mkdtempSync(join(tmpdir(), 'edge-film-'))
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
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: true })
await send('Page.navigate', { url })
let ready = false
for (let i = 0; i < 120 && !ready; i++) {
  await sleep(500)
  ready = await evaluate('Boolean(window.__cardFilm && window.__cardFilm.ready())').catch(() => false)
}
if (!ready) {
  console.error('the film page never came ready\n' + logs.join('\n'))
  await shutdown()
  process.exit(1)
}
// (the models' openings start half a second after they are made, on the wall clock)
await sleep(2500)
const { length, warm } = await evaluate('({ length: window.__cardFilm.length, warm: window.__cardFilm.warm })')
const frames = Math.round(length * fps)
// (a loop is seamless only if it is a whole number of frames)
if (Math.abs(frames - length * fps) > 1e-6) console.warn(`! ${length} s is not a whole number of frames at ${fps} fps: pick another --fps`)
console.log(`${url}: warm ${warm} s, then ${frames} frames (${length} s at ${fps} fps), ${width * dpr}x${height * dpr}`)

// the opening, played through unrecorded
for (let f = 0; f < Math.round(warm * fps); f++) await evaluate(`window.__cardFilm.frame(${f / fps})`)

const ff = spawn(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    // (a keyframe every 10 s: the turn is slow, so few are needed, and each costs as much as many frames between)
    '-g', String(fps * 10), '-bf', '3', '-movflags', '+faststart', '-an',
    out,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
)
const t0 = Date.now()
let first = null
for (let f = 0; f < frames; f++) {
  // (read off the canvas in the page, the ground painted under it: a page screenshot took a second or more a frame)
  const data = await evaluate(`window.__cardFilm.frame(${warm + f / fps}, true)`)
  const buf = Buffer.from(String(data).replace(/^data:image\/png;base64,/, ''), 'base64')
  if (f === 0) first = buf
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
  if (f % 60 === 0) process.stdout.write(`\r  frame ${f}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)} s   `)
}
ff.stdin.end()
await new Promise((r) => ff.on('close', r))
// the poster: the film's first frame, shown until the film can play
const poster = out.replace(/\.mp4$/, '.jpg')
const pf = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'png_pipe', '-i', '-', '-q:v', '4', poster], { stdio: ['pipe', 'inherit', 'inherit'] })
pf.stdin.end(first)
await new Promise((r) => pf.on('close', r))
console.log(`\nsaved ${out} and ${poster}`)
if (logs.length) console.log('--- console ---\n' + [...new Set(logs)].slice(0, 20).join('\n'))
await shutdown()
process.exit(0)
