# iPhone HTML Viewer

A lightweight, mobile-first web app for previewing HTML files (and related assets) directly in your iPhone's Safari browser — no app install required.

## Features

- **File picker** — select HTML plus any related CSS, JS, images in one go
- **Live preview** — renders the HTML in a sandboxed iframe with linked resources inlined
- **Source viewer** — toggle to see syntax-highlighted raw source for any file
- **Image viewer** — checkerboard background for transparent images
- **File tabs** — switch between all loaded files instantly
- **iOS-optimised** — respects safe areas, smooth scrolling, native fonts
- **Drag & drop** — works on desktop too
- **100% client-side** — nothing is uploaded anywhere

## Usage

### Option A — GitHub Pages (recommended)

1. Fork / clone this repo
2. Enable **GitHub Pages** → Settings → Pages → Branch: `main`, folder: `/ (root)`
3. Open the Pages URL on your iPhone and bookmark it to Home Screen

### Option B — Run locally

```bash
# Python 3
python3 -m http.server 8080

# Node.js
npx serve .
```

Open `http://<your-computer-ip>:8080` on your iPhone (must be on the same Wi-Fi network).

## How to use the app

1. Tap **Choose Files** and select your `.html` file plus any `.css`, `.js`, or image files it depends on.
2. The HTML renders instantly in the preview pane.
3. Tap any **file tab** to switch between loaded files.
4. Tap the **`</>` icon** to toggle between rendered preview and syntax-highlighted source.
5. Tap **`+`** to load additional files into the current session.
6. Tap the **trash icon** to clear everything and start fresh.

> **Tip:** Select all related files at once for correct rendering of linked stylesheets, scripts, and images.

## Browser support

| Browser | Support |
|---------|---------|
| Safari (iOS 15+) | ✅ Full |
| Safari (macOS) | ✅ Full |
| Chrome (Android/Desktop) | ✅ Full |
| Firefox | ✅ Full |

## License

MIT
