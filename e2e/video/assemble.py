"""Turn record.ts output into the final MP4: 30 fps 1920x1080 video, narration clips placed per scene.

    python assemble.py WORK_DIR AUDIO_DIR OUT.mp4

Each scene starts with its narration clip. Footage that runs past the clip (waiting on the
next screen, many answers in a row) is played faster, with a visible "fast-forward" badge on
app footage, so nothing is cut out silently. Title cards are just shortened.
"""

import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FPS = 30
W, H = 1920, 1080
TAIL = 1.2  # seconds kept at normal speed after the narration ends
MAX_REST = 6.0  # the rest of a scene is sped up to last at most this long
CARDS = {"intro", "architecture", "outro"}
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

work, audio, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
tl = json.loads((work / "timeline.json").read_text())
dur = json.loads((audio / "durations.json").read_text())
frames = tl["frames"]
marks = tl["marks"] + [{"name": "_end", "t": tl["end"]}]

# Segments of source time with a playback speed: (src_start, src_end, speed, scene).
segments = []
for a, b in zip(marks, marks[1:]):
    name, t0, t1 = a["name"], a["t"], b["t"]
    keep = min(t1, t0 + dur.get(name, 0) + TAIL)
    segments.append((t0, keep, 1.0, name))
    rest = t1 - keep
    if rest > 0.05:
        speed = max(1.0, rest / MAX_REST)
        if name in CARDS:  # static card after its animation: shorten to the cap
            segments.append((keep, keep + min(rest, 1.0), 1.0, name))
        else:
            segments.append((keep, t1, speed, name))

font = ImageFont.truetype(FONT, 30)


def badge(jpeg: bytes, speed: float) -> bytes:
    im = Image.open(io.BytesIO(jpeg)).convert("RGB").resize((W, H))
    d = ImageDraw.Draw(im, "RGBA")
    text = f">> {speed:.0f}x"
    x0, y0 = W - 230, 96
    d.rounded_rectangle((x0, y0, x0 + 190, y0 + 56), radius=28, fill=(245, 158, 11, 235))
    d.text((x0 + 95, y0 + 28), text, font=font, fill=(17, 24, 39), anchor="mm")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return buf.getvalue()


ffmpeg = subprocess.Popen(
    ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
     "-vf", f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x060a13,format=yuv420p",
     "-c:v", "libx264", "-preset", "medium", "-crf", "20", str(work / "video.mp4")],
    stdin=subprocess.PIPE,
)
scene_start: dict[str, float] = {}
out_t, fi, n = 0.0, 0, 0
cache: dict[str, bytes] = {}
for s0, s1, speed, name in segments:
    scene_start.setdefault(name, out_t)
    length = (s1 - s0) / speed
    k = 0
    while k / FPS < length:
        src = s0 + k * speed / FPS
        while fi + 1 < len(frames) and frames[fi + 1]["t"] <= src:
            fi += 1
        f = frames[fi]["file"]
        data = cache.get(f) or Path(f).read_bytes()
        cache = {f: data}
        if speed > 1.5:
            data = badge(data, speed)
        ffmpeg.stdin.write(data)
        k += 1
        n += 1
    out_t += k / FPS
ffmpeg.stdin.close()
ffmpeg.wait()

# Narration: each clip starts with its scene.
inputs, filters = [], []
names = [m["name"] for m in tl["marks"] if (audio / f"{m['name']}.wav").exists()]
for i, name in enumerate(names):
    inputs += ["-i", str(audio / f"{name}.wav")]
    ms = int(scene_start[name] * 1000) + 250
    filters.append(f"[{i + 1}:a]adelay={ms}|{ms}[a{i}]")
mix = "".join(f"[a{i}]" for i in range(len(names))) + f"amix=inputs={len(names)}:normalize=0[aud]"
total = n / FPS
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(work / "video.mp4"), *inputs,
     "-filter_complex", ";".join([f"[0:v]fade=in:0:15,fade=out:st={total - 0.8:.2f}:d=0.8[vid]", *filters, mix]),
     "-map", "[vid]", "-map", "[aud]",
     "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "192k",
     "-movflags", "+faststart", "-t", f"{total:.2f}", str(out)],
    check=True,
)
print(f"{out}: {total:.1f} s, {n} frames")
for name in names:
    print(f"  {scene_start[name]:6.1f}s  {name}")
