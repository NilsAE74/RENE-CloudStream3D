# CLAUDE.md

Veiledning for Claude Code i dette repoet.

## Prosjekt

**RENE CloudStream3D** – nettleserbasert 3D-visning og analyse av punktskyer (terreng/oppmåling) for Reinertsen New Energy. Ren klient-side app: Vanilla JavaScript (ES-moduler, ingen TypeScript, ingen rammeverk) bygget med Vite og Three.js. Ingen backend.

## Kommandoer

```bash
npm install        # installer avhengigheter
npm run dev        # utviklingsserver, http://localhost:5173/RENE-CloudStream3D/
npm run build      # produksjonsbygg til dist/
npm run preview    # forhåndsvis dist/
npm test           # parser-tester (node --test)
npm run licenses   # lag public/THIRD_PARTY_LICENSES.txt på nytt (kjøres også som prebuild)
```

### Tester
- `npm test` kjører `test/parser.test.js` med Node sin innebygde `node:test` (ingen testrammeverk). Krever `npm install` først: LAZ-testene bruker `laz-perf` fra `dependencies`, og uten `node_modules` feiler hele filen med en lite sigende melding.
- Dekker filer uten header, PLY/PCD (binære testdata bygget med `DataView` i testen), LAS/LAZ og lesing i biter (alle delingsposisjoner må gi identisk resultat).
- LAS/LAZ-testfilene i `test/data/` er laget med laspy + lazrs og lages på nytt med `test/data/make_las_fixtures.py`.
- Nye parser-regler skal ha testtilfeller.
- Det finnes ingen linter eller formatter. Verifiser endringer med `npm test`, `npm run build` og manuell test i nettleser (`npm run dev`). Chunk-size-advarselen (~1 MB bundle) ved build er kjent og ufarlig.

## Deploy

- `.github/workflows/deploy.yml`: push til `main` → `npm ci` + `npm test` + `npm run build` → GitHub Pages (Node 22; Vite 7 krever Node 20.19 eller nyere). En feilende test stopper deploy. Workflowen reagerer ikke på tags; en release deployes av push til `main`. Kan også startes manuelt (`workflow_dispatch`).
- `vite.config.js` har `base: '/RENE-CloudStream3D/'`. Må matche repo-navnet, ellers svart skjerm/404 på assets i produksjon.
- Versjon: `vite.config.js` leser `version` fra `package.json` (`__APP_VERSION__`) og setter `__APP_COMMIT__` (fra `GITHUB_SHA` i Actions, ellers `git rev-parse`; `-dirty` ved lokale endringer) og `__APP_BUILD_TIME__` via `define`. `src/version.js` lager `CloudStream3D v1.0.0-rc.1 (161da9e)` (+ ` · dev` under `npm run dev`), som vises i appen, i konsollen og i PDF-bunnteksten. Byggetidspunktet står i tooltip. Ikke importer `package.json` i klientkoden.
- Statiske filer (logoer) ligger i `public/` og refereres med absolutt sti (`/RENElogo.png` o.l.).

## Lisens

