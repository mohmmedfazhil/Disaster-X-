# 🚨 DisasterX

> **Open-source emergency incident reporting and response coordination demo with location-aware dispatch, rescue-team tools, and OpenStreetMap visualization.**

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933.svg)
![React](https://img.shields.io/badge/React-18-61DAFB.svg)
![Tailwind%20CSS](https://img.shields.io/badge/Tailwind%20CSS-3-38BDF8.svg)
![Maps](https://img.shields.io/badge/maps-OpenStreetMap-7EBC6F.svg)

---

## 📌 Problem Statement

During an emergency, reports, location details, and responder coordination can be spread across separate channels. This makes it harder for people to report incidents, for administrators to prioritize them, and for response teams to understand assignments and routes.

**DisasterX** is a browser-based demonstration platform that brings incident reporting, dispatch coordination, and map-based response information into one application. It provides separate citizen, administrator, and rescue-team views. Current demo records are stored in the browser and are not a live dispatch service.

---

## 🚀 Features

| Feature | Subsystem | Mechanism | Status |
|---|---|---|---|
| **Incident reporting** | Citizen view (`index.html`, `app.js`) | Collects incident details, category, severity, affected people, and location; stores records in browser `localStorage`. | Demo |
| **Safety guidance** | Report form (`app.js`) | Displays brief rule-based suggestions based on the selected incident and report details. | Demo guidance |
| **Incident prioritization** | Dispatch logic (`app.js`) | Ranks reports using severity, affected people, category, and time since reporting. | Implemented |
| **Response-team management** | Admin view (`index.html`, `app.js`) | Maintains team category, availability, member count, coordinates, and incident assignments. | Demo |
| **Nearest compatible team assignment** | Dispatch logic (`app.js`) | Filters by team capability and availability, then compares team and incident coordinates. | Implemented |
| **Rescue-team dashboard** | React app (`src/main.js`) | Displays assigned work, mission status, team availability, and Chart.js incident analytics. | Implemented |
| **Map and route visualization** | Leaflet (`app.js`) | Shows incidents, response teams, and route geometry from the public OSRM service; uses a direct-line fallback. | External services |
| **Nearby hospitals** | OpenStreetMap data (`app.js`) | Queries Nominatim and Overpass and shows hospital markers with ownership categories when mapped data is available. | External services |
| **Optional local AI assistance** | Ollama (`rescue_mate.js`, `server.js`) | Can connect to local MedLlama2 for text assistance and Qwen2.5-VL for uploaded image descriptions. Rule-based assistance remains available without Ollama. | Optional |
| **Smart SOS location sharing** | Browser geolocation (`app.js`) | Requests a current location fix and prepares optional call or message-sharing actions. | Browser permission required |

---

## 🏗️ Tech Stack

### Frontend Client

| Component | Version | Role |
|---|---|---|
| **React** | `^18.3.1` | Rescue dashboard UI |
| **Tailwind CSS** | `^3.4.16` | Utility styling compiled by Vite |
| **Chart.js** | `^4.4.7` | Rescue dashboard analytics |
| **Leaflet** | `^1.9.4` | Interactive maps and markers |
| **Vite** | `^6.0.5` | Development server and frontend build |

### Backend Services

| Component | Version | Role |
|---|---|---|
| **Node.js** | `18+` | Static web server and local API proxy (`server.js`) |
| **Ollama** | Optional external install | Local model runtime for AI assistance |

### Location Services

| Service | Role |
|---|---|
| **OpenStreetMap** | Base map tiles and mapped place data |
| **Nominatim** | Hospital lookup and reverse geocoding |
| **Overpass API** | Fallback query for nearby hospital features |
| **OSRM** | Road-route geometry between team and incident coordinates |

---

## 📂 Project Structure

```text
disasterx-openstreetmap/
├── index.html              # Application shell and citizen/admin views
├── app.js                  # Browser state, reporting, maps, dispatch, and admin logic
├── data.js                 # Demo incidents and response-team seed data
├── rescue_mate.js          # Optional AI and built-in assistance integration
├── server.js               # Node static server and local API proxy
├── server.py               # Legacy Python server
├── server.rb               # Legacy Ruby server
├── src/
│   ├── main.js             # React rescue-team dashboard and charts
│   └── tailwind.css        # Tailwind entry point
├── scripts/
│   └── copy-legacy.js      # Copies classic browser scripts into the build
├── assets/                 # App assets
├── package.json            # Scripts and dependencies
├── vite.config.js          # Vite configuration
├── tailwind.config.js      # Tailwind configuration
└── postcss.config.js       # CSS processing configuration
```

---

## ⚙️ Installation & Setup

### Prerequisites

- Node.js 18 or later and npm.
- A modern browser. Geolocation requires permission and a secure context (HTTPS or localhost).
- Optional: Ollama installed locally for model-backed assistance.

### Step 1: Install dependencies

```bash
npm install
```

### Step 2: Run the development app

```bash
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). In a second terminal, run the Node API proxy if using the Ollama integration:

```bash
npm run api
```

### Step 3: Build and serve the production bundle

```bash
npm start
```

This builds the frontend and starts the Node server on `http://localhost:8001` by default. Set `PORT` to choose another port.

### Step 4: Optional local models

Install Ollama separately, then pull the models and start the Ollama service:

```bash
ollama pull medllama2
ollama pull qwen2.5vl:3b
ollama serve
```

The models are used for inference; this project does not include a model-training or fine-tuning pipeline. Model availability depends on the local Ollama installation.

### Demo sign-in

| Role | Demo credentials | Landing view |
|---|---|---|
| Citizen | `citizen@disasterx.org` / `citizen123` | Incident report |
| Administrator | `admin@disasterx.org` / `admin123` | Command Center |
| Rescue team | `TEAM-FIRE-01` / `rescue123` | Rescue dashboard |

These credentials are for demonstration only. The application does not provide production authentication or shared server-side persistence.

---

## 🧠 How It Works

### 1. Reporting and browser storage

The browser form records report details and coordinates. Demo incidents and team records are read from and written to `localStorage`, so data is local to the current browser profile.

### 2. Prioritization and assignment

The dispatch queue sorts incidents by a calculated priority. Assignment considers team category/capability, current availability, and distance between available team coordinates and the incident.

### 3. Rescue-team operations

The React dashboard reads the current team and incident state from the browser application, presents assigned incidents, and allows mission status and availability updates. Chart.js summarizes the dashboard’s incident data.

### 4. Maps, hospitals, and routes

Leaflet renders OpenStreetMap tiles and application markers. The app requests nearby hospital records from Nominatim, with Overpass as a fallback, and requests routes from OSRM. These public services can be rate-limited or temporarily unavailable. Hospital category labels depend on OpenStreetMap tags and mapped coverage.

---

## 📈 Scalability

The current implementation is a single-browser demonstration. Browser `localStorage` is not shared between users and is not suitable as a dispatch database. A multi-user deployment would need authenticated accounts, a shared database, server-side authorization, real-time synchronization, monitoring, and reliable location/dispatch integrations.

---

## 💡 Feasibility

The front end can run locally with Node.js and npm. Map rendering, geolocation, routing, and hospital lookup use browser capabilities and public services, so no paid GIS key is required for the demo. External service limits, data coverage, browser permission, and network availability affect these features.

---

## 🌟 Design Goals

- Keep citizen reporting, administration, and rescue-team operations in distinct views.
- Make location and assignment information visible in a map-based workflow.
- Use free, widely available mapping components for the demonstration.
- Keep optional AI assistance local through Ollama when configured.

---

## 🔧 Limitations and Operational Notes

- Demo sign-in credentials are hard-coded and are not secure authentication.
- Records are local to one browser; separate users do not share updates.
- GPS depends on device support, browser permission, and a secure context. Saved team coordinates may be used when a fresh fix is unavailable.
- Hospital pins show mapped OpenStreetMap data, not live bed capacity, operating status, or ambulance telemetry.
- Public map and geocoding services may limit requests; observe their usage policies and provide attribution.
- AI output and first-aid guidance are informational only. Call local emergency services and follow dispatcher instructions for real emergencies.
- This demo is not a certified emergency dispatch or life-safety system.

---

## 📚 Data and Service References

- [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright)
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [OSRM project](https://project-osrm.org/)
- [Ollama model library: MedLlama2](https://ollama.com/library/medllama2)
- [Ollama model library: Qwen2.5-VL](https://ollama.com/library/qwen2.5vl)

---

## 📜 License

No license is currently declared in this project. Add a license file and update this section before redistributing the project.

---

## 🧩 Project Links

- [DisasterX UI/UX design in Figma](https://www.figma.com/design/kOKye4WFTWmR9l0NLAsuCu)
- [DisasterX workflow in FigJam](https://www.figma.com/board/FAghO5kQuYFpvdfuBJmlh8)
