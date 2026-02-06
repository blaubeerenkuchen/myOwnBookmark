from pydantic import BaseModel, HttpUrl
from typing import List, Optional
from datetime import datetime

class Folder(BaseModel):
    id: int
    name: str
    is_default: bool = False

class FolderCreate(BaseModel):
    name: str

class FolderUpdate(BaseModel):
    name: str

class BookmarkCreate(BaseModel):
    url: HttpUrl
    folder_ids: Optional[List[int]] = None

class BookmarkUpdate(BaseModel):
    folder_ids: Optional[List[int]] = None

class Bookmark(BaseModel):
    id: int
    url: HttpUrl
    created_at: datetime
    folder_ids: List[int]

class LinkPreview(BaseModel):
    url: HttpUrl
    title: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    html: Optional[str] = None
    provider: Optional[str] = None
