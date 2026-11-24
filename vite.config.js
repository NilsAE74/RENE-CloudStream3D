import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Appversjon fra package.json (semantisk versjon, se CHANGELOG.md). Leses her ved
// bygging, så klientkoden ikke importerer package.json.
const APP_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')).version

// Commit-hash for versjonsvisning (src/version.js).
// GitHub Actions setter GITHUB_SHA; lokalt brukes git. "-dirty" = ukommiterte endringer.
function gitCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    const hash = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() !== ''
    return dirty ? `${hash}-dirty` : hash
  } catch {
    return 'unknown'
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/RENE-CloudStream3D/',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_COMMIT__: JSON.stringify(gitCommit()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
