# Image to WhatsApp Status Video

Turn one photo into a silent, vertical MP4 that you can post straight to WhatsApp Status.

Everything happens **inside your browser**. There is no backend, no database, no upload,
no build step and no npm install. Five files, copied into a GitHub repository, and it runs.

---

## 1. What the project does

You pick one image (JPG, PNG or WEBP). You pick a length (15, 30 or 60 seconds).
You press **Create Video**. The app encodes a real MP4 file in your browser and gives you a
**Download MP4** button.

The output is built for WhatsApp Status:

| Setting | Value |
| --- | --- |
| Container | MP4, `+faststart` |
| Video codec | H.264 (`libx264`), Baseline profile, Level 4.0 |
| Pixel format | `yuv420p` |
| Resolution | **1080 x 1920** (9:16 vertical) |
| Frame rate | 30 fps, constant |
| Audio | **none at all** (`-an`, zero audio tracks) |
| Duration | exactly 15, 30 or 60 seconds |
| Filename | `whatsapp-status-15s.mp4` / `-30s.mp4` / `-60s.mp4` |

The photo is **never stretched**. It is scaled with its aspect ratio kept, then either padded
with your chosen background colour (**Fit**) or centre-cropped (**Cover**).

---

## 2. Features

- Upload by **clicking** the box or by **dragging and dropping** a file onto it.
- Accepts JPG, JPEG, PNG and WEBP. Anything else gets a friendly error.
- 20 MB size limit, with a clear message telling you the actual size of the file you picked.
- Live image preview, and you can replace the image as many times as you like.
- Duration selector: 15 / 30 / 60 seconds, default **60**.
- **Fit** or **Cover**, default Fit, plus a **background colour** picker (default black)
  used to fill the empty area in Fit mode.
- Staged progress with a real percentage: `Loading video engine… 43%` →
  `Starting video engine…` → `Processing image…` → `Generating video… 61%` →
  `Finalizing MP4…` → `Complete!`
- Result panel with an inline player plus the duration, resolution and file size.
- Large green **Download MP4** button with the correct filename for the duration you chose.
- Friendly errors for every failure (no image, wrong type, too big, engine could not load,
  browser too old, encoding failed, out of memory). The real error always goes to the
  browser console so a developer can debug it.
- Browser support is checked before any work starts: WebAssembly, Blob,
  `URL.createObjectURL`, FileReader, fetch and Web Workers.
- Mobile-first responsive layout. Android Chrome is the main target.
- Works from a GitHub Pages subpath (`https://USERNAME.github.io/REPOSITORY/`).

---

## 3. How it works

```text
index.html   the page: upload area, duration selector, buttons, result panel
style.css    all styling, mobile-first, no framework
script.js    all logic: validation, FFmpeg loading, encoding, cleanup
README.md    this file
.gitignore   keeps local junk out of the repo
```

Step by step when you press **Create Video**:

1. **Feature check.** If the browser cannot do WebAssembly / Blob / object URLs /
   FileReader / fetch / Web Workers, you get a message instead of a broken page.
2. **Load the engine, once.** On the *first* click only, the app downloads FFmpeg compiled to
   WebAssembly (about 32 MB) and starts it in a Web Worker. The instance is kept and reused
   for every later video, so the second video starts encoding immediately.
3. **Write the image into FFmpeg's in-memory file system.** Nothing touches your disk and
   nothing touches the network.
4. **Encode in one pass.** One still image in, one MP4 out, no intermediate files.
5. **Read the MP4 back**, wrap it in a `Blob`, and point the `<video>` player and the
   download link at a `blob:` URL.
6. **Clean up.** The temporary input and output files are deleted from FFmpeg's file system,
   and old object URLs are revoked, so repeated use does not leak memory.

The exact FFmpeg command, for a 60-second Fit video on a black background:

```text
-loop 1 -framerate 30 -i input.jpg
-t 60 -r 30
-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x000000,setsar=1"
-c:v libx264 -preset ultrafast -tune stillimage -crf 28 -g 300
-pix_fmt yuv420p -movflags +faststart -an
output.mp4
```

Why each part matters:

- `-loop 1 -framerate 30` feeds the same picture as a 30 fps stream, endlessly.
- `-t 60` and `-r 30` are **output** options, so you get exactly 60 x 30 = 1800 frames.
  That is why the duration comes out exact and not "about right".
- `scale=...:force_original_aspect_ratio=decrease` shrinks the photo until it fits inside
  1080x1920, keeping its shape. `pad` then centres it and fills the rest with your colour.
  In **Cover** mode this becomes
  `scale=...:force_original_aspect_ratio=increase,crop=1080:1920`, which fills the frame and
  trims the overflow evenly from both sides.
- `setsar=1` forces square pixels, so a photo carrying odd pixel-aspect metadata cannot come
  out looking squashed.
- `-preset ultrafast` because the WebAssembly build encodes on a **single thread**. On a phone
  that is the whole ballgame. It also produces Baseline profile, the most widely playable
  H.264 there is.
