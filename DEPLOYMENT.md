# Deployment Guide / Deployment-veiledning

## 🌐 GitHub Pages Deployment

Dette prosjektet er konfigurert for automatisk deployment til GitHub Pages ved hjelp av GitHub Actions.

---

## ⚠️ VIKTIG: Hvis deployment feiler med 404-feil

**GitHub Pages må aktiveres først!**

📖 Se [SETUP_GITHUB_PAGES.md](SETUP_GITHUB_PAGES.md) for en kort og konsis guide.

Denne filen (DEPLOYMENT.md) inneholder fullstendig dokumentasjon for både oppsett og feilsøking.

---

## 📋 Hurtigstart

### Verifiser Konfigurasjon (Anbefalt)

Før du aktiverer deployment, kjør verifikasjonsscriptet for å sjekke at alt er riktig konfigurert:

```bash
chmod +x verify-deployment.sh  # Kun nødvendig første gang
./verify-deployment.sh
```

Scriptet vil sjekke:
- ✓ Workflow-fil eksisterer
- ✓ Vite-konfigurasjon er korrekt
- ✓ Build-script fungerer
- ✓ Gitignore er riktig satt opp
- ✓ Dokumentasjon er på plass

### Forutsetninger

✅ GitHub-konto  
✅ Repository er offentlig (eller du har GitHub Pro/Enterprise for private repos med Pages)  
✅ Node.js 18+ installert lokalt for testing

### Aktivere Deployment (Første gang)

1. **Gå til Repository Settings**
   - Naviger til `https://github.com/NilsAE74/RENE-CloudStream3D/settings`
   - Eller klikk på **Settings**-fanen øverst i repositoryet

2. **Konfigurer GitHub Pages**
   - I venstre meny, klikk på **Pages** (under "Code and automation")
   - Under **Build and deployment**, velg:
     - **Source:** `GitHub Actions`
   - Klikk **Save** hvis nødvendig

3. **Verifiser Workflow Permissions**
   - I venstre meny, klikk på **Actions** → **General**
   - Scroll ned til **Workflow permissions**
   - Sørg for at **Read and write permissions** er valgt
   - Huk av for **Allow GitHub Actions to create and approve pull requests**
   - Klikk **Save**

4. **Trigger Første Deployment**
   
   **Alternativ A: Push til main**
   ```bash
   git add .
   git commit -m "Aktiver GitHub Pages deployment"
   git push origin main
   ```

   **Alternativ B: Manuell trigger**
   - Gå til **Actions**-fanen
   - Velg **Deploy to GitHub Pages** workflow
   - Klikk **Run workflow** → Velg `main` branch → **Run workflow**

5. **Vent på Deployment**
   - Gå til **Actions**-fanen for å se fremdrift
   - Deployment tar vanligvis 1-3 minutter
   - En grønn hake ✅ betyr suksess

6. **Besøk Din Live Site**
   - URL: `https://nilsae74.github.io/RENE-CloudStream3D/`
   - Det kan ta 1-2 minutter ekstra før siden er tilgjengelig første gang

## 🔄 Automatisk Deployment

Når GitHub Pages er aktivert, skjer deployment automatisk:

```
Push til main → GitHub Actions bygger → Deployer til Pages → Live oppdatering
```

### Workflow Triggers

Deployment starter automatisk når:

- ✅ Du pusher til `main`-branchen
- ✅ Du merger en pull request til `main`
- ✅ Du manuelt trigger workflow fra Actions-fanen

### Deployment Process

Workflowen utfører følgende steg:

```yaml
1. Checkout kode
2. Setup Node.js 18
3. Installer avhengigheter (npm ci)
4. Bygg applikasjon (npm run build)
5. Last opp build artifacts
6. Deploy til GitHub Pages
```

## 🛠️ Manuell Deployment

### Fra Lokal Maskin

```bash
# 1. Bygg prosjektet
npm run build

# 2. Test build lokalt
npm run preview

# 3. Commit og push (trigger auto-deploy)
git add .
git commit -m "Oppdatering av applikasjon"
git push origin main
```

### Direkte fra GitHub Actions

1. Gå til repositoryet på GitHub
2. Klikk på **Actions**-fanen
3. Velg **Deploy to GitHub Pages** i venstre meny
4. Klikk **Run workflow**-knappen (høyre side)
5. Velg branch (vanligvis `main`)
6. Klikk **Run workflow**

## 🔍 Verifisere Deployment

### Sjekk Workflow Status

1. Gå til **Actions**-fanen
2. Se den siste workflow-kjøringen
3. Grønn hake = suksess ✅
4. Rød X = feil ❌

### Sjekk Build Logs

Hvis deployment feiler:

1. Klikk på den feilede workflow-kjøringen
2. Klikk på `build`-jobben
3. Utvid stegene for å se detaljerte logger
4. Se spesielt på:
   - `Install dependencies`
   - `Build`

### Sjekk Live Site

```bash
# Åpne i nettleser
https://nilsae74.github.io/RENE-CloudStream3D/

# Eller bruk curl
curl -I https://nilsae74.github.io/RENE-CloudStream3D/
```

## 🐛 Feilsøking

### Problem: "404 - Failed to create deployment" i GitHub Actions

