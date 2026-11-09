# RadQuizz — Advent Calendar 2026

**Live: <https://gfahrni.github.io/radquizz-2026-advent-calendar/>** — repository:
<https://github.com/gfahrni/radquizz-2026-advent-calendar>

A static radiology advent calendar. **Eight cases over four weeks**, two per week —
one chest, one cardiovascular. Each case is its own page with a shareable link; the
tabs on that page are the **series** of the case (axial mediastinal, coronal lung, …).
Scroll through the slices, then give your diagnosis at the bottom. The answer goes to a
Google Sheet through an embedded Google Form.

Windows of future weeks stay **wrapped**: they show a number and the date they open.
Only open windows are clickable.

- **€0**, no server, no database, no API key.
- One page per case, with its own title, description and LinkedIn preview.
- Answers are **prefilled** (case + participant id): the participant only types their
  diagnosis and details.
- **Christmas theme only** — garland, gold accents and a discreet snowfall.

---

## 1. How it is organised

```
/images/<case>/<series>/001.jpg      the slices
/content/cases/<case>.json           the case file (title, history, series)
/cases/<case>/index.html             generated page, one per case (do not edit by hand)
/content/cases.json                  generated index: the weeks and doors of the calendar
```

One case = one JSON file + one image folder per series.

```json
{
  "id": "thorax-w1",
  "week": 1,
  "theme": "thorax",
  "open": true,
  "opensOn": "1 December",
  "title": "Right basal chest pain",
  "exam": "CT chest, non-contrast",
  "stem": "Woman, 54. Sudden right-sided chest pain when coughing…",
  "formLabel": "Case 1 — Right basal chest pain",
  "series": [
    {
      "id": "axial",
      "tab": "Axial",
      "note": "Axial slices · 0.6 mm",
      "folder": "images/thorax-w1/axial"
    },
    {
      "id": "coronal",
      "tab": "Coronal",
      "note": "Coronal reconstruction",
      "folder": "images/thorax-w1/coronal"
    }
  ]
}
```

- `id`: the case slug (a-z, 0-9, `-`). It gives the URL `…/cases/thorax-w1/`.
  **Do not change it once the link has been shared.**
- `week`: 1 to 4. Cases are grouped by week on the home page; within a week, `thorax`
  is listed before `cardio`.
- `theme`: `thorax` or `cardio` (displayed as “Thorax” / “Cardiovascular”).
- `open`: `true` once the window has been opened; `false` keeps it wrapped.
- `opensOn`: the date shown on a wrapped window (e.g. `8 December`). Required when
  `open` is `false`.
- `formLabel`: the value sent in the “Case” field of the form — your grouping key in the
  Sheet. Keep it stable.
- `tab`: short text in the tab. `note`: technical line shown above the slices.
- Series order = tab order.

### Opening a window

1. Add the real images to `images/<case>/<series>/`.
2. Set `"open": true` in `content/cases/<case>.json`.
3. `npm run build`, then commit and push.

The door becomes clickable on the home page, and its page stops showing the wrapped
window. Until then the page exists and says “This window is still wrapped.”

### Reading comfort

Console behaviour: scrolling is continuous and **instant**, with no animation between
slices.

- **Wheel / trackpad**: one slice per notch; small movements accumulate, a fast gesture
  crosses the stack. At either end of the stack, the page scrolls so you can reach the form.
- **Scrubber on the right** of the image: click or drag to move, or focus it and use the
  arrow keys.
- **Keyboard** on the image: ↑ ↓, Page↑ Page↓, Home / End.
- Settings at the top of `assets/app.js`: `SLICE_STEP` (wheel pixels per slice, 100)
  and `PRELOAD` (slices preloaded on each side, 4).

On touch screens, the native snapped scrolling is kept (one slice at a time).

---

## 2. Test locally

```bash
npm start          # → http://localhost:8000
```

or, without Node: `python3 -m http.server 8000`.

> Do not open `index.html` by double-clicking: browsers block JSON files over `file://`
> and the page stays empty.

---

## 3. Build the site

```bash
npm run build      # or: node tools/build.mjs
```

The script does three things:

1. writes `images/<case>/<series>/manifest.json` — a browser cannot list a folder, so this
   list is what makes the slices visible;
2. generates `cases/<case>/index.html` from `_template.html` (title, description,
   Open Graph tags);
3. generates `content/cases.json` for the home page (weeks, doors, numbers) and prints the
   total weight.

**Run it after adding images, a case or a series, and after opening a window**, then
commit (`cases/` is versioned — that is what GitHub Pages serves).

---

