import { useEffect, useRef } from 'react'
import { Footer } from '../components/Footer'
import { scrollToY } from '../lib/scroll'
import { MeshFilm } from './MeshFilm'
import { InConcrete } from './sections/InConcrete'
import { Replaces } from './sections/Replaces'
import { Material } from './sections/Material'
import { Tech } from './sections/Tech'
import { Apps } from './sections/Apps'
import { useHeaderGround, useReveals } from './ui'
import './mobile.css'

/**
 * The homepage on a phone. Not the desktop's twenty-odd held screens in a column: one pinned 3D
 * chapter that shows what the mesh is (its faces, its depth, its open core), then the story in
 * the order a first-time visitor needs it: the mesh in concrete, what it replaces and why, what it
 * is made of, the figures, and where it is used. The grounds alternate (yellow, black, warm white)
 * so each section reads as its own field; the header follows the ground under it.
 *
 * The chapter anchors the menu and the footer link to (#about, #innovation, #tech, #applications)
 * are all here, on the step or section that answers them.
 */
export default function MobileHome() {
  const main = useRef<HTMLElement>(null)
  useHeaderGround()
  useReveals(main)
  useEffect(() => {
    document.title = 'RTARIUM by HEMISPHERE ONE · Three-dimensional basalt reinforcement mesh'
    const root = document.documentElement
    root.classList.add('is-home-m')
    // the header's ground is set from what is under it, the footer included (see Footer)
    root.setAttribute('data-own-ground', '')
    // arriving on /#chapter: land on it once the page has laid out
    const id = window.location.hash.slice(1)
    const raf = requestAnimationFrame(() => {
      if (id) document.getElementById(id)?.scrollIntoView()
    })
    return () => {
      cancelAnimationFrame(raf)
      root.classList.remove('is-home-m')
      root.removeAttribute('data-own-ground')
    }
  }, [])

  // The menu holds the page still while it is open, and closing it restarts the smooth scroll,
  // which cancels any scroll begun while it was held (Lenis start → reset). So a chapter chosen in
  // the menu was marked in the address but never reached. Here it is scrolled to once the menu has
  // closed. (The desktop homepage's own menu, under 1200 px, has the same issue; see the report.)
  useEffect(() => {
    let raf = 0
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('#menu-panel a[href^="/#"]')
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      const id = (a.getAttribute('href') ?? '').slice(2)
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => {
          const el = document.getElementById(id)
          if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY)
        })
      })
    }
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <>
      <main ref={main} id="main" className="m-home">
        <MeshFilm />
        <InConcrete />
        <Replaces />
        <Material />
        <Tech />
        <Apps />
      </main>
      <Footer screen />
    </>
  )
}
