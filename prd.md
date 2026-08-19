Build a complete, production-ready static web application called "Image to WhatsApp Status Video".

IMPORTANT:
- This must be a 100% client-side application.
- No backend.
- No database.
- No user image should be uploaded to any server.
- The application must be deployable directly to GitHub Pages.
- Use JavaScript/HTML/CSS.
- Use FFmpeg WebAssembly in the browser to generate MP4.
- Do not require Node.js or a server at runtime.
- Keep the project simple enough that I can upload the files directly to a GitHub repository.

## MAIN PURPOSE

The user uploads ONE image and the application generates a silent MP4 video from that image.

The generated video should be suitable for uploading to WhatsApp Status.

The image should remain visible for the entire selected duration.

There should be NO music and NO audio track.

## REQUIRED FEATURES

### 1. Image Upload

Create a beautiful upload area.

Support:
- JPG
- JPEG
- PNG
- WEBP

The user should be able to:
- Click "Choose Image"
- Drag and drop an image
- See an image preview after selection
- Replace the selected image

Show a friendly error for unsupported files.

Maximum recommended file size: 20 MB.

### 2. WhatsApp Status Format

The primary output must be vertical:

1080 × 1920 pixels
Aspect ratio: 9:16

The image must NOT be distorted.

If the image aspect ratio is different:
- Preserve the original aspect ratio.
- Fit the image inside the 1080×1920 canvas.
- Fill the remaining area with a configurable background.
- Default background should be black.

Do NOT stretch or distort the image.

### 3. Duration

Provide a simple duration selector:

- 15 seconds
- 30 seconds
- 60 seconds

Default:
60 seconds

Also make the UI clearly show:

"Video Duration"

### 4. Generate Video

Add a large primary button:

"Create Video"

When clicked:

1. Validate that an image has been selected.
2. Load FFmpeg WebAssembly if it is not already loaded.
3. Show a loading/progress UI.
4. Convert the image into a silent MP4.
5. Keep the image visible for the complete selected duration.
6. Use H.264 video encoding.
7. Use yuv420p pixel format for broad compatibility.
8. Do not include an audio stream.
9. Produce a standard MP4 file.

Recommended output:
- Resolution: 1080x1920
- FPS: 30
- Codec: H.264 / libx264
- Pixel format: yuv420p
- No audio
- Fast-start MP4 if possible

### 5. Preview

After generation:

Show:
- Generated video preview
- Video controls
- Duration
- Resolution
- File size

The user should be able to play the video directly in the browser.

### 6. Download

Add a large green button:

"Download MP4"

Filename should be something like:

whatsapp-status-60s.mp4

For different durations:

whatsapp-status-15s.mp4
whatsapp-status-30s.mp4
whatsapp-status-60s.mp4

### 7. Progress UI

Video generation can take time, especially on mobile.

Create a proper progress UI.

Example:

Preparing...
Loading video engine...
Processing image...
Generating video...
Finalizing MP4...
Complete!

Show a percentage where possible.

Do not freeze the UI.

Disable the Create Video button while processing.

### 8. Mobile-first UI

The application will primarily be used on Android phones.

Make the UI responsive.

It should work well on:
- Android Chrome
- iPhone Safari
- Desktop Chrome
- Edge
- Firefox where FFmpeg WebAssembly is supported

Use a clean modern design.

Avoid unnecessary complexity.

The main screen should contain:

Title:
"Image to WhatsApp Video"

Subtitle:
"Turn any photo into a silent WhatsApp Status video"

Then:

[ Upload Image ]

Image preview

Duration:
[ 15 sec ] [ 30 sec ] [ 60 sec ]

[ Create Video ]

Progress

Video preview

[ Download MP4 ]

### 9. Privacy Message

Show a small privacy message:

"Your image is processed in your browser and is not uploaded to a server."

Make sure this statement is actually true based on the implementation.

### 10. FFmpeg WebAssembly

Use FFmpeg WebAssembly.

Prefer a stable browser-compatible FFmpeg WebAssembly package/version.

If using CDN assets, make the CDN dependency explicit in the code.

Do not create a backend API.

The conversion must happen entirely in the browser.

Important:
- Handle FFmpeg initialization only once.
- Reuse the FFmpeg instance for subsequent conversions.
- Clean up temporary FFmpeg files after each conversion.
- Release object URLs when they are no longer needed.
- Prevent memory leaks.

### 11. Error Handling

Handle:

- No image selected
- Unsupported image
- Image too large
- FFmpeg failed to load
- Browser does not support required APIs
- Video generation failure
- Out-of-memory errors where possible