## 4. Create the Google Form

**Fastest way:** open <https://script.google.com>, paste
[tools/create-google-form.gs](tools/create-google-form.gs) into a new project, click **Run**
and copy the JSON block from the execution log. The script creates the form (same questions
as below) and prints the `formId` and `entry.…` ids ready for `content/form.json`.

Otherwise, in [forms.google.com](https://forms.google.com), create a form with, in this order:

| # | Question | Type | Required |
|---|---|---|---|
| 1 | Diagnosis | **Paragraph** (free text) | yes |
| 2 | Name | Short answer | yes |
| 3 | Email | Short answer + “email address” validation | yes |
| 4 | Status | **Multiple choice**: Junior / Senior | yes |
| 5 | Case | Short answer — label “*(prefilled — do not edit)*” | no |
| 6 | Participant ID | Short answer — label “*(prefilled — do not edit)*” | no |

Questions 5 and 6 are filled in by the page: they tell you **who** answered **which** case.

Google Forms has no hidden field: leave them visible at the end, it does not bother anyone.

Then, in the **Responses** tab → “Link to Sheets” → create the Sheet (one row per
submission).

Optional: in the Sheet, **Tools → Notification settings → any change → immediate
notification** (you are warned for every answer, no add-on needed).

---

## 5. Connect the form (5 minutes)

### a) The form id

**Send → `<>` tab (embed)**: the URL looks like

```
https://docs.google.com/forms/d/e/1FAIpQLSdXXXXXXXXXXXXXXXXXXXXXXXXXXXX/viewform?embedded=true
```

The id is the part between `/d/e/` and `/viewform`.

### b) The field ids (`entry.…`)

Menu **⋮ → Get pre-filled link**. Fill each field with a dummy value (`test`), click
**Get link**, then **Copy**.

The copied URL contains `?entry.123456789=test&entry.987654321=test`. Each `entry.…`
matches one question (fill one field at a time to be sure of the order), then paste the
result into `content/form.json`:

```json
{
  "formId": "1FAIpQLSdXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "entries": {
    "case": "entry.111111111",
    "participant": "entry.222222222",
    "diagnosis": "entry.333333333",
    "name": "entry.444444444",
    "email": "entry.555555555",
    "status": "entry.666666666"
  }
}
```

Reload: the answer form appears at the bottom of every case, already knowing which case
and which participant it belongs to.

> **Why six ids?** The site draws its own form (dark, English) and posts it straight to
> Google's `formResponse` endpoint — same form, same Sheet. That needs the id of every
> question. If only `case` and `participant` are set, the site falls back to the embedded
> Google iframe: it works, but it follows the visitor's Google/browser language and is
> always light.
>
> The Apps Script helper prints the six ids. If you collect them by hand, remember that
> the `entry.…` id is **not** the question id: use **⋮ → Get pre-filled link**.

> An `entry.…` changes if you **delete and recreate** a question. Editing it (text, order)
> does not change it.

---

## 6. Replace the images with your cases

One folder per series, images named in scrolling order:

```
images/thorax-w1/axial/001.jpg, 002.jpg, …
```

1. Delete the demo images, drop in yours.
2. Name them `001.jpg`, `002.jpg`, … (any name whose natural sort gives the right order
   works: `IMG_1.jpg`, `IMG_2.jpg`, `IMG_10.jpg`).
3. `npm run build`, then commit + push.

The placeholders currently in the repository are generated:

```bash
python3 tools/make-placeholders.py     # synthetic slices for every case
```

### Image weight

Aim for **1200–1600 px** wide and **~100–200 kB** per slice. Batch resize (macOS):

```bash
sips -Z 1600 -s formatOptions 80 images/thorax-w1/axial/*.jpg
npm run build
```

GitHub Pages limits: **1 GB** per site, **~100 GB** of traffic per month. 40 slices at
150 kB = 6 MB per series. Beyond that, move to Cloudflare Pages (no traffic quota,
20,000 files) or Cloudflare R2 for the images.

### Add a case

1. `content/cases/my-case.json` (copy one and adapt `id`, `week`, `theme`, `open`,
   `title`, `stem`, `formLabel`).
2. The folders `images/my-case/<series>/` with the JPGs.
3. `npm run build` → the page `cases/my-case/index.html` is created and the door appears
   in its week.

### Add a series to an existing case

Add a folder `images/thorax-w1/sagittal/` and an entry in the case JSON `series`, then
`npm run build`. The tab appears automatically.

---

## 7. The Christmas theme

There is no toggle: the site is **in Christmas theme all the time**. `assets/theme.js`
applies `data-theme="noel"` on load and does nothing else.

All the design lives in the variables at the top of `assets/style.css` (`:root`):
night-green background, red for actions, gold for accents. The decorations are grouped at
the end of the file, section “12. Christmas decoration”:

- **snowfall**: a full-screen `<canvas>` added by `assets/theme.js`, drawing the SVG flakes
  from `assets/neige/` at random sizes, positions and rotations (flakes fall, drift
  sideways and spin). Settings at the top of `theme.js`: `AREA_PER_FLAKE` (density),
  `MIN_FLAKES`/`MAX_FLAKES`, `MIN_SIZE`/`MAX_SIZE`. If the visitor asked for “reduce
  motion”, a still image is drawn instead. The flake shapes are regenerated with
  `python3 tools/make-snowflakes.py`;
- **garland** under the header (`.chrome::after`) and a **tricolour ribbon** at the top of
  every card;
- **gold frame** around the viewer (corner brackets), a festive rule above the answer
  area, an ornament under the intro.

The LinkedIn preview (`assets/og-image.png`, 1200×630) is generated, not hand-drawn:

```bash
python3 tools/make-og.py     # rerun if the title or the dates change
```

**The form itself does not follow the theme**: it is a Google iframe, impossible to style
from the page. To avoid the contrast, change its palette in Google Forms too (palette
icon). Same form, same Sheet.

---

## 8. Deploy, update, version

First deployment (already done for this repository):

```bash
git init && git add . && git commit -m "RadQuizz"
gh repo create radquizz-2026-advent-calendar --public --source=. --push
gh api -X POST repos/<account>/radquizz-2026-advent-calendar/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

Updates:

```bash
npm run build && git add . && git commit -m "New case" && git push
```

The version lives in `package.json` (`version`), is injected into the pages at build time
and shown in the footer. The build also appends `?v=<version>` to the CSS and JS files:
every new version number invalidates their browser cache automatically. To publish a
version:

```bash
npm version 0.6.0 --no-git-tag-version
npm run build
git add . && git commit -m "v0.6.0"
git tag v0.6.0 && git push && git push --tags
```

> ⚠️ The repository is **public**: anyone can download the images. Anonymise the DICOMs
> before export (name, date, record number, burnt-in annotations, file name) and avoid
> identifying cases without consent.

---

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Empty page, endless spinner | Opened over `file://` → run `npm start` |
| Empty home page / “No cases published yet” | `npm run build` not run (generates `content/cases.json`) |
| 404 on `/cases/my-case/` | `npm run build` not run after creating the JSON |
| No images, “No slices for this series” | Missing `manifest.json` → `npm run build` |
| A wrapped window still shows old content | `"open": true` set but no rebuild |
| Old series still visible | Stale folder under `cases/`: delete it and rebuild |
| Blank form | Wrong `formId`, restricted form, or cookie blocker |
| Double scrollbar inside the form | Adjust `.form-shell iframe` `height` in `assets/style.css` (1200 px desktop / 1560 px mobile) |
| Answers do not reach the Sheet | Responses tab → check the Sheet; form must be “Anyone with the link” |
| An update does not show up | Browser cache: GitHub Pages sends `cache-control: max-age=600`. Reload with `Cmd/Ctrl + Shift + R`, or wait 10 minutes. Clearing cookies does nothing. |

---

## 10. Structure

```
index.html                  home: the weeks and doors of the calendar
_template.html              template of a case page (edited by the build)
cases/<case>/index.html     generated pages, one per case

assets/style.css            design + Christmas decorations (CSS variables)
assets/theme.js             single theme + snowfall + shared local storage
assets/app.js               case page: series, image stack, form
assets/home.js              home: weeks, open doors, wrapped windows
assets/neige/               the three snowflake SVGs (generated)
assets/og-image.png         LinkedIn preview of the home page (1200×630)

content/cases/<case>.json   ← to edit: the cases
content/cases.json          generated: weeks and doors for the home page
content/form.json           ← to edit: the Google Form id

images/<case>/<series>/     the slices + generated manifest.json

tools/build.mjs             manifest + pages + index
tools/serve.mjs             local test server
tools/make-placeholders.py  regenerate the demo images
tools/make-snowflakes.py    regenerate the snowfall flakes
tools/make-og.py            regenerate the LinkedIn preview
tools/create-google-form.gs  create the answer form from Apps Script
package.json                site version + scripts
.nojekyll                   keeps GitHub Pages from running Jekyll
```

JavaScript with no dependencies and no build step: what you push to GitHub is exactly what
is served.
