// YouTube Ad Volume Muter + Auto-Skip-ish
// - Detects ads via ad-showing/ad-interrupting, yellow bar, or Skip UI
// - Mutes during ads, restores volume after
// - When Skip is available, tries to click it
//   and also jumps the ad video to its end as a fallback.
// - Handles back-to-back ads and mid-rolls

(function () {
  const INTERVAL_MS = 500;
  const DEBUG = false;

  let inAd = false;
  let mutedByScript = false;
  let previousVolume = 1;
  let previousMuted = false;

  function log(...args) {
    if (DEBUG) {
      console.log('[YT Ad Mute]', ...args);
    }
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
    // Support both nested and direct .ytp-play-progress
    return player.querySelector('.ytp-progress-bar .ytp-play-progress, .ytp-play-progress');
  }

  function getSkipButton() {
    const root = document;

    const selectors = [
      // The button you actually have:
      'button.ytp-skip-ad-button',          // <button class="ytp-skip-ad-button" id="skip-button:g">
      'button[id^="skip-button"]',          // id="skip-button:g", "skip-button:2y", etc.

      // Containers / text, as fallbacks
      '.ytp-skip-ad-button__text',          // inner "Skip" div
      '.ytp-skip-ad',                       // outer skip-ad div

      // Older variants (keep for compatibility)
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

      // If we hit the inner text element, climb up to the clickable parent
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

    // Exact ad yellow seen in your logs
    if (colorString === 'rgb(255, 204, 0)' || colorString === 'rgba(255, 204, 0, 1)') {
      return true;
    }

    // Fuzzy fallback for future theme tweaks
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

  // This is our "mash skip" + "jump to end" combo
  function skipAdIfPossible(video) {
    const btn = getSkipButton();
    if (!btn) return;

    // 1) Try to click the button anyway (if YouTube ever relaxes, this will start working)
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

    // 2) Fallback: when Skip UI exists, jump to end of the *current ad*
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

  function onAdStart(video) {
    inAd = true;

    if (!video) {
      log('Ad started but no video element.');
      mutedByScript = false;
      return;
    }

    // If user already had it muted/0, leave it alone.
    if (video.muted || video.volume === 0) {
      mutedByScript = false;
      log('Ad started but video already muted/0; not touching audio.');
      return;
    }

    previousVolume = video.volume;
    previousMuted = video.muted;

    video.muted = true;
    video.volume = 0;
    mutedByScript = true;

    log('Ad started → muting. Saved volume:', previousVolume, 'muted:', previousMuted);
  }

  function onAdEnd(video) {
    inAd = false;

    if (!video) {
      log('Ad ended but no video element.');
      return;
    }

    if (!mutedByScript) {
      log('Ad ended, but we did not mute; leaving audio as-is.');
      return;
    }

    // Only restore if nothing else has changed it since.
    if (video.muted && video.volume === 0) {
      video.volume = previousVolume;
      video.muted = previousMuted;
      log('Ad ended → restoring volume to', previousVolume, 'muted:', previousMuted);
    } else {
      log('Ad ended, but user/YouTube changed audio; not restoring.');
    }

    mutedByScript = false;
  }

  function tick() {
    const video = getVideo();
    if (!video) {
      log('No video element yet.');
      return;
    }

    const adNow = isAdPlaying();

    if (adNow) {
      // Always try to skip if possible
      skipAdIfPossible(video);

      if (!inAd) {
        // Fresh ad (or first in a sequence)
        onAdStart(video);
      } else {
        // Still in ad (back-to-back, long ad pod, etc.)
        // Ensure we stay muted even if player swapped or something changed.
        if (!video.muted || video.volume > 0) {
          log('Still in ad but audio not muted → re-muting.');
          video.muted = true;
          video.volume = 0;
          mutedByScript = true;
        }
      }
    } else {
      if (inAd) {
        // We were in an ad and now we're not → clean up once.
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
    log('Started YouTube ad volume muter + skip helper.');
  }

  // SPA navigation support for YouTube
  window.addEventListener('yt-navigate-finish', () => {
    log('yt-navigate-finish → restarting watcher.');
    start();
  });

  // Handy manual stop for DevTools
  window.stopYouTubeAdMute = function () {
    if (window.__ytAdMuteIntervalId) {
      clearInterval(window.__ytAdMuteIntervalId);
      window.__ytAdMuteIntervalId = null;
      console.log('[YT Ad Mute] Stopped watcher.');
    }
  };

  start();
})();
