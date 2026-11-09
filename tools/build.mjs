#!/usr/bin/env node
/**
 * Build the site.
 *
 *   npm run build
 *
 * 1. writes images/<case>/<series>/manifest.json   (a browser cannot list a folder)
 * 2. generates cases/<case>/index.html            (one page per case, with Open Graph tags)
 * 3. generates content/cases.json                 (the weeks and doors of the calendar)
 *
 * Run it after adding images, cases, series, or flipping a case from
 * "open": false to "open": true.
 */
import { readdir, writeFile, readFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES_DIR = path.join(ROOT, 'content', 'cases');
const IMG_DIR = path.join(ROOT, 'images');
const OUT_DIR = path.join(ROOT, 'cases');
const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

const THEMES = ['thorax', 'cardio'];
const THEME_LABEL = { thorax: 'Thorax', cardio: 'Cardiovascular' };
const WEEK_DATES = {
  1: '1–7 December',
  2: '8–14 December',
  3: '15–21 December',
  4: '22–28 December',
};

const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
const mo = (bytes) => (bytes / (1024 * 1024)).toFixed(1) + ' MB';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

async function listImages(dir) {
  try {
    return (await readdir(dir))
      .filter((f) => EXT.has(path.extname(f).toLowerCase()))
      .sort(natural);
  } catch { return []; }
}

async function buildManifests(caseData, warnings) {
  let total = 0;
  let totalBytes = 0;
  let thumb = null;

  for (const serie of caseData.series) {
    if (!serie || !SLUG.test(String(serie.id || ''))) {
      throw new Error(`invalid series in ${caseData.id}: "id" must be a slug (a-z, 0-9, -)`);
    }
    const folder = String(serie.folder || '').replace(/\/+$/, '');
    if (!folder) throw new Error(`series "${serie.id}" of ${caseData.id}: missing "folder"`);

    const abs = path.join(ROOT, folder);
    const files = await listImages(abs);

    if (!files.length) {
      warnings.push(`${caseData.id}/${serie.id}: no images in ${folder}/`);
      await mkdir(abs, { recursive: true });
      await writeFile(path.join(abs, 'manifest.json'), '[]\n');
      continue;
    }

    let bytes = 0;
    for (const f of files) bytes += (await stat(path.join(abs, f))).size;
    totalBytes += bytes;
    total += files.length;
    if (!thumb) thumb = folder + '/' + files[0];

    await writeFile(path.join(abs, 'manifest.json'), JSON.stringify(files, null, 2) + '\n');

    const average = Math.round(bytes / files.length / 1024);
    console.log(`  ${folder.padEnd(34)} ${String(files.length).padStart(4)} slices · ${mo(bytes).padStart(7)}`);
    if (average > 400) {
      warnings.push(`${folder}: ${average} kB per image. Resize to 1600 px:
     sips -Z 1600 -s formatOptions 80 ${folder}/*.jpg`);
    }
  }

  return { total, totalBytes, thumb };
}

function fillTemplate(tpl, values) {
  return tpl.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => (key in values ? values[key] : ''));
}

function validate(data, file) {
  if (!SLUG.test(String(data.id || ''))) {
    throw new Error(`${file}: "id" must be a slug (a-z, 0-9, -), got "${data.id}"`);
  }
  if (!Number.isInteger(data.week) || data.week < 1) {
    throw new Error(`${file}: "week" must be a positive integer`);
  }
  if (!THEMES.includes(data.theme)) {
    throw new Error(`${file}: "theme" must be one of ${THEMES.join(', ')}`);
  }
  if (typeof data.open !== 'boolean') {
    throw new Error(`${file}: "open" must be true or false`);
  }
  if (!Array.isArray(data.series) || !data.series.length) {
    throw new Error(`${file}: no "series"`);
  }
  if (!data.title) throw new Error(`${file}: missing "title"`);
  if (!data.open && !data.opensOn) {
    throw new Error(`${file}: locked cases need "opensOn" (e.g. "8 December")`);
  }
}

