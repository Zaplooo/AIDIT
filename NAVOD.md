# AIDIT – jak na to

## Zapnutí
Dvojklik na **`Spustit AIDIT.cmd`** ve složce aplikace
(nebo v terminálu v té složce: `npm run studio`). Otevře se prohlížeč na **http://localhost:5175**.
Okno terminálu nech otevřené – zavřením se aplikace vypne.

## Hlavní stránka
- Nahoře menu: **Domů**, **Knihovna a můj styl** (grafika, fonty, hudba, efekty, hooky, zoomy, co máš rád / nerad), **Nové video**.
- Uprostřed: **Sestříhat podle odkazu**, **Co chceš stříhat?** (typ videa), **Poslední videa**, naučené styly a klienti.

## Klienti (přednastavený styl)
1. **Nový klient** → jméno → nastavíš mu styl krok za krokem (barva, písmo a titulky, motion grafika, zoomy, hook, hudba, tempo).
2. Na stránce klienta: **Nové video** – video rovnou dostane jeho styl. **Upravit styl** – změní uložený styl pro další videa.
3. U konkrétního videa můžeš styl změnit, aniž by se změnil uložený styl klienta.

## Nové video
1. **Jak je video natočené?**
   - *Surový záznam* – AI vybere povedené pokusy a vystřihne přeřeknutí.
   - *Natočeno po kouscích* – nechá všechny věty, jen zkrátí pauzy.
   - *Už je sestříhané* – nic nestříhá, jen přidá grafiku, titulky a zvuk.
2. **Klipy v pořadí:** přetáhni jeden nebo víc souborů (1, 2, + další klip). Ve videu budou přesně v tomhle pořadí, šipkami ho změníš. Nic se nepřehází.
3. Nepovinně **scénář** – AI podle něj opraví titulky (jména, čísla) a vybere správné pokusy.

## Průvodce (video se mezitím zpracovává)
O videu (chat) → Barva → Písmo a titulky → Motion grafika → Zoomy → Hook → Hudba a zvuky → Tempo a délka → **Souhrn → Stříhej!**
- Na každé kartě stačí najet myší a ukázka se přehraje na tvém záběru, v barvě, kterou jsi vybral.
- **Motion grafika:** vyber libovolné množství šablon, do videa půjdou jen ty. Když nic nevybereš, vybere AI.
- **Hook:** napiš vlastní text, nebo klikni na **Navrhni hooky** (5 návrhů z přepisu). Pak vyber, jak má vypadat (nadpis, rámeček, půlka, celá obrazovka, B-roll, nájezd) a jestli chceš úder na začátku.
- **Hudba:** vybere AI / podle nálady / konkrétní skladba z knihovny / vlastní skladba / bez hudby. Co vybereš, to ve videu bude.
- **Vyber za mě** (nahoře u každého kroku) – AI vybere to, co se hodí k videu.
- **AI lišta dole:** napiš cokoliv („dej tam jen čísla a seznamy“, „klidnější hudbu“, „zelenou barvu“). AI to rovnou nastaví v kartách.

## Stříhej podle odkazu
Na hlavní stránce vlož odkaz na video, které se ti líbí → AI ho rozebere (střihy, tempo, titulky, grafika, zvuk) a ukáže, jak by tvoje video mohlo vypadat. Nahraješ video, AI se doptá a všechno jde upravit.

