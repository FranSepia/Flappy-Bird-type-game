// ─── HÉROES ───────────────────────────────────────────────────────────────────
// Los tres personajes extra. Son sprites PNG en pose de vuelo, con la estela de
// energía ya dibujada y el fondo recortado, igual que girl.png (Brightstar).

export const HERO_IDS = ['bird', 'scarlet', 'aegis', 'tempest']

export const HERO_META = {
  scarlet: { name: 'SCARLET', src: '/assets/retro/scarlet.png' },
  aegis:   { name: 'AEGIS',   src: '/assets/retro/aegis.png' },
  tempest: { name: 'TEMPEST', src: '/assets/retro/tempest.png' },
}

// Los tres sprites son 200x133 y comparten composición: el cuerpo ocupa el
// tercio derecho y la estela se extiende hacia atrás. Por eso un solo ancla y
// una sola escala sirven para los tres.
//
// Ajuste fino: subir HERO_SCALE agranda al personaje; HERO_ANCHOR_X lo corre
// hacia adelante/atrás respecto del punto de colisión, HERO_ANCHOR_Y hacia
// arriba/abajo. Con ?debug en la URL se ven los círculos de colisión dibujados.
export const HERO_SCALE = 0.545   // 200px -> ~109px en pantalla
export const HERO_ANCHOR_X = 0.75
export const HERO_ANCHOR_Y = 0.47

// Círculos de colisión [dx, dy, r] relativos al ancla, en píxeles de juego.
// Misma pose en los tres, así que comparten hitbox.
export const HERO_HIT_CIRCLES = [
  [20, -6, 5],    // puño adelantado
  [16, -10, 7],   // cabeza
  [-1, -1, 10],   // torso
  [-12, 6, 7],    // caderas
  [-22, 11, 5],   // piernas
]

export function drawHero(ctx, img, x, y, vel) {
  if (!img) return
  const angle = Math.min(Math.max(vel * 0.06, -0.5), 1.2)
  const w = img.width * HERO_SCALE
  const h = img.height * HERO_SCALE
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.drawImage(img, -w * HERO_ANCHOR_X, -h * HERO_ANCHOR_Y, w, h)
  ctx.restore()
}
