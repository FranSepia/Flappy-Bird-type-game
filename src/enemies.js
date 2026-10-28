// ─── ENEMIGOS ─────────────────────────────────────────────────────────────────
// Los enemigos no conviven con las columnas: son un encuentro aparte.
//
// Al terminar una tanda de 10 columnas de un tema con enemigo, las columnas
// dejan de salir, el enemigo entra volando y durante el tiempo equivalente a
// 5 columnas te bombardea. Sobrevivís, se va, cobrás BOSS_REWARD y vuelven las
// columnas. No tiene vida ni se derrota: la corrida sigue siendo infinita.
//
// Tanda 10 (edificios) no tiene enemigo y queda de respiro.
// Tanda 20 (papeleo)  -> DENI-BOT
// Tanda 30 (reloj)    -> CLOCKTITAN
// Después se repite, un poco más difícil cada vuelta.

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
    volleyMs: 1250,
    glow: '#ff3b3b',
    jet: ['#ff5a3c', '#ffd06a'],
  },
  clocktitan: {
    name: 'CLOCKTITAN',
    tag: 'TIME IS MY WEAPON',
    src: '/assets/retro/clocktitan.png',
    shot: 'hand',
    volleyMs: 1450,
    glow: '#ffb021',
    jet: ['#ffb021', '#fff0b0'],
  },
}

// El encuentro dura lo mismo que 5 columnas (PIPE_INTERVAL = 1500 ms).
export const BOSS_MS = 7500
export const BOSS_REWARD = 10

const SCALE = 0.9           // 200px de origen -> 180px en pantalla
const HOME_X = 240          // bien a la derecha: deja pista para ver venir el tiro

// Apoya los pies sobre la segunda línea de la grilla del suelo contando desde
// abajo. La grilla se dibuja en y = GROUND_Y + GROUND_H * (i/5)^2, o sea en
// 460, 474, 496, 528 y 568; la segunda desde abajo es 496.
const FOOT_Y = 496
const HOME_Y = FOOT_Y - (200 * SCALE) / 2
const SLIDE_MS = 850
const CHARGE_MS = 520       // aviso antes de cada andanada

// Proyectiles grandes y lentos: se esquivan leyendo la trayectoria, no de reflejo.
// Con el jugador en x=72 y el disparo saliendo en x~270, el papel tarda ~2 s en
// llegar y la aguja ~1,6 s. Ese es el margen para maniobrar.
const SHOTS = {
  paper: { speed: 96, r: 13, wobble: 30, spin: 0.0028, size: 26 },
  hand:  { speed: 126, r: 11, wobble: 0, spin: 0, size: 24 },
}

// Franja jugable donde se reparten los carriles de la andanada.
const LANE_LO = 70
const LANE_HI = 410

const easeOut = (t) => 1 - (1 - t) ** 3

// cycle = cuántos encuentros ya peleaste. Sube la dificultad de a poco.
export function createEnemy(id, cycle = 0) {
  return {
    id,
    cycle,
    t: 0,
    phase: 'in',
    slide: 1,
    fightMs: 0,
    fireTimer: 0,
    charge: 0,
  }
}

export function enemyPos(e) {
  return {
    x: HOME_X + e.slide * (W + 150 - HOME_X),
    // Apoyado en el suelo, así que apenas respira en lugar de flotar.
    y: HOME_Y + Math.sin(e.t / 540) * 3,
  }
}

// Arranca con un solo proyectil por andanada y sube muy de a poco.
function volleySize(e) {
  return Math.min(3, 1 + Math.floor(e.cycle / 3))
}

function speedMul(e) {
  return 1 + e.cycle * 0.06
}

// Avanza el enemigo. Devuelve { shots, done }: done avisa que terminó la pelea.
export function updateEnemy(e, dt, targetY) {
  e.t += dt
  const shots = []
  const meta = ENEMY_META[e.id]

  if (e.phase === 'in') {
    e.slide = Math.max(0, e.slide - dt / SLIDE_MS)
    if (e.slide === 0) e.phase = 'fight'
    return { shots, done: false }
  }

  if (e.phase === 'out') {
    e.slide = Math.min(1, e.slide + dt / SLIDE_MS)
    return { shots, done: false }
  }

  // ── Peleando ──
  e.fightMs += dt
  e.fireTimer += dt

  e.charge = e.fireTimer > meta.volleyMs - CHARGE_MS
    ? (e.fireTimer - (meta.volleyMs - CHARGE_MS)) / CHARGE_MS
    : 0

  if (e.fireTimer >= meta.volleyMs) {
    e.fireTimer = 0
    e.charge = 0
    const p = enemyPos(e)
    const n = volleySize(e)
    const launchY = p.y - 46        // a la altura del brazo, no de los pies

    const fire = (aimY) => shots.push({
      kind: meta.shot,
      mul: speedMul(e),
      x: p.x + 30,
      y: launchY,
      baseY: launchY,
      aimY: Math.max(LANE_LO, Math.min(LANE_HI, aimY)),
      travelled: 0,
      rot: 0,
      r: SHOTS[meta.shot].r,
    })

    if (n === 1) {
      // Un solo proyectil: va derecho a tu altura, así que igual hay que moverse.
      fire(targetY + (Math.random() - 0.5) * 36)
    } else {
      // Varios: cubren todos los carriles menos uno, y ese hueco nunca cae en el
      // carril donde ya estás.
      const slots = n + 1
      const slotH = (LANE_HI - LANE_LO) / slots
      const here = Math.max(0, Math.min(slots - 1, Math.floor((targetY - LANE_LO) / slotH)))
      let gap = Math.floor(Math.random() * slots)
      if (gap === here) gap = (here + 1 + Math.floor(Math.random() * (slots - 1))) % slots
      for (let i = 0; i < slots; i++) {
        if (i !== gap) fire(LANE_LO + slotH * (i + 0.5))
      }
    }
  }

  return { shots, done: e.fightMs >= BOSS_MS }
}

