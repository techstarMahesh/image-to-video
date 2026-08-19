/*
 * Image to WhatsApp Status Video
 * 100% client-side. No backend, no database, no upload of the user's image.
 *
 * ---------------------------------------------------------------------------
 * CDN DEPENDENCY (the only network requests this app ever makes)
 * ---------------------------------------------------------------------------
 *   @ffmpeg/ffmpeg 0.12.10  dist/umd/ffmpeg.js       -> window.FFmpegWASM
 *   @ffmpeg/util   0.12.1   dist/umd/index.js        -> window.FFmpegUtil
 *   @ffmpeg/ffmpeg 0.12.10  dist/umd/814.ffmpeg.js   the worker script
 *   @ffmpeg/core   0.12.6   dist/esm/ffmpeg-core.js  + ffmpeg-core.wasm (32 MB)
 *
 * The first two are loaded by index.html. The rest are fetched here, lazily, on
 * the first "Create Video" click.
 *
 * WHY EXACTLY THESE URLS - all three details matter, and each one is a real
 * failure mode we hit:
 *
 * 1. SINGLE-THREADED CORE. A multi-threaded ffmpeg.wasm build uses pthreads,
 *    which in a browser means SharedArrayBuffer. SharedArrayBuffer only exists on
 *    a cross-origin-isolated page, and that needs two response headers:
 *        Cross-Origin-Opener-Policy: same-origin
 *        Cross-Origin-Embedder-Policy: require-corp
 *    GitHub Pages cannot send custom response headers, so a page hosted there can
 *    never be cross-origin isolated. @ffmpeg/core 0.12.6 is single-threaded (no
 *    pthreads, no SharedArrayBuffer), so it works on plain GitHub Pages.
 *
 * 2. `coreURL` MUST BE THE /esm/ BUILD, NOT /umd/. ffmpeg.wasm 0.12 starts its
 *    worker with `{ type: "module" }`. Inside a module worker `importScripts()`
 *    does not exist, so the library's importScripts attempt always throws and it
 *    falls back to a dynamic `import(coreURL)`, then reads `.default` off it.
 *    The UMD core has no `default` export, so a /umd/ coreURL fails with
 *    "failed to import ffmpeg-core.js". Only the /esm/ build works.
 *
 * 3. `classWorkerURL` MUST BE A blob: URL. The browser refuses to start a worker
 *    from a cross-origin script, so the worker source has to be fetched first and
 *    handed over as a local blob. That is what FFmpegUtil.toBlobURL does.
 *
 * Do NOT "downgrade" to @ffmpeg/ffmpeg 0.11.x. Its loader is hardwired to the
 * multi-threaded core's entry point (`proxy_main`), so 0.11 + the multi-threaded
 * core dies on SharedArrayBuffer, and 0.11 + the single-threaded core (core-st,
 * which exports `main`) dies on "Cannot call unknown function proxy_main".
 * ---------------------------------------------------------------------------
 */
'use strict';

const FFMPEG_CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
const FFMPEG_CORE_JS = FFMPEG_CORE_BASE + '/ffmpeg-core.js';
const FFMPEG_CORE_WASM = FFMPEG_CORE_BASE + '/ffmpeg-core.wasm';
const FFMPEG_WORKER_JS = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js';

/* ---------- Output spec (do not drift from this) ---------- */
const OUT_WIDTH = 1080;
const OUT_HEIGHT = 1920;
const OUT_FPS = 30;
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;

/* ---------- Elements ---------- */
const imageInput = document.getElementById('imageInput');
const dropZone = document.getElementById('dropZone');
const preview = document.getElementById('preview');
const fileInfo = document.getElementById('fileInfo');
const dur15 = document.getElementById('dur15');
const dur30 = document.getElementById('dur30');
const dur60 = document.getElementById('dur60');
const fitMode = document.getElementById('fitMode');
const bgColor = document.getElementById('bgColor');
const createBtn = document.getElementById('createBtn');
const progressArea = document.getElementById('progressArea');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const errorBox = document.getElementById('errorBox');
const result = document.getElementById('result');
const resultMeta = document.getElementById('resultMeta');
const metaDuration = document.getElementById('metaDuration');
const metaResolution = document.getElementById('metaResolution');
const metaSize = document.getElementById('metaSize');
const downloadBtn = document.getElementById('downloadBtn');
const emptyResult = document.getElementById('emptyResult');

