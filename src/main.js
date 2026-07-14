// Bootstrap: load data, hydrate store, mount UI, start the shift.
import { store } from './state/store.js';
import { start } from './engine/clock.js';
import { mountHud } from './ui/hud.js?v=2';
import { mountBrowse } from './ui/browse.js?v=4';
import { mountFrontPage } from './ui/frontpage.js?v=2';
import { mountDiscord } from './ui/discord.js';
import { mountToasts } from './ui/toast.js?v=4';
import { mountShiftOverlay } from './ui/shift-overlay.js?v=2';
import { mountShop } from './ui/shop.js';
import { mountSponsorBar } from './ui/sponsor-bar.js';
import { mountAudio } from './engine/audio.js';
import { getRunConfig, mountPersistence, orderStreamsForRun } from './engine/persistence.js';
import { mountLeaderboard } from './ui/leaderboard.js?v=2';
import { mountTitle } from './ui/title.js';
import { mountTutorial } from './ui/tutorial.js';
import { mountTicker } from './ui/news-ticker.js';
import { mountEnding } from './ui/ending.js';
import { mountCrisis } from './ui/crisis.js';
import { mountClipDesk } from './ui/clipdesk.js';

const RUN_CONFIG = getRunConfig();

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

async function boot() {
  const [streams, streamers, threads, rules, sponsors] = await Promise.all([
    loadJson('src/data/streams.json?v=3'),
    loadJson('src/data/streamers.json?v=3'),
    loadJson('src/data/dms.json?v=3'),
    loadJson('src/data/tos-rules.json'),
    loadJson('src/data/sponsors.json'),
  ]);

  store.load({
    streams: orderStreamsForRun(streams, RUN_CONFIG),
    streamers,
    threads,
    rules,
    sponsors,
    seed: RUN_CONFIG.seed,
  });
  mountPersistence(RUN_CONFIG);

  // Mount UI (each subscribes to the store)
  mountToasts();
  mountHud();
  mountBrowse();
  mountFrontPage();
  mountDiscord();
  mountShiftOverlay();
  mountShop();
  mountSponsorBar();
  mountLeaderboard(RUN_CONFIG);
  mountAudio();
  mountTicker();     // WS-N: satirical chyron fed by engine/story.js
  mountEnding();     // WS-N: terminal-run story card
  mountCrisis();     // WS-P: PR crisis panel
  mountClipDesk();   // WS-P: viral clip timing minigame
  mountTutorial();   // watches for the first real shift start (career.tutorialDone gates)
  mountTitle();      // topmost shell; must mount after the store hydrates career

  // Reset the first shift, then hold on its briefing until the player starts.
  store.dispatch({ type: 'START_SHIFT' });
  store.dispatch({ type: 'SET_RUNNING', payload: { running: false } });
  start();
}

boot().catch((err) => {
  document.getElementById('app').innerHTML =
    `<pre style="color:var(--bad);padding:16px">Boot error: ${err.message}\n\nServe over http:// (not file://) — e.g. \`python -m http.server 8080\`.</pre>`;
  console.error(err);
});
