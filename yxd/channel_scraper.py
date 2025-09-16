"""Utilities for discovering all videos from a YouTube channel."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Generator, Iterable, Optional

import yt_dlp

logger = logging.getLogger(__name__)


@dataclass
class Video:
    """Representation of a YouTube video."""

    video_id: str
    title: str


def _flatten_entries(info: dict) -> Iterable[dict]:
    """Yield flattened entries from *info* as returned by ``yt_dlp``."""

    entries = info.get("entries")
    if not entries:
        yield info
        return

    for entry in entries:
        if entry is None:
            continue
        # Some nested playlists also have ``entries``.
        if isinstance(entry, dict) and entry.get("entries"):
            yield from _flatten_entries(entry)
            continue
        yield entry


def iter_videos(channel_url: str, proxy_url: Optional[str] = None) -> Generator[Video, None, None]:
    """Yield :class:`Video` instances for every video in *channel_url*.

    Parameters
    ----------
    channel_url:
        Any URL accepted by :mod:`yt_dlp`, including channel links, custom
        handles, user pages or playlist URLs.
    proxy_url:
        Optional HTTP proxy URL, typically in the form
        ``http://user:pass@proxy.webshare.io:port``.
    """

    ydl_opts = {
        "quiet": True,
        "skip_download": True,
        "extract_flat": True,
        "proxy": proxy_url,
        "noplaylist": False,
    }

    logger.debug("Extracting videos for %s", channel_url)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(channel_url, download=False)

    for entry in _flatten_entries(info):
        video_id = entry.get("id") or entry.get("url")
        if not video_id:
            logger.debug("Skipping entry without id: %s", entry)
            continue
        title = entry.get("title") or "video"
        yield Video(video_id=video_id, title=title)
