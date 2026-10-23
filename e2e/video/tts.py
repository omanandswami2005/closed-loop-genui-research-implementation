"""Synthesize narration.json with Google Cloud Text-to-Speech; prints each clip's duration.

    python tts.py OUT_DIR    (needs gcloud auth or an environment that injects Google credentials)
"""

import base64
import json
import os
import subprocess
import sys
from pathlib import Path

import httpx

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
cfg = json.loads((Path(__file__).parent / "narration.json").read_text())
project = os.environ.get("GOOGLE_CLOUD_PROJECT", "omni-505707")
headers = {"x-goog-user-project": project}
token = os.environ.get("GENUI_GEMINI_TOKEN")
if token:
    headers["Authorization"] = f"Bearer {token}"
durations = {}
for name, text in cfg["scenes"].items():
    r = httpx.post(
        "https://texttospeech.googleapis.com/v1/text:synthesize",
        headers=headers,
        json={"input": {"text": text}, "voice": {"languageCode": "en-US", "name": cfg["voice"]}, "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": 48000}},
        timeout=60,
    )
    r.raise_for_status()
    wav = out / f"{name}.wav"
    wav.write_bytes(base64.b64decode(r.json()["audioContent"]))
    d = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)]).strip())
    durations[name] = round(d, 3)
    print(f"{name}: {d:.1f} s")
(out / "durations.json").write_text(json.dumps(durations, indent=1))
