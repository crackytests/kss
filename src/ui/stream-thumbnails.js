// Generated livestream asset addressing. Every host owns a recognizable normal
// frame; the two atlases remain as incident-replay frames for the original cast.
// Address by stream id (not shuffled roster position) so identity survives daily
// seeds, challenge runs, and roster growth.

const STREAM_PANELS = new Map([
  'st_slotking', 'st_rollarob', 'st_dramahouse', 'st_ragequit',
  'st_cozycook', 'st_poolday', 'st_cryptobro', 'st_ballgame',
  'st_pixelpilot', 'st_streetsnacks', 'st_midnightmara', 'st_fantasyfrank',
  'st_luckyparcel', 'st_rooftopremy', 'st_puppycam', 'st_chessgrudge',
  'st_rainwatch', 'st_cookoff', 'st_lootlola', 'st_retrorex',
  'st_rumorroom', 'st_dancecrew', 'st_bracketboss', 'st_quietcraft',
].map((id, index) => [id, index]).concat([
  ['st_trainwrecked', 24], ['st_xqpensive', 25], ['st_adenboss', 26],
  ['st_scapular', 27], ['st_johnnyabroad', 28], ['st_vitaljustice', 29],
  ['st_natalee', 30], ['st_jackdough', 31], ['st_neonbrkup', 32],
  ['st_sneerko', 33],
]));

const STREAM_NORMALS = {
  st_slotking: rosterAsset('slotking'),
  st_rollarob: rosterAsset('rollarob'),
  st_dramahouse: rosterAsset('dramahouse'),
  st_ragequit: rosterAsset('ragequit'),
  st_cozycook: rosterAsset('cozycook'),
  st_poolday: rosterAsset('poolday'),
  st_cryptobro: rosterAsset('cryptobro'),
  st_ballgame: rosterAsset('ballgame'),
  st_pixelpilot: rosterAsset('pixelpilot'),
  st_streetsnacks: rosterAsset('streetsnacks'),
  st_midnightmara: rosterAsset('midnightmara'),
  st_fantasyfrank: rosterAsset('fantasyfrank'),
  st_luckyparcel: rosterAsset('luckyparcel'),
  st_rooftopremy: rosterAsset('rooftopremy'),
  st_puppycam: rosterAsset('puppycam'),
  st_chessgrudge: rosterAsset('chessgrudge'),
  st_rainwatch: rosterAsset('rainwatch'),
  st_cookoff: rosterAsset('cookoff'),
  st_lootlola: rosterAsset('lootlola'),
  st_retrorex: rosterAsset('retrorex'),
  st_rumorroom: rosterAsset('rumorroom'),
  st_dancecrew: rosterAsset('dancecrew'),
  st_bracketboss: rosterAsset('bracketboss'),
  st_quietcraft: rosterAsset('quietcraft'),
  st_dang3rman: {
    src: 'src/assets/stream-thumbs/dang3rman-normal-v2.webp',
    css: '../assets/stream-thumbs/dang3rman-normal-v2.webp',
  },
  st_fireuranus: {
    src: 'src/assets/stream-thumbs/fire-uranus-normal-v2.webp',
    css: '../assets/stream-thumbs/fire-uranus-normal-v2.webp',
  },
  st_trainwrecked: normalAsset('trainwrecked-normal.webp'),
  st_xqpensive: normalAsset('xqpensive-normal.webp'),
  st_adenboss: normalAsset('adenboss-normal.webp'),
  st_scapular: normalAsset('scapular-normal.webp'),
  st_johnnyabroad: normalAsset('johnny-abroad-normal.webp'),
  st_vitaljustice: normalAsset('vitaljustice-normal.webp'),
  st_natalee: normalAsset('natalee-normal.webp'),
  st_jackdough: normalAsset('jack-dough-normal.webp'),
  st_neonbrkup: normalAsset('n3onbrkup-normal.webp'),
  st_sneerko: normalAsset('sneerko-normal.webp'),
  st_permabanned: rosterAsset('permabanned'),
  st_organicollie: rosterAsset('organicollie'),
  st_afkandy: rosterAsset('afkandy'),
  st_blessupbrady: rosterAsset('blessupbrady'),
  st_maxbetmarko: rosterAsset('maxbetmarko'),
  st_aimee: rosterAsset('aimee'),
  st_fairusefinn: rosterAsset('fairusefinn'),
  st_dayonedrew: rosterAsset('dayonedrew'),
  st_realmoneyrico: rosterAsset('realmoneyrico-v2'),
  st_offshoreoskar: rosterAsset('offshoreoskar-v2'),
  st_bighead: rosterAsset('bighead-v2'),
  st_tntboxpuppy: rosterAsset('tntboxpuppy-v2'),
  st_cuntcrimson: rosterAsset('cuntcrimson-v2'),
};

