"""Rozšíří knihovnu zvukových efektů z Mixkitu (Mixkit Free License – smí se použít ve videích i komerčně).
Každý efekt se rovnou vyrovná (špička -1 dBFS, ~-14 LUFS) a uloží jako <kategorie>_<id>_n.mp3.
python sfxlib.py  -> public/sfx2/*.mp3 + public/sfx2/library.json (stávající efekty zůstanou)
"""
import json
import re
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FF = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))["ffmpeg"]
UA = "Mozilla/5.0"
PER = 16
CATS = {
    "whoosh": ["whoosh", "swoosh", "air-woosh"],
    "transition": ["transition", "swish"],
    "swipe": ["swipe", "slide"],
    "pop": ["pop", "bubble"],
    "click": ["click", "mouse-click", "button"],
    "impact": ["impact", "hit", "punch"],
    "boom": ["boom", "explosion", "bass"],
    "riser": ["rise", "riser", "build-up"],
    "camera": ["camera", "shutter"],
    "typing": ["typing", "keyboard"],
    "notification": ["notification", "message", "alert"],
    "glitch": ["glitch", "digital"],
    "ding": ["ding", "bell"],
    "cash": ["cash-register", "coins", "money"],
    "success": ["achievement", "success", "win"],
    "error": ["wrong", "error", "fail"],
    "magic": ["magic", "sparkle", "shine"],
    "tick": ["clock", "tick", "countdown"],
}


def get(url):
    return subprocess.run(["curl.exe", "-s", "--ssl-no-revoke", "-A", UA, url], capture_output=True, text=True, encoding="utf-8", errors="replace").stdout


def items_from(html):
    out = []
    for m in re.finditer(r'"name":"([^"]+)"(?:,"genre":"[^"]*")?(?:,"byArtist":"[^"]*")?,"duration":"PT(?:(\d+)M)?(?:(\d+)S)?","url":"(https://assets\.mixkit\.co/[^"]+?\.(?:mp3|wav))"', html):
        name, mm, ss, url = m.groups()
        out.append({"name": name, "duration": int(mm or 0) * 60 + int(ss or 0), "url": url})
    if not out:
        for url in sorted(set(re.findall(r"https://assets\.mixkit\.co/active_storage/sfx/[0-9]+/[0-9]+(?:-preview)?\.mp3", html))):
            out.append({"name": "", "duration": 0, "url": url})
    return out


def main():
    dest = ROOT / "public" / "sfx2"
    lf = dest / "library.json"
    lib = json.loads(lf.read_text(encoding="utf-8")) if lf.exists() else []
    have = {it["id"] for it in lib}
    ids_seen = {it["id"].split("_")[-1] for it in lib}
    for cat, pages in CATS.items():
        got = sum(1 for it in lib if it["cat"] == cat)
        for pg in pages:
            if got >= PER:
                break
            for it in items_from(get(f"https://mixkit.co/free-sound-effects/{pg}/")):
                if got >= PER:
                    break
                fid = re.search(r"/(\d+)/", it["url"]).group(1)
                if fid in ids_seen or (it["duration"] and it["duration"] > 8):
                    continue  # dlouhé zvuky (ambient) do střihu nepatří
                ids_seen.add(fid)
                raw = dest / f"_{cat}_{fid}.mp3"
                out = dest / f"{cat}_{fid}_n.mp3"
                subprocess.run(["curl.exe", "-s", "-f", "--ssl-no-revoke", "-A", UA, "-o", str(raw), it["url"]])
                if not raw.exists() or raw.stat().st_size < 2000:
                    raw.unlink(missing_ok=True)
                    continue
                r = subprocess.run([FF, "-v", "error", "-y", "-i", str(raw), "-af", "loudnorm=I=-14:TP=-1.0:LRA=11", "-ar", "48000", "-ac", "2", "-b:a", "192k", str(out)])
                raw.unlink(missing_ok=True)
                if r.returncode or not out.exists():
                    continue
                key = f"{cat}_{fid}"
                if key not in have:
                    lib.append({"id": key, "file": f"sfx2/{out.name}", "cat": cat, "name": it["name"] or f"{cat} {fid}", "duration": it["duration"]})
                    have.add(key)
                got += 1
            time.sleep(0.4)
        print(cat, got, flush=True)
    lf.write_text(json.dumps(lib, ensure_ascii=False, indent=1), encoding="utf-8")
    print("celkem", len(lib))


if __name__ == "__main__":
    main()
