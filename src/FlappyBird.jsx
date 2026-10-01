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

// ─── CANVAS FALLBACK DRAWERS (used when images not uploaded yet) ──────────────

function drawCloudCanvas(ctx, x, y, s) {
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(x, y, 20 * s, 0, Math.PI * 2)
  ctx.arc(x + 22 * s, y - 4 * s, 14 * s, 0, Math.PI * 2)
  ctx.arc(x + 38 * s, y, 16 * s, 0, Math.PI * 2)
  ctx.arc(x + 18 * s, y + 6 * s, 12 * s, 0, Math.PI * 2)
  ctx.fill()
}

function drawPipeCanvas(ctx, x, topH, gap) {
  const capW = PIPE_W + 10
  const capH = 26
  const bX = x + 5

  const bodyGrad = ctx.createLinearGradient(bX, 0, bX + PIPE_W, 0)
  bodyGrad.addColorStop(0, '#548920')
  bodyGrad.addColorStop(0.15, '#73bf2e')
  bodyGrad.addColorStop(0.45, '#a8e063')
  bodyGrad.addColorStop(0.75, '#73bf2e')
  bodyGrad.addColorStop(1, '#548920')

  const capGrad = ctx.createLinearGradient(x, 0, x + capW, 0)
  capGrad.addColorStop(0, '#3a6b10')
  capGrad.addColorStop(0.12, '#5fa01e')
  capGrad.addColorStop(0.4, '#8dd63a')
  capGrad.addColorStop(0.7, '#5fa01e')
  capGrad.addColorStop(1, '#3a6b10')

  // Bottom pipe
  const botY = topH + gap
  ctx.fillStyle = bodyGrad
  ctx.fillRect(bX, botY, PIPE_W, H - botY)
  ctx.strokeStyle = '#375c0e'
  ctx.lineWidth = 2
  ctx.strokeRect(bX, botY, PIPE_W, H - botY)
  ctx.fillStyle = capGrad
  ctx.fillRect(x, botY - capH, capW, capH)
  ctx.strokeStyle = '#2b5009'
  ctx.strokeRect(x, botY - capH, capW, capH)

  // Top pipe
  ctx.fillStyle = bodyGrad
  ctx.fillRect(bX, 0, PIPE_W, topH)
  ctx.strokeStyle = '#375c0e'
  ctx.strokeRect(bX, 0, PIPE_W, topH)
  ctx.fillStyle = capGrad
  ctx.fillRect(x, topH, capW, capH)
  ctx.strokeStyle = '#2b5009'
  ctx.strokeRect(x, topH, capW, capH)
}

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

function drawBirdImg(ctx, imgs, x, y, vel, wingFrame) {
  const angle = Math.min(Math.max(vel * 0.06, -0.5), 1.2)
  const frameKeys = ['bird_mid', 'bird_up', 'bird_down']
  const key = imgs[frameKeys[wingFrame]] ? frameKeys[wingFrame] : 'bird'
  const img = imgs[key]
  if (!img) return

  const size = BIRD_R * 3.125
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.drawImage(img, -size / 2, -size / 2, size, size)
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

function drawCharacterSelect(ctx, time, imgs) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, W, H)

  ctx.save()
  ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 5
  ctx.strokeText('ELIGE TU', W/2, 120)
  ctx.fillText('ELIGE TU', W/2, 120)
  ctx.strokeText('PERSONAJE', W/2, 160)
  ctx.fillText('PERSONAJE', W/2, 160)
  ctx.restore()

  // Izquierda: X center = 85
  drawPanel(ctx, 30, 220, 110, 130, 10)
  ctx.save()
  ctx.font = 'bold 18px "Segoe UI", Arial'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#5a3a00'
  ctx.fillText('FLAPPY', 85, 335)
  ctx.restore()
  if (imgs['bird'] || imgs['bird_mid']) {
    drawBirdImg(ctx, imgs, 85, 275, 0, Math.floor((time/150)%3))
  } else {
    drawBirdCanvas(ctx, 85, 275, 0, Math.floor((time/150)%3))
  }

  // Derecha: X center = 235
  drawPanel(ctx, 180, 220, 110, 130, 10)
  ctx.save()
  ctx.font = 'bold 16px "Segoe UI", Arial'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#5a3a00'
  ctx.fillText('QUETZAL', 235, 335)
  ctx.restore()
  drawQuetzalImg(ctx, imgs, 235, 275, 0, time)
}

function drawPipeImg(ctx, imgs, x, topH, gap) {
  const img = imgs['pipe']
  if (!img) return

  const pipeW = PIPE_W + 10  // match cap width
  const capH = Math.round(img.height * (pipeW / img.width)) // keep aspect for cap portion
  const actualCapH = 26

  // Bottom pipe body
  const botCapY = topH + gap - actualCapH
  const botBodyY = topH + gap
  const botBodyH = H - botBodyY

  // Draw bottom cap (top portion of image)
  ctx.drawImage(img, x, botCapY, pipeW, actualCapH + botBodyH)

  // Top pipe (flip vertically)
  ctx.save()
  ctx.translate(x + pipeW / 2, topH / 2)
  ctx.scale(1, -1)
  ctx.drawImage(img, -pipeW / 2, -topH / 2, pipeW, topH + actualCapH)
  ctx.restore()
}

