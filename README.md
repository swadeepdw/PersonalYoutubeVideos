# Private YouTube App (Next.js + Node.js)

This project gives you a private dashboard that shows your uploaded YouTube videos and lets you upload one or many videos to your channel with `private` or `public` visibility.

- Frontend: Next.js (`frontend`)
- Backend: Node.js + Express (`backend`)
- Auth: Google OAuth2
- YouTube API scopes: `youtube.readonly` + `youtube.upload`

## Local development

### 1. Create Google API credentials

1. Open Google Cloud Console.
2. Create/select a project.
3. Enable YouTube Data API v3.
4. Configure OAuth consent screen.
5. Create OAuth Client ID (Web application).
6. Add authorized redirect URI:
   - `http://localhost:4000/auth/callback`

### 2. Configure env files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Set your values in `backend/.env`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=http://localhost:4000/auth/callback`
- `FRONTEND_URL=http://localhost:3000` (or `3001` if needed)

Set frontend API base in `frontend/.env.local`:

- `NEXT_PUBLIC_API_BASE=http://localhost:4000`

### 3. Install and run

```bash
npm install
npm run dev
```

## Production deployment (recommended split)

- Deploy `frontend` to Vercel
- Deploy `backend` to Railway

This is required because backend handles multipart video uploads and OAuth token storage, which is not a good fit for Vercel serverless.

### A) Deploy backend on Railway

1. In Railway, create a new project and point service root to `backend`.
2. Railway will use `backend/railway.json` and `backend/nixpacks.toml`.
3. Add backend environment variables in Railway:
   - `PORT=4000`
   - `GOOGLE_CLIENT_ID=...`
   - `GOOGLE_CLIENT_SECRET=...`
   - `GOOGLE_REDIRECT_URI=https://<your-railway-domain>/auth/callback`
   - `FRONTEND_URL=https://<your-vercel-domain>`
   - Optional: `FRONTEND_URLS=https://<your-vercel-domain>,https://<your-preview-domain>`
   - Optional: `TOKEN_STORE_PATH=./data/oauth-token.json`
   - Optional: `TMP_UPLOAD_DIR=./data/tmp-uploads`
   - Optional: `MAX_FILES_PER_UPLOAD=20`
4. Deploy and verify:
   - `https://<your-railway-domain>/health`

### B) Deploy frontend on Vercel

1. In Vercel, import this repo and set root directory to `frontend`.
2. Add env variable:
   - `NEXT_PUBLIC_API_BASE=https://<your-railway-domain>`
3. Deploy.

### C) Update Google OAuth redirect

In Google Cloud OAuth client, add production redirect URI:

- `https://<your-railway-domain>/auth/callback`

Also add local URI if you still use local dev:

- `http://localhost:4000/auth/callback`

## App features

- Connect/disconnect YouTube OAuth
- View uploaded videos from your channel
- Upload single or bulk videos
- Choose visibility per upload batch (`private` or `public`)
- Responsive UI for desktop and mobile

## API endpoints

- `GET /health`
- `GET /auth/url`
- `GET /auth/callback`
- `GET /auth/status`
- `POST /auth/logout`
- `GET /api/videos`
- `POST /api/videos/upload` (multipart field name: `videos`)

## Important notes

- If you connected before upload support was added, disconnect and reconnect once to grant `youtube.upload`.
- Uploaded files are temporarily staged and then deleted after each upload attempt.
- Keep this app private unless you add real app-level authentication.
# PersonalYoutubeVideos
