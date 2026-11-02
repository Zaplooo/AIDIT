"""Tempo řeči v referencích: slova/min, pauzy mezi slovy (po vystřižení). python refpace.py <mp4>..."""
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np
from faster_whisper import WhisperModel
CONFIG = json.loads((Path(__file__).resolve().parent.parent / "config.json").read_text(encoding="utf-8"))
model = WhisperModel(CONFIG["whisperModel"], device="cpu", compute_type="int8", cpu_threads=16)
for f in sys.argv[1:]:
    p = Path(f).resolve()
    out = p.parent.parent / "analysis" / (p.stem + ".pace.json")
    tmp = out.with_suffix(".wav")
    subprocess.run([CONFIG["ffmpeg"], "-v", "error", "-y", "-i", str(p), "-t", "90", "-ac", "1", "-ar", "16000", str(tmp)], check=True)
    with wave.open(str(tmp)) as wf:
        pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    segs, info = model.transcribe(pcm, word_timestamps=True, beam_size=1, vad_filter=False)
    ws = [w for s in segs for w in s.words]
    tmp.unlink()
    if len(ws) < 10:
        print(p.name, "málo řeči"); continue
    gaps = np.array([b.start - a.end for a, b in zip(ws, ws[1:])])
    span = ws[-1].end - ws[0].start
    r = {"file": p.name, "lang": info.language, "words": len(ws), "wpm": round(len(ws) / span * 60), "gapP50": round(float(np.percentile(gaps, 50)), 3),
         "gapP90": round(float(np.percentile(gaps, 90)), 3), "gapMax": round(float(gaps.max()), 3), "gapsOver0_3": int((gaps > 0.3).sum()),
         "text": " ".join(w.word.strip() for w in ws)[:400]}
    out.write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
    print(r["file"], r["wpm"], r["gapP90"], r["gapMax"], flush=True)
