"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const GALLERY_GAP = 18;
const MOBILE_BREAKPOINT = 720;
const TABLET_BREAKPOINT = 1180;
const VIRTUAL_OVERSCAN_ROWS = 3;
const THEME_STORAGE_KEY = "yt-dashboard-theme";
const PROCESSING_POLL_INTERVAL_MS = 5000;
const PROCESSING_MAX_POLLS = 72;
const PRIVACY_FILTERS = ["all", "private", "unlisted", "public"];
const CANCELLED_UPLOAD_ERROR = "__UPLOAD_CANCELLED__";

function getColumnCount(width) {
  if (width <= 520) return 3;
  if (width <= MOBILE_BREAKPOINT) return 3;
  if (width <= TABLET_BREAKPOINT) return 4;
  if (width <= 1380) return 5;
  return 6;
}

function buildWatchHref(video, scrollTop, filter) {
  const params = new URLSearchParams();
  if (video.title) params.set("title", video.title);
  if (video.description) params.set("description", video.description);
  if (video.publishedAt) params.set("publishedAt", video.publishedAt);
  if (video.channelTitle) params.set("channelTitle", video.channelTitle);
  if (video.privacyStatus) params.set("privacy", video.privacyStatus);
  params.set("fromScroll", String(Math.max(0, Math.floor(scrollTop || 0))));
  params.set("fromFilter", filter || "all");
  return `/watch/${video.id}?${params.toString()}`;
}

function getInitialQueryState() {
  if (typeof window === "undefined") {
    return { view: null, filter: null, scroll: null, connected: null };
  }

  const url = new URL(window.location.href);
  return {
    view: url.searchParams.get("view"),
    filter: url.searchParams.get("filter"),
    scroll: url.searchParams.get("scroll"),
    connected: url.searchParams.get("connected"),
  };
}

