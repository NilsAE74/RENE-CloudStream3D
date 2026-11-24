/**
 * Versjonsinfo for visning i UI, konsoll og PDF-rapport.
 * __APP_VERSION__, __APP_COMMIT__ og __APP_BUILD_TIME__ settes ved bygging i vite.config.js
 * (versjon fra package.json, commit-hash fra GITHUB_SHA eller git, og byggetidspunkt i UTC).
 * Under `npm run dev` er verdiene fra da dev-serveren startet.
 */

/* global __APP_VERSION__, __APP_COMMIT__, __APP_BUILD_TIME__ */
export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
export const COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'unknown';
export const BUILD_TIME = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';
export const IS_DEV = import.meta.env?.DEV === true;

const REPO_URL = 'https://github.com/NilsAE74/RENE-CloudStream3D';

/** Byggedato som YYYY-MM-DD (UTC) */
export const BUILD_DATE = BUILD_TIME ? BUILD_TIME.slice(0, 10) : '';

/** Kort tekst, f.eks. "CloudStream3D v1.0.0-rc.1 (161da9e)" (+ " · dev" lokalt) */
export const VERSION_TEXT = `CloudStream3D${VERSION ? ` v${VERSION}` : ''} (${COMMIT})${IS_DEV ? ' · dev' : ''}`;

/** Lenke til commiten på GitHub, eller null hvis hashen er ukjent/har lokale endringer */
export const COMMIT_URL = /^[0-9a-f]{7}$/.test(COMMIT) ? `${REPO_URL}/commit/${COMMIT}` : null;

/** Byggetidspunkt for tooltip/bunntekst, f.eks. "2026-11-24 12:42 UTC" */
export const BUILD_TIME_TEXT = BUILD_TIME ? `${BUILD_TIME.replace('T', ' ').slice(0, 16)} UTC` : '';

/**
 * Viser versjonen nederst på midten av skjermen. Byggetidspunktet står i tooltip.
 */
export function showVersionLabel() {
  const el = document.createElement(COMMIT_URL ? 'a' : 'div');
  el.id = 'version-label';
  el.className = 'version-label';
  el.textContent = VERSION_TEXT;
  el.title = `Version ${VERSION || 'unknown'}, commit ${COMMIT}${BUILD_TIME_TEXT ? `, built ${BUILD_TIME_TEXT}` : ''}`;
  if (COMMIT_URL) {
    el.href = COMMIT_URL;
    el.target = '_blank';
    el.rel = 'noopener';
  }
  document.body.appendChild(el);
  console.log(`🏷️ ${VERSION_TEXT}${BUILD_TIME_TEXT ? ` · built ${BUILD_TIME_TEXT}` : ''}`);
}
