"""Hloubkový rozbor referenčního videa (jen pro učení stylu, cizí záběry se po rozboru mažou).

python refstudy.py <video.mp4> <výstupní složka>

Vytvoří:
  sheet_XX.jpg  – filmové pásy (4×3 snímky s časem): prvních 45 s po 0,5–1 s, pak řídce celé video
  study.json    – tempo řeči (slova/min, mezery), přepis prvních 90 s, střihy, hudba pod řečí, zvukové efekty
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
FF = CONFIG["ffmpeg"]


def sheets(video: Path, out: Path):
    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    dur = n / fps
    # husté vzorkování začátku (tam je hook a styl nejlépe vidět), pak řídké přes celé video
    dense_step = 0.5 if dur <= 60 else 1.0
    times = [t for t in np.arange(0.0, min(dur, 45), dense_step)]
    if dur > 45:
        k = 24 if dur < 600 else 36
        times += [45 + (dur - 45) * i / k for i in range(k)]
    frames = []
    for t in times:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, img = cap.read()
        if not ok:
            continue
        h, w = img.shape[:2]
        tw = 300 if h > w else 420
        img = cv2.resize(img, (tw, int(h * tw / w)))
        cv2.rectangle(img, (0, 0), (92, 24), (0, 0, 0), -1)
        cv2.putText(img, f"{t:6.1f}s", (3, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1)
        frames.append(img)
    per = 12
    files = []
    for s in range(0, len(frames), per):
        chunk = frames[s: s + per]
        while len(chunk) < per:
            chunk.append(np.zeros_like(frames[0]))
        rows = [np.hstack(chunk[r * 4:(r + 1) * 4]) for r in range(3)]
        f = out / f"sheet_{s // per:02d}.jpg"
        cv2.imwrite(str(f), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 82])
        files.append(f.name)
    return files, dur, fps, cap.get(cv2.CAP_PROP_FRAME_WIDTH), cap.get(cv2.CAP_PROP_FRAME_HEIGHT)


def cuts(video: Path):
    """Střihy: velká změna obrazu (scéna) i malé skoky (jump cut v jednom záběru)."""
    r = subprocess.run([FF, "-hide_banner", "-i", str(video), "-vf", "scale=240:-2,select='gt(scene,0.12)',showinfo",
                        "-an", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    import re
    return [round(float(x), 2) for x in re.findall(r"pts_time:([\d.]+)", r)]


def audio(video: Path, tmp: Path):
    subprocess.run([FF, "-v", "error", "-y", "-i", str(video), "-ac", "1", "-ar", "16000", str(tmp)], check=True)
    with wave.open(str(tmp)) as wf:
        pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    return pcm


def analyse_audio(pcm, words):
    hop = 160
    n = len(pcm) // hop
    fr = pcm[: n * hop].reshape(n, hop)
    rms = np.sqrt((fr ** 2).mean(1) + 1e-12)
    db = 20 * np.log10(rms + 1e-9)
    speech = np.zeros(n, bool)
    for w in words:
        speech[int(w["start"] * 100): int(w["end"] * 100) + 1] = True
    gaps = db[~speech] if (~speech).sum() > 50 else db
    floor = float(np.percentile(gaps, 20))
    # hudba pod řečí: v mezerách mezi slovy zůstává hladina vysoko a „plochá“
    music_db = float(np.percentile(gaps, 50))
    # efekty: prudké nástupy hlasitosti mimo slova
    onset = np.diff(db, prepend=db[0])
    sfx_idx = np.where((onset > 14) & (~speech) & (db > floor + 18))[0]
    sfx = []
    for i in sfx_idx:
        if not sfx or i / 100 - sfx[-1] > 0.4:
            sfx.append(round(i / 100, 2))
    return {"floorDb": round(floor, 1), "gapMedianDb": round(music_db, 1), "speechDb": round(float(np.percentile(db[speech], 60)) if speech.any() else -99, 1),
            "musicLikely": bool(music_db - floor > 6 or music_db > -45), "sfxOnsets": sfx[:80]}


def main():
    video, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    files, dur, fps, w, h = sheets(video, out)
    cs = cuts(video)
    tmp = out / "_a.wav"
    pcm = audio(video, tmp)
    from faster_whisper import WhisperModel
    model = WhisperModel(CONFIG["whisperModel"], device="cpu", compute_type="int8", cpu_threads=16)
    seg = pcm[: 16000 * 120]
    words, info = [], None
    for attempt in ({"beam_size": 1, "vad_filter": False}, {"beam_size": 5, "vad_filter": True}):
        try:  # u některých videí (hudba bez řeči) whisper při zarovnání slov spadne -> zkusit jinak
            segs, info = model.transcribe(seg, word_timestamps=True, **attempt)
            words = [{"text": w.word.strip(), "start": round(w.start, 2), "end": round(w.end, 2)} for s in segs for w in (s.words or [])]
            break
        except Exception:
            words = []
    tmp.unlink()
    res = {"file": video.name, "duration": round(dur, 2), "fps": round(fps, 2), "width": int(w), "height": int(h), "sheets": files,
           "cuts": cs, "cutsPerMin": round(len(cs) / max(dur / 60, 0.1), 1), "cutsFirst15s": sum(1 for c in cs if c < 15), "lang": info.language if info else "?"}
    if len(words) > 8:
        gaps = np.array([b["start"] - a["end"] for a, b in zip(words, words[1:])])
        span = words[-1]["end"] - words[0]["start"]
        res.update({"words": len(words), "wpm": round(len(words) / span * 60), "gapP50": round(float(np.percentile(gaps, 50)), 3),
                    "gapP90": round(float(np.percentile(gaps, 90)), 3), "gapMax": round(float(gaps.max()), 2),
                    "transcript": " ".join(f"[{w['start']:.1f}]{w['text']}" for w in words)[:3500]})
    else:
        res.update({"words": len(words), "transcript": " ".join(w["text"] for w in words)})
    res["audio"] = analyse_audio(pcm[: 16000 * 120], words)
    (out / "study.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(video.name, dur, len(cs), res.get("wpm"), res["audio"]["musicLikely"], flush=True)


if __name__ == "__main__":
    main()
