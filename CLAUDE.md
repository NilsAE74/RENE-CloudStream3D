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
```

Det finnes **ingen tester, linter eller formatter**. Verifiser endringer med `npm run build` og manuell test i nettleser (`npm run dev`). Chunk-size-advarselen (~1 MB bundle) ved build er kjent og ufarlig.

## Deploy

- `.github/workflows/deploy.yml`: push til `main` → `npm ci` + `npm run build` → GitHub Pages (Node 18).
- `vite.config.js` har `base: '/RENE-CloudStream3D/'`. Må matche repo-navnet, ellers svart skjerm/404 på assets i produksjon.
- Statiske filer (logoer) ligger i `public/` og refereres med absolutt sti (`/RENElogo.png` o.l.).

## Arkitektur

`main.js` er "dirigenten": initialiserer alle moduler, kobler dem sammen og eier fil-innlastingsflyten (file input, drag-and-drop, default-sky ved oppstart).

| Fil | Ansvar |
|---|---|
| `src/viewer.js` | `PointCloudViewer`-klasse (scene, kamera, renderer, OrbitControls, punktsky, Z-invertering, eksplosjonsanimasjon, kartbilde for rapport). Eksporterer en singleton `defaultViewer` via wrapper-funksjoner (`viewer.getScene()`, `viewer.addPointCloud()` osv.). |
| `src/parser.js` | `parseXYZFile` (regex-basert, Float32Array), `centerPositions`, `generateDefaultCloud` (syntetisk terreng), `generateLogoCloud` (punktsky fra logo-PNG). |
| `src/ui.js` | lil-gui-panel, toolbar, settings-objekter (`settings`, `boxSettings`, `reportSettings`, `measurementSettings`, `profileSettings`), høydelegende, `DraggablePanel`-klasse. |
| `src/stats.js` | Dashboard (statistikk, histogram), meldinger (`showDashboardMessage`), loading-spinner. |
| `src/selection.js` | Seleksjonsboks med TransformControls, velg/eksporter punkter. |
| `src/measurement.js` | `MeasurementTool`-klasse – avstandsmåling med CSS2D-labels. |
| `src/profile.js` | Tverrsnitt/profil langs en linje med tykkelse. Har både løse modulfunksjoner og `ProfileTool`-klasse. |
| `src/grid.js` | Survey-grid med originale koordinater. |
| `src/report.js` | PDF-rapport med jsPDF (kartbilde, statistikk, histogram, ev. profil). |

Kommunikasjon mellom moduler skjer via direkte imports og delte, muterbare settings-objekter eksportert fra `ui.js`. Verktøy-instanser (measurement, profile) injiseres med `setMeasurementTool` / `setProfileTool`.

## Viktige konvensjoner

### Koordinater og offset (kritisk)
- Input er typisk UTM (f.eks. X ≈ 500.000, Y ≈ 6.000.000). Float32 har bare ~7 gjeldende siffer: absolutte UTM-verdier i `Float32Array` avrundes til 0,5 m (Y) / 3 cm (X). **Lagre aldri absolutte UTM-koordinater i `Float32Array`.**
- `parser.parseXYZFile` lagrer posisjoner relativt til første punkt (`origin`, double). `parser.centerPositions(positions, bounds, origin)` flytter dem så til senter; `offset` (double) er senter i absolutte koordinater. Bounds er alltid absolutte (double).
- Offset må settes i **alle** konsumenter ved hver innlasting: `selection`, `viewer`, `measurementTool`, `profileTool` (se `main.js`). Ny modul som viser/eksporterer koordinater må også få offset.
- Scene-koordinater = sentrerte. Alt som vises til bruker, eksporteres eller skrives i rapport skal være **originale** koordinater (sentrert + offset).
- Z er opp (`camera.up = (0,0,1)`), som i GIS/oppmåling. Ikke bytt til Three.js sin Y-opp-konvensjon.
- `invertZAxis()` inverterer punkt-Z og viewerens `coordinateOffset.z`. `handleInvertZ` i `ui.js` gir deretter den nye offseten (som kopi) til selection, measurement og profile. Nye verktøy som bruker offset må også oppdateres der.

### Statistikk
- Dashboard-histogram, oppløsning og rapport-histogram bruker de **sentrerte** posisjonene i geometrien (`pointCloud.geometry.attributes.position.array`, ingen ekstra kopi) pluss `zOffset` for å få original Z. Min/maks-verdier vises fra de absolutte bounds. For default-skyen brukes kun terrengdelen (`subarray`), ikke logo-punktene.
- Eksport av valgte punkter skrives med 3 desimaler (mm).

### Filformater
- Akseptert: `.xyz`, `.txt`, `.pcd`, `.ply`. Merk: parseren er reelt bare en ASCII XYZ-parser (regex som finner tre tall etter hverandre). ASCII PCD/PLY fungerer delvis; binære PCD/PLY støttes **ikke**. Ekstra kolonner (intensitet, RGB) ignoreres; farge beregnes fra Z (HSL blå→rød).

### Default-sky
- Ved oppstart lastes syntetisk terreng + logo-punktsky. `viewer.setIsDefaultCloud(true, velocities)` gjør at første opplastede fil trigger en eksplosjonsanimasjon før ny sky lastes.

### Kode og språk
- Kommentarer og console-logger er blandet norsk/engelsk; UI-tekst er engelsk. Følg språket i filen du redigerer, og hold UI-tekst på engelsk.
- Tallformat i UI: `toLocaleString('nb-NO')`. Enheter i meter.
- Ytelse: bruk `Float32Array` for posisjoner/farger og unngå `split()`/vanlige arrays på store datasett (filer kan ha millioner av punkter).
- Renderer har `preserveDrawingBuffer: true` – nødvendig for screenshots til PDF. Ikke fjern.
- Avhengigheter: `three@^0.160` (addons importeres fra `three/examples/jsm/...`), `lil-gui`, `jspdf`, `html2canvas`.

## Kjente forhold å være obs på

- `prompt.txt` inneholder historiske utviklingsprompter, ikke kode.
- `.txt` er ikke lenger ignorert i `.gitignore`. Ikke commit store punktsky-filer (`.txt`/`.xyz`) til repoet.
- `index.html` lenker `/style.css` og `/public/CloudStream3D-logo.png` med absolutte stier; sjekk at de fungerer med `base`-stien i produksjon ved endringer.
