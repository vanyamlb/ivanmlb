"""Command line interface for the :mod:`yxd` tool."""

from __future__ import annotations

import argparse
import getpass
import logging
import sys
import time
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import urlparse, urlunparse

from yt_dlp.utils import DownloadError  # type: ignore

from .channel_scraper import Video, iter_videos
from .transcripts import TranscriptFetchError, fetch_transcript, transcript_to_text
from .utils import ensure_directory, sanitize_filename

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="yxd",
        description=(
            "Download subtitles for every video in a YouTube channel or playlist."
        ),
    )
    parser.add_argument(
        "channel",
        help=(
            "Channel URL, handle, user page or playlist identifier accepted by yt-dlp."
        ),
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        default="subtitles",
        help="Directory where transcript .txt files will be stored.",
    )
    parser.add_argument(
        "-l",
        "--languages",
        nargs="+",
        help=(
            "Preferred transcript languages (e.g. en es). If omitted, YouTube's default"
            " language selection rules are used."
        ),
    )
    parser.add_argument(
        "--max-videos",
        type=int,
        help="Limit the number of videos to process (useful for testing).",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=1.0,
        help="Seconds to sleep between transcript downloads (default: 1).",
    )
    parser.add_argument(
        "--no-timestamps",
        action="store_true",
        help="Do not include timestamps in the generated transcript files.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing transcript files instead of skipping them.",
    )
    parser.add_argument(
        "--proxy-url",
        help="Explicit proxy URL to use for both yt-dlp and transcript requests.",
    )
    parser.add_argument(
        "--webshare-username",
        help="Webshare username (overrides interactive prompt).",
    )
    parser.add_argument(
        "--webshare-password",
        help="Webshare password (overrides interactive prompt).",
    )
    parser.add_argument(
        "--webshare-host",
        default="proxy.webshare.io",
        help="Webshare proxy host (default: proxy.webshare.io).",
    )
    parser.add_argument(
        "--webshare-port",
        default=80,
        type=int,
        help="Webshare proxy port (default: 80).",
    )
    parser.add_argument(
        "--webshare-scheme",
        default="http",
        choices=["http", "https"],
        help="Scheme to use when building the Webshare proxy URL (default: http).",
    )
    parser.add_argument(
        "--no-webshare-prompt",
        action="store_true",
        help="Disable interactive prompts for Webshare credentials.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Logging level (default: INFO).",
    )
    return parser


def _maybe_prompt_webshare_credentials(args: argparse.Namespace) -> Optional[str]:
    if args.proxy_url:
        return args.proxy_url

    username = args.webshare_username
    password = args.webshare_password

    interactive = sys.stdin.isatty() and not args.no_webshare_prompt
    should_prompt = interactive or username or password

    if not should_prompt:
        return None

    try:
        if username is None and interactive:
            username = input(
                "Webshare username (press Enter to skip, type 'cancel' to abort): "
            ).strip()
            if username.lower() == "cancel":
                raise KeyboardInterrupt
        if not username:
            logger.info("No Webshare username provided; continuing without proxy.")
            return None
        if password is None and interactive:
            password = getpass.getpass(
                "Webshare password (press Enter to skip, type 'cancel' to abort): "
            )
            if password.lower() == "cancel":
                raise KeyboardInterrupt
        if not password:
            logger.info("No Webshare password provided; continuing without proxy.")
            return None
    except EOFError:
        logger.info("Input stream closed before providing credentials; skipping proxy.")
        return None

    return f"{args.webshare_scheme}://{username}:{password}@{args.webshare_host}:{args.webshare_port}"


def _build_proxies(proxy_url: Optional[str]) -> Optional[dict]:
    if not proxy_url:
        return None
    return {"http": proxy_url, "https": proxy_url}


def _mask_proxy(proxy_url: str) -> str:
    """Hide credentials in *proxy_url* for logging."""

    try:
        parsed = urlparse(proxy_url)
        netloc = parsed.netloc
        if "@" in netloc:
            credentials, host = netloc.split("@", 1)
            username = credentials.split(":", 1)[0] if credentials else ""
            netloc = f"{username}:***@{host}"
        return urlunparse(
            (
                parsed.scheme,
                netloc,
                parsed.path or "",
                parsed.params,
                parsed.query,
                parsed.fragment,
            )
        )
    except Exception:  # pragma: no cover - defensive
        return proxy_url


def _write_transcript(
    output_dir: Path,
    video: Video,
    transcript_text: str,
    *,
    overwrite: bool,
) -> Path:
    filename = f"{sanitize_filename(video.title)}_{video.video_id}.txt"
    path = output_dir / filename
    if path.exists() and not overwrite:
        raise FileExistsError(path)
    path.write_text(transcript_text, encoding="utf-8")
    return path


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="[%(levelname)s] %(message)s",
    )


def run(args: argparse.Namespace) -> int:
    _configure_logging(args.log_level)

    output_dir = Path(args.output_dir)
    ensure_directory(output_dir)

    proxy_url = _maybe_prompt_webshare_credentials(args)
    proxies = _build_proxies(proxy_url)

    logger.info("Using output directory: %s", output_dir)
    if proxy_url:
        logger.info("Using proxy: %s", _mask_proxy(proxy_url))

    processed = 0
    saved = 0

    try:
        videos = iter_videos(args.channel, proxy_url=proxy_url)
        for video in videos:
            if args.max_videos and processed >= args.max_videos:
                break

            processed += 1

            logger.info("Processing %s (%s)", video.title, video.video_id)
            transcript_path = output_dir / (
                f"{sanitize_filename(video.title)}_{video.video_id}.txt"
            )
            if transcript_path.exists() and not args.overwrite:
                logger.info("Transcript already exists, skipping: %s", transcript_path)
                continue

            try:
                transcript = fetch_transcript(
                    video.video_id,
                    languages=args.languages,
                    proxies=proxies,
                )
            except TranscriptFetchError as exc:
                logger.warning(
                    "Unable to download transcript for %s: %s", video.video_id, exc
                )
                continue
            except Exception as exc:  # pragma: no cover - defensive
                logger.error(
                    "Unexpected error downloading transcript for %s: %s",
                    video.video_id,
                    exc,
                )
                continue

            transcript_text = transcript_to_text(
                transcript, include_timestamps=not args.no_timestamps
            )
            if not transcript_text:
                logger.warning("Transcript for %s is empty", video.video_id)
                continue

            try:
                saved_path = _write_transcript(
                    output_dir,
                    video,
                    transcript_text,
                    overwrite=args.overwrite,
                )
            except FileExistsError:
                logger.info("Transcript already exists, skipping: %s", transcript_path)
                continue

            saved += 1
            logger.info("Saved transcript to %s", saved_path)

            if args.sleep and args.sleep > 0:
                time.sleep(args.sleep)
    except DownloadError as exc:
        logger.error("Failed to extract channel information: %s", exc)
        return 1

    logger.info("Finished. Processed %d videos, saved %d transcripts.", processed, saved)
    return 0


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        return run(args)
    except KeyboardInterrupt:
        logger.info("Cancelled by user.")
        return 1
