# AIDIT

<img src="public/aidit-logo.png" width="96" alt="AIDIT" />

AI střih videí: Reels / TikTok, YouTube, podcasty, produktová videa, nemovitosti a reklamy.
Nahraješ video, vybereš typ (nebo vložíš odkaz na video, které se ti líbí) a AIDIT ho sestříhá.
Všechno pak jde upravit v timeline nebo napsat AI.

## Jak to běží

AIDIT je lokální aplikace – běží na tvém počítači:

- **server** (Node.js + Express + Vite) – `server/`
- **zpracování videa** (Python: ffmpeg, faster-whisper, OpenCV) – `worker/`
- **náhled a export** (Remotion) – `src/remotion/`
- **AI** přes Claude Code (`claude -p`) na předplatné autora

Z jiných zařízení ho otevřeš přes **Tailscale** (bez limitu velikosti videa):
na PC `tailscale serve --bg 5175`, na mobilu / notebooku aplikace Tailscale se stejným účtem → `https://<pc>.<tailnet>.ts.net`.
Veřejně na vlastní doméně přes **Cloudflare Tunnel** (postup v [CLOUDFLARE.md](CLOUDFLARE.md), upload max. 100 MB).

## Spuštění

1. Node.js 20+, Python 3.12 (`pip install faster-whisper opencv-python numpy`), ffmpeg, Claude Code.
2. `npm install`
3. Zkopíruj `config.example.json` na `config.json` a doplň cesty.
4. `npm run studio` (nebo dvojklik na `Spustit AIDIT.cmd`) → http://localhost:5175

### Hudba, efekty a náhledy (nejsou v repozitáři)
Hudba a zvukové efekty jsou z Mixkitu (Mixkit Free License) a veřejně se nešíří – stáhni si je skripty:

```
python worker/audiolib.py   # hudba (public/music) + základní efekty
python worker/sfxlib.py     # rozšířená knihovna efektů (public/sfx2)
```

Ukázkový záběr pro náhledy v průvodci vytvoříš z vlastního videa: `node scripts/make_demo.mjs <projekt> <od_s>`,
náhledové obrázky šablon: `node scripts/gfxtest.mjs <projekt> public/tpl/ brand`.

Podrobný návod k ovládání je v [NAVOD.md](NAVOD.md).
