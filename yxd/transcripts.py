"""Transcript fetching helpers."""

from __future__ import annotations

import logging
from typing import Dict, Iterable, List, Optional

from youtube_transcript_api import (  # type: ignore
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
    YouTubeTranscriptApi,
)

from .utils import format_timestamp

logger = logging.getLogger(__name__)


class TranscriptFetchError(RuntimeError):
    """Raised when a transcript cannot be retrieved."""


def fetch_transcript(
    video_id: str,
    *,
    languages: Optional[Iterable[str]] = None,
    proxies: Optional[Dict[str, str]] = None,
) -> List[dict]:
    """Return the transcript for *video_id* using :mod:`youtube_transcript_api`.

    Parameters
    ----------
    video_id:
        The identifier of the target video.
    languages:
        An optional iterable of language codes ordered by priority.
    proxies:
        Optional dictionary with ``http`` and ``https`` proxy URLs.
    """

    lang_list = list(languages) if languages else None
    logger.debug("Fetching transcript for %s", video_id)

    try:
        return YouTubeTranscriptApi.get_transcript(
            video_id, languages=lang_list, proxies=proxies
        )
    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable) as exc:
        raise TranscriptFetchError(str(exc)) from exc


def transcript_to_text(
    transcript: List[dict], *, include_timestamps: bool = True
) -> str:
    """Return a formatted string representation of *transcript*."""

    lines = []
    for item in transcript:
        text = item.get("text", "").replace("\n", " ").strip()
        if not text:
            continue
        if include_timestamps:
            timestamp = format_timestamp(float(item.get("start", 0.0)))
            lines.append(f"{timestamp} {text}")
        else:
            lines.append(text)
    return "\n".join(lines)
