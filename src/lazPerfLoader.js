/**
 * Laster laz-perf (LAZ-dekomprimering, WebAssembly) i nettleseren. Importeres bare
 * dynamisk fra pointFormats.js når en LAZ-fil åpnes, så Vite legger laz-perf og
 * WASM-filen i egne filer som ikke lastes ved oppstart.
 *
 * laz-perf finner ikke WASM-filen selv etter bundling, så URL-en gis med locateFile.
 */
import { createLazPerf } from 'laz-perf';
import wasmUrl from 'laz-perf/lib/web/laz-perf.wasm?url';

export default function create() {
  return createLazPerf({ locateFile: () => wasmUrl });
}
