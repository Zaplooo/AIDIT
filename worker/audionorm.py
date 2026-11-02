"""Vyrovná hlasitost knihovny: hudba na -20 LUFS (podkres), efekty na špičku -1 dBFS a krátkou hlasitost ~-14 LUFS.
Původní soubory nahradí normalizovanými WAV/MP3 (library.json se aktualizuje)."""
import json, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
FF = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))["ffmpeg"]
def norm(src, dst, target):
    subprocess.run([FF, "-v", "error", "-y", "-i", str(src), "-af", f"loudnorm=I={target}:TP=-1.0:LRA=11", "-ar", "48000", "-ac", "2", "-b:a", "192k", str(dst)], check=True)
for base, target in (("music", -20), ("sfx2", -14)):
    d = ROOT / "public" / base
    lib = json.loads((d / "library.json").read_text(encoding="utf-8"))
    for it in lib:
        src = ROOT / "public" / it["file"]
        dst = src.with_name(src.stem + "_n.mp3")
        if not dst.exists():
            norm(src, dst, target)
            src.unlink()
        it["file"] = f"{base}/{dst.name}"
    (d / "library.json").write_text(json.dumps(lib, ensure_ascii=False, indent=1), encoding="utf-8")
    print(base, len(lib))
# vlastní efekty uživatele (styl-strihu/assets/sfx) – taky vyrovnat
d = ROOT / "public" / "sfx"
for f in d.glob("*.wav"):
    out = d / (f.stem + ".mp3")
    if not out.exists():
        norm(f, out, -14)
print("sfx ok")
