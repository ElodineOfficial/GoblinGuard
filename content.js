// YouTube Ad Volume Muter + Goblin Mode + Badge
// - Detects ads via ad-showing/ad-interrupting, yellow bar, or Skip UI
// - Mutes during ads, restores volume after
// - When Skip is available, tries to click it *and* jumps the ad video to its end
// - Darkens the ad area during ads (#movie_player > .video-ads.ytp-ad-module when possible)
// - Shows a marquee-style "ad goblin" board with total ads muted
//   for every ad while it is dimmed.
// - Shows a PNG badge at the bottom of the dimmed section (no interference with marquee).

(function () {
  const INTERVAL_MS = 500;
  const DEBUG = false;

  let inAd = false;
  let mutedByScript = false;
  let previousVolume = 1;
  let previousMuted = false;

  // Goblin stats / overlay state
  let adCount = 0;
  let goblinOverlay = null;

  // Name of the image file in your extension folder
  const GOBLIN_IMAGE_NAME = 'goblin.png';

  function log(...args) {
    if (DEBUG) {
      console.log('[YT Goblin]', ...args);
    }
  }

  function getGoblinImageUrl() {
    // Chrome (MV2/MV3)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL(GOBLIN_IMAGE_NAME);
    }
    // Firefox / other browsers
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL) {
      return browser.runtime.getURL(GOBLIN_IMAGE_NAME);
    }
    // Fallback (will not work on YouTube, but keeps code safe)
    return GOBLIN_IMAGE_NAME;
  }

  function getPlayer() {
    return document.querySelector('#movie_player, .html5-video-player');
  }

  function getVideo() {
    return document.querySelector('video.html5-main-video');
  }

  function getProgressBar(player) {
    if (!player) player = getPlayer();
    if (!player) return null;
    return player.querySelector('.ytp-progress-bar .ytp-play-progress, .ytp-play-progress');
  }

  // ---------- Goblin overlay + darkening ----------

  function ensureGoblinStyle() {
    if (document.getElementById('yt-goblin-style')) return;
    const style = document.createElement('style');
    style.id = 'yt-goblin-style';
    style.textContent = `
      #yt-goblin-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        opacity: 0;
        transition: opacity 200ms ease-out;
        z-index: 300000;
      }

      #yt-goblin-overlay.yt-goblin-visible {
        opacity: 1;
      }

      #yt-goblin-overlay .yt-goblin-backdrop {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at center, rgba(0,0,0,0.72), rgba(0,0,0,0.92));
      }

      .yt-goblin-board {
        position: relative;
        min-width: 260px;
        max-width: 360px;
        padding: 16px 20px;
        background: #111;
        border-radius: 10px;
        box-shadow: 0 0 20px rgba(0,0,0,0.7);
        border: 2px solid #333;
        text-align: center;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #f5f5f5;
        pointer-events: none;
        opacity: 0;
        transform: translateY(-14px);
        transition: opacity 250ms ease-out, transform 250ms ease-out;
      }

      /* Board shows whenever overlay has this class (same lifetime as dim for that ad) */
      #yt-goblin-overlay.yt-goblin-board-on .yt-goblin-board {
        opacity: 1;
        transform: translateY(0);
      }

      .yt-goblin-board-title {
        font-size: 12px;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: #f1c40f;
        margin-bottom: 4px;
      }

      .yt-goblin-board-main {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 4px;
        color: #ecf0f1;
      }

      .yt-goblin-board-sub {
        font-size: 11px;
        color: #bdc3c7;
        opacity: 0.9;
      }

      .yt-goblin-lights {
        display: flex;
        justify-content: center;
        gap: 4px;
        margin-bottom: 6px;
      }

      .yt-goblin-lights.bottom {
        margin-top: 6px;
        margin-bottom: 0;
      }

      .yt-goblin-light {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #555;
        box-shadow: 0 0 4px rgba(0,0,0,0.6);
        animation: yt-goblin-blink 1.2s infinite;
      }

      .yt-goblin-light:nth-child(2) { animation-delay: 0.15s; }
      .yt-goblin-light:nth-child(3) { animation-delay: 0.3s; }
      .yt-goblin-light:nth-child(4) { animation-delay: 0.45s; }
      .yt-goblin-light:nth-child(5) { animation-delay: 0.6s; }

      @keyframes yt-goblin-blink {
        0%, 100% { background: #444; box-shadow: 0 0 4px rgba(0,0,0,0.4); }
        30% { background: #f1c40f; box-shadow: 0 0 6px rgba(241,196,15,0.9); }
        60% { background: #e67e22; box-shadow: 0 0 6px rgba(230,126,34,0.9); }
      }

      /* Badge at bottom of dimmed section */
      .yt-goblin-badge {
        position: absolute;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        pointer-events: none;
      }

      .yt-goblin-badge-img {
        width: 200px;
        height: 200px;
        object-fit: contain;
        filter: drop-shadow(0 0 4px rgba(0,0,0,0.7));
      }
    `;
    document.head.appendChild(style);
  }

  function ensureGoblinOverlay() {
    if (goblinOverlay && goblinOverlay.isConnected) return goblinOverlay;

    const player = getPlayer();
    if (!player) return null;

    // Prefer the ad area (where "Sponsored" lives), then overlays, then the player
    const adArea =
      player.querySelector('div.video-ads.ytp-ad-module') ||
      player.querySelector('#movie_player > div.video-ads.ytp-ad-module');
    const overlaysContainer = player.querySelector('.ytp-overlays-container');
    const root = adArea || overlaysContainer || player;

    ensureGoblinStyle();

    const overlay = document.createElement('div');
    overlay.id = 'yt-goblin-overlay';

    overlay.innerHTML = `
      <div class="yt-goblin-backdrop"></div>
      <div class="yt-goblin-board">
        <div class="yt-goblin-lights">
          <span class="yt-goblin-light"></span>
          <span class="yt-goblin-light"></span>
          <span class="yt-goblin-light"></span>
          <span class="yt-goblin-light"></span>
          <span class="yt-goblin-light"></span>
        </div>
        <div class="yt-goblin-board-title">SNACK REPORT</div>
        <div class="yt-goblin-board-main" id="yt-goblin-main-text"></div>
        <div class="yt-goblin-board-sub" id="yt-goblin-sub-text"></div>
        <div class="yt-goblin-lights bottom">
          <span class="yt-goblin-light"></span>
          <span class="yt-goblin-light"></span>
          <span class="yt-goblin-light"></span>
          <span class="yt-goblin-light"></span>
          <span class="yt-goblin-light"></span>
        </div>
      </div>
      <div class="yt-goblin-badge">
        <img id="yt-goblin-badge-img" class="yt-goblin-badge-img" alt="">
      </div>
    `;

    const img = overlay.querySelector('#yt-goblin-badge-img');
    if (img && !img.src) {
      try {
        img.src = getGoblinImageUrl();
      } catch (e) {
        // If this fails, badge just won't appear
      }
    }

    root.appendChild(overlay);
    goblinOverlay = overlay;
    return overlay;
  }

  function updateGoblinText() {
    const overlay = ensureGoblinOverlay();
    if (!overlay) return;

    const main = overlay.querySelector('#yt-goblin-main-text');
    const sub = overlay.querySelector('#yt-goblin-sub-text');

    if (main) {
      main.textContent = `Ads muted this session: ${adCount}`;
    }
    if (sub) {
      if (adCount === 1) {
        sub.textContent = `Goblins have devoured 1 ad for you.`;
      } else {
        sub.textContent = `Thanks for feeding the goblins another ad.`;
      }
    }
  }

  function showGoblinDarkening() {
    const overlay = ensureGoblinOverlay();
    if (!overlay) return;
    overlay.classList.add('yt-goblin-visible');
  }

  // Show the board for every dimmed ad
  function showGoblinBoardForAd() {
    const overlay = ensureGoblinOverlay();
    if (!overlay) return;
    updateGoblinText();
    overlay.classList.add('yt-goblin-board-on');
  }

  function hideGoblinOverlay() {
    const overlay = goblinOverlay || document.getElementById('yt-goblin-overlay');
    if (!overlay) return;

    overlay.classList.remove('yt-goblin-visible');
    overlay.classList.remove('yt-goblin-board-on');
  }

  // ---------- Skip detection / ad detection ----------

  function getSkipButton() {
    const root = document;

    const selectors = [
      'button.ytp-skip-ad-button',
      'button[id^="skip-button"]',
      '.ytp-skip-ad-button__text',
      '.ytp-skip-ad',
      '.ytp-ad-skip-button.ytp-button',
      '.ytp-ad-skip-button-modern.ytp-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-container button'
    ];

    for (const sel of selectors) {
      let el;
      try {
        el = root.querySelector(sel);
      } catch (e) {
        continue;
      }
      if (!el) continue;

      if (el.classList && el.classList.contains('ytp-skip-ad-button__text')) {
        const parent = el.closest('button, .ytp-skip-ad, .ytp-skip-ad-button');
        if (parent) {
          if (DEBUG) log('Skip via text child:', parent);
          return parent;
        }
      }

      if (DEBUG) log('Skip via selector:', sel, el);
      return el;
    }

    return null;
  }

  function parseRgb(colorString) {
    if (!colorString) return null;
    const match = colorString.match(/rgba?\s*\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!match) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3])
    };
  }

  function isYellowish(colorString) {
    if (!colorString) return false;

    if (colorString === 'rgb(255, 204, 0)' || colorString === 'rgba(255, 204, 0, 1)') {
      return true;
    }

    const rgb = parseRgb(colorString);
    if (!rgb) return false;
    const { r, g, b } = rgb;

    const brightEnough = (r + g) / 2 > 150;
    const redHigh = r > 200;
    const greenHigh = g > 150;
    const blueLow = b < 120;

    return brightEnough && redHigh && greenHigh && blueLow;
  }

  function isAdPlaying() {
    const player = getPlayer();
    const progressBar = getProgressBar(player);
    const skipButton = getSkipButton();

    let isAdByClass = false;
    let isAdByYellow = false;
    let isAdBySkip = !!skipButton;

    if (player) {
      isAdByClass =
        player.classList.contains('ad-showing') ||
        player.classList.contains('ad-interrupting');
    }

    if (progressBar) {
      let bgColor = null;
      try {
        bgColor = getComputedStyle(progressBar).backgroundColor;
      } catch (e) {
        bgColor = null;
      }
      isAdByYellow = isYellowish(bgColor);
    }

    const isAd = isAdByClass || isAdByYellow || isAdBySkip;

    if (DEBUG) {
      log('isAd?', {
        isAdByClass,
        isAdByYellow,
        isAdBySkip,
        combined: isAd
      });
    }

    return isAd;
  }

  // Mash skip (future-proof) + jump to end of ad (what actually works)
  function skipAdIfPossible(video) {
    const btn = getSkipButton();
    if (!btn) return;

    const style = getComputedStyle(btn);
    const visible =
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      style.pointerEvents !== 'none';

    if (visible && !btn.disabled) {
      try {
        btn.click();
        log('Tried clicking Skip button:', btn);
      } catch (e) {
        log('Failed to click skip button:', e);
      }
    }

    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      try {
        const before = { t: video.currentTime, d: video.duration };
        video.currentTime = video.duration;
        log('Jumped to end of ad:', before, '→', video.currentTime);
      } catch (e) {
        log('Failed to jump video to end of ad:', e);
      }
    }
  }

  // ---------- Ad lifecycle ----------

  function onAdStart(video) {
    inAd = true;
    adCount += 1;

    if (!video) {
      log('Ad started but no video element.');
      mutedByScript = false;
    } else {
      if (video.muted || video.volume === 0) {
        mutedByScript = false;
        log('Ad started but video already muted/0; not touching audio.');
      } else {
        previousVolume = video.volume;
        previousMuted = video.muted;

        video.muted = true;
        video.volume = 0;
        mutedByScript = true;

        log('Ad started → muting. Saved volume:', previousVolume, 'muted:', previousMuted);
      }
    }

    // Darken the ad area and show the goblin board for this ad
    showGoblinDarkening();
    showGoblinBoardForAd();
  }

  function onAdEnd(video) {
    inAd = false;

    hideGoblinOverlay();

    if (!video) {
      log('Ad ended but no video element.');
      return;
    }

    if (!mutedByScript) {
      log('Ad ended, but we did not mute; leaving audio as-is.');
      return;
    }

    if (video.muted && video.volume === 0) {
      video.volume = previousVolume;
      video.muted = previousMuted;
      log('Ad ended → restoring volume to', previousVolume, 'muted:', previousMuted);
    } else {
      log('Ad ended, but user/YouTube changed audio; not restoring.');
    }

    mutedByScript = false;
  }

  // ---------- Main loop ----------

  function tick() {
    const video = getVideo();
    if (!video) {
      log('No video element yet.');
      return;
    }

    const adNow = isAdPlaying();

    if (adNow) {
      skipAdIfPossible(video);

      if (!inAd) {
        onAdStart(video);
      } else {
        // Still in ad → keep darkening on
        showGoblinDarkening();
      }
    } else {
      if (inAd) {
        onAdEnd(video);
      }
    }
  }

  function start() {
    if (window.__ytAdMuteIntervalId) {
      clearInterval(window.__ytAdMuteIntervalId);
    }

    window.__ytAdMuteIntervalId = setInterval(tick, INTERVAL_MS);
    tick(); // Run once immediately
    log('Started YouTube goblin muter.');
  }

  window.addEventListener('yt-navigate-finish', () => {
    log('yt-navigate-finish → restarting watcher.');
    start();
  });

  window.stopYouTubeAdMute = function () {
    if (window.__ytAdMuteIntervalId) {
      clearInterval(window.__ytAdMuteIntervalId);
      window.__ytAdMuteIntervalId = null;
      console.log('[YT Goblin] Stopped watcher.');
    }
  };

  start();
})();
