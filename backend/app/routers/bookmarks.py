from fastapi import APIRouter, HTTPException
from typing import List, Optional
from datetime import datetime

from ..schemas import Bookmark, BookmarkCreate, BookmarkUpdate
from .. import storage

router = APIRouter(prefix="/api")

@router.post("/bookmarks", response_model=Bookmark)
def create_bookmark(payload: BookmarkCreate):
    folder_ids = payload.folder_ids or [f.id for f in storage.folders if f.is_default]
    bookmark = Bookmark(
        id=storage.next_bookmark_id,
        url=payload.url,
        created_at=datetime.utcnow(),
        folder_ids=folder_ids,
    )
    storage.next_bookmark_id += 1
    storage.bookmarks.append(bookmark)
    return bookmark

@router.get("/bookmarks", response_model=List[Bookmark])
def list_bookmarks(folder_id: Optional[int] = None):
    items = sorted(storage.bookmarks, key=lambda b: b.created_at, reverse=True)
    if folder_id is None:
        return items
    return [b for b in items if folder_id in b.folder_ids]

@router.patch("/bookmarks/{bookmark_id}", response_model=Bookmark)
def update_bookmark(bookmark_id: int, payload: BookmarkUpdate):
    default_ids = [f.id for f in storage.folders if f.is_default]
    folder_ids = payload.folder_ids
    if folder_ids is None or len(folder_ids) == 0:
        folder_ids = default_ids
    for i, b in enumerate(storage.bookmarks):
        if b.id == bookmark_id:
            updated = Bookmark(
                id=b.id,
                url=b.url,
                created_at=b.created_at,
                folder_ids=folder_ids,
            )
            storage.bookmarks[i] = updated
            return updated
    raise HTTPException(status_code=404, detail="Bookmark not found")

@router.delete("/bookmarks/{bookmark_id}")
def delete_bookmark(bookmark_id: int):
    if not any(b.id == bookmark_id for b in storage.bookmarks):
        raise HTTPException(status_code=404, detail="Bookmark not found")
    storage.bookmarks = [b for b in storage.bookmarks if b.id != bookmark_id]
    return {"status": "ok"}
