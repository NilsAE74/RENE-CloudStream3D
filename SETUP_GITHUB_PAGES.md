# GitHub Pages Setup Instructions

## ⚠️ IMPORTANT: Enable GitHub Pages First

Your deployment is failing because **GitHub Pages has not been enabled** for this repository.

### Error from GitHub Actions:
```
Error: Failed to create deployment (status: 404)
Ensure GitHub Pages has been enabled
```

## 🔧 How to Fix (Required Steps)

### Step 1: Enable GitHub Pages

1. Go to your repository settings: https://github.com/NilsAE74/RENE-CloudStream3D/settings/pages

2. Under **"Build and deployment"**:
   - **Source**: Select `GitHub Actions`
   - This is crucial - do NOT select "Deploy from a branch"

3. Click **Save** if the save button appears

### Step 2: Verify Workflow Permissions

1. Go to: https://github.com/NilsAE74/RENE-CloudStream3D/settings/actions

2. Scroll to **"Workflow permissions"**:
   - ✅ Select **"Read and write permissions"**
   - ✅ Check **"Allow GitHub Actions to create and approve pull requests"**

3. Click **Save**

### Step 3: Trigger Deployment

After enabling GitHub Pages, trigger a deployment:

**Option A - Push to main branch:**
```bash
git add .
git commit -m "Enable GitHub Pages"
git push origin main
```

**Option B - Manual trigger:**
1. Go to: https://github.com/NilsAE74/RENE-CloudStream3D/actions
2. Click on **"Deploy to GitHub Pages"** workflow
3. Click **"Run workflow"**
4. Select `main` branch
5. Click **"Run workflow"**

### Step 4: Wait for Deployment

- Go to **Actions** tab to monitor progress
- Deployment typically takes 1-3 minutes
- Look for a green checkmark ✅

### Step 5: Access Your Site

Once deployed successfully, your site will be available at:
```
https://nilsae74.github.io/RENE-CloudStream3D/
```

## 📋 Important Notes

### Private Repository Considerations

**⚠️ This is a PRIVATE repository.**

For GitHub Pages to work with private repositories, you need:
- GitHub Pro, GitHub Team, GitHub Enterprise Cloud, OR
- GitHub Enterprise Server

**If you have a free GitHub account:**
- Make the repository **public** to use GitHub Pages
- OR upgrade to GitHub Pro

To make the repository public:
1. Go to: https://github.com/NilsAE74/RENE-CloudStream3D/settings
2. Scroll to the **"Danger Zone"**
3. Click **"Change repository visibility"**
4. Select **"Make public"**
5. Confirm the change

## ✅ Verification Checklist

After setup, verify everything is working:

- [ ] GitHub Pages is enabled in Settings → Pages
- [ ] Source is set to "GitHub Actions"
- [ ] Workflow permissions are set to "Read and write"
- [ ] Workflow has run successfully (green checkmark in Actions tab)
- [ ] Site is accessible at https://nilsae74.github.io/RENE-CloudStream3D/
- [ ] Application loads correctly (no 404 or blank pages)

## 🔍 Troubleshooting

### Issue: "404 - Page not found" error

**Solution:**
- Wait 2-3 minutes after first deployment
- Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
- Clear browser cache
- Verify GitHub Pages is enabled with source set to "GitHub Actions"

### Issue: Deployment workflow fails with 404

**Solution:**
- GitHub Pages is not enabled → Follow Step 1 above
- OR repository is private and you don't have GitHub Pro → Make it public

### Issue: Blank page or CSS/JS not loading

**Solution:**
- Check browser console (F12) for errors
- Verify `base` in `vite.config.js` matches repository name:
  ```javascript
  base: '/RENE-CloudStream3D/'  // Must match repo name exactly
  ```

### Issue: Workflow succeeds but page shows old content

**Solution:**
- Clear browser cache
- Hard refresh (Ctrl+Shift+R)
- Wait 1-2 minutes for CDN propagation

## 📞 Need Help?

If you continue to have issues:

1. Check workflow logs in the Actions tab for specific errors
2. Verify all checklist items above
3. See the main DEPLOYMENT.md file for additional troubleshooting

## 🎯 Quick Reference

| Setting | Value |
|---------|-------|
| GitHub Pages Source | GitHub Actions |
| Workflow Permissions | Read and write |
| Repository Visibility | Public (or GitHub Pro for private) |
| Deployment URL | https://nilsae74.github.io/RENE-CloudStream3D/ |
| Vite Base Path | /RENE-CloudStream3D/ |
| Build Output | ./dist |
