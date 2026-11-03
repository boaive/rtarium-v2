import { createContext, useContext, useId, type ReactNode } from 'react'

/**
 * The panels' drawings for the technical sheets, drawn from the client's figures in the manner of
 * the client's own sketches (section, plan, the tie plate): ink on the sheet's ground, concrete
 * stippled, the core in its triangle hatch, RTARIUM as its woven line. Only supplied dimensions
 * are printed.
 */

const INK = 'var(--black)'
const MESH = '#8c6945'

/**
 * Each drawing's own ids for its patterns and ticks: a sheet that is closed is not drawn, and a
 * pattern found inside it (the first of an id in the page) would draw nothing in another sheet.
 */
const Ids = createContext('wp')
const idsOf = (k: string) => ({ k, stip: `${k}-stip`, core: `${k}-core`, tick: `${k}-tick` })
const useIds = () => idsOf(useContext(Ids))
/** a drawing's own prefix, made by the drawing and handed to its svg */
const usePrefix = () => idsOf(`wp${useId().replace(/[^a-zA-Z0-9]/g, '')}`)
function Drawing({ k, children, narrow = false, ...svg }: { k: string; children: ReactNode; narrow?: boolean; viewBox: string; 'aria-label': string }) {
  return (
    <Ids.Provider value={k}>
      <svg className={`wp-dg ${narrow ? 'wp-dg--narrow' : ''}`} role="img" {...svg}>
        <Defs />
        {children}
      </svg>
    </Ids.Provider>
  )
}

function Defs() {
  const id = useIds()
  return (
    <defs>
      <pattern id={id.stip} width="9" height="9" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.7" fill={INK} opacity="0.55" />
        <circle cx="6.5" cy="5" r="0.5" fill={INK} opacity="0.45" />
        <circle cx="3.5" cy="7.6" r="0.45" fill={INK} opacity="0.4" />
      </pattern>
      <pattern id={id.core} width="22" height="19" patternUnits="userSpaceOnUse">
        <path d="M0 19 L11 0 L22 19 M0 0 H22" fill="none" stroke={INK} strokeWidth="0.6" opacity="0.5" />
      </pattern>
      <marker id={id.tick} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto">
        <path d="M2 8 L8 2" stroke={INK} strokeWidth="1.4" />
      </marker>
    </defs>
  )
}

/** a dimension: a line between two points with ticks, its figure beside it */
function Dim({ x1, y1, x2, y2, text, dx = 0, dy = -6, anchor = 'middle' }: { x1: number; y1: number; x2: number; y2: number; text: string; dx?: number; dy?: number; anchor?: 'start' | 'middle' | 'end' }) {
  const id = useIds()
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth="0.8" markerStart={`url(#${id.tick})`} markerEnd={`url(#${id.tick})`} />
      <text x={(x1 + x2) / 2 + dx} y={(y1 + y2) / 2 + dy} textAnchor={anchor} className="wp-dg__num">
        {text}
      </text>
    </g>
  )
}

/** a leader from a point to its words */
function Note({ x, y, tx, ty, children, anchor = 'start' }: { x: number; y: number; tx: number; ty: number; children: ReactNode; anchor?: 'start' | 'end' }) {
  return (
    <g>
      <circle cx={x} cy={y} r="2.2" fill={INK} />
      <polyline points={`${x},${y} ${tx},${ty} ${tx + (anchor === 'start' ? 8 : -8)},${ty}`} fill="none" stroke={INK} strokeWidth="0.8" />
      <text x={tx + (anchor === 'start' ? 12 : -12)} y={ty + 4} textAnchor={anchor} className="wp-dg__note">
        {children}
      </text>
    </g>
  )
}

/** RTARIUM in section: its two faces and the fibres looping between them */
function MeshLine({ x0, x1, y0, y1 }: { x0: number; x1: number; y0: number; y1: number }) {
  const step = 9
  let d = `M${x0} ${y0}`
  for (let y = y0, i = 0; y < y1; y += step, i++) d += ` L${i % 2 ? x0 : x1} ${Math.min(y1, y + step)}`
  return (
    <g stroke={MESH} fill="none">
      <line x1={x0} y1={y0} x2={x0} y2={y1} strokeWidth="1.6" />
      <line x1={x1} y1={y0} x2={x1} y2={y1} strokeWidth="1.6" />
      <path d={d} strokeWidth="0.9" />
    </g>
  )
}

