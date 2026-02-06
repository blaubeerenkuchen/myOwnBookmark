from fastapi import FastAPI

from .db import Base, engine, SessionLocal
from .routers import folders, bookmarks, preview
from . import models

app = FastAPI(title="MyOwnBookmark MVP")

@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        default = db.query(models.Folder).filter(models.Folder.is_default == True).first()
        if not default:
            db.add(models.Folder(name="default", is_default=True))
            db.commit()
    finally:
        db.close()

app.include_router(folders.router)
app.include_router(bookmarks.router)
app.include_router(preview.router)
