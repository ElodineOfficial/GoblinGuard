# GOBLIN GUARD ALPHA

A lightweight Chrome extension that **accidently unalives sponsored ads on YouTube videos**. 
To do: Apply to shorts, auto-skip when YT attempts to serve ad, include surveys which work differently. I'll have this all finished before the end of June/25

---

###  What It Does

- Detects when YouTube is playing a **video ad**  
- **Mutes audio** and **blacks out the player** during that time  
- Restores sound and video automatically when normal content resumes  

This isn’t about skipping — it’s about letting the ad run while *you* step away or tune out.

---

###  How It Works

This extension watches for the subtle “Sponsored” badge YouTube uses to mark ad segments.  
When it appears, we **mute the video and cover it visually** — just like you'd do manually if you saw an ad start.

---

###  What It Was *Meant* To Do

Originally, this was built to **quiet sudden volume spikes** during mid-roll ads SO I COULD FUCKING SLEEP WITHOUT WAKING UP TO AN AUDIO JUMPSCARE.  
That’s it — not block, not skip, not hack.

---

###  Why It Doesn’t *Just* Mute Anymore

Turns out, YouTube doesn’t like when ads are muted — it will instead **refuses to serve the ad entirely** if audio can’t be auto-played.  

---

###  Stability & Privacy

- We’ve built in **fail-safes and countermeasures** to keep it working even as YouTube evolves, but this is just prolonging the eventual catches installed for this.
- No analytics, no tracking, **no data collected or transmitted.**
- When YouTube changes again, we’re already a couple versions ahead. So if you have issues, reach out to me on Discord so we can get the latest version uploaded!

---

###  How To Install

1. Download or clone this repo into a folder (3 files total):
   - `manifest.json`
   - `content.js`
   - `icon.png` (optional)
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer Mode** (toggle in top right)
4. Click **“Load unpacked”**
5. Select the folder where you saved the files

That’s it — it runs silently in the background on any YouTube video.

---

###  Tip

Want to see what it’s doing?  
Open DevTools → Console and turn on logging by setting `DEBUG = true` in `content.js`. You'll be able to see when ads are silenced.

---

###  License

MIT — free to use, fork, adapt, or forget about.
