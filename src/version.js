/**
 * Versjonsinfo for visning i UI og PDF-rapport.
 * __APP_COMMIT__ og __APP_BUILD_TIME__ settes ved bygging i vite.config.js
 * (commit-hash fra GITHUB_SHA eller git, og byggetidspunkt i UTC).
 * Under `npm run dev` er verdiene fra da dev-serveren startet.
 */

/* global __APP_COMMIT__, __APP_BUILD_TIME__ */
export const COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'unknown';
export const BUILD_TIME = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';
export const IS_DEV = import.meta.env?.DEV === true;

const REPO_URL = 'https://github.com/NilsAE74/RENE-CloudStream3D';

/** Byggedato som YYYY-MM-DD (UTC) */
export const BUILD_DATE = BUILD_TIME ? BUILD_TIME.slice(0, 10) : '';

/** Kort tekst, f.eks. "CloudStream3D 161da9e · 2026-11-24" (+ " · dev" lokalt) */
export const VERSION_TEXT = `CloudStream3D ${COMMIT}${BUILD_DATE ? ` · ${BUILD_DATE}` : ''}${IS_DEV ? ' · dev' : ''}`;

/** Lenke til commiten på GitHub, eller null hvis hashen er ukjent/har lokale endringer */
export const COMMIT_URL = /^[0-9a-f]{7}$/.test(COMMIT) ? `${REPO_URL}/commit/${COMMIT}` : null;

/**
 * Viser versjonen nederst på midten av skjermen.
 */
export function showVersionLabel() {
  const el = document.createElement(COMMIT_URL ? 'a' : 'div');
  el.id = 'version-label';
  el.className = 'version-label';
  el.textContent = VERSION_TEXT;
  el.title = `Commit ${COMMIT}${BUILD_TIME ? `, built ${BUILD_TIME.replace('T', ' ').slice(0, 16)} UTC` : ''}`;
  if (COMMIT_URL) {
    el.href = COMMIT_URL;
    el.target = '_blank';
    el.rel = 'noopener';
  }
  document.body.appendChild(el);
  console.log(`🏷️ ${VERSION_TEXT}`);
}