Show user-friendly error messages.

Do not expose raw technical errors to normal users.

However, log useful errors to console for debugging.

### 12. Browser Compatibility

Before starting conversion, check support for:

- WebAssembly
- Media/file APIs required by FFmpeg
- Blob
- URL.createObjectURL

If unsupported, show a clear message recommending Chrome/Edge/Safari.

### 13. GitHub Pages Compatibility

The final project must work when hosted from a GitHub Pages subpath.

Do NOT assume the site is hosted at `/`.

Avoid absolute asset paths such as:

/script.js
/style.css

Use relative paths:

./script.js
./style.css

The application must work from:

https://USERNAME.github.io/REPOSITORY/

### 14. Project Structure

Create a simple structure:

image-to-whatsapp-video/
│
├── index.html
├── style.css
├── script.js
├── README.md
└── .gitignore

If additional files are genuinely necessary, explain why.

Do not introduce a frontend framework unless there is a strong reason.

Prefer vanilla HTML/CSS/JavaScript.

### 15. UI Design

Use a modern, clean interface.

Requirements:
- Rounded cards
- Large buttons
- Clear typography
- Mobile-friendly spacing
- Accessible labels
- Good contrast
- Nice upload area
- Clear success/error states

Do not make it overly complicated.

The user should understand how to use it immediately.

### 16. Optional Image Controls

If easy to implement without making the application complicated, add:

- Fit
- Cover

Default should be "Fit".

But the image must always remain undistorted.

Do not add unnecessary image editing features.

### 17. Output Quality

Prioritize WhatsApp compatibility.

The output should be:

MP4
H.264
yuv420p
1080x1920
30 FPS
No audio

Do not create a huge unnecessarily high-bitrate file.

Use a reasonable video bitrate to keep the file size manageable.

### 18. Important FFmpeg Requirement

Because the source is only one image, do not create unnecessary intermediate video files if FFmpeg can directly generate the video efficiently.

A command conceptually similar to:

-loop 1 -i image.jpg -t 60 -vf "..." -r 30 -c:v libx264 -pix_fmt yuv420p -an output.mp4

can be used, but adapt it correctly for the chosen FFmpeg WebAssembly version.

Make sure the final MP4 actually contains no audio stream.

### 19. Security

Do not use:
- User authentication
- Cookies
- Analytics
- Tracking
- External image uploads
- Backend APIs

Do not send user images anywhere.

Only download the required FFmpeg WebAssembly assets from the selected CDN.

### 20. README

Create a detailed README.md explaining:

1. What the project does
2. Features
3. How it works
4. How FFmpeg WebAssembly is used
5. How to run locally
6. How to deploy to GitHub Pages
7. GitHub Pages configuration
8. Browser compatibility
9. Privacy
10. Known limitations

Include exact GitHub Pages deployment steps.

Example:

GitHub repository
→ Settings
→ Pages
→ Build and deployment
→ Deploy from a branch
→ main
→ / (root)
→ Save

### 21. Testing

Before finishing:

- Test image upload.
- Test JPG.
- Test PNG.
- Test WEBP if supported.
- Test 15 sec.
- Test 30 sec.
- Test 60 sec.
- Verify generated file is MP4.
- Verify video resolution is 1080x1920.
- Verify there is NO audio stream.
- Verify video duration.
- Verify download works.
- Verify page works from a GitHub Pages subpath.
- Test responsive layout.
- Check browser console for errors.

If you have access to FFmpeg CLI locally, use ffprobe or equivalent to verify:

- codec = h264
- width = 1080
- height = 1920
- duration approximately equals selected duration
- audio streams = 0

### 22. Important Performance Consideration

FFmpeg WebAssembly can use significant RAM.

Design the application so that:
- Temporary files are deleted.
- Object URLs are revoked.
- FFmpeg instance is reused.
- Large unnecessary copies of the image/video are avoided.
- UI remains responsive as much as reasonably possible.

For mobile devices, show a message:

"Video creation may take a little longer on mobile devices."

### 23. Final Deliverables

Do NOT just explain how to build it.

Actually create the complete project files.

At the end provide:

1. Complete project structure.
2. Full source code for every file.
3. Exact commands to run it locally.
4. Exact Git commands to push it to GitHub.
5. Exact GitHub Pages deployment instructions.
6. Any limitations or browser compatibility issues.

Before finishing, inspect all files and make sure there are no missing references, broken paths, syntax errors, or placeholder code.

The final application should be ready for me to copy into a GitHub repository and deploy.