async function main() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const version = pkg.version || '0.0.0';
  const homepage = (pkg.homepage || '').replace(/\/?$/, '/');

  const template = await readFile(path.join(ROOT, '_template.html'), 'utf8').catch(() => {
    throw new Error('_template.html not found at the project root.');
  });

  let files;
  try {
    files = (await readdir(CASES_DIR)).filter((f) => f.endsWith('.json')).sort(natural);
  } catch {
    throw new Error('Folder content/cases/ not found.');
  }
  if (!files.length) throw new Error('No cases in content/cases/.');

  await mkdir(OUT_DIR, { recursive: true });

  const warnings = [];
  const cases = [];
  let grandTotal = 0;

  console.log(`\nRadQuizz v${version} — build\n`);

  for (const file of files) {
    const raw = await readFile(path.join(CASES_DIR, file), 'utf8');
    let data;
    try { data = JSON.parse(raw); } catch (err) { throw new Error(`${file}: invalid JSON (${err.message})`); }

    validate(data, file);
    cases.push({ data, file });
  }

  // weeks first, then thorax before cardiovascular
  cases.sort((a, b) => (a.data.week - b.data.week)
    || (THEMES.indexOf(a.data.theme) - THEMES.indexOf(b.data.theme))
    || natural(a.data.id, b.data.id));

  let number = 0;
  const weeks = new Map();

  for (const { data } of cases) {
    number += 1;
    console.log(`• ${data.id} — ${data.title}${data.open ? '' : '  (locked)'}`);

    let total = 0;
    let totalBytes = 0;
    let thumb = null;

    if (data.open) {
      ({ total, totalBytes, thumb } = await buildManifests(data, warnings));
      grandTotal += totalBytes;
    }

    const ogImage = thumb
      ? (homepage ? new URL(thumb, homepage).href : thumb)
      : (homepage ? new URL('assets/og-image.png', homepage).href : 'assets/og-image.png');

    // a locked window must not spoil what is inside
    const pageTitle = data.open ? data.title : 'A wrapped window';
    const pageStem = data.open ? (data.stem || '') : `This window opens on ${data.opensOn}.`;

    const html = fillTemplate(template, {
      TITLE: esc(pageTitle),
      STEM: esc(pageStem),
      URL: esc(homepage ? new URL(`cases/${data.id}/`, homepage).href : `cases/${data.id}/`),
      OG_IMAGE: esc(ogImage),
      CASE_ID: esc(data.id),
      BASE: '../../',
      VERSION: esc(version),
    });

    const outDir = path.join(OUT_DIR, data.id);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, 'index.html'), html);

    if (!weeks.has(data.week)) {
      weeks.set(data.week, {
        week: data.week,
        dates: WEEK_DATES[data.week] || '',
        open: true,
        opensOn: '',
        cases: [],
      });
    }
    const week = weeks.get(data.week);
    if (!data.open) {
      week.open = false;
      if (!week.opensOn) week.opensOn = data.opensOn;
    }

    week.cases.push({
      id: data.id,
      number,
      title: data.title,
      stem: data.stem || '',
      exam: data.exam || '',
      theme: data.theme,
      themeLabel: THEME_LABEL[data.theme] || data.theme,
      open: data.open,
      opensOn: data.opensOn || '',
      href: `cases/${data.id}/`,
      thumb: thumb || '',
      seriesCount: data.series.length,
      sliceCount: total,
    });

    console.log(`  → cases/${data.id}/index.html  (${data.open ? total + ' slices' : 'locked'})\n`);
  }

  const index = [...weeks.values()].sort((a, b) => a.week - b.week);

  await writeFile(
    path.join(ROOT, 'content', 'cases.json'),
    JSON.stringify({ version, weeks: index }, null, 2) + '\n'
  );

  // the home page is static: keep its ?v= in sync with the version
  const homePath = path.join(ROOT, 'index.html');
  const home = await readFile(homePath, 'utf8');
  const busted = home.replace(/(assets\/[\w.-]+\.(?:css|js))\?v=[\w.-]+/g, `$1?v=${version}`);
  if (busted !== home) await writeFile(homePath, busted);

  const openCount = index.reduce((n, w) => n + w.cases.filter((c) => c.open).length, 0);
  console.log(`Total: ${number} cases across ${index.length} weeks, ${openCount} open, ` +
    `${grandTotal / 1024 / 1024 >= 0.1 ? mo(grandTotal) : Math.round(grandTotal / 1024) + ' kB'}.`);
  console.log('GitHub Pages reminder: 1 GB per site, ~100 GB of traffic per month (soft limits).');

  if (!homepage) warnings.push('package.json: missing "homepage", Open Graph URLs will be relative (LinkedIn ignores them).');
  if (warnings.length) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log('  ⚠ ' + w);
  }
  console.log('');
}

main().catch((err) => {
  console.error('\n✗ ' + err.message + '\n');
  process.exit(1);
});
