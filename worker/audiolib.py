"""Stáhne knihovnu hudby a zvukových efektů z Mixkitu (Mixkit Free License – smí se použít ve videích).
python audiolib.py  -> public/music/*.mp3 + public/music/library.json, public/sfx2/*.mp3 + public/sfx2/library.json
"""
import json
import re
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0"

MUSIC = {  # kategorie -> stránky Mixkitu (nálada / žánr)
    "energetic": ["mood/energetic", "mood/driving", "future-bass"],
    "motivating": ["mood/motivating", "mood/uplifting", "mood/confident"],
    "hiphop": ["hip-hop", "trap"],
    "lofi": ["lo-fi-beats", "mood/mellow"],
    "chill": ["chillout", "mood/relaxed", "deep-house"],
    "cinematic": ["film-score", "mood/epic", "mood/dramatic"],
    "dark": ["mood/dark", "mood/tension", "mood/suspenseful"],
    "happy": ["mood/happy", "mood/playful", "mood/cheerful"],
    "corporate": ["corporate-music", "mood/positive"],
    "emotional": ["mood/emotional", "mood/reflective", "mood/hopeful"],
}
SFX = {
    "whoosh": ["whoosh", "swoosh"],
    "transition": ["transition"],
    "pop": ["pop"],
    "click": ["click", "mouse-click"],
    "impact": ["impact", "hit"],
    "riser": ["rise", "riser"],
    "camera": ["camera"],
    "typing": ["typing", "keyboard"],
    "notification": ["notification", "message"],
    "glitch": ["glitch"],
    "ding": ["ding", "bell"],
    "swipe": ["swipe"],
}


def get(url):
    return subprocess.run(["curl.exe", "-s", "--ssl-no-revoke", "-A", UA, url], capture_output=True, text=True, encoding="utf-8", errors="replace").stdout


def items_from(html):
    out = []
    for m in re.finditer(r'"name":"([^"]+)"(?:,"genre":"[^"]*")?(?:,"byArtist":"[^"]*")?,"duration":"PT(?:(\d+)M)?(?:(\d+)S)?","url":"(https://assets\.mixkit\.co/[^"]+?\.(?:mp3|wav))"', html):
        name, mm, ss, url = m.groups()
        out.append({"name": name, "duration": int(mm or 0) * 60 + int(ss or 0), "url": url})
    if not out:  # záložní cesta: jen URL
        for url in sorted(set(re.findall(r"https://assets\.mixkit\.co/(?:music|active_storage/sfx)/[0-9]+/[0-9]+(?:-preview)?\.mp3", html))):
            out.append({"name": Path(url).stem, "duration": 0, "url": url})
    return out


def build(kind, cats, base, per, min_dur=0):
    dest = ROOT / "public" / base
    dest.mkdir(parents=True, exist_ok=True)
    lib = []
    seen = set()
    for cat, pages in cats.items():
        got = 0
        for pg in pages:
            url = f"https://mixkit.co/free-{kind}/{pg}/"
            for it in items_from(get(url)):
                if it["url"] in seen or got >= per or (min_dur and it["duration"] and it["duration"] < min_dur):
                    continue
                seen.add(it["url"])
                fid = re.search(r"/(\d+)/", it["url"]).group(1)
                f = dest / f"{cat}_{fid}.mp3"
                if not f.exists():
                    subprocess.run(["curl.exe", "-s", "-f", "--ssl-no-revoke", "-A", UA, "-o", str(f), it["url"]])
                if f.exists() and f.stat().st_size > 2000:
                    lib.append({"id": f.stem, "file": f"{base}/{f.name}", "cat": cat, "name": it["name"], "duration": it["duration"]})
                    got += 1
            time.sleep(0.4)
        print(kind, cat, got, flush=True)
    (dest / "library.json").write_text(json.dumps(lib, ensure_ascii=False, indent=1), encoding="utf-8")
    return lib


if __name__ == "__main__":
    build("stock-music", MUSIC, "music", 6, min_dur=60)
    build("sound-effects", SFX, "sfx2", 8)
