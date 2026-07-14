// Generated livestream asset addressing. The original roster owns fixed panels
// in two 4x3 atlases; later additions can own standalone normal/incident frames.
// Address by stream id (not shuffled roster position) so every host stays
// visually recognizable across daily seeds and challenge runs.

const STREAM_PANELS = new Map([
  'st_slotking', 'st_rollarob', 'st_dramahouse', 'st_ragequit',
  'st_cozycook', 'st_poolday', 'st_cryptobro', 'st_ballgame',
  'st_pixelpilot', 'st_streetsnacks', 'st_midnightmara', 'st_fantasyfrank',
  'st_luckyparcel', 'st_rooftopremy', 'st_puppycam', 'st_chessgrudge',
  'st_rainwatch', 'st_cookoff', 'st_lootlola', 'st_retrorex',
  'st_rumorroom', 'st_dancecrew', 'st_bracketboss', 'st_quietcraft',
].map((id, index) => [id, index]));

const STANDALONE = {
  st_dang3rman: {
    normal: 'src/assets/stream-thumbs/dang3rman-normal.png',
    normalCss: '../assets/stream-thumbs/dang3rman-normal.png',
    beat1: 'src/assets/stream-thumbs/dang3rman-incident-beat1.png',
    beat2: 'src/assets/stream-thumbs/dang3rman-incident-beat2.png',
  },
  st_fireuranus: {
    normal: 'src/assets/stream-thumbs/fire-uranus-normal.png',
    normalCss: '../assets/stream-thumbs/fire-uranus-normal.png',
    beat1: 'src/assets/stream-thumbs/fire-uranus-incident-beat1.png',
    beat2: 'src/assets/stream-thumbs/fire-uranus-incident-beat2.png',
  },
};

export function streamThumbnail(stream, streamIndex) {
  const panel = panelAddress(stream.id, streamIndex);
  const identityIndex = STREAM_PANELS.get(stream.id) ?? streamIndex;
  const phase = (identityIndex % 7) * 0.37;
  const focusX = 45 + (identityIndex % 3) * 5;
  const focusY = 45 + (identityIndex % 2) * 8;
  const image = panel.standalone ? `url('${panel.normalCss}')` : `var(--atlas-${panel.atlas})`;
  const size = panel.standalone ? 'cover' : '400% 300%';

  return `
    <div class="stream-thumb" data-stream="${stream.id}" style="--thumb-fallback:${stream.color}" aria-hidden="true">
      <span class="stream-slides"><span class="stream-reel" style="--stream-image:${image};--stream-size:${size};--stream-position:${panel.position};--focus-x:${focusX}%;--focus-y:${focusY}%;animation-delay:-${phase.toFixed(2)}s"></span></span>
      <span class="live">● LIVE</span>
    </div>`;
}

/** Two generated incident beats plus the stream's normal frame for TOS replay. */
export function incidentReplay(stream, streamIndex = 0) {
  const panel = panelAddress(stream.id, streamIndex);
  const frameClass = panel.standalone ? ' incident-frame--standalone' : '';
  const normal = panel.standalone ? panel.normal : `src/assets/stream-thumbs/stream-atlas-${panel.atlas}-v2.png`;
  const beat1 = panel.standalone ? panel.beat1 : `src/assets/stream-thumbs/stream-incident-${panel.atlas}-beat1.png`;
  const beat2 = panel.standalone ? panel.beat2 : `src/assets/stream-thumbs/stream-incident-${panel.atlas}-beat2.png`;
  return `
    <div class="incident-replay" style="--incident-col:${panel.col};--incident-row:${panel.row}" aria-label="Incident replay">
      <img class="incident-frame incident-frame--normal${frameClass}" src="${normal}" alt="" draggable="false" decoding="sync">
      <img class="incident-frame incident-frame--beat1${frameClass}" src="${beat1}" alt="" draggable="false" decoding="sync">
      <img class="incident-frame incident-frame--beat2${frameClass}" src="${beat2}" alt="" draggable="false" decoding="sync">
      <span class="incident-replay__eyebrow" aria-hidden="true">INCIDENT REPLAY</span>
      <span class="incident-cut" aria-hidden="true"><b>TOS VIOLATION</b><small>STREAM REMOVED</small></span>
    </div>`;
}

function panelAddress(streamId, fallbackIndex) {
  if (STANDALONE[streamId]) {
    return { standalone: true, ...STANDALONE[streamId], col: 0, row: 0, position: 'center' };
  }
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
