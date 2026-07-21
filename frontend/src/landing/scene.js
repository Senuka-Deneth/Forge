// "The Ledger Field" — a drifting terrain of instanced candle bars with an
// emissive price ribbon, choreographed by scroll progress. Colors mirror
// src/styles/tokens.css (dark theme). Loaded lazily by landing.js.
import {
  AmbientLight,
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'

const BG = new Color('#0f1114') // --bg-base hsl(220,14%,7%)
const STEEL_LOW = new Color().setHSL(215 / 360, 0.18, 0.16)
const STEEL_HIGH = new Color().setHSL(215 / 360, 0.30, 0.52)
const ACCENT = new Color().setHSL(215 / 360, 0.42, 0.66)
const BULL = new Color().setHSL(152 / 360, 0.38, 0.42)
const BEAR = new Color().setHSL(4 / 360, 0.50, 0.48)

const COLS = 55
const ROWS = 20
const STEP = 0.62
const BAR_W = 0.34

// Deterministic PRNG so the field is identical on every visit
function mulberry32(seed) {
  let a = seed >>> 0
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x))
}

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

export function createLedgerField(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(BG, 1)

  const scene = new Scene()
  scene.fog = new Fog(BG, 14, 34)

  const camera = new PerspectiveCamera(46, 1, 0.1, 100)

  scene.add(new AmbientLight(0x2a3240, 0.9))
  scene.add(new HemisphereLight(0x44506a, 0x0d0f13, 0.55))
  const dir = new DirectionalLight(0x9db4d6, 0.7)
  dir.position.set(6, 12, 4)
  scene.add(dir)

  const rand = mulberry32(20260721)

  // Price-walk ridge along the columns
  const ridge = []
  let level = 2.2
  for (let x = 0; x < COLS; x++) {
    level += (rand() - 0.48) * 0.55
    level = Math.min(4.2, Math.max(0.8, level))
    ridge.push(level)
  }

  // Instanced bar field
  const geo = new BoxGeometry(BAR_W, 1, BAR_W)
  geo.translate(0, 0.5, 0) // scale from the ground up
  const mat = new MeshStandardMaterial({ roughness: 0.82, metalness: 0.18 })
  const field = new InstancedMesh(geo, mat, COLS * ROWS)
  const m4 = new Matrix4()
  const scale = new Vector3()
  const color = new Color()

  let i = 0
  for (let x = 0; x < COLS; x++) {
    for (let z = 0; z < ROWS; z++) {
      const falloff = 1 - Math.abs(z - (ROWS - 1) / 2) / (ROWS / 2)
      const noise = (rand() - 0.5) * 0.7
      const h = Math.max(0.12, ridge[x] * (0.45 + falloff * 0.55) + noise * 0.5)

      const px = (x - (COLS - 1) / 2) * STEP
      const pz = (z - (ROWS - 1) / 2) * STEP
      m4.makeTranslation(px, 0, pz)
      m4.scale(scale.set(1, h, 1))
      field.setMatrixAt(i, m4)

      const r = rand()
      if (r > 0.985) color.copy(BULL)
      else if (r > 0.97) color.copy(BEAR)
      else color.copy(STEEL_LOW).lerp(STEEL_HIGH, Math.pow(h / 4.2, 1.4) * (0.5 + rand() * 0.5))
      field.setColorAt(i, color)
      i += 1
    }
  }
  field.instanceMatrix.needsUpdate = true
  if (field.instanceColor) field.instanceColor.needsUpdate = true
  scene.add(field)

  // Emissive price ribbon along the ridge line, drawn in progressively
  const ribbonPoints = []
  for (let x = 0; x < COLS; x += 2) {
    const px = (x - (COLS - 1) / 2) * STEP
    ribbonPoints.push(new Vector3(px, ridge[x] + 0.55, (rand() - 0.5) * 1.4))
  }
  const curve = new CatmullRomCurve3(ribbonPoints)
  const TUBE_SEGMENTS = 220
  const RADIAL_SEGMENTS = 6
  const ribbonGeo = new TubeGeometry(curve, TUBE_SEGMENTS, 0.028, RADIAL_SEGMENTS, false)
  const ribbonMat = new MeshStandardMaterial({
    color: ACCENT,
    emissive: ACCENT,
    emissiveIntensity: 0.9,
    roughness: 0.4,
    metalness: 0,
  })
  const ribbon = new Mesh(ribbonGeo, ribbonMat)
  const INDICES_PER_SEGMENT = RADIAL_SEGMENTS * 6
  ribbonGeo.setDrawRange(0, 0)
  scene.add(ribbon)

  // Three "pivot" pulse bars for the how-it-works beat
  const pulseBars = []
  const pulseCols = [14, 27, 41]
  pulseCols.forEach((col) => {
    const h = ridge[col] + 1.15
    const pg = new BoxGeometry(BAR_W * 1.15, h, BAR_W * 1.15)
    pg.translate(0, h / 2, 0)
    const pm = new MeshStandardMaterial({
      color: ACCENT,
      emissive: ACCENT,
      emissiveIntensity: 0.05,
      roughness: 0.5,
      metalness: 0,
      transparent: true,
      opacity: 0.9,
    })
    const bar = new Mesh(pg, pm)
    bar.position.set((col - (COLS - 1) / 2) * STEP, 0, 0)
    pulseBars.push(bar)
    scene.add(bar)
  })

  // ── Choreography state ──
  let progress = 0          // lerped scroll progress 0..1
  let targetProgress = 0
  const pointer = { x: 0, y: 0 }        // lerped normalized cursor
  const targetPointer = { x: 0, y: 0 }
  let elapsed = 0
  let lastTime = performance.now()

  const camTarget = new Vector3()
  const lookTarget = new Vector3()

  function updateCamera() {
    // Keyframes over progress: hero → features → how-it-works → cta
    const pHero = smoothstep(0, 0.25, progress)
    const pFeat = smoothstep(0.25, 0.55, progress)
    const pOrbit = smoothstep(0.55, 0.8, progress)
    const pOut = smoothstep(0.8, 1, progress)

    // Base path
    let y = lerp(3.4, 9.5, pFeat)
    y = lerp(y, 12.5, pOut)
    let dist = lerp(11.5, 13, pHero)
    dist = lerp(dist, 14.5, pFeat)
    dist = lerp(dist, 24, pOut)
    const orbit = lerp(0, Math.PI / 6, pOrbit)

    const drift = elapsed * 0.02
    const angle = orbit + drift + pointer.x * 0.026
    camTarget.set(Math.sin(angle) * dist, y + pointer.y * 0.6, Math.cos(angle) * dist)

    camera.position.copy(camTarget)
    lookTarget.set(0, lerp(1.6, 0.4, pFeat), 0)
    camera.lookAt(lookTarget)
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000)
    lastTime = now
    elapsed += dt

    progress += (targetProgress - progress) * Math.min(1, dt * 7)
    pointer.x += (targetPointer.x - pointer.x) * Math.min(1, dt * 4)
    pointer.y += (targetPointer.y - pointer.y) * Math.min(1, dt * 4)

    // Ribbon draws in across the hero beat
    const draw = smoothstep(0.0, 0.22, progress + 0.06)
    ribbonGeo.setDrawRange(0, Math.floor(TUBE_SEGMENTS * draw) * INDICES_PER_SEGMENT)

    // Pivot bars pulse in sequence during the how-it-works beat
    const orbitPhase = smoothstep(0.52, 0.82, progress)
    pulseBars.forEach((bar, idx) => {
      const local = clamp01(orbitPhase * 3 - idx)
      const pulse = local > 0 ? (0.25 + 0.75 * Math.abs(Math.sin(elapsed * 2.4 + idx))) * local : 0
      bar.material.emissiveIntensity = 0.05 + pulse * 1.1
    })

    updateCamera()
    renderer.render(scene, camera)
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  resize()
  renderer.setAnimationLoop(frame)

  const onVisibility = () => {
    if (document.hidden) renderer.setAnimationLoop(null)
    else {
      lastTime = performance.now()
      renderer.setAnimationLoop(frame)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('resize', resize)

  return {
    setProgress(p) {
      targetProgress = clamp01(p)
    },
    setPointer(x, y) {
      targetPointer.x = x
      targetPointer.y = y
    },
    destroy() {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', resize)
      renderer.setAnimationLoop(null)
      geo.dispose()
      mat.dispose()
      ribbonGeo.dispose()
      ribbonMat.dispose()
      pulseBars.forEach((b) => {
        b.geometry.dispose()
        b.material.dispose()
      })
      renderer.dispose()
    },
  }
}
