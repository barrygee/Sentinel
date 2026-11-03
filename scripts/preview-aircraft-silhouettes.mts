/**
 * Aircraft silhouette preview (locally `npm run preview:aircraft-silhouettes [output.html]`).
 *
 * Writes one self-contained HTML page showing every aircraft family and every
 * type in the designator table, drawn exactly as the generator produces them:
 * at map size in Sentinel's civil, military and emergency colours, rotated to
 * sample headings, plus a large copy of each family for checking proportions.
 * Use it to review the look before (and after) changing a planform or adding a
 * type — the shapes are generated, so this page is the only way to see them
 * without running the app.
 *
 * Runs on Node's built-in TypeScript support (no build step). The generator is
 * imported by package name, which resolves through `@sentinel/map-kit`'s
 * `exports` map to its `.ts` sources.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
    AIRCRAFT_FAMILIES,
    AIRCRAFT_FAMILY_IDS,
} from '@sentinel/map-kit/aircraft-silhouettes/aircraftFamilies';
import {
    buildAircraftSilhouette,
    renderSilhouetteSvg,
    silhouetteImageSidePx,
} from '@sentinel/map-kit/aircraft-silhouettes/aircraftSilhouette';
import { AIRCRAFT_TYPE_DIMENSIONS } from '@sentinel/map-kit/aircraft-silhouettes/aircraftTypeDimensions';

/** Sentinel's three aircraft colours (AdsbLiveControl). */
const COLOUR_SCHEMES = [
    { name: 'Civil', fill: '#00aaff' },
    { name: 'Military', fill: '#c8ff00' },
    { name: 'Emergency', fill: '#ff2222' },
] as const;

/** Outline thickness at map size, in pixels. */
const MAP_OUTLINE_PX = 1;

/** Size of the enlarged copy used to judge proportions. */
const DETAIL_ICON_PX = 180;

/** Headings each family is shown at, to check rotation stays inside the square. */
const SAMPLE_HEADINGS_DEG = [0, 45, 135, 270];