export default function VideoDashboard() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState([]);
  const [channelName, setChannelName] = useState("");
  const [channelAvatar, setChannelAvatar] = useState("");
  const [error, setError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [visibility, setVisibility] = useState("unlisted");
  const [privacyFilter, setPrivacyFilter] = useState("all");
  const [viewMode, setViewMode] = useState("gallery");
  const [uploading, setUploading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [theme, setTheme] = useState("dark");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [galleryMetrics, setGalleryMetrics] = useState({ width: 0, height: 0 });
  const [galleryScrollTop, setGalleryScrollTop] = useState(0);
  const [pendingRestoreScroll, setPendingRestoreScroll] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({
    active: false,
    phase: "idle",
    total: 0,
    completed: 0,
    pending: 0,
    failed: 0,
    ready: 0,
    processing: 0,
    currentFile: "",
    currentPercent: 0,
    overallPercent: 0,
  });

  const fileInputRef = useRef(null);
  const galleryShellRef = useRef(null);
  const galleryScrollRef = useRef(null);
  const profileMenuRef = useRef(null);
  const activeUploadRequestRef = useRef(null);
  const uploadCancelledRef = useRef(false);

  const queryState = useMemo(() => getInitialQueryState(), []);

  async function checkStatusAndLoad() {
    setLoading(true);
    setError("");

    try {
      const statusRes = await fetch(`${apiBase}/auth/status`);
      if (!statusRes.ok) {
        throw new Error("Failed to check YouTube connection.");
      }
      const status = await statusRes.json();
      setConnected(Boolean(status.connected));
      setChannelName(status.channelName || "");
      setChannelAvatar(status.channelAvatar || "");

      if (status.connected) {
        const videosRes = await fetch(`${apiBase}/api/videos`);
        if (!videosRes.ok) {
          const payload = await videosRes.json();
          throw new Error(payload.error || "Failed to load videos");
        }
        const payload = await videosRes.json();
        setVideos(payload.videos || []);
        setChannelName(payload.channel || status.channelName || "");
        setChannelAvatar(payload.channelAvatar || status.channelAvatar || "");
      } else {
        setVideos([]);
        setChannelName("");
        setChannelAvatar("");
      }
    } catch (err) {
      setError(err.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (queryState.view === "upload" || queryState.view === "gallery") {
      setViewMode(queryState.view);
    }

    if (
      queryState.filter &&
      PRIVACY_FILTERS.includes(queryState.filter.toLowerCase())
    ) {
      setPrivacyFilter(queryState.filter.toLowerCase());
    }

    if (queryState.scroll && !Number.isNaN(Number(queryState.scroll))) {
      setPendingRestoreScroll(Math.max(0, Number(queryState.scroll)));
    }
  }, [queryState]);

  useEffect(() => {
    checkStatusAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persistedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const resolvedTheme = persistedTheme === "light" ? "light" : "dark";
    setTheme(resolvedTheme);
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (queryState.connected === "1") {
      checkStatusAndLoad();
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      window.history.replaceState({}, "", url.toString());
    }
    if (queryState.connected === "0") {
      setError("YouTube connection failed. Try again.");
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryState.connected]);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;

    function handleOutsideClick(event) {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [profileMenuOpen]);

  useEffect(() => {
    const galleryElement = galleryScrollRef.current;
    if (!galleryElement) return undefined;

    const onScroll = () => setGalleryScrollTop(galleryElement.scrollTop);
    onScroll();
    galleryElement.addEventListener("scroll", onScroll, { passive: true });

    return () => galleryElement.removeEventListener("scroll", onScroll);
  }, [viewMode, privacyFilter, connected]);

  useEffect(() => {
    if (!galleryShellRef.current || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const measure = () => {
      const width = galleryShellRef.current?.clientWidth || 0;
      const height = galleryScrollRef.current?.clientHeight || 0;
      setGalleryMetrics({ width, height });
    };

    const observer = new ResizeObserver(() => measure());
    observer.observe(galleryShellRef.current);
    if (galleryScrollRef.current) observer.observe(galleryScrollRef.current);

    const frame = requestAnimationFrame(measure);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [viewMode, connected, privacyFilter, videos.length]);

  useEffect(() => {
    if (!connected || viewMode !== "gallery") return;
    const frame = requestAnimationFrame(() => {
      if (galleryScrollRef.current && pendingRestoreScroll !== null) {
        galleryScrollRef.current.scrollTop = pendingRestoreScroll;
        setPendingRestoreScroll(null);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [connected, viewMode, pendingRestoreScroll, privacyFilter]);

  async function connectYoutube() {
    try {
      const res = await fetch(`${apiBase}/auth/url`);
      const data = await res.json();
      window.location.href = data.url;
    } catch {
      setError("Could not start YouTube OAuth flow.");
    }
  }

  async function disconnectYoutube() {
    await fetch(`${apiBase}/auth/logout`, { method: "POST" });
    setConnected(false);
    setProfileMenuOpen(false);
    setViewMode("gallery");
    setVideos([]);
    setChannelName("");
    setChannelAvatar("");
    setSelectedFiles([]);
    setUploadSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function onSelectFiles(event) {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
    setUploadSummary(null);
  }

  function resetUploadForm() {
    if (activeUploadRequestRef.current) {
      activeUploadRequestRef.current.abort();
      activeUploadRequestRef.current = null;
    }
    uploadCancelledRef.current = false;
    setUploading(false);
    setUploadSummary(null);
    setSelectedFiles([]);
    setUploadProgress((previous) => ({
      ...previous,
      active: false,
      phase: "idle",
      currentFile: "",
      currentPercent: 0,
      overallPercent: 0,
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function cancelUpload() {
    if (uploading) {
      uploadCancelledRef.current = true;
      if (activeUploadRequestRef.current) {
        activeUploadRequestRef.current.abort();
      }
      setError("Upload cancelled.");
      return;
    }
    resetUploadForm();
  }

  function toggleTheme() {
    setTheme((previous) => (previous === "dark" ? "light" : "dark"));
  }

  async function pollProcessingStatus(videoIds) {
    if (!videoIds.length) return;

    for (let attempt = 0; attempt < PROCESSING_MAX_POLLS; attempt += 1) {
      const response = await fetch(
        `${apiBase}/api/videos/processing-status?videoIds=${videoIds.join(",")}`
      );
      if (!response.ok) {
        throw new Error("Failed to check YouTube processing status.");
      }

      const payload = await response.json();
      const summary = payload.summary || {};
      const total = summary.total || videoIds.length;
      const ready = summary.ready || 0;
      const processing = summary.processing || 0;
      const overallPercent = Math.round((ready / Math.max(total, 1)) * 100);

      setUploadProgress((previous) => ({
        ...previous,
        active: processing > 0,
        phase: processing > 0 ? "processing" : "done",
        ready,
        processing,
        overallPercent,
      }));

      if (processing === 0) return;
      await new Promise((resolve) =>
        setTimeout(resolve, PROCESSING_POLL_INTERVAL_MS)
      );
    }
  }

  async function uploadVideos() {
    if (!selectedFiles.length || uploading) return;

    uploadCancelledRef.current = false;
    setUploading(true);
    setError("");
    setUploadSummary(null);
    setUploadProgress({
      active: true,
      phase: "uploading",
      total: selectedFiles.length,
      completed: 0,
      pending: selectedFiles.length,
      failed: 0,
      ready: 0,
      processing: selectedFiles.length,
      currentFile: selectedFiles[0]?.name || "",
      currentPercent: 0,
      overallPercent: 0,
    });

    try {
      const failures = [];
      const successes = [];

      const uploadSingleFile = (file, completedCount, failedCount) =>
        new Promise((resolve, reject) => {
          const formData = new FormData();
          formData.append("visibility", visibility);
          formData.append("videos", file);

          const xhr = new XMLHttpRequest();
          activeUploadRequestRef.current = xhr;
          xhr.open("POST", `${apiBase}/api/videos/upload`);

          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const currentPercent = Math.round(
              (event.loaded / event.total) * 100
            );
            const overallPercent = Math.round(
              ((completedCount + failedCount + event.loaded / event.total) /
                selectedFiles.length) *
                100
            );
            setUploadProgress((previous) => ({
              ...previous,
              currentFile: file.name,
              currentPercent,
              overallPercent,
            }));
          };

          xhr.onload = () => {
            if (activeUploadRequestRef.current === xhr) {
              activeUploadRequestRef.current = null;
            }
            let payload = {};
            try {
              payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
            } catch {
              payload = {};
            }

            if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 207) {
              resolve(payload);
              return;
            }

            reject(new Error(payload.error || `${file.name}: upload failed`));
          };

          xhr.onerror = () => {
            if (activeUploadRequestRef.current === xhr) {
              activeUploadRequestRef.current = null;
            }
            reject(new Error(`${file.name}: network error`));
          };

          xhr.onabort = () => {
            if (activeUploadRequestRef.current === xhr) {
              activeUploadRequestRef.current = null;
            }
            reject(new Error(CANCELLED_UPLOAD_ERROR));
          };

          xhr.send(formData);
        });

      for (let index = 0; index < selectedFiles.length; index += 1) {
        if (uploadCancelledRef.current) {
          throw new Error(CANCELLED_UPLOAD_ERROR);
        }

        const file = selectedFiles[index];
        const completedCount = successes.length;
        const failedCount = failures.length;
        try {
          const payload = await uploadSingleFile(
            file,
            completedCount,
            failedCount
          );
          const successItems = payload.uploaded || [];
          if (successItems.length > 0) {
            successes.push(...successItems);
          } else {
            successes.push({
              fileName: file.name,
              id: payload.summary?.firstVideoId || null,
            });
          }
        } catch (singleError) {
          if (singleError.message === CANCELLED_UPLOAD_ERROR) {
            throw singleError;
          }
          failures.push({
            fileName: file.name,
            error: singleError.message || "Upload failed",
          });
        }

        const updatedCompleted = successes.length;
        const updatedFailed = failures.length;
        const pending = Math.max(
          0,
          selectedFiles.length - updatedCompleted - updatedFailed
        );
        const overallPercent = Math.round(
          ((updatedCompleted + updatedFailed) / selectedFiles.length) * 100
        );

        setUploadProgress((previous) => ({
          ...previous,
          phase: "uploading",
          completed: updatedCompleted,
          failed: updatedFailed,
          pending,
          currentPercent: 100,
          overallPercent,
          currentFile:
            pending > 0 ? selectedFiles[index + 1]?.name || "" : file.name,
        }));
      }

      const summaryPayload = {
        summary: {
          success: successes.length,
          total: selectedFiles.length,
        },
        uploaded: successes,
        failed: failures,
      };
      const uploadedVideoIds = successes
        .map((item) => item.videoId)
        .filter(Boolean);

      setUploadSummary(summaryPayload);
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await checkStatusAndLoad();
      if (uploadedVideoIds.length > 0) {
        setUploadProgress((previous) => ({
          ...previous,
          active: true,
          phase: "processing",
          processing: uploadedVideoIds.length,
          ready: 0,
          currentFile: "YouTube Studio processing",
          currentPercent: 100,
          overallPercent: 0,
        }));
        await pollProcessingStatus(uploadedVideoIds);
      }
    } catch (err) {
      if (err.message === CANCELLED_UPLOAD_ERROR) {
        setError("Upload cancelled.");
        return;
      }
      setError(err.message || "Upload failed");
    } finally {
      activeUploadRequestRef.current = null;
      setUploadProgress((previous) => ({
        ...previous,
        active: false,
      }));
      setUploading(false);
      uploadCancelledRef.current = false;
    }
  }

  const filteredVideos = useMemo(
    () =>
      videos.filter((video) =>
        privacyFilter === "all"
          ? true
          : (video.privacyStatus || "private") === privacyFilter
      ),
    [privacyFilter, videos]
  );

  const columns = getColumnCount(galleryMetrics.width || 1200);
  const isCompactMobile =
    (galleryMetrics.width || 0) > 0 &&
    galleryMetrics.width <= MOBILE_BREAKPOINT;
  const tileSize =
    galleryMetrics.width > 0
      ? Math.max(
          96,
          Math.floor(
            (galleryMetrics.width - GALLERY_GAP * (columns - 1)) / columns
          )
        )
      : 0;
  const metaHeight = isCompactMobile ? 0 : 74;
  const rowHeight = tileSize + metaHeight + 18;
  const totalRows = tileSize ? Math.ceil(filteredVideos.length / columns) : 0;
  const startRow = rowHeight
    ? Math.max(
        0,
        Math.floor(galleryScrollTop / rowHeight) - VIRTUAL_OVERSCAN_ROWS
      )
    : 0;
  const visibleRows =
    rowHeight && galleryMetrics.height
      ? Math.ceil(galleryMetrics.height / rowHeight) + VIRTUAL_OVERSCAN_ROWS * 2
      : totalRows;
  const endRow = Math.min(totalRows, startRow + visibleRows);
  const startIndex = startRow * columns;
  const endIndex = Math.min(filteredVideos.length, endRow * columns);
  const visibleVideos = filteredVideos.slice(startIndex, endIndex);
  const virtualHeight = totalRows * rowHeight;
  const profileInitial = channelName
    ? channelName.charAt(0).toUpperCase()
    : "Y";

  return (
    <>
      <header className="globalHeader">
        <div className="headerInner">
          <div className="headlineBlock">
            <h1>Studio Gallery</h1>
          </div>
          <div className="actions">
            {connected && (
              <button
                className="mobileUploadCta"
                type="button"
                onClick={() =>
                  setViewMode((current) =>
                    current === "gallery" ? "upload" : "gallery"
                  )
                }
              >
                {viewMode === "gallery" ? "Upload" : "Gallery"}
              </button>
            )}
            {!connected ? (
              <button className="primary" onClick={connectYoutube}>
                Login
              </button>
            ) : (
              <div className="profileMenuWrap" ref={profileMenuRef}>
                <button
                  type="button"
                  className="profileButton"
                  onClick={() => setProfileMenuOpen((current) => !current)}
                >
                  {channelAvatar ? (
                    <img
                      src={channelAvatar}
                      alt={channelName || "YouTube profile"}
                    />
                  ) : (
                    <span className="profileFallback">{profileInitial}</span>
                  )}
                  <span className="profileName">
                    {channelName || "YouTube"}
                  </span>
                  <span className="profileCaret">▾</span>
                </button>
                {profileMenuOpen && (
                  <div className="profileDropdown">
                    <div className="profileSummary">
                      {channelAvatar ? (
                        <img
                          src={channelAvatar}
                          alt={channelName || "YouTube profile"}
                        />
                      ) : (
                        <span className="profileFallback large">
                          {profileInitial}
                        </span>
                      )}
                      <div>
                        <p>{channelName || "YouTube"}</p>
                        <span>{connected ? "Connected" : "Disconnected"}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="dropdownAction danger"
                      onClick={disconnectYoutube}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              className="themeToggle"
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </div>
      </header>

      <main
        className={`page ${
          viewMode === "gallery" ? "galleryPage" : "uploadPage"
        }`}
      >
        {loading && <p className="infoText">Loading...</p>}
        {error && <p className="errorText">{error}</p>}

        {connected && viewMode === "upload" && (
          <section className="uploadBox uploadPageBox">
            <div className="uploadHeader">
              <div>
                <p className="eyebrow">Upload</p>
                <h2>Drop New Clips</h2>
                <p className="infoText">
                  Batch upload straight into your channel with one visibility
                  setting.
                </p>
              </div>
              <div className="uploadActionRow">
                <button
                  className="primary"
                  onClick={uploadVideos}
                  disabled={!selectedFiles.length || uploading}
                >
                  {uploading
                    ? "Uploading..."
                    : `Upload ${selectedFiles.length || ""} Video${
                        selectedFiles.length === 1 ? "" : "s"
                      }`}
                </button>
                <button
                  className="secondaryGhost"
                  type="button"
                  onClick={cancelUpload}
                  disabled={
                    !uploading && !selectedFiles.length && !uploadSummary
                  }
                >
                  Cancel
                </button>
              </div>
            </div>

            <div className="uploadControls">
              <label className="filePicker" htmlFor="gallery-upload-input">
                <span>Select Videos</span>
                <span className="subtleText">
                  {selectedFiles.length > 0
                    ? `${selectedFiles.length} selected`
                    : "MP4, MOV, WebM"}
                </span>
              </label>
              <input
                ref={fileInputRef}
                id="gallery-upload-input"
                className="fileInput"
                type="file"
                accept="video/*"
                multiple
                onChange={onSelectFiles}
              />
              <div className="visibilityBox">
                <p>Save or publish</p>
                <div
                  className="visibilityChoices"
                  role="radiogroup"
                  aria-label="Video visibility"
                >
                  {[
                    ["private", "Private"],
                    ["unlisted", "Unlisted"],
                    ["public", "Public"],
                  ].map(([value, label]) => (
                    <label key={value} className="visibilityOption">
                      <input
                        type="radio"
                        name="visibility"
                        value={value}
                        checked={visibility === value}
                        onChange={(event) => setVisibility(event.target.value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {(uploading || uploadProgress.phase === "processing") && (
              <div className="uploadProgress3d" aria-live="polite">
                <div className="progressTop">
                  <p className="progressTitle">
                    {uploadProgress.phase === "processing"
                      ? `Processing ${uploadProgress.total} video${
                          uploadProgress.total === 1 ? "" : "s"
                        }`
                      : `Uploading ${uploadProgress.total} video${
                          uploadProgress.total === 1 ? "" : "s"
                        }`}
                  </p>
                  <p className="progressPercent">
                    {uploadProgress.overallPercent}%
                  </p>
                </div>
                <div className="progressBarOuter">
                  <div
                    className="progressBarInner"
                    style={{ width: `${uploadProgress.overallPercent}%` }}
                  />
                </div>
                <div className="progressStats">
                  <p>Completed: {uploadProgress.completed}</p>
                  <p>Pending: {uploadProgress.pending}</p>
                  <p>Failed: {uploadProgress.failed}</p>
                  {uploadProgress.phase === "processing" && (
                    <>
                      <p>Ready: {uploadProgress.ready}</p>
                      <p>Processing: {uploadProgress.processing}</p>
                    </>
                  )}
                </div>
                <p className="subtleText">
                  {uploadProgress.phase === "processing"
                    ? `YouTube status: processing (${uploadProgress.processing} pending)`
                    : `Current: ${
                        uploadProgress.currentFile || "Preparing..."
                      } (${uploadProgress.currentPercent}%)`}
                </p>
              </div>
            )}

            {selectedFiles.length > 0 && (
              <ul className="fileList">
                {selectedFiles.map((file) => (
                  <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
                ))}
              </ul>
            )}

            {uploadSummary && (
              <div className="uploadSummary">
                <p className="infoText">
                  Uploaded {uploadSummary.summary?.success || 0} /{" "}
                  {uploadSummary.summary?.total || 0} videos.
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

        {!loading &&
          connected &&
          videos.length === 0 &&
          !error &&
          viewMode === "gallery" && (
            <p className="infoText">No uploaded videos found.</p>
          )}

        {viewMode === "gallery" && (
          <section className="galleryShell galleryShellFixed">
            <div className="galleryHeader galleryHeaderSticky">
              <h2>{filteredVideos.length} Videos</h2>
              <div className="galleryHeaderRight">
                <div
                  className="filterBar"
                  role="tablist"
                  aria-label="Privacy filter"
                >
                  {PRIVACY_FILTERS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`filterChip ${
                        privacyFilter === value ? "active" : ""
                      }`}
                      onClick={() => setPrivacyFilter(value)}
                    >
                      {value === "all"
                        ? "All"
                        : `${value[0].toUpperCase()}${value.slice(1)}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div
              ref={galleryScrollRef}
              className="virtualGallery galleryScrollPane"
            >
              {filteredVideos.length === 0 ? (
                <div className="emptyGalleryState">
                  <p>No videos match this filter.</p>
                </div>
              ) : (
                <div ref={galleryShellRef} className="galleryMeasureWrap">
                  <div
                    className="virtualCanvas"
                    style={{ height: virtualHeight || 0 }}
                  >
                    {tileSize > 0 &&
                      visibleVideos.map((video, index) => {
                        const absoluteIndex = startIndex + index;
                        const row = Math.floor(absoluteIndex / columns);
                        const column = absoluteIndex % columns;
                        const top = row * rowHeight;
                        const left = column * (tileSize + GALLERY_GAP);

                        return (
                          <article
                            key={video.id}
                            className="galleryTile"
                            style={{
                              width: tileSize,
                              transform: `translate(${left}px, ${top}px)`,
                            }}
                          >
                            <div className="videoCard">
                              <Link
                                className="tileLink"
                                href={buildWatchHref(
                                  video,
                                  galleryScrollTop,
                                  privacyFilter
                                )}
                              >
                                <img
                                  src={video.thumbnail}
                                  alt={video.title || "Video thumbnail"}
                                />
                                <span className="tileOverlay">
                                  <span className="tilePlay">Open</span>
                                </span>
                              </Link>
                              {!isCompactMobile && (
                                <div className="tileMeta tileMetaDesktop">
                                  <div className="tileMetaTop">
                                    <span
                                      className={`privacyBadge ${
                                        video.privacyStatus || "private"
                                      }`}
                                    >
                                      {video.privacyStatus || "private"}
                                    </span>
                                    <p className="videoDate">
                                      {video.publishedAt
                                        ? new Date(
                                            video.publishedAt
                                          ).toLocaleDateString()
                                        : "Unknown date"}
                                    </p>
                                  </div>
                                  <h3 className="videoTitle">{video.title}</h3>
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
