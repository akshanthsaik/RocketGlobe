text

# Rocket Globe

A desktop application for visualizing rocket launches in 3D with real satellite imagery and geospatial data.

## Tech Stack

### Frontend

- **Tauri 2** - Desktop shell
- **React 19** - UI framework
- **Cesium.js** - 3D geospatial visualization
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Bun** - Package manager

### Backend

- **FastAPI** - Python API framework
- **PostgreSQL + PostGIS** - Geospatial database
- **SQLAlchemy** - ORM
- **Temporal.io** - Workflow orchestration (planned)
- **Launch Library 2** - Launch data source

## Project Structure

```
rocketglobe/
├── src/ # React frontend
│ ├── scenes/ # Cesium 3D scenes
│ ├── components/ # React components
│ └── App.tsx
├── src-tauri/ # Rust desktop app
├── backend/ # Python FastAPI backend
│ ├── app/
│ │ ├── api/ # API endpoints
│ │ ├── models/ # Database models
│ │ ├── services/ # Business logic
│ │ └── workers/ # Background tasks
│ └── requirements.txt
└── public/ # Static assets
```

## Setup

### Prerequisites

- Node.js 18+
- Bun
- Rust
- Python 3.11+
- PostgreSQL 16+

### Frontend Setup

```
bun install
bun run tauri dev
```

### Backend Setup

```
cd backend
python -m venv venv
venv\Scripts\activate # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Database Setup

```
CREATE DATABASE rocketglobe;
\c rocketglobe
CREATE EXTENSION postgis;
```

## Development

- Frontend dev server: `bun run tauri dev`
- Backend dev server: `uvicorn app.main:app --reload`
- API docs: http://localhost:8000/docs

## Environment Variables


Create `backend/.env`:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/rocketglobe
LL2_BASE_URL=https://ll.thespacedevs.com/2.2.0
```

## License

MIT
