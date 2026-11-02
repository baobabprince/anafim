# i18n EN/HE — finishing this PR

## Already on this branch
- `main.jsx` wires `I18nProvider` + `i18n.css`
- `src/i18n/*` dictionaries, LangToggle, LTR CSS (from master)
- Assemble workflow (optional)

## Still required (large files)
`App.jsx` and `CloudAccess.jsx` must be restored from the good copies (tooling cannot upload ~60KB files reliably).

### Option A — from your machine (recommended)

```bash
git fetch origin
git checkout feature/i18n-en
git pull

# Restore good App from history, then apply i18n (or copy from restore pack)
git show ba693496fc6a46b8a052bb3fc8302fb94fbed2c6:family-viewer/src/App.jsx > family-viewer/src/App.jsx
git show 0635342de1f54deda4e43b181c8ac8cf583d3686:family-viewer/src/CloudAccess.jsx > family-viewer/src/CloudAccess.jsx

# 2-day vault lock
sed -i 's/10\*60\*1000/2*24*60*60*1000/' family-viewer/src/CloudAccess.jsx
sed -i 's/נעילה אוטומטית אחרי 10 דקות ללא פעילות/נעילה אוטומטית אחרי יומיים ללא פעילות/' family-viewer/src/CloudAccess.jsx

# Wire i18n into App (if using restore pack App.jsx, skip sed and copy that file instead)
# Prefer copying the prepared App.jsx from the restore-i18n pack that includes LangToggle.

git add family-viewer/src/App.jsx family-viewer/src/CloudAccess.jsx
git commit -m "Restore App.jsx (i18n) and CloudAccess.jsx (2-day lock)"
git push origin feature/i18n-en
```

### After push
- Open the PR, verify CI
- Merge to master
- Deploy → EN button appears in the sidebar

### Verify
- `LangToggle` / `useI18n` in App.jsx
- `2*24*60*60*1000` in CloudAccess.jsx
- `I18nProvider` in main.jsx