export function startExit(e) {
  if (e.phase !== 'out') e.phase = 'out'
}

export function enemyGone(e) {
  return e.phase === 'out' && e.slide >= 1
}

export function updateShots(list, dt) {
  const alive = []
  for (const s of list) {
    const cfg = SHOTS[s.kind]
    const step = cfg.speed * s.mul * (dt / 1000)
    s.x -= step
    s.travelled += step
    s.rot += cfg.spin * dt

    // Se acomoda rápido en su carril: hay que poder leer adónde va desde lejos.
    const k = Math.min(1, s.travelled / 120)
    s.y = s.baseY + (s.aimY - s.baseY) * easeOut(k)
    if (cfg.wobble) s.y += Math.sin(s.travelled / 38) * cfg.wobble * (1 - k * 0.55)

    if (s.x > -40) alive.push(s)
  }
  return alive
}

export function shotHits(list, circles) {
  for (const s of list) {
    for (const c of circles) {
      if (Math.hypot(s.x - c.x, s.y - c.y) < s.r + c.r) return true
    }
  }
  return false
}

// Escapes a la altura de los pies. Ya no son propulsores de vuelo: ahora el
// enemigo apoya en el suelo, así que son venteos cortos que delatan la máquina.
function drawJets(ctx, e, p, h) {
  const [hot, core] = ENEMY_META[e.id].jet
  const baseY = p.y + h * 0.44
  ctx.save()
  for (const dx of [-34, 34]) {
    const flick = 0.6 + Math.sin(e.t / 42 + dx) * 0.4
    const len = 11 * flick
    const x = p.x + dx

    ctx.globalAlpha = 0.38
    ctx.fillStyle = hot
    ctx.beginPath()
    ctx.moveTo(x - 11, baseY)
    ctx.lineTo(x + 11, baseY)
    ctx.lineTo(x, baseY + len)
    ctx.closePath()
    ctx.fill()

    ctx.globalAlpha = 0.8
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.moveTo(x - 5, baseY)
    ctx.lineTo(x + 5, baseY)
    ctx.lineTo(x, baseY + len * 0.6)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

export function drawEnemy(ctx, img, e) {
  if (!img) return
  const p = enemyPos(e)
  const w = img.width * SCALE
  const h = img.height * SCALE

  drawJets(ctx, e, p, h)

  ctx.save()
  if (e.charge > 0) {
    ctx.shadowColor = ENEMY_META[e.id].glow
    ctx.shadowBlur = 8 + e.charge * 30
  }
  ctx.drawImage(img, p.x - w / 2, p.y - h / 2, w, h)
  ctx.restore()
}

function drawPaper(ctx, s) {
  const u = SHOTS.paper.size / 2
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.rotate(s.rot)
  ctx.fillStyle = '#1a0d2e'
  ctx.fillRect(-u, -u - 2, u * 2, u * 2 + 4)
  ctx.fillStyle = '#efe6cf'
  ctx.fillRect(-u + 2, -u, u * 2 - 4, u * 2)
  ctx.fillStyle = '#b9ac8d'
  ctx.fillRect(-u + 5, -u + 5, u * 2 - 10, 2)
  ctx.fillRect(-u + 5, -u + 11, u * 2 - 10, 2)
  ctx.fillStyle = '#d02030'
  ctx.fillRect(-u + 5, u - 9, u * 2 - 10, 6)
  ctx.restore()
}

function drawHand(ctx, s) {
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.fillStyle = 'rgba(255, 60, 40, 0.45)'
  ctx.fillRect(4, -3, 40, 6)
  ctx.fillStyle = '#1a0d2e'
  ctx.beginPath()
  ctx.moveTo(-22, 0); ctx.lineTo(9, -10); ctx.lineTo(9, 10)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#ffc93c'
  ctx.beginPath()
  ctx.moveTo(-18, 0); ctx.lineTo(7, -7); ctx.lineTo(7, 7)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#fff3c4'
  ctx.beginPath()
  ctx.moveTo(-15, 0); ctx.lineTo(2, -3); ctx.lineTo(2, 2)
  ctx.closePath(); ctx.fill()
  ctx.restore()
}

export function drawShots(ctx, list) {
  for (const s of list) {
    if (s.kind === 'paper') drawPaper(ctx, s)
    else drawHand(ctx, s)
  }
}
