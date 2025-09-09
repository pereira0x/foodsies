# Foodsies — Quick Nutrition Reference

Simple, local, web app to store ingredients/products and compute meal totals for calories and protein. No accounts, no backend — everything is saved to your browser via localStorage. Export/Import JSON for backups.

How it works:
- Add ingredients/products with calories and protein per 100g.
- Optionally define a portion (e.g., cookie = 8g) to work in portions instead of grams.
- Compose meals by mixing ingredients in grams or by portions and see totals instantly.
 - Organize days (named plans) with multiple meals and compare against daily goals.

Run it:
- Open `index.html` in your browser, or
- Serve locally: `python3 -m http.server` then open `http://localhost:8000`.

Backup/Restore:
- Use Settings → Export JSON to download your data.
- Use Settings → Import JSON to restore previously exported data.
 - Set daily calorie and protein goals in Settings; Days show totals and over/under deltas.

Notes:
- Data is stored only in your current browser. Clearing site data will remove it unless you exported a backup.
- Demo data is available in Settings to quickly try the UI.
