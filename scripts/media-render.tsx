// Development-only still export: reuse the site's product models, never substitute invented product geometry.
// Open /scripts/media-render.html?model=h2|h3|h4 with reduced motion enabled, then capture the canvas.
import { Suspense, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { HeroPanel } from '../src/facade/three/HeroPanel'
import { FloorSample } from '../src/flooring/three/FloorSample'
import { PanelPiece } from '../src/walls/three/PanelPiece'
import { createBus } from '../src/facade/three/kit'

const model = new URLSearchParams(location.search).get('model') ?? 'h2'
function View() {
  const bus = useMemo(createBus, [])
  const { camera } = useThree()
  camera.lookAt(0, -0.19, 0)
  return <>
    <ambientLight intensity={0.65} />
    <directionalLight position={[-3, 5, 5]} intensity={3.1} color="#fff8ef" />
    <directionalLight position={[4, 2, -3]} intensity={1.7} color="#dce7fa" />
    <Environment resolution={128} frames={1}>
      <Lightformer intensity={3} position={[-3, 4, 3]} scale={[3, 6, 1]} target={[0, 0, 0]} />
      <Lightformer intensity={2} position={[3, 1, 2]} scale={[2, 5, 1]} target={[0, 0, 0]} />
    </Environment>
    {model === 'h2' && <group rotation={[0, -0.25, -0.15]}><HeroPanel bus={bus} play /></group>}
    {model === 'h3' && <FloorSample bus={bus} kind="pour" pour={{ current: 1 }} />}
    {model === 'h4' && <group scale={0.37} position={[-0.11, -0.24, 0]} rotation={[0, -0.25, -0.12]}>
      <PanelPiece len={1.45} pose={{ current: { stage: 3, burst: 0.6, open: 0, lit: {}, marking: 0 } }} dark />
    </group>}
  </>
}

createRoot(document.getElementById('root')!).render(
  <Canvas orthographic dpr={1.5} camera={{ position: model === 'h3' ? [1.1, 1, 1.6] : [0.9, 0.5, 2], zoom: 1100, near: 0.01, far: 30 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
    <color attach="background" args={['#f2f0e9']} />
    <Suspense fallback={null}><View /></Suspense>
  </Canvas>,
)
