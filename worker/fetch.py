"""Stáhne video z odkazu (YouTube / Instagram / TikTok) jen pro rozbor stylu. python fetch.py <url> <cílový soubor.mp4>
Používá certifikáty Windows (kvůli antiviru/proxy, která podepisuje HTTPS)."""
import os
import ssl
import sys
from pathlib import Path

import certifi

ROOT = Path(__file__).resolve().parent.parent
bundle = ROOT / "cache" / "winca.pem"
if not bundle.exists():
    bundle.parent.mkdir(parents=True, exist_ok=True)
    pem = Path(certifi.where()).read_text()
    for store in ("ROOT", "CA"):
        for cert, enc, _ in ssl.enum_certificates(store):
            if enc == "x509_asn":
                pem += ssl.DER_cert_to_PEM_cert(cert)
    bundle.write_text(pem)
os.environ["SSL_CERT_FILE"] = os.environ["CURL_CA_BUNDLE"] = os.environ["REQUESTS_CA_BUNDLE"] = str(bundle)
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass
import yt_dlp

url, out = sys.argv[1], Path(sys.argv[2])
out.parent.mkdir(parents=True, exist_ok=True)
opts = {"format": "bv*[height<=1280]+ba/b[height<=1280]/b", "outtmpl": str(out.with_suffix(".%(ext)s")), "merge_output_format": "mp4",
        "noplaylist": True, "quiet": True, "writeinfojson": True,
        "progress_hooks": [lambda d: print(f"PROGRESS {d.get('downloaded_bytes', 0) / max(d.get('total_bytes') or d.get('total_bytes_estimate') or 1, 1):.3f} Stahuji", flush=True) if d.get("status") == "downloading" else None]}
with yt_dlp.YoutubeDL(opts) as y:
    y.download([url])
print("PROGRESS 1 hotovo", flush=True)
