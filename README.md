# Slovak Dance Theatre — web

Statický web bez frameworku. Node build skript vygeneruje HTML z JSON dát.

## Štruktúra

```
data/events.json   tituly a termíny — JEDINÝ zdroj pravdy pre plagáty, kalendár aj detaily
data/site.json     obsah stránky — o nás, kontakt, kritiky, mestá, tanečníci, popup
src/styles.css     jeden zdieľaný štýl
src/app.js         jeden zdieľaný skript
static/            obrázky, video, logá → kopíruje sa do dist/assets/
build.mjs          generátor
dist/              výsledok, toto sa nasadzuje
```

## Build

```bash
node build.mjs            # produkčný build → dist/ s čistými adresami /repertoire/carmen/
PREVIEW=1 node build.mjs  # plochý build na otvorenie bez servera
```

Žiadne závislosti, žiadny `npm install`.

## Cloudflare Pages

- Build command: `node build.mjs`
- Build output directory: `dist`
- Framework preset: None

## Ako zmeniť termín

Uprav `data/events.json`, pole `performances`. Jeden záznam = jedno predstavenie:

```json
{ "production": "swan-lake", "date": "2026-11-14", "time": "19:00",
  "city": "Bratislava", "venue": "JANART Theatre",
  "status": "onsale", "ticketUrl": "https://..." }
```

`status` je `onsale` alebo `soldout`. Termíny v minulosti sa nezobrazujú automaticky.

## Čo ešte treba doplniť

- Skutočné plagáty titulov — v `static/posters/` sú zatiaľ zástupné.
- Fotky tanečníkov do `static/dancers/` a cestu doplniť v `site.json` (pole `photo`).
- Životopisy tanečníkov do poľa `bio` — kým je prázdne, karta sa nerozbalí.
- Skutočnú e-mailovú adresu v `site.json` → `contact.email`.
- Vlastné pozadie (video alebo landscape foto) pre detail každého titulu.

## Nasadenie na Cloudflare Pages (cez GitHub)

Odporúčaná cesta — každý `git push` znamená automatický redeploy.

1. V `data/site.json` nastav `"url"` na ostrú doménu (bez lomky na konci).
   Používa sa pre `canonical`, `og:url`, `sitemap.xml` a `robots.txt`.
2. Priečinok `site/` nahraj do GitHub repozitára (`dist/` je v `.gitignore`, nenahráva sa).
3. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
4. Nastavenia buildu:
   - Framework preset: **None**
   - Build command: `node build.mjs`
   - Build output directory: `dist`
   - Root directory: prázdne (alebo `site`, ak repo obsahuje aj iné priečinky)
   - Environment variable: `NODE_VERSION` = `22`
5. **Save and Deploy** → web beží na `<projekt>.pages.dev`.
6. Karta **Custom domains** → **Set up a domain** → apex doména → Cloudflare si CNAME
   vytvorí sám. Potom to isté pre `www`.

`_headers`, `sitemap.xml` a `robots.txt` generuje build sám, netreba ich verzovať.

### Alternatíva bez Gitu

`npx wrangler pages deploy dist --project-name=sdt` po lokálnom `node build.mjs`.
Pozor: projekt založený cez Direct Upload sa už nedá neskôr prepnúť na Git —
musel by sa založiť nový.