function drawCloudImg(ctx, img, x, y, s) {
  const w = 80 * s
  const h = 40 * s
  ctx.drawImage(img, x - w * 0.2, y - h * 0.5, w, h)
}

// ─── SHARED DRAW FUNCTIONS ────────────────────────────────────────────────────

function drawBackground(ctx, clouds, imgs, isNight) {
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
  if (isNight) {
    grad.addColorStop(0, '#000822')
    grad.addColorStop(1, '#001a4d')
  } else {
    grad.addColorStop(0, '#4ec0ca')
    grad.addColorStop(1, '#9ee6f0')
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, GROUND_Y)

  if (isNight) {
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 20; i++) {
      const sx = (Math.sin(i * 123) * 0.5 + 0.5) * W
      const sy = (Math.cos(i * 321) * 0.5 + 0.5) * GROUND_Y
      ctx.fillRect(sx, sy, 2, 2)
    }
  }

  ctx.save()
  if (isNight) ctx.globalAlpha = 0.4
  clouds.forEach(c => {
    if (imgs['cloud']) {
      drawCloudImg(ctx, imgs['cloud'], c.x, c.y, c.s)
    } else {
      drawCloudCanvas(ctx, c.x, c.y, c.s)
    }
  })
  ctx.restore()
}

function drawGround(ctx, groundX) {
  ctx.fillStyle = '#ded895'
  ctx.fillRect(0, GROUND_Y, W, GROUND_H)
  ctx.fillStyle = '#5ec22f'
  ctx.fillRect(0, GROUND_Y, W, 20)
  ctx.fillStyle = '#c8c269'
  for (let i = 0; i < 5; i++) {
    const sx = ((groundX + i * 64) % W) - 64
    ctx.fillRect(sx, GROUND_Y + 28, 48, 10)
    ctx.fillRect(sx, GROUND_Y + 48, 30, 8)
    ctx.fillRect(sx, GROUND_Y + 64, 40, 8)
  }
  ctx.fillStyle = '#72d935'
  ctx.fillRect(0, GROUND_Y, W, 8)
  ctx.fillStyle = '#3a9e14'
  ctx.fillRect(0, GROUND_Y + 20, W, 3)
}

function drawScore(ctx, score) {
  ctx.save()
  ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.strokeText(String(score), W / 2, 70)
  ctx.fillStyle = '#fff'
  ctx.fillText(String(score), W / 2, 70)
  ctx.restore()
}

function drawPanel(ctx, x, y, w, h, radius = 10) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  ctx.fillStyle = '#e8d5a3'
  ctx.fill()
  ctx.strokeStyle = '#b89050'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.restore()
}

function drawStartScreen(ctx, flashAlpha) {
  const logoY = 110
  ctx.save()
  ctx.font = 'bold 56px "Segoe UI", Arial Black, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#6b4c12'
  ctx.fillText('FLAPPY', W / 2 + 3, logoY + 3)
  ctx.strokeStyle = '#6b4c12'
  ctx.lineWidth = 8
  ctx.lineJoin = 'round'
  ctx.strokeText('FLAPPY', W / 2, logoY)
  const g1 = ctx.createLinearGradient(0, logoY - 50, 0, logoY + 10)
  g1.addColorStop(0, '#ffe44e')
  g1.addColorStop(0.5, '#f5c200')
  g1.addColorStop(1, '#e09400')
  ctx.fillStyle = g1
  ctx.fillText('FLAPPY', W / 2, logoY)
  ctx.restore()

  ctx.save()
  ctx.font = 'bold 56px "Segoe UI", Arial Black, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#4a2800'
  ctx.fillText('BIRD', W / 2 + 3, logoY + 61)
  ctx.strokeStyle = '#4a2800'
  ctx.lineWidth = 8
  ctx.lineJoin = 'round'
  ctx.strokeText('BIRD', W / 2, logoY + 58)
  const g2 = ctx.createLinearGradient(0, logoY + 10, 0, logoY + 68)
  g2.addColorStop(0, '#fff')
  g2.addColorStop(1, '#dde')
  ctx.fillStyle = g2
  ctx.fillText('BIRD', W / 2, logoY + 58)
  ctx.restore()

  ctx.save()
  ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 5
  ctx.lineJoin = 'round'
  ctx.strokeText('GET READY!', W / 2, 280)
  ctx.fillStyle = '#fff'
  ctx.fillText('GET READY!', W / 2, 280)
  ctx.restore()

  if (flashAlpha > 0.3) {
    drawPanel(ctx, W / 2 - 110, 310, 220, 56, 10)
    ctx.save()
    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#5a3a00'
    ctx.fillText('👆  TAP TO START', W / 2, 347)
    ctx.restore()
  }
}

