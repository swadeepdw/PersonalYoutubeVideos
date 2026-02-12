'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function VideoDashboard() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState([]);
  const [channelName, setChannelName] = useState('');
  const [error, setError] = useState('');

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [visibility, setVisibility] = useState('private');
  const [uploading, setUploading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);
  const fileInputRef = useRef(null);

  const queryConnected = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const url = new URL(window.location.href);
    return url.searchParams.get('connected');
  }, []);

  async function checkStatusAndLoad() {
    setLoading(true);
    setError('');

    try {
      const statusRes = await fetch(`${apiBase}/auth/status`);
      const status = await statusRes.json();
      setConnected(Boolean(status.connected));

      if (status.connected) {
        const videosRes = await fetch(`${apiBase}/api/videos`);
        if (!videosRes.ok) {
          const payload = await videosRes.json();
          throw new Error(payload.error || 'Failed to load videos');
        }
        const payload = await videosRes.json();
        setVideos(payload.videos || []);
        setChannelName(payload.channel || '');
      } else {
        setVideos([]);
        setChannelName('');
      }
    } catch (err) {
      setError(err.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkStatusAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (queryConnected === '1') {
      checkStatusAndLoad();
      const url = new URL(window.location.href);
      url.searchParams.delete('connected');
      window.history.replaceState({}, '', url.toString());
    }
    if (queryConnected === '0') {
      setError('YouTube connection failed. Try again.');
      const url = new URL(window.location.href);
      url.searchParams.delete('connected');
      window.history.replaceState({}, '', url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryConnected]);

  async function connectYoutube() {
    try {
      const res = await fetch(`${apiBase}/auth/url`);
      const data = await res.json();
      window.location.href = data.url;
    } catch {
      setError('Could not start YouTube OAuth flow.');
    }
  }

  async function disconnectYoutube() {
    await fetch(`${apiBase}/auth/logout`, { method: 'POST' });
    setConnected(false);
    setVideos([]);
    setChannelName('');
    setSelectedFiles([]);
    setUploadSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function onSelectFiles(event) {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
    setUploadSummary(null);
  }

  async function uploadVideos() {
    if (!selectedFiles.length || uploading) return;

    setUploading(true);
    setError('');
    setUploadSummary(null);

    try {
      const formData = new FormData();
      formData.append('visibility', visibility);
      for (const file of selectedFiles) {
        formData.append('videos', file);
      }

      const response = await fetch(`${apiBase}/api/videos/upload`, {
        method: 'POST',
        body: formData
      });

      const payload = await response.json();

      if (!response.ok && response.status !== 207) {
        throw new Error(payload.error || 'Upload failed');
      }

      setUploadSummary(payload);
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      await checkStatusAndLoad();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="page">
      <div className="topBar">
        <h1>Private YouTube Dashboard</h1>
        <div className="actions">
          {!connected ? (
            <button className="primary" onClick={connectYoutube}>Connect YouTube</button>
          ) : (
            <button className="secondary" onClick={disconnectYoutube}>Disconnect</button>
          )}
        </div>
      </div>

      {loading && <p className="infoText">Loading...</p>}
      {error && <p className="errorText">{error}</p>}
      {!loading && connected && channelName && (
        <p className="infoText">Channel: <strong>{channelName}</strong></p>
      )}

      {connected && (
        <section className="uploadBox">
          <h2>Upload Videos</h2>
          <p className="infoText">Select one or more videos and choose visibility for this batch.</p>

          <input
            ref={fileInputRef}
            className="fileInput"
            type="file"
            accept="video/*"
            multiple
            onChange={onSelectFiles}
          />

          <div className="uploadControls">
            <label htmlFor="visibility">Visibility</label>
            <select
              id="visibility"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value)}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>

            <button
              className="primary"
              onClick={uploadVideos}
              disabled={!selectedFiles.length || uploading}
            >
              {uploading ? 'Uploading...' : `Upload ${selectedFiles.length || ''} Video${selectedFiles.length === 1 ? '' : 's'}`}
            </button>
          </div>

          {selectedFiles.length > 0 && (
            <ul className="fileList">
              {selectedFiles.map((file) => (
                <li key={`${file.name}-${file.lastModified}`}>
                  {file.name}
                </li>
              ))}
            </ul>
          )}

          {uploadSummary && (
            <div className="uploadSummary">
              <p className="infoText">
                Uploaded {uploadSummary.summary?.success || 0} / {uploadSummary.summary?.total || 0} videos.
              </p>
              {(uploadSummary.failed || []).length > 0 && (
                <ul className="errorList">
                  {uploadSummary.failed.map((item) => (
                    <li key={item.fileName}>
                      {item.fileName}: {item.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {!loading && connected && videos.length === 0 && !error && (
        <p className="infoText">No uploaded videos found.</p>
      )}

      <section className="cardGrid">
        {videos.map((video) => (
          <article key={video.id} className="videoCard">
            <a
              href={`https://www.youtube.com/watch?v=${video.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <img src={video.thumbnail} alt={video.title || 'Video thumbnail'} />
            </a>
            <div className="videoMeta">
              <h2 className="videoTitle">{video.title}</h2>
              <p className="videoDate">
                {video.publishedAt ? new Date(video.publishedAt).toLocaleDateString() : 'Unknown date'}
              </p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
