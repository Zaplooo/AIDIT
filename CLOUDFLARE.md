# AIDIT přes Cloudflare (Tunnel + Access)

AIDIT potřebuje Python, ffmpeg, Whisper a Claude Code – to Cloudflare Pages/Workers spustit neumí.
Aplikace proto běží na tvém PC a **Cloudflare Tunnel** ji bezpečně vystaví na tvé doméně.
**Cloudflare Access** zajistí, že se dostaneš jen ty (jinak by kdokoliv mohl používat tvé Claude předplatné a disk).

## 1. Doména v Cloudflaru
Cloudflare dashboard → **Add a domain** → přidej svou doménu a u registrátora přepiš nameservery na ty od Cloudflaru
(nemáš-li doménu, kup ji přímo v Cloudflare: **Domain Registration → Register Domains**).

## 2. Tunnel
1. **Zero Trust** (levé menu) → **Networks → Tunnels → Create a tunnel** → typ **Cloudflared** → jméno `aidit`.
2. Vyber **Windows**, zkopíruj příkaz `cloudflared.exe service install <TOKEN>` a spusť ho v PowerShellu **jako správce**
   (nejdřív nainstaluj cloudflared: `winget install --id Cloudflare.cloudflared`).
   Tunel pak běží jako služba Windows a naběhne sám po startu PC.
3. **Public Hostname → Add a public hostname**:
   - Subdomain: `aidit`, Domain: tvoje doména
   - Service: **HTTP**, URL: `localhost:5175`
   - Uložit.

## 3. Přístup jen pro tebe (Access)
1. **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Application domain: `aidit.tvojedomena.cz`.
3. Policy: **Allow** → Include → **Emails** → tvůj e-mail.
4. Login method: **One-time PIN** (kód přijde e-mailem).

## 4. Používání
- Na PC musí běžet AIDIT (ikona na ploše / `Spustit AIDIT.cmd`). Když PC spí nebo je AIDIT vypnutý, stránka nepojede.
- Otevři `https://aidit.tvojedomena.cz`, zadej e-mail → kód → jsi v AIDIT.
- Velká videa: Cloudflare (Free) pustí jeden upload do **100 MB**. Delší záznamy nahrávej doma přes `http://localhost:5175`
  nebo rozděl na kratší klipy.

## Rychlý test bez domény
`cloudflared tunnel --url http://localhost:5175` vypíše dočasnou adresu `https://…trycloudflare.com`
(bez přihlášení – jen na krátké vyzkoušení, pak ji vypni Ctrl+C).
