# Lila's Adventure

Lila's Adventure is a Vite + React game app. It is configured as a PWA, so users can install it from the browser on desktop and mobile.

## Run locally

```bash
npm install
npm run dev
```

## Build for production

```bash
npm run build
npm run preview
```

## Publish as a web app (recommended first step)

### Option A: Vercel (quickest)

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```
2. Deploy from the project folder:
   ```bash
   vercel
   ```
3. For production deploys:
   ```bash
   vercel --prod
   ```

Framework settings are auto-detected for Vite:
- Build command: `npm run build`
- Output directory: `dist`

### Option B: Netlify

1. Install Netlify CLI:
   ```bash
   npm i -g netlify-cli
   ```
2. Deploy:
   ```bash
   netlify deploy
   ```
3. Production deploy:
   ```bash
   netlify deploy --prod
   ```

Use:
- Build command: `npm run build`
- Publish directory: `dist`

## Install on phone/desktop

After deployment, open the site and use the browser's install prompt:
- Chrome/Edge desktop: "Install app" in address bar.
- Android Chrome: "Add to Home screen".
- iOS Safari: Share -> "Add to Home Screen".
