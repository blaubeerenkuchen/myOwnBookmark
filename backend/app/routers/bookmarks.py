from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime
import json
import re
import html as html_lib
import urllib.parse
import urllib.request
from sqlalchemy.orm import Session

from ..schemas import Bookmark, BookmarkCreate, BookmarkUpdate
from ..db import get_db
from .. import models

router = APIRouter(prefix="/api")


def bookmark_to_schema(b: models.Bookmark) -> Bookmark:
    return Bookmark(
        id=b.id,
        url=b.url,
        created_at=b.created_at,
        folder_ids=[f.id for f in b.folders],
        tweet_text=b.tweet_text,
    )


def extract_text_from_oembed(oembed_html: str) -> Optional[str]:
    if not oembed_html:
        return None
    text = re.sub(r"<[^>]+>", " ", oembed_html)
    text = html_lib.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def fetch_tweet_text(url: str) -> Optional[str]:
    if not re.search(r"https?://(x\.com|twitter\.com)/", url, re.IGNORECASE):
        return None
    oembed_url = "https://publish.twitter.com/oembed?" + urllib.parse.urlencode({"url": url})
    try:
        req = urllib.request.Request(
            oembed_url,
            headers={"User-Agent": "MyOwnBookmarkPreview/1.0"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = resp.read(500_000)
            data = json.loads(raw.decode("utf-8", errors="ignore"))
            return extract_text_from_oembed(data.get("html", ""))
    except Exception:
        return None


@router.post("/bookmarks", response_model=Bookmark)
def create_bookmark(payload: BookmarkCreate, db: Session = Depends(get_db)):
    default_folder = db.query(models.Folder).filter(models.Folder.is_default == True).first()
    folder_ids = payload.folder_ids or ([default_folder.id] if default_folder else [])
    folders = []
    if folder_ids:
        folders = db.query(models.Folder).filter(models.Folder.id.in_(folder_ids)).all()

    tweet_text = payload.tweet_text
    if tweet_text is None:
        tweet_text = fetch_tweet_text(str(payload.url))

    bookmark = models.Bookmark(
        url=str(payload.url),
        tweet_text=tweet_text,
        created_at=datetime.utcnow(),
        folders=folders,
    )
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)
    return bookmark_to_schema(bookmark)


@router.get("/bookmarks", response_model=List[Bookmark])
def list_bookmarks(
    folder_id: Optional[int] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Bookmark)
    if folder_id is not None:
        query = query.join(models.Bookmark.folders).filter(models.Folder.id == folder_id)
    if q:
        like = f"%{q}%"
        query = query.filter(models.Bookmark.tweet_text.ilike(like))
    items = query.order_by(models.Bookmark.created_at.desc()).all()
    return [bookmark_to_schema(b) for b in items]


@router.patch("/bookmarks/{bookmark_id}", response_model=Bookmark)
def update_bookmark(bookmark_id: int, payload: BookmarkUpdate, db: Session = Depends(get_db)):
    bookmark = db.query(models.Bookmark).filter(models.Bookmark.id == bookmark_id).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    if payload.folder_ids is not None:
        if len(payload.folder_ids) == 0:
            default_folder = db.query(models.Folder).filter(models.Folder.is_default == True).first()
            bookmark.folders = [default_folder] if default_folder else []
        else:
            folders = db.query(models.Folder).filter(models.Folder.id.in_(payload.folder_ids)).all()
            bookmark.folders = folders

    if payload.tweet_text is not None:
        bookmark.tweet_text = payload.tweet_text

    db.commit()
    db.refresh(bookmark)
    return bookmark_to_schema(bookmark)


@router.delete("/bookmarks/{bookmark_id}")
def delete_bookmark(bookmark_id: int, db: Session = Depends(get_db)):
    bookmark = db.query(models.Bookmark).filter(models.Bookmark.id == bookmark_id).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    db.delete(bookmark)
    db.commit()
    return {"status": "ok"}