function drawGameOver(ctx, score, best) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, 0, W, H)

  const bannerY = 150
  drawPanel(ctx, W / 2 - 140, bannerY, 280, 60, 10)
  ctx.save()
  ctx.font = 'bold 40px "Segoe UI", Arial Black, sans-serif'
  ctx.textAlign = 'center'
  ctx.strokeStyle = '#7a0000'
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.strokeText('GAME OVER', W / 2, bannerY + 44)
  ctx.fillStyle = '#fff'
  ctx.fillText('GAME OVER', W / 2, bannerY + 44)
  ctx.restore()

  const panelX = W / 2 - 130
  const panelY = 230
  drawPanel(ctx, panelX, panelY, 260, 120, 12)

  ctx.save()
  ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#8b6914'
  ctx.fillText('SCORE', panelX + 20, panelY + 38)
  ctx.textAlign = 'right'
  ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 4
  ctx.lineJoin = 'round'
  ctx.strokeText(String(score), panelX + 240, panelY + 40)
  ctx.fillStyle = '#fff'
  ctx.fillText(String(score), panelX + 240, panelY + 40)
  ctx.restore()

  ctx.strokeStyle = '#c8a560'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(panelX + 15, panelY + 60)
  ctx.lineTo(panelX + 245, panelY + 60)
  ctx.stroke()

  ctx.save()
  ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#8b6914'
  ctx.fillText('BEST', panelX + 20, panelY + 100)
  ctx.textAlign = 'right'
  ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 4
  ctx.lineJoin = 'round'
  ctx.strokeText(String(best), panelX + 240, panelY + 100)
  ctx.fillStyle = '#fff'
  ctx.fillText(String(best), panelX + 240, panelY + 100)
  ctx.restore()

  if (score >= 10) {
    const medal = score >= 40 ? '#ffd700' : score >= 20 ? '#c0c0c0' : '#cd7f32'
    ctx.save()
    ctx.beginPath()
    ctx.arc(panelX + 55, panelY + 70, 28, 0, Math.PI * 2)
    ctx.fillStyle = medal
    ctx.fill()
    ctx.strokeStyle = '#8b6914'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.font = '20px Arial'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.fillText(score >= 40 ? '🏆' : score >= 20 ? '🥈' : '🥉', panelX + 55, panelY + 77)
    ctx.restore()
  }

  const btnY = 378
  drawPanel(ctx, W / 2 - 90, btnY, 180, 56, 12)
  ctx.save()
  ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#5a3a00'
  ctx.fillText('▶  PLAY AGAIN', W / 2, btnY + 36)
  ctx.restore()
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
    const keys = ['bird', 'bird_mid', 'bird_up', 'bird_down', 'pipe', 'cloud', 'quetz']
    const paths = {
      bird:      '/assets/imagen-pajaro.png',
      bird_mid:  '/assets/bird_mid.png',
      bird_up:   '/assets/bird_up.png',
      bird_down: '/assets/bird_down.png',
      pipe:      '/assets/pipe.png',
      cloud:     '/assets/cloud.png',
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
          s.pipes.push(spawnPipe())
          pipeTimerRef.current = 0
        }
        s.pipes.forEach(p => { p.x -= speed })
        s.pipes = s.pipes.filter(p => p.x > -80)

        s.pipes.forEach(p => {
          const mid = p.x + 5 + PIPE_W / 2
          if (!s.scored.has(p) && mid < BIRD_X) {
            s.scored.add(p)
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
      drawBackground(ctx, s.clouds, imgs, s.fireworksTimer > 0)

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
          if (imgs['bird'] || imgs['bird_mid']) {
            drawBirdImg(ctx, imgs, BIRD_X, s.birdY, Math.min(Math.max(s.birdVel, -5), 5), s.wingFrame)
          } else {
            drawBirdCanvas(ctx, BIRD_X, s.birdY, Math.min(Math.max(s.birdVel, -5), 5), s.wingFrame)
          }
        }
        ctx.restore()
      }

      s.pipes.forEach(p => {
        if (imgs['pipe']) {
          drawPipeImg(ctx, imgs, p.x, p.topH, PIPE_GAP)
        } else {
          drawPipeCanvas(ctx, p.x, p.topH, PIPE_GAP)
        }
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

      drawGround(ctx, s.groundX)

      ctx.save()
      if (s.rainbowBirdTimer && s.rainbowBirdTimer > 0) {
        ctx.filter = `hue-rotate(${(Date.now() / 4) % 360}deg) saturate(200%)`
      }

      const renderChar = (ctx, char, x, y, vel, wFrame, globalTime) => {
        if (char === 'quetz') {
          drawQuetzalImg(ctx, imgs, x, y, vel, globalTime || Date.now())
        } else {
          if (imgs['bird'] || imgs['bird_mid']) {
            drawBirdImg(ctx, imgs, x, y, vel, wFrame)
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
      width={W}
      height={H}
      style={{ display: 'block', imageRendering: 'pixelated', cursor: 'pointer' }}
    />
  )
}
