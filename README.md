# RENE CloudStream3D

[![Deploy to GitHub Pages](https://github.com/NilsAE74/RENE-CloudStream3D/actions/workflows/deploy.yml/badge.svg)](https://github.com/NilsAE74/RENE-CloudStream3D/actions/workflows/deploy.yml)

En interaktiv 3D-visualiseringsapplikasjon for punktskyer bygget med Three.js og Vite.

## 🚀 Live Demo

Applikasjonen er deployet og tilgjengelig på:
**https://nilsae74.github.io/RENE-CloudStream3D/**

## 📋 Funksjoner

- 📂 Last opp og visualiser punktsky-filer (.xyz, .txt, .csv, .pcd, .ply). Skilletegn: mellomrom, tab, komma eller semikolon; desimalpunktum eller desimalkomma
  - PLY: ASCII og binær little endian. Bare vertex-data leses (flater/faces ignoreres), x/y/z kan stå i vilkårlig rekkefølge, float eller double
  - PCD: `DATA ascii` og `DATA binary`. NaN-punkter hoppes over
  - Ikke støttet: binær big endian PLY og komprimert PCD (`binary_compressed`). Disse gir en feilmelding
  - UTM-koordinater beholder full presisjon (double) også for binære filer
  - Store filer leses i biter, så filer over 512 MB (nettleserens grense for én tekststreng) kan lastes. Fremdrift vises i prosent. Testet med 20 mill. punkter (600 MB): ca. 8 s innlesing i Chromium
- 🎨 Interaktivt 3D-grensesnitt med orbit-kontroller
- 📊 Sanntids-statistikk og histogram for høydedata
- 🔲 Seleksjonsverktøy for å velge og eksportere punkter
- 📈 Høyde-fargebasert visualisering
- 📄 Generer profesjonelle PDF-rapporter
- ⚙️ Justerbart GUI for punktstørrelse, farger og mer

## 🛠️ Teknologier

- [Three.js](https://threejs.org/) - 3D-grafikk
- [Vite](https://vitejs.dev/) - Build-verktøy
- [lil-gui](https://lil-gui.georgealways.com/) - GUI-kontroller
- [jsPDF](https://github.com/parallax/jsPDF) - PDF-generering
- [html2canvas](https://html2canvas.hertzen.com/) - Screenshot-funksjonalitet

## 🏗️ Installasjon og Lokal Utvikling

### Forutsetninger

- Node.js (versjon 18 eller nyere)
- npm (følger med Node.js)

### Oppsett

1. **Klon repositoryet:**
   ```bash
   git clone https://github.com/NilsAE74/RENE-CloudStream3D.git
   cd RENE-CloudStream3D
   ```

2. **Installer avhengigheter:**
   ```bash
   npm install
   ```

3. **Start utviklingsserver:**
   ```bash
   npm run dev
   ```
   
   Applikasjonen vil være tilgjengelig på `http://localhost:5173`

4. **Bygg for produksjon:**
   ```bash
   npm run build
   ```
   
   Den byggede applikasjonen vil bli plassert i `dist/`-mappen.

5. **Forhåndsvis produksjonsbygg:**
   ```bash
   npm run preview
   ```

## 📦 Deployment

Hver push til `main` bygger og deployer automatisk til GitHub Pages via `.github/workflows/deploy.yml`. Workflowen kan også startes manuelt: **Actions** → **Deploy to GitHub Pages** → **Run workflow**.

**Første gang:** Gå til [Settings → Pages](https://github.com/NilsAE74/RENE-CloudStream3D/settings/pages) og sett **Source** til `GitHub Actions`. Ingen andre innstillinger trengs; workflowen ber selv om tilgangene den trenger.

**Viktig:**
- `base` i `vite.config.js` må være `'/<repo-navn>/'` (nå `'/RENE-CloudStream3D/'`). Feil verdi gir blank side, fordi JS/CSS ikke blir funnet.
- GitHub Pages for private repoer krever GitHub Pro, Team eller Enterprise.

## 📂 Prosjektstruktur

```
RENE-CloudStream3D/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deployment workflow
├── src/
│   ├── parser.js               # Parsing av punktsky-filer
│   ├── viewer.js               # Three.js scene setup
│   ├── ui.js                   # GUI og brukergrensesnitt
│   ├── selection.js            # Seleksjons- og eksportlogikk
│   ├── stats.js                # Statistikk og dashboard
│   ├── measurement.js          # Avstandsmåling
│   ├── profile.js              # Tverrsnitt/profil
│   ├── grid.js                 # Koordinatgrid
│   └── report.js               # PDF-rapport generering
├── index.html                  # Hoved HTML-fil
├── main.js                     # Hovedfil som koordinerer moduler
├── style.css                   # Global styling
├── vite.config.js              # Vite-konfigurasjon
├── package.json                # Node.js avhengigheter
└── README.md                   # Denne filen
```

## 🎯 Bruk

1. **Last opp en punktsky:**
   - Klikk på "Last opp punktsky"-knappen
   - Velg en fil i .xyz, .txt, .csv, .pcd eller .ply-format
   - Punktskyen vil bli visualisert i 3D

2. **Naviger i 3D:**
   - **Venstre museknapp:** Roter visning
   - **Høyre museknapp:** Pan/flytt
   - **Musehjul:** Zoom inn/ut

3. **Juster visualisering:**
   - Bruk GUI-panelet til høyre for å justere:
     - Punktstørrelse
     - Farger
     - Bakgrunnsfarge
     - Høydefarge-aktivering

4. **Velg punkter:**
   - Aktiver "Selection Box" i GUI
   - Juster boksens posisjon og størrelse
   - Klikk "Velg Punkter" for å markere punkter
   - Eksporter valgte punkter til en ny fil

5. **Generer rapport:**
   - Fyll ut metadata i "Rapport & Lokasjon"-seksjonen
   - Klikk "Generer PDF-rapport"
   - PDF-en vil bli lastet ned automatisk

## 🔧 Feilsøking

### Bygg feiler

Hvis `npm run build` feiler med feil om manglende moduler:

```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Deployment feiler

- **404 «Failed to create deployment»:** GitHub Pages er ikke aktivert. Se *Første gang* under Deployment.
- Andre feil: sjekk loggen i **Actions**-fanen.

### Svart skjerm i produksjon

Hvis 3D-visningen er svart etter deployment:

1. Verifiser at `base`-stien i `vite.config.js` er riktig
2. Sjekk nettleserens konsoll for feilmeldinger
3. Sørg for at alle asset-stier er relative

## 📝 Lisens

Dette prosjektet er laget som en tutorial og er fritt tilgjengelig for bruk.

## 👤 Forfatter

**NilsAE74**

- GitHub: [@NilsAE74](https://github.com/NilsAE74)

## 🤝 Bidrag

Bidrag, issues og feature requests er velkomne!

## ⭐ Støtt Prosjektet

Hvis du synes dette prosjektet er nyttig, gi det gjerne en ⭐ på GitHub!