/* ---------- State ---------- */
let selectedFile = null;   // the File the user picked
let previewUrl = null;     // object URL for the <img> preview
let videoUrl = null;       // object URL for the finished MP4
let ffmpeg = null;         // the one and only FFmpeg instance
let working = false;
let ffmpegLog = [];        // recent engine output, printed to the console on failure
let encodeFrom = 10;       // where the encode phase starts on the progress bar
let targetSeconds = 60;    // duration of the run in progress (for % maths)

/* ======================================================================
   Small helpers
   ====================================================================== */

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Assigning .value also restores the attribute if setIndeterminate() removed it.
function setPercent(pct) {
  progressBar.value = Math.max(0, Math.min(100, pct));
}

// A <progress> with no value renders as an animated "unknown length" bar.
function setIndeterminate() {
  progressBar.removeAttribute('value');
}

function stage(text, pct) {
  progressText.textContent = text;
  if (typeof pct === 'number') setPercent(pct);
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  // data-error / data-done on <body> are the signal our automated end-to-end
  // browser tests wait on. Please do not remove them.
  document.body.dataset.error = '1';
}

function clearError() {
  errorBox.textContent = '';
  errorBox.hidden = true;
  delete document.body.dataset.error;
}

function selectedSeconds() {
  if (dur15.checked) return 15;
  if (dur30.checked) return 30;
  return 60;
}

/* ======================================================================
   Browser support check (PRD 12)
   ====================================================================== */

function missingFeatures() {
  const missing = [];
  if (typeof WebAssembly !== 'object' || typeof WebAssembly.instantiate !== 'function') missing.push('WebAssembly');
  if (typeof Blob !== 'function') missing.push('Blob');
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') missing.push('URL.createObjectURL');
  if (typeof FileReader !== 'function') missing.push('FileReader');
  if (typeof fetch !== 'function') missing.push('fetch');
  // ffmpeg.wasm 0.12 always runs the encoder inside a Web Worker.
  if (typeof Worker !== 'function') missing.push('Web Workers');
  return missing;
}

/* ======================================================================
   Image selection (PRD 1)
   ====================================================================== */

function releasePreview() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
}

function releaseVideo() {
  if (videoUrl) {
    URL.revokeObjectURL(videoUrl);
    videoUrl = null;
  }
}

/*
 * Throw away any previous result, and reset the progress UI with it.
 * This runs whenever an input changes, so a finished video is never left on
 * screen next to settings it was not made with. Note this only covers changes
 * made BEFORE a render starts: the inputs are disabled for the duration of a
 * render (see setControlsDisabled), which is what actually guarantees the
 * download filename agrees with the duration that produced it.
 */
function resetOutput() {
  releaseVideo();
  result.removeAttribute('src');
  result.load();
  result.hidden = true;
  resultMeta.hidden = true;
  downloadBtn.removeAttribute('href');
  downloadBtn.hidden = true;
  emptyResult.hidden = false;
  progressArea.hidden = true;
  stage('', 0);
  delete document.body.dataset.done;
}

// Locks the settings while a render is in flight, so the video that comes out
// always matches the settings that went in.
function setControlsDisabled(disabled) {
  [imageInput, dur15, dur30, dur60, fitMode, bgColor].forEach(function (el) {
    el.disabled = disabled;
  });
}

function acceptFile(file) {
  clearError();

  if (!file) return;

  const typeOk = ALLOWED_TYPES.indexOf((file.type || '').toLowerCase()) !== -1;
  const extOk = ALLOWED_EXT.test(file.name || '');
  if (!typeOk && !extOk) {
    console.error('Unsupported file selected:', file.name, file.type);
    showError('That file type is not supported. Please choose a JPG, PNG or WEBP image.');
    return;
  }

  if (file.size > MAX_BYTES) {
    console.error('File too large:', file.size);
    showError('That image is ' + formatBytes(file.size) + '. Please choose an image under 20 MB.');
    return;
  }

  selectedFile = file;
  releasePreview();
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;

  fileInfo.textContent = file.name + ' · ' + formatBytes(file.size);
  fileInfo.hidden = false;

  dropZone.classList.add('hasImage');
  dropZone.querySelector('.dropMain').textContent = 'Replace Image';

  createBtn.disabled = false;
  resetOutput();
}

