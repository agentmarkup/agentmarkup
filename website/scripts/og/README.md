# Open Graph cards

Source HTML for social share images, rendered to PNG in `website/public/`.

- `fortune500-card.html` -> `public/og-fortune500.png` (1200x630)

Regenerate with headless Chrome (or any browser at a 1200x630 viewport):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --window-size=1200,630 --force-color-profile=srgb \
  --screenshot=../../public/og-fortune500.png \
  "file://$PWD/fortune500-card.html"
```