- `-tune stillimage`, `-crf 28` and `-g 300` (one keyframe every 10 s) keep the file small.
  Nothing in the picture moves, so extra keyframes and extra bitrate would be wasted bytes.
  A 60-second video lands at roughly 1-3 MB.
- `-an` guarantees the file has no audio track.

### Verified output

Generated in real headless Chrome and checked by parsing the MP4 box structure
(codec, dimensions, frame count, duration and audio-track count all read straight
out of the file):

```text
container    MP4 (isom / iso2 / avc1 / mp41), moov before mdat -> faststart
video track  avc1 / H.264 Baseline (profile_idc 66), Level 4.0, 1080 x 1920
pixel format yuv420p, 8-bit (SPS chroma_format_idc 1)
frame rate   30 fps constant (timescale 15360, sample delta 512)
15 s file    450 frames,  duration 15.000 s, 599 KB
30 s file    900 frames,  duration 30.000 s, 930 KB
60 s file    1800 frames, duration 60.000 s, 1.9 MB
audio        0 audio tracks
```

**Encode times measured on desktop Chrome** (headless, single-threaded core,
excluding the one-off engine download):

| Duration | Time |
| --- | --- |
| 15 s | ~20 s |
| 30 s | ~23 s |
| 60 s | ~46 s |

A phone will be **substantially slower** than this - it has less memory, a slower
CPU and no benefit from multiple cores here. Treat the numbers above as a
best case, not as what to expect on Android.

**Input coverage verified end to end:** JPG, PNG and WEBP; landscape (4000x3000),
portrait (720x1280), square (1000x1000) and odd-dimension (1080x1081) sources;
both Fit and Cover; custom background colours. Every one produced a correct
1080x1920 file with the picture band exactly where the arithmetic predicts, and no
distortion in any of them.

---

## 4. How FFmpeg WebAssembly is used

The app uses `ffmpeg.wasm` **0.12.x** from the unpkg CDN. These are the only network requests
the app ever makes, and they are written out explicitly in `script.js`:

```text
https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js       ~4 KB   -> window.FFmpegWASM
https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js           ~3 KB   -> window.FFmpegUtil
https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js   ~3 KB   worker script
https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js     ~112 KB
https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm   ~32 MB  the encoder
```

Only the first two are in `index.html`. The rest are fetched lazily on your first
**Create Video** click, so the page itself loads instantly.

Three details in that list are load-bearing. If you change them, the app breaks:

1. **The core must be single-threaded.** A multi-threaded ffmpeg.wasm build uses pthreads,
   which in a browser means `SharedArrayBuffer`. `SharedArrayBuffer` only exists on a
   cross-origin-isolated page, which requires two response headers:
   `Cross-Origin-Opener-Policy: same-origin` and
   `Cross-Origin-Embedder-Policy: require-corp`.
   **GitHub Pages cannot send custom response headers**, so a page hosted there can never be
   cross-origin isolated. `@ffmpeg/core@0.12.6` is single-threaded, so it works there.
   A multi-threaded core fails with `ReferenceError: SharedArrayBuffer is not defined`.
2. **`coreURL` must be the `/esm/` build, not `/umd/`.** Version 0.12 starts its worker with
   `{ type: "module" }`. Inside a module worker `importScripts()` does not exist, so the
   library's `importScripts` attempt always throws and it falls back to a dynamic
   `import(coreURL)` and reads `.default` off the result. The UMD core has no `default`
   export, so a `/umd/` core fails with `failed to import ffmpeg-core.js`.
3. **`classWorkerURL` must be a `blob:` URL.** Browsers refuse to start a worker from a
   cross-origin script, so the worker source is fetched first and handed over as a local
   blob. `FFmpegUtil.toBlobURL` does this. The same helper downloads the 32 MB wasm with a
   progress callback, which is where the real loading percentage comes from.

Do **not** "downgrade" to `@ffmpeg/ffmpeg@0.11.x`. Its loader is hardwired to the
multi-threaded core's entry point (`proxy_main`): 0.11 with the multi-threaded core dies on
`SharedArrayBuffer`, and 0.11 with the single-threaded core (`@ffmpeg/core-st`, which exports
`main`) dies on `Assertion failed: Cannot call unknown function proxy_main`.

Memory discipline (the WebAssembly encoder is RAM-hungry):

- The FFmpeg instance is created **once** and reused for every conversion.
- Temporary files are deleted from the virtual file system after every run, success or not.
- Every object URL is revoked when it is replaced or no longer needed - old previews, old
  videos, and the two large blobs used during engine startup.
- The encoder runs in a Web Worker, so the page stays responsive while it works.

---

## 5. How to run locally

You cannot just double-click `index.html`. WebAssembly and Web Workers need a real
`http://` origin, so open it through any static file server:

```bash
# Python 3 - already installed on macOS and most Linux systems
cd image-to-whatsapp-video
python3 -m http.server 8000
# then open http://localhost:8000
```

```bash
# Node, no install needed
npx serve .
# or
npx http-server -p 8000
```

