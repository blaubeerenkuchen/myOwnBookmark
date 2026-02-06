from fastapi import APIRouter, HTTPException
from typing import List

from ..schemas import Folder, FolderCreate, FolderUpdate, Bookmark
from .. import storage

router = APIRouter(prefix="/api")

@router.get("/folders", response_model=List[Folder])
def list_folders():
    return storage.folders

@router.post("/folders", response_model=Folder)
def create_folder(payload: FolderCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    if any(f.name == name for f in storage.folders):
        raise HTTPException(status_code=409, detail="Folder name already exists")
    folder = Folder(id=storage.next_folder_id, name=name, is_default=False)
    storage.next_folder_id += 1
    storage.folders.append(folder)
    return folder

@router.patch("/folders/{folder_id}", response_model=Folder)
def update_folder(folder_id: int, payload: FolderUpdate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    if any(f.name == name and f.id != folder_id for f in storage.folders):
        raise HTTPException(status_code=409, detail="Folder name already exists")
    for idx, f in enumerate(storage.folders):
        if f.id == folder_id:
            if f.is_default:
                raise HTTPException(status_code=400, detail="Default folder cannot be renamed")
            storage.folders[idx] = Folder(id=f.id, name=name, is_default=f.is_default)
            return storage.folders[idx]
    raise HTTPException(status_code=404, detail="Folder not found")

@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: int, mode: str = "keep"):
    """
    mode=keep  -> remove folder only, keep bookmarks
    mode=delete -> delete bookmarks linked to this folder
    """
    folder = next((f for f in storage.folders if f.id == folder_id), None)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder.is_default:
        raise HTTPException(status_code=400, detail="Default folder cannot be deleted")
    if mode not in ("keep", "delete"):
        raise HTTPException(status_code=400, detail="mode must be keep or delete")

    if mode == "delete":
        storage.bookmarks = [b for b in storage.bookmarks if folder_id not in b.folder_ids]
    else:
        for i, b in enumerate(storage.bookmarks):
            if folder_id in b.folder_ids:
                updated_folder_ids = [fid for fid in b.folder_ids if fid != folder_id]
                if len(updated_folder_ids) == 0:
                    updated_folder_ids = [f.id for f in storage.folders if f.is_default]
                storage.bookmarks[i] = Bookmark(
                    id=b.id,
                    url=b.url,
                    created_at=b.created_at,
                    folder_ids=updated_folder_ids,
                )

    storage.folders[:] = [f for f in storage.folders if f.id != folder_id]
    return {"status": "ok"}
