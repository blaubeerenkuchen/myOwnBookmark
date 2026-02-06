from sqlalchemy import Column, Integer, String, Boolean, DateTime, Table, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from .db import Base

bookmark_folders = Table(
    "bookmark_folders",
    Base.metadata,
    Column("bookmark_id", ForeignKey("bookmarks.id"), primary_key=True),
    Column("folder_id", ForeignKey("folders.id"), primary_key=True),
)

class Folder(Base):
    __tablename__ = "folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)

    bookmarks = relationship("Bookmark", secondary=bookmark_folders, back_populates="folders")

class Bookmark(Base):
    __tablename__ = "bookmarks"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, unique=True, index=True, nullable=False)
    tweet_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    folders = relationship("Folder", secondary=bookmark_folders, back_populates="bookmarks")