/** the break across a drawing's middle */
function Break({ x0, x1, y }: { x0: number; x1: number; y: number }) {
  return <path d={`M${x0 - 10} ${y} H${(x0 + x1) / 2 - 6} l4 -7 l4 14 l4 -7 H${x1 + 10}`} fill="none" stroke={INK} strokeWidth="0.8" />
}

/**
 * The 30 mm solid panel in section, as the client draws it (30mm PANEL - SECTION): 7.5 cover | 15 RTARIUM | 7.5
 * cover, a 3 mm GRP rod down the middle of the RTARIUM and the rods across it every 600 mm; the 15 mm tongue at
 * the top end (15 mm at its root, 6 mm at its tip) and the 15 mm recess at the foot; a ferrule insert. The middle
 * of its length is broken out. 4 px to the mm through it.
 */
export function Section30() {
  const id = usePrefix()
  const k = 4
  const x0 = 150
  const at = (mm: number) => x0 + mm * k
  const top = 90
  const brk = 270
  const foot = 450
  const T = 15 * k
  // the outline: the tongue on top (its root the RTARIUM zone, 7.5 to 22.5; its tip 12 to 18), the recess at the foot
  const outline = `M${at(0)} ${top} H${at(7.5)} L${at(12)} ${top - T} H${at(18)} L${at(22.5)} ${top} H${at(30)} V${foot} H${at(22.5)} L${at(18)} ${foot - T} H${at(12)} L${at(7.5)} ${foot} H${at(0)} Z`
  return (
    <Drawing k={id.k} viewBox="0 0 540 520" aria-label="Section through the 30 mm solid panel: 7.5 mm concrete cover, 15 mm RTARIUM with a 3 mm GRP rod in its middle and rods across every 600 mm, 7.5 mm concrete cover; a 15 mm tapered tongue at one end and a 15 mm recess at the other; a ferrule insert">
      <path d={outline} fill={`url(#${id.stip})`} stroke={INK} strokeWidth="1.3" />
      <rect x={at(0) - 2} y={brk - 14} width={30 * k + 4} height={28} fill="var(--white)" />
      <Break x0={at(0)} x1={at(30)} y={brk - 9} />
      <Break x0={at(0)} x1={at(30)} y={brk + 9} />
      <MeshLine x0={at(7.5)} x1={at(22.5)} y0={top + 6} y1={brk - 16} />
      <MeshLine x0={at(7.5)} x1={at(22.5)} y0={brk + 16} y1={foot - T - 4} />
      {/* the GRP rod along the length, and the ones across it */}
      {[
        [top - T + 10, brk - 16],
        [brk + 16, foot - T],
      ].map(([y0, y1]) => (
        <rect key={y0} x={at(13.5)} y={y0} width={3 * k} height={y1 - y0} fill={INK} opacity="0.75" />
      ))}
      {[150, 210, 380].map((y) => (
        <circle key={y} cx={at(15)} cy={y} r={4} fill={INK} />
      ))}
      {/* a ferrule insert, through to the inner face */}
      <rect x={at(13)} y={340} width={17 * k} height={6} fill={INK} />
      <Dim x1={at(0)} y1={34} x2={at(7.5)} y2={34} text="7.5" />
      <Dim x1={at(7.5)} y1={34} x2={at(22.5)} y2={34} text="15" />
      <Dim x1={at(22.5)} y1={34} x2={at(30)} y2={34} text="7.5" />
      <Dim x1={at(0)} y1={492} x2={at(30)} y2={492} text="30" dy={16} />
      <Dim x1={at(-10)} y1={top - T} x2={at(-10)} y2={top} text="15" dx={-8} dy={4} anchor="end" />
      <Dim x1={at(-10)} y1={foot - T} x2={at(-10)} y2={foot} text="15" dx={-8} dy={4} anchor="end" />
      <Dim x1={at(-24)} y1={150} x2={at(-24)} y2={210} text="600" dx={-8} dy={4} anchor="end" />
      <Note x={at(15)} y={top - T + 4} tx={330} ty={top - 40}>
        Male: 15 mm tongue, 6 mm tip
      </Note>
      <Note x={at(21)} y={120} tx={330} ty={112}>
        15 mm RTARIUM
      </Note>
      <Note x={at(15)} y={180} tx={330} ty={168}>
        3 mm GRP rods
      </Note>
      <Note x={at(27)} y={230} tx={330} ty={224}>
        7.5 mm concrete cover
      </Note>
      <Note x={at(26)} y={343} tx={330} ty={330}>
        Ferrule insert, for fixing
      </Note>
      <Note x={at(15)} y={foot - 6} tx={330} ty={foot - 4}>
        Female: 15 mm recess
      </Note>
    </Drawing>
  )
}