const STREAM_INCIDENTS = {
  st_dang3rman: {
    beat1: 'src/assets/stream-thumbs/dang3rman-incident-beat1-v2.webp',
    beat2: 'src/assets/stream-thumbs/dang3rman-incident-beat2-v2.webp',
  },
  st_fireuranus: {
    beat1: 'src/assets/stream-thumbs/fire-uranus-incident-beat1-v2.webp',
    beat2: 'src/assets/stream-thumbs/fire-uranus-incident-beat2-v2.webp',
  },
};

const PRELOADED_NORMALS = new Map();

/**
 * Load and decode only the seeded run's roster before UI mount. Background
 * images otherwise race the first paint and can appear blank on a cold Pages
 * visit. Keep the Image objects alive so the decoded bitmaps remain reusable.
 */
export function preloadStreamThumbnails(streams = []) {
  const ready = streams.map((stream, index) => {
    const asset = STREAM_NORMALS[stream.id];
    if (!asset) return Promise.resolve();
    const cached = PRELOADED_NORMALS.get(asset.src);
    if (cached) return cached.ready;

    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = index < 6 ? 'high' : 'auto';
    const loaded = new Promise((resolve) => {
      image.onload = async () => {
        try {
          await image.decode();
        } catch {
          // A successful load is still usable when decode() is unsupported.
        }
        resolve();
      };
      image.onerror = resolve;
    });
    PRELOADED_NORMALS.set(asset.src, { image, ready: loaded });
    image.src = asset.src;
    return loaded;
  });

  return Promise.all(ready);
}

export function streamThumbnail(stream, streamIndex) {
  const panel = panelAddress(stream.id, streamIndex);
  const standalone = STREAM_NORMALS[stream.id];
  const identityIndex = STREAM_PANELS.get(stream.id) ?? streamIndex;
  const phase = (identityIndex % 7) * 0.37;
  const focusX = 45 + (identityIndex % 3) * 5;
  const focusY = 45 + (identityIndex % 2) * 8;
  const image = standalone ? `url('${standalone.css}')` : `var(--atlas-${panel.atlas})`;
  const size = standalone ? 'cover' : '400% 300%';

  return `
    <div class="stream-thumb" data-stream="${stream.id}" style="--thumb-fallback:${stream.color}" aria-hidden="true">
      <span class="stream-slides"><span class="stream-reel" style="--stream-image:${image};--stream-size:${size};--stream-position:${panel.position};--focus-x:${focusX}%;--focus-y:${focusY}%;animation-delay:-${phase.toFixed(2)}s"></span></span>
      <span class="live">● LIVE</span>
    </div>`;
}

/** Two generated incident beats plus the stream's normal frame for TOS replay. */
export function incidentReplay(stream, streamIndex = 0) {
  const panel = panelAddress(stream.id, streamIndex);
  const standalone = STREAM_NORMALS[stream.id];
  const incident = STREAM_INCIDENTS[stream.id];
  const normal = standalone?.src ?? `src/assets/stream-thumbs/stream-atlas-${panel.atlas}-v3.webp`;
  const beat1 = incident?.beat1 ?? `src/assets/stream-thumbs/stream-incident-${panel.atlas}-beat1-v2.webp`;
  const beat2 = incident?.beat2 ?? `src/assets/stream-thumbs/stream-incident-${panel.atlas}-beat2-v2.webp`;
  const normalClass = standalone ? ' incident-frame--standalone' : '';
  const incidentClass = incident ? ' incident-frame--standalone' : '';
  return `
    <div class="incident-replay" style="--incident-col:${panel.col};--incident-row:${panel.row}" aria-label="Incident replay">
      <img class="incident-frame incident-frame--normal${normalClass}" src="${normal}" alt="" draggable="false" decoding="sync">
      <img class="incident-frame incident-frame--beat1${incidentClass}" src="${beat1}" alt="" draggable="false" decoding="sync">
      <img class="incident-frame incident-frame--beat2${incidentClass}" src="${beat2}" alt="" draggable="false" decoding="sync">
      <span class="incident-replay__eyebrow" aria-hidden="true">INCIDENT REPLAY</span>
      <span class="incident-cut" aria-hidden="true"><b>TOS VIOLATION</b><small>STREAM REMOVED</small></span>
    </div>`;
}

function panelAddress(streamId, fallbackIndex) {
  const identityIndex = STREAM_PANELS.get(streamId) ?? fallbackIndex;
  const panel = ((identityIndex % 24) + 24) % 24;
  const atlas = panel < 12 ? 'a' : 'b';
  const local = panel % 12;
  const col = local % 4;
  const row = Math.floor(local / 4);
  return {
    atlas,
    col,
    row,
    position: `${(col * 100) / 3}% ${row * 50}%`,
  };
}

function normalAsset(filename) {
  return {
    src: `src/assets/stream-thumbs/${filename}`,
    css: `../assets/stream-thumbs/${filename}`,
  };
}

function rosterAsset(id) {
  return normalAsset(`roster-v2/${id}.webp`);
}
