---
name: br-video-keyframes
description: Download a video from a URL (YouTube, Twitter/X, direct .mp4, screenshare hosts, etc.) and extract a small set of semantically-distinct keyframes as JPEGs Claude can Read inline. Use when the user gives a video link and asks you to analyze what's happening, debug a bug demo, transcribe a UI walkthrough, or summarize visual content. Faster + cheaper than scrubbing through the whole video yourself, and Claude can see each frame as an image.
---

# br-video-keyframes

Pull a video, extract a handful of representative frames, hand back absolute paths. Designed for **debug / analysis** workflows — not archival or re-encoding.

## When to invoke

- User sends a video URL ("can you check this Loom?", "what's broken in this screen recording?", "summarize this YouTube clip").
- A bug report attaches a video (or a chat session has one) and you need to know what's on screen.
- A UI walkthrough is faster understood as 8-12 keyframes than as a 5-minute video.
- A flake repro is a screen recording — keyframes show the state transitions.

## When NOT to invoke

- The user gave you the path to local frames already (skip the download + extract; just `Read` them).
- The user wants the **video file itself** saved long-term — this skill puts output in `/tmp/` and doesn't clean up, but isn't a download manager. Just use `yt-dlp` directly.
- Audio analysis — this skill is video-frames-only. Use `ffmpeg` directly to pull audio.
- The video is private and requires auth (yt-dlp may need cookies; the skill doesn't manage them).

## Inputs

| Arg | Default | Meaning |
|---|---|---|
| `url` | _(required)_ | The video link. yt-dlp resolves it (YouTube, X/Twitter, Vimeo, direct .mp4, Loom, Drive public, etc.). Must be `http://` or `https://`. |
| `max_frames` | `12` | Cap on extracted frames. Most analysis needs 6-15; defaults aim for "enough to see what happens" without blowing context. |
| `mode` | `scene` | `scene` = scene-change detection (semantically distinct, best default). `iframe` = keyframes from the codec (cheap, decent for short videos). `interval` = one frame every N seconds (predictable). |
| `interval_seconds` | `5` | Only used when `mode=interval`. |
| `output_dir` | `/tmp/br-video-debug/<sha1-of-url-first-8-chars>/` | Where the .mp4 + frames land. Reuses the same dir for the same URL so re-runs short-circuit. |
| `force` | `false` | If `true`, re-downloads + re-extracts even when the cached dir already has frames. |
| `video_quality` | `best[height<=720]` | yt-dlp format selector. 720p is plenty for keyframe analysis and keeps download size sane. |

## Workflow

### Step 0 — Sanity checks

```bash
command -v yt-dlp >/dev/null || { echo "yt-dlp missing — install with: pip install yt-dlp"; exit 2; }
command -v ffmpeg >/dev/null || { echo "ffmpeg missing — install via apt/brew/etc."; exit 2; }
[[ "$url" =~ ^https?:// ]] || { echo "url must be http(s); got: $url"; exit 2; }
```

### Step 1 — Compute cache dir + short-circuit if cached

```bash
URL_HASH=$(printf '%s' "$url" | sha1sum | cut -c1-8)
OUTPUT_DIR="${output_dir:-/tmp/br-video-debug/$URL_HASH}"
mkdir -p "$OUTPUT_DIR"

if [ "$force" != "true" ] && ls "$OUTPUT_DIR"/frame_*.jpg >/dev/null 2>&1; then
  echo "cached: $OUTPUT_DIR (use force=true to redownload)"
  ls -1 "$OUTPUT_DIR"/frame_*.jpg
  exit 0
fi
```

Re-runs on the same URL are instant — Claude can re-invoke without re-burning bandwidth.

### Step 2 — Download (yt-dlp → curl fallback)

```bash
# Try yt-dlp first (handles YouTube, X/Twitter, Vimeo, Loom, etc.).
if yt-dlp \
  --quiet --no-warnings \
  --max-filesize 500M \
  --format "${video_quality:-best[height<=720]}" \
  --output "$OUTPUT_DIR/video.%(ext)s" \
  "$url" 2>"$OUTPUT_DIR/yt-dlp.err"; then
  : # success
elif [[ "$url" =~ \.(mp4|webm|mkv|mov|m4v)(\?|$) ]]; then
  # yt-dlp's [generic] extractor sometimes 403s on plain video URLs that
  # work fine with a browser User-Agent (Google Cloud Storage public
  # buckets, S3 hotlinks, etc.). Fall back to curl for direct video URLs.
  echo "yt-dlp failed; falling back to curl for direct video URL"
  EXT="${url##*.}"; EXT="${EXT%%\?*}"
  curl -sLf -A "Mozilla/5.0" --max-time 120 --max-filesize 500000000 \
    -o "$OUTPUT_DIR/video.$EXT" "$url" || {
      echo "curl fallback also failed; see $OUTPUT_DIR/yt-dlp.err"
      exit 1
    }
else
  echo "download failed; see $OUTPUT_DIR/yt-dlp.err"
  exit 1
fi

VIDEO=$(ls "$OUTPUT_DIR"/video.* 2>/dev/null | grep -v '\.err$' | head -1)
[ -z "$VIDEO" ] && { echo "download produced no file"; exit 1; }
```

`--max-filesize 500M` is a guardrail; bump via `video_quality=best` if you need it. The curl fallback only triggers for URLs that look like a direct video file (`.mp4`, `.webm`, `.mkv`, `.mov`, `.m4v`) — otherwise yt-dlp's error stands (auth required, geo-blocked, deleted, etc.).

### Step 3 — Probe duration (informational)

```bash
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO" | cut -d. -f1)
echo "video: $VIDEO duration=${DURATION}s"
```

### Step 4 — Extract frames per mode

**`mode=scene`** (default — semantically-distinct frames):

```bash
ffmpeg -hide_banner -loglevel error \
  -i "$VIDEO" \
  -vf "select='gt(scene,0.3)',scale=960:-1" \
  -vsync vfr \
  -frames:v "$max_frames" \
  -q:v 4 \
  "$OUTPUT_DIR/frame_%03d.jpg"
```

Scene threshold `0.3` is a good middle ground — lower (0.1) for subtle UI changes, higher (0.5) for cuts-only. The `-frames:v` cap stops extraction after `max_frames` regardless of how many scene changes exist.

**`mode=iframe`** (fast — codec keyframes):

```bash
ffmpeg -hide_banner -loglevel error \
  -i "$VIDEO" \
  -vf "select='eq(pict_type,I)',scale=960:-1" \
  -vsync vfr \
  -frames:v "$max_frames" \
  -q:v 4 \
  "$OUTPUT_DIR/frame_%03d.jpg"
```

**`mode=interval`** (predictable — one frame every N seconds):

```bash
INTERVAL="${interval_seconds:-5}"
ffmpeg -hide_banner -loglevel error \
  -i "$VIDEO" \
  -vf "fps=1/${INTERVAL},scale=960:-1" \
  -frames:v "$max_frames" \
  -q:v 4 \
  "$OUTPUT_DIR/frame_%03d.jpg"
```

All modes downscale to width 960 — plenty for analysis, keeps each JPEG ~100-200KB instead of 1-3MB.

### Step 5 — Report

```bash
echo
echo "Extracted $(ls "$OUTPUT_DIR"/frame_*.jpg | wc -l) frames in $OUTPUT_DIR:"
ls -1 "$OUTPUT_DIR"/frame_*.jpg
```

After this prints, Claude `Read`s each frame path (the Read tool natively decodes JPEGs). Comment briefly on what's visible in each, then synthesize the answer to the user's original question.

## Output contract

- Exit 0 + lists frame paths on success.
- Exit 1 on download failure (auth, geo-block, deleted, format-not-available).
- Exit 2 on missing tool / bad input (yt-dlp absent, non-http URL).

## After extraction

**Always** Read each frame and synthesize — don't just list paths back to the user. They asked you to analyze the video, not download it. If frames are too numerous to comment on each, group them (e.g., "frames 1-4 show login flow, frames 5-8 show the error state").

If a user follow-up asks about a specific moment ("what happens after the error pops up?"), re-invoke with `mode=interval interval_seconds=2` for finer-grained sampling around that section — OR just bump `max_frames` and re-run.

## Cleanup

`/tmp/br-video-debug/` accumulates. Periodically `rm -rf /tmp/br-video-debug/<hash>/` after a session ends, or `rm -rf /tmp/br-video-debug/` to wipe all cached videos. The skill never auto-cleans (cache hits make re-runs instant).

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `yt-dlp: ERROR: Unable to extract uploader id` | Site changed schema; yt-dlp version too old | `pip install -U yt-dlp` |
| `Video unavailable` | Private / region-blocked / deleted | Confirm URL works in user's browser; auth-gated content needs cookies (out of scope) |
| `download failed (no file)` | --max-filesize exceeded | Re-run with `video_quality=worst` or a higher size cap |
| 0 frames extracted in `scene` mode | Video has no detected scene changes (single static shot) | Retry with `mode=interval interval_seconds=3` |
| Frames are blank / black | Codec issue, partial download | Re-run with `force=true`; check `ffprobe` reports valid duration |
