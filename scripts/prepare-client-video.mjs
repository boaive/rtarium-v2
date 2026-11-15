// H1: keep the supplied 13.44-second shot; frame its centre at 16:9 for the existing In concrete inset.
// FFmpeg applies the source's rotation metadata before cropping. Audio is omitted for this silent loop.
import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const output = 'public/video/client'
mkdirSync(output, { recursive: true })
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`FFmpeg failed: ${result.error ?? result.status}`)
}
ffmpeg(['-i', 'assets/RTARIUM CLIPS/RTARIUM/H1.MP4', '-map', '0:v:0', '-vf', 'crop=iw:trunc(iw*9/16/2)*2:0:(ih-oh)/2,scale=960:540,setsar=1,fps=25', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', `${output}/h1.mp4`])
ffmpeg(['-i', `${output}/h1.mp4`, '-vf', 'scale=640:360,setsar=1', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', `${output}/h1-sm.mp4`])
ffmpeg(['-ss', '0', '-i', `${output}/h1.mp4`, '-frames:v', '1', '-q:v', '3', '-update', '1', `${output}/h1.jpg`])
