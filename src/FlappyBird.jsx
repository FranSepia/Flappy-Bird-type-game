import { useEffect, useRef, useCallback } from 'react'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const W = 320
const H = 568
const GROUND_H = 112
const GROUND_Y = H - GROUND_H

const GRAVITY = 0.5
const JUMP_VEL = -9
const PIPE_SPEED = 2.5
const PIPE_W = 52
const PIPE_GAP = 206
const EASY_GAP = 256     // hueco más grande en los primeros obstáculos
const EASY_COUNT = 10
const PIPE_INTERVAL = 1500

const BIRD_X = 72
const BIRD_R = 17

const SCALE = 3          // resolución interna (nitidez), la lógica sigue en W x H
const FONT = '"Press Start 2P", "Courier New", monospace'
const CROWN_H = 26       // alto de la cornisa del edificio (igual que la colisión)
const BALL_R = 14
const GIRL_SCALE = 64 / 235   // 1 px del sprite = 0.27 px del juego
const GIRL_ANCHOR_X = 0.634  // posición del cuerpo dentro del sprite (la estela queda atrás)
const GIRL_ANCHOR_Y = 0.5024

// ─── HITBOXES ─────────────────────────────────────────────────────────────────
// Círculos [dx, dy, r] que siguen la silueta del sprite, relativos al ancla (x, y).
// Se rotan igual que el sprite. Usa ?debug en la URL para verlos dibujados.
const HIT_CIRCLES = {
  bird:  [[22, -9, 8], [-2, -17, 6], [8, 6, 10], [-8, 10, 7], [-14, 19, 5]],
}
const TILT = { bird: 0.06 }
const QUERY = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const DEBUG = QUERY.has('debug')
const DEBUG_GOD = DEBUG && QUERY.has('god')         // ?debug&god: sin colisiones
const DEBUG_SKIP = DEBUG ? Number(QUERY.get('skip')) || 0 : 0  // ?debug&skip=10 salta al tema siguiente

function hitCircles(char, x, y, vel) {
  const a = Math.min(Math.max(vel, -5), 5) * TILT[char]
  const cos = Math.cos(a), sin = Math.sin(a)
  return HIT_CIRCLES[char].map(([dx, dy, r]) => ({
    x: x + dx * cos - dy * sin,
    y: y + dx * sin + dy * cos,
    r,
  }))
}

// Animación de cambio de tema: slide 0 = en su lugar, 1 = fuera de pantalla.
// Los edificios de arriba suben/bajan por arriba y los de abajo por abajo.
const ENTER_MS = 1000
const EXIT_MS = 800
const easeOut = (t) => 1 - (1 - t) ** 3
const easeIn = (t) => t ** 3

function slideOffsets(p) {
  const slide = p.slide || 0
  return {
    top: -slide * (p.topH + CROWN_H),
    bottom: slide * (H - (p.topH + p.gap - CROWN_H)),
  }
}

function updateSlide(p, dt) {
  if (p.enterT < 1) p.enterT = Math.min(1, p.enterT + dt / ENTER_MS)
  if (p.exiting) p.exitT = Math.min(1, p.exitT + dt / EXIT_MS)
  p.slide = Math.max(1 - easeOut(p.enterT), easeIn(p.exitT))
}

function circleHitsRect(c, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(c.x, rx + rw))
  const ny = Math.max(ry, Math.min(c.y, ry + rh))
  return (c.x - nx) ** 2 + (c.y - ny) ** 2 < c.r * c.r
}

// ─── IMAGE LOADER ─────────────────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// ─── RETRO 80s ASSETS (pre-rendered once, procedural pixel art) ───────────────

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const WINDOW_COLORS = ['#ffd23f', '#ffb000', '#ff8c1a', '#ffd23f', '#7ef0ff']

function buildBuildingTexture(seed) {
  const rnd = mulberry32(seed)
  const c = makeCanvas(PIPE_W + 10, H)
  const g = c.getContext('2d')
  const bx = 5

  // Body
  g.fillStyle = '#16246a'
  g.fillRect(bx, CROWN_H, PIPE_W, H - CROWN_H)
  g.fillStyle = '#2f5fb0'
  g.fillRect(bx, CROWN_H, 3, H - CROWN_H)
  g.fillStyle = '#4a93d6'
  g.fillRect(bx, CROWN_H, 1, H - CROWN_H)
  g.fillStyle = '#0c1245'
  g.fillRect(bx + PIPE_W - 4, CROWN_H, 4, H - CROWN_H)

  // Body windows (4 columns)
  for (let y = CROWN_H + 6; y + 7 < H; y += 12) {
    for (let col = 0; col < 4; col++) {
      const wx = bx + 7 + col * 10
      const lit = rnd() < 0.6
      g.fillStyle = lit ? WINDOW_COLORS[Math.floor(rnd() * WINDOW_COLORS.length)] : '#101a55'
      g.fillRect(wx, y, 6, 7)
    }
  }

  // Crown (wider ledge, faces the gap)
  g.fillStyle = '#22389a'
  g.fillRect(0, 0, PIPE_W + 10, CROWN_H)
  g.fillStyle = '#3a56c4'
  g.fillRect(0, 0, 2, CROWN_H)
  g.fillStyle = '#f2a58e'
  g.fillRect(0, 0, PIPE_W + 10, 3)
  g.fillStyle = '#b5527f'
  g.fillRect(0, 3, PIPE_W + 10, 2)
  g.fillStyle = '#0d1440'
  g.fillRect(0, CROWN_H - 4, PIPE_W + 10, 4)
  for (let col = 0; col < 5; col++) {
    g.fillStyle = rnd() < 0.7 ? WINDOW_COLORS[Math.floor(rnd() * WINDOW_COLORS.length)] : '#101a55'
    g.fillRect(6 + col * 10, 10, 6, 8)
  }
  return c
}

