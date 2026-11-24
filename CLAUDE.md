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
- Input er typisk UTM (f.eks. X ≈ 500.000, Y ≈ 6.000.000). For WebGL float32-presisjon **sentreres** alle punkter rundt origo (`parser.centerPositions`) før rendering.
- Offset må settes i **alle** konsumenter ved hver innlasting: `selection`, `viewer`, `measurementTool`, `profileTool` (se `main.js`). Ny modul som viser/eksporterer koordinater må også få offset.
- Scene-koordinater = sentrerte. Alt som vises til bruker, eksporteres eller skrives i rapport skal være **originale** koordinater (sentrert + offset).
- Z er opp (`camera.up = (0,0,1)`), som i GIS/oppmåling. Ikke bytt til Three.js sin Y-opp-konvensjon.
- `invertZAxis()` inverterer både punkt-Z og `coordinateOffset.z`. Statistikk/rapport må ta hensyn til invertert tilstand.

### Statistikk
- Dashboard, legende og rapport-statistikk bruker **originale** posisjoner. For default-skyen brukes kun terrengdata, ikke logo-punktene.

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
