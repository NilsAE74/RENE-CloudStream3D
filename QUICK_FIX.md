# 🚀 Quick Fix Guide for Deployment

## The Problem

Your GitHub Pages deployment is failing with:
```
Error: Failed to create deployment (status: 404)
```

## The Solution (2 minutes)

### Step 1: Enable GitHub Pages
1. Go to: https://github.com/NilsAE74/RENE-CloudStream3D/settings/pages
2. Under "Build and deployment":
   - Set **Source** to: `GitHub Actions`
3. Click **Save** (if button appears)

### Step 2: Set Permissions
1. Go to: https://github.com/NilsAE74/RENE-CloudStream3D/settings/actions
2. Under "Workflow permissions":
   - Select: `Read and write permissions`
   - Check: `Allow GitHub Actions to create and approve pull requests`
3. Click **Save**

### Step 3: Check Repository Visibility

**Is your repository PRIVATE?**
- If YES → You need GitHub Pro OR make it public
- If NO (public) → You're good to go!

To make it public (if needed):
1. Go to: https://github.com/NilsAE74/RENE-CloudStream3D/settings
2. Scroll to "Danger Zone"
3. Click "Change visibility" → "Make public"

### Step 4: Deploy!

**Option A - Push to main:**
```bash
git add .
git commit -m "Enable GitHub Pages"
git push origin main
```

**Option B - Manual trigger:**
1. Go to: https://github.com/NilsAE74/RENE-CloudStream3D/actions
2. Click "Deploy to GitHub Pages"
3. Click "Run workflow" → Select `main` → "Run workflow"

### Step 5: Wait and Access

- Wait 1-3 minutes for deployment
- Access your site: https://nilsae74.github.io/RENE-CloudStream3D/

## 📖 Need More Details?

See [SETUP_GITHUB_PAGES.md](SETUP_GITHUB_PAGES.md) for complete instructions.

## ✅ Success Indicators

- ✅ Green checkmark in Actions tab
- ✅ Site loads at https://nilsae74.github.io/RENE-CloudStream3D/
- ✅ No errors in browser console

## ❌ Still Not Working?

Check:
1. GitHub Pages is enabled (Step 1)
2. Source is set to "GitHub Actions" (not "Deploy from a branch")
3. Workflow completed successfully (green checkmark)
4. Repository is public OR you have GitHub Pro
5. Browser cache cleared (Ctrl+Shift+R)

For detailed troubleshooting, see [DEPLOYMENT.md](DEPLOYMENT.md)
