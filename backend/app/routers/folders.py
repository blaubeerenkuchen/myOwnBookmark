from fastapi import APIRouter, HTTPException, Depends
from typing import List
from sqlalchemy.orm import Session

from ..schemas import Folder, FolderCreate, FolderUpdate, Bookmark
from ..db import get_db
from .. import models

router = APIRouter(prefix="/api")


def folder_to_schema(f: models.Folder) -> Folder:
    return Folder(id=f.id, name=f.name, is_default=f.is_default)


def bookmark_to_schema(b: models.Bookmark) -> Bookmark:
    return Bookmark(
        id=b.id,
        url=b.url,
        created_at=b.created_at,
        folder_ids=[f.id for f in b.folders],
        tweet_text=b.tweet_text,
    )


@router.get("/folders", response_model=List[Folder])
def list_folders(db: Session = Depends(get_db)):
    items = db.query(models.Folder).order_by(models.Folder.id.asc()).all()
    return [folder_to_schema(f) for f in items]


@router.post("/folders", response_model=Folder)
def create_folder(payload: FolderCreate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    exists = db.query(models.Folder).filter(models.Folder.name == name).first()
    if exists:
        raise HTTPException(status_code=409, detail="Folder name already exists")
    folder = models.Folder(name=name, is_default=False)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder_to_schema(folder)


@router.patch("/folders/{folder_id}", response_model=Folder)
def update_folder(folder_id: int, payload: FolderUpdate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder.is_default:
        raise HTTPException(status_code=400, detail="Default folder cannot be renamed")
    exists = db.query(models.Folder).filter(models.Folder.name == name, models.Folder.id != folder_id).first()
    if exists:
        raise HTTPException(status_code=409, detail="Folder name already exists")
    folder.name = name
    db.commit()
    db.refresh(folder)
    return folder_to_schema(folder)


@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: int, mode: str = "keep", db: Session = Depends(get_db)):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder.is_default:
        raise HTTPException(status_code=400, detail="Default folder cannot be deleted")
    if mode not in ("keep", "delete"):
        raise HTTPException(status_code=400, detail="mode must be keep or delete")

    default_folder = db.query(models.Folder).filter(models.Folder.is_default == True).first()

    if mode == "delete":
        bookmarks = (
            db.query(models.Bookmark)
            .join(models.Bookmark.folders)
            .filter(models.Folder.id == folder_id)
            .all()
        )
        for b in bookmarks:
            db.delete(b)
        db.commit()
    else:
        bookmarks = (
            db.query(models.Bookmark)
            .join(models.Bookmark.folders)
            .filter(models.Folder.id == folder_id)
            .all()
        )
        for b in bookmarks:
            b.folders = [f for f in b.folders if f.id != folder_id]
            if len(b.folders) == 0 and default_folder is not None:
                b.folders = [default_folder]
        db.commit()

    db.delete(folder)
    db.commit()
    return {"status": "ok"}