/**
 * The 100 mm SIP panel in section, as the client's sketch: 7 + 6 RTARIUM + 2 | 70 EPS/SPS | 2 + 6
 * RTARIUM + 7, the core 20 mm proud at the top and 20 mm short at the foot, a tie-clip through it.
 * 3 px to the mm.
 */
export function Section100() {
  const id = usePrefix()
  const k = 3
  const x0 = 70
  const at = (mm: number) => x0 + mm * k
  const top = 90
  const brk = 270
  const foot = 450
  const R = 20 * k
  const rods = [at(7 + 3), at(100 - 7 - 3)]
  return (
    <Drawing k={id.k} viewBox="0 0 560 520" aria-label="Section through the 100 mm SIP insulated panel: 7 mm cover, 6 mm RTARIUM, 2 mm cover, 70 mm EPS/SPS core, 2 mm cover, 6 mm RTARIUM, 7 mm cover; the core 20 mm proud at the top and recessed 20 mm at the foot; a GI tie-clip through the core held by 3 mm GRP rods">
      {/* the two leaves */}
      <rect x={at(0)} y={top} width={15 * k} height={foot - top} fill={`url(#${id.stip})`} stroke={INK} strokeWidth="1.3" />
      <rect x={at(85)} y={top} width={15 * k} height={foot - top} fill={`url(#${id.stip})`} stroke={INK} strokeWidth="1.3" />
      {/* the core, stay-in-place: proud at the top, short at the foot */}
      <rect x={at(15)} y={top - R} width={70 * k} height={foot - top} fill={`url(#${id.core})`} stroke={INK} strokeWidth="1.3" />
      <rect x={at(15)} y={foot - R} width={70 * k} height={R} fill="var(--white)" stroke={INK} strokeWidth="0.8" strokeDasharray="3 3" />
      <rect x={at(0) - 2} y={brk - 14} width={100 * k + 4} height={28} fill="var(--white)" />
      <Break x0={at(0)} x1={at(100)} y={brk - 9} />
      <Break x0={at(0)} x1={at(100)} y={brk + 9} />
      <MeshLine x0={at(7)} x1={at(13)} y0={top + 6} y1={brk - 16} />
      <MeshLine x0={at(87)} x1={at(93)} y0={top + 6} y1={brk - 16} />
      <MeshLine x0={at(7)} x1={at(13)} y0={brk + 16} y1={foot - 6} />
      <MeshLine x0={at(87)} x1={at(93)} y0={brk + 16} y1={foot - 6} />
      {/* a GI tie-clip through the core, its lugs at the meshes, a GRP rod through each */}
      <rect x={at(7)} y={360} width={86 * k} height={2 * k} fill={INK} />
      {rods.map((x) => (
        <circle key={x} cx={x} cy={363} r={1.5 * k + 1} fill="var(--white)" stroke={INK} strokeWidth="1.2" />
      ))}
      <Dim x1={at(0)} y1={30} x2={at(15)} y2={30} text="15" />
      <Dim x1={at(15)} y1={30} x2={at(85)} y2={30} text="70" />
      <Dim x1={at(85)} y1={30} x2={at(100)} y2={30} text="15" />
      <Dim x1={at(0)} y1={490} x2={at(100)} y2={490} text="100" dy={16} />
      <Dim x1={at(85) + 20} y1={top - R} x2={at(85) + 20} y2={top} text="20" dx={8} dy={4} anchor="start" />
      <Note x={at(50)} y={top - R + 8} tx={420} ty={70}>
        Male: core 20 mm proud
      </Note>
      <Note x={at(98)} y={140} tx={420} ty={120}>
        7 mm cover
      </Note>
      <Note x={at(90)} y={180} tx={420} ty={160}>
        6 mm RTARIUM
      </Note>
      <Note x={at(86)} y={220} tx={420} ty={200}>
        2 mm cover
      </Note>
      <Note x={at(50)} y={310} tx={420} ty={300}>
        70 mm EPS/SPS, stay-in-place
      </Note>
      <Note x={at(60)} y={363} tx={420} ty={350}>
        GI tie-clip, 2 mm plate
      </Note>
      <Note x={rods[1]} y={363} tx={420} ty={390}>
        3 mm GRP rod
      </Note>
      <Note x={at(50)} y={foot - 8} tx={420} ty={foot}>
        Female: 20 mm recess
      </Note>
    </Drawing>
  )
}

