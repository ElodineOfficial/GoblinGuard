(() => {
  const DEBUG = true; // ← Flip to false to hide logs

  const log = (...args) => {
    if (!DEBUG) return;
    const time = new Date().toLocaleTimeString();
    console.log(`%c[Sponsor-Muter ${time}]`, 'color:#9cf', ...args);
  };

  const SELECTORS = [
    '.ad-simple-attributed-string.ytp-ad-badge__text--clean-player',
    '[aria-label="Sponsored"]'
  ];
  const OBS_CFG = { childList: true, subtree: true, attributes: true };
  const URL_CHECK_MS = 400;

  let state = {
    muted: false,
    active: false,
    url: location.href,
    observer: null,
    overlay: null
  };

  const getVideo = () => document.querySelector('video');

  /* ---------- MODIFIED: use an <img> overlay instead of a text box ---------- */
  const createOverlay = () => {
    if (state.overlay) return state.overlay;

    // Host that sits on top of everything but ignores clicks
    const host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'closed' });

    // Image element that fills the whole screen
    const overlay = document.createElement('img');
    overlay.src = 'https://ttalesinteractive.com/graphics/gg.png';     // 🔄  your image URL here
    overlay.alt = 'Advertisement';
    overlay.style.cssText = `
      all:initial;
      width:100vw;
      height:100vh;
      object-fit:cover;        /* stretch & keep aspect ratio */
      display:none;            /* toggled on/off elsewhere */
      user-select:none;
    `;

    shadow.appendChild(overlay);
    document.documentElement.appendChild(host);
    state.overlay = overlay;
    return overlay;
  };
  /* ------------------------------------------------------------------------ */

  const badgeVisible = () => {
    for (const sel of SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent) return true;
    }
    return false;
  };

  const applyState = (src) => {
    const vid = getVideo();
    if (!vid) return;
    const inAd = badgeVisible();
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

    createOverlay();
    state.observer = new MutationObserver(() => applyState('⭑ observer'));
    state.observer.observe(document.documentElement, OBS_CFG);
    applyState('init');
  };

  const unbind = () => {
    if (!state.active) return;
    state.active = false;
    log('🛑 Unbound');
    if (state.observer) state.observer.disconnect();
    if (state.overlay) state.overlay.style.display = 'none';
    state.muted = false;
  };

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
