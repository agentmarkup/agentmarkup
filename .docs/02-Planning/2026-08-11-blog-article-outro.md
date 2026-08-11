# Refacerea finalului articolelor

## Decizie

Cele 14 articole folosesc un singur final editorial: autor și recomandare principală într-un bloc 55/45, navigare compactă în ordinea publicațiilor și trei recomandări fără duplicate. Pe telefon, ordinea este autor, recomandare, navigare, articole asociate.

## Implementare

- `BlogFooter` păstrează prop-ul `currentSlug` și calculează ghidul, vecinii și recomandările din metadatele editoriale existente.
- Articolul curent, vecinii și recomandarea principală sunt excluse din cele trei carduri asociate.
- Linkul final „View all articles” conduce la `/blog/`; lista expandabilă este eliminată.
- Stilurile folosesc exclusiv tokenurile existente și trec la o singură coloană sub 48rem.

## Verificare

- Teste pentru primul, ultimul și un articol intermediar, plus deduplicarea tuturor celor 14 articole.
- `test`, `typecheck`, `lint`, build și verificarea SEO.
- Browser la 1280×900, 390×844 și 320px, în light și dark.