imageInput.addEventListener('change', function () {
  if (working) return;
  acceptFile(imageInput.files && imageInput.files[0]);
});

dropZone.addEventListener('click', function () {
  if (!working) imageInput.click();
});

dropZone.addEventListener('keydown', function (event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (!working) imageInput.click();
  }
});

['dragenter', 'dragover'].forEach(function (name) {
  dropZone.addEventListener(name, function (event) {
    event.preventDefault();
    dropZone.classList.add('dragging');
  });
});

['dragleave', 'dragend'].forEach(function (name) {
  dropZone.addEventListener(name, function () {
    dropZone.classList.remove('dragging');
  });
});

dropZone.addEventListener('drop', function (event) {
  event.preventDefault();
  dropZone.classList.remove('dragging');
  if (working) return;
  const files = event.dataTransfer && event.dataTransfer.files;
  if (files && files.length) acceptFile(files[0]);
});

// Stop the browser from navigating away if a file is dropped next to the box.
['dragover', 'drop'].forEach(function (name) {
  window.addEventListener(name, function (event) {
    if (!dropZone.contains(event.target)) event.preventDefault();
  });
});

[dur15, dur30, dur60, fitMode, bgColor].forEach(function (el) {
  el.addEventListener('change', resetOutput);
});

/* ======================================================================
   Loading FFmpeg (PRD 10) - lazily, once, then reused
   ====================================================================== */

function ffmpegLoaded() {
  return !!(ffmpeg && ffmpeg.loaded);
}

/*
 * Shut the engine down and forget it, so the next click builds a clean one.
 * Needed because a half-loaded or wedged FFmpeg still owns a live Web Worker,
 * and simply overwriting the variable would orphan that worker (one leaked
 * worker, and its memory, per retry).
 */
async function destroyFFmpeg() {
  if (!ffmpeg) return;
  try {
    await ffmpeg.terminate();
  } catch (error) {
    console.error('Could not terminate the video engine:', error);
  }
  ffmpeg = null;
}

/*
 * A ceiling on how long one encode may take before we give up.
 * Measured on desktop Chrome with this single-threaded core: 15 s of video takes
 * about 20 s, 60 s takes about 46 s. A slow phone can easily be several times
 * slower than that, and being cut off unfairly is much worse than waiting, so
 * this is deliberately generous: 5 minutes minimum, and 20 s of grace for every
 * 1 s of video (so 60 s of video gets 20 minutes).
 */
function encodeTimeoutMs(seconds) {
  return Math.max(300000, seconds * 20000);
}

// toBlobURL's 3rd argument turns on progress reporting, and the 4th receives
// { url, total, received, delta, done }. `total` is -1 if the server sent no
// Content-Length, in which case a percentage is impossible.
function onEngineDownload(event) {
  if (!event || !(event.total > 0)) {
    setIndeterminate();
    progressText.textContent = 'Loading video engine…';
    return;
  }
  const fraction = Math.min(1, event.received / event.total);
  stage('Loading video engine… ' + Math.round(fraction * 100) + '%', 5 + fraction * 45);
}

