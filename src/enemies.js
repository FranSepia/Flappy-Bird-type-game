// ─── ENEMIGOS ─────────────────────────────────────────────────────────────────
// Cada enemigo manda en su tema: entra cuando empieza su tanda de 10 obstáculos,
// te hostiga desde el fondo y se va cuando cambia el tema. No tienen vida ni se
// derrotan — la corrida sigue siendo infinita, ellos solo la ponen tensa.
//
// El tema 0 (edificios) queda sin enemigo a propósito: sirve de respiro y hace
// que las otras dos tandas peguen más fuerte.

const W = 320

export const ENEMY_BY_THEME = {
  1: 'denibot',      // papeleo
  2: 'clocktitan',   // reloj
}

export const ENEMY_META = {
  denibot: {
    name: 'DENI-BOT',
    tag: 'PAPERWORK NEVER STOPS',
    src: '/assets/retro/denibot.png',
    shot: 'paper',
    fireMs: 1900,
    glow: '#ff3b3b',
  },
  clocktitan: {
    name: 'CLOCKTITAN',
    tag: 'TIME IS MY WEAPON',
    src: '/assets/retro/clocktitan.png',
    shot: 'hand',
    fireMs: 2200,
    glow: '#ffb021',
  },
}

const SCALE = 0.78          // 200px de origen -> 156px en pantalla
const HOME_X = 236          // centro del enemigo cuando está en posición
const HOME_Y = 232
const SLIDE_MS = 900        // entrada y salida
const CHARGE_MS = 480       // aviso antes de disparar

// Perfil de cada proyectil. Los papeles son lentos y ondean; las agujas van
// rectas y rápido. Esa diferencia es lo que hace que los dos temas se sientan
// distintos aunque el esquema sea el mismo.
const SHOTS = {
  paper: { speed: 150, r: 7, wobble: 26, spin: 0.004 },
  hand:  { speed: 265, r: 6, wobble: 0, spin: 0 },
}

export function createEnemy(id) {
  return { id, t: 0, phase: 'in', slide: 1, fireTimer: -600, charge: 0 }
}

const easeOut = (t) => 1 - (1 - t) ** 3

// Posición actual: fuera de pantalla a la derecha cuando slide = 1.
export function enemyPos(e) {
  return { x: HOME_X + e.slide * (W + 140 - HOME_X), y: HOME_Y + Math.sin(e.t / 520) * 7 }
}

// Avanza el enemigo. Devuelve los proyectiles nuevos que disparó en este frame.
export function updateEnemy(e, dt, targetY) {
  e.t += dt
  const shots = []

  if (e.phase === 'in') {
    e.slide = Math.max(0, e.slide - dt / SLIDE_MS)
    if (e.slide === 0) e.phase = 'idle'
  } else if (e.phase === 'out') {
    e.slide = Math.min(1, e.slide + dt / SLIDE_MS)
    return shots
  }

  if (e.phase !== 'idle') return shots

  const meta = ENEMY_META[e.id]
  e.fireTimer += dt

  // Carga: el enemigo destella antes de tirar, así el disparo nunca es injusto.
  e.charge = e.fireTimer > meta.fireMs - CHARGE_MS
    ? (e.fireTimer - (meta.fireMs - CHARGE_MS)) / CHARGE_MS
    : 0

  if (e.fireTimer >= meta.fireMs) {
    e.fireTimer = 0
    e.charge = 0
    const p = enemyPos(e)
    const cfg = SHOTS[meta.shot]
    // Apunta a la altura del jugador con una desviación chica: hay que
    // esquivarlo, pero no persigue.
    const aim = targetY + (Math.random() - 0.5) * 70
    shots.push({
      kind: meta.shot,
      x: p.x - 58,
      y: p.y - 6,
      baseY: p.y - 6,
      aimY: aim,
      travelled: 0,
      rot: 0,
      r: cfg.r,
    })
  }

  return shots
}

export function startExit(e) {
  if (e.phase !== 'out') e.phase = 'out'
}

export function enemyGone(e) {
  return e.phase === 'out' && e.slide >= 1
}

// Avanza los proyectiles y descarta los que salieron de pantalla.
export function updateShots(list, dt) {
  const alive = []
  for (const s of list) {
    const cfg = SHOTS[s.kind]
    const step = cfg.speed * (dt / 1000)
    s.x -= step
    s.travelled += step
    s.rot += cfg.spin * dt

    // Interpola hacia la altura apuntada y, si ondea, le suma el vaivén.
    const k = Math.min(1, s.travelled / 240)
    s.y = s.baseY + (s.aimY - s.baseY) * easeOut(k)
    if (cfg.wobble) s.y += Math.sin(s.travelled / 34) * cfg.wobble * (1 - k * 0.5)

    if (s.x > -30) alive.push(s)
  }
  return alive
}

// ¿Algún proyectil toca al personaje? Recibe los círculos de colisión del jugador.
export function shotHits(list, circles) {
  for (const s of list) {
    for (const c of circles) {
      if (Math.hypot(s.x - c.x, s.y - c.y) < s.r + c.r) return true
    }
  }
  return false
}

export function drawEnemy(ctx, img, e) {
  if (!img) return
  const p = enemyPos(e)
  const w = img.width * SCALE
  const h = img.height * SCALE

  ctx.save()
  // Va en el fondo: apenas translúcido para que no compita con los obstáculos.
  ctx.globalAlpha = 0.92
  if (e.charge > 0) {
    ctx.shadowColor = ENEMY_META[e.id].glow
    ctx.shadowBlur = 6 + e.charge * 26
  }
  ctx.drawImage(img, p.x - w / 2, p.y - h / 2, w, h)
  ctx.restore()
}

function drawPaper(ctx, s) {
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.rotate(s.rot)
  ctx.fillStyle = '#1a0d2e'
  ctx.fillRect(-8, -10, 16, 20)
  ctx.fillStyle = '#efe6cf'
  ctx.fillRect(-7, -9, 14, 18)
  ctx.fillStyle = '#b9ac8d'
  ctx.fillRect(-5, -5, 10, 1)
  ctx.fillRect(-5, -1, 10, 1)
  ctx.fillStyle = '#d02030'
  ctx.fillRect(-5, 3, 10, 4)
  ctx.restore()
}

function drawHand(ctx, s) {
  ctx.save()
  ctx.translate(s.x, s.y)
  // Estela roja
  ctx.fillStyle = 'rgba(255, 60, 40, 0.5)'
  ctx.fillRect(2, -2, 26, 4)
  ctx.fillStyle = '#1a0d2e'
  ctx.beginPath()
  ctx.moveTo(-13, 0); ctx.lineTo(5, -6); ctx.lineTo(5, 6)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#ffc93c'
  ctx.beginPath()
  ctx.moveTo(-10, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#fff3c4'
  ctx.beginPath()
  ctx.moveTo(-9, 0); ctx.lineTo(1, -2); ctx.lineTo(1, 1)
  ctx.closePath(); ctx.fill()
  ctx.restore()
}

export function drawShots(ctx, list) {
  for (const s of list) {
    if (s.kind === 'paper') drawPaper(ctx, s)
    else drawHand(ctx, s)
  }
}
