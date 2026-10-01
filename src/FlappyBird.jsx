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
const COLLECT_R = BALL_R + 12

// ─── IMAGE LOADER ─────────────────────────────────────────────────────────────

function loadImage(src, removeBg = false) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      if (!removeBg) return resolve(img)
      
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        const bgR = data[0], bgG = data[1], bgB = data[2]
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2]
          // Eliminar fondo blanco (con mucha mayor tolerancia) para matar bordes o píxeles sueltos
          if (r > 200 && g > 200 && b > 200) {
            data[i+3] = 0 
          } else if (Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB) < 90) {
            data[i+3] = 0 
          }
        }
        ctx.putImageData(imageData, 0, 0)
        
        const transparentImg = new Image()
        transparentImg.onload = () => resolve(transparentImg)
        transparentImg.src = canvas.toDataURL('image/png')
      } catch(e) {
        resolve(img)
      }
    }
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

function drawBuilding(ctx, imgs, p, gap) {
  const tex = getAssets().buildings[p.n % 3]
  const texW = PIPE_W + 10
  const x = Math.round(p.x)
  ctx.imageSmoothingEnabled = false

  // Bottom building (crown faces up)
  const botY = p.topH + gap - CROWN_H
  ctx.drawImage(tex, 0, 0, texW, H - botY, x, botY, texW, H - botY)

  // Top building (flipped so the crown faces down)
  const topBottom = p.topH + CROWN_H
  ctx.save()
  ctx.translate(x, topBottom)
  ctx.scale(1, -1)
  ctx.drawImage(tex, 0, 0, texW, topBottom, 0, 0, texW, topBottom)
  ctx.restore()

  ctx.imageSmoothingEnabled = true
  const logo = imgs['logo']
  if (logo) {
    const lw = 46
    const lh = Math.round(lw * logo.height / logo.width)
    const lx = x + 5 + (PIPE_W - lw) / 2
    ctx.drawImage(logo, lx, p.topH - 4 - lh, lw, lh)
    ctx.drawImage(logo, lx, botY + CROWN_H + 4, lw, lh)
  }
}