// ─── OBSTACLE THEMES (cambian cada 10 obstáculos): 0 edificios, 1 papeleo, 2 reloj ──

const THEME_EVERY = 10
const THEME_COUNT = 3

// Pinta en coordenadas "distancia al borde del hueco" (d). Si flip=true la textura
// queda con la cornisa abajo (edificio de arriba), pero los dibujos siguen derechos.
function makePainter(g, flip) {
  const Y = (d, h = 0) => (flip ? H - d - h : d)
  const cy = (d) => (flip ? H - d : d)
  return {
    g, Y, cy,
    rect(x, d, w, h, color) { g.fillStyle = color; g.fillRect(x, Y(d, h), w, h) },
    circle(cx, d, r, color) {
      g.fillStyle = color
      g.beginPath()
      g.arc(cx, cy(d), r, 0, Math.PI * 2)
      g.fill()
    },
    poly(pts, color) {
      g.fillStyle = color
      g.beginPath()
      pts.forEach(([x, d], i) => (i ? g.lineTo(x, cy(d)) : g.moveTo(x, cy(d))))
      g.closePath()
      g.fill()
    },
    text(str, cx, d, size, color) {
      g.font = `bold ${size}px "Courier New", monospace`
      g.textAlign = 'center'
      g.textBaseline = 'top'
      g.fillStyle = color
      g.fillText(str, cx, Y(d, size))
    },
  }
}

function buildPaperTexture(seed, flip) {
  const rnd = mulberry32(seed)
  const c = makeCanvas(PIPE_W + 10, H)
  const P = makePainter(c.getContext('2d'), flip)
  const papers = ['#e9e0c6', '#d8ccab', '#f4efdd']

  P.rect(5, CROWN_H, PIPE_W, H - CROWN_H, '#8d8368')
  for (let d = CROWN_H; d < H;) {
    const th = 5 + Math.floor(rnd() * 4)
    const x = 5 + Math.floor(rnd() * 5) - 2
    P.rect(x, d, PIPE_W, th, papers[Math.floor(rnd() * papers.length)])
    P.rect(x, d + th - 1, PIPE_W, 1, '#a89b78')
    if (rnd() < 0.5) {
      for (let k = 0; k < 3; k++) P.rect(x + 4 + k * 15, d + 2, 7 + Math.floor(rnd() * 6), 1, '#9a947c')
    }
    d += th
  }
  P.rect(5, CROWN_H, 3, H - CROWN_H, 'rgba(255,255,255,0.25)')
  P.rect(53, CROWN_H, 4, H - CROWN_H, 'rgba(60,40,10,0.35)')

  // Cintas rojas con "RED TAPE" + formularios / sellos
  let seg = 0
  for (let ty = CROWN_H + 26 + rnd() * 20; ty < H - 30; ty += 78 + rnd() * 24, seg++) {
    const s = rnd() < 0.5 ? 5 : -5
    P.poly([[3, ty], [59, ty + s], [59, ty + s + 10], [3, ty + 10]], '#c8202a')
    P.poly([[3, ty + 10], [59, ty + s + 10], [59, ty + s + 12], [3, ty + 12]], '#6e0f16')
    P.poly([[3, ty], [59, ty + s], [59, ty + s + 1], [3, ty + 1]], '#ff6a6a')
    P.text('RED TAPE', 31, ty + 2 + s / 2, 7, '#ffe6e6')

    const fd = ty + 24
    if (seg % 2 === 0) {
      const fx = 10 + Math.floor(rnd() * 12)
      P.rect(fx - 1, fd - 1, 32, 36, '#8d8870')
      P.rect(fx, fd, 30, 34, '#f8f6ee')
      P.text('FORM 104', fx + 15, fd + 3, 5, '#333333')
      P.rect(fx + 4, fd + 12, 6, 6, '#6b6b6b'); P.rect(fx + 5, fd + 13, 4, 4, '#ffffff')
      P.rect(fx + 4, fd + 21, 6, 6, '#6b6b6b'); P.rect(fx + 5, fd + 22, 4, 4, '#ffffff')
      P.rect(fx + 13, fd + 13, 12, 1, '#9a947c'); P.rect(fx + 13, fd + 22, 12, 1, '#9a947c')
      P.rect(fx + 20, fd + 25, 8, 8, '#c8202a'); P.rect(fx + 21, fd + 26, 6, 6, '#ffffff')
      P.text('X', fx + 24, fd + 26, 6, '#c8202a')
    } else {
      P.rect(8, fd + 4, 46, 13, '#b3202a')
      P.rect(10, fd + 6, 42, 9, '#f0e6c8')
      P.text('APPROVED', 31, fd + 8, 6, '#b3202a')
    }
  }

  // Cornisa: pila ancha de papeles con cinta
  for (let k = 0; k < 4; k++) {
    P.rect(0, k * 6, PIPE_W + 10, 5, k % 2 ? '#e9e0c6' : '#f4efdd')
    P.rect(0, k * 6 + 5, PIPE_W + 10, 1, '#a89b78')
  }
  P.rect(0, 0, PIPE_W + 10, 2, '#ffffff')
  P.rect(0, 10, PIPE_W + 10, 6, '#c8202a')
  P.rect(0, 16, PIPE_W + 10, 1, '#6e0f16')
  P.rect(0, 22, PIPE_W + 10, 4, '#8d8368')
  return c
}

