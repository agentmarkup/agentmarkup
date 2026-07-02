# Open Graph cards

Source HTML for social share images, rendered to PNG in `website/public/`.

- `card-500-companies.html` -> `public/og-500-companies.png` (1200x630)

Regenerate with headless Chrome (or any browser at a 1200x630 viewport):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --window-size=1200,630 --force-color-profile=srgb \
  --screenshot=../../public/og-500-companies.png \
  "file://$PWD/card-500-companies.html"
```
