"""Rychlý rozbor referenčních videí: délka, formát, střihy (scene detection), délky záběrů, hlasitost.
python refscan.py <složka s mp4> <výstupní složka>"""
import json, re, subprocess, sys
from pathlib import Path
CONFIG = json.loads((Path(__file__).resolve().parent.parent / "config.json").read_text(encoding="utf-8"))
src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
for f in sorted(src.glob("*.mp4")):
    o = out / (f.stem + ".json")
    if o.exists():
        continue
    info = json.loads(subprocess.run([CONFIG["ffprobe"], "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(f)], capture_output=True, text=True).stdout)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    dur = float(info["format"]["duration"])
    r = subprocess.run([CONFIG["ffmpeg"], "-hide_banner", "-i", str(f), "-vf", "scale=320:-2,select='gt(scene,0.28)',showinfo", "-an", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    cuts = [round(float(x), 3) for x in re.findall(r"pts_time:([\d.]+)", r)]
    shots = [b - a for a, b in zip([0] + cuts, cuts + [dur])]
    a = subprocess.run([CONFIG["ffmpeg"], "-hide_banner", "-i", str(f), "-af", "ebur128", "-vn", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", a)
    meta = {}
    ij = f.with_suffix(".info.json")
    if ij.exists():
        d = json.loads(ij.read_text(encoding="utf-8"))
        meta = {"title": d.get("title"), "uploader": d.get("uploader") or d.get("channel"), "url": d.get("webpage_url")}
    res = {"file": f.name, **meta, "duration": round(dur, 2), "w": int(v["width"]), "h": int(v["height"]),
           "cuts": cuts, "nCuts": len(cuts), "avgShot": round(dur / (len(cuts) + 1), 2),
           "medianShot": round(sorted(shots)[len(shots) // 2], 2) if shots else dur,
           "cutsFirst3s": sum(1 for c in cuts if c < 3), "lufs": float(lufs[-1]) if lufs else None}
    o.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f.name, res["duration"], res["nCuts"], res["avgShot"], flush=True)