function drawGear(P, gx, d, r, color) {
  const g = P.g
  const cy = P.cy(d)
  g.fillStyle = color
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    g.fillRect(Math.round(gx + Math.cos(a) * (r + 1) - 1.5), Math.round(cy + Math.sin(a) * (r + 1) - 1.5), 3, 3)
  }
  P.circle(gx, d, r, color)
  P.circle(gx, d, r * 0.55, 'rgba(40,20,5,0.45)')
  P.circle(gx, d, 2, '#2a1505')
}

function buildClockTexture(seed, flip) {
  const rnd = mulberry32(seed)
  const c = makeCanvas(PIPE_W + 10, H)
  const P = makePainter(c.getContext('2d'), flip)
  const g = P.g

  P.rect(5, CROWN_H, PIPE_W, H - CROWN_H, '#6e4210')
  P.rect(5, CROWN_H, 3, H - CROWN_H, '#d9a441')
  P.rect(5, CROWN_H, 1, H - CROWN_H, '#f6d27a')
  P.rect(53, CROWN_H, 4, H - CROWN_H, '#3d2208')
  for (let d = CROWN_H + 7; d < H; d += 14) {
    for (let x = 12; x < 52; x += 8) P.rect(x, d, 2, 2, '#c88a2a')
  }
  P.rect(11, CROWN_H, 4, H - CROWN_H, '#b5651d'); P.rect(11, CROWN_H, 1, H - CROWN_H, '#e08a3c')
  P.rect(47, CROWN_H, 4, H - CROWN_H, '#b5651d'); P.rect(47, CROWN_H, 1, H - CROWN_H, '#e08a3c')

  // Engranajes y relojes con cara de enojo
  const gearColors = ['#d9a441', '#c0392b', '#b5651d']
  for (let d = CROWN_H + 8; d < H;) {
    if (rnd() < 0.5) {
      const cd = d + 24
      const cy = P.cy(cd)
      P.circle(31, cd, 23, '#3d2208')
      P.circle(31, cd, 21, '#d9a441')
      P.circle(31, cd, 18, '#f4e9c8')
      P.rect(30, cd - 16, 2, 3, '#3d2208'); P.rect(30, cd + 13, 2, 3, '#3d2208')
      P.rect(14, cd - 1, 3, 2, '#3d2208'); P.rect(45, cd - 1, 3, 2, '#3d2208')
      g.fillStyle = '#e8271a'
      g.beginPath(); g.arc(24, cy - 2, 4.5, 0, Math.PI * 2); g.fill()
      g.beginPath(); g.arc(38, cy - 2, 4.5, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#2a0a0a'
      g.fillRect(23, cy - 3, 3, 3); g.fillRect(37, cy - 3, 3, 3)
      g.fillStyle = '#ffffff'
      g.fillRect(21, cy - 6, 1, 1); g.fillRect(35, cy - 6, 1, 1)
      g.strokeStyle = '#2a0a0a'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(17, cy - 11); g.lineTo(28, cy - 6)
      g.moveTo(45, cy - 11); g.lineTo(34, cy - 6)
      g.stroke()
      d += 54
    } else {
      const r = 6 + Math.floor(rnd() * 5)
      drawGear(P, 20 + Math.floor(rnd() * 22), d + r, r, gearColors[Math.floor(rnd() * gearColors.length)])
      d += 2 * r + 6
    }
  }

  // Cornisa de latón con luz roja
  P.rect(0, 0, PIPE_W + 10, CROWN_H, '#8a5a1a')
  P.rect(0, 0, PIPE_W + 10, 3, '#f0c060')
  P.rect(0, 3, PIPE_W + 10, 1, '#b8801f')
  P.rect(0, 22, PIPE_W + 10, 4, '#3d2208')
  for (let x = 5; x < PIPE_W + 10; x += 8) P.rect(x, 8, 2, 2, '#f6d27a')
  P.circle(31, 16, 4, '#ff3b2e')
  P.circle(31, 16, 2, '#ffb0a0')
  return c
}

const themeCache = {}
function getThemeTextures(theme, variant) {
  const key = `${theme}-${variant}`
  if (!themeCache[key]) {
    const build = theme === 1 ? buildPaperTexture : buildClockTexture
    const seed = theme * 1000 + variant * 77
    themeCache[key] = { up: build(seed, false), down: build(seed, true) }
  }
  return themeCache[key]
}

const BALL_COLORS = [
  { hi: '#ff6a5a', mid: '#d9221f', lo: '#8e1010', rim: '#7a0f14', glow: 'rgba(255,60,60,0.7)' },
  { hi: '#6aa8ff', mid: '#1f5fd9', lo: '#0f2f80', rim: '#0b1f5a', glow: 'rgba(60,120,255,0.7)' },
  { hi: '#6aff8a', mid: '#1fa83a', lo: '#0f6020', rim: '#0b4016', glow: 'rgba(60,255,120,0.7)' },
  { hi: '#ffe27a', mid: '#e0a20f', lo: '#8a5a05', rim: '#5a3a03', glow: 'rgba(255,200,60,0.7)' },
  { hi: '#c88aff', mid: '#8a2fd0', lo: '#4a1480', rim: '#300c58', glow: 'rgba(170,80,255,0.7)' },
  { hi: '#ffaa5a', mid: '#f07818', lo: '#9a4108', rim: '#6a2a05', glow: 'rgba(255,140,40,0.7)' },
]

function buildSkylineLayer(seed, bodyColor, edgeColor, maxH, minH, windowChance) {
  const rnd = mulberry32(seed)
  const c = makeCanvas(W, maxH + 20)
  const g = c.getContext('2d')
  const base = c.height
  let x = 0
  while (x < W) {
    let bw = 16 + Math.floor(rnd() * 20)
    if (W - (x + bw) < 14) bw = W - x
    const bh = minH + Math.floor(rnd() * (maxH - minH))
    g.fillStyle = bodyColor
    g.fillRect(x, base - bh, bw, bh)
    g.fillStyle = edgeColor
    g.fillRect(x, base - bh, bw, 1)
    if (rnd() < 0.35 && bw > 8) {
      g.fillStyle = bodyColor
      g.fillRect(x + Math.floor(bw / 2), base - bh - 10, 2, 10)
    }
    for (let wy = base - bh + 5; wy < base - 4; wy += 7) {
      for (let wx = x + 3; wx + 3 < x + bw; wx += 6) {
        if (rnd() < windowChance) {
          g.fillStyle = rnd() < 0.7 ? '#ffb347' : '#ff5fa8'
          g.fillRect(wx, wy, 3, 3)
        }
      }
    }
    x += bw
  }
  return c
}

function buildSky() {
  const rnd = mulberry32(80)
  const c = makeCanvas(W, GROUND_Y)
  const g = c.getContext('2d')

  const grad = g.createLinearGradient(0, 0, 0, GROUND_Y)
  grad.addColorStop(0, '#0b0b3b')
  grad.addColorStop(0.32, '#2a1a6e')
  grad.addColorStop(0.55, '#6a2c91')
  grad.addColorStop(0.75, '#c2418f')
  grad.addColorStop(0.92, '#ff7a6e')
  grad.addColorStop(1, '#ffb347')
  g.fillStyle = grad
  g.fillRect(0, 0, W, GROUND_Y)

  // Stars
  for (let i = 0; i < 45; i++) {
    g.fillStyle = rnd() < 0.5 ? '#ffffff' : '#c9b8ff'
    g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * GROUND_Y * 0.5), 1, 1)
  }

  // Striped retro sun
  const sunX = 62, sunY = 345, sunR = 44
  const sun = makeCanvas(sunR * 2, sunR * 2)
  const sg = sun.getContext('2d')
  const sunGrad = sg.createLinearGradient(0, 0, 0, sunR * 2)
  sunGrad.addColorStop(0, '#ffe066')
  sunGrad.addColorStop(1, '#ff7a4d')
  sg.fillStyle = sunGrad
  sg.beginPath()
  sg.arc(sunR, sunR, sunR, 0, Math.PI * 2)
  sg.fill()
  sg.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 6; i++) {
    sg.fillRect(0, sunR + 6 + i * 8, sunR * 2, 1 + i * 0.7)
  }
  g.drawImage(sun, sunX - sunR, sunY - sunR)

  // Mountains
  const mountain = (color, base, amp, seed) => {
    const r = mulberry32(seed)
    g.fillStyle = color
    g.beginPath()
    g.moveTo(0, GROUND_Y)
    let y = base
    for (let x = 0; x <= W; x += 16) {
      y = base - r() * amp
      g.lineTo(x, y)
    }
    g.lineTo(W, GROUND_Y)
    g.closePath()
    g.fill()
  }
  mountain('#5a2f92', 400, 26, 5)
  mountain('#40237a', 416, 22, 9)
  return c
}

