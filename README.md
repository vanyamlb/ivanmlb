# ivanmlb

Utilities to help me keep coding. The `yxd` command line tool downloads
transcripts for every video in a YouTube channel while supporting Webshare
proxies to avoid IP blocks.

## Requirements

Install the Python dependencies with pip:

```bash
pip install -r requirements.txt
```

## Usage

Run the tool with a channel URL, handle, user page or playlist identifier:

```bash
python -m yxd https://www.youtube.com/@YouTubeCreators
```

Transcripts are saved as UTF-8 `.txt` files inside the `subtitles/` directory by
default. Each file name contains the sanitized video title and the video ID. Use
`--output-dir` to change the destination.

### Webshare proxies

The downloader can route requests through Webshare proxies to reduce the risk of
YouTube rate limits. You can:

- Provide an explicit proxy URL with `--proxy-url`.
- Pass your Webshare username/password via `--webshare-username` and
  `--webshare-password`.
- Run the command interactively; when a TTY is detected the tool asks for the
  Webshare credentials. Press <kbd>Enter</kbd> to continue without a proxy or type
  `cancel` to abort the run.

By default the proxy URL is built as
`http://USERNAME:PASSWORD@proxy.webshare.io:80`. You can customise the host,
port or scheme with the corresponding `--webshare-*` options.

### Additional options

Run `python -m yxd --help` to see the complete list of flags, including:

- `--languages` to prioritise specific transcript languages.
- `--no-timestamps` to omit timestamps in the saved files.
- `--overwrite` to replace existing transcripts.
- `--sleep` to control the pause between transcript downloads.
