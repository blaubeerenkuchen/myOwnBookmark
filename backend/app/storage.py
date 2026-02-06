from .schemas import Folder, Bookmark

# In-memory storage for MVP
folders = [Folder(id=1, name="default", is_default=True)]
bookmarks = []
next_folder_id = 2
next_bookmark_id = 1