async function loadFFmpeg() {
  if (ffmpegLoaded()) return;

  if (typeof FFmpegWASM === 'undefined' || typeof FFmpegWASM.FFmpeg !== 'function' ||
      typeof FFmpegUtil === 'undefined' || typeof FFmpegUtil.toBlobURL !== 'function') {
    throw new Error('FFMPEG_SCRIPT_MISSING');
  }

  stage('Loading video engine…', 4);

  ffmpeg = new FFmpegWASM.FFmpeg();
  ffmpeg.on('progress', onFFmpegProgress);
  ffmpeg.on('log', function (entry) {
    ffmpegLog.push(entry.message);
    if (ffmpegLog.length > 40) ffmpegLog.shift();
  });

  // A cross-origin script cannot start a worker, so fetch it into a blob first.
  const workerUrl = await FFmpegUtil.toBlobURL(FFMPEG_WORKER_JS, 'text/javascript');
  // 32 MB: this is the download worth showing a real percentage for.
  const wasmUrl = await FFmpegUtil.toBlobURL(FFMPEG_CORE_WASM, 'application/wasm', true, onEngineDownload);

  stage('Starting video engine…', 52);
  try {
    await ffmpeg.load({
      coreURL: FFMPEG_CORE_JS,   // must be the /esm/ build - see the note on top
      wasmURL: wasmUrl,
      classWorkerURL: workerUrl
    });
  } catch (error) {
    // A failed load leaves a live worker behind with loaded === false. Get rid of
    // it here, or every retry would strand another one.
    await destroyFFmpeg();
    throw error;
  } finally {
    // The worker is running and the wasm is compiled, so these two blobs have
    // done their job. Release them instead of holding 32 MB open.
    URL.revokeObjectURL(workerUrl);
    URL.revokeObjectURL(wasmUrl);
  }
}

/*
 * The engine reports { progress, time }, where `time` is the microseconds of
 * video encoded so far. We prefer `progress` when it looks sane and fall back to
 * `time` measured against the duration we asked for, because a looped still image
 * has no real input duration and can make the engine's own ratio meaningless.
 * This is what keeps the bar moving during the encode.
 */
function onFFmpegProgress(info) {
  let fraction = null;
  if (info && typeof info.progress === 'number' && isFinite(info.progress) &&
      info.progress > 0 && info.progress <= 1.5) {
    fraction = info.progress;
  } else if (info && typeof info.time === 'number' && isFinite(info.time) &&
             info.time > 0 && targetSeconds > 0) {
    fraction = (info.time / 1000000) / targetSeconds;
  }
  if (fraction === null) return;

  fraction = Math.max(0, Math.min(1, fraction));
  const span = 96 - encodeFrom;
  stage('Generating video… ' + Math.round(fraction * 100) + '%', encodeFrom + fraction * span);
}

/* ======================================================================
   Building the FFmpeg filter graph (PRD 2 + 16)
   ====================================================================== */

/*
 * "Fit"   : shrink/grow the photo until it fits inside 1080x1920 (whichever side
 *           hits the edge first), then pad the leftover with the chosen colour.
 *             4000x3000 landscape -> 1080x810,  padded top and bottom
 *             1000x1000 square    -> 1080x1080, padded top and bottom
 *             720x1280  (9:16)    -> 1080x1920, no padding at all
 * "Cover" : grow the photo until it covers 1080x1920, then centre-crop.
 *             4000x3000 -> 2560x1920 -> crop to the middle 1080x1920
 *             1000x1000 -> 1920x1920 -> crop to the middle 1080x1920
 *             720x1280  -> 1080x1920 -> crop is a no-op
 * Either way the scale step keeps the original aspect ratio, so the photo is
 * never stretched. setsar=1 forces square pixels, so a source with odd pixel
 * aspect metadata cannot come out looking squashed.
 */
function buildFilter(mode, colorHex) {
  const size = OUT_WIDTH + ':' + OUT_HEIGHT;
  if (mode === 'cover') {
    return 'scale=' + size + ':force_original_aspect_ratio=increase' +
           ',crop=' + size +
           ',setsar=1';
  }
  return 'scale=' + size + ':force_original_aspect_ratio=decrease' +
         ',pad=' + size + ':(ow-iw)/2:(oh-ih)/2:color=' + colorHex +
         ',setsar=1';
}

// <input type="color"> gives "#rrggbb". FFmpeg is happiest with 0xRRGGBB.
function ffmpegColor(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value || '').trim());
  return '0x' + (match ? match[1] : '000000');
}

