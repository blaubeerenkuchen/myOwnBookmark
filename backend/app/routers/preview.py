from fastapi import APIRouter, HTTPException
import json
import re
import urllib.parse
import urllib.request

from ..schemas import LinkPreview

router = APIRouter(prefix="/api")

@router.get("/preview", response_model=LinkPreview)
def get_preview(url: str):
    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Invalid URL")

    # Try X/Twitter oEmbed first for richer preview
    if re.search(r"https?://(x\.com|twitter\.com)/", url, re.IGNORECASE):
        oembed_url = "https://publish.twitter.com/oembed?" + urllib.parse.urlencode({"url": url})
        try:
            req = urllib.request.Request(
                oembed_url,
                headers={"User-Agent": "MyOwnBookmarkPreview/1.0"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                raw = resp.read(500_000)
                data = json.loads(raw.decode("utf-8", errors="ignore"))
                return LinkPreview(
                    url=url,
                    title=data.get("title"),
                    html=data.get("html"),
                    provider=data.get("provider_name"),
                )
        except Exception:
            pass

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "MyOwnBookmarkPreview/1.0"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = resp.read(1_000_000)
            html = raw.decode("utf-8", errors="ignore")
    except Exception:
        return LinkPreview(url=url)

    def find_meta(prop_name: str):
        pattern = rf'<meta[^>]+(?:property|name)="{re.escape(prop_name)}"[^>]+content="([^"]+)"'
        m = re.search(pattern, html, re.IGNORECASE)
        return m.group(1).strip() if m else None

    title = find_meta("og:title")
    description = find_meta("og:description") or find_meta("description")
    image = find_meta("og:image")

    if not title:
        m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
        if m:
            title = m.group(1).strip()

    if image:
        image = urllib.parse.urljoin(url, image)

    return LinkPreview(url=url, title=title, description=description, image=image)
