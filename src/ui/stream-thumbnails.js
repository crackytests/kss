// Generated livestream atlas addressing. Each stream owns one fixed panel in
// the two 4x3 base atlases and the matching panel in both incident-beat atlases.
// Keeping the host, set, palette, and camera layout stable makes the directory
// learnable by sight instead of cutting between unrelated streamers.

export function streamThumbnail(stream, streamIndex) {
  const panel = panelAddress(streamIndex);
  const phase = (streamIndex % 7) * 0.37;
  const focusX = 45 + (streamIndex % 3) * 5;
  const focusY = 45 + (streamIndex % 2) * 8;

  return `
    <div class="stream-thumb" data-stream="${stream.id}" style="--thumb-fallback:${stream.color}" aria-hidden="true">
      <span class="stream-slides"><span class="stream-reel" style="--stream-image:var(--atlas-${panel.atlas});--stream-position:${panel.position};--focus-x:${focusX}%;--focus-y:${focusY}%;animation-delay:-${phase.toFixed(2)}s"></span></span>
      <span class="live">● LIVE</span>
    </div>`;
}

/** Two generated incident beats plus the stream's normal frame for TOS replay. */
export function incidentReplay(streamIndex) {
  const panel = panelAddress(streamIndex);
  return `
    <div class="incident-replay" style="--incident-col:${panel.col};--incident-row:${panel.row}" aria-label="Incident replay">
      <img class="incident-frame incident-frame--normal" src="/src/assets/stream-thumbs/stream-atlas-${panel.atlas}-v2.png" alt="" draggable="false" decoding="sync">
      <img class="incident-frame incident-frame--beat1" src="/src/assets/stream-thumbs/stream-incident-${panel.atlas}-beat1.png" alt="" draggable="false" decoding="sync">
      <img class="incident-frame incident-frame--beat2" src="/src/assets/stream-thumbs/stream-incident-${panel.atlas}-beat2.png" alt="" draggable="false" decoding="sync">
      <span class="incident-replay__eyebrow" aria-hidden="true">INCIDENT REPLAY</span>
      <span class="incident-cut" aria-hidden="true"><b>TOS VIOLATION</b><small>STREAM REMOVED</small></span>
    </div>`;
}

function panelAddress(streamIndex) {
  const panel = ((streamIndex % 24) + 24) % 24;
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