/**
 * A panel in plan, its face, as the client's plans draw it. The solid panel (30mm PANEL - PLAN, a 3.6 m panel): its
 * GRP grid (four rods along, 120 mm apart; one across every 600 mm), its ferrule inserts (1000 mm from each end,
 * 100 mm in) and tie holes (200 mm from each end, 150 mm in). The SIP panel (100mm PANEL - PLAN, a 3.7 m panel):
 * its tie-clips (100 mm in, 100 / 800 along), and the ferrules and tie holes as the solid panel's.
 */
export function PanelPlan({ kind }: { kind: 'solid' | 'sip' }) {
  const id = usePrefix()
  const L = kind === 'solid' ? 3600 : 3700
  const k = 0.16
  const x0 = 34
  const y0 = 50
  const sy = 0.2
  const h = 600 * sy
  const X = (x: number) => x0 + x * k
  const Y = (y: number) => y0 + y * sy
  const ferrules = [1000, L - 1000].flatMap((x) => [100, 500].map((y) => [x, y]))
  const ties = [200, L - 200].flatMap((x) => [150, 450].map((y) => [x, y]))
  const across = Array.from({ length: Math.floor((L - 50) / 600) }, (_, i) => (i + 1) * 600).filter((x) => x < L - 50)
  const clips: number[] = []
  for (let m = 0; m < L / 1000; m++) for (const x of [m * 1000 + 100, m * 1000 + 900]) if (x < L - 50) clips.push(x)
  return (
    <Drawing
      k={id.k}
      viewBox="0 0 680 230"
      aria-label={
        kind === 'solid'
          ? 'Plan of a 3.6 m solid panel, 600 mm wide: GRP rods along it 120 mm apart and across it every 600 mm; ferrule inserts for fixing 1000 mm from each end and 100 mm in; 20 mm tie holes through it, to lift by, 200 mm from each end and 150 mm in'
          : 'Plan of a 3.7 m SIP panel, 600 mm wide: GI tie-clips on lines 100 mm in from each long edge, 100 mm and 800 mm apart along it; ferrule inserts and tie holes as in the solid panel'
      }
    >
      <rect x={X(0)} y={Y(0)} width={L * k} height={h} fill="none" stroke={INK} strokeWidth="1.3" />
      {kind === 'solid' ? (
        <>
          {[120, 240, 360, 480].map((y) => (
            <line key={y} x1={X(0)} x2={X(L)} y1={Y(y)} y2={Y(y)} stroke={MESH} strokeWidth="1.6" />
          ))}
          {across.map((x) => (
            <line key={x} x1={X(x)} x2={X(x)} y1={Y(0)} y2={Y(600)} stroke={MESH} strokeWidth="1.6" />
          ))}
        </>
      ) : (
        <>
          {[100, 500].map((y) => (
            <line key={y} x1={X(0)} x2={X(L)} y1={Y(y)} y2={Y(y)} stroke={MESH} strokeWidth="1.2" strokeDasharray="5 4" />
          ))}
          {clips.flatMap((x) => [100, 500].map((y) => <rect key={`${x}-${y}`} x={X(x) - 1} y={Y(y) - 10 * sy} width={2} height={20 * sy} fill={INK} />))}
        </>
      )}
      {ferrules.map(([x, y]) => (
        <circle key={`f${x}-${y}`} cx={X(x)} cy={Y(y)} r={4} fill="var(--white)" stroke={INK} strokeWidth="1.2" />
      ))}
      {ties.map(([x, y]) => (
        <circle key={`t${x}-${y}`} cx={X(x)} cy={Y(y)} r={4.6} fill={INK} />
      ))}
      <Dim x1={X(0)} y1={24} x2={X(L)} y2={24} text={`${L.toLocaleString('en-GB')} (example length)`} />
      <Dim x1={X(0)} y1={Y(600) + 24} x2={X(200)} y2={Y(600) + 24} text="200" dy={16} />
      <Dim x1={X(200)} y1={Y(600) + 24} x2={X(1000)} y2={Y(600) + 24} text="800" dy={16} />
      <Dim x1={X(L) + 18} y1={Y(0)} x2={X(L) + 18} y2={Y(600)} text="600" dx={8} dy={4} anchor="start" />
      <g>
        <circle cx={X(0) + 6} cy={214} r={4} fill="var(--white)" stroke={INK} strokeWidth="1.2" />
        <text x={X(0) + 16} y={218} className="wp-dg__note">
          Ferrule insert, fixing
        </text>
        <circle cx={X(0) + 166} cy={214} r={4.6} fill={INK} />
        <text x={X(0) + 176} y={218} className="wp-dg__note">
          Tie hole, 20 mm, lifting
        </text>
        <line x1={X(0) + 312} x2={X(0) + 334} y1={214} y2={214} stroke={MESH} strokeWidth="1.6" strokeDasharray={kind === 'sip' ? '5 4' : undefined} />
        <text x={X(0) + 342} y={218} className="wp-dg__note">
          {kind === 'solid' ? '3 mm GRP grid' : '3 mm GRP rod, with its tie-clips'}
        </text>
      </g>
    </Drawing>
  )
}

