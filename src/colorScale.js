/**
 * Fargeskala for høydefarger (Z) – felles for punktsky, legende, dashboard og rapport.
 *
 * Alle Z-verdier her er ORIGINALE koordinater (ikke sentrerte).
 *
 * - Auto: skalaen strekkes fra laveste til høyeste Z i datasettet (standard).
 * - Manuell: brukeren setter min/maks. Punkter utenfor får endefargen.
 *   En manuell skala beholdes når en ny fil lastes, slik at flere filer
 *   kan sammenlignes med samme skala.
 */

const state = {
  auto: true,
  min: 0,
  max: 1,
  dataMin: 0,
  dataMax: 1
};

// Fargegradient: blå (hue 0.6) ved min til rød (hue 0.0) ved maks
const HUE_LOW = 0.6;

/**
 * Setter Z-området til datasettet som vises. I auto-modus følger skalaen dette.
 */
export function setDataRange(minZ, maxZ) {
  state.dataMin = minZ;
  state.dataMax = maxZ;
  if (state.auto) {
    state.min = minZ;
    state.max = maxZ;
  }
}

/**
 * Setter manuell fargeskala (slår av auto).
 */
export function setManualRange(minZ, maxZ) {
  state.auto = false;
  state.min = Math.min(minZ, maxZ);
  state.max = Math.max(minZ, maxZ);
}

/**
 * Går tilbake til auto (skala = datasettets Z-område).
 */
export function setAuto() {
  state.auto = true;
  state.min = state.dataMin;
  state.max = state.dataMax;
}

export function isAuto() {
  return state.auto;
}

/**
 * Returnerer gjeldende fargeskala { min, max } i originale Z-koordinater.
 */
export function getRange() {
  return { min: state.min, max: state.max };
}

/**
 * Speiler skalaen ved Z-invertering (z -> -z), både data- og manuelt område.
 */
export function invert() {
  [state.dataMin, state.dataMax] = [-state.dataMax, -state.dataMin];
  [state.min, state.max] = [-state.max, -state.min];
}

/**
 * Normalisert posisjon (0–1) for en Z-verdi i gjeldende skala, klippet til [0, 1].
 */
export function normalize(z, min = state.min, max = state.max) {
  const range = max - min;
  if (!(range > 0)) return 0.5;
  const t = (z - min) / range;
  return t < 0 ? 0 : (t > 1 ? 1 : t);
}

/**
 * Hue (0–1) for en Z-verdi.
 */
export function heightToHue(z, min = state.min, max = state.max) {
  return HUE_LOW - normalize(z, min, max) * HUE_LOW;
}

/**
 * Skriver høydefargen for en Z-verdi inn i en THREE.Color (target) og returnerer den.
 * min/max kan overstyres (brukes av default-terreng og parser før skalaen er satt).
 */
export function heightToColor(z, target, min = state.min, max = state.max) {
  target.setHSL(heightToHue(z, min, max), 1.0, 0.5);
  return target;
}

/**
 * Antall desimaler for Z-verdier, valgt ut fra spennet de vises i.
 * Spenn under 1 m vises med 3 desimaler (mm), ellers 2.
 */
export function zDecimals(span) {
  return Math.abs(span) < 1 ? 3 : 2;
}

/**
 * Antall desimaler for korte etiketter (histogram-intervaller, rapport-legende):
 * spenn < 1 m: 3, < 10 m: 2, ellers 1.
 */
export function labelDecimals(span) {
  const s = Math.abs(span);
  return s < 1 ? 3 : (s < 10 ? 2 : 1);
}
