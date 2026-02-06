# MyOwnBookmark MVP

## Backend
```
python -m venv .venv
.\.venv\Scripts\activate
pip install -r backend\requirements.txt
uvicorn backend.app.main:app --reload
```

## Frontend
```
cd frontend
npm install
npm run dev
```

Backend runs on http://localhost:8000
Frontend runs on http://localhost:5173 (proxying /api to backend)