let assetCache = null
function getAssets() {
  if (assetCache) return assetCache
  assetCache = {
    sky: buildSky(),
    far: buildSkylineLayer(11, '#2c2275', '#4b3aa0', 120, 50, 0.25),
    near: buildSkylineLayer(23, '#1a1456', '#2e2290', 84, 30, 0.35),
    buildings: [buildBuildingTexture(101), buildBuildingTexture(202), buildBuildingTexture(303)],
  }
  return assetCache
}

// ─── RETRO DRAWERS ────────────────────────────────────────────────────────────

function drawCloudCanvas(ctx, x, y, s) {
  const u = 4 * s
  ctx.fillStyle = '#ff7bb0'
  ctx.fillRect(x, y, 10 * u, u)
  ctx.fillRect(x + 2 * u, y - u, 6 * u, u)
  ctx.fillRect(x + 4 * u, y - 2 * u, 3 * u, u)
  ctx.fillStyle = '#c04a9a'
  ctx.fillRect(x + u, y + u, 9 * u, u)
  ctx.fillStyle = '#ffb3d1'
  ctx.fillRect(x + 3 * u, y - u, 2 * u, u)
}

function drawBuilding(ctx, imgs, p) {
  const theme = p.theme || 0
  const texW = PIPE_W + 10
  const x = Math.round(p.x)
  const off = slideOffsets(p)
  const botY = Math.round(p.topH + p.gap - CROWN_H + off.bottom)
  const topBottom = Math.round(p.topH + CROWN_H + off.top)
  const topH = p.topH + CROWN_H   // alto del edificio de arriba
  const botH = H - (p.topH + p.gap - CROWN_H)
  ctx.imageSmoothingEnabled = false

  if (theme === 0) {
    const tex = getAssets().buildings[p.n % 3]
    // Edificio de abajo (cornisa arriba)
    ctx.drawImage(tex, 0, 0, texW, botH, x, botY, texW, botH)
    // Edificio de arriba (volteado para que la cornisa quede abajo)
    ctx.save()
    ctx.translate(x, topBottom)
    ctx.scale(1, -1)
    ctx.drawImage(tex, 0, 0, texW, topH, 0, 0, texW, topH)
    ctx.restore()
  } else {
    const t = getThemeTextures(theme, p.n % 3)
    ctx.drawImage(t.up, 0, 0, texW, botH, x, botY, texW, botH)
    ctx.drawImage(t.down, 0, H - topH, texW, topH, x, topBottom - topH, texW, topH)
  }
  ctx.imageSmoothingEnabled = true

  const logo = imgs['logo']
  if (theme === 0 && logo) {
    const lw = 46
    const lh = Math.round(lw * logo.height / logo.width)
    const lx = x + 5 + (PIPE_W - lw) / 2
    ctx.drawImage(logo, lx, p.topH + off.top - 4 - lh, lw, lh)
    ctx.drawImage(logo, lx, botY + CROWN_H + 4, lw, lh)
  }
}