## Editor
- Uprostřed náhled, pod ním vždy **timeline**, vpravo 4 záložky: **Titulky / Grafika / Zvuk / Styl a délka**. Tlačítko **Přepis** nahoře ukáže věty (✓ ve videu / ✗ vystřižené).
- **Timeline** (tlačítko pod náhledem): stopy Video, Grafika (i Hook), B-roll, Štítky a zoom, **Zvuky**, Titulky, Hudba – na všechno se dá kliknout a upravit.
  - grafiku / B-roll / štítek **táhni** = posun v čase, **táhni okraj** = délka,
  - klik = vpravo úpravy: šablona (při změně ji AI přizpůsobí tomu, co tam říkáš), texty, **font**, **pozice** (9 míst + výš / níž / do boku + velikost), **zvuk** jen pro tuhle grafiku,
  - **Zvuky:** každý efekt je vidět jako blok – táhni = posun, klik = poslech, hlasitost, výměna za jiný, vypnutí. **+ Zvuk** přidá efekt z knihovny nebo **tvůj vlastní** (nahraješ MP3/WAV, uloží se do tvé knihovny pro všechna videa),
  - **Titulky:** klik na titulek = oprava textu a klíčová slova; **Hudba:** hlasitost, jiná skladba, bez hudby; **Hook:** text, vzhled, zvuk,
  - **✨ Vytvořit vlastní na míru (AI)** v nabídce Grafika: AI navrhne grafiku přesně pro to místo ve stylu videa (napiš, co má ukázat),
  - **Načasovat podle řeči:** položky seznamu / karet naskočí přesně ve chvíli, kdy je řekneš,
  - **B-roll:** vyber jiný z nalezených záběrů nebo vyhledej vlastní, „+ B-roll“ přidá záběr na místo přehrávání,
  - **klipy:** táhni = přehodit pořadí, okraje = ořez, „Rozdělit v místě přehrávání“, „Vystřihnout klip“ (ruční střih zamkne automatické přestříhání – jde odemknout).
- **Titulky:** animace jako Submagic – **slovo po slově, karaoke, bounce (Hormozi)**, pružina, zleva…; **emoji u klíčových slov** (vybere AI); **Stáhnout titulky (SRT)** pro YouTube / Premiere. Celkem 22 stylů (dva fonty, aktivní slovo kurzívou / v boxu, obrys, komiks, podklad, Apple, neon, ručně psané…) a pod nimi editor do detailu: font, velikost, řádky, výška, barva, obrys, podklad, **druhý font** (každé 2. / 3. / klíčové slovo) a **aktivní slovo** (font, barva, zvětšení, box, záře). Nebo napiš AI: „každé druhé slovo kurzívou a aktivní slovo žluté v boxu“.
- **Zvuk:** 300+ efektů v 18 kategoriích – poslechni a zaškrtni, které chceš; co se nelíbí, odškrtni.
- **Grafika:** 30 šablon. Najeď = ukázka v barvách videa, klik = přidá se na aktuální místo a AI ji vyplní tím, co tam říkáš.
- **AI lišta pod náhledem:** „titulky menší“, „přidej seznam na 0:12“, „už je to sestříhané, nech střih“, „prohoď klipy 1 a 2“, „klidnější hudba“…
- Ctrl+Z / Ctrl+Y = zpět / znovu. Před každou větší změnou se uloží verze (tlačítko **Verze**).
- **Exportovat** → Reels / TikTok / Shorts / YouTube → soubor je v `Downloads\styl-strihu\export`.

## Můj styl
Vpravo na hlavní stránce záložka **Můj styl**: co máš rád / nerad. AI se tím řídí u každého videa a učí se i sama – z toho, co mažeš a přidáváš, a z vět jako „tohle se mi nelíbí“ v AI liště.

## Čistý střih
Grafiky je méně, ale smysluplné a načasované podle řeči; nic nejde přes tebe (grafika je nad tebou v horní polovině nebo přes celou obrazovku, štítky nahoře nad hlavou). Hranice klipů kontroluje i zvuk – když by střih padl do slova, posune se do ticha.
Po výběru vět běží dvě kontroly: algoritmus vyhodí zdvojené a nedokončené pokusy a AI si přečte hotový text v pořadí, jak jde ve videu, a vyhodí, co se opakuje nebo nenavazuje. Výřez obličeje mezi střihy neposkakuje a mikro-střihy (< 0,15 s) se slučují.

## Co je kde
- `clients/` – klienti a jejich uložené styly
- `prefs.json` – tvůj styl (co máš / nemáš rád)
- `projects/` – videa (`project.json` = celý střih, `versions/` = verze)
- `shared/catalog.json` – barvy, fonty, titulky, zoomy, hooky, šablony grafiky
- `styles/` – recepty stylů z tvých referenčních videí
- `public/music`, `public/sfx`, `public/sfx2` – hudba a efekty (Mixkit, zdarma i komerčně), `public/demo` – ukázkový záběr pro náhledy
