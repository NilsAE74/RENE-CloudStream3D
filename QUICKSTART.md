# Hurtigveiledning - Deployment

## 🚀 Kom i gang på 2 minutter

### 1. Aktiver GitHub Pages (kun første gang)

1. Gå til: `https://github.com/NilsAE74/Cursor-Tutorial/settings/pages`
2. Under "Build and deployment" → **Source**: Velg `GitHub Actions`
3. Ferdig! ✅

### 2. Deploy applikasjonen

**Automatisk (anbefalt):**
```bash
git push origin main
```

**Manuelt:**
1. Gå til: https://github.com/NilsAE74/Cursor-Tutorial/actions
2. Velg "Deploy to GitHub Pages"
3. Klikk "Run workflow"

### 3. Besøk live site

URL: **https://nilsae74.github.io/Cursor-Tutorial/**

---

## 📝 Viktige kommandoer

```bash
# Lokal utvikling
npm install          # Installer avhengigheter
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Bygg for produksjon
npm run preview      # Forhåndsvis produksjonsbygg

# Deployment
git add .
git commit -m "Din melding"
git push origin main  # Trigger automatisk deployment
```

---

## 🔍 Sjekk deployment status

1. **Actions-fanen:** https://github.com/NilsAE74/Cursor-Tutorial/actions
   - Grønn hake ✅ = Suksess
   - Rød X ❌ = Feil (klikk for detaljer)

2. **Live site:** https://nilsae74.github.io/Cursor-Tutorial/
   - Vent 2-3 minutter etter første deployment
   - Hard refresh: `Ctrl+Shift+R` (Windows/Linux) eller `Cmd+Shift+R` (Mac)

---

## 🐛 Vanlige problemer og løsninger

### Problem: 404 - Side ikke funnet

**Løsning:**
- Vent 2-3 minutter etter deployment
- Hard refresh i nettleser
- Sjekk at GitHub Pages er aktivert i Settings

### Problem: Blank side

**Løsning:**
- Åpne nettleserens konsoll (F12)
- Sjekk at `base: '/Cursor-Tutorial/'` i `vite.config.js` er riktig

### Problem: Build feiler

**Løsning:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## 📚 Mer informasjon

- Full dokumentasjon: Se `README.md`
- Detaljert deployment-guide: Se `DEPLOYMENT.md`
- GitHub Pages docs: https://docs.github.com/en/pages

---

**🎯 Det er alt du trenger å vite for å komme i gang!**
