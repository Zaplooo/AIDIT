"""Zpracování videa pro Goat Studio. Každý krok čte/zapisuje soubory ve složce projektu.

  python pipeline.py ingest     <projekt>   # ffprobe, proxy.mp4 (HDR -> SDR), audio16k.wav, voice.wav
  python pipeline.py transcribe <projekt>   # faster-whisper large-v3, čeština, slova s časy -> words.json
  python pipeline.py units      <projekt>   # věty a pokusy -> units.json (AI z nich vybere poslední povedené)
  python pipeline.py cut        <projekt>   # výběr + ticho + vatová slova -> clips.json
  python pipeline.py faces      <projekt>   # poloha obličeje v čase (pro reframe) -> faces.json

Průběh se hlásí řádky „PROGRESS 0.42 text“ na stdout, server je čte.
"""
import json
import os
import re
import subprocess
import sys
import wave
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
FFMPEG, FFPROBE = CONFIG.get("ffmpeg", "ffmpeg"), CONFIG.get("ffprobe", "ffprobe")


def progress(p, msg=""):
    print(f"PROGRESS {p:.3f} {msg}", flush=True)


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} selhal: {r.stderr[-1500:]}")
    return r.stdout


def run_ffmpeg_progress(cmd, duration, p0, p1, msg):
    """Spustí ffmpeg s -progress a průběžně hlásí procenta."""
    proc = subprocess.Popen(cmd[:1] + ["-progress", "pipe:1", "-nostats"] + cmd[1:], stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
    for line in proc.stdout:
        if line.startswith("out_time_us=") and duration:
            try:
                t = int(line.split("=")[1]) / 1e6
                progress(p0 + (p1 - p0) * min(t / duration, 1), msg)
            except ValueError:
                pass
    err = proc.stderr.read()
    if proc.wait() != 0:
        raise RuntimeError(f"ffmpeg selhal: {err[-1500:]}")


# ---------------------------------------------------------------- ingest
def probe(src):
    info = json.loads(run([FFPROBE, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(src)]))
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    w, h = int(v["width"]), int(v["height"])
    rot = 0
    for sd in v.get("side_data_list", []):
        if "rotation" in sd:
            rot = int(sd["rotation"])
    if abs(rot) in (90, 270):
        w, h = h, w
    num, den = (v.get("avg_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 30.0
    fps = 30 if fps < 20 or fps > 61 else round(fps)
    has_audio = any(s["codec_type"] == "audio" for s in info["streams"])
    return {"w": w, "h": h, "fps": fps, "duration": float(info["format"]["duration"]),
            "hdr": v.get("color_transfer") in ("arib-std-b67", "smpte2084"), "audio": has_audio}


def video_filter(info, pw, ph, pad=False):
    fit = f"scale={pw}:{ph}:force_original_aspect_ratio=decrease:flags=bicubic,pad={pw}:{ph}:(ow-iw)/2:(oh-ih)/2" if pad else f"scale={pw}:{ph}:flags=bicubic"
    if info["hdr"]:  # iPhone HLG -> SDR; nejdřív zmenšit (10bit), pak převod barev – ~4× rychlejší než na 4K
        return (f"{fit},zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,"
                f"zscale=t=bt709:m=bt709:r=tv,format=yuv420p")
    return f"{fit},format=yuv420p"


def ingest(proj: Path):
    """Jeden nebo víc klipů (natočeno po kouscích) -> jedno proxy video v pořadí nahrání. meta.segments = kde který klip
    v proxy začíná a končí (pořadí jde později změnit bez nového převodu)."""
    meta = json.loads((proj / "meta.json").read_text(encoding="utf-8"))
    sources = meta.get("sources") or [{"file": meta["sourceFile"], "name": meta.get("name", "")}]
    infos = [probe(proj / s["file"]) for s in sources]
    first = infos[0]
    w, h, fps = first["w"], first["h"], first["fps"]
    total = sum(i["duration"] for i in infos)
    # proxy: max 1920 px na delší straně, H.264, hustý keyframe (rychlé posouvání v prohlížeči)
    scale = 1920 / max(w, h)
    pw, ph = int(round(w * scale / 2) * 2), int(round(h * scale / 2) * 2)
    enc = ["-r", str(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-g", str(fps // 2)]
    segments, done = [], 0.0
    if len(sources) == 1:
        progress(0.02, "Převádím video na náhledovou verzi")
        run_ffmpeg_progress([FFMPEG, "-v", "error", "-y", "-hwaccel", "auto", "-i", str(proj / sources[0]["file"]), "-vf", video_filter(first, pw, ph),
                             *enc, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(proj / "proxy.mp4")], first["duration"], 0.02, 0.8, "Převádím video")
        audio_src = proj / sources[0]["file"]
        segments.append({"start": 0.0, "end": round(first["duration"], 3), "name": sources[0].get("name", "")})
    else:
        parts = []
        for k, (s, info) in enumerate(zip(sources, infos)):
            part = proj / f"_part{k:02d}.mov"
            src = proj / s["file"]
            ins = ["-i", str(src)] if info["audio"] else ["-i", str(src), "-f", "lavfi", "-t", f"{info['duration']:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
            amap = ["-map", "0:v:0", "-map", "0:a:0"] if info["audio"] else ["-map", "0:v:0", "-map", "1:a:0"]
            p0 = 0.02 + 0.78 * done / total
            done += info["duration"]
            run_ffmpeg_progress([FFMPEG, "-v", "error", "-y", "-hwaccel", "auto", *ins, *amap, "-vf", video_filter(info, pw, ph, pad=True), *enc,
                                 "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", "-shortest", str(part)],
                                info["duration"], p0, 0.02 + 0.78 * done / total, f"Převádím klip {k + 1} / {len(sources)}")
            parts.append(part)
        # skutečné délky převedených klipů -> segmenty v čase proxy
        t = 0.0
        for k, part in enumerate(parts):
            d = probe(part)["duration"]
            segments.append({"start": round(t, 3), "end": round(t + d, 3), "name": sources[k].get("name", "")})
            t += d
        (proj / "_parts.txt").write_text("".join(f"file '{p.name}'\n" for p in parts), encoding="utf-8")
        progress(0.8, "Spojuji klipy za sebe")
        run([FFMPEG, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(proj / "_parts.txt"), "-c:v", "copy", "-c:a", "pcm_s16le", str(proj / "_joined.mov")])
        run([FFMPEG, "-v", "error", "-y", "-i", str(proj / "_joined.mov"), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(proj / "proxy.mp4")])
        audio_src = proj / "_joined.mov"
    progress(0.82, "Připravuji zvuk")
    run([FFMPEG, "-v", "error", "-y", "-i", str(audio_src), "-vn", "-ac", "1", "-ar", "16000", str(proj / "audio16k.wav")])
    # hlas: jemné odšumění, ořez basů pod 80 Hz, komprese (hlasitost -14 LUFS se dorovná při exportu)
    run([FFMPEG, "-v", "error", "-y", "-i", str(audio_src), "-vn", "-af",
         "afftdn=nf=-25,highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2",
         "-ac", "2", "-ar", "48000", str(proj / "voice.wav")])
    for f in proj.glob("_part*"):
        f.unlink()
    for f in ("_parts.txt", "_joined.mov"):
        (proj / f).unlink(missing_ok=True)
    duration = probe(proj / "proxy.mp4")["duration"]
    # znovu načíst: během převodu mohl autor v průvodci měnit odpovědi (chat, nastavení) – nesmí se přepsat
    meta = json.loads((proj / "meta.json").read_text(encoding="utf-8"))
    meta.update({"width": pw, "height": ph, "fps": fps, "duration": round(duration, 3), "hdr": any(i["hdr"] for i in infos), "segments": segments})
    (proj / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    progress(1, "Hotovo")


# ---------------------------------------------------------------- transcribe
def transcribe(proj: Path):
    from faster_whisper import WhisperModel
    progress(0.01, "Načítám Whisper large-v3")
    model = WhisperModel(CONFIG["whisperModel"], device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 8)
    with wave.open(str(proj / "audio16k.wav"), "rb") as wf:
        pcm = wf.readframes(wf.getnframes())
    import numpy as np
    pcm = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    total = len(pcm) / 16000
    segments, _ = model.transcribe(
        pcm, language="cs", word_timestamps=True, vad_filter=False, beam_size=5, condition_on_previous_text=False,
        # vatová slova a zkažené pokusy chceme vidět, aby šly vystřihnout
        initial_prompt="Ehm, no, takže... Tohle je přepis včetně vatových slov, opakování a přeřeknutí.")
    words = []
    for seg in segments:
        for w in seg.words:
            t = w.word.strip()
            if t:
                words.append({"text": t, "start": round(w.start, 3), "end": round(w.end, 3), "p": round(w.probability, 2)})
        progress(min(seg.end / total, 0.99), f"Přepisuji řeč ({seg.end / 60:.1f} / {total / 60:.1f} min)")
    (proj / "words.json").write_text(json.dumps(words, ensure_ascii=False, indent=1), encoding="utf-8")
    progress(1, f"{len(words)} slov")


# ---------------------------------------------------------------- analyze
FILLERS = {"ehm", "eh", "ehh", "hm", "hmm", "mhm", "ee", "eee", "éé", "ééé", "em", "uh", "um", "öh"}


def norm(t):
    return re.sub(r"[^\wáčďéěíňóřšťúůýž]", "", t.lower())


def tok_eq(a, b):
    return a == b or (len(a) > 3 and len(b) > 3 and (a[:4] == b[:4] or SequenceMatcher(None, a, b).ratio() >= 0.75))


def head_match(ta, tb, n=3):
    """Kolik z prvních n slov dvou frází se (zhruba) shoduje – poznává nový pokus téže věty."""
    n = min(n, len(ta), len(tb))
    return sum(tok_eq(x, y) for x, y in zip(ta[:n], tb[:n])) / n if n else 0


def load_words(proj):
    wf = proj / "words_fixed.json" if (proj / "words_fixed.json").exists() else proj / "words.json"
    words = json.loads(wf.read_text(encoding="utf-8"))
    for i, w in enumerate(words):
        w["i"] = i
        w["n"] = norm(w["text"])
        # Whisper občas natáhne slovo přes dlouhé ticho / nepřepsanou řeč -> slovo je na konci rozsahu
        if w["end"] - w["start"] > 1.2:
            w["start"] = round(w["end"] - 0.5, 3)
    return words


def retime(proj: Path):
    """Vybrané věty přepíše ještě jednou zvlášť -> přesné časy slov (střih nepadne doprostřed slova).
    Text zůstává (i s opravami od AI), mění se jen časy."""
    from faster_whisper import WhisperModel
    import numpy as np
    words = load_words(proj)
    us = json.loads((proj / "units.json").read_text(encoding="utf-8"))
    sel_file = proj / "selection.json"
    keep = set(json.loads(sel_file.read_text(encoding="utf-8"))["keep"]) if sel_file.exists() else {u["id"] for u in us if not u["retake"]}
    todo = [u for u in us if u["id"] in keep]
    progress(0.02, "Zpřesňuji časy slov")
    model = WhisperModel(CONFIG["whisperModel"], device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 8)
    with wave.open(str(proj / "audio16k.wav"), "rb") as wf:
        pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    for k, u in enumerate(todo):
        old = [words[i] for i in u["words"]]
        a = max(old[0]["start"] - 0.4, 0)
        b = min(old[-1]["end"] + 0.4, len(pcm) / 16000)
        segs, _ = model.transcribe(pcm[int(a * 16000): int(b * 16000)], language="cs", word_timestamps=True, beam_size=5,
                                   condition_on_previous_text=False, vad_filter=False)
        new = [(norm(w.word), round(w.start + a, 3), round(w.end + a, 3)) for sg in segs for w in sg.words if norm(w.word)]
        sm = SequenceMatcher(None, [o["n"] for o in old], [n[0] for n in new], autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
                for d in range(i2 - i1):
                    old[i1 + d]["start"], old[i1 + d]["end"] = new[j1 + d][1], new[j1 + d][2]
        progress((k + 1) / len(todo), f"Zpřesňuji časy slov ({k + 1}/{len(todo)})")
    out = [{kk: w[kk] for kk in ("text", "start", "end", "p") if kk in w} for w in words]
    (proj / "words_fixed.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


def units(proj: Path):
    """Rozdělí řeč na krátké jednotky (věty / pokusy): pauza >= 0,25 s, konec věty, nebo nový začátek téže věty
    („už tě nebaví… už tě nebaví…“). Ke každé jednotce heuristicky odhadne, jestli je to přeřeknutí
    (záloha, když AI výběr není k dispozici). -> units.json"""
    words = load_words(proj)
    progress(0.1, "Dělím řeč na věty a pokusy")
    out, cur = [], []
    for w in words:
        if cur:
            gap = w["start"] - cur[-1]["end"]
            ta = [x["n"] for x in cur if x["n"]]
            # nový pokus: další 3 slova se shodují se začátkem aktuální jednotky
            nxt = [x["n"] for x in words[w["i"]: w["i"] + 3] if x["n"]]
            restart = len(ta) >= 3 and len(nxt) == 3 and head_match(ta, nxt) >= 1
            # návrat uprostřed věty: další 3 slova už v posledních ~14 slovech zazněla („jak zvýšit tvoji… jak zvýšit tvoji energii“)
            if not restart and len(ta) >= 4 and len(nxt) == 3:
                tail = ta[-14:]
                restart = any(tail[k:k + 3] == nxt for k in range(len(tail) - 2))
            if gap >= 0.25 or restart:
                out.append(cur); cur = []
        cur.append(w)
        if w["text"][-1:] in ".?!…":
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    res = []
    for k, u in enumerate(out):
        toks = [x["n"] for x in u if x["n"]]
        filler = all(t in FILLERS for t in toks) if toks else True
        retake = False
        for v in out[k + 1: k + 9]:
            if v[0]["start"] - u[-1]["end"] > 60:
                break
            tv = [x["n"] for x in v if x["n"]]
            if len(toks) >= 2 and len(tv) >= 2 and (head_match(toks, tv) >= 0.67 or
                                                     SequenceMatcher(None, toks, tv[:len(toks)]).ratio() >= 0.7):
                retake = True
                break
        res.append({"id": f"u{k + 1}", "start": u[0]["start"], "end": u[-1]["end"], "words": [x["i"] for x in u],
                    "text": " ".join(x["text"] for x in u), "retake": retake, "filler": filler})
    (proj / "units.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    progress(1, f"{len(res)} jednotek")


def rms_env(proj):
    import numpy as np
    with wave.open(str(proj / "audio16k.wav"), "rb") as wf:
        pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    hop = 160  # 10 ms
    n = len(pcm) // hop
    return np.sqrt((pcm[: n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12)


def snap(env, t, lo, hi):
    """Posune hranici střihu na nejtišší místo v okně [t+lo, t+hi] (aby střih nepadl do hlásky)."""
    a, b = max(int((t + lo) * 100), 0), min(int((t + hi) * 100), len(env) - 1)
    if b <= a:
        return t
    seg = env[a: b + 1]
    return (a + int(seg.argmin())) / 100


def cut(proj: Path):
    """Z jednotek a výběru (selection.json od AI, jinak heuristika) poskládá klipy. Vystřižené jsou v seznamu
    taky (enabled=false + důvod), aby šly v timeline vrátit. Hranice se dorovnají na ticho. -> clips.json"""
    meta = json.loads((proj / "meta.json").read_text(encoding="utf-8"))
    opts = meta.get("options", {})
    max_pause = float(opts.get("maxPause", 0.5))
    # Pauzy se nemažou celé, ale ZKRACUJÍ na přirozenou délku (jako profesionální střih):
    #   uvnitř věty: ticho delší než max_pause se zkrátí na intra_keep
    #   mezi větami / pokusy: zůstane krátký nádech break_keep
    intra_keep = float(opts.get("intraKeep", min(0.18, max_pause * 0.6)))
    break_keep = float(opts.get("breakKeep", max(0.22, max_pause * 0.9)))
    words = load_words(proj)
    us = json.loads((proj / "units.json").read_text(encoding="utf-8"))
    sel_file = proj / "selection.json"
    sel = json.loads(sel_file.read_text(encoding="utf-8")) if sel_file.exists() else None
    reasons = (sel or {}).get("reasons", {})
    keep_ids = set(sel["keep"]) if sel else {u["id"] for u in us if not (u["filler"] or (u["retake"] and opts.get("removeRetakes", True)))}
    if not opts.get("removeRetakes", True):
        keep_ids |= {u["id"] for u in us if not u["filler"]}
    fillers = {w["i"] for w in words if w["n"] in FILLERS} if opts.get("removeFillers", True) else set()
    env = rms_env(proj)
    dur = meta["duration"]
    segs = meta.get("segments") or [{"start": 0.0, "end": dur}]
    order = opts.get("order") or list(range(len(segs)))
    order = [k for k in order if 0 <= k < len(segs)]
    order += [k for k in range(len(segs)) if k not in order]
    rank = {k: r for r, k in enumerate(order)}

    def seg_of(t):
        for k, sg in enumerate(segs):
            if t < sg["end"] - 0.01:
                return k
        return len(segs) - 1

    mode = opts.get("cutMode", "full")
    if mode == "none":
        # video už je sestříhané -> nic nevystřihovat, jen klipy v pořadí
        merged = []
        for k in order:
            sg = segs[k]
            merged.append({"id": f"c{len(merged) + 1}", "in": round(sg["start"], 3), "out": round(sg["end"], 3), "enabled": True, "reason": None,
                           "words": [w["i"] for w in words if sg["start"] <= w["start"] < sg["end"]]})
        (proj / "clips.json").write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")
        progress(1, f"{len(merged)} klipů beze změny")
        return
    if mode == "pauses":
        keep_ids = {u["id"] for u in us if not u["filler"]}
    progress(0.4, "Skládám klipy")
    clips = []
    import numpy as np
    db = 20 * np.log10(env + 1e-9)
    db = np.convolve(db, np.ones(3) / 3, mode="same")
    floor, loud = np.percentile(db, 10), np.percentile(db, 95)
    thr = floor + max(6.0, 0.22 * (loud - floor))  # nad tímhle je řeč (včetně tichých koncovek s, š, ch)
    speech = db > thr
    # úseky ticha ve zvuku (>= 60 ms) – střih smí padnout JEN do ticha, nikdy do plynulé řeči
    sil, run_s = [], None
    for k, sp in enumerate(speech):
        if not sp and run_s is None:
            run_s = k
        elif sp and run_s is not None:
            if k - run_s >= 6:
                sil.append((run_s / 100, k / 100))
            run_s = None
    if run_s is not None:
        sil.append((run_s / 100, len(speech) / 100))
    import bisect
    sil_starts = [x[0] for x in sil]

    def silence_after(t, keep, wd=0.0):
        """Konec řeči kolem konce slova t: ticho, které t obsahuje (Whisper konec natáhl) nebo první ticho po něm.
        Střih = část povolené pauzy po začátku ticha (dozvuk + nádech).
        Normálně dlouhé slovo (wd < 0,7 s) se NIKDY neusekne: tichá koncovka (s, š, ch, „-ní“) pod prahem řeči
        vypadá jako ticho, proto střih nesmí padnout před konec slova. Jen „natažené“ slovo smí končit dřív."""
        i = max(bisect.bisect_right(sil_starts, t) - 1, 0)
        while i < len(sil) and sil[i][1] < t - 0.12:
            i += 1
        floor = t - 0.04 if wd < 0.7 else t - 1.5
        if i < len(sil) and sil[i][0] <= t + 0.6:
            st = max(sil[i][0], t - 1.5)
            return max(min(st + max(0.06, keep * 0.6), sil[i][1] - 0.01), min(floor + 0.08, dur))
        return min(t + 0.06, dur)

    def silence_before(t, keep, wd=0.0):
        """Nástup řeči kolem začátku slova t. Střih = zbytek povolené pauzy před nástupem hlasu.
        Tichý začátek slova („Tomu“, „A“, „jít“) pod prahem řeči vypadá jako ticho – u normálně dlouhého
        slova proto střih nesmí začít po jeho začátku (jinak by se slovo useklo)."""
        i = bisect.bisect_right(sil_starts, t + 0.12) - 1
        cap = t + 0.03 if wd < 0.7 else t + 1.5
        if i >= 0 and sil[i][1] >= t - 0.6:
            en = min(sil[i][1], t + 1.5)
            return max(min(en - max(0.04, keep * 0.4), cap), sil[i][0] + 0.01, 0)
        return max(t - 0.04, 0)

    def real_gap(w1, w2):
        """Nejdelší skutečné ticho mezi dvěma slovy (podle zvuku, ne podle časů Whisperu)."""
        best = None
        i = bisect.bisect_left(sil_starts, w1["end"] - 0.15)
        while i < len(sil) and sil[i][0] < w2["start"] + 0.1:
            s0, e0 = sil[i]  # celé ticho (Whisper často „natáhne“ slovo přes ticho)
            if best is None or e0 - s0 > best[1] - best[0]:
                best = (s0, e0)
            i += 1
        return best

    def add(ws, enabled, reason, a=None, b=None):
        a = silence_before(ws[0]["start"], break_keep, ws[0]["end"] - ws[0]["start"]) if a is None else a
        b = silence_after(ws[-1]["end"], break_keep, ws[-1]["end"] - ws[-1]["start"]) if b is None else b
        if b - a < 0.08:
            b = a + 0.08
        clips.append({"id": "", "in": round(a, 3), "out": round(b, 3), "enabled": enabled, "reason": reason,
                      "words": [x["i"] for x in ws], "unit": None})

    for u in us:
        ws = [words[i] for i in u["words"]]
        if u["id"] not in keep_ids:
            add(ws, False, reasons.get(u["id"]) or ("vatové slovo" if u["filler"] else "přeřeknutí"))
            continue
        run_, run_a = [], None
        for w in ws:
            if w["i"] in fillers:
                if run_:
                    add(run_, True, None, a=run_a); run_, run_a = [], None
                add([w], False, "vatové slovo")
                continue
            if run_ and w["start"] - run_[-1]["end"] > 0.9:
                # dlouhý úsek bez přepsaného slova = nepřepsaná řeč (zkažený pokus) nebo ticho -> nikdy do videa
                add(run_, True, None, a=run_a)
                run_, run_a = [], None
            if run_:
                g = real_gap(run_[-1], w)
                sentence = run_[-1]["text"][-1:] in ".?!"
                keep = break_keep if sentence else intra_keep
                # dělit jen tam, kde je ve zvuku opravdu pauza delší než povolená -> zkrátit ji na `keep`
                if g and g[1] - g[0] > max(max_pause, keep + 0.08):
                    # hranice nikdy uvnitř slova (tichá koncovka / tichý začátek vypadá ve zvuku jako ticho)
                    pw = run_[-1]
                    b_end = g[0] + keep * 0.6
                    if pw["end"] - pw["start"] < 0.7:
                        b_end = max(b_end, pw["end"] + 0.03)
                    a_next = g[1] - keep * 0.4
                    if w["end"] - w["start"] < 0.7:
                        a_next = min(a_next, w["start"] + 0.02)
                    if a_next - b_end < 0.12:  # po ohlídání slov by se vystřihlo méně než 0,12 s -> nestříhat
                        run_.append(w)
                        continue
                    add(run_, True, None, a=run_a, b=b_end)
                    run_, run_a = [], a_next
            run_.append(w)
        if run_:
            add(run_, True, None, a=run_a)
    # každé ticho uvnitř povoleného klipu delší než povolená pauza vystřihnout (i když leží „uvnitř“ slova)
    split = []
    for c in clips:
        if not c["enabled"]:
            split.append(c); continue
        cur_in = c["in"]
        i = bisect.bisect_left(sil_starts, c["in"] + 0.02)
        while i < len(sil) and sil[i][1] < c["out"] - 0.02:
            s0, e0 = sil[i]
            mid = (s0 + e0) / 2
            inside = any(words[k]["start"] < mid < words[k]["end"] and words[k]["end"] - words[k]["start"] < 0.7 for k in c["words"])
            if inside:  # „ticho“ je ve skutečnosti tiše vyslovené slovo -> nesahat
                i += 1
                continue
            if e0 - s0 > max(max_pause, intra_keep + 0.08) and s0 > cur_in + 0.08:
                split.append({**c, "in": round(cur_in, 3), "out": round(s0 + intra_keep * 0.6, 3), "words": [k for k in c["words"] if words[k]["start"] < s0 + 0.03]})
                cur_in = e0 - intra_keep * 0.4
            elif e0 - s0 > max(max_pause, break_keep) and s0 <= cur_in + 0.08:
                cur_in = max(cur_in, e0 - break_keep * 0.4)  # dlouhé ticho hned na začátku klipu
            i += 1
        split.append({**c, "in": round(cur_in, 3), "words": [k for k in c["words"] if words[k]["end"] > cur_in + 0.03]})
    clips = [c for c in split if c["out"] - c["in"] >= 0.08]
    # poslední pojistka podle ZVUKU: když hranice klipu padne do řeči (useklo by to hlásku na začátku nebo konci),
    # posune se do nejbližšího ticha – ale jen když ticho přijde do 0,3 s (jinak je to souvislá řeč a hranici nechat)
    n_env = len(speech)
    for c in clips:
        if not c["enabled"]:
            continue
        a_ = int(c["in"] * 100)
        k = 0
        while 0 < a_ < n_env and speech[a_] and k < 30:
            a_ -= 1; k += 1
        if 0 < k < 30:
            c["in"] = round(max(a_ / 100 - 0.03, 0), 3)
        b_ = int(c["out"] * 100)
        k = 0
        while 0 <= b_ < n_env and speech[b_] and k < 30:
            b_ += 1; k += 1
        if 0 < k < 30:
            c["out"] = round(min(b_ / 100 + 0.05, dur), 3)
    clips.sort(key=lambda c: c["in"])
    # sousední povolené klipy spojit, když by střih vyhodil jen < 0,15 s – takový skok v obraze vypadá jako zaseknutí, ne jako střih
    merged = []
    for c in clips:
        p = merged[-1] if merged else None
        if p and p["enabled"] and c["enabled"] and c["in"] - p["out"] <= 0.15 and seg_of(p["in"]) == seg_of(c["in"]):
            p["out"] = c["out"]; p["words"] += c["words"]
        else:
            merged.append(c)
    for a, b in zip(merged, merged[1:]):
        if a["out"] > b["in"] and seg_of(a["in"]) == seg_of(b["in"]):
            mid = round((a["out"] + b["in"]) / 2, 3); a["out"] = mid; b["in"] = mid
    # zakoktání na hranici klipů: konec klipu A = začátek klipu B („Je | Je extrémně důležité“, „nové | nové sporty“)
    # -> zakoktaná verze pryč (celý klíp, když je to jen ten zárodek, jinak se jeho konec zkrátí před opakovaná slova)
    def heard(c):  # slova, která v klipu opravdu zazní (stejné pravidlo jako titulky)
        return [w for w in words if w["n"] and w["n"] not in FILLERS and min(w["end"], c["out"]) - max(w["start"], c["in"]) >= min(0.5 * (w["end"] - w["start"]), 0.12)]

    on = [c for c in merged if c["enabled"]]
    for a, b in zip(on, on[1:]):
        ta = heard(a)
        tb = heard(b)
        if not ta or not tb:
            continue
        for kk in (3, 2, 1):
            if len(ta) < kk or len(tb) < kk:
                continue
            if [w["n"] for w in ta[-kk:]] != [w["n"] for w in tb[:kk]]:
                continue
            if len(ta) <= kk:
                a["enabled"] = False
                a["reason"] = "zakoktání (opakuje se hned v dalším klipu)"
            else:
                first = ta[-kk]
                a["out"] = round(max(a["in"] + 0.1, first["start"] - 0.03), 3)
                a["words"] = [k for k in a["words"] if words[k]["start"] < first["start"] - 0.01]
                if a["out"] - a["in"] < 0.25 or not heard(a):  # po zkrácení nic nezbylo
                    a["enabled"] = False
                    a["reason"] = "zakoktání (opakuje se hned v dalším klipu)"
            break
    # klip, ve kterém nezazní žádné slovo (útržek ticha / nádechu), do videa nepatří
    for c in merged:
        if c["enabled"] and not heard(c) and len(merged) > 1:
            c["enabled"] = False
            c["reason"] = "bez řeči"
    # klipy z víc nahraných souborů v pořadí, které autor chce (stabilně, uvnitř souboru podle času)
    if len(segs) > 1:
        merged.sort(key=lambda c: (rank[seg_of(c["in"])], c["in"]))
    # „začni touhle větou“ (odpověď na otázku AI o hooku) -> její klipy na začátek
    first = (sel or {}).get("first")
    if first:
        fu = next((u for u in us if u["id"] == first), None)
        if fu:
            fw = set(fu["words"])
            head = [c for c in merged if c["enabled"] and fw & set(c["words"])]
            merged = head + [c for c in merged if c not in head]
    for k, c in enumerate(merged):
        c["id"] = f"c{k + 1}"
        c.pop("unit", None)
    (proj / "clips.json").write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")
    on = [c for c in merged if c["enabled"]]
    progress(1, f"{len(on)} klipů, {sum(c['out'] - c['in'] for c in on):.1f} s")



# ---------------------------------------------------------------- montáž (videa bez mluvení: produkt, nemovitost, reklama)
def music_beats(music_file, dur_limit=180.0):
    """Takty hudby: obálka nástupů (energie) -> tempo autokorelací (70–160 BPM) -> fáze s nejsilnějšími údery."""
    import numpy as np
    sr = 22050
    raw = subprocess.run([FFMPEG, "-v", "error", "-i", str(music_file), "-t", str(dur_limit), "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                         capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if len(x) < sr * 4:
        return None
    hop = 512
    n = len(x) // hop
    e = np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-9)
    onset = np.maximum(0, np.diff(np.log(e + 1e-6), prepend=0))
    onset -= onset.mean()
    fr = sr / hop
    ac = np.correlate(onset, onset, mode="full")[len(onset) - 1:]
    lo, hi = int(fr * 60 / 160), int(fr * 60 / 70)
    lag = lo + int(np.argmax(ac[lo:hi]))
    period = lag / fr
    best, phase = -1, 0
    for ph in range(lag):
        sc = onset[ph::lag].sum()
        if sc > best:
            best, phase = sc, ph
    t0 = phase / fr
    return {"bpm": round(60 / period, 1), "period": period, "beats": [round(t0 + k * period, 3) for k in range(int((n / fr - t0) / period))]}


def montage(proj: Path):
    """Z nahraných záběrů (meta.segments) složí střih do taktu hudby: z každého záběru 1–3 hezké kousky
    (bez rozjezdu a dojezdu kamery), délka záběru = 2 nebo 4 doby podle tempa, pořadí jako při nahrání. -> clips.json"""
    meta = json.loads((proj / "meta.json").read_text(encoding="utf-8"))
    opts = meta.get("options", {})
    segs = meta.get("segments") or [{"start": 0.0, "end": meta["duration"]}]
    order = opts.get("order") or list(range(len(segs)))
    order = [k for k in order if 0 <= k < len(segs)] + [k for k in range(len(segs)) if k not in (opts.get("order") or [])]
    target = float(opts.get("targetLen") or 0) or min(45.0, max(12.0, sum(sg["end"] - sg["start"] for sg in segs) * 0.5))
    mb = None
    mf = opts.get("musicFile")
    if mf:
        cand = [ROOT / "public" / mf, proj / mf.split("?")[0]]
        src = next((c for c in cand if c.exists()), None)
        if src:
            mb = music_beats(src)
    period = mb["period"] if mb else 0.5
    beats_per_shot = 4 if period * 4 <= 2.6 else 2  # záběr ~1,6–2,6 s
    shot = period * beats_per_shot
    n_shots = max(len(segs), int(round(target / shot)))
    usable = []
    for k in order:
        sg = segs[k]
        a, b = sg["start"] + 0.5, sg["end"] - 0.4  # bez rozjezdu a dojezdu kamery
        if b - a < shot * 0.6:
            a, b = sg["start"], sg["end"]
        usable.append((k, a, b))
    total = sum(b - a for _, a, b in usable) or 1
    clips = []
    for k, a, b in usable:
        cnt = max(1, min(3, round(n_shots * (b - a) / total), int((b - a) // max(shot, 0.5)) or 1))
        for j in range(cnt):
            ln = min(shot, b - a)
            st = a + (b - a - ln) * ((j + 1) / (cnt + 1)) if cnt > 1 else a + (b - a - ln) * 0.45
            fps = meta.get("fps", 30)
            inF = round(st * fps)
            durF = max(1, round(ln * fps))  # celé snímky -> střihy nesklouzávají z taktu
            clips.append({"id": "", "in": round(inF / fps, 4), "out": round((inF + durF) / fps, 4), "enabled": True, "reason": None, "words": []})
    for i, c in enumerate(clips):
        c["id"] = f"c{i + 1}"
    (proj / "clips.json").write_text(json.dumps(clips, ensure_ascii=False, indent=1), encoding="utf-8")
    info = {"bpm": mb["bpm"] if mb else None, "shot": round(shot, 3), "count": len(clips), "musicStart": mb["beats"][0] if mb and mb["beats"] else 0}
    (proj / "montage.json").write_text(json.dumps(info), encoding="utf-8")
    progress(1, f"{len(clips)} záběrů do rytmu" + (f" ({mb['bpm']} BPM)" if mb else ""))


# ---------------------------------------------------------------- faces
def faces(proj: Path):
    """Obličej každých 0,25 s (OpenCV Haar). Výstup: [{t, x, y, w}] v poměru k šířce/výšce (0–1)."""
    import cv2
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    cap = cv2.VideoCapture(str(proj / "proxy.mp4"))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    # stačí se dívat do použitých klipů (2× za sekundu); bez clips.json celé video po 1 s
    cf = proj / "clips.json"
    times = []
    if cf.exists():
        for c in json.loads(cf.read_text(encoding="utf-8")):
            if c["enabled"]:
                t = c["in"]
                while t < c["out"]:
                    times.append(t); t += 0.5
    else:
        times = [k for k in range(int(n / fps))]
    out = []
    for k, t in enumerate(times):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, img = cap.read()
        if not ok:
            continue
        h, w = img.shape[:2]
        s = 480 / max(w, h)
        g = cv2.cvtColor(cv2.resize(img, (int(w * s), int(h * s))), cv2.COLOR_BGR2GRAY)
        found = det.detectMultiScale(g, 1.1, 5, minSize=(30, 30))
        if len(found):
            x, y, fw, fh = max(found, key=lambda r: r[2] * r[3])
            out.append({"t": round(t, 3), "x": round((x + fw / 2) / g.shape[1], 4),
                        "y": round((y + fh / 2) / g.shape[0], 4), "w": round(fw / g.shape[1], 4)})
        if k % 10 == 0:
            progress(k / max(len(times), 1), "Hledám obličej")
    (proj / "faces.json").write_text(json.dumps(out), encoding="utf-8")
    progress(1, f"{len(out)} detekcí")


# ---------------------------------------------------------------- base (souvislé video ze střihu)
FORMATS = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}
GRADES = {
    "none": "",
    "cinematic": "eq=contrast=1.08:brightness=-0.045:saturation=0.82,colorbalance=rs=-0.02:bs=0.04:rh=0.02:bh=-0.02,vignette=PI/4.5",
    "dark": "eq=contrast=1.12:brightness=-0.07:saturation=0.78,colorbalance=rs=-0.03:bs=0.05,vignette=PI/4",
    "warm": "eq=contrast=1.04:saturation=1.05,colorbalance=rs=0.04:gs=0.01:bs=-0.03",
}


def base(proj: Path, quality="preview"):
    """Z project.json udělá jedno souvislé video (střihy, výřez na obličej, přiblížení na střizích, barevný tón)
    + souvislý zvuk s mikro-prolnutím na střizích (bez lupnutí a bez propadů). Náhled pak přehrává jediný soubor,
    takže se nic neseká. quality = preview (540p, rychle) | full (plné rozlišení pro export)."""
    pj = json.loads((proj / "project.json").read_text(encoding="utf-8"))
    fps = pj["source"]["fps"]
    sw, sh = pj["source"]["width"], pj["source"]["height"]
    W, H = FORMATS[pj["format"]]
    if quality == "preview":
        W, H = W // 2, H // 2
    look = pj.get("look", {})
    grade = GRADES.get(look.get("grade", "none"), "")
    punch = look.get("jump") == "punch"
    clips = []
    for c in pj["clips"]:
        if not c["enabled"]:
            continue
        inF = round(c["in"] * fps)
        durF = max(1, round(c["out"] * fps) - inF)
        clips.append((c, inF, durF))
    tmp = proj / f"_base_{quality}"
    tmp.mkdir(exist_ok=True)
    total = sum(d for _, _, d in clips)
    # --- zvuk: jeden vstup, přesné výřezy po snímcích, 8 ms prolnutí na každém střihu
    filt, labels = [], []
    for k, (c, inF, durF) in enumerate(clips):
        a, b = inF / fps, (inF + durF) / fps
        filt.append(f"[0:a]atrim=start={a:.5f}:end={b:.5f},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st={max(b - a - 0.012, 0):.5f}:d=0.012[a{k}]")
        labels.append(f"[a{k}]")
    filt.append("".join(labels) + f"concat=n={len(clips)}:v=0:a=1[aout]")
    (tmp / "audio.txt").write_text(";\n".join(filt), encoding="utf-8")
    run([FFMPEG, "-v", "error", "-y", "-i", str(proj / "voice.wav"), "-/filter_complex", str(tmp / "audio.txt"),
         "-map", "[aout]", "-ar", "48000", "-ac", "2", str(tmp / "audio.wav")])
    progress(0.1, "Skládám obraz")
    # --- obraz: po dávkách (méně otevřených souborů), každý klip -ss přímo na snímek
    parts, done = [], 0
    for ci in range(0, len(clips), 30):
        chunk = clips[ci: ci + 30]
        args, filt, labels = [], [], []
        for k, (c, inF, durF) in enumerate(chunk):
            args += ["-ss", f"{inF / fps:.5f}", "-i", str(proj / "proxy.mp4")]
            z = 1.12 if punch and (ci + k) % 2 == 1 else 1.0
            sc = max(W / sw, H / sh) * z
            vw, vh = int(round(sw * sc / 2) * 2), int(round(sh * sc / 2) * 2)
            face = c.get("face") or {"x": 0.5, "y": 0.4}
            x = min(max(face["x"] * vw - W / 2, 0), vw - W)
            y = min(max(face["y"] * vh - H * 0.4, 0), vh - H)
            g = ("," + grade) if grade else ""
            filt.append(f"[{k}:v]trim=end_frame={durF},setpts=PTS-STARTPTS,scale={vw}:{vh}:flags=bicubic,"
                        f"crop={W}:{H}:{int(x)}:{int(y)}{g},setsar=1,format=yuv420p[v{k}]")
            labels.append(f"[v{k}]")
        filt.append("".join(labels) + f"concat=n={len(chunk)}:v=1:a=0[vout]")
        (tmp / f"v{ci}.txt").write_text(";\n".join(filt), encoding="utf-8")
        part = tmp / f"part{ci:04d}.mp4"
        enc = (["-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-g", str(fps // 2)] if quality == "preview"
               else ["-c:v", "libx264", "-preset", "medium", "-crf", "14", "-g", str(fps)])
        run([FFMPEG, "-v", "error", "-y", *args, "-/filter_complex", str(tmp / f"v{ci}.txt"), "-map", "[vout]",
             "-r", str(fps), *enc, str(part)])
        parts.append(part)
        done += sum(d for _, _, d in chunk)
        progress(0.1 + 0.85 * done / max(total, 1), "Skládám obraz")
    (tmp / "parts.txt").write_text("".join(f"file '{p.name}'\n" for p in parts), encoding="utf-8")
    out = proj / f"base_{quality}.mp4"
    run([FFMPEG, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(tmp / "parts.txt"), "-i", str(tmp / "audio.wav"),
         "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k" if quality == "full" else "160k",
         "-movflags", "+faststart", str(out)])
    for f in tmp.iterdir():
        f.unlink()
    tmp.rmdir()
    progress(1, f"{total / fps:.1f} s")



# ---------------------------------------------------------------- B-roll (stock záběry z Mixkitu)
def broll(proj: Path):
    """Pro každý B-roll v plánu stáhne záběr (cache v cache/broll) a připraví klip ve formátu videa
    (výřez na střed, barevný tón stylu, 30 fps, délka podle plánu). -> projects/<id>/broll/<beat>.mp4"""
    pj = json.loads((proj / "project.json").read_text(encoding="utf-8"))
    items = [{"id": b["id"], "mixkit": b["broll"]["mixkit"], "dur": b.get("dur", 1.5)}
             for b in pj.get("plan", {}).get("beats", []) if b.get("kind") == "broll" and b.get("broll", {}).get("mixkit")]
    W, H = FORMATS[pj["format"]]
    grade = GRADES.get(pj.get("look", {}).get("grade", "none"), "")
    cache = ROOT / "cache" / "broll"
    cache.mkdir(parents=True, exist_ok=True)
    out = proj / "broll"
    out.mkdir(exist_ok=True)
    for f in out.glob("*.mp4"):
        f.unlink()
    for k, b in enumerate(items):
        mid = b["mixkit"]
        src = cache / f"{mid}.mp4"
        if not src.exists():
            for q in ("1080", "720"):
                subprocess.run(["curl.exe", "-s", "-f", "--ssl-no-revoke", "-A", "Mozilla/5.0", "-o", str(src),
                                f"https://assets.mixkit.co/videos/{mid}/{mid}-{q}.mp4"])
                if src.exists() and src.stat().st_size > 10000:
                    break
        if not src.exists():
            continue
        info = json.loads(run([FFPROBE, "-v", "error", "-print_format", "json", "-show_format", str(src)]))
        sdur = float(info["format"]["duration"])
        need = float(b.get("dur", 1.5)) + 0.4
        start = max(0.0, min(sdur * 0.3, sdur - need - 0.1))
        g = ("," + grade) if grade else ""
        dst = out / f"{b['id']}.mp4"
        if dst.exists() and dst.stat().st_mtime > src.stat().st_mtime and b.get("cached", True):
            pass
        run([FFMPEG, "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", f"{need:.2f}", "-i", str(src),
             "-vf", f"framerate=fps={pj['source']['fps']},scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H}{g},setsar=1,format=yuv420p",
             "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-g", "15", str(dst)])
        progress((k + 1) / max(len(items), 1), f"B-roll {k + 1}/{len(items)}")
    # do střihu jen záběry, které se opravdu připravily (jinak by spadl náhled i export)
    pj = json.loads((proj / "project.json").read_text(encoding="utf-8"))
    ok = {f.stem for f in out.glob("*.mp4") if f.stat().st_size > 10000}
    beats = []
    for b in pj.get("plan", {}).get("beats", []):
        if b.get("kind") == "broll":
            if b["id"] not in ok:
                continue
            b["broll"]["ready"] = True
        beats.append(b)
    pj["plan"]["beats"] = beats
    (proj / "project.json").write_text(json.dumps(pj, ensure_ascii=False, indent=1), encoding="utf-8")
    progress(1, f"{len(ok)} záběrů")


if __name__ == "__main__":
    cmd, proj = sys.argv[1], Path(sys.argv[2])
    if cmd == "base":
        base(proj, sys.argv[3] if len(sys.argv) > 3 else "preview")
    else:
        {"ingest": ingest, "transcribe": transcribe, "units": units, "retime": retime, "cut": cut, "faces": faces, "broll": broll, "montage": montage}[cmd](proj)
