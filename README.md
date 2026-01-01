# RocketGlobe

RocketGlobe is a desktop-first, 3D globe-based visualization system for global rocket launches, implemented as a Tauri application with a React frontend, CesiumJS for globe rendering, and a Python backend integrated with PostgreSQL/PostGIS. The application synchronizes launch, pad, rocket, and agency data from TheSpaceDevs Launch Library 2 API and provides interactive exploration through multiple visualization modes, a timeline, and a responsive, dark, glassmorphic UI.

## Features

- **3D Globe Visualization**: Interactive 3D Earth rendered with CesiumJS, showing launch pads and launches with geospatial accuracy.
- **Four Visualization Modes**:
  - **Launches**: Filter and view launches over time with a timeline.
  - **Pads**: Explore launch sites and their activity.
  - **Rockets**: Analyze launches by vehicle.
  - **Agencies**: Track launches by agency.
- **Responsive UI**: Dark, glassmorphic design with a fixed header, resizable sidebar, and timeline, fully responsive from desktop to tablet.
- **Backend Integration**: Synchronizes launch, pad, rocket, and agency data from TheSpaceDevs Launch Library 2 into a PostgreSQL/PostGIS database for fast querying and visualization.
- **Manual Refresh**: Trigger backend sync to update data without reloading the app.

## Architecture

### Tauri Application

- **Frontend**: React + TypeScript, integrated with Tauri for desktop deployment.
- **Backend**: Python (FastAPI or Flask) serving launch, pad, rocket, and agency data.
- **Database**: PostgreSQL/PostGIS for structured and geospatial storage.
- **Data Sync**: Scheduled or manual sync from TheSpaceDevs Launch Library 2 API, normalizing and storing data for local querying.

### Data Model

#### Launches Table

| Column       | Type      | Description                              |
| ------------ | --------- | ---------------------------------------- |
| id           | SERIAL    | Unique identifier                        |
| name         | VARCHAR   | Launch name                              |
| status       | VARCHAR   | Launch status (success/failure/upcoming) |
| net          | TIMESTAMP | Launch date/time                         |
| window_start | TIMESTAMP | Launch window start                      |
| window_end   | TIMESTAMP | Launch window end                        |
| mission_type | VARCHAR   | Mission type (LEO, GTO, etc.)            |
| orbit        | VARCHAR   | Orbit type                               |
| image_url    | VARCHAR   | URL to launch image/patch                |
| pad_id       | INTEGER   | Foreign key to pads table                |
| rocket_id    | INTEGER   | Foreign key to rockets table             |
| agency_id    | INTEGER   | Foreign key to agencies table            |

#### Pads Table

| Column             | Type     | Description                                 |
| ------------------ | -------- | ------------------------------------------- |
| id                 | SERIAL   | Unique identifier                           |
| name               | VARCHAR  | Pad name                                    |
| latitude           | DOUBLE   | Pad latitude                                |
| longitude          | DOUBLE   | Pad longitude                               |
| location           | GEOMETRY | PostGIS geometry column for spatial queries |
| total_launch_count | INTEGER  | Total number of launches from this pad      |
| country_code       | VARCHAR  | Country code                                |
| agency_id          | INTEGER  | Foreign key to agencies table               |

#### Rockets Table

| Column          | Type    | Description                              |
| --------------- | ------- | ---------------------------------------- |
| id              | SERIAL  | Unique identifier                        |
| name            | VARCHAR | Rocket name                              |
| family          | VARCHAR | Rocket family (e.g., Falcon 9, Ariane 5) |
| manufacturer_id | INTEGER | Foreign key to agencies table            |

#### Agencies Table

| Column      | Type    | Description                         |
| ----------- | ------- | ----------------------------------- |
| id          | SERIAL  | Unique identifier                   |
| name        | VARCHAR | Agency name                         |
| type        | VARCHAR | Agency type (government/commercial) |
| country     | VARCHAR | Founding country                    |
| description | TEXT    | Agency description                  |

## Implementation Details

### Backend

- **API Endpoints**:
  - `/api/launches`: List all launches with filters.
  - `/api/pads`: List all pads with filters.
  - `/api/rockets`: List all rockets with filters.
  - `/api/agencies`: List all agencies with filters.
- **Data Sync**:
  - Scheduled or manual sync from TheSpaceDevs Launch Library 2 API.
  - Data is normalized and stored in PostgreSQL/PostGIS tables.
  - Geospatial queries are optimized using PostGIS.

### Frontend

- **React Components**:
  - **Header**: Fixed at the top, shows application branding, mode selection, and manual refresh button.
  - **Timeline**: Only active in Launches mode, allows filtering launches by time window.
  - **Sidebar**: Acts as a list/detail panel, resizable, with draggable handle.
  - **Cards**: Glassmorphic cards for launches, pads, rockets, and agencies.
  - **Detail Views**: Rich context for selected items, with associated stats and relationships.
- **Cesium Integration**:
  - CesiumJS for rendering the globe, terrain, and camera controls.
  - React handles state management and wiring of UI events to globe updates.
  - Default Cesium UI elements are selectively hidden or restyled to match the dark theme.

### Tauri Integration

- **Frontend**: React + TypeScript, integrated with Tauri for desktop deployment.
- **Backend**: Python (FastAPI or Flask) running as a local service, accessed via Tauri’s API.
- **Database**: PostgreSQL/PostGIS running locally, managed by the backend.
- **Data Sync**: Python backend synchronizes data from TheSpaceDevs Launch Library 2 API and stores it in PostgreSQL/PostGIS.
- **UI**: React frontend communicates with the Python backend via Tauri’s API, rendering data in CesiumJS.

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/rocketglobe.git

# Install dependencies
cd rocketglobe
npm install

# Start the backend
cd backend
python app.py

# Start the frontend
cd ../frontend
npm run dev

# Build and run the Tauri application
npm run tauri build
npm run tauri dev
```

## Usage

- Use the header to switch visualization modes.
- In Launches mode, use the timeline to filter launches by time.
- Click on markers or list items to view details.
- Resize the sidebar for optimal viewing.
- Use the refresh button to sync with the latest data.

## Technologies

- **Frontend**: React, TypeScript, CesiumJS, CSS (glassmorphic design)
- **Backend**: Python, PostgreSQL, PostGIS, TheSpaceDevs Launch Library 2 API
- **Desktop Integration**: Tauri

## License

MIT

---
