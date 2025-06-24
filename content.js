(() => {
  const DEBUG = true;                 // ← flip to false to silence logs
  const URL_CHECK_MS = 400;           // poll for SPA URL changes

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                           */
  /* ------------------------------------------------------------------ */
  const log = (...args) => {
    if (!DEBUG) return;
    const time = new Date().toLocaleTimeString();
    console.log(`%c[Sponsor-Muter ${time}]`, 'color:#9cf', ...args);
  };

  /** Returns the <video> element, if any. */
  const getVideo = () => document.querySelector('video');

  /** Host-shadow + <img> overlay (created once, reused). */
  const createOverlay = (() => {
    let overlay = null;

    return () => {
      if (overlay) return overlay;

      const host = document.createElement('div');
      host.style.cssText =
        'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      const shadow = host.attachShadow({ mode: 'closed' });

      overlay = document.createElement('img');
      overlay.src  = 'https://ttalesinteractive.com/graphics/gg.png';   // 🔄 your image
      overlay.alt  = 'Advertisement';
      overlay.style.cssText = `
        all:initial;
        width:100vw; height:100vh;
        object-fit:cover;
        display:none;
        user-select:none;
      `;

      shadow.appendChild(overlay);
      document.documentElement.appendChild(host);
      return overlay;
    };
  })();

  /* ------------------------------------------------------------------ */
  /*  Ad detection                                                      */
  /* ------------------------------------------------------------------ */
  const SELECTORS = [
    '.html5-video-player.ad-showing',
    '.html5-video-player.ad-interrupting',
    '.ytp-ad-skip-button',
    '.ytp-ad-timed-pie-countdown-container',
    '.ad-simple-attributed-string.ytp-ad-badge__text--clean-player',
    '[aria-label="Sponsored"]',
    '[aria-label="Survey"]'
  ];

  /** True if an ad is currently on-screen (low false-positive rate). */
  const adIsShowing = () => {
    // 1) Fast path—player flags
    const player = document.querySelector('.html5-video-player');
    if (player && (player.classList.contains('ad-showing') ||
                   player.classList.contains('ad-interrupting')))
      return true;

    // 2) Fallback—visible ad-specific elements
    return SELECTORS.some(sel => {
      const el = document.querySelector(sel);
      return el && el.offsetParent !== null;
    });
  };

  /* ------------------------------------------------------------------ */
  /*  State machine                                                     */
  /* ------------------------------------------------------------------ */
  const OBS_CFG = { childList: true, subtree: true, attributes: true };
  const state = {
    muted   : false,
    active  : false,
    url     : location.href,
    observer: null
  };

  const applyState = (src) => {
    const vid = getVideo();
    if (!vid) return;

    const inAd    = adIsShowing();
    const overlay = createOverlay();

    if (inAd && !vid.muted) {
      vid.muted = true;
      state.muted = true;
      overlay.style.display = 'block';
      log(src, '🔇 Muted');
    } else if (!inAd && state.muted) {
      vid.muted = false;
      state.muted = false;
      overlay.style.display = 'none';
      log(src, '🔊 Unmuted');
    }
  };

  const bind = () => {
    if (state.active) return;
    state.active = true;
    log('📺 Bound to video');

    state.observer = new MutationObserver(() => applyState('⭑ observer'));
    state.observer.observe(document.documentElement, OBS_CFG);
    applyState('init');
  };

  const unbind = () => {
    if (!state.active) return;
    state.active = false;
    log('🛑 Unbound');
    if (state.observer) state.observer.disconnect();
    createOverlay().style.display = 'none';
    state.muted = false;
  };

  /* ------------------------------------------------------------------ */
  /*  SPA navigation guard                                              */
  /* ------------------------------------------------------------------ */
  const isWatch = () => location.pathname.startsWith('/watch');

  const checkUrl = () => {
    if (location.href === state.url) return;
    state.url = location.href;
    log('🔄 URL changed to', state.url);
    isWatch() ? bind() : unbind();
  };

  window.addEventListener('yt-navigate-finish', checkUrl);
  setInterval(checkUrl, URL_CHECK_MS);
  if (isWatch()) bind();
})();