/** the GI tie-clip: the client's plate drawing (2 mm plate), 4 px to the mm */
export function TiePlate() {
  const id = usePrefix()
  const k = 4
  const cx = 280
  const cy = 95
  const hb = 38 * k
  const hw = 10 * k
  const lug = 5 * k
  return (
    <Drawing k={id.k} narrow viewBox="0 0 560 200" aria-label="The GI tie-clip: a 2 mm plate 76 mm long and 20 mm wide, 86 mm over its two lugs, a 7.5 by 5.4 mm hole in each lug">
      <path
        d={`M${cx - hb} ${cy - hw} H${cx + hb} V${cy - lug} A${lug} ${lug} 0 0 1 ${cx + hb} ${cy + lug} V${cy + hw} H${cx - hb} V${cy + lug} A${lug} ${lug} 0 0 1 ${cx - hb} ${cy - lug} Z`}
        fill="var(--white)"
        stroke={INK}
        strokeWidth="1.3"
      />
      {[cx - hb - 1, cx + hb + 1].map((x) => (
        <ellipse key={x} cx={x} cy={cy} rx={3.75 * k} ry={2.7 * k} fill="none" stroke={INK} strokeWidth="1" />
      ))}
      <Dim x1={cx - hb} y1={30} x2={cx + hb} y2={30} text="76" />
      <Dim x1={cx - hb - lug} y1={170} x2={cx + hb + lug} y2={170} text="86" dy={16} />
      <Dim x1={cx - hb - 40} y1={cy - hw} x2={cx - hb - 40} y2={cy + hw} text="20" dx={-8} dy={4} anchor="end" />
      <text x={cx} y={cy + 4} textAnchor="middle" className="wp-dg__note">
        2 mm GI plate
      </text>
    </Drawing>
  )
}

/* ---- the case studies' drawings --------------------------------------------------------------- */

