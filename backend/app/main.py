from fastapi import FastAPI

from .routers import folders, bookmarks, preview

app = FastAPI(title="MyOwnBookmark MVP")
app.include_router(folders.router)
app.include_router(bookmarks.router)
app.include_router(preview.router)
