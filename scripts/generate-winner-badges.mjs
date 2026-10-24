import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import sharp from 'sharp';

// Manual, build-time export only. No image rendering or Sharp in the claim API.
const root = resolve(import.meta.dirname, '..');
const input = join(root, 'scripts/assets/winner-badges');
const cohortFile = await readFile(join(root, 'src/data/winners-2026.json'));
const cohort = JSON.parse(cohortFile.toString());
const requested = process.argv.slice(2);
const websiteHost = (value) => new URL(value).hostname.toLowerCase().replace(/^www\./, '');
if (requested.some((website) => !cohort.some((r) => websiteHost(r.website) === website)))
  throw new Error('Only approved websites can be exported.');
const selected = requested.length
  ? cohort.filter((r) => requested.includes(websiteHost(r.website)))
  : cohort;
const font = await readFile(
  join(
    root,
    'node_modules/@fontsource-variable/funnel-sans/files/funnel-sans-latin-wght-normal.woff2'
  )
);
const logos = {
  light: await readFile(join(input, 'logo-colour.png')),
  dark: await readFile(join(input, 'logo-reversed.png'))
};
const frames = {};
for (const id of ['A-light', 'A-dark', 'C-light', 'C-dark'])
  frames[id] = await readFile(join(input, `${id}.png`));
const hash = createHash('sha256')
  .update(cohortFile)
  .update(font)
  .update(await readFile(import.meta.filename));
for (const buffer of [...Object.values(logos), ...Object.values(frames)]) hash.update(buffer);
const version = hash.digest('hex').slice(0, 12);
const prefix = `/winner-resources/2026/${version}`;
const output = join(root, 'public', prefix);
const previous = requested.length
  ? JSON.parse(await readFile(join(root, 'src/data/badge-assets-2026.json'), 'utf8'))
  : undefined;
