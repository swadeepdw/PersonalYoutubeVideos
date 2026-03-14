"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

const THEME_STORAGE_KEY = "yt-dashboard-theme";

export default function WatchPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [theme, setTheme] = useState("dark");

  const videoId = params.videoId;
  const title = searchParams.get("title") || "Untitled video";
  const description =
    searchParams.get("description") || "No description available.";
  const publishedAt = searchParams.get("publishedAt");
  const channelTitle = searchParams.get("channelTitle") || "YouTube";
  const privacy = searchParams.get("privacy") || "private";
  const fromScroll = searchParams.get("fromScroll") || "0";
  const fromFilter = searchParams.get("fromFilter") || "all";

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

  const backHref = useMemo(
    () =>
      `/?view=gallery&filter=${encodeURIComponent(
        fromFilter
      )}&scroll=${encodeURIComponent(fromScroll)}`,
    [fromFilter, fromScroll]
  );

  function toggleTheme() {
    setTheme((previous) => (previous === "dark" ? "light" : "dark"));
  }

  return (
    <>
      <header className="globalHeader">
        <div className="headerInner">
          <h2>Gallery Studio</h2>
          <div className="actions">
            <Link className="playerHeaderBack" href={backHref}>
              Back to gallery
            </Link>
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

      <main className="playerPage">
        <div className="playerShell">
          <section>
            <div className="playerFrameWrap">
              <iframe
                className="playerFrame"
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>

            <article className="playerMeta">
              <div className="playerMetaTop">
                <div>
                  <p className="eyebrow">Now playing</p>
                  <h1>{title}</h1>
                </div>
                <span className={`privacyBadge ${privacy}`}>{privacy}</span>
              </div>
              <p className="infoText">
                {channelTitle}
                {publishedAt
                  ? ` • ${new Date(publishedAt).toLocaleDateString()}`
                  : ""}
              </p>
              <p className="playerDescription">{description}</p>
            </article>
          </section>
        </div>
      </main>
    </>
  );
}
