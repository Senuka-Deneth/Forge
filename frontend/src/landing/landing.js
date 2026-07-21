// Landing page bootstrap: scroll state, reveals, and lazy 3D scene loading.
// The hero is pure HTML/CSS — three.js only loads on idle, when WebGL is
// available and the visitor has not requested reduced motion.
import './landing.css'

const nav = document.querySelector('.landing-nav')
const canvas = document.getElementById('field-canvas')
const fallback = document.querySelector('.field-fallback')

let sceneApi = null
let scrollProgress = 0

function readProgress() {
  const doc = document.documentElement
  const max = doc.scrollHeight - window.innerHeight
  scrollProgress = max > 0 ? window.scrollY / max : 0
  if (sceneApi) sceneApi.setProgress(scrollProgress)
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 24)
  if (canvas) {
    // Canvas recedes behind the content sections, returns for the finale
    const dim = 1 - 0.68 * smoothstep(0.2, 0.42, scrollProgress)
    const back = 0.32 + 0.5 * smoothstep(0.78, 0.96, scrollProgress)
    canvas.style.opacity = String(Math.max(dim, back).toFixed(3))
  }
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

window.addEventListener('scroll', readProgress, { passive: true })
readProgress()

// Section reveals
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
if (!reduceMotion && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    })
  }, { threshold: 0.18 })
  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
} else {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'))
}

// Lazy 3D boot
function supportsWebGL() {
  try {
    const probe = document.createElement('canvas')
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'))
  } catch {
    return false
  }
}

function showFallback() {
  if (fallback) fallback.classList.add('active')
  if (canvas) canvas.remove()
}

async function bootScene() {
  if (!canvas || reduceMotion || !supportsWebGL()) {
    showFallback()
    return
  }
  try {
    const { createLedgerField } = await import('./scene.js')
    sceneApi = createLedgerField(canvas)
    sceneApi.setProgress(scrollProgress)
    canvas.classList.add('ready')
  } catch (err) {
    console.warn('Ledger field failed to start:', err)
    showFallback()
  }
}

if ('requestIdleCallback' in window) {
  requestIdleCallback(bootScene, { timeout: 1500 })
} else {
  setTimeout(bootScene, 600)
}

// Cursor parallax (desktop pointers only)
if (window.matchMedia('(pointer: fine)').matches) {
  window.addEventListener('pointermove', (e) => {
    if (!sceneApi) return
    const x = (e.clientX / window.innerWidth) * 2 - 1
    const y = (e.clientY / window.innerHeight) * 2 - 1
    sceneApi.setPointer(x, y)
  }, { passive: true })
}