function drawBall(ctx, x, y, n) {
  const r = BALL_R
  ctx.save()
  ctx.shadowColor = 'rgba(255, 60, 60, 0.7)'
  ctx.shadowBlur = 8
  ctx.fillStyle = '#7a0f14'
  ctx.beginPath()
  ctx.arc(x, y, r + 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const body = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, r)
  body.addColorStop(0, '#ff6a5a')
  body.addColorStop(0.6, '#d9221f')
  body.addColorStop(1, '#8e1010')
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

// ─── CANVAS FALLBACK BIRD (used when the sprite is missing) ───────────────────

function drawBirdCanvas(ctx, x, y, vel, wingFrame) {
  const r = BIRD_R
  const angle = Math.min(Math.max(vel * 0.06, -0.5), 1.2)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)

  const wingY = wingFrame === 0 ? 4 : wingFrame === 1 ? 0 : -6
  ctx.fillStyle = '#f0c030'
  ctx.beginPath()
  ctx.ellipse(-4, wingY, 10, 7, -0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#c89010'
  ctx.lineWidth = 1.5
  ctx.stroke()

  const bodyGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, r)
  bodyGrad.addColorStop(0, '#fce860')
  bodyGrad.addColorStop(0.6, '#f5d33b')
  bodyGrad.addColorStop(1, '#d4a017')
  ctx.fillStyle = bodyGrad
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#b07a0a'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = '#fce8a0'
  ctx.beginPath()
  ctx.ellipse(4, 5, 9, 7, 0.3, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(8, -5, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = '#1a0a00'
  ctx.beginPath()
  ctx.arc(10, -5, 3.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(11.5, -6.5, 1.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#f87327'
  ctx.beginPath()
  ctx.moveTo(12, -1)
  ctx.lineTo(22, 1)
  ctx.lineTo(12, 4)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#c45010'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.restore()
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

function drawQuetzalImg(ctx, imgs, x, y, vel, time) {
  const angle = Math.min(Math.max(vel * 0.05, -0.4), 1.0)
  const img = imgs['quetz']
  
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)

  if (!img) {
    ctx.fillStyle = '#2ecc71'
    ctx.fillRect(-15, -15, 30, 30)
    ctx.restore()
    return
  }

  // Quetzal/serpiente: 25% más grande y animación invertida (cabeza a la izq)
  const h = BIRD_R * 4.375 // 3.5 * 1.25 = 4.375
  const aspect = img.width / img.height
  const w = h * aspect
  const t = time / 130 

  const strips = 30
  const stripW = w / strips
  const srcStripW = img.width / strips

  for (let i = 0; i < strips; i++) {
    // Cabeza a la derecha (i -> strips), cola a la izquierda (i -> 0).
    // La amplitud es mínima en la cabeza (derecha) y máxima en la cola (izquierda).
    const relativePos = i / strips 
    const waveAmp = 2 + (1 - relativePos) * 12
    
    // La onda viaja de derecha (cabeza) a izquierda (cola) empujada por "t + i".
    const waveY = Math.sin(t + i * 0.35) * waveAmp
    const globalBob = Math.sin(t * 0.8) * 4
    
    const dx = -w/2 + i * stripW
    const dy = -h/2 + waveY + globalBob

    ctx.drawImage(
      img, 
      i * srcStripW, 0, srcStripW, img.height,
      dx, dy, stripW + 0.8, h
    )
  }

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

function drawCharacterSelect(ctx, time, imgs) {
  ctx.fillStyle = 'rgba(10, 4, 32, 0.7)'
  ctx.fillRect(0, 0, W, H)

  neonText(ctx, 'ELIGE TU', W / 2, 120, 20, '#ffffff', '#ff3cac')
  neonText(ctx, 'PERSONAJE', W / 2, 160, 20, '#7ef0ff', '#00b7ff')

  // Izquierda: X center = 85
  drawPanel(ctx, 30, 220, 110, 130, 8)
  neonText(ctx, 'FLAPPY', 85, 335, 10, '#ffd23f', '#ff8c1a')
  if (imgs['bird']) {
    drawBirdImg(ctx, imgs, 100, 275, 0)
  } else {
    drawBirdCanvas(ctx, 85, 275, 0, Math.floor((time / 150) % 3))
  }

  // Derecha: X center = 235
  drawPanel(ctx, 180, 220, 110, 130, 8)
  neonText(ctx, 'QUETZAL', 235, 335, 9, '#ffd23f', '#ff8c1a')
  drawQuetzalImg(ctx, imgs, 235, 275, 0, time)
}

function drawStartScreen(ctx, flashAlpha) {
  const logoY = 110
  neonText(ctx, 'FLAPPY', W / 2, logoY, 36, '#ffe44e', '#ff8c1a')
  neonText(ctx, 'BIRD', W / 2, logoY + 50, 36, '#ffffff', '#ff3cac')
  neonText(ctx, 'GET READY!', W / 2, 280, 16, '#7ef0ff', '#00b7ff')

  if (flashAlpha > 0.3) {
    drawPanel(ctx, W / 2 - 110, 310, 220, 56, 8)
    neonText(ctx, 'TAP TO START', W / 2, 344, 12, '#ffffff', '#c04dff')
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
    phase: 'select',
    character: 'bird',
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
    poops: [],
    fireworksTimer: 0,
    particles: [],
    rainbowBirdTimer: 0,
    wingFrame: 0,
    wingTimer: 0,
    flashAlpha: 1,
    flashTimer: 0,
    deadTimer: 0,
    scored: new Set(),
    pipeCount: 0,
    bgX: 0,
  }), [])

  const spawnPipe = useCallback(() => {
    const minTopH = 60
    const maxTopH = GROUND_Y - PIPE_GAP - 60
    const topH = Math.floor(Math.random() * (maxTopH - minTopH)) + minTopH
    return { x: W + 10, topH }
  }, [])

  const checkCollision = useCallback((birdY, pipes) => {
    const bx = BIRD_X
    const by = birdY
    const br = BIRD_R - 5  // hitbox ligeramente menor al visual

    const CAP_H = 26
    const CAP_W = PIPE_W + 10

    // Suelo / techo
    if (by - br <= 0 || by + br >= GROUND_Y) return { hit: true, type: 'normal' }

    for (const p of pipes) {
      const bodyX    = p.x + 5
      const bodyRight = bodyX + PIPE_W
      const capX     = p.x
      const capRight  = capX + CAP_W

      const overlapBody = bx + br > bodyX && bx - br < bodyRight
      const overlapCap  = bx + br > capX  && bx - br < capRight

      const isCentered = bx > capX + 5 && bx < capRight - 5

      // Tubo de arriba
      if (overlapBody && by - br < p.topH) return { hit: true, type: isCentered ? 'enter_top' : 'normal', pipe: p }
      if (overlapCap  && by - br < p.topH + CAP_H) return { hit: true, type: isCentered ? 'enter_top' : 'normal', pipe: p }

      // Tubo de abajo
      if (overlapBody && by + br > p.topH + PIPE_GAP) return { hit: true, type: isCentered ? 'enter_bottom' : 'normal', pipe: p }
      if (overlapCap  && by + br > p.topH + PIPE_GAP - CAP_H) return { hit: true, type: isCentered ? 'enter_bottom' : 'normal', pipe: p }
    }
    return { hit: false }
  }, [])

  const jump = useCallback((clientX) => {
    const s = stateRef.current
    if (!s) return
    if (s.phase === 'select') {
      if (clientX !== undefined) {
        if (clientX < window.innerWidth / 2) s.character = 'bird'
        else s.character = 'quetz'
      } else {
        s.character = 'bird'
      }
      s.phase = 'start'
      return
    }
    if (s.phase === 'start') {
      s.phase = 'playing'
      s.birdVel = JUMP_VEL
      if (s.poops) s.poops.push({ x: BIRD_X - 10, y: s.birdY, velY: -1, velX: 1 })
      pipeTimerRef.current = 0
      return
    }
    if (s.phase === 'playing') {
      s.birdVel = JUMP_VEL
      if (s.poops) s.poops.push({ x: BIRD_X - 10, y: s.birdY, velY: -1, velX: 1 })
    }
    if (s.phase === 'dead' && s.deadTimer > 60) {
      const best = s.best
      stateRef.current = initState()
      stateRef.current.best = best
    }
  }, [initState])

  // Load images on mount
  useEffect(() => {
    const keys = ['bird', 'logo', 'quetz']
    const paths = {
      bird:      '/assets/retro/girl.png',
      logo:      '/assets/retro/logo_banner.png',
      quetz:     '/assets/Quetzal sin fondo.jpg',
    }
    Promise.all(
      keys.map(k => loadImage(paths[k], k === 'quetz').then(img => [k, img]))
    ).then(entries => {
      entries.forEach(([k, img]) => {
        if (img) imgsRef.current[k] = img
      })
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
      const t = e.touches[0];
      jump(t ? t.clientX : undefined) 
    }
    const onClick = (e) => jump(e.clientX)

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
          const np = spawnPipe()
          np.n = ++s.pipeCount
          s.pipes.push(np)
          pipeTimerRef.current = 0
        }
        s.pipes.forEach(p => { p.x -= speed })
        s.pipes = s.pipes.filter(p => p.x > -80)

        s.pipes.forEach(p => {
          const ballX = p.x + 5 + PIPE_W / 2
          const ballY = p.topH + PIPE_GAP / 2
          if (!p.collected && Math.hypot(ballX - BIRD_X, ballY - s.birdY) < COLLECT_R) {
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

        const col = checkCollision(s.birdY, s.pipes)
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
          s.birdY = Math.min(s.birdY + s.birdVel, GROUND_Y - BIRD_R)
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
        if (s.poops) {
          s.poops.forEach(p => {
            p.x -= speed - p.velX
            p.velY += GRAVITY * 0.8
            p.y += p.velY
          })
          s.poops = s.poops.filter(p => p.y < H && p.x > -20)
        }
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
        if (s.character === 'quetz') {
          drawQuetzalImg(ctx, imgs, BIRD_X, s.birdY, Math.min(Math.max(s.birdVel, -5), 5), Date.now())
        } else {
          if (imgs['bird']) {
            drawBirdImg(ctx, imgs, BIRD_X, s.birdY, Math.min(Math.max(s.birdVel, -5), 5))
          } else {
            drawBirdCanvas(ctx, BIRD_X, s.birdY, Math.min(Math.max(s.birdVel, -5), 5), s.wingFrame)
          }
        }
        ctx.restore()
      }

      drawGround(ctx, s.groundX)

      s.pipes.forEach(p => {
        drawBuilding(ctx, imgs, p, PIPE_GAP)
        if (!p.collected) drawBall(ctx, p.x + 5 + PIPE_W / 2, p.topH + PIPE_GAP / 2, p.n)
      })

      if (s.poops) {
        s.poops.forEach(p => {
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
          ctx.arc(p.x, p.y - 3, 2.5, 0, Math.PI * 2)
          ctx.arc(p.x, p.y - 5.5, 1.2, 0, Math.PI * 2)
          ctx.fill()
        })
      }

      ctx.save()
      if (s.rainbowBirdTimer && s.rainbowBirdTimer > 0) {
        ctx.filter = `hue-rotate(${(Date.now() / 4) % 360}deg) saturate(200%)`
      }

      const renderChar = (ctx, char, x, y, vel, wFrame, globalTime) => {
        if (char === 'quetz') {
          drawQuetzalImg(ctx, imgs, x, y, vel, globalTime || Date.now())
        } else {
          if (imgs['bird']) {
            drawBirdImg(ctx, imgs, x, y, vel)
          } else {
            drawBirdCanvas(ctx, x, y, vel, wFrame)
          }
        }
      }

      if (s.phase === 'select') {
        ctx.restore() // quitamos el filtro arcoíris si lo hubiera para esta pantalla (no deberia)
        drawCharacterSelect(ctx, Date.now(), imgs)
      } else if (s.phase === 'start') {
        const floatY = s.birdY + Math.sin(Date.now() / 300) * 6
        renderChar(ctx, s.character, BIRD_X, floatY, 0, s.wingFrame, Date.now())
        ctx.restore()
        drawStartScreen(ctx, s.flashAlpha)
      } else {
        if (!s.isHidden && s.phase !== 'pipe_enter') {
          renderChar(ctx, s.character, BIRD_X, s.birdY, Math.min(Math.max(s.birdVel, -5), 5), s.wingFrame, Date.now())
        }
        ctx.restore()

        drawScore(ctx, s.score)
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
