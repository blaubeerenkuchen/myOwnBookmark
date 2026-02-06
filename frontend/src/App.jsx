import React, { useEffect, useRef, useState } from "react";

export default function App() {
  const [url, setUrl] = useState("");
  const [bookmarks, setBookmarks] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [editFolderId, setEditFolderId] = useState(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, name: "" });
  const [deleteMode, setDeleteMode] = useState("keep");
  const [selectedFolderIds, setSelectedFolderIds] = useState([]);
  const [folderModal, setFolderModal] = useState({ open: false, bookmark: null });
  const [folderModalIds, setFolderModalIds] = useState([]);
  const [previews, setPreviews] = useState({});
  const lastSaveAtRef = useRef(0);
  const lastClipboardRef = useRef("");
  const autoPasteUsedRef = useRef(false);
  const [autoPasted, setAutoPasted] = useState(false);

  async function loadFolders() {
    const res = await fetch("/api/folders");
    setFolders(await res.json());
  }

  async function loadBookmarks(folderId = null) {
    const q = folderId ? `?folder_id=${folderId}` : "";
    const res = await fetch(`/api/bookmarks${q}`);
    setBookmarks(await res.json());
  }

  async function addBookmark(e) {
    e.preventDefault();
    if (!url.trim()) return;
    await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        folder_ids: selectedFolderIds.length > 0 ? selectedFolderIds : undefined,
      }),
    });
    setUrl("");
    setAutoPasted(false);
    lastSaveAtRef.current = Date.now();
    setSelectedFolderIds([]);
    await loadBookmarks(activeFolder);
  }

  async function deleteBookmark(id) {
    await fetch(`/api/bookmarks/${id}`, { method: "DELETE" });
    await loadBookmarks(activeFolder);
  }

  function openFolderModal(bookmark) {
    setFolderModal({ open: true, bookmark });
    setFolderModalIds(bookmark.folder_ids || []);
  }

  function closeFolderModal() {
    setFolderModal({ open: false, bookmark: null });
    setFolderModalIds([]);
  }

  async function saveFolderModal() {
    if (!folderModal.bookmark) return;
    await fetch(`/api/bookmarks/${folderModal.bookmark.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_ids: folderModalIds }),
    });
    closeFolderModal();
    await loadBookmarks(activeFolder);
  }

  async function addFolder(e) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setNewFolderName("");
    await loadFolders();
  }

  async function startEditFolder(folder) {
    setEditFolderId(folder.id);
    setEditFolderName(folder.name);
  }

  async function saveEditFolder(e) {
    e.preventDefault();
    const name = editFolderName.trim();
    if (!name || editFolderId == null) return;
    await fetch(`/api/folders/${editFolderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setEditFolderId(null);
    setEditFolderName("");
    await loadFolders();
  }

  function cancelEditFolder() {
    setEditFolderId(null);
    setEditFolderName("");
  }

  function openDeleteModal(folder) {
    setDeleteMode("keep");
    setDeleteModal({ open: true, id: folder.id, name: folder.name });
  }

  function closeDeleteModal() {
    setDeleteModal({ open: false, id: null, name: "" });
  }

  async function confirmDeleteFolder() {
    if (!deleteModal.id) return;
    await fetch(`/api/folders/${deleteModal.id}?mode=${deleteMode}`, {
      method: "DELETE",
    });
    if (activeFolder === deleteModal.id) {
      setActiveFolder(null);
    }
    closeDeleteModal();
    await loadFolders();
    await loadBookmarks(activeFolder === deleteModal.id ? null : activeFolder);
  }

  useEffect(() => {
    loadFolders();
    loadBookmarks();
  }, []);

  useEffect(() => {
    async function tryPasteFromClipboard() {
      try {
        if (Date.now() - lastSaveAtRef.current < 30000) return;
        const text = await navigator.clipboard.readText();
        if (text !== lastClipboardRef.current) {
          lastClipboardRef.current = text;
          autoPasteUsedRef.current = false;
        }
        if (autoPasteUsedRef.current) return;
        if (text && text !== url && url === "") {
          setUrl(text);
          setAutoPasted(true);
          autoPasteUsedRef.current = true;
        }
      } catch (e) {
        // Clipboard access may be blocked without user interaction.
      }
    }

    tryPasteFromClipboard();

    function onFocus() {
      tryPasteFromClipboard();
    }

    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    async function loadPreviews() {
      const missing = bookmarks.filter((b) => !previews[b.id]);
      if (missing.length === 0) return;
      const entries = await Promise.all(
        missing.map(async (b) => {
          const res = await fetch(`/api/preview?url=${encodeURIComponent(b.url)}`);
          const data = await res.json();
          return [b.id, data];
        })
      );
      if (cancelled) return;
      setPreviews((prev) => {
        const next = { ...prev };
        for (const [id, data] of entries) next[id] = data;
        return next;
      });
    }
    loadPreviews();
    return () => {
      cancelled = true;
    };
  }, [bookmarks, previews]);

  useEffect(() => {
    const hasTwitter = Object.values(previews).some((p) => p && p.html);
    if (!hasTwitter) return;
    if (document.getElementById("twitter-wjs")) {
      if (window.twttr && window.twttr.widgets) {
        window.twttr.widgets.load();
      }
      return;
    }
    const script = document.createElement("script");
    script.id = "twitter-wjs";
    script.async = true;
    script.src = "https://platform.twitter.com/widgets.js";
    script.onload = () => {
      if (window.twttr && window.twttr.widgets) {
        window.twttr.widgets.load();
      }
    };
    document.body.appendChild(script);
  }, [previews, bookmarks]);

  return (
    <div style={{ fontFamily: "sans-serif", padding: 24, maxWidth: 900, border: "1px solid #ddd" }}>
      <h1>MyOwnBookmark MVP</h1>

      <div style={{ border: "1px solid #ddd", padding: 12 }}>
        <form onSubmit={addBookmark} style={{ display: "flex", gap: 8 }}>
        <input
          style={{ flex: 1, padding: 8 }}
          placeholder="Paste tweet URL"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setAutoPasted(false);
          }}
        />
        <button type="submit">Save</button>
        {autoPasted && url && (
          <button
            type="button"
            onClick={() => {
              setUrl("");
              setAutoPasted(false);
            }}
          >
            Clear
          </button>
        )}
        </form>
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {folders.map((f) => (
            <label key={f.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={selectedFolderIds.includes(f.id)}
                onChange={() => {
                  setSelectedFolderIds((prev) =>
                    prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                  );
                }}
              />
              {f.name}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
        <div style={{ width: 240, paddingRight: 16, borderRight: "1px solid #ddd", border: "1px solid #ddd", padding: 12 }}>
          <h3>Folders</h3>
          <form onSubmit={addFolder} style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input
              style={{ flex: 1, padding: 6 }}
              placeholder="New folder"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
            <button type="submit">Add</button>
          </form>
          <ul style={{ listStyle: "none", padding: 0 }}>
            <li>
              <button onClick={() => { setActiveFolder(null); loadBookmarks(); }}>
                All
              </button>
            </li>
            {folders.map((f) => (
              <li key={f.id} style={{ marginTop: 6 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button onClick={() => { setActiveFolder(f.id); loadBookmarks(f.id); }}>
                    {f.name}{f.is_default ? " (default)" : ""}
                  </button>
                  {!f.is_default && (
                    <>
                      <button onClick={() => startEditFolder(f)}>Edit</button>
                      <button onClick={() => openDeleteModal(f)}>Delete</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {editFolderId != null && (
            <form onSubmit={saveEditFolder} style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, marginBottom: 6 }}>Edit folder name</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ flex: 1, padding: 6 }}
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                />
                <button type="submit">Save</button>
                <button type="button" onClick={cancelEditFolder}>Cancel</button>
              </div>
            </form>
          )}
        </div>

        <div style={{ flex: 1, paddingLeft: 16, borderLeft: "1px solid #ddd", border: "1px solid #ddd", padding: 12 }}>
          <h3>Bookmarks</h3>
          {bookmarks.length === 0 ? (
            <p>No bookmarks yet.</p>
          ) : (
            <ul style={{ paddingLeft: 16 }}>
              {bookmarks.map((b) => (
                <li key={b.id} style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    {previews[b.id]?.html ? (
                      <div
                        style={{ border: "1px solid #ddd", borderRadius: 6, padding: 6, overflow: "hidden", maxWidth: 520 }}
                        dangerouslySetInnerHTML={{ __html: previews[b.id].html }}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          border: "1px solid #ddd",
                          borderRadius: 6,
                          overflow: "hidden",
                          width: 300,
                          height: 100,
                        }}
                      >
                        {previews[b.id]?.image ? (
                          <img
                            src={previews[b.id].image}
                            alt=""
                            style={{ width: 100, height: 100, objectFit: "cover" }}
                          />
                        ) : (
                          <div style={{ width: 100, height: 100, background: "#f2f2f2" }} />
                        )}
                        <div style={{ padding: 8, overflow: "hidden", flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {previews[b.id]?.title || b.url}
                          </div>
                          <div style={{ fontSize: 11, color: "#666", marginTop: 4, maxHeight: 48, overflow: "hidden" }}>
                            {previews[b.id]?.description || ""}
                          </div>
                        </div>
                      </div>
                    )}
                  </a>
                  <button onClick={() => openFolderModal(b)}>Folders</button>
                  <button onClick={() => deleteBookmark(b.id)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {deleteModal.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ background: "white", padding: 16, width: 320 }}>
            <h3>Delete folder</h3>
            <p style={{ fontSize: 14 }}>
              Folder: <strong>{deleteModal.name}</strong>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              <label>
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === "keep"}
                  onChange={() => setDeleteMode("keep")}
                />{" "}
                Delete folder only (keep bookmarks)
              </label>
              <label>
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === "delete"}
                  onChange={() => setDeleteMode("delete")}
                />{" "}
                Delete folder and bookmarks
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={closeDeleteModal}>Cancel</button>
              <button onClick={confirmDeleteFolder}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {folderModal.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ background: "white", padding: 16, width: 360 }}>
            <h3>Assign folders</h3>
            <p style={{ fontSize: 12, marginTop: 4, marginBottom: 12 }}>
              {folderModal.bookmark?.url}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {folders.map((f) => (
                <label key={f.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={folderModalIds.includes(f.id)}
                    onChange={() => {
                      setFolderModalIds((prev) =>
                        prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                      );
                    }}
                  />
                  {f.name}{f.is_default ? " (default)" : ""}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={closeFolderModal}>Cancel</button>
              <button onClick={saveFolderModal}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
