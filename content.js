/* ==================================================================== */
/*  Sponsor-Skip for YouTube Shorts – desktop Chrome (2025-07-06)       */
/* ==================================================================== */

(() => {
  /* ------------------------------------------------------------------ */
  /*  Configuration (adjust if you like)                                */
  /* ------------------------------------------------------------------ */

  /**  Set to false to silence console output. */
  const DEBUG_LOG = true;

  /**  How often we poll the DOM for URL changes (ms). */
  const SPA_POLL_MS = 400;

  /**  Minimum ms between two automatic skips of sponsored reels. */
  const SKIP_COOLDOWN_MS = 10_000;

  /**  Base delay (ms) before clicking “Next Short”. */
  const SKIP_DELAY_BASE_MS = 200;

  /**  Additional random delay (0-this) after the base delay (ms). */
  const SKIP_DELAY_VARIANCE_MS = 800;

  /* ------------------------------------------------------------------ */
  /*  Utility helpers                                                   */
  /* ------------------------------------------------------------------ */

  const log = (...args) => {
    if (!DEBUG_LOG) return;
    const ts = new Date().toLocaleTimeString();
    console.log(`%c[Shorts-Sponsor-Skip ${ts}]`, 'color:#9cf', ...args);
  };

  /**  Return a random integer in [0, n). */
  const randInt = (n) => Math.floor(Math.random() * n);

  const randDelay = () => SKIP_DELAY_BASE_MS + randInt(SKIP_DELAY_VARIANCE_MS);

  /* ------------------------------------------------------------------ */
  /*  Current visible reel helper                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Return the `<ytd-reel-video-renderer>` whose bounding rectangle
   * occupies the largest *visible* height in the viewport. This is
   * the reel YouTube currently treats as “active”.
   */
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
  /*  Sponsor badge detection (within the *visible* reel only)          */
  /* ------------------------------------------------------------------ */

  /**
   * CSS selectors that positively identify a Shorts advertisement.
   * (Your two exact DOM paths are condensed into these three selectors.)
   */
  const SPONSOR_BADGE_SELECTORS = [
    /* New 2025 “badge-shape” path. */
    'reels-ad-card-buttoned-view-model badge-shape > div',

    /* <ytd-ad-slot-renderer> still appears on most layouts. */
    'ytd-ad-slot-renderer',

    /* Older “Sponsored” aria-label fallback. */
    '[aria-label="Sponsored"]'
  ].join(',');

  /**
   * True ⇢ the reel that is ≥50 % on-screen contains a sponsor badge.
   */
  const isSponsoredReelVisible = () => {
    const reel = getVisibleReel();
    return !!(reel && reel.querySelector(SPONSOR_BADGE_SELECTORS));
  };

  /* ------------------------------------------------------------------ */
  /*  Navigation to the next Short                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Grab *the real clickable* button nested inside
   *   #navigation-button-down → ytd-button-renderer → … → <button>
   * on the Shorts player UI.
   */
  const queryNavDownButton = () =>
    document.querySelector(
      '#navigation-button-down ytd-button-renderer button,' +
        '#navigation-button-down button'
    );

  /**
   * Dispatch a full “pointerdown → mousedown → mouseup → click”
   * sequence on the element (`event.isTrusted` is still false, but
   * YouTube accepts this for its own navigation buttons).
   *
   * @returns {boolean}  true if a click was dispatched.
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

  /**
   * Fallback when the dedicated “Down” button isn’t in the DOM
   * (rare A/B layouts): scroll the next reel into view.
   */
  const scrollNextReelIntoView = () => {
    const current = getVisibleReel();
    if (current && current.nextElementSibling) {
      current.nextElementSibling.scrollIntoView({
        behavior: 'instant',
        block: 'start'
      });
    } else {
      /* As a last resort, just scroll one viewport height. */
      window.scrollBy({ top: innerHeight, left: 0, behavior: 'instant' });
    }
  };

  /**
   * Perform the actual navigation: prefer clicking YouTube’s own
   * button; otherwise scroll.
   */
  const goToNextShort = () => {
    const button = queryNavDownButton();
    if (!trustedClick(button)) {
      log('Fallback scroll – nav button not found.');
      scrollNextReelIntoView();
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Sponsor-skip orchestration                                        */
  /* ------------------------------------------------------------------ */

  const skipState = { lastSkipTime: 0 };

  /**
   * Called frequently (via MutationObserver). If we’re on a
   * `/shorts/...` page and the visible reel is an ad, schedule a
   * single skip (respecting the cooldown). The IntersectionObserver
   * verifies a different reel becomes dominant before we log success.
   */
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

      /* Watch for any *other* reel to become ≥50 % visible. */
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
  /*  Long-form /watch mute-overlay (untouched from earlier)            */
  /* ------------------------------------------------------------------ */

  const longForm = {
    /**  CSS that indicates a long–form ad is in progress. */
    AD_SELECTORS: [
      '.html5-video-player.ad-showing',
      '.html5-video-player.ad-interrupting',
      '.ytp-ad-skip-button',
      '.ytp-ad-timed-pie-countdown-container',
      '.ad-simple-attributed-string.ytp-ad-badge__text--clean-player',
      '[aria-label="Survey"]'
    ].join(','),

    /**  One-time <img> overlay shown while muted. */
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

    /**  True ⇢ a long-form ad is showing on a /watch page. */
    adIsActive() {
      const player = document.querySelector('.html5-video-player');
      if (
        player &&
        (player.classList.contains('ad-showing') ||
          player.classList.contains('ad-interrupting'))
      )
        return true;

      return !!document.querySelector(this.AD_SELECTORS);
    },

    /**  Mute/unmute logic with overlay. */
    tick() {
      const video = document.querySelector('video');
      if (!video) return;

      const overlay = this.getOverlay();
      const inAd = this.adIsActive();

      if (inAd && !this._muted) {
        video.muted = true;
        this._muted = true;
        overlay.style.display = 'block';
        log('🔇  Muted long-form ad');
      } else if (!inAd && this._muted) {
        video.muted = false;
        this._muted = false;
        overlay.style.display = 'none';
        log('🔊  Unmuted');
      }
    },

    _overlay: null,
    _muted: false
  };

  /* ------------------------------------------------------------------ */
  /*  MutationObserver + SPA navigation guard                           */
  /* ------------------------------------------------------------------ */

  const PAGE_SELECTOR = 'ytd-app'; // entire doc subtree

  /**  Observe all subtree changes so we notice new reels/badges fast. */
  const OBSERVER_CONFIG = { childList: true, subtree: true, attributes: true };

  let domObserver = null;

  /**  Runs on every DOM mutation we care about. */
  const onDomMutate = () => {
    maybeSkipSponsoredReel();

    /* Only run mute/unmute on /watch pages (never on /shorts). */
    if (!location.pathname.startsWith('/shorts')) {
      longForm.tick();
    }
  };

  /**  Attach the MutationObserver if not already active. */
  const bindObserver = () => {
    if (domObserver) return;
    domObserver = new MutationObserver(onDomMutate);
    domObserver.observe(document.querySelector(PAGE_SELECTOR) || document.body, OBSERVER_CONFIG);
    onDomMutate();
    log('🔎  DOM observer bound');
  };

  /**  Disconnect the MutationObserver. */
  const unbindObserver = () => {
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
      log('🛑  DOM observer unbound');
    }
  };

  /**
   * We must re-bind when the SPA (YouTube’s polymer router) changes
   * the URL, because entire shadow-roots can be swapped.
   */
  let currentURL = location.href;

  const onURLChange = () => {
    if (location.href === currentURL) return;
    currentURL = location.href;
    log('🔄  URL change:', currentURL);

    if (
      location.pathname.startsWith('/shorts') ||
      location.pathname.startsWith('/watch')
    ) {
      bindObserver();
    } else {
      unbindObserver();
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Wire-up: listen for SPA events + fallback polling                 */
  /* ------------------------------------------------------------------ */

  /* YouTube fires a custom event when navigation is finished. */
  window.addEventListener('yt-navigate-finish', onURLChange);

  /* Also poll every SPA_POLL_MS in case that event is missed. */
  setInterval(onURLChange, SPA_POLL_MS);

  /* Kick-start on initial load. */
  onURLChange();
})();
