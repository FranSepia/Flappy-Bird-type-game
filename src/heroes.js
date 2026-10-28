// ─── HÉROES ───────────────────────────────────────────────────────────────────
// Los tres personajes extra. Son sprites PNG en pose de vuelo, con la estela de
// energía ya dibujada y el fondo recortado, igual que girl.png (Brightstar).

export const HERO_IDS = ['bird', 'scarlet', 'aegis', 'tempest']

// Cada sprite trae el cuerpo de un tamaño distinto dentro de la misma imagen de
// 200x133, así que con una escala común se veían de tamaños diferentes: medido,
// había hasta 35% de diferencia de altura entre Aegis y Brightstar.
//
// La escala de cada uno sale de igualar la MASA VISUAL (la media geométrica de
// ancho por alto del cuerpo) con la de Brightstar, que es 43.9 px. No se iguala
// la altura sola porque Brightstar vuela en pose compacta y los otros tres en
// pose más horizontal: emparejar alturas dejaría a los anchos enormes.
export const HERO_META = {
  scarlet: { name: 'SCARLET', src: '/assets/retro/scarlet.png', scale: 0.508 },
  aegis:   { name: 'AEGIS',   src: '/assets/retro/aegis.png',   scale: 0.575 },
  tempest: { name: 'TEMPEST', src: '/assets/retro/tempest.png', scale: 0.535 },
}

// Escala con la que se midieron los círculos de colisión de abajo.
export const HERO_BASE_SCALE = 0.545

export const HERO_ANCHOR_X = 0.75
export const HERO_ANCHOR_Y = 0.47

// Círculos de colisión [dx, dy, r] relativos al ancla, en píxeles de juego,
// a HERO_BASE_SCALE. heroHitCircles() los ajusta a la escala de cada héroe.
const BASE_HIT_CIRCLES = [
  [20, -6, 5],    // puño adelantado
  [16, -10, 7],   // cabeza
  [-1, -1, 10],   // torso
  [-12, 6, 7],    // caderas
  [-22, 11, 5],   // piernas
]

export function heroScale(id) {
  return HERO_META[id] ? HERO_META[id].scale : HERO_BASE_SCALE
}

// El hitbox tiene que encoger y crecer junto con el sprite.
export function heroHitCircles(id) {
  const k = heroScale(id) / HERO_BASE_SCALE
  return BASE_HIT_CIRCLES.map(([dx, dy, r]) => [dx * k, dy * k, r * k])
}

export function drawHero(ctx, id, img, x, y, vel) {
  if (!img) return
  const scale = heroScale(id)
  const angle = Math.min(Math.max(vel * 0.06, -0.5), 1.2)
  const w = img.width * scale
  const h = img.height * scale
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.drawImage(img, -w * HERO_ANCHOR_X, -h * HERO_ANCHOR_Y, w, h)
  ctx.restore()
}