/** Escape text for HTML content and attributes. */
function escapeHtml(text: string): string {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

/** Wrap an SVG so assistive tech announces it as one labelled image. */
function labelledImage(svg: string, label: string): string {
    return `<span role="img" aria-label="${escapeHtml(label)}">${svg}</span>`;
}

/** Map-size SVG for a silhouette, at the size the live map draws it (zoomed out). */
function mapSizeSvg(
    silhouette: ReturnType<typeof buildAircraftSilhouette>,
    fill: string,
    rotationDeg: number,
): string {
    const sizePx = silhouetteImageSidePx(silhouette, MAP_OUTLINE_PX);
    return renderSilhouetteSvg(silhouette, {
        fillColour: fill,
        outlineColour: '#000000',
        outlineWidthPx: MAP_OUTLINE_PX,
        sizePx,
        rotationDeg,
    });
}

/** One card per family: large drawing plus every colour at several headings. */
function familySection(): string {
    const cards = AIRCRAFT_FAMILY_IDS.map((familyId) => {
        const family = AIRCRAFT_FAMILIES[familyId];
        const silhouette = buildAircraftSilhouette(familyId);
        const detail = renderSilhouetteSvg(silhouette, {
            fillColour: '#00aaff',
            outlineColour: '#000000',
            outlineWidthPx: 3,
            sizePx: DETAIL_ICON_PX,
        });
        const mapRows = COLOUR_SCHEMES.map((scheme) => {
            const icons = SAMPLE_HEADINGS_DEG.map((heading) =>
                labelledImage(
                    mapSizeSvg(silhouette, scheme.fill, family.fixedOrientation ? 0 : heading),
                    `${family.label}, ${scheme.name.toLowerCase()}, heading ${heading} degrees`,
                ),
            ).join('');
            return `<div class="map-row">${icons}</div>`;
        }).join('');
        return `<article class="card">
  <h3>${escapeHtml(family.label)}</h3>
  <p class="meta"><code>${familyId}</code> · ${escapeHtml(family.reference)} · ${family.referenceLength} × ${family.referenceSpan} m</p>
  <div class="detail">${labelledImage(detail, `${family.label}, enlarged`)}</div>
  <div class="map-sample">${mapRows}</div>
</article>`;
    }).join('\n');
    return `<section aria-labelledby="families-heading">
<h2 id="families-heading">Families (${AIRCRAFT_FAMILY_IDS.length})</h2>
<p>Large copy for proportions; below it, map size in civil, military and emergency colours at ${SAMPLE_HEADINGS_DEG.join('°, ')}°.</p>
<div class="cards">${cards}</div>
</section>`;
}

/** Every designator in the type table at map size, stretched to its own dimensions. */
function typeSection(): string {
    const designators = Object.keys(AIRCRAFT_TYPE_DIMENSIONS).sort();
    const tiles = designators
        .map((designator) => {
            const entry = AIRCRAFT_TYPE_DIMENSIONS[designator]!;
            const silhouette = buildAircraftSilhouette(entry.familyId, entry);
            const svg = mapSizeSvg(silhouette, '#00aaff', 0);
            return `<figure class="tile">
  <div class="tile-icon">${labelledImage(svg, `${designator}, ${AIRCRAFT_FAMILIES[entry.familyId].label}`)}</div>
  <figcaption><strong>${designator}</strong><span>${entry.length} × ${entry.span} m</span></figcaption>
</figure>`;
        })
        .join('\n');
    return `<section aria-labelledby="types-heading">
<h2 id="types-heading">Types (${designators.length})</h2>
<p>Each type's family drawing stretched to its own length and span, at map size.</p>
<div class="tiles">${tiles}</div>
</section>`;
}

/** A row of familiar types from smallest to largest, to check the size scale reads. */
function sizeSection(): string {
    const lineUp = [
        'C152',
        'PA34',
        'EC35',
        'PC12',
        'EUFI',
        'CL35',
        'AT72',
        'A320',
        'A321',
        'B77W',
        'B744',
        'A388',
    ];
    const icons = lineUp
        .map((designator) => {
            const entry = AIRCRAFT_TYPE_DIMENSIONS[designator]!;
            const silhouette = buildAircraftSilhouette(entry.familyId, entry);
            return `<figure class="lineup-item">${labelledImage(mapSizeSvg(silhouette, '#00aaff', 0), designator)}<figcaption>${designator}</figcaption></figure>`;
        })
        .join('');
    return `<section aria-labelledby="size-heading">
<h2 id="size-heading">Size order</h2>
<p>Icon size follows real size on a log scale, clamped between 0.8× and 1.3×.</p>
<div class="lineup">${icons}</div>
</section>`;
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sentinel aircraft silhouettes</title>
<style>
  :root { color-scheme: dark; font-family: 'Barlow Condensed', 'Barlow', system-ui, sans-serif; }
  body { margin: 0; padding: 1rem; background: #0b0d10; color: #e8eaed; }
  h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.25rem; margin: 2rem 0 .25rem; letter-spacing: .06em; text-transform: uppercase; }
  h3 { font-size: 1rem; margin: 0; }
  p { color: #b6bcc4; margin: .25rem 0 .75rem; }
  .meta { font-size: .85rem; }
  .cards { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); }
  .card { background: #161a1f; border: 1px solid #2a3038; padding: .75rem; }
  .detail { display: flex; justify-content: center; background: #1f2a33; padding: .5rem; }
  .map-sample { background: #2b3b2a; margin-top: .5rem; padding: .25rem; }
  .map-row { display: flex; align-items: center; justify-content: space-around; min-height: 44px; }
  .tiles { display: grid; gap: .5rem; grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr)); }
  .tile { margin: 0; background: #161a1f; border: 1px solid #2a3038; padding: .5rem; text-align: center; }
  .tile-icon { display: flex; align-items: center; justify-content: center; min-height: 44px; }
  .tile figcaption { display: flex; flex-direction: column; font-size: .8rem; color: #b6bcc4; }
  .tile strong { color: #e8eaed; letter-spacing: .08em; }
  .lineup { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; background: #2b3b2a; padding: 1rem; }
  .lineup-item { margin: 0; display: flex; flex-direction: column; align-items: center; gap: .25rem; font-size: .8rem; }
  svg { display: block; }
  @media (min-width: 48rem) { body { padding: 2rem; } }
</style>
</head>
<body>
<main>
<h1>Sentinel aircraft silhouettes</h1>
<p>Generated from published dimensions by <code>@sentinel/map-kit/aircraft-silhouettes</code>. No third-party artwork.</p>
${familySection()}
${sizeSection()}
${typeSection()}
</main>
</body>
</html>
`;

const outputPath = resolve(process.argv[2] ?? join(tmpdir(), 'sentinel-aircraft-silhouettes.html'));
writeFileSync(outputPath, page);
console.log(`Wrote ${outputPath}`);