const manifest = { year: 2026, version, prefix, winners: { ...previous?.winners } };
const host = (value) => new URL(value).hostname.toLowerCase().replace(/^www\./, '');
const dataUri = (data, type) => `data:${type};base64,${data.toString('base64')}`;
const escape = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const position = (p) => `left:${p.left}px;top:${p.top}px;width:${p.width}px;`;
const templates = [
  {
    id: 'A',
    name: 'Signature crest',
    width: 1254,
    height: 1254,
    sizes: [240, 480, 980],
    logo: { left: 310, top: 240, width: 634 },
    label: { left: 260, top: 525, width: 734, size: 70, spacing: 6, gap: 26 },
    divider: { left: 452, top: 666, width: 350 },
    title: { left: 270, top: 724, width: 714, size: 69 },
    domain: { left: 330, top: 965, width: 594, size: 44 },
    developerTitle: { left: 280, top: 754, width: 694, size: 61 },
    role: { left: 300, top: 702, width: 654, size: 28 },
    developer: { left: 330, top: 925, width: 594, size: 39 },
    developerDomain: { left: 320, top: 997, width: 614, size: 35 }
  },
  {
    id: 'C',
    name: 'Architectural plaque',
    width: 1983,
    height: 793,
    sizes: [600, 1200, 1902],
    logo: { left: 185, top: 225, width: 785 },
    label: { left: 1145, top: 235, width: 710, size: 64, spacing: 6, gap: 25 },
    divider: { left: 1230, top: 342, width: 540 },
    title: { left: 1145, top: 390, width: 710, size: 56 },
    domain: { left: 140, top: 528, width: 900, size: 46 },
    developerLogo: { left: 220, top: 210, width: 715 },
    developerTitle: { left: 1145, top: 420, width: 710, size: 50 },
    role: { left: 1145, top: 368, width: 710, size: 28 },
    developer: { left: 140, top: 469, width: 900, size: 40 },
    developerDomain: { left: 140, top: 535, width: 900, size: 36 }
  }
];
const crops = {};
for (const t of templates) {
  const { data, info } = await sharp(frames[`${t.id}-light`])
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x1 = info.width,
    y1 = info.height,
    x2 = 0,
    y2 = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 220) {
        x1 = Math.min(x1, x);
        y1 = Math.min(y1, y);
        x2 = Math.max(x2, x);
        y2 = Math.max(y2, y);
      }
  const left = Math.max(0, x1 - 8),
    top = Math.max(0, y1 - 8),
    right = Math.min(info.width, x2 + 9),
    bottom = Math.min(info.height, y2 + 9);
  crops[t.id] = { left, top, width: right - left, height: bottom - top };
}
const browser = await chromium.launch({ headless: true });
let exports = 0;
try {
  const page = await browser.newPage();
  for (const record of selected) {
    const website = host(record.website);
    const entry = {
      website,
      websiteUrl: record.website,
      award: record.award,
      ...(record.developer ? { developer: record.developer } : {}),
      roles: []
    };
    for (const role of record.developer ? ['business', 'developer'] : ['business']) {
      const developer = role === 'developer';
      const badges = [];
      const directory = join(output, website, role);
      await mkdir(directory, { recursive: true });
      for (const t of templates)
        for (const tone of ['light', 'dark']) {
          const id = `${t.id}-${tone}`;
          const dark = tone === 'dark';
          const ink = dark || t.id === 'C' ? '#fbf8f0' : '#09182c';
          const gold = dark || t.id === 'C' ? '#d7b976' : '#95713a';
          const domainInk = dark ? '#c6d2e4' : '#465266';
          const title = developer ? t.developerTitle : t.title;
          const domain = developer ? t.developerDomain : t.domain;
          const logo = developer && t.developerLogo ? t.developerLogo : t.logo;
          await page.setViewportSize({ width: t.width, height: t.height });
          await page.setContent(`<!doctype html><html lang="en"><head><style>
    @font-face{font-family:Badge;src:url(${dataUri(font, 'font/woff2')});font-weight:300 800;font-display:block}
    *{box-sizing:border-box}html,body{margin:0;width:${t.width}px;height:${t.height}px;background:transparent;overflow:hidden;font-family:Badge,sans-serif}
    img,p,.line{position:absolute;margin:0}p{text-align:center}.frame{inset:0;width:100%;height:100%}.logo{height:auto}.result{display:flex;align-items:baseline;justify-content:center;white-space:nowrap;font-weight:700;line-height:1.15}
    .title{font-weight:600;letter-spacing:-.8px;line-height:1.16;white-space:nowrap}.domain{font-weight:500;letter-spacing:.6px;line-height:1.2;white-space:nowrap}.role{font-weight:600;letter-spacing:2px;line-height:1.2}.developer{font-weight:650;letter-spacing:.5px;line-height:1.2;white-space:nowrap}.line{height:1px;background:#b99c60}
    </style></head><body>
    <img class="frame" src="${dataUri(frames[id], 'image/png')}" alt="">
    <img class="logo" style="${position(logo)}" src="${dataUri(logos[tone], 'image/png')}" alt="Best Website Awards">
    <p class="result" style="${position(t.label)}font-size:${t.label.size}px;letter-spacing:${t.label.spacing}px;gap:${t.label.gap}px;color:${ink}"><span>WINNER</span><span style="font-weight:550;color:${gold}">2026</span></p>
    <div class="line" style="${position(t.divider)}"></div>
    ${developer ? `<p class="role" style="${position(t.role)}font-size:${t.role.size}px;color:${gold}">Developer</p><p class="developer" style="${position(t.developer)}font-size:${t.developer.size}px;color:${domainInk}">${escape(record.developer)}</p>` : ''}
    <p class="title" style="${position(title)}font-size:${title.size}px;color:${ink}">${escape(record.award)}</p>
    <p class="domain" style="${position(domain)}font-size:${domain.size}px;color:${domainInk}">${escape(website)}</p>
    </body></html>`);
          await page.evaluate(() => document.fonts.ready);
          const metrics = await page.evaluate(
            ({ award, width, size }) => {
              const el = document.querySelector('.title');
              const ctx = document.createElement('canvas').getContext('2d');
              const words = award.split(' ');
              let best;
              for (let font = size; font >= size - 6; font--) {
                ctx.font = `600 ${font}px Badge`;
                for (let split = 1; split < words.length; split++) {
                  const lines = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
                  const widths = lines.map((line) => ctx.measureText(line).width);
                  if (Math.max(...widths) > width - 12) continue;
                  const score = Math.max(...widths) + Math.abs(widths[0] - widths[1]) * 0.2;
                  if (!best || score < best.score) best = { lines, font, score };
                }
                if (best) break;
              }
              if (!best) throw new Error(`Title cannot fit: ${award}`);
              el.replaceChildren();
              best.lines.forEach((line, i) => {
                if (i) el.append(document.createElement('br'));
                el.append(document.createTextNode(line));
              });
              el.style.fontSize = `${best.font}px`;
              const domain = document.querySelector('.domain');
              while (domain.scrollWidth > domain.clientWidth + 1) {
                const px = parseFloat(getComputedStyle(domain).fontSize);
                if (px < 26) throw new Error('Domain cannot fit');
                domain.style.fontSize = `${px - 1}px`;
              }
              return {
                lines: best.lines,
                font: best.font,
                overflow: [...document.querySelectorAll('p')].some(
                  (n) => n.scrollWidth > n.clientWidth + 1
                )
              };
            },
            { award: record.award, width: title.width, size: title.size }
          );
          if (
            metrics.overflow ||
            (await page.locator('.title').innerText()).replace(/\s+/g, ' ') !== record.award
          )
            throw new Error(`Text verification failed ${website} ${id}`);
          const master = await sharp(await page.screenshot({ omitBackground: true }))
            .extract(crops[t.id])
            .png()
            .toBuffer();
          const sizes = await Promise.all(
            t.sizes.map(async (width, i) => {
              const size = ['small', 'medium', 'large'][i];
              const resized = await sharp(master).resize({ width }).png().toBuffer();
              // Indexed PNG and high-quality WebP keep downloads small, with full alpha.
              const [png, webp] = await Promise.all([
                sharp(resized)
                  .png({
                    palette: true,
                    colours: 256,
                    quality: 100,
                    dither: 0.2,
                    compressionLevel: 9
                  })
                  .toBuffer(),
                sharp(resized)
                  .webp({ quality: 96, alphaQuality: 100, effort: 5, smartSubsample: true })
                  .toBuffer()
              ]);
              const stem = `${id}-${width}w`;
              await Promise.all([
                writeFile(join(directory, `${stem}.png`), png),
                writeFile(join(directory, `${stem}.webp`), webp)
              ]);
              exports += 2;
              const meta = await sharp(png).metadata();
              return {
                id: size,
                width: meta.width,
                height: meta.height,
                png: `${prefix}/${website}/${role}/${stem}.png`,
                webp: `${prefix}/${website}/${role}/${stem}.webp`
              };
            })
          );
          const preview = sizes[1];
          badges.push({
            id,
            design: t.id,
            name: t.name,
            tone,
            preview: {
              src: preview.webp,
              alt: `${developer ? record.developer + ' developer recognition, ' : ''}${record.award}, ${website}, Best Website Awards 2026 winner`,
              width: preview.width,
              height: preview.height
            },
            sizes
          });
        }
      entry.roles.push({ id: role, ...(developer ? { name: record.developer } : {}), badges });
    }
    manifest.winners[website] = entry;
    console.log(`Exported ${website}${record.developer ? ' (business + developer)' : ''}`);
  }
  await page.close();
} finally {
  await browser.close();
}
await writeFile(
  join(root, 'src/data/badge-assets-2026.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);
console.log(
  JSON.stringify({
    winners: cohort.length,
    badgeSets: Object.values(manifest.winners).reduce(
      (sum, winner) => sum + winner.roles.length,
      0
    ),
    variants: Object.values(manifest.winners).reduce(
      (sum, winner) => sum + winner.roles.length * 4,
      0
    ),
    exports,
    version,
    browserClosed: true
  })
);
