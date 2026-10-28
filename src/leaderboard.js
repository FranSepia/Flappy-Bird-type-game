// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
// Tabla de puntajes estilo arcade. Por ahora vive en localStorage con datos de
// relleno; cuando haya base de datos solo hay que reemplazar readScores() y
// submitScore() por llamadas al servidor. El resto del juego no se entera: lee
// siempre de la cache sincrónica que mantiene este módulo.
//
// Reglas del usuario: se entra escribiendo un nombre, sin contraseña. Dos
// jugadores con el mismo nombre son el mismo jugador — las entradas se fusionan
// en una sola y queda el mejor puntaje.

const SCORES_KEY = 'fb_scores'
const NAME_KEY = 'fb_name'

export const MAX_NAME = 10

// Relleno hasta que exista la base de datos, para que la tabla no arranque vacía.
const SEED = [
  { name: 'NOVA',   score: 248 },
  { name: 'DREX',   score: 191 },
  { name: 'KIRA',   score: 156 },
  { name: 'ONYX',   score: 132 },
  { name: 'VEGA',   score: 118 },
  { name: 'MILO',   score: 97 },
  { name: 'ZAX',    score: 84 },
  { name: 'LUNA',   score: 73 },
  { name: 'AXL',    score: 61 },
  { name: 'RYU',    score: 45 },
]

// Un nombre es su versión normalizada: así "ana", "ANA " y "Ana" son el mismo
// jugador y sus entradas se fusionan solas.
export function normalizeName(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, MAX_NAME)
}

let cache = null

function readScores() {
  try {
    const raw = localStorage.getItem(SCORES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    // JSON corrupto o localStorage bloqueado: se arranca del relleno.
  }
  return SEED.map(e => ({ ...e }))
}

function persist(list) {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(list))
  } catch (e) {
    // Sin localStorage la tabla igual funciona en memoria durante la partida.
  }
}

function sorted(list) {
  return [...list].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

export function getScores() {
  if (!cache) cache = sorted(readScores())
  return cache
}

export function topScores(n) {
  return getScores().slice(0, n)
}

// Devuelve la posición (1-based) del jugador, o 0 si no está en la tabla.
export function rankOf(name) {
  const key = normalizeName(name)
  if (!key) return 0
  const i = getScores().findIndex(e => normalizeName(e.name) === key)
  return i < 0 ? 0 : i + 1
}

// Guarda el puntaje fusionando por nombre: si ya existe, queda el mejor.
export function submitScore(name, score) {
  const key = normalizeName(name)
  if (!key || !Number.isFinite(score) || score <= 0) return getScores()

  const list = getScores().filter(e => normalizeName(e.name) !== key)
  const previous = getScores().find(e => normalizeName(e.name) === key)
  list.push({ name: key, score: Math.max(score, previous ? previous.score : 0) })

  cache = sorted(list)
  persist(cache)
  return cache
}

export function getPlayerName() {
  try {
    return normalizeName(localStorage.getItem(NAME_KEY))
  } catch (e) {
    return ''
  }
}

export function setPlayerName(name) {
  const key = normalizeName(name)
  try {
    localStorage.setItem(NAME_KEY, key)
  } catch (e) {
    // Si no se puede guardar, el nombre dura lo que dure la pestaña.
  }
  return key
}