/** the home's plan (40 px to the m): storey-high 100 mm SIP panels all round, light steel posts, the door and windows left in the panels; one open room */
export function HomePlan() {
  const id = usePrefix()
  const k = 40
  const x0 = 70
  const y0 = 40
  const W = 7.2 * k
  const D = 6.2 * k
  const t = 0.1 * k
  // the openings along each wall (m from its start)
  const front = [
    [1.2, 2.4],
    [3.0, 4.2],
    [4.8, 6.0],
  ]
  const back = [
    [1.8, 3.0],
    [4.2, 5.4],
  ]
  const side = [[2.5, 3.7]]
  const run = (holes: number[][], len: number) => {
    const out: [number, number][] = []
    let a = 0
    for (const [p, q] of holes) {
      out.push([a, p])
      a = q
    }
    out.push([a, len])
    return out
  }
  return (
    <Drawing k={id.k} narrow viewBox="0 0 560 360" aria-label="Plan of the home, 7.2 by 6.2 m: storey-high 100 mm SIP panels all round, light steel posts at the corners and the door, a door and five windows left in the panels, one open room">
      {run(back, 7.2).map(([a, b]) => (
        <rect key={`b${a}`} x={x0 + a * k} y={y0} width={(b - a) * k} height={t} fill={`url(#${id.core})`} stroke={INK} strokeWidth="1" />
      ))}
      {run(front, 7.2).map(([a, b]) => (
        <rect key={`f${a}`} x={x0 + a * k} y={y0 + D - t} width={(b - a) * k} height={t} fill={`url(#${id.core})`} stroke={INK} strokeWidth="1" />
      ))}
      {[0, W - t].flatMap((x) =>
        run(side, 6.2).map(([a, b]) => (
          <rect key={`s${x}-${a}`} x={x0 + x} y={y0 + Math.max(0.1, a) * k} width={t} height={(Math.min(6.1, b) - Math.max(0.1, a)) * k} fill={`url(#${id.core})`} stroke={INK} strokeWidth="1" />
        )),
      )}
      {[...back, ...front].map(([a, b], i) => (
        <line key={`o${i}`} x1={x0 + a * k} x2={x0 + b * k} y1={i < back.length ? y0 + t / 2 : y0 + D - t / 2} y2={i < back.length ? y0 + t / 2 : y0 + D - t / 2} stroke={INK} strokeWidth="0.8" />
      ))}
      {side.flatMap(([a, b]) =>
        [t / 2, W - t / 2].map((x) => <line key={`w${x}`} x1={x0 + x} x2={x0 + x} y1={y0 + a * k} y2={y0 + b * k} stroke={INK} strokeWidth="0.8" />),
      )}
      {[
        [t / 2, t / 2],
        [W - t / 2, t / 2],
        [t / 2, D - t / 2],
        [W - t / 2, D - t / 2],
        [3.0 * k, D - t / 2],
        [4.2 * k, D - t / 2],
      ].map(([x, y], i) => (
        <rect key={`p${i}`} x={x0 + x - 3} y={y0 + y - 3} width={6} height={6} fill={INK} />
      ))}
      <path d={`M ${x0 + 3.0 * k} ${y0 + D - t} A ${1.2 * k} ${1.2 * k} 0 0 1 ${x0 + 4.2 * k} ${y0 + D - t - 1.2 * k}`} fill="none" stroke={INK} strokeWidth="0.7" strokeDasharray="3 3" />
      <Dim x1={x0} y1={y0 + D + 30} x2={x0 + W} y2={y0 + D + 30} text="7.2 m" dy={16} />
      <Dim x1={x0 - 30} y1={y0} x2={x0 - 30} y2={y0 + D} text="6.2 m" dx={-8} dy={4} anchor="end" />
      <Note x={x0 + 0.6 * k} y={y0 + t} tx={x0 + W + 24} ty={y0 + 16}>
        100 mm SIP, storey-high
      </Note>
      <Note x={x0 + W - t / 2} y={y0 + D - t / 2} tx={x0 + W + 24} ty={y0 + D - 30}>
        Light steel post
      </Note>
      <Note x={x0 + 3.6 * k} y={y0 + D - t} tx={x0 + W + 24} ty={y0 + D / 2}>
        Door left in the panels
      </Note>
    </Drawing>
  )
}