**Dette er den vanligste feilen!**

**Root Cause:** GitHub Pages er ikke aktivert i repository-innstillingene.

**Error message:**
```
Error: Failed to create deployment (status: 404)
Ensure GitHub Pages has been enabled
```

**Løsning:**
📖 **Se [SETUP_GITHUB_PAGES.md](SETUP_GITHUB_PAGES.md) for detaljerte instruksjoner.**

Kort oppsummering:
1. Gå til https://github.com/NilsAE74/RENE-CloudStream3D/settings/pages
2. Under "Build and deployment", sett **Source** til `GitHub Actions`
3. Sørg for at workflow permissions er satt til "Read and write"
4. Hvis repositoryet er **privat**, kreves GitHub Pro eller du må gjøre det offentlig

### Problem: "404 - Page not found" når du besøker siden

**Løsning:**
1. Verifiser at GitHub Pages er aktivert (Settings → Pages)
2. Sjekk at source er satt til "GitHub Actions"
3. Vent 2-3 minutter etter første deployment
4. Hard refresh i nettleser (Ctrl+Shift+R / Cmd+Shift+R)

### Problem: "Build failed" i Actions

**Løsning:**
```bash
# Test build lokalt først
npm install
npm run build

# Hvis det fungerer lokalt, prøv:
# 1. Oppdater package-lock.json
npm install
git add package-lock.json
git commit -m "Oppdater package-lock.json"
git push

# 2. Sjekk Node.js versjon i workflow matcher lokal versjon
```

### Problem: Blank/hvit side eller "Loading" stuck

**Løsning:**
1. Sjekk nettleserens konsoll (F12) for feil
2. Verifiser `base` path i `vite.config.js`:
   ```javascript
   base: '/RENE-CloudStream3D/'  // Må matche repo-navn
   ```
3. Sjekk at alle assets lastes fra riktig path

### Problem: CSS/JS filer ikke lastes

**Løsning:**
Kontroller at `base` i `vite.config.js` matcher repository-navnet:

```javascript
// vite.config.js
export default defineConfig({
  base: '/RENE-CloudStream3D/',  // <-- Viktig!
})
```

### Problem: Deployment permissions error

**Løsning:**
1. Gå til Settings → Actions → General
2. Under "Workflow permissions":
   - Velg "Read and write permissions"
   - Huk av "Allow GitHub Actions to create and approve pull requests"
3. Klikk Save

## 📊 Overvåke Deployment

### GitHub Actions Status Badge

Legg til i README.md for å vise deployment status:

```markdown
![Deploy Status](https://github.com/NilsAE74/RENE-CloudStream3D/actions/workflows/deploy.yml/badge.svg)
```

### Deployment History

Se alle tidligere deployments:
- Gå til **Actions**-fanen
- Se liste over alle workflow-kjøringer
- Klikk for detaljer om hver deployment

## 🔒 Sikkerhet

### Environment Secrets

Hvis du trenger hemmeligheter (API-nøkler, etc.):

1. Gå til Settings → Secrets and variables → Actions
2. Klikk **New repository secret**
3. Legg til navn og verdi
4. Bruk i workflow:
   ```yaml
   env:
     API_KEY: ${{ secrets.API_KEY }}
   ```

### Produksjonsmodus

Vite bygger automatisk i produksjonsmodus:
- Minifisert kode
- Optimaliserte assets
- Source maps disabled (standard)

## 🚀 Avanserte Konfigurasjoner

### Custom Domain

For å bruke eget domene (f.eks. `punktsky.example.com`):

1. Legg til `CNAME`-fil i `public/`-mappen:
   ```
   punktsky.example.com
   ```

2. Oppdater DNS hos domene-leverandør:
   ```
   Type: CNAME
   Name: punktsky
   Value: nilsae74.github.io
   ```

3. Oppdater `vite.config.js`:
   ```javascript
   base: '/'  // Root path for custom domain
   ```

### Deploy til Forskjellige Environments

For staging/production setup:

1. Opprett ny branch `staging`
2. Dupliser workflow-fil for staging
3. Deploy `staging` → `https://nilsae74.github.io/RENE-CloudStream3D/staging/`

## 📞 Support

### Nyttige Ressurser

- [GitHub Pages Dokumentasjon](https://docs.github.com/en/pages)
- [GitHub Actions Dokumentasjon](https://docs.github.com/en/actions)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)

### Problemer?

1. Sjekk [GitHub Status](https://www.githubstatus.com/)
2. Les [Actions logs](#sjekk-build-logs) for detaljer
3. Opprett en issue i repositoryet

## ✅ Deployment Sjekkliste

- [ ] GitHub Pages aktivert i Settings
- [ ] Workflow permissions satt til "Read and write"
- [ ] `base` path i `vite.config.js` matcher repo-navn
- [ ] `npm run build` fungerer lokalt
- [ ] `.github/workflows/deploy.yml` finnes og er riktig
- [ ] Første deployment kjørt og fullført
- [ ] Live site tilgjengelig på `https://nilsae74.github.io/RENE-CloudStream3D/`
- [ ] Hard refresh testet i nettleser
- [ ] Funksjonalitet verifisert på live site

---

**🎉 Gratulerer! Applikasjonen din er nå live på internett!**