```bash
# PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in Chrome. The first **Create Video** click downloads the
32 MB engine; after that your browser caches it.

---

## 6. How to deploy to GitHub Pages

Create an empty repository on GitHub first, then:

```bash
cd image-to-whatsapp-video

git init
git branch -M main
git add index.html style.css script.js README.md .gitignore
git commit -m "feat: image to WhatsApp Status video, fully client-side"

git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Replace `USERNAME` and `REPOSITORY` with your own. If you prefer not to use the command line,
just use **Add file → Upload files** on GitHub and drag the five files in.

---

## 7. GitHub Pages configuration

Exact click path:

```text
GitHub repository
→ Settings
→ Pages
→ Build and deployment
→ Source: Deploy from a branch
→ Branch: main
→ Folder: / (root)
→ Save
```

Wait about a minute, then open:

```text
https://USERNAME.github.io/REPOSITORY/
```

The site lives on a **subpath**, not at `/`. That is why every local reference in this project
is relative (`./style.css`, `./script.js`) and never absolute (`/style.css`). Absolute paths
would 404 on GitHub Pages. This has been tested by serving the app from a subpath.

No extra configuration is needed. There is no build step, so no GitHub Action is required.
You do not need a `.nojekyll` file either, because no file or folder name starts with an
underscore.

---

## 8. Browser compatibility

Only desktop Chrome has actually been measured. Everything else is an expectation based
on the features the app needs, not a test result. Please treat the second column honestly.

| Browser | Status |
| --- | --- |
| Desktop Chrome | **Tested.** All 3 durations verified end to end. Fastest. |
| Android Chrome | *Expected to work* - the main target, but **not tested on a real device**. Substantially slower than desktop. |
| Edge (desktop and Android) | *Expected to work* (same engine as Chrome). Not tested. |
| iPhone / iPad Safari 16.4+ | *Expected to work.* Not tested. Older iOS may run out of memory on 60 s. |
| Desktop Safari 16.4+ | *Expected to work.* Not tested. |
| Firefox 79+ | *Expected to work.* Not tested. |
| Any browser without WebAssembly or Web Workers | Blocked with a clear message. |

The app checks for WebAssembly, Blob, `URL.createObjectURL`, FileReader, fetch and Web Workers
before it starts, and tells you to use a recent Chrome, Edge or Safari if anything is missing.

---

## 9. Privacy

**Your image is processed in your browser and is not uploaded to a server.**

That sentence is literally true, and here is why:

- There is no backend, no API and no database in this project.
- Your image is only ever read into memory in your own tab, handed to the WebAssembly encoder
  running in a Web Worker in that same tab, and written back into memory.
- The finished MP4 is a local `blob:` URL. Downloading it is a local file save.
- The **only** outbound requests are for the FFmpeg engine files listed in section 4. They are
  downloads *to* you. No image data, and no information about your image, is ever sent
  anywhere.
- No cookies, no localStorage, no analytics, no tracking, no fonts or images from third
  parties, no authentication.

You can verify all of this yourself: open DevTools → Network, make a video, and look at the
request list.

---

## 10. Known limitations

- **Real phones have not been tested.** All testing was done in desktop Chrome, including at a
  412x915 mobile viewport. **Android Chrome and iOS Safari have not been tested on real
  devices.** They are expected to work - nothing here is desktop-specific - but "expected to
  work" is not "verified", and a phone is exactly where the memory and speed limits below are
  most likely to bite.
- **First use downloads about 32 MB.** That is the FFmpeg WebAssembly encoder. It is downloaded
  once **per browser cache**, so it comes back on a different browser, a different device, or
  after the cache is cleared. The first video on a mobile data connection is a real download.
- **Encoding is single-threaded and therefore slow.** This is forced by GitHub Pages not being
  able to send the COOP/COEP headers a multi-threaded build needs (see section 4). A 60-second
  video takes noticeably longer on a phone than on a desktop, which is why the app warns
  "Video creation may take a little longer on mobile devices."
- **RAM.** WebAssembly FFmpeg needs a few hundred MB. On an old or memory-starved phone a
  60-second render can fail; the app catches this and suggests a smaller image or a shorter
  duration. Closing other tabs helps. If a render is killed outright by the browser, or simply
  runs past its time limit, the app gives up cleanly, throws the engine away and lets you try
  again - it will not sit there disabled forever.
- **The page must be served over `http://` or `https://`.** Opening `index.html` from
  `file://` will not work.
- **One image per video.** No slideshows, no music, no text overlays, no filters, no
  transitions. That is deliberate - it keeps the app small and easy to understand.
- **The output is always 1080x1920.** There is no landscape or square output option.
- **Background colour only shows in Fit mode.** In Cover mode the photo fills the whole frame,
  so there is nothing left to fill.
- **Requires the unpkg CDN** to be reachable on the first run. Fully offline use would mean
  committing the 32 MB wasm file into the repository, which GitHub does not recommend.
- **Cross-origin isolation is impossible on GitHub Pages.** If you host this somewhere that
  *can* send COOP/COEP headers, you could switch to a multi-threaded core and get a large
  speed-up. On GitHub Pages you cannot.