/** the hub's front in elevation: six 5.8 m bays, 100 mm SIP to the docks' head at 4.8 m, 30 mm solid to the 9 m eaves, four dock doors */
export function ShedElevation() {
  const id = usePrefix()
  const k = 13
  const x0 = 30
  const base = 200
  const bay = 5.8 * k
  const zone = 4.8 * k
  const eaves = 9 * k
  const n = 6
  return (
    <Drawing k={id.k} narrow viewBox="0 0 560 250" aria-label="The hub's front in elevation: six 5.8 m bays; 100 mm SIP courses up to the docks' head at 4.8 m, 30 mm solid courses up to the 9 m eaves; four dock doors, 3 by 3.6 m">
      <rect x={x0} y={base - zone} width={bay * n} height={zone} fill={`url(#${id.core})`} stroke={INK} strokeWidth="1" />
      <rect x={x0} y={base - eaves} width={bay * n} height={eaves - zone} fill={`url(#${id.stip})`} stroke={INK} strokeWidth="1" />
      {Array.from({ length: 15 }, (_, c) => (
        <line key={c} x1={x0} x2={x0 + bay * n} y1={base - c * 0.6 * k} y2={base - c * 0.6 * k} stroke={INK} strokeWidth="0.4" opacity="0.5" />
      ))}
      {Array.from({ length: n + 1 }, (_, i) => (
        <line key={i} x1={x0 + i * bay} x2={x0 + i * bay} y1={base} y2={base - eaves - 8} stroke={INK} strokeWidth="1.6" />
      ))}
      {[1, 2, 3, 4].map((i) => (
        <rect key={i} x={x0 + i * bay + bay / 2 - 1.5 * k} y={base - 3.6 * k} width={3 * k} height={3.6 * k} fill="var(--white)" stroke={INK} strokeWidth="1" />
      ))}
      <line x1={x0 - 8} x2={x0 + bay * n + 8} y1={base - zone} y2={base - zone} stroke={INK} strokeWidth="1.2" strokeDasharray="6 4" />
      <Dim x1={x0} y1={base + 22} x2={x0 + bay} y2={base + 22} text="5.8 m" dy={16} />
      <Dim x1={x0 + bay * n + 20} y1={base} x2={x0 + bay * n + 20} y2={base - eaves} text="9 m" dx={8} dy={4} anchor="start" />
      <Dim x1={x0 + bay * n + 50} y1={base} x2={x0 + bay * n + 50} y2={base - zone} text="4.8 m" dx={8} dy={4} anchor="start" />
      <text x={x0 + bay / 2} y={base - zone / 2 + 4} textAnchor="middle" className="wp-dg__note">
        100 mm SIP
      </text>
      <text x={x0 + bay * 3} y={base - zone - (eaves - zone) / 2 + 4} textAnchor="middle" className="wp-dg__note">
        30 mm solid
      </text>
      <text x={x0 + bay * 1.5} y={base - 1.6 * k} textAnchor="middle" className="wp-dg__note">
        Dock door
      </text>
    </Drawing>
  )
}

/** a storey of the RC frame's infill in section: slab, five SIP courses to the beam's soffit, a window band, the movement joint */
export function InfillSection() {
  const id = usePrefix()
  const k = 70
  const x = 210
  const top = 30
  const H = 3.45 * k
  const beam = 0.45 * k
  const slab = 0.15 * k
  const t = 0.1 * k
  const course = (c: number) => top + H - (c + 1) * 0.6 * k
  return (
    <Drawing k={id.k} narrow viewBox="0 0 560 300" aria-label="A storey of the RC frame's infill in section: five 600 mm SIP courses from the slab to the beam's soffit, 3 m; a window band from 1.2 to 2.4 m; a sealed movement joint under the beam">
      <rect x={x - 120} y={top} width={160} height={beam} fill={`url(#${id.stip})`} stroke={INK} strokeWidth="1.2" />
      <rect x={x - 160} y={top + H} width={200} height={slab} fill={`url(#${id.stip})`} stroke={INK} strokeWidth="1.2" />
      {[0, 1, 4].map((c) => (
        <rect key={c} x={x} y={course(c)} width={t} height={0.6 * k} fill={`url(#${id.core})`} stroke={INK} strokeWidth="1" />
      ))}
      <rect x={x + 2} y={course(3)} width={t - 4} height={1.2 * k} fill="none" stroke={INK} strokeWidth="1" strokeDasharray="3 3" />
      <rect x={x} y={top + beam} width={t} height={4} fill="var(--white)" stroke={INK} strokeWidth="0.8" />
      <Note x={x + t / 2} y={top + beam + 2} tx={x + 120} ty={top + beam - 6}>
        Sealed movement joint
      </Note>
      <Note x={x + t} y={course(3) + 0.6 * k} tx={x + 120} ty={course(3) + 0.6 * k}>
        Window band, 1.2 to 2.4 m
      </Note>
      <Note x={x + t} y={course(0) + 0.3 * k} tx={x + 120} ty={course(0) + 0.3 * k}>
        100 mm SIP courses, 600 mm
      </Note>
      <text x={x - 40} y={top + beam / 2 + 4} textAnchor="middle" className="wp-dg__note">
        Beam
      </text>
      <text x={x - 80} y={top + H + slab / 2 + 4} textAnchor="middle" className="wp-dg__note">
        Slab
      </text>
      <Dim x1={x - 190} y1={top} x2={x - 190} y2={top + H} text="3.45 m" dx={-8} dy={4} anchor="end" />
      <Dim x1={x + t + 40} y1={top + beam} x2={x + t + 40} y2={top + H} text="3 m" dx={8} dy={4} anchor="start" />
    </Drawing>
  )
}

