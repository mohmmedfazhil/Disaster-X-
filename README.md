# DisasterX — Emergency Response Demo

DisasterX is a browser based emergency reporting and command center demo. It includes separate citizen, administrator, and response-team views; priority dispatch; nearest compatible team assignment; assignment tracking; OpenStreetMap team/incident visualization; and team and incident analytics. Demo data is stored in browser localStorage.

## Run locally

Requires Node.js 18 or later. Install the project packages, then run the Vite web app and API server in separate terminals:

```bash
npm install
npm run dev
```

In another terminal, start the Node API:

```bash
npm run api
```

Open `http://localhost:5173`. For a production build and Node server, run `npm start` and visit `http://localhost:8001`. GPS requires HTTPS or localhost and browser permission. If GPS is unavailable, rescue maps use the saved team location and still show nearby hospitals.

## Demo sign in

- Citizen: `citizen@disasterx.org` / `citizen123` — routes to Report Incident.
- Administrator: `admin@disasterx.org` / `admin123` — routes to the Command Center.
- Rescue team: `TEAM-FIRE-01` / `rescue123` — opens the team assignment portal.

These credentials are demo only, not secure authentication. Team and incident records are stored in browser `localStorage`; this project does not provide shared accounts or server side storage.

## Enable the local MedLlama2 assistant

Install Ollama separately, then download the two models and start Ollama:

```bash
ollama pull medllama2
ollama pull qwen2.5vl:3b
ollama serve
```

Keep Ollama running and start `npm run api` in a second terminal alongside the Vite dev server. MedLlama2 answers general text questions; Qwen2.5-VL analyzes an uploaded incident photo only when requested. Models are connected for inference; this project does not train or fine tune them. Training requires a curated labeled dataset and separate workflow. See the [Qwen2.5-VL model page](https://ollama.com/library/qwen2.5vl) and [MedLlama2 model page](https://ollama.com/library/medllama2).

The image feature describes visible clues only. It is not an image authenticity detector and does not diagnose injuries. This repository has no labeled dataset or model-training pipeline, so MedLlama2 and Qwen2.5-VL are connected for inference rather than fine-tuned here. Without Ollama, built in rules and first aid remain available.

## Maps and nearby hospitals

The rescue dashboard is built with React 18 and Chart.js; Vite, Node.js, and Tailwind CSS provide the application toolchain. Leaflet uses OpenStreetMap tiles with attribution. Hospital search queries the free Nominatim service first, then Overpass, and places category-colored pins around live GPS or the saved team location if GPS is unavailable. Pins classify government, private, and unclassified records from OSM ownership tags. Coverage and ownership can be incomplete or outdated. See [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/), [Overpass API usage notes](https://wiki.openstreetmap.org/wiki/Overpass_API), and [OpenStreetMap attribution](https://www.openstreetmap.org/copyright).

Dispatch priority uses severity, people affected, emergency category, and elapsed report time. Assignment chooses the nearest available compatible team. The rescue map requests road route geometry from the public OSRM routing service and falls back to a direct line if routing is unavailable. Team logins, locations, and assignments are demo/local data and do not contact real responders.

Hospital pins represent OpenStreetMap records and periodically refresh after a substantial location change; they are not live hospital capacity or ambulance telemetry. Smart SOS requests a fresh browser GPS fix when tapped and prepares an optional SMS share link. It never calls or sends a message automatically. The displayed `112` call link is India’s Emergency Response Support System number for police, fire and rescue, and health emergencies; confirm the appropriate emergency number for your region at deployment. See [India ERSS](https://112.gov.in/).

## First aid guidance

The built in severe road accident and severe bleeding protocols link to [American Red Cross head, neck, and spinal injury guidance](https://www.redcross.org/take-a-class/resources/learn-first-aid/head-neck-spinal-injury) and [life threatening bleeding guidance](https://www.redcross.org/take-a-class/resources/learn-first-aid/bleeding-life-threatening-external). Guidance is general information. Call local emergency services and follow the dispatcher; it is not a diagnosis or substitute for trained responders.

The report form shows brief, rule based safety suggestions as the user enters an incident category and narrative, then repeats them after saving. These suggestions are not a medical assessment; follow emergency dispatch instructions.

## Project links

- [DisasterX UI/UX Design in Figma](https://www.figma.com/design/kOKye4WFTWmR9l0NLAsuCu)
- [DisasterX workflow in FigJam](https://www.figma.com/board/FAghO5kQuYFpvdfuBJmlh8)
