/* ==================================================================== */
/*  Sponsor-Skip for YouTube Shorts – desktop Chrome                     */
/*  + Live/Watch mute + timed "Skip Ad" window                           */
/*  Updated: 2025-08-24                                                  */
/* ==================================================================== */

(() => {
  /* ------------------------------------------------------------------ */
  /*  Configuration                                                      */
  /* ------------------------------------------------------------------ */

  /** Set to false to silence console output. */
  const DEBUG_LOG = true;

  /** How often we poll the DOM for URL changes (ms). */
  const SPA_POLL_MS = 400;

  /** Minimum ms between two automatic skips of sponsored reels. */
  const SKIP_COOLDOWN_MS = 5_000;

  /** Base delay (ms) before clicking “Next Short”. */
  const SKIP_DELAY_BASE_MS = 100;

  /** Additional random delay (0-this) after the base delay (ms). */
  const SKIP_DELAY_VARIANCE_MS = 400;

  /* ------------------------------------------------------------------ */
  /*  Utility helpers                                                   */
  /* ------------------------------------------------------------------ */

  const log = (...args) => {
    if (!DEBUG_LOG) return;
    const ts = new Date().toLocaleTimeString();
    console.log(`%c[YT-Muter ${ts}]`, 'color:#9cf', ...args);
  };

  /** Random integer in [0, n). */
  const randInt = (n) => Math.floor(Math.random() * n);

  /** Random delay for Shorts skip. */
  const randDelay = () => SKIP_DELAY_BASE_MS + randInt(SKIP_DELAY_VARIANCE_MS);

  /**
   * Dispatch a full “pointerdown → mousedown → mouseup → click” sequence.
   * (event.isTrusted will be false, but this is accepted for many YT UI bits.)
   */
  const trustedClick = (el) => {
    if (!el) return false;
    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) =>
      el.dispatchEvent(
        new MouseEvent(type, {
          view: window,
          bubbles: true,
          cancelable: true,
          button: 0
        })
      )
    );
    return true;
  };

  /* ------------------------------------------------------------------ */
  /*  Shorts: current visible reel helper                                */
  /* ------------------------------------------------------------------ */

  const getVisibleReel = () => {
    let best = null;
    let bestVisibleHeight = 0;

    document.querySelectorAll('ytd-reel-video-renderer').forEach((reel) => {
      const rect = reel.getBoundingClientRect();
      const visible = Math.max(
        0,
        Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0)
      );
      if (visible > bestVisibleHeight) {
        bestVisibleHeight = visible;
        best = reel;
      }
    });

    return best;
  };

  /* ------------------------------------------------------------------ */
  /*  Shorts: sponsor badge detection                                    */
  /* ------------------------------------------------------------------ */

  const SPONSOR_BADGE_SELECTORS = [
    'reels-ad-card-buttoned-view-model badge-shape > div', // 2025+ badge path
    'ytd-ad-slot-renderer',                                // common renderer
    '[aria-label="Sponsored"]'                             // legacy aria fallback
  ].join(',');

  const isSponsoredReelVisible = () => {
    const reel = getVisibleReel();
    return !!(reel && reel.querySelector(SPONSOR_BADGE_SELECTORS));
  };

  /* ------------------------------------------------------------------ */
  /*  Shorts: navigation helpers                                         */
  /* ------------------------------------------------------------------ */

  const queryNavDownButton = () =>
    document.querySelector(
      '#navigation-button-down ytd-button-renderer button,' +
        '#navigation-button-down button'
    );

  const scrollNextReelIntoView = () => {
    const current = getVisibleReel();
    if (current && current.nextElementSibling) {
      current.nextElementSibling.scrollIntoView({
        behavior: 'instant',
        block: 'start'
      });
    } else {
      window.scrollBy({ top: innerHeight, left: 0, behavior: 'instant' });
    }
  };

  const goToNextShort = () => {
    const button = queryNavDownButton();
    if (!trustedClick(button)) {
      log('Fallback scroll – nav button not found.');
      scrollNextReelIntoView();
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Shorts: sponsor-skip orchestration                                 */
  /* ------------------------------------------------------------------ */

  const skipState = { lastSkipTime: 0 };

  const maybeSkipSponsoredReel = () => {
    if (!location.pathname.startsWith('/shorts')) return;
    if (!isSponsoredReelVisible()) return;

    const now = Date.now();
    if (now - skipState.lastSkipTime < SKIP_COOLDOWN_MS) return;
    skipState.lastSkipTime = now;

    const delay = randDelay();
    log(`Sponsor detected – skipping in ${delay} ms`);

    setTimeout(() => {
      const startingReel = getVisibleReel();
      if (!startingReel) return;

      const watch = new IntersectionObserver(
        (entries, obs) => {
          const differentReelVisible = entries.some(
            (e) => e.isIntersecting && e.target !== startingReel
          );
          if (differentReelVisible) {
            obs.disconnect();
            log('⏩  Sponsor reel skipped');
          }
        },
        { threshold: [0.51] }
      );

      document
        .querySelectorAll('ytd-reel-video-renderer')
        .forEach((reel) => watch.observe(reel));

      goToNextShort();
    }, delay);
  };

  /* ------------------------------------------------------------------ */
  /*  Long-form (/watch + lives): mute + timed Skip Ad                   */
  /* ------------------------------------------------------------------ */

  const longForm = {
    /** Maximum time overlay may stay visible before we force reload. */
    TIMEOUT_MS: 10_000,

    /** Randomized “click Skip Ad” window relative to ad start. */
    SKIP_MIN_MS: 5_100,
    SKIP_MAX_MS: 8_000,

    /** CSS indicating an ad is in progress or UI is showing ad affordances. */
    AD_SELECTORS: [
      '.html5-video-player.ad-showing',
      '.html5-video-player.ad-interrupting',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      '.ytp-ad-timed-pie-countdown-container',
      '.ad-simple-attributed-string.ytp-ad-badge__text--clean-player',
      '[aria-label="Survey"]'
    ].join(','),

    /** One-time <img> overlay while muted. */
    getOverlay() {
      if (this._overlay) return this._overlay;

      const host = document.createElement('div');
      host.style.cssText =
        'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';

      const shadow = host.attachShadow({ mode: 'closed' });

      this._overlay = document.createElement('img');
      this._overlay.alt = 'Advertisement';
      this._overlay.src = 'https://ttalesinteractive.com/graphics/gg.png';
      this._overlay.style.cssText =
        'all:initial;width:100vw;height:100vh;object-fit:cover;display:none;';

      shadow.appendChild(this._overlay);
      document.documentElement.appendChild(host);

      return this._overlay;
    },

    /** True ⇢ a long-form ad is showing on a watch/live page. */
    adIsActive() {
      const player = document.querySelector('.html5-video-player');
      if (
        player &&
        (player.classList.contains('ad-showing') ||
          player.classList.contains('ad-interrupting'))
      ) {
        return true;
      }
      return !!document.querySelector(this.AD_SELECTORS);
    },

    /** Find a visible Skip Ad button (skippable ads only). */
    querySkipButton() {
      const btn =
        document.querySelector(
          '.ytp-ad-skip-button.ytp-button, .ytp-ad-skip-button-modern.ytp-button, .ytp-ad-skip-button-container button'
        ) ||
        document.querySelector('[class*="ytp-ad-skip-button"] button');

      if (!btn) return null;

      const cs = getComputedStyle(btn);
      const visible =
        cs.display !== 'none' &&
        cs.visibility !== 'hidden' &&
        cs.pointerEvents !== 'none' &&
        btn.offsetParent !== null &&
        !btn.disabled &&
        btn.getBoundingClientRect().width > 0;

      return visible ? btn : null;
    },

    /** Start watching for a Skip Ad button during the 5–10 s window. */
    startSkipWindow() {
      this.stopSkipWindow(); // clear any prior watchers

      const windowStart = this._adStartedAt + this.SKIP_MIN_MS;
      const windowEnd = this._adStartedAt + this.SKIP_MAX_MS;
      const startDelay = Math.max(0, windowStart - Date.now());

      this._skipTimer = setTimeout(() => {
        // Poll every 200 ms until the end of the window or we click once.
        this._skipPoll = setInterval(() => {
          const now = Date.now();
          if (now > windowEnd) {
            this.stopSkipWindow();
            return;
          }
          const btn = this.querySkipButton();
          if (btn) {
            if (trustedClick(btn)) {
              log('⏭️  Clicked “Skip Ad” (within 5–10 s window)');
            } else {
              // Fallback to direct .click() if dispatching events didn't take.
              try { btn.click(); log('⏭️  Clicked “Skip Ad” via .click()'); } catch {}
            }
            this.stopSkipWindow();
          }
        }, 200);
      }, startDelay);
    },

    stopSkipWindow() {
      if (this._skipTimer) {
        clearTimeout(this._skipTimer);
        this._skipTimer = 0;
      }
      if (this._skipPoll) {
        clearInterval(this._skipPoll);
        this._skipPoll = 0;
      }
    },

    /** Mute/unmute + overlay + skip-window orchestration. */
    tick() {
      const video = document.querySelector('video');
      if (!video) return;

      const overlay = this.getOverlay();
      const inAd = this.adIsActive();

      if (inAd && !this._muted) {
        video.muted = true;
        this._muted = true;
        overlay.style.display = 'block';
        this._overlayShownAt = Date.now();
        this._adStartedAt = this._overlayShownAt;
        this.startSkipWindow();
        log('🔇  Muted ad (watch/live); started Skip-Ad window');
      } else if (!inAd && this._muted) {
        video.muted = false;
        this._muted = false;
        overlay.style.display = 'none';
        this._overlayShownAt = 0;
        this._adStartedAt = 0;
        this.stopSkipWindow();
        log('🔊  Unmuted');
      }

      // Refresh if overlay stuck too long (failsafe for non-skippables).
      if (
        this._overlayShownAt &&
        Date.now() - this._overlayShownAt > this.TIMEOUT_MS
      ) {
        log('🔄  Overlay stuck >30 s – reloading page');
        location.reload();
      }
    },

    // internals
    _overlay: null,
    _muted: false,
    _overlayShownAt: 0,
    _adStartedAt: 0,
    _skipTimer: 0,
    _skipPoll: 0
  };

  /* ------------------------------------------------------------------ */
  /*  MutationObserver + SPA navigation guard                            */
  /* ------------------------------------------------------------------ */

  const PAGE_SELECTOR = 'ytd-app';
  const OBSERVER_CONFIG = { childList: true, subtree: true, attributes: true };
  let domObserver = null;

  const onDomMutate = () => {
    maybeSkipSponsoredReel();
    // Run mute/unmute and skip-window logic on anything that's not Shorts.
    if (!location.pathname.startsWith('/shorts')) {
      longForm.tick();
    }
  };

  const bindObserver = () => {
    if (domObserver) return;
    domObserver = new MutationObserver(onDomMutate);
    domObserver.observe(
      document.querySelector(PAGE_SELECTOR) || document.body,
      OBSERVER_CONFIG
    );
    onDomMutate();
    log('🔎  DOM observer bound');
  };

  const unbindObserver = () => {
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
      log('🛑  DOM observer unbound');
    }
  };

  /** Routes that actually host a YouTube HTML5 player we care about. */
  const shouldBindForPath = (p) => {
    if (p.startsWith('/watch') || p.startsWith('/watch_videos')) return true; // includes playlists & mixes
    if (p.startsWith('/shorts')) return true;
    if (p.startsWith('/live')) return true; // /live/VIDEO_ID
    if (/^\/(@|channel\/)[^/]+\/live\b/.test(p)) return true; // /@handle/live or /channel/.../live
    if (p.startsWith('/playlist')) return true; // playlist landing can embed a player
    return false;
  };

  let currentURL = location.href;

  const onURLChange = () => {
    if (location.href === currentURL) return;
    currentURL = location.href;
    log('🔄  URL change:', currentURL);

    if (shouldBindForPath(location.pathname)) bindObserver();
    else unbindObserver();
  };

  /* YouTube fires a custom event when navigation is finished. */
  window.addEventListener('yt-navigate-finish', onURLChange);
  setInterval(onURLChange, SPA_POLL_MS);
  onURLChange();
})();