/** a section across the steel portal's wall: the tapered column, the girts on it, the panels outside them, SIP to 3 m, solid to the 7.2 m eaves */
export function PortalSection() {
  const id = usePrefix()
  const k = 30
  const base = 260
  const x = 300
  const E = 7.2 * k
  const zone = 3 * k
  const g = 0.3 * k
  return (
    <Drawing k={id.k} narrow viewBox="0 0 560 290" aria-label="A section across the portal's wall: a tapered steel column, 300 mm at its base and 600 at the haunch; Z girts on its outer flange; the panels outside the girts, 100 mm SIP to 3 m and 30 mm solid to the 7.2 m eaves">
      <path d={`M ${x} ${base} L ${x} ${base - E} L ${x + 0.6 * k} ${base - E + 0.6 * k} L ${x + 0.3 * k} ${base} Z`} fill="none" stroke={INK} strokeWidth="1.4" />
      <path d={`M ${x} ${base - E} L ${x + 6 * k} ${base - E - 0.45 * k} M ${x + 0.6 * k} ${base - E + 0.6 * k} L ${x + 6 * k} ${base - E + 0.05 * k}`} fill="none" stroke={INK} strokeWidth="1.2" />
      {Array.from({ length: 5 }, (_, i) => base - (0.9 + i * 1.5) * k).map((y) => (
        <path key={y} d={`M ${x} ${y} h ${-g} M ${x - g} ${y} v -6 M ${x} ${y} v 6`} fill="none" stroke={INK} strokeWidth="1.4" />
      ))}
      <rect x={x - g - 0.1 * k} y={base - zone} width={0.1 * k} height={zone} fill={`url(#${id.core})`} stroke={INK} strokeWidth="1" />
      <rect x={x - g - 0.03 * k} y={base - E} width={0.03 * k} height={E - zone} fill={`url(#${id.stip})`} stroke={INK} strokeWidth="1" />
      <line x1={x - 90} x2={x + 6.5 * k} y1={base} y2={base} stroke={INK} strokeWidth="1.2" />
      <Dim x1={x - 120} y1={base} x2={x - 120} y2={base - E} text="7.2 m" dx={-8} dy={4} anchor="end" />
      <Dim x1={x - 80} y1={base} x2={x - 80} y2={base - zone} text="3 m" dx={-8} dy={4} anchor="end" />
      <Note x={x - g - 0.1 * k} y={base - 0.6 * k} tx={x - 170} ty={base - 0.4 * k} anchor="end">
        100 mm SIP
      </Note>
      <Note x={x - g - 0.03 * k} y={base - 5.6 * k} tx={x - 170} ty={base - 5.9 * k} anchor="end">
        30 mm solid
      </Note>
      <Note x={x - g / 2} y={base - 4.5 * k} tx={x + 70} ty={base - 3.8 * k}>
        Z girts on the column
      </Note>
      <Note x={x + 0.2 * k} y={base - 1.2 * k} tx={x + 70} ty={base - 1.6 * k}>
        Tapered steel column
      </Note>
    </Drawing>
  )
}