function drawBall(ctx, x, y, n, color) {
  const r = BALL_R
  ctx.save()
  ctx.shadowColor = color.glow
  ctx.shadowBlur = 8
  ctx.fillStyle = color.rim
  ctx.beginPath()
  ctx.arc(x, y, r + 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const body = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, r)
  body.addColorStop(0, color.hi)
  body.addColorStop(0.6, color.mid)
  body.addColorStop(1, color.lo)
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()

  const inner = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, r * 0.62)
  inner.addColorStop(0, '#ffffff')
  inner.addColorStop(1, '#e6dcc8')
  ctx.fillStyle = inner
  ctx.beginPath()
  ctx.arc(x, y, r * 0.62, 0, Math.PI * 2)
  ctx.fill()

  const label = String(n)
  const size = label.length <= 2 ? 10 : label.length === 3 ? 8 : 6
  ctx.font = `${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#14052e'
  ctx.fillText(label, x + 1, y + 1)
  ctx.textBaseline = 'alphabetic'
}

// ─── IMAGE-BASED DRAWERS ──────────────────────────────────────────────────────

function drawBirdImg(ctx, imgs, x, y, vel) {
  const angle = Math.min(Math.max(vel * 0.06, -0.5), 1.2)
  const img = imgs['bird']
  if (!img) return

  // El sprite incluye la estela completa; (x, y) queda sobre el cuerpo de la chava
  const w = img.width * GIRL_SCALE
  const h = img.height * GIRL_SCALE
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.drawImage(img, -w * GIRL_ANCHOR_X, -h * GIRL_ANCHOR_Y, w, h)
  ctx.restore()
}

// ─── SHARED DRAW FUNCTIONS ────────────────────────────────────────────────────

function neonText(ctx, text, x, y, size, color, glow, align = 'center') {
  ctx.save()
  ctx.font = `${size}px ${FONT}`
  ctx.textAlign = align
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#14052e'
  ctx.lineWidth = Math.max(3, size / 3)
  ctx.strokeText(text, x, y)
  ctx.shadowColor = glow
  ctx.shadowBlur = 8
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

function drawBackground(ctx, clouds, imgs, isNight, bgX) {
  const { sky, far, near } = getAssets()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(sky, 0, 0)

  ctx.save()
  if (isNight) ctx.globalAlpha = 0.5
  clouds.forEach(c => drawCloudCanvas(ctx, c.x, c.y, c.s))
  ctx.restore()

  const layer = (img, factor) => {
    const off = -((bgX * factor) % W)
    const y = GROUND_Y - img.height
    ctx.drawImage(img, Math.round(off), y)
    ctx.drawImage(img, Math.round(off) + W, y)
  }
  layer(far, 0.15)
  layer(near, 0.4)
  ctx.imageSmoothingEnabled = true

  if (isNight) {
    ctx.fillStyle = 'rgba(0, 0, 30, 0.45)'
    ctx.fillRect(0, 0, W, GROUND_Y)
  }
}

function drawGround(ctx, groundX) {
  const grad = ctx.createLinearGradient(0, GROUND_Y, 0, H)
  grad.addColorStop(0, '#2b0f5e')
  grad.addColorStop(1, '#0a0420')
  ctx.fillStyle = grad
  ctx.fillRect(0, GROUND_Y, W, GROUND_H)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, GROUND_Y, W, GROUND_H)
  ctx.clip()
  ctx.strokeStyle = 'rgba(255, 60, 172, 0.55)'
  ctx.lineWidth = 1
  for (let i = 1; i <= 5; i++) {
    const y = GROUND_Y + GROUND_H * (i / 5) * (i / 5)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  for (let i = -3; i <= 8; i++) {
    const xb = i * 64 + groundX
    const xt = W / 2 + (xb - W / 2) * 0.3
    ctx.beginPath()
    ctx.moveTo(xt, GROUND_Y)
    ctx.lineTo(xb, H)
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.shadowColor = '#ff3cac'
  ctx.shadowBlur = 8
  ctx.fillStyle = '#ff5fc8'
  ctx.fillRect(0, GROUND_Y, W, 2)
  ctx.restore()
}

function drawScore(ctx, score) {
  drawPanel(ctx, 8, 8, 112, 46, 4)
  neonText(ctx, 'SCORE', 18, 26, 8, '#ffb3f0', '#ff3cac', 'left')
  neonText(ctx, String(score).padStart(5, '0'), 18, 46, 18, '#ffffff', '#c04dff', 'left')
}

function drawPanel(ctx, x, y, w, h, radius = 6) {
  const path = (ix, iy, iw, ih, r) => {
    ctx.beginPath()
    ctx.moveTo(ix + r, iy)
    ctx.lineTo(ix + iw - r, iy)
    ctx.lineTo(ix + iw, iy + r)
    ctx.lineTo(ix + iw, iy + ih - r)
    ctx.lineTo(ix + iw - r, iy + ih)
    ctx.lineTo(ix + r, iy + ih)
    ctx.lineTo(ix, iy + ih - r)
    ctx.lineTo(ix, iy + r)
    ctx.closePath()
  }
  ctx.save()
  path(x, y, w, h, radius)
  ctx.fillStyle = 'rgba(16, 12, 58, 0.92)'
  ctx.fill()
  ctx.shadowColor = '#c04dff'
  ctx.shadowBlur = 8
  ctx.strokeStyle = '#c04dff'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.shadowBlur = 0
  path(x + 3, y + 3, w - 6, h - 6, radius)
  ctx.strokeStyle = 'rgba(255, 122, 217, 0.6)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()
}

function drawStartScreen(ctx, flashAlpha) {
  const logoY = 110
  neonText(ctx, 'FLAPPY', W / 2, logoY, 36, '#ffe44e', '#ff8c1a')
  neonText(ctx, 'BIRD', W / 2, logoY + 50, 36, '#ffffff', '#ff3cac')
  neonText(ctx, 'GET READY!', W / 2, 335, 16, '#7ef0ff', '#00b7ff')

  if (flashAlpha > 0.3) {
    drawPanel(ctx, W / 2 - 110, 360, 220, 56, 8)
    neonText(ctx, 'TAP TO START', W / 2, 394, 12, '#ffffff', '#c04dff')
  }
}

function drawGameOver(ctx, score, best) {
  ctx.fillStyle = 'rgba(10, 4, 32, 0.6)'
  ctx.fillRect(0, 0, W, H)

  const bannerY = 150
  drawPanel(ctx, W / 2 - 140, bannerY, 280, 60, 8)
  neonText(ctx, 'GAME OVER', W / 2, bannerY + 38, 20, '#ff5a6e', '#ff1744')

  const panelX = W / 2 - 130
  const panelY = 230
  drawPanel(ctx, panelX, panelY, 260, 120, 8)

  neonText(ctx, 'SCORE', panelX + 20, panelY + 38, 12, '#ffb3f0', '#ff3cac', 'left')
  neonText(ctx, String(score), panelX + 240, panelY + 40, 20, '#ffffff', '#c04dff', 'right')

  ctx.strokeStyle = 'rgba(255, 122, 217, 0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(panelX + 15, panelY + 60)
  ctx.lineTo(panelX + 245, panelY + 60)
  ctx.stroke()

  neonText(ctx, 'BEST', panelX + 20, panelY + 100, 12, '#ffb3f0', '#ff3cac', 'left')
  neonText(ctx, String(best), panelX + 240, panelY + 100, 20, '#ffd23f', '#ff8c1a', 'right')

  if (score >= 10) {
    const medal = score >= 40 ? '#ffd700' : score >= 20 ? '#c0c0c0' : '#cd7f32'
    ctx.save()
    ctx.beginPath()
    ctx.arc(panelX + 55, panelY + 72, 14, 0, Math.PI * 2)
    ctx.fillStyle = medal
    ctx.fill()
    ctx.strokeStyle = '#ff7ad9'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.fillText(score >= 40 ? '🏆' : score >= 20 ? '🥈' : '🥉', panelX + 55, panelY + 77)
    ctx.restore()
  }

  const btnY = 378
  drawPanel(ctx, W / 2 - 90, btnY, 180, 56, 8)
  neonText(ctx, 'PLAY AGAIN', W / 2, btnY + 34, 12, '#ffffff', '#c04dff')
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function FlappyBird() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const imgsRef = useRef({})
  const rafRef = useRef(null)
  const lastTimeRef = useRef(null)
  const pipeTimerRef = useRef(0)

  const initState = useCallback(() => ({
    phase: 'start',
    character: 'bird',  // Brightstar, el único personaje
    birdY: H / 2 - 40,
    birdVel: 0,
    pipes: [],
    score: 0,
    best: parseInt(localStorage.getItem('fb_best') || '0'),
    groundX: 0,
    clouds: [
      { x: 60,  y: 80,  s: 1 },
      { x: 190, y: 55,  s: 0.8 },
      { x: 260, y: 100, s: 0.7 },
    ],
    fireworksTimer: 0,
    particles: [],
    rainbowBirdTimer: 0,
    wingFrame: 0,
    wingTimer: 0,
    flashAlpha: 1,
    flashTimer: 0,
    deadTimer: 0,
    scored: new Set(),
    pipeCount: DEBUG_SKIP,
    bgX: 0,
  }), [])

  const spawnPipe = useCallback((n) => {
    const gap = n <= EASY_COUNT ? EASY_GAP : PIPE_GAP
    const minTopH = 60
    const maxTopH = GROUND_Y - gap - 60
    const topH = Math.floor(Math.random() * (maxTopH - minTopH)) + minTopH
    return { x: W + 10, topH, gap, slide: 0, enterT: 1, exitT: 0, exiting: false }
  }, [])

  const checkCollision = useCallback((birdY, vel, char, pipes) => {
    if (DEBUG_GOD) return { hit: false }
    const circles = hitCircles(char, BIRD_X, birdY, vel)
    const CAP_W = PIPE_W + 10

    // Suelo / techo
    if (circles.some(c => c.y - c.r <= 0 || c.y + c.r >= GROUND_Y)) return { hit: true, type: 'normal' }

    for (const p of pipes) {
      const bodyX = p.x + 5
      const capX = p.x
      const botY = p.topH + p.gap
      const off = slideOffsets(p)
      const isCentered = BIRD_X > capX + 5 && BIRD_X < capX + CAP_W - 5

      // Edificio de arriba: cuerpo + cornisa
      const top = [[bodyX, -100 + off.top, PIPE_W, p.topH + 100], [capX, p.topH + off.top, CAP_W, CROWN_H]]
      // Edificio de abajo: cornisa + cuerpo
      const bottom = [[capX, botY - CROWN_H + off.bottom, CAP_W, CROWN_H], [bodyX, botY + off.bottom, PIPE_W, H]]

      if (circles.some(c => top.some(r => circleHitsRect(c, ...r)))) {
        return { hit: true, type: isCentered ? 'enter_top' : 'normal', pipe: p }
      }
      if (circles.some(c => bottom.some(r => circleHitsRect(c, ...r)))) {
        return { hit: true, type: isCentered ? 'enter_bottom' : 'normal', pipe: p }
      }
    }
    return { hit: false }
  }, [])

  const jump = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    if (s.phase === 'start') {
      s.phase = 'playing'
      s.birdVel = JUMP_VEL
      pipeTimerRef.current = 0
      return
    }
    if (s.phase === 'playing') {
      s.birdVel = JUMP_VEL
    }
    if (s.phase === 'dead' && s.deadTimer > 60) {
      const best = s.best
      stateRef.current = initState()
      stateRef.current.best = best
    }
  }, [initState])

  // Load images on mount
  useEffect(() => {
    const keys = ['bird', 'logo']
    const paths = {
      bird:      '/assets/retro/girl.png',
      logo:      '/assets/retro/logo_banner.png',
    }
    keys.forEach(async (k) => {
      // Reintenta: por un túnel o red lenta alguna petición puede fallar
      for (let attempt = 0; attempt < 6; attempt++) {
        const img = await loadImage(paths[k])
        if (img) { imgsRef.current[k] = img; return }
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      }
    })
  }, [])

  useEffect(() => {
    stateRef.current = initState()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault()
        jump()
      }
    }
    const onTouch = (e) => { 
      e.preventDefault(); 
        jump() 
    }
    const onClick = () => jump()

    window.addEventListener('keydown', onKey)
    canvas.addEventListener('touchstart', onTouch, { passive: false })
    canvas.addEventListener('mousedown', onClick)

    const loop = (timestamp) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const dt = Math.min(timestamp - lastTimeRef.current, 32)
      lastTimeRef.current = timestamp

      const s = stateRef.current
      const imgs = imgsRef.current
      const speed = PIPE_SPEED * (1 + Math.floor(s.score / 10) * 0.08)

      // ── UPDATE ──
      if (s.phase === 'playing') {
        s.birdVel += GRAVITY
        s.birdY += s.birdVel

        pipeTimerRef.current += dt
        if (pipeTimerRef.current >= PIPE_INTERVAL) {
          const np = spawnPipe(s.pipeCount + 1)
          np.n = ++s.pipeCount
          np.theme = Math.floor((np.n - 1) / THEME_EVERY) % THEME_COUNT
          np.ballColor = Math.floor(Math.random() * BALL_COLORS.length)
          if (np.n > 1 && (np.n - 1) % THEME_EVERY === 0) {
            // Cambio de tema: los actuales se van y el nuevo entra
            s.pipes.forEach(o => { o.exiting = true })
            np.enterT = 0
            np.slide = 1
          }
          s.pipes.push(np)
          pipeTimerRef.current = 0
        }
        s.pipes.forEach(p => { p.x -= speed; updateSlide(p, dt) })
        s.pipes = s.pipes.filter(p => p.x > -80)

        const hc = hitCircles(s.character, BIRD_X, s.birdY, s.birdVel)
        s.pipes.forEach(p => {
          const ballX = p.x + 5 + PIPE_W / 2
          const ballY = p.topH + p.gap / 2
          if (!p.collected && hc.some(c => Math.hypot(ballX - c.x, ballY - c.y) < c.r + BALL_R)) {
            p.collected = true
            for (let i = 0; i < 14; i++) {
              const a = Math.random() * Math.PI * 2
              const v = Math.random() * 2 + 1
              s.particles.push({
                x: ballX, y: ballY,
                vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                color: i % 2 ? '#ff3b3b' : '#ffffff',
                life: 0.6
              })
            }
            s.score++
            if (s.score === 10 || (s.score % 100 === 0 && s.score >= 100)) {
              s.fireworksTimer = 3000
            }
            if (s.score === 1000) {
              s.rainbowBirdTimer = 10000
            }
            if (s.score > s.best) {
              s.best = s.score
              localStorage.setItem('fb_best', s.best)
            }
          }
        })

        const col = checkCollision(s.birdY, s.birdVel, s.character, s.pipes)
        if (col.hit) {
          if (col.type === 'enter_bottom' || col.type === 'enter_top') {
            // Alinear la tubería perfectamente al centro horizontal del pájaro
            col.pipe.x = BIRD_X - (5 + PIPE_W / 2)

            s.phase = 'pipe_enter'
            s.pipeEnterType = col.type
            s.birdVel = 0
            s.deadTimer = 0
            try {
              new Audio('https://www.myinstants.com/media/sounds/mario-pipe-sound.mp3').play()
            } catch (e) {}
          } else {
            s.phase = 'dead'
            s.birdVel = JUMP_VEL * 0.4
          }
        }
      }

      if (s.phase === 'pipe_enter') {
        s.deadTimer++
        // Disminuimos la velocidad (1 en lugar de 2) para que sea 50% más lenta
        if (s.pipeEnterType === 'enter_bottom') {
          s.birdY += 1
        } else {
          s.birdY -= 1
        }
        if (s.deadTimer > 60) {
          s.phase = 'dead'
          s.deadTimer = 0
          s.birdVel = 0
          s.isHidden = true
        }
      }

      if (s.phase === 'dead') {
        s.deadTimer++
        if (!s.isHidden) {
          s.birdVel += GRAVITY
          s.birdY = Math.min(s.birdY + s.birdVel, GROUND_Y - 24)
        }
      }

      if (s.phase !== 'dead' && s.phase !== 'pipe_enter') {
        s.groundX = (s.groundX - speed) % 64
        s.bgX += speed
      }

      if (s.phase === 'playing' || s.phase === 'pipe_enter') {
        if (s.rainbowBirdTimer > 0) {
          s.rainbowBirdTimer -= dt
        }
        if (s.fireworksTimer > 0) {
          s.fireworksTimer -= dt
          if (Math.random() < 0.08) {
            const cx = Math.random() * W
            const cy = Math.random() * (GROUND_Y - 100) + 20
            const colors = ['#ff0044', '#00ff44', '#0044ff', '#ffff00', '#ff00ff', '#00ffff']
            const color = colors[Math.floor(Math.random() * colors.length)]
            for (let i = 0; i < 30; i++) {
              const angle = Math.random() * Math.PI * 2
              const speed = Math.random() * 2 + 1
              if (!s.particles) s.particles = []
              s.particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color,
                life: 1.0
              })
            }
          }
        }
        if (s.particles && s.particles.length > 0) {
          s.particles.forEach(p => {
            p.x += p.vx
            p.y += p.vy
            p.vy += GRAVITY * 0.1
            p.life -= dt * 0.001
          })
          s.particles = s.particles.filter(p => p.life > 0)
        }
      }

      if (s.phase === 'playing') {
        s.clouds.forEach(c => {
          c.x -= 0.5
          if (c.x < -80) c.x = W + 80
        })
      }

      s.wingTimer += dt
      if (s.wingTimer > 120) {
        s.wingFrame = (s.wingFrame + 1) % 3
        s.wingTimer = 0
      }

      s.flashTimer += dt
      if (s.flashTimer > 600) s.flashTimer = 0
      s.flashAlpha = s.flashTimer < 300 ? 1 : 0

      // ── DRAW ──
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
      drawBackground(ctx, s.clouds, imgs, s.fireworksTimer > 0, s.bgX)

      if (s.particles && s.particles.length > 0) {
        s.particles.forEach(p => {
          ctx.globalAlpha = Math.max(0, p.life)
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.globalAlpha = 1.0
      }

      // Si está entrando a la tubería, dibujamos el pájaro ANTES de la tubería
      if (s.phase === 'pipe_enter' && !s.isHidden) {
        ctx.save()
        if (s.rainbowBirdTimer && s.rainbowBirdTimer > 0) {
          ctx.filter = `hue-rotate(${(Date.now() / 4) % 360}deg) saturate(200%)`
        }
        drawBirdImg(ctx, imgs, BIRD_X, s.birdY, Math.min(Math.max(s.birdVel, -5), 5))
        ctx.restore()
      }

      drawGround(ctx, s.groundX)

      s.pipes.forEach(p => {
        drawBuilding(ctx, imgs, p)
        if (!p.collected) drawBall(ctx, p.x + 5 + PIPE_W / 2, p.topH + p.gap / 2, p.n, BALL_COLORS[p.ballColor])
      })

      ctx.save()
      if (s.rainbowBirdTimer && s.rainbowBirdTimer > 0) {
        ctx.filter = `hue-rotate(${(Date.now() / 4) % 360}deg) saturate(200%)`
      }

      const renderChar = (ctx, x, y, vel) => drawBirdImg(ctx, imgs, x, y, vel)

      if (s.phase === 'start') {
        const floatY = s.birdY + Math.sin(Date.now() / 300) * 6
        renderChar(ctx, BIRD_X, floatY, 0)
        ctx.restore()
        drawStartScreen(ctx, s.flashAlpha)
      } else {
        if (!s.isHidden && s.phase !== 'pipe_enter') {
          renderChar(ctx, BIRD_X, s.birdY, Math.min(Math.max(s.birdVel, -5), 5))
        }
        ctx.restore()

        drawScore(ctx, s.score)
      }

      if (DEBUG) {
        ctx.strokeStyle = '#00ff66'
        ctx.lineWidth = 1
        hitCircles(s.character, BIRD_X, s.birdY, s.birdVel).forEach(c => {
          ctx.beginPath()
          ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
          ctx.stroke()
        })
        s.pipes.forEach(p => {
          const off = slideOffsets(p)
          ctx.strokeRect(p.x + 5, off.top, PIPE_W, p.topH)
          ctx.strokeRect(p.x, p.topH + off.top, PIPE_W + 10, CROWN_H)
          ctx.strokeRect(p.x, p.topH + p.gap - CROWN_H + off.bottom, PIPE_W + 10, CROWN_H)
          ctx.strokeRect(p.x + 5, p.topH + p.gap + off.bottom, PIPE_W, H)
          ctx.beginPath()
          ctx.arc(p.x + 5 + PIPE_W / 2, p.topH + p.gap / 2, BALL_R, 0, Math.PI * 2)
          ctx.stroke()
        })
      }

      if (s.phase === 'dead' && s.deadTimer > 30) {
        drawGameOver(ctx, s.score, s.best)
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', onKey)
      canvas.removeEventListener('touchstart', onTouch)
      canvas.removeEventListener('mousedown', onClick)
    }
  }, [initState, spawnPipe, checkCollision, jump])

  useEffect(() => {
    const canvas = canvasRef.current
    const resize = () => {
      const scale = Math.min(window.innerWidth / W, window.innerHeight / H)
      canvas.style.width = `${W * scale}px`
      canvas.style.height = `${H * scale}px`
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={W * SCALE}
      height={H * SCALE}
      style={{ display: 'block', cursor: 'pointer' }}
    />
  )
}
