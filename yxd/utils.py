"""Utility helpers for the :mod:`yxd` package."""

from __future__ import annotations

import re
from pathlib import Path

_FILENAME_SANITIZE_PATTERN = re.compile(r"[^\w.-]+", re.UNICODE)


def sanitize_filename(value: str, max_length: int = 150) -> str:
    """Return a filesystem-friendly version of *value*.

    The function keeps alphanumeric characters, dashes, underscores and dots.
    Everything else is replaced with an underscore. The output is truncated to
    ``max_length`` characters to avoid extremely long filenames.
    """

    if not value:
        return "video"

    cleaned = _FILENAME_SANITIZE_PATTERN.sub("_", value).strip("._")
    if not cleaned:
        cleaned = "video"
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length].rstrip("._")
        if not cleaned:
            cleaned = "video"
    return cleaned


def ensure_directory(path: Path) -> None:
    """Create *path* and its parents if they do not exist."""

    path.mkdir(parents=True, exist_ok=True)


def format_timestamp(seconds: float) -> str:
    """Format a floating point *seconds* value as ``HH:MM:SS`` or ``HH:MM:SS.mmm``."""

    if seconds < 0:
        seconds = 0
    total_seconds = int(seconds)
    hours, remainder = divmod(total_seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    milliseconds = int(round((seconds - total_seconds) * 1000))
    if milliseconds and milliseconds != 1000:
        return f"{hours:02}:{minutes:02}:{secs:02}.{milliseconds:03}"
    return f"{hours:02}:{minutes:02}:{secs:02}"