- Lisens (#9): proprietær, Reinertsen New Energy AS (`LICENSE`, `"license": "UNLICENSED"` i `package.json`). `public/THIRD_PARTY_LICENSES.txt` lages av `scripts/third-party-licenses.mjs` fra `package-lock.json` (prebuild, eller `npm run licenses`) og publiseres med siden. Ved nye/endrede avhengigheter: kjør `npm run licenses` og commit filen. Pakker uten lisensfil i npm-pakken trenger teksten i `scripts/licenses/<pakkenavn>.txt` (som laz-perf), ellers feiler bygget.

## Versjoner og release

Semantisk versjonering, tilpasset en app uten API. Endringene står i `CHANGELOG.md` (Keep a Changelog, norsk, skrevet for brukere). Ikke lag tags eller GitHub Releases uten at brukeren ber om det.

**Velg type** (høyeste som passer):
- **major**: samme fil kan gi andre tall (koordinater, statistikkmetode, oppløsningsberegning), eller støtte for et filformat fjernes.
- **minor**: ny funksjon eller nytt filformat; gamle filer gir samme resultat.
- **patch**: feilretting som ikke endrer resultater.

Feilrettinger som *endrer* tall (som presisjonsrettingen i 1.0.0-rc.1) er major, selv om de er rettinger. Under utvikling: legg endringer under `## [Unreleased]` i `CHANGELOG.md` i samme PR. Nye filformater eller funksjoner skal også inn i «Funksjoner» i `README.md` (brukerrettet, norsk).

Commit-meldinger skrives på norsk, i imperativ eller som kort beskrivelse, med issue-nummer når det finnes (`Støtte for LAS-filer (issue #15, del 1)`).

**Rutine** (på `main`, lokalt):
1. `git checkout main && git pull`
2. I `CHANGELOG.md`: gi `[Unreleased]` nytt navn til `[x.y.z] - ÅÅÅÅ-MM-DD` og lag en ny, tom `[Unreleased]` over. Commit: `git commit -am "CHANGELOG for x.y.z"`.
3. `npm test && npm run build` (før taggen lages).
4. `npm version <major|minor|patch> -m "Release v%s"`. Oppdaterer `package.json` og `package-lock.json`, lager commit og tag `vx.y.z`. Krever at sporede filer ikke har ukommiterte endringer (nye, usporede filer stopper den ikke), derfor commit i steg 2.
5. `git push --follow-tags` (pusher commit og tag; push til `main` deployer).
6. GitHub Release: **Releases → Draft a new release** → velg taggen → lim inn seksjonen fra `CHANGELOG.md`. Kryss av «Set as a pre-release» for `-rc`-versjoner.

**Fra `1.0.0-rc.1` til `1.0.0`** (etter test med ekte skannerdata):
- Steg 2: legg innholdet fra `[Unreleased]` (feil funnet under testing) i en ny seksjon `[1.0.0]`. La `[1.0.0-rc.1]`-seksjonen stå, siden rapporter kan ha `v1.0.0-rc.1` i bunnteksten.
- Steg 4: `npm version 1.0.0 -m "Release v%s"` (eksplisitt versjon er tydeligst; `npm version major` gir også `1.0.0` fra `1.0.0-rc.1`).
- Ny kandidat i stedet: `npm version prerelease --preid rc` → `1.0.0-rc.2`.

`1.0.0-rc.1` har ingen tag. Versjonen i `package.json` endres bare ved release, så commits etter en release viser samme versjon; hashen skiller dem.

## Arkitektur

`main.js` er "dirigenten": initialiserer alle moduler, kobler dem sammen og eier fil-innlastingsflyten (file input, drag-and-drop, default-sky ved oppstart). Filer leses med `readPointFile` (bare header) + `await parsePointFile` (data i biter, med fremdrift i spinneren) fra `src/pointFormats.js`. `isLoadingFile` hindrer to innlastinger samtidig, og forrige sky skjules mens den nye leses.

| Fil | Ansvar |
|---|---|
| `src/viewer.js` | `PointCloudViewer`-klasse (scene, kamera, renderer, OrbitControls, punktsky, Z-invertering, eksplosjonsanimasjon, kartbilde for rapport). Eksporterer en singleton `defaultViewer` via wrapper-funksjoner (`viewer.getScene()`, `viewer.addPointCloud()` osv.). |
| `src/parser.js` | `PointBuilder` (felles punktsamler: origo/bounds/NaN, `reserve`), `XYZChunkParser` (filer uten header, i biter), `parseXYZFile` (hel streng via samme bit-parser), `finishPoints` (felles trimming + høydefarger), `centerPositions`, `generateDefaultCloud` (syntetisk terreng), `generateLogoCloud` (punktsky fra logo-PNG). |
| `src/ui.js` | lil-gui-panel, toolbar, settings-objekter (`settings`, `boxSettings`, `reportSettings`, `measurementSettings`, `profileSettings`), høydelegende, `DraggablePanel`-klasse. |
| `src/stats.js` | Dashboard (statistikk, histogram), meldinger (`showDashboardMessage`), loading-spinner. |
| `src/selection.js` | Seleksjonsboks med TransformControls, velg/eksporter punkter. |
| `src/measurement.js` | `MeasurementTool`-klasse – avstandsmåling med CSS2D-labels. |
| `src/profile.js` | Tverrsnitt/profil langs en linje med tykkelse. Har både løse modulfunksjoner og `ProfileTool`-klasse. |
| `src/grid.js` | Survey-grid med originale koordinater. |
| `src/report.js` | PDF-rapport med jsPDF (kartbilde, statistikk, histogram, ev. profil). |
| `src/pointFormats.js` | PLY/PCD/LAS/LAZ: `parseHeader` (header → beskrivelse av dataene), `AsciiBodyParser` / `parseAsciiBody` (ASCII i biter / hel streng), `parseBinaryFile` / `parseBinaryBody` (egen `DataView`-leser, vinduer / hel buffer), `parseLazFile` (LAZ via laz-perf), `readPointFile` / `parsePointFile` (innlesing i nettleser, strømming). |
| `src/lazPerfLoader.js` | Laster laz-perf (WASM) i nettleseren. Importeres bare dynamisk fra `parseLazFile`, så laz-perf er en egen chunk som ikke lastes ved oppstart. |
| `src/version.js` | Versjonsinfo: versjon fra `package.json`, commit-hash og byggetidspunkt (`VERSION_TEXT`, `BUILD_TIME_TEXT`), etikett nederst på midten med byggetid i tooltip (`showVersionLabel`, skjult under 900 px) og bunntekst i PDF-rapporten. |
| `src/colorScale.js` | Felles fargeskala for høydefarger (auto/manuell min–maks, `heightToColor`) og desimalregler for Z (`zDecimals`, `labelDecimals`). |

Kommunikasjon mellom moduler skjer via direkte imports og delte, muterbare settings-objekter eksportert fra `ui.js`. Verktøy-instanser (measurement, profile) injiseres med `setMeasurementTool` / `setProfileTool`.

## Viktige konvensjoner

### Koordinater og offset (kritisk)
- Input er typisk UTM (f.eks. X ≈ 500.000, Y ≈ 6.000.000). Float32 har bare ~7 gjeldende siffer: absolutte UTM-verdier i `Float32Array` avrundes til 0,5 m (Y) / 3 cm (X). **Lagre aldri absolutte UTM-koordinater i `Float32Array`.**
- Alle parsere lagrer via `PointBuilder` posisjoner relativt til første punkt (`origin`, double). `parser.centerPositions(positions, bounds, origin)` flytter dem så til senter; `offset` (double) er senter i absolutte koordinater. Bounds er alltid absolutte (double).
- `centerPositions` endrer en `Float32Array` **in-place** (vanlige arrays skrives til ny `Float32Array`, differansen regnes i double først). `viewer.addPointCloud` bruker `THREE.BufferAttribute` uten kopi, så geometrien eier arrayene fra parseren. Ikke bruk usentrerte `positions` etter sentrering, og ikke bytt tilbake til `Float32BufferAttribute` (kopierer).
- Offset må settes i **alle** konsumenter ved hver innlasting: `selection`, `viewer`, `measurementTool`, `profileTool` (se `main.js`). Ny modul som viser/eksporterer koordinater må også få offset.
- Scene-koordinater = sentrerte. Alt som vises til bruker, eksporteres eller skrives i rapport skal være **originale** koordinater (sentrert + offset).
- Z er opp (`camera.up = (0,0,1)`), som i GIS/oppmåling. Ikke bytt til Three.js sin Y-opp-konvensjon.
- `invertZAxis()` inverterer punkt-Z og viewerens `coordinateOffset.z`. `handleInvertZ` i `ui.js` gir deretter den nye offseten (som kopi) til selection, measurement og profile. Nye verktøy som bruker offset må også oppdateres der.

### Statistikk
- Dashboard-histogram, oppløsning og rapport-histogram bruker de **sentrerte** posisjonene i geometrien (`pointCloud.geometry.attributes.position.array`, ingen ekstra kopi) pluss `zOffset` for å få original Z. Min/maks-verdier vises fra de absolutte bounds. For default-skyen brukes kun terrengdelen (`subarray`), ikke logo-punktene.
- Eksport av valgte punkter skrives med 3 desimaler (mm).

### Filformater
- Akseptert: `.xyz`, `.txt`, `.csv`, `.pcd`, `.ply`, `.las`, `.laz`. Typen avgjøres av **innholdet**, ikke filendelsen: `readPointFile` leser de første 64 KB (`file.slice`), og `parseHeader` ser etter LAS-signatur (`LASF`), PLY-header (første linje `ply`) eller PCD-header (første linje som ikke er kommentar er `VERSION`/`FIELDS`). Deretter leser `parsePointFile` dataene **i biter** (se «Lesing i biter» under).
- **Uten header** (`.xyz`/`.txt`/`.csv`): `XYZChunkParser` (og `parseXYZFile` for hel streng), en ASCII-parser som leser de **tre første tallene på hver linje** (regex med `^` og flagg `m`, aldri over linjeskift). Ekstra kolonner (intensitet, RGB) ignoreres; linjer som ikke starter med tre tall (headere, kommentarer) hoppes over.
- Skilletegn og desimaltegn finnes av `detectFormat` ut fra de første 50 datalinjene, og `buildLineRegex` lager regex for formatet: mellomrom/tab, `,` eller `;` som skilletegn. `;` → desimalkomma hvis det finnes komma. Komma der de tre første mellomrom-separerte feltene er tall med desimalkomma (`1,5 2,5 3,5`) → desimalkomma; ellers er komma skilletegn (`1.5,2.5,3.5`, `1.5, 2.5, 3.5`). Skilletegn velges ved flertall; desimalkomma hvis minst én linje har det.
- **PLY** (`ascii`, `binary_little_endian`): bare de N radene i `element vertex N` leses; andre elementer (faces o.l.) hoppes over, også når de står før vertex (binær: list-properties gås gjennom). x/y/z finnes fra rekkefølgen på `property`-linjene (trenger ikke stå først). Alle skalartyper (char…double) støttes; vertex med list-property støttes ikke.
- **PCD** (`DATA ascii`, `DATA binary`): x/y/z-kolonner/offsets fra `FIELDS`, `SIZE`, `TYPE`, `COUNT` (COUNT > 1 gir flere kolonner). Antall fra `POINTS` (ev. `WIDTH × HEIGHT`). Binær PCD antas little endian.
- **LAS** (#15, versjon 1.0–1.4, punktformat 0–10): `parseLasHeader` leser public header block med `DataView` (bytene fra `bytesToString`). X/Y/Z er `int32` først i hver post; absolutt koordinat = heltall × skala + offset, regnet i double i `readBinaryRows` før `PointBuilder`. Stride = `point data record length` fra headeren (ekstra bytes). Antall: 64-bits feltet i LAS 1.4 hvis det er > 0, ellers legacy-feltet. Leses i vinduer som binær PLY/PCD.
- **LAZ** (#15 del 2): samme header som LAS, men bit 7/6 i punktformatet er satt → `type: 'laz'`. `parseLazFile` bruker `laz-perf` (`LASZip`): den **komprimerte** filen kopieres i vinduer (`file.slice`) inn i WASM-minnet med `_malloc`/`HEAPU8.set` (aldri hele filen i én JS-`ArrayBuffer`), deretter `getPoint` per punkt og `int32 × skala + offset` i double, som LAS. Hele den komprimerte filen må ligge i WASM-minnet fordi chunk-tabellen er aritmetisk kodet (maks `LAZ_MAX_FILE_BYTES` = 1,8 GB, WASM-bygget har 2 GB). Ny laz-perf-instans per fil, så minnet frigjøres. laz-perf er bygget uten C++-unntak: feil gir et tall/rå melding, som logges med `console.warn` og erstattes med en lesbar melding. Bare punktformat 0–3 og 6–8 (ikke waveform). I Node (tester) gis laz-perf inn med `options.createLazPerf`, siden `lazPerfLoader.js` bruker Vite sin `?url`-import.
- Punkter med NaN/Inf (vanlig i organiserte PCD-skyer) hoppes over av `PointBuilder`.
- Binær lesing bruker egen `DataView`-leser. **Ikke bruk `PLYLoader`/`PCDLoader` fra three**: de lagrer absolutte koordinater i `Float32Array` og mister UTM-presisjon. Origo trekkes fra i double før lagring, som i `parseXYZFile`.
- Ikke støttet, gir tydelig feilmelding i dashboardet før eksplosjonen/innlasting: PLY `binary_big_endian`, PCD `DATA binary_compressed`, LAZ med waveform-punktformat (4, 5, 9, 10), LAZ over 1,8 GB, LAS-versjon utenfor 1.0–1.4, punktformat over 10, header uten `end_header`/`DATA` innen 64 KB, manglende x/y/z, avkortet binærfil.
- Header og data er adskilt (`parseHeader` → `dataStart`, deretter body-parser + `PointBuilder`). ASCII-stien tolker headeren på nytt i den dekodede teksten når den er komplett, siden `dataStart` fra 64 KB-proben er en byte-offset.

### Lesing i biter (#5)
- Filen leses **aldri** til én streng eller én `ArrayBuffer` (Chrome/Edge: maks ca. 512 MB per streng; `file.text()` gir da tom streng uten feil). Ikke innfør `file.text()`/`file.arrayBuffer()` på hele filen.
- Tekst (uten header, ASCII PLY/PCD): `file.stream()` + `TextDecoder` (`stream: true`, håndterer UTF-8-tegn delt mellom byte-biter), samlet til biter på `TEXT_BATCH_CHARS` (4 M tegn; målt raskest av 1/4/16). Parserne har `push(text)` / `finish()`: bare komplette linjer (til og med siste `\n`) parses, resten tas vare på til neste bit. Resultatet er **identisk** med parsing av hele strengen (testet for deling på alle posisjoner, også mellom `\r` og `\n` og i headeren).
- `XYZChunkParser` venter med `detectFormat` til de første 50 datalinjene er komplette (maks 1 M tegn), så formatet blir som for hele filen.
- `AsciiBodyParser` leser bare N vertex-rader (PLY, også delt mellom biter), setter så `done`, og strømmen avbrytes (face-linjer leses ikke).
- Binær PLY/PCD og LAS: `parseBinaryFile` leser vinduer på `BINARY_WINDOW_BYTES` (16 MB) med `file.slice()`. List-properties før vertex (faces) gås gjennom vindu for vindu.
- Minne for filer uten header: antall punkter er ukjent, så `XYZChunkParser` estimerer fra linjetettheten så langt × filstørrelse, +3 %, og reserverer før hver bit (aldri dobling i løkken). Bommer estimatet, reserveres et nytt (kort topp: gammel + ny array). `finishPoints` kopierer bare hvis > 5 % er ubrukt, så marginen ikke gir en ekstra kopi. Topp ved innlesing ≈ posisjoner (+3 %) + farger + én tekstbit; målt i Node for 20 mill. punkter / 600 MB: +530 MB RSS.
- Fremdrift: `onProgress(andel)` og `setTimeout(0)`-pause maks hvert 100 ms (`YIELD_INTERVAL_MS`). Hyppigere pauser gjør lesingen tregere, særlig når nettleseren må tegne en stor sky mellom bitene.
- `parsePointFile` er `async`. `{ header, text }` og `{ header, buffer }` støttes fortsatt (tester, små filer) og går gjennom samme parsere.
- Alle parsere returnerer samme struktur: `{ positions, colors, count, bounds, origin, format }`. `format` er `{ delimiter, decimalComma }` for filer uten header, ellers `{ type: 'ply'|'pcd'|'las'|'laz', encoding: 'ascii'|'binary' }`.

### Høydefarger og Z-visning
- All høydefarging går via `src/colorScale.js` (blå ved min → rød ved maks, klippet utenfor). Ikke lag egne HSL-beregninger; bruk `heightToColor` / `heightToHue`.
- Auto (standard): skalaen følger datasettets Z-område (`setDataRange`). Manuell (`setManualRange`, GUI «Color Scale (Z)») beholdes når ny fil lastes og speiles ved Z-invertering.
- Etter endring av skalaen: `ui.refreshColorScale()` (punktfarger, legende, histogramfarger, GUI). Rapportens legende og histogram leser skalaen direkte.
- For default-skyen fargelegges bare terrengpunktene (`viewer.setHeightColorCount`); logoen beholder egne farger.
- Z-verdier vises med 3 desimaler når spennet er under 1 m, ellers 2 (`zDecimals`). Histogram-/rapportetiketter bruker `labelDecimals`.

### Default-sky
- Ved oppstart lastes syntetisk terreng + logo-punktsky. `viewer.setIsDefaultCloud(true, velocities)` gjør at første opplastede fil trigger en eksplosjonsanimasjon før ny sky lastes.

### Kode og språk
- Kommentarer og console-logger er blandet norsk/engelsk; UI-tekst er engelsk. Følg språket i filen du redigerer, og hold UI-tekst på engelsk.
- Tallformat i UI: `toLocaleString('nb-NO')`. Enheter i meter.
- Ytelse: bruk `Float32Array` for posisjoner/farger og unngå `split()`/vanlige arrays på store datasett (filer kan ha millioner av punkter).
- Renderer har `preserveDrawingBuffer: true` – nødvendig for screenshots til PDF. Ikke fjern.
- Avhengigheter: `three@^0.160` (addons importeres fra `three/examples/jsm/...`), `lil-gui`, `jspdf`, `html2canvas`, `laz-perf` (låst til 0.0.7, Apache-2.0; bare LAZ, lastes dynamisk).

## Kjente forhold å være obs på

- `prompt.txt` inneholder historiske utviklingsprompter, ikke kode.
- `.txt` er ikke lenger ignorert i `.gitignore`. Ikke commit store punktsky-filer (`.txt`/`.xyz`) til repoet.
- `index.html` lenker `/style.css` og `/public/CloudStream3D-logo.png` med absolutte stier; sjekk at de fungerer med `base`-stien i produksjon ved endringer.

## Åpne punkter (GitHub-issues)

- #15 LAS/LAZ: valgfrie deler gjenstår (bare bakkepunkter, CRS fra headeren, RGB-farger)
