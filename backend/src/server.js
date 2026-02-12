import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import multer from 'multer';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendUrlsRaw = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3000';
const frontendOrigins = frontendUrlsRaw
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const frontendRedirectUrl = frontendOrigins[0] || 'http://localhost:3000';
const tokenStorePath = path.resolve(projectRoot, process.env.TOKEN_STORE_PATH || './data/oauth-token.json');
const tempUploadDir = path.resolve(projectRoot, process.env.TMP_UPLOAD_DIR || './data/tmp-uploads');
const maxFilesPerUpload = Math.max(1, Math.min(Number(process.env.MAX_FILES_PER_UPLOAD || 20), 50));

const requiredEnv = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];

const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  console.error(`Missing env vars: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const upload = multer({
  dest: tempUploadDir,
  limits: {
    files: maxFilesPerUpload
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith('video/')) {
      cb(new Error(`Unsupported file type for ${file.originalname}. Please upload video files only.`));
      return;
    }
    cb(null, true);
  }
});

app.use(cors({ origin: frontendOrigins }));
app.use(express.json());

async function readSavedTokens() {
  try {
    const raw = await fs.readFile(tokenStorePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function saveTokens(tokens) {
  await fs.mkdir(path.dirname(tokenStorePath), { recursive: true });
  await fs.writeFile(tokenStorePath, JSON.stringify(tokens, null, 2), 'utf8');
}

async function clearTokens() {
  try {
    await fs.unlink(tokenStorePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function deleteTempFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Failed deleting temp file ${filePath}:`, error.message);
    }
  }
}

async function getAuthenticatedYoutubeClient() {
  const tokens = await readSavedTokens();
  if (!tokens) {
    return null;
  }

  oauth2Client.setCredentials(tokens);

  if (tokens.expiry_date && tokens.expiry_date <= Date.now()) {
    const refreshed = await oauth2Client.refreshAccessToken();
    const merged = { ...tokens, ...refreshed.credentials };
    await saveTokens(merged);
    oauth2Client.setCredentials(merged);
  }

  return google.youtube({ version: 'v3', auth: oauth2Client });
}

function getUploadTitleFromFileName(fileName) {
  return path.parse(fileName).name.slice(0, 100) || 'Untitled Upload';
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/auth/url', (_req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.upload'
    ]
  });

  res.json({ url });
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    return res.status(400).send('Missing OAuth code.');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    await saveTokens(tokens);

    return res.redirect(`${frontendRedirectUrl}/?connected=1`);
  } catch (error) {
    console.error('OAuth callback error:', error.message);
    return res.redirect(`${frontendRedirectUrl}/?connected=0`);
  }
});

app.get('/auth/status', async (_req, res) => {
  const tokens = await readSavedTokens();
  res.json({ connected: Boolean(tokens) });
});

app.post('/auth/logout', async (_req, res) => {
  await clearTokens();
  res.json({ success: true });
});

app.get('/api/videos', async (req, res) => {
  const maxResults = Math.min(Number(req.query.maxResults || 25), 50);

  try {
    const youtube = await getAuthenticatedYoutubeClient();

    if (!youtube) {
      return res.status(401).json({ error: 'Not authenticated. Connect YouTube first.' });
    }

    const channelResponse = await youtube.channels.list({
      mine: true,
      part: ['contentDetails', 'snippet']
    });

    const channel = channelResponse.data.items?.[0];
    const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) {
      return res.status(404).json({ error: 'Could not find uploads playlist for this account.' });
    }

    const playlistResponse = await youtube.playlistItems.list({
      playlistId: uploadsPlaylistId,
      part: ['snippet', 'contentDetails'],
      maxResults
    });

    const videos = (playlistResponse.data.items || [])
      .map((item) => ({
        id: item.contentDetails?.videoId,
        title: item.snippet?.title,
        description: item.snippet?.description,
        publishedAt: item.contentDetails?.videoPublishedAt,
        thumbnail:
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url,
        channelTitle: item.snippet?.channelTitle
      }))
      .filter((video) => Boolean(video.id));

    return res.json({
      channel: channel?.snippet?.title || null,
      videos
    });
  } catch (error) {
    console.error('Error fetching videos:', error.message);
    return res.status(500).json({ error: 'Failed to fetch videos from YouTube API.' });
  }
});

app.post('/api/videos/upload', upload.array('videos', maxFilesPerUpload), async (req, res) => {
  const visibility = req.body.visibility === 'public' ? 'public' : 'private';
  const description = (req.body.description || '').slice(0, 5000);
  const files = req.files || [];

  if (!files.length) {
    return res.status(400).json({ error: 'Please select at least one video file to upload.' });
  }

  let youtube;
  try {
    youtube = await getAuthenticatedYoutubeClient();
  } catch (error) {
    console.error('Auth client init failed:', error.message);
    for (const file of files) {
      await deleteTempFile(file.path);
    }
    return res.status(500).json({ error: 'Failed to initialize YouTube client.' });
  }

  if (!youtube) {
    for (const file of files) {
      await deleteTempFile(file.path);
    }
    return res.status(401).json({ error: 'Not authenticated. Connect YouTube first.' });
  }

  const uploaded = [];
  const failed = [];

  for (const file of files) {
    try {
      const title = getUploadTitleFromFileName(file.originalname);
      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title,
            description
          },
          status: {
            privacyStatus: visibility
          }
        },
        media: {
          body: createReadStream(file.path)
        }
      });

      uploaded.push({
        fileName: file.originalname,
        videoId: response.data.id,
        title,
        privacyStatus: visibility
      });
    } catch (error) {
      const reason =
        error?.response?.data?.error?.message ||
        error?.errors?.[0]?.message ||
        error.message ||
        'Unknown upload error';

      failed.push({
        fileName: file.originalname,
        error: reason
      });
    } finally {
      await deleteTempFile(file.path);
    }
  }

  const statusCode = failed.length ? 207 : 200;
  return res.status(statusCode).json({
    uploaded,
    failed,
    summary: {
      total: files.length,
      success: uploaded.length,
      failed: failed.length
    }
  });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  if (error) {
    return res.status(400).json({ error: error.message || 'Upload failed.' });
  }

  return res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(port, async () => {
  await fs.mkdir(path.dirname(tokenStorePath), { recursive: true });
  await fs.mkdir(tempUploadDir, { recursive: true });
  console.log(`Backend listening on http://localhost:${port}`);
});
