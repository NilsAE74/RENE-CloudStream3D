# 3D Punktsky Visualisering

En interaktiv 3D-visualiseringsapplikasjon for punktskyer bygget med Three.js og Vite.

## 🚀 Live Demo

Applikasjonen er deployet og tilgjengelig på:
**https://nilsae74.github.io/Cursor-Tutorial/**

## 📋 Funksjoner

- 📂 Last opp og visualiser punktsky-filer (.xyz, .txt, .pcd, .ply)
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
   git clone https://github.com/NilsAE74/Cursor-Tutorial.git
   cd Cursor-Tutorial
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

Prosjektet er konfigurert for automatisk deployment til GitHub Pages.

### Automatisk Deployment

Hver gang du pusher til `main`-branchen, vil GitHub Actions automatisk:

1. Bygge applikasjonen
2. Deploye til GitHub Pages
3. Gjøre den tilgjengelig på `https://nilsae74.github.io/Cursor-Tutorial/`

### Aktivere GitHub Pages

Hvis dette er første gang du setter opp deployment, følg disse stegene:

1. Gå til repository-innstillingene på GitHub
2. Naviger til **Settings** → **Pages**
3. Under **Source**, velg **GitHub Actions**
4. Deployment vil starte automatisk ved neste push til `main`

### Manuell Deployment

Du kan også trigge en deployment manuelt:

1. Gå til **Actions**-fanen i GitHub-repositoryet
2. Velg **Deploy to GitHub Pages** workflow
3. Klikk på **Run workflow**
4. Velg `main`-branchen og klikk **Run workflow**

### Deployment-konfigurasjon

Deployment-konfigurasjonen finnes i `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:
```

Vite-konfigurasjonen i `vite.config.js` er satt opp med riktig base path:

```javascript
export default defineConfig({
  base: '/Cursor-Tutorial/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
```

## 📂 Prosjektstruktur

```
Cursor-Tutorial/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deployment workflow
├── src/
│   ├── parser.js               # Parsing av punktsky-filer
│   ├── viewer.js               # Three.js scene setup
│   ├── ui.js                   # GUI og brukergrensesnitt
│   ├── selection.js            # Seleksjons- og eksportlogikk
│   ├── stats.js                # Statistikk og dashboard
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
   - Velg en fil i .xyz, .txt, .pcd eller .ply-format
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

1. Sjekk at GitHub Pages er aktivert i repository-innstillingene
2. Verifiser at workflow-filen `.github/workflows/deploy.yml` eksisterer
3. Sjekk **Actions**-fanen for detaljerte feilmeldinger
4. Sørg for at `base`-stien i `vite.config.js` matcher repository-navnet

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