function extensionFor(file) {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  const match = ALLOWED_EXT.exec(file.name || '');
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

/* ======================================================================
   Create Video (PRD 4)
   ====================================================================== */

function friendlyMessage(error) {
  const text = (error && (error.message || String(error))) || '';
  if (text === 'FFMPEG_SCRIPT_MISSING' || /failed to import ffmpeg-core/i.test(text)) {
    return 'The video engine could not be loaded. Please check your internet connection and reload the page.';
  }
  if (/SharedArrayBuffer|Worker/i.test(text)) {
    return 'This browser blocked the video engine. Please try the latest Chrome, Edge or Safari.';
  }
  // Memory is checked BEFORE abort on purpose: an out-of-memory failure inside
  // WebAssembly surfaces as "Aborted(OOM)", which would otherwise be misreported
  // as a timeout.
  if (/memory|allocat|out of bounds|OOM/i.test(text)) {
    return 'Your device ran out of memory. Please try again with a smaller image, ' +
           'or a shorter duration.';
  }
  if (/abort|timeout|timed out/i.test(text) || (error && error.name === 'AbortError')) {
    return 'That took too long, so it was stopped. Please try again with a shorter ' +
           'duration or a smaller image.';
  }
  if (/fetch|network|Failed to load|HTTP \d+/i.test(text)) {
    return 'The video engine could not be downloaded. Please check your internet connection and try again.';
  }
  // The engine is rebuilt from scratch after any failure, so trying again is
  // genuinely worth a shot before resorting to a reload.
  return 'Sorry, the video could not be created. Please try again - a shorter ' +
         'duration or a smaller image may help.';
}

createBtn.addEventListener('click', async function () {
  if (working) return;

  delete document.body.dataset.done;
  clearError();

  const missing = missingFeatures();
  if (missing.length) {
    console.error('Missing browser features:', missing.join(', '));
    showError('This browser is missing features this app needs (' + missing.join(', ') +
              '). Please use a recent version of Chrome, Edge or Safari.');
    return;
  }

  if (!selectedFile) {
    showError('Please choose an image first.');
    return;
  }

  working = true;
  createBtn.disabled = true;
  setControlsDisabled(true);
  resetOutput();
  progressArea.hidden = false;

  const seconds = selectedSeconds();
  targetSeconds = seconds;
  encodeFrom = ffmpegLoaded() ? 10 : 58;
  ffmpegLog = [];

  const inputName = 'input.' + extensionFor(selectedFile);
  const outputName = 'output.mp4';
  let wroteInput = false;

  try {
    stage('Preparing…', 2);
    // Hand the browser one turn to actually paint "Preparing…" before we start
    // the heavy, blocking work. A timer is used rather than requestAnimationFrame
    // because timers still fire in a background tab, so this can never hang.
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
    await loadFFmpeg();

    stage('Processing image…', encodeFrom - 2);
    const bytes = await FFmpegUtil.fetchFile(selectedFile);
    await ffmpeg.writeFile(inputName, bytes);
    wroteInput = true;

    stage('Generating video… 0%', encodeFrom);

    /*
     * One single pass, one still image in, one MP4 out. No intermediate files.
     *
     *   -loop 1 -framerate 30      feed the same image as a 30 fps stream, forever
     *   -i input.jpg               the only input; there is no audio input at all
     *   -t 60 / -r 30              as OUTPUT options these give exactly
     *                              60 x 30 = 1800 frames, so the duration is exact
     *   -vf ...                    scale + pad (or crop) to 1080x1920, never stretched
     *   -c:v libx264 -pix_fmt yuv420p   what WhatsApp and every phone can play
     *   -preset ultrafast          the core is SINGLE-threaded, so encoding speed is
     *                              the bottleneck, especially on a phone. ultrafast
     *                              also yields Baseline profile, the most compatible
     *   -tune stillimage           x264 tuning for a picture that never moves
     *   -crf 28                    plenty for a static photo, and keeps a 60 s file
     *                              at a few MB instead of tens of MB
     *   -g 300                     a keyframe only every 10 s. Nothing moves, so
     *                              more keyframes would just waste bytes
     *   -movflags +faststart       moov atom first, so it starts playing instantly
     *   -an                        no audio stream in the output, guaranteed
     */
    /*
     * TWO separate safety nets, because they cover different failures:
     *
     *  - the `timeoutMs` argument is enforced by the encoder INSIDE the worker,
     *    which handles a run that is merely far too slow;
     *  - the AbortSignal is enforced out here on the main thread, which is the
     *    only thing that can save us if the worker DIES (a real risk: the browser
     *    may kill it on an out-of-memory 60 s render on a phone). ffmpeg.wasm
     *    installs no worker.onerror, so without this the promise would never
     *    settle - not resolve, not reject - and the whole app would sit disabled
     *    until the page was reloaded.
     *
     * Aborting only rejects our promise; the worker may still be busy, which is
     * why the catch below terminates the engine outright.
     */
    const timeoutMs = encodeTimeoutMs(seconds);
    const abort = new AbortController();
    const abortTimer = setTimeout(function () { abort.abort(); }, timeoutMs);

    const args = [
      '-loop', '1',
      '-framerate', String(OUT_FPS),
      '-i', inputName,
      '-t', String(seconds),
      '-r', String(OUT_FPS),
      '-vf', buildFilter(fitMode.value, ffmpegColor(bgColor.value)),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'stillimage',
      '-crf', '28',
      '-g', String(OUT_FPS * 10),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-an',
      outputName
    ];

    let exitCode;
    try {
      exitCode = await ffmpeg.exec(args, timeoutMs, { signal: abort.signal });
    } finally {
      clearTimeout(abortTimer);
    }
    if (exitCode !== 0) throw new Error('FFmpeg exited with code ' + exitCode);

    stage('Finalizing MP4…', 97);
    const data = await ffmpeg.readFile(outputName);
    if (!data || !data.length) throw new Error('FFmpeg produced an empty file');

    // Pass the Uint8Array itself, not .buffer, so the blob is exactly these bytes.
    const blob = new Blob([data], { type: 'video/mp4' });
    videoUrl = URL.createObjectURL(blob);

    result.src = videoUrl;
    result.hidden = false;

    downloadBtn.href = videoUrl;
    downloadBtn.download = 'whatsapp-status-' + seconds + 's.mp4';
    downloadBtn.hidden = false;

    metaDuration.textContent = seconds + ' seconds';
    metaResolution.textContent = OUT_WIDTH + ' × ' + OUT_HEIGHT + ' (9:16)';
    metaSize.textContent = formatBytes(blob.size);
    resultMeta.hidden = false;
    emptyResult.hidden = true;

    stage('Complete!', 100);
    // data-done / data-error are the completion signal for our automated
    // end-to-end browser tests. Please do not remove them.
    document.body.dataset.done = '1';
  } catch (error) {
    console.error('Video generation failed:', error);
    if (ffmpegLog.length) console.error('Last FFmpeg output:\n' + ffmpegLog.join('\n'));
    showError(friendlyMessage(error));
    stage('', 0);
    progressArea.hidden = true;
    // The engine may be wedged, half-loaded, or still grinding away on a run we
    // just abandoned, and we cannot tell which from out here. Throw it away so
    // the next click starts from a known-good state. The 32 MB download is in the
    // browser cache by now, so rebuilding costs startup time, not bandwidth.
    await destroyFFmpeg();
  } finally {
    // PRD 22: always clean the virtual file system, even after a failure.
    // deleteFile is attempted unconditionally for the output, because a throw
    // inside exec can still leave a partial output.mp4 behind. If the engine was
    // torn down above, its whole file system went with it and there is nothing
    // left to clean.
    if (ffmpegLoaded()) {
      if (wroteInput) {
        try { await ffmpeg.deleteFile(inputName); } catch (e) { console.error('could not delete ' + inputName, e); }
      }
      try { await ffmpeg.deleteFile(outputName); } catch (e) { console.error('could not delete ' + outputName, e); }
    }
    working = false;
    setControlsDisabled(false);
    createBtn.disabled = !selectedFile;
  }
});

/* ======================================================================
   Start up
   ====================================================================== */

(function init() {
  const missing = missingFeatures();
  if (missing.length) {
    console.error('Missing browser features:', missing.join(', '));
    showError('This browser is missing features this app needs (' + missing.join(', ') +
              '). Please use a recent version of Chrome, Edge or Safari.');
    createBtn.disabled = true;
  }
  window.addEventListener('pagehide', function () {
    releasePreview();
    releaseVideo();
  });
})();
