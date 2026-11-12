import { Stage3D } from '../facade/three/Stage3D'
import { SystemsTrio } from '../facade/three/SystemsTrio'
import { FlooringTrio } from '../flooring/three/FlooringTrio'
import { WallsTrio } from '../walls/three/WallsTrio'

/**
 * A phone's Home: the chosen application's model, as each one's own page shows it alone on a phone (the façade's
 * Unitized unit, the flooring's first floor, a building of wall panels turning slowly), in one canvas that stays put
 * while the model in it changes. Its own chunk: Home loads it only once the applications come near.
 */
export default function AppModel({ id, play, live, still }: { id: string; play: boolean; live: { current: boolean }; still: string }) {
  return (
    <Stage3D shadows keyLight={false} fallback={<img className="apps__still" src={still} alt="" />}>
      {id === 'facade' ? (
        <SystemsTrio key="facade" play={play} hover={0} live={live} pick={[0]} headroom={0.13} />
      ) : id === 'flooring' ? (
        <FlooringTrio key="flooring" play={play} hover={0} live={live} pick={[0]} />
      ) : (
        <WallsTrio key="walls" ids={['housing']} play={play} hover={null} live={live} fill={0.82} height={0.66} spin />
      )}
    </Stage3D>
  )
}
