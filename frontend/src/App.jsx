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
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showFolderPanel, setShowFolderPanel] = useState(false);

  async function loadFolders() {
    const res = await fetch("/api/folders");
    setFolders(await res.json());
  }

  async function loadBookmarks(folderId = null, query = "") {
    const params = new URLSearchParams();
    if (folderId) params.set("folder_id", String(folderId));
    if (query) params.set("q", query);
    const qs = params.toString();
    const res = await fetch(`/api/bookmarks${qs ? `?${qs}` : ""}`);
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
    await loadBookmarks(activeFolder, searchQuery);
  }

  async function deleteBookmark(id) {
    await fetch(`/api/bookmarks/${id}`, { method: "DELETE" });
    await loadBookmarks(activeFolder, searchQuery);
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
    await loadBookmarks(activeFolder, searchQuery);
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
    await loadBookmarks(activeFolder === deleteModal.id ? null : activeFolder, searchQuery);
  }

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

  useEffect(() => {
    loadFolders();
    loadBookmarks();
  }, []);

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

  const selectedCount = selectedFolderIds.length;
  const allCount = bookmarks.length;
  const countsByFolder = folders.reduce((acc, f) => {
    acc[f.id] = bookmarks.filter((b) => b.folder_ids.includes(f.id)).length;
    return acc;
  }, {});

  return (
    <div style={{ background: "#f4f7fb", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap');
        :root { --blue: #2d63ff; --blue-soft: #e9f0ff; --card: #ffffff; --border: #e2e8f0; --text: #0f172a; --muted: #64748b; }
        * { box-sizing: border-box; }
        body { margin: 0; }
        .app-wrap { max-width: 960px; margin: 0 auto; padding: 28px 24px 48px; font-family: 'Noto Sans KR', 'Montserrat', sans-serif; color: var(--text); }
        .title { text-align: center; font-family: 'Montserrat', 'Noto Sans KR', sans-serif; font-size: 32px; font-weight: 700; color: #1770e6; margin-bottom: 4px; }
        .subtitle { text-align: center; color: var(--muted); margin-bottom: 24px; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
        .input-card { padding: 18px; margin-bottom: 22px; width: 100%; }
        .row { display: flex; gap: 18px; width: 100%; align-items: flex-start; }
        .left-col { position: sticky; top: 24px; align-self: flex-start; width: 320px; }
        .right-col { flex: 1; }
        .mobile-toggles { display: none; }
        .left-panels { display: flex; flex-direction: column; gap: 12px; }
        .input-row { display: flex; gap: 12px; }
        .input { flex: 1; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: #f8fafc; }
        .input input { border: none; outline: none; background: transparent; width: 100%; font-size: 14px; }
        .btn { border: none; border-radius: 10px; padding: 12px 18px; cursor: pointer; font-weight: 600; }
        .btn.primary { background: linear-gradient(135deg, #88b3ff, #6cc4d9); color: #fff; min-width: 96px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .btn.ghost { background: #eef2ff; color: #334155; }
        .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; background: #fff; cursor: pointer; font-size: 13px; }
        .chip.active { background: var(--blue); color: #fff; border-color: var(--blue); }
        .chip .badge { background: #e2e8f0; color: #1e293b; border-radius: 999px; padding: 2px 8px; font-size: 11px; }
        .section { padding: 18px; }
        .section-title { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; margin-bottom: 12px; }
        .folder-list { display: grid; gap: 8px; }
        .folder-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; background: #f8fafc; border: 1px solid transparent; }
        .folder-item.active { border-color: var(--blue); background: var(--blue-soft); }
        .folder-actions { display: flex; gap: 6px; }
        .tiny-btn { border: none; padding: 6px 8px; border-radius: 8px; cursor: pointer; background: #edf2ff; color: #334155; font-size: 12px; }
        .badge { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 22px; padding: 0 8px; border-radius: 999px; background: #e2e8f0; color: #1e293b; font-size: 11px; margin-left: auto; }
        .bookmark-list { display: grid; gap: 12px; }
        .bookmark-card { border: 1px solid var(--border); border-radius: 12px; padding: 12px; background: #fff; }
        .bookmark-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
        .pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: #eef2ff; color: #334155; font-size: 12px; }
        .bottom-help { position: fixed; right: 18px; bottom: 18px; width: 36px; height: 36px; border-radius: 999px; background: #fff; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 16px rgba(15, 23, 42, 0.1); }
        @media (max-width: 600px) {
          .row { flex-direction: column; }
          .left-col { position: static; width: 100%; }
          .right-col { width: 100%; max-width: 100%; }
          .mobile-toggles { display: flex; gap: 8px; margin-bottom: 8px; }
          .left-panels { display: none; }
          .left-panels.open { display: flex; }
          .bookmark-card iframe,
          .bookmark-card .twitter-tweet { max-width: 100% !important; }
        }
        @media (max-width: 480px) {
          .app-wrap { max-width: 100%; padding: 18px 14px 40px; }
          .title { font-size: 24px; }
          .subtitle { font-size: 13px; margin-bottom: 16px; }
          .input-row { flex-direction: column; }
          .btn.primary { width: 100%; }
          .chips { gap: 6px; }
          .chip { font-size: 12px; padding: 7px 10px; }
          .bookmark-card { padding: 10px; }
          .bookmark-actions { justify-content: flex-start; flex-wrap: wrap; }
          .bottom-help { right: 12px; bottom: 12px; }
        }
        .muted { color: var(--muted); font-size: 13px; }
      `}</style>

      <div className="app-wrap">
        <div className="title">MyOwnBookmark</div>
        <div className="subtitle">트위터 북마크를 체계적으로 관리하세요</div>

        <div className="card input-card">
          <div className="input-row">
            <div className="input">
              <span className="muted">🔗</span>
              <input
                placeholder="트위터 URL을 붙여넣으세요... (예: https://twitter.com/...)"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setAutoPasted(false);
                }}
                onFocus={() => {
                  tryPasteFromClipboard();
                }}
              />
            </div>
            <button className="btn primary" type="button" onClick={addBookmark}>
              ✓ 저장
            </button>
            {autoPasted && url && (
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setUrl("");
                  setAutoPasted(false);
                }}
              >
                Clear
              </button>
            )}
          </div>

          <div style={{ marginTop: 10 }} className="muted">
            저장할 폴더 선택 ({selectedCount}개 선택됨)
          </div>
          <div className="chips">
            {folders.map((f) => {
              const active = selectedFolderIds.includes(f.id);
              return (
                <button
                  key={f.id}
                  className={`chip ${active ? "active" : ""}`}
                  type="button"
                  onClick={() => {
                    setSelectedFolderIds((prev) =>
                      prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                    );
                  }}
                >
                  <span>📁</span>
                  {f.name}{f.is_default ? " (기본)" : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div className="row">
          <div className="left-col">
            <div className="mobile-toggles">
              <button
                className="btn ghost"
                type="button"
                onClick={() => setShowSearchPanel((v) => !v)}
              >
                검색 {showSearchPanel ? "닫기" : "열기"}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => setShowFolderPanel((v) => !v)}
              >
                폴더 {showFolderPanel ? "닫기" : "열기"}
              </button>
            </div>
            <div className={`left-panels ${showSearchPanel ? "open" : ""}`}>
              <div className="card section">
              <div className="section-title">
                <span>🔎</span>
                검색
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  loadBookmarks(activeFolder, searchQuery);
                  setHasSearched(true);
                }}
                style={{ display: "flex", gap: 8 }}
              >
                <input
                  style={{ flex: 1, padding: "0 12px", height: 40, borderRadius: 10, border: "1px solid var(--border)" }}
                  placeholder="트윗 텍스트 검색"
                  value={searchQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSearchQuery(next);
                  }}
                />
                <button className="btn primary" type="submit" style={{ height: 40, minWidth: 80, padding: "0 14px" }}>
                  검색
                </button>
              </form>
              </div>
            </div>

            <div className={`left-panels ${showFolderPanel ? "open" : ""}`}>
              <div className="card section">
            <div className="section-title">
              <span>📂</span>
              폴더
            </div>

            <form onSubmit={addFolder} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid var(--border)" }}
                placeholder="새 폴더 이름"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <button className="btn primary" type="submit" style={{ height: 40, minWidth: 80, padding: "0 14px" }}>추가</button>
            </form>

            <div className="folder-list">
              <div className={`folder-item ${activeFolder === null ? "active" : ""}`}>
                <button
                  type="button"
                  className="tiny-btn"
                  onClick={() => {
                    setActiveFolder(null);
                    loadBookmarks(null, searchQuery);
                  }}
                >
                  모든 북마크
                </button>
                <span className="badge">{allCount}</span>
              </div>

              {folders.map((f) => (
                <div key={f.id} className={`folder-item ${activeFolder === f.id ? "active" : ""}`}>
                  <button
                    type="button"
                    className="tiny-btn"
                  onClick={() => {
                    setActiveFolder(f.id);
                    loadBookmarks(f.id, searchQuery);
                  }}
                >
                    {f.name}{f.is_default ? " (기본)" : ""}
                  </button>
                  <span className="badge">{countsByFolder[f.id] || 0}</span>
                  {!f.is_default && (
                    <div className="folder-actions">
                      <button type="button" className="tiny-btn" onClick={() => startEditFolder(f)}>Edit</button>
                      <button type="button" className="tiny-btn" onClick={() => openDeleteModal(f)}>Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {editFolderId != null && (
              <form onSubmit={saveEditFolder} style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Edit folder name</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}
                    value={editFolderName}
                    onChange={(e) => setEditFolderName(e.target.value)}
                  />
                  <button type="submit" className="tiny-btn">Save</button>
                  <button type="button" className="tiny-btn" onClick={cancelEditFolder}>Cancel</button>
                </div>
              </form>
            )}
              </div>
            </div>
          </div>

          <div className="card section right-col">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                <span>🔖</span>
                북마크 ({bookmarks.length})
              </div>
              {hasSearched && (
                <button
                  className="tiny-btn"
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setHasSearched(false);
                    loadBookmarks(activeFolder, "");
                  }}
                >
                  초기화
                </button>
              )}
            </div>

            {bookmarks.length === 0 ? (
              <div className="muted">No bookmarks yet.</div>
            ) : (
              <div className="bookmark-list">
                {bookmarks.map((b) => (
                  <div key={b.id} className="bookmark-card">
                    {previews[b.id]?.html ? (
                      <div
                        style={{ overflow: "hidden" }}
                        dangerouslySetInnerHTML={{ __html: previews[b.id].html }}
                      />
                    ) : (
                      <div style={{ display: "flex", gap: 12 }}>
                        {previews[b.id]?.image ? (
                          <img
                            src={previews[b.id].image}
                            alt=""
                            style={{ width: 96, height: 96, borderRadius: 10, objectFit: "cover" }}
                          />
                        ) : (
                          <div style={{ width: 96, height: 96, borderRadius: 10, background: "#f1f5f9" }} />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>
                            {previews[b.id]?.title || b.url}
                          </div>
                          <div className="muted" style={{ marginBottom: 8 }}>
                            {previews[b.id]?.description || ""}
                          </div>
                          <div className="pill">📁 {b.folder_ids.map((id) => folders.find((f) => f.id === id)?.name).filter(Boolean).join(", ")}</div>
                        </div>
                      </div>
                    )}

                    <div className="bookmark-actions">
                      <button className="tiny-btn" onClick={() => openFolderModal(b)}>Folders</button>
                      <a className="tiny-btn" href={b.url} target="_blank" rel="noreferrer">원본 보기</a>
                      <button className="tiny-btn" onClick={() => deleteBookmark(b.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="bottom-help"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        ↑
      </button>

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
          <div style={{ background: "white", padding: 16, width: 420, borderRadius: 12 }}>
            <h3>폴더 삭제</h3>
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
                폴더만 삭제하기(북마크 유지)
              </label>
              <label>
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === "delete"}
                  onChange={() => setDeleteMode("delete")}
                />{" "}
                폴더와 북마크 모두 삭제
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={closeDeleteModal} className="tiny-btn">Cancel</button>
              <button onClick={confirmDeleteFolder} className="tiny-btn">Delete</button>
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
          <div style={{ background: "white", padding: 16, width: 360, borderRadius: 12 }}>
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
                  {f.name}{f.is_default ? " (기본)" : ""}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={closeFolderModal} className="tiny-btn">Cancel</button>
              <button onClick={saveFolderModal} className="tiny-btn">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
