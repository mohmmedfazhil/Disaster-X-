// DisasterX - Enterprise Emergency Response Platform Logic
// Leaflet, OpenStreetMap, and real-time browser geolocation

class DisasterXApp {
  constructor() {
    this.incidents = [];
    this.responseTeams = [];
    this.currentView = "home";
    this.userRole = "guest";
    this.currentUser = { name: "Guest Reporter", email: "", role: "guest" };
    
    // GPS & Coordinates
    this.userRealtimeCoords = [13.0827, 80.2707];
    this.pickerCoords = [13.0827, 80.2707];
    this.locationConfirmed = false;
    
    // Leaflet maps
    this.homeMap = null;
    this.homeMarkers = [];
    this.fullGisMap = null;
    this.fullGisMarkers = [];
    this.teamMapLayers = { home: [], full: [] };
    this.rescueMap = null;
    this.rescueMapLayers = [];
    this.pickerMap = null;
    this.pickerMarker = null;
    this.gpsWatchId = null;
    this.lastGpsPosition = null;
    this.followGpsForPicker = false;
    this.sosLocation = null;
    this.hospitals = [];
    this.hospitalDataLoaded = false;
    this.hospitalMarkers = { home: [], full: [], picker: [], rescue: [] };
    this.hospitalQueryStarted = false;
    this.hospitalQueryInFlight = false;
    this.lastHospitalLookup = null;
    this.rescueRouteRequestId = 0;

    // Filters
    this.filterCategory = "All";
    this.filterSeverity = "All";

    // Optional incident photo evidence
    this.uploadedPhotoData = null;
    this.aiVerificationResult = null;

    // Charts
    this.categoryChart = null;
    this.severityChart = null;

    this.init();
  }

  init() {
    initializeLocalStorageData();
    this.loadIncidents();
    this.loadResponseTeams();
    this.seedDemoDispatchIfEmpty();
    this.bindEvents();
    this.setupViewNavigation();
    
    this.renderHome();
    this.updateUserSessionUI();
    this.initFloatingAi();
    this.checkAiService();
  }

  // Real-Time OpenGPS Acquisition
  acquireRealtimeGpsLocation() {
    if (!navigator.geolocation) {
      this.setGpsStatus("This browser does not support location. Enter an address or move the map pin manually.", false);
      this.refreshAllMaps();
      return;
    }
    if (!window.isSecureContext) {
      this.setGpsStatus("GPS requires HTTPS or localhost. Open the secure site, then tap Locate me.", false);
      this.refreshAllMaps();
      return;
    }

    if (this.gpsWatchId !== null) return;
    this.gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => this.applyGpsPosition(pos),
      (error) => {
        if (this.lastGpsPosition && Date.now() - this.lastGpsPosition.timestamp < 60000) return;
        const message = error.code === 1 ? "Location permission is blocked. Allow it in browser site settings, then tap Locate me." :
          error.code === 2 ? "Device location is unavailable. Turn on Location Services and try outdoors." :
            "Location timed out. Keep the page open, move outdoors, then tap Locate me again.";
        this.setGpsStatus(`${message}${this.lastGpsPosition ? " Using last fix; drag the pin if needed." : " You can still drag the map pin or enter an address."}`, false);
        if (this.userRole === "rescue") this.loadNearbyHospitals();
        this.refreshAllMaps();
        const gpsButton = document.getElementById("btn-get-gps");
        if (gpsButton) gpsButton.innerHTML = `<i data-lucide="map-pin" class="w-3.5 h-3.5 mr-1.5"></i> Retry GPS`;
        if (window.lucide) window.lucide.createIcons();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 25000 }
    );
  }

  applyGpsPosition(pos) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    const firstFix = !this.lastGpsPosition;
    this.lastGpsPosition = pos;
    this.userRealtimeCoords = [lat, lng];
    this.locationConfirmed = true;
    if (this.userRole === "rescue") {
      const team = this.responseTeams.find(item => item.id === this.currentUser.teamId);
      const previousPoint = team?.coordinates?.length === 2 ? team.coordinates.map(Number) : null;
      const movedKm = previousPoint ? this.distanceKm(previousPoint[0], previousPoint[1], lat, lng) : Infinity;
      if (team && movedKm >= 0.025) {
        team.coordinates = [lat, lng];
        this.saveResponseTeams();
      }
    }
    if (firstFix || this.followGpsForPicker) {
      this.pickerCoords = [lat, lng];
      this.followGpsForPicker = false;
      this.pickerMap?.setView(this.pickerCoords, 15);
      this.pickerMarker?.setLatLng(this.pickerCoords);
    }
    this.refreshAllMaps();
    this.setGpsStatus(`Live location · ±${Math.round(accuracy)} m · ${new Date(pos.timestamp).toLocaleTimeString()}`, true);
    const gpsButton = document.getElementById("btn-get-gps");
    if (gpsButton) gpsButton.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 mr-1.5 text-emerald-400"></i> Live GPS Active`;
    if (window.lucide) window.lucide.createIcons();
    this.reverseGeocode(lat, lng);
    if (firstFix) this.loadNearbyHospitals();
    else if (this.lastHospitalLookup && (Date.now() - this.lastHospitalLookup.at > 180000 || this.distanceKm(lat, lng, this.lastHospitalLookup.lat, this.lastHospitalLookup.lon) > 2)) this.loadNearbyHospitals(true);
  }

  setGpsStatus(message, isLive) {
    ["gps-status-indicator", "gps-map-status", "rescue-location-status"].forEach(id => {
      const status = document.getElementById(id);
      if (!status) return;
      status.textContent = id === "rescue-location-status" && !isLive ? "GPS unavailable · saved team location in use" : message;
      status.className = `text-[10px] ${isLive ? "text-emerald-400" : "text-amber-400"} font-mono`;
    });
    const mapsLink = document.getElementById("gps-maps-link");
    if (mapsLink) {
      mapsLink.hidden = !isLive;
      if (isLive) mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${this.userRealtimeCoords[0]},${this.userRealtimeCoords[1]}`;
    }
  }

  triggerSmartSos() {
    this.setSosStatus("Finding your current location…", false);
    if (!navigator.geolocation || !window.isSecureContext) {
      this.setSosStatus("Location requires browser permission and HTTPS or localhost. You can still call emergency services.", false);
      return;
    }
    const applyFix = (position) => {
      this.lastGpsPosition = position;
      this.userRealtimeCoords = [position.coords.latitude, position.coords.longitude];
      this.locationConfirmed = true;
      this.pickerCoords = [...this.userRealtimeCoords];
      this.pickerMap?.setView(this.pickerCoords, 16);
      this.pickerMarker?.setLatLng(this.pickerCoords);
      this.refreshAllMaps();
      this.setGpsStatus(`Live GPS: ${this.userRealtimeCoords[0].toFixed(5)}, ${this.userRealtimeCoords[1].toFixed(5)} (±${Math.round(position.coords.accuracy)}m)`, true);
      this.sosLocation = [...this.userRealtimeCoords];
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${this.sosLocation[0]},${this.sosLocation[1]}`;
      const smsBody = encodeURIComponent(`Emergency. My location: ${mapUrl} (${this.sosLocation[0].toFixed(5)}, ${this.sosLocation[1].toFixed(5)})`);
      this.setSosStatus(`Location ready: ${this.sosLocation[0].toFixed(5)}, ${this.sosLocation[1].toFixed(5)} (±${Math.round(position.coords.accuracy)}m). Choose call or share.`, true, smsBody);
      this.reverseGeocode(this.sosLocation[0], this.sosLocation[1]);
      this.loadNearbyHospitals(true);
    };
    const freshEnough = this.lastGpsPosition && Date.now() - this.lastGpsPosition.timestamp < 20000;
    if (freshEnough) {
      applyFix(this.lastGpsPosition);
      return;
    }
    navigator.geolocation.getCurrentPosition(applyFix, (error) => {
      const reason = error.code === 1 ? "Location permission was denied." : "A fresh GPS fix is unavailable.";
      this.setSosStatus(`${reason} You can still call emergency services.`, false);
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }

  setSosStatus(message, locationReady, smsBody = "") {
    document.querySelectorAll("[data-sos-status]").forEach(el => {
      el.textContent = message;
      el.className = `text-[10px] ${locationReady ? "text-emerald-300" : "text-slate-300"}`;
    });
    document.querySelectorAll("[data-sos-share]").forEach(el => {
      el.hidden = !locationReady;
      if (locationReady) el.href = `sms:?body=${smsBody}`;
    });
  }

  refreshMapSizes() {
    const invalidate = () => [this.homeMap, this.fullGisMap, this.pickerMap, this.rescueMap].forEach(map => map?.invalidateSize({ animate: false, pan: false }));
    requestAnimationFrame(() => requestAnimationFrame(invalidate));
    setTimeout(invalidate, 300);
  }

  loadIncidents() {
    try {
      const stored = localStorage.getItem("disasterx_incidents");
      this.incidents = stored ? JSON.parse(stored) : [...INITIAL_INCIDENTS];
    } catch (e) {
      this.incidents = [...INITIAL_INCIDENTS];
    }
  }

  loadResponseTeams() {
    try {
      const stored = localStorage.getItem("disasterx_response_teams");
      this.responseTeams = stored ? JSON.parse(stored) : [...INITIAL_RESPONSE_TEAMS];
      if (!Array.isArray(this.responseTeams)) throw new Error("Invalid team store");
      this.responseTeams = this.responseTeams.map(team => {
        const seededCount = INITIAL_RESPONSE_TEAMS.find(seed => seed.id === team.id)?.memberCount || 1;
        const savedCount = Number(team.memberCount);
        return { ...team, memberCount: Math.max(1, (savedCount <= 1 && seededCount > 1) ? seededCount : (savedCount || seededCount)) };
      });
    } catch (_) {
      this.responseTeams = [...INITIAL_RESPONSE_TEAMS];
    }
  }

  seedDemoDispatchIfEmpty() {
    const hasIncidentAssignments = this.incidents.some(incident => incident.assignedTeamId);
    const hasTeamAssignments = this.responseTeams.some(team => team.assignedIncidentId);
    if (hasIncidentAssignments || hasTeamAssignments) return;
    const dispatchSeeds = INITIAL_INCIDENTS.filter(incident => incident.assignedTeamId && incident.status !== "Resolved");
    dispatchSeeds.forEach(seed => {
      const incident = this.incidents.find(item => item.id === seed.id);
      const team = this.responseTeams.find(item => item.id === seed.assignedTeamId);
      if (!incident || !team) return;
      incident.status = seed.status;
      incident.assignedTeamId = team.id;
      incident.assignedTeamName = team.name;
      team.assignedIncidentId = incident.id;
      team.status = "Busy";
    });
    try {
      localStorage.setItem("disasterx_incidents", JSON.stringify(this.incidents));
      localStorage.setItem("disasterx_response_teams", JSON.stringify(this.responseTeams));
    } catch (error) {
      console.warn("Could not initialize demo dispatch data:", error);
    }
  }

  saveResponseTeams() {
    try {
      localStorage.setItem("disasterx_response_teams", JSON.stringify(this.responseTeams));
    } catch (error) {
      alert("Could not save response teams in this browser.");
      console.error("Team storage failed:", error);
      return false;
    }
    this.renderResponseTeams();
    this.renderPriorityQueue();
    this.renderAdminStats();
    this.refreshAllMaps();
    this.renderRescueMap();
    if (this.currentView === "rescue") this.renderRescuePortal();
    return true;
  }

  saveIncidents() {
    try {
      localStorage.setItem("disasterx_incidents", JSON.stringify(this.incidents));
    } catch (error) {
      alert("Could not save incident data in this browser. Remove large photos or free local storage, then retry.");
      console.error("Incident storage failed:", error);
      return false;
    }
    this.renderAdminStats();
    this.refreshAllMaps();
    if (this.currentView === "admin") this.renderAdminTable();
    this.renderPriorityQueue();
    this.renderRescuePortal();
    this.renderRescueMap();
    return true;
  }

  setupViewNavigation() {
    document.querySelectorAll("[data-nav]").forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const targetView = link.getAttribute("data-nav");
        this.switchView(targetView);
        document.getElementById("mobile-menu")?.classList.add("hidden");
      });
    });
  }

  switchView(viewName) {
    if (["gis", "admin"].includes(viewName) && this.userRole !== "admin") {
      this.openLoginModal(this.userRole === "guest" ? "signin" : "admin");
      return;
    }
    if (viewName === "rescue" && this.userRole !== "rescue") {
      this.openLoginModal("rescue");
      return;
    }
    if (viewName === "report" && this.userRole === "rescue") {
      this.switchView("rescue");
      return;
    }
    this.currentView = viewName;
    window.scrollTo({ top: 0, behavior: "smooth" });

    document.querySelectorAll("[data-nav]").forEach(el => {
      if (el.getAttribute("data-nav") === viewName) {
        el.classList.add("text-white", "font-semibold");
        el.classList.remove("text-slate-400");
      } else {
        el.classList.remove("text-white", "font-semibold");
        el.classList.add("text-slate-400");
      }
    });

    document.querySelectorAll(".view-section").forEach(sec => sec.classList.add("hidden"));
    const targetEl = document.getElementById(`view-${viewName}`);
    if (targetEl) targetEl.classList.remove("hidden");

    if (viewName === "home") {
      this.renderHome();
      if (this.userRole === "admin") setTimeout(() => this.initHomeMap(), 50);
    } else if (viewName === "report") {
      this.renderReportForm();
      if (this.gpsWatchId === null) this.requestLiveGpsLocation();
    } else if (viewName === "gis") {
      setTimeout(() => this.initFullGisMap(), 50);
    } else if (viewName === "admin") {
      this.renderAdminStats();
      this.renderAdminTable();
      this.renderResponseTeams();
      this.renderPriorityQueue();
      setTimeout(() => this.initDashboardCharts(), 50);
    } else if (viewName === "rescue") {
      this.renderRescuePortal();
      setTimeout(() => this.initRescueMap(), 50);
      if (this.gpsWatchId === null) this.requestLiveGpsLocation();
    }

    if (window.lucide) window.lucide.createIcons();
  }

  renderHome() {
    const categoryGrid = document.getElementById("home-category-grid");
    if (categoryGrid) {
      categoryGrid.innerHTML = EMERGENCY_CATEGORIES.map(cat => {
        const catCount = this.incidents.filter(i => i.category === cat.id && i.status !== "Resolved").length;
        return `
          <div onclick="app.quickFilterByCategory('${cat.id}')" class="clean-card clean-card-hover p-3.5 cursor-pointer flex flex-col justify-between">
            <div class="flex items-center space-x-2.5">
              <div class="p-2 rounded-lg text-white" style="background-color: ${cat.color}20;">
                <i data-lucide="${cat.icon}" class="w-4 h-4" style="color: ${cat.color};"></i>
              </div>
              <h4 class="text-xs font-semibold text-white">${cat.name}</h4>
            </div>
            <div class="mt-3 flex items-center justify-between text-[11px] text-slate-400">
              <span>${catCount} active</span>
              <span class="text-sky-400">&rarr;</span>
            </div>
          </div>
        `;
      }).join("");
    }

    const recentFeed = document.getElementById("home-recent-incidents");
    if (recentFeed) {
      recentFeed.innerHTML = this.incidents.slice(0, 3).map(inc => `
        <div class="clean-card p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-start space-x-3">
            <span class="w-2 h-2 rounded-full mt-1.5 ${inc.severity === 'Critical' ? 'bg-red-500' : 'bg-amber-400'}"></span>
            <div>
              <div class="flex items-center space-x-2">
                <span class="text-[10px] font-mono text-slate-400">${inc.id}</span>
                <span class="badge-clean ${this.getSeverityBadgeClass(inc.severity)}">${inc.severity}</span>
                <span class="text-[10px] text-slate-500 font-mono">${this.formatTimeAgo(inc.timestamp)}</span>
              </div>
              <h4 class="text-xs font-semibold text-white mt-0.5">${inc.title}</h4>
              <p class="text-[11px] text-slate-400">${inc.location}</p>
            </div>
          </div>
          <button onclick="app.showIncidentDetail('${inc.id}')" class="btn-pill-dark text-xs self-start sm:self-center py-1 px-3">
            Inspect Dossier
          </button>
        </div>
      `).join("");
    }

    if (window.lucide) window.lucide.createIcons();
  }

  formatTimeAgo(dateString) {
    const diff = Math.floor((new Date() - new Date(dateString)) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  getSeverityBadgeClass(severity) {
    switch (severity) {
      case "Critical": return "badge-clean-critical";
      case "High": return "badge-clean-high";
      case "Medium": return "badge-clean-medium";
      default: return "badge-clean-low";
    }
  }

  // MAP 1: Home Map
  initHomeMap() {
    const container = document.getElementById("command-center-map");
    if (!container) return;

    if (!this.homeMap) {
      this.homeMap = L.map("command-center-map", {
        zoomControl: true,
        attributionControl: true
      }).setView(this.userRealtimeCoords, 13);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(this.homeMap);
    } else {
      this.homeMap.invalidateSize();
    }

    this.renderMarkersOnMap(this.homeMap, "home");
    this.renderGisIncidentQueue();
  }

  // MAP 2: Full Screen GIS Map
  initFullGisMap() {
    const container = document.getElementById("command-center-map-full");
    if (!container) return;

    if (!this.fullGisMap) {
      this.fullGisMap = L.map("command-center-map-full", {
        zoomControl: true,
        attributionControl: true
      }).setView(this.userRealtimeCoords, 13);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(this.fullGisMap);
    } else {
      this.fullGisMap.invalidateSize();
    }

    this.renderMarkersOnMap(this.fullGisMap, "full");
    this.renderNearbyHospitals();
    if (this.incidents.length > 0) this.selectIncidentForGisPanel(this.incidents[0].id);
  }

  renderMarkersOnMap(mapInstance, mapType) {
    if (!mapInstance) return;

    if (mapType === "home") {
      this.homeMarkers.forEach(m => mapInstance.removeLayer(m));
      this.homeMarkers = [];
    } else {
      this.fullGisMarkers.forEach(m => mapInstance.removeLayer(m));
      this.fullGisMarkers = [];
    }

    // Live User GPS Pin
    const liveIcon = L.divIcon({
      className: "user-live-wrapper",
      html: `<div class="${this.lastGpsPosition ? "user-live-marker" : "user-last-known-marker"}" title="${this.lastGpsPosition ? "Your live GPS location" : "Default map center; waiting for live GPS"}"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const userMarker = L.marker(this.userRealtimeCoords, { icon: liveIcon })
      .addTo(mapInstance)
      .bindPopup(`<div class="p-1 text-xs"><strong>${this.lastGpsPosition ? "Your Live GPS Location" : "Default Map Center"}</strong><br/>${this.lastGpsPosition ? "Live location updates are active." : "Waiting for permission and a GPS fix."}</div>`);

    if (mapType === "home") this.homeMarkers.push(userMarker);
    else this.fullGisMarkers.push(userMarker);

    // Incidents
    this.incidents.forEach(inc => {
      if (!inc.coordinates || inc.coordinates.length !== 2) return;

      const markerClass = inc.severity === "Critical" ? "clean-marker-critical" : inc.severity === "High" ? "clean-marker-high" : inc.severity === "Medium" ? "clean-marker-medium" : "clean-marker-low";
      const iconName = inc.category === "Fire Emergency" ? "flame" : inc.category === "Road Accident" ? "car" : inc.category === "Medical Emergency" ? "heart-pulse" : "alert-triangle";

      const pinIcon = L.divIcon({
        className: "custom-marker-wrapper",
        html: `<div class="clean-marker ${markerClass}"><i data-lucide="${iconName}" class="w-3.5 h-3.5"></i></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker(inc.coordinates, { icon: pinIcon }).addTo(mapInstance);
      marker.bindPopup(`
        <div style="min-width: 180px">
          <div class="flex items-center justify-between pb-1 border-b border-slate-700">
            <span class="text-[10px] font-mono text-slate-400">${inc.id}</span>
            <span class="badge-clean ${this.getSeverityBadgeClass(inc.severity)}">${inc.severity}</span>
          </div>
          <h4 class="text-xs font-semibold text-white mt-1">${inc.title}</h4>
          <p class="text-[11px] text-slate-400 mt-0.5">${inc.location}</p>
          <div class="mt-2 pt-1 border-t border-slate-800 flex justify-between items-center text-[11px]">
            <span class="text-slate-400">${inc.peopleAffected} affected</span>
            <button onclick="app.showIncidentDetail('${inc.id}')" class="text-sky-400 hover:underline">Details &rarr;</button>
          </div>
        </div>
      `);

      marker.on("click", () => this.selectIncidentForGisPanel(inc.id));

      if (mapType === "home") this.homeMarkers.push(marker);
      else this.fullGisMarkers.push(marker);
    });

    this.renderHospitalMarkers(mapInstance, mapType);
    this.renderTeamLayers(mapInstance, mapType);

    if (window.lucide) window.lucide.createIcons();
  }

  renderHospitalMarkers(mapInstance, mapType) {
    if (!mapInstance || !this.hospitalMarkers[mapType]) return;
    this.hospitalMarkers[mapType].forEach(marker => mapInstance.removeLayer(marker));
    this.hospitalMarkers[mapType] = [];
    this.hospitals.forEach(hospital => {
      const color = hospital.type === "Government" ? "#38BDF8" : hospital.type === "Private" ? "#A78BFA" : "#94A3B8";
      const hospitalIcon = L.divIcon({
        className: "hospital-marker-wrapper",
        html: `<div class="hospital-marker" style="--hospital-color:${color}" title="${this.escapeHTML(hospital.type)} hospital">H</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      const point = [hospital.lat, hospital.lon];
      const marker = L.marker(point, { icon: hospitalIcon }).addTo(mapInstance);
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${hospital.lat},${hospital.lon}`;
      marker.bindPopup(`<div class="hospital-popup"><strong>${this.escapeHTML(hospital.name)}</strong><br><span>${hospital.type} hospital${hospital.distanceKm == null ? "" : ` · ${hospital.distanceKm.toFixed(1)} km`}</span><br><a target="_blank" rel="noopener noreferrer" href="${mapsUrl}">Directions ↗</a></div>`);
      this.hospitalMarkers[mapType].push(marker);
    });
  }

  renderTeamLayers(mapInstance, mapType) {
    if (!mapInstance || !this.teamMapLayers[mapType]) return;
    this.teamMapLayers[mapType].forEach(layer => mapInstance.removeLayer(layer));
    this.teamMapLayers[mapType] = [];
    this.responseTeams.forEach(team => {
      if (!Array.isArray(team.coordinates) || team.coordinates.length !== 2) return;
      const point = team.coordinates.map(Number);
      if (!point.every(Number.isFinite)) return;
      const icon = L.divIcon({ className: "team-marker-wrap", html: `<div class="team-marker" title="${this.escapeHTML(team.category)} response team">${team.category === "Medical" ? "+" : "R"}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
      const marker = L.marker(point, { icon }).addTo(mapInstance);
      marker.bindPopup(`<div class="hospital-popup"><strong>${this.escapeHTML(team.name)}</strong><br><span>${this.escapeHTML(team.category)} · ${this.escapeHTML(team.status)}</span></div>`);
      this.teamMapLayers[mapType].push(marker);
      const incident = this.incidents.find(item => item.id === team.assignedIncidentId);
      if (incident?.coordinates?.length === 2) {
        const distance = this.distanceKm(point[0], point[1], incident.coordinates[0], incident.coordinates[1]);
        const route = L.polyline([point, incident.coordinates], { color: "#38BDF8", weight: 3, opacity: 0.8, dashArray: "7 7" }).addTo(mapInstance);
        route.bindPopup(`<div class="hospital-popup"><strong>${this.escapeHTML(team.name)} → ${this.escapeHTML(incident.id)}</strong><br><span>Straight-line distance ${distance.toFixed(1)} km</span></div>`);
        this.teamMapLayers[mapType].push(route);
      }
    });
  }

  refreshAllMaps() {
    if (this.homeMap) {
      this.homeMap.setView(this.userRealtimeCoords, 13);
      this.renderMarkersOnMap(this.homeMap, "home");
      this.renderGisIncidentQueue();
    }
    if (this.fullGisMap) {
      this.fullGisMap.setView(this.userRealtimeCoords, 13);
      this.renderMarkersOnMap(this.fullGisMap, "full");
    }
    this.renderNearbyHospitals();
  }

  escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  async loadNearbyHospitals(force = false) {
    if (this.hospitalQueryStarted && !force) return;
    if (this.hospitalQueryInFlight) return;
    const reportMapLocation = this.currentView === "report";
    const rescueTeam = this.currentView === "rescue" ? this.responseTeams.find(item => item.id === this.currentUser.teamId) : null;
    const hasSavedRescueCoords = rescueTeam?.coordinates?.length === 2 && rescueTeam.coordinates.every(value => Number.isFinite(Number(value)));
    const useSavedRescueCoords = !reportMapLocation && this.currentView === "rescue" && !this.lastGpsPosition && hasSavedRescueCoords;
    if (reportMapLocation ? !this.locationConfirmed : (!this.lastGpsPosition && !useSavedRescueCoords)) {
      this.setHospitalStatus(reportMapLocation ? "Confirm a location pin to search nearby hospitals." : "Allow GPS access to search near your current location.");
      return;
    }
    this.hospitalQueryStarted = true;
    this.setHospitalStatus(useSavedRescueCoords ? "Searching near the team’s saved map location…" : "Searching nearby hospitals…");
    const [lat, lon] = reportMapLocation ? this.pickerCoords : useSavedRescueCoords ? rescueTeam.coordinates.map(Number) : this.userRealtimeCoords;
    this.lastHospitalLookup = { lat, lon, at: Date.now() };
    const cacheKey = `disasterx_hospitals_v2_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    if (!force) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
        if (cached && Date.now() - cached.savedAt < 30 * 60 * 1000) {
          this.setNearbyHospitals(cached.hospitals, lat, lon);
          return;
        }
      } catch (_) {}
    }

    const query = `[out:json][timeout:10];(nwr[amenity=hospital](around:15000,${lat},${lon});nwr[healthcare=hospital](around:15000,${lat},${lon}););out center tags;`;
    this.hospitalQueryInFlight = true;
    let data = null;
    let lastError = null;
    try {
      const latRadius = 15000 / 111320;
      const lonRadius = latRadius / Math.max(0.15, Math.cos(lat * Math.PI / 180));
      const search = new URLSearchParams({
        q: "hospital", format: "jsonv2", limit: "50", bounded: "1", extratags: "1",
        viewbox: `${lon - lonRadius},${lat + latRadius},${lon + lonRadius},${lat - latRadius}`
      });
      const nominatimController = new AbortController();
      const nominatimTimeout = setTimeout(() => nominatimController.abort(), 9000);
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${search}`, { signal: nominatimController.signal });
        if (!response.ok) throw new Error(`OpenStreetMap search returned ${response.status}`);
        const places = await response.json();
        const elements = places.filter(place => place.type === "hospital" || place.category === "healthcare" && place.type === "hospital")
          .map(place => ({ id: place.osm_id, lat: Number(place.lat), lon: Number(place.lon), tags: { ...(place.extratags || {}), name: place.name || place.display_name?.split(",")[0], amenity: "hospital" } }))
          .filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lon) && this.distanceKm(lat, lon, place.lat, place.lon) <= 15);
        if (elements.length) data = { elements };
      } catch (error) { lastError = error; }
      finally { clearTimeout(nominatimTimeout); }
      for (const endpoint of data ? [] : ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: `data=${encodeURIComponent(query)}`,
            signal: controller.signal
          });
          if (!response.ok) throw new Error(`OpenStreetMap lookup returned ${response.status}`);
          data = await response.json();
          if (!data.remark && Array.isArray(data.elements)) break;
          throw new Error("OpenStreetMap returned an invalid hospital list");
        } catch (error) {
          lastError = error;
        } finally {
          clearTimeout(timeout);
        }
      }
      if (!data) throw lastError || new Error("No OpenStreetMap lookup service responded");
      const seenHospitals = new Set();
      const hospitals = (data.elements || []).map(item => {
        const tags = item.tags || {};
        const point = item.center || item;
        if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
        const id = `${(tags.name || "hospital").toLowerCase().trim()}-${point.lat.toFixed(4)}-${point.lon.toFixed(4)}`;
        if (seenHospitals.has(id)) return null;
        seenHospitals.add(id);
        const ownership = `${tags["operator:type"] || ""} ${tags.ownership || ""} ${tags.operator || ""} ${tags.name || ""}`.toLowerCase();
        const type = /government|govt|public|municipal|state[- ]run|national health|nhs/.test(ownership) ? "Government" :
          /private|pvt\.?|limited|ltd\.?|corporate/.test(ownership) ? "Private" : "Unclassified";
        return { id, name: tags.name || "Unnamed hospital", lat: point.lat, lon: point.lon, type };
      }).filter(Boolean);
      if (hospitals.length) {
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), hospitals })); } catch (_) {}
      }
      this.setNearbyHospitals(hospitals, lat, lon);
      this.hospitalQueryInFlight = false;
    } catch (error) {
      this.setHospitalStatus("Hospital search is temporarily unavailable. Check your connection and retry.");
      this.hospitalQueryStarted = false;
      this.hospitalQueryInFlight = false;
      console.warn("Nearby hospital lookup failed:", error);
    }
  }

  setNearbyHospitals(hospitals, lat, lon) {
    this.hospitalDataLoaded = true;
    this.hospitals = hospitals.map(hospital => ({ ...hospital, distanceKm: this.distanceKm(lat, lon, hospital.lat, hospital.lon) })).sort((a, b) => a.distanceKm - b.distanceKm);
    if (this.homeMap) this.renderMarkersOnMap(this.homeMap, "home");
    if (this.fullGisMap) this.renderMarkersOnMap(this.fullGisMap, "full");
    if (this.pickerMap) this.renderHospitalMarkers(this.pickerMap, "picker");
    if (this.rescueMap) this.renderHospitalMarkers(this.rescueMap, "rescue");
    this.renderNearbyHospitals();
  }

  distanceKm(lat1, lon1, lat2, lon2) {
    const radians = value => value * Math.PI / 180;
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  renderNearbyHospitals() {
    const lists = ["hospital-nearby-list", "hospital-nearby-user-list"].map(id => document.getElementById(id)).filter(Boolean);
    if (!lists.length) return;
    const groups = ["Government", "Private", "Unclassified"];
    if (!this.hospitals.length) {
      lists.forEach(list => list.innerHTML = `<p class="text-[10px] text-slate-400">Nearby hospital pins and listings appear after location is available.</p>`);
      if (this.hospitalDataLoaded) this.setHospitalStatus("No mapped hospitals found within 15 km.");
      return;
    }
    const content = groups.map(type => {
      const entries = this.hospitals.filter(hospital => hospital.type === type);
      if (!entries.length) return "";
      return `<div class="space-y-1"><h5 class="text-[10px] font-semibold uppercase tracking-wide ${type === "Government" ? "text-sky-300" : type === "Private" ? "text-violet-300" : "text-slate-400"}">${type} (${entries.length})</h5>${entries.slice(0, 6).map(hospital => `<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${hospital.lat},${hospital.lon}" class="flex items-center justify-between gap-2 rounded-md bg-slate-900/70 px-2 py-1.5 text-[10px] hover:bg-slate-800"><span class="truncate text-slate-200">${this.escapeHTML(hospital.name)}</span><span class="shrink-0 text-slate-400">${hospital.distanceKm.toFixed(1)} km</span></a>`).join("")}</div>`;
    }).join("");
    lists.forEach(list => list.innerHTML = content);
    this.setHospitalStatus(`${this.hospitals.length} hospitals found within 15 km`);
  }

  setHospitalStatus(message) {
    document.querySelectorAll("[data-hospital-status]").forEach(el => { el.textContent = message; });
  }

  renderGisIncidentQueue() {
    const queueList = document.getElementById("gis-incident-queue");
    if (!queueList) return;

    queueList.innerHTML = [...this.incidents].sort((a, b) => this.priorityScore(b) - this.priorityScore(a)).map(inc => `
      <div onclick="app.selectIncidentForGisPanel('${inc.id}')" class="p-2.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-900 cursor-pointer transition space-y-1">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-white font-mono">${inc.reporterContact || inc.id}</span>
          <span class="badge-clean ${this.getSeverityBadgeClass(inc.severity)}">${inc.severity}</span>
        </div>
        <p class="text-xs text-slate-300 font-medium line-clamp-1">${inc.title}</p>
        <p class="text-[10px] text-slate-500">${this.priorityLabel(inc)} priority · ${inc.assignedTeamName ? this.escapeHTML(inc.assignedTeamName) : "Unassigned"} · ${this.formatTimeAgo(inc.timestamp)}</p>
      </div>
    `).join("");

    if (this.incidents.length > 0) this.selectIncidentForGisPanel(this.incidents[0].id);
    if (window.lucide) window.lucide.createIcons();
  }

  selectIncidentForGisPanel(incidentId) {
    const inc = this.incidents.find(i => i.id === incidentId);
    if (!inc) return;

    if (this.homeMap && inc.coordinates) this.homeMap.panTo(inc.coordinates, { animate: true });
    if (this.fullGisMap && inc.coordinates) this.fullGisMap.panTo(inc.coordinates, { animate: true });

    const panel = document.getElementById("gis-triage-panel");
    if (!panel) return;

    panel.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <div>
            <span class="text-[10px] font-mono text-slate-400">${inc.id}</span>
            <h3 class="text-sm font-semibold text-white">${inc.title}</h3>
          </div>
          <span class="badge-clean ${this.getSeverityBadgeClass(inc.severity)}">${inc.severity}</span>
        </div>

        <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
          <div class="flex justify-between text-slate-400"><span>Location:</span> <span class="text-white font-medium">${inc.location}</span></div>
          <div class="flex justify-between text-slate-400"><span>Affected:</span> <span class="text-white font-medium">${inc.peopleAffected}</span></div>
          <div class="flex justify-between text-slate-400"><span>Status:</span> <span class="text-amber-400 font-medium">${inc.status}</span></div>
          <div class="flex justify-between text-slate-400"><span>Priority:</span> <span class="text-white font-medium">${this.priorityLabel(inc)}</span></div>
          <div class="flex justify-between text-slate-400"><span>Response team:</span> <span class="text-white font-medium">${inc.assignedTeamName ? this.escapeHTML(inc.assignedTeamName) : "Unassigned"}</span></div>
          ${inc.dispatchDistanceKm ? `<div class="flex justify-between text-slate-400"><span>Dispatch distance:</span> <span class="text-white font-medium">${Number(inc.dispatchDistanceKm).toFixed(1)} km</span></div>` : ""}
          <div class="flex justify-between text-slate-400"><span>Reporter:</span> <span class="text-slate-300">${inc.reporterName}</span></div>
        </div>

        <div class="space-y-1.5 text-xs">
          <label class="text-[11px] text-slate-400 font-medium">Update Status</label>
          <select onchange="app.updateIncidentStatus('${inc.id}', this.value)" class="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2 text-xs">
            ${STATUS_OPTIONS.map(st => `<option value="${st}" ${inc.status === st ? 'selected' : ''}>${st}</option>`).join("")}
          </select>
        </div>

        <div class="flex space-x-2 pt-2">
          <button onclick="app.showIncidentDetail('${inc.id}')" class="flex-1 py-2 rounded-lg bg-white text-slate-900 hover:bg-slate-100 font-semibold text-xs">
            Full Dossier
          </button>
          <button onclick="app.deleteIncidentPrompt('${inc.id}')" class="px-3 py-2 rounded-lg bg-red-950/40 text-red-400 border border-red-800/50 hover:bg-red-900/50 text-xs">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  // MAP 3: Report Intake Picker Map
  renderReportForm() {
    document.getElementById("emergency-report-form")?.classList.remove("hidden");
    document.getElementById("report-submission-result")?.classList.add("hidden");
    this.updateIncidentSafetyAdvice();
    this.uploadedPhotoData = null;
    this.aiVerificationResult = null;
    const preview = document.getElementById("photo-preview-container");
    if (preview) preview.innerHTML = "";
    setTimeout(() => this.initReportLocationPicker(), 50);
  }

  initReportLocationPicker() {
    const container = document.getElementById("report-picker-map");
    if (!container) return;

    if (!this.pickerMap) {
      this.pickerMap = L.map("report-picker-map", {
        zoomControl: true,
        attributionControl: true
      }).setView(this.pickerCoords, 14);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(this.pickerMap);

      const pinIcon = L.divIcon({
        className: "custom-marker-wrapper",
        html: `<div class="clean-marker clean-marker-critical"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      this.pickerMarker = L.marker(this.pickerCoords, { draggable: true, icon: pinIcon }).addTo(this.pickerMap);

      this.pickerMarker.on("dragend", (e) => {
        const pos = e.target.getLatLng();
        this.pickerCoords = [pos.lat, pos.lng];
        this.locationConfirmed = true;
        this.reverseGeocode(pos.lat, pos.lng);
      });

      this.pickerMap.on("click", (e) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        this.pickerCoords = [lat, lng];
        this.locationConfirmed = true;
        this.pickerMarker.setLatLng([lat, lng]);
        this.reverseGeocode(lat, lng);
      });
      this.renderHospitalMarkers(this.pickerMap, "picker");
    } else {
      this.pickerMap.invalidateSize();
      this.pickerMap.setView(this.pickerCoords, 14);
      this.pickerMarker.setLatLng(this.pickerCoords);
      this.renderHospitalMarkers(this.pickerMap, "picker");
    }

    if (window.lucide) window.lucide.createIcons();
  }

  requestLiveGpsLocation() {
    if (!navigator.geolocation) {
      this.setGpsStatus("Location is not supported by this browser. Enter an address or move the map pin.", false);
      return;
    }
    if (!window.isSecureContext) {
      this.setGpsStatus("Location requires HTTPS or localhost.", false);
      return;
    }
    const btn = document.getElementById("btn-get-gps");
    if (btn) btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 mr-1.5 animate-spin"></i> Waiting for GPS...`;
    this.followGpsForPicker = true;
    this.acquireRealtimeGpsLocation();
    navigator.geolocation.getCurrentPosition(pos => this.applyGpsPosition(pos), error => {
      if (this.lastGpsPosition && Date.now() - this.lastGpsPosition.timestamp < 60000) return;
      const message = error.code === 1 ? "Location permission denied. Allow location access for this site." : error.code === 2 ? "Device location unavailable. Check Location Services." : "GPS timed out. Try outdoors or move the map pin.";
      this.setGpsStatus(message, false);
      if (btn) btn.innerHTML = `<i data-lucide="map-pin" class="w-3.5 h-3.5 mr-1.5"></i> Retry GPS`;
      if (window.lucide) window.lucide.createIcons();
      if (this.userRole === "rescue") this.loadNearbyHospitals();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }

  async reverseGeocode(lat, lng) {
    const locInput = document.getElementById("form-incident-location");
    const nearbyInput = document.getElementById("form-incident-nearby");

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      if (res.ok) {
        const data = await res.json();
        if (locInput) locInput.value = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        const addr = data.address || {};
        const landmark = [addr.road, addr.suburb, addr.city].filter(Boolean).join(", ");
        if (nearbyInput && !nearbyInput.value) nearbyInput.value = landmark ? `Near ${landmark}` : "";
      }
    } catch (e) {
      if (locInput && !locInput.value) locInput.value = `OpenGPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  }

  async geocodeIncidentLocation() {
    const input = document.getElementById("form-incident-location");
    const query = input?.value.trim();
    if (!query || query.length < 4) return;
    const status = document.getElementById("gps-status-indicator");
    if (status) status.textContent = "Finding this address on OpenStreetMap…";
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("Address search unavailable");
      const results = await response.json();
      if (!results.length) throw new Error("No matching map location found");
      const lat = Number(results[0].lat);
      const lon = Number(results[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Address result was invalid");
      this.pickerCoords = [lat, lon];
      this.locationConfirmed = true;
      this.pickerMap?.setView(this.pickerCoords, 16);
      this.pickerMarker?.setLatLng(this.pickerCoords);
      this.loadNearbyHospitals(true);
      if (status) status.textContent = "Address located · check or adjust the map pin.";
    } catch (error) {
      if (status) status.textContent = `${error.message}. Drag the map pin to confirm the incident location.`;
    }
  }

  calculateDynamicSeverity() {
    const category = document.getElementById("form-incident-category")?.value || "Fire Emergency";
    const people = parseInt(document.getElementById("form-incident-people")?.value || "0", 10);
    const desc = (document.getElementById("form-incident-desc")?.value || "").toLowerCase();

    let autoSeverity = "Low";
    if (people >= 5) autoSeverity = "Critical";
    else if (people >= 2) autoSeverity = "High";
    else if (people === 1) autoSeverity = "Medium";

    if (category === "Building Collapse" || (category === "Fire Emergency" && (desc.includes("spread") || desc.includes("explosion") || people > 0))) {
      autoSeverity = "Critical";
    } else if (category === "Flood" && (desc.includes("rising") || desc.includes("roof"))) {
      if (autoSeverity !== "Critical") autoSeverity = "High";
    }

    if (desc.includes("trapped") || desc.includes("chemical") || desc.includes("leak") || desc.includes("unconscious")) {
      autoSeverity = "Critical";
    }

    const badge = document.getElementById("auto-severity-badge");
    const select = document.getElementById("form-incident-severity");

    if (badge) {
      badge.className = `badge-clean ${this.getSeverityBadgeClass(autoSeverity)}`;
      badge.textContent = `Auto-Triage: ${autoSeverity}`;
    }
    if (select) select.value = autoSeverity;
    this.updateIncidentSafetyAdvice();
  }

  getIncidentSafetyAdvice(category, narrative = "") {
    const text = narrative.toLowerCase();
    const advice = ["Protect yourself first. Keep clear of traffic, fire, smoke, floodwater, unstable structures, and chemical hazards."];
    if (/bleed|blood|hemorrhag/.test(text)) advice.push("For severe bleeding, call emergency services and apply firm, continuous pressure with clean cloth or gauze. Do not remove an embedded object.");
    if (/burn|scald/.test(text)) advice.push("For a burn, move away from the heat source and cool the area with clean, cool running water. Do not apply ice, creams, or butter.");
    if (/unconscious|unresponsive|not breathing|gasping|seizure|chest pain/.test(text)) advice.push("Call emergency services now. Follow the dispatcher. If the person is not breathing normally, begin CPR or use an AED only if able and follow dispatcher instructions.");
    if (/trapped|neck|spine|back injury|head injury/.test(text) || category === "Road Accident") advice.push("After a crash or possible head, neck, or back injury, keep the person still. Move them only if the scene is unsafe or CPR/bleeding control is needed.");
    if (category === "Fire Emergency") advice.push("Leave by a safe exit, stay low under smoke, do not use elevators, and do not re-enter the building.");
    if (category === "Flood") advice.push("Move to higher ground. Never walk or drive through floodwater; avoid downed power lines.");
    if (category === "Building Collapse") advice.push("Move away from unstable structures and falling debris. Do not enter rubble; wait for trained rescue teams.");
    if (category === "Other Emergencies" && advice.length === 1) advice.push("Do not move an injured person unless there is immediate danger. Ask someone to call emergency services and follow the dispatcher.");
    advice.push("Share the location with responders. Do not give an injured person food, drink, or medication unless a medical professional directs you.");
    return advice;
  }

  updateIncidentSafetyAdvice(categoryOverride, narrativeOverride) {
    const category = categoryOverride || document.getElementById("form-incident-category")?.value || "Other Emergencies";
    const narrative = narrativeOverride ?? `${document.getElementById("form-incident-title")?.value || ""} ${document.getElementById("form-incident-desc")?.value || ""}`;
    const list = document.getElementById("incident-safety-advice-list");
    const advice = this.getIncidentSafetyAdvice(category, narrative);
    if (list) list.innerHTML = advice.map(step => `<li>${this.escapeHTML(step)}</li>`).join("");
    return advice;
  }

  handlePhotoUpload(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert("Please select an image smaller than 8 MB.");
      return;
    }

    const preview = document.getElementById("photo-preview-container");
    if (preview) {
      preview.innerHTML = `
        <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs flex items-center space-x-2 text-sky-400">
          <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
          <span>Preparing photo preview…</span>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          this.uploadedPhotoData = e.target.result;
        } else {
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          this.uploadedPhotoData = canvas.toDataURL("image/jpeg", 0.78);
        }
        this.aiVerificationResult = null;
        if (preview) {
          preview.innerHTML = `<div class="mt-2 flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900 p-2"><img src="${this.uploadedPhotoData}" alt="Incident photo preview" class="h-20 max-w-32 rounded object-cover"><div class="min-w-0"><p class="text-[11px] text-white">Photo attached</p><button type="button" id="analyze-photo-button" class="mt-1 rounded bg-sky-900/60 px-2 py-1 text-[10px] text-sky-200 hover:bg-sky-800">Analyze visible incident clues</button><p id="vision-analysis-status" class="mt-1 text-[10px] text-slate-400">Uses the local Qwen2.5-VL model when enabled. Not authenticity detection or medical diagnosis.</p><button type="button" onclick="app.removeUploadedPhoto()" class="mt-1 text-[10px] text-red-300 hover:underline">Remove photo</button></div></div>`;
          document.getElementById("analyze-photo-button")?.addEventListener("click", () => this.analyzeUploadedPhoto());
        }
      };
      image.onerror = () => { if (preview) preview.textContent = "Could not read this image."; };
      image.src = e.target.result;
    };
    reader.onerror = () => { if (preview) preview.textContent = "Could not read this image."; };
    reader.readAsDataURL(file);
  }

  removeUploadedPhoto() {
    this.uploadedPhotoData = null;
    this.aiVerificationResult = null;
    const preview = document.getElementById("photo-preview-container");
    if (preview) preview.innerHTML = "";
    const fileInput = document.getElementById("form-incident-photo");
    if (fileInput) fileInput.value = "";
  }

  async analyzeUploadedPhoto() {
    const status = document.getElementById("vision-analysis-status");
    const button = document.getElementById("analyze-photo-button");
    if (!this.uploadedPhotoData) return;
    if (status) status.textContent = "Analyzing the photo on your local vision model…";
    if (button) button.disabled = true;
    try {
      const response = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Describe only visible emergency-relevant clues in this photo, such as visible fire, flooding, vehicle damage, blocked exits, or visible hazards. Do not identify people, infer unseen injuries, diagnose, or claim the image is authentic, original, or unaltered. State uncertainty clearly. End by advising users to call local emergency services for immediate danger.",
          image: this.uploadedPhotoData.split(",")[1]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The local vision service is unavailable.");
      if (status) status.textContent = `Vision model observation: ${data.response}`;
    } catch (error) {
      if (status) status.textContent = `${error.message} Start Ollama and pull qwen2.5vl:3b.`;
    } finally {
      if (button) button.disabled = false;
    }
  }

  submitReport(e) {
    e.preventDefault();
    const title = document.getElementById("form-incident-title")?.value.trim();
    const category = document.getElementById("form-incident-category")?.value;
    const severity = document.getElementById("form-incident-severity")?.value;
    const location = document.getElementById("form-incident-location")?.value.trim();
    const nearbyLandmarks = document.getElementById("form-incident-nearby")?.value.trim() || "";
    const peopleAffected = parseInt(document.getElementById("form-incident-people")?.value || "0", 10);
    const description = document.getElementById("form-incident-desc")?.value.trim();
    const reporterName = document.getElementById("form-reporter-name")?.value.trim() || this.currentUser.name;
    const reporterContact = document.getElementById("form-reporter-contact")?.value.trim() || "";

    if (!title || !description || !location) {
      alert("Please complete required fields: Title, Description, and Location.");
      return;
    }
    if (!this.locationConfirmed) {
      alert("Confirm the incident location: tap Update Real-Time GPS, change the address and wait for its map match, or place the pin on the map.");
      document.getElementById("gps-status-indicator")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const safetyAdvice = this.getIncidentSafetyAdvice(category, `${title} ${description}`);

    const newIncident = {
      id: `INC-${Math.random().toString(36).substring(2, 8)}`,
      title,
      description,
      category,
      severity,
      status: "Reported",
      location,
      nearbyLandmarks,
      coordinates: [...this.pickerCoords],
      peopleAffected,
      reporterName,
      reporterContact,
      timestamp: new Date().toISOString(),
      photoUrl: this.uploadedPhotoData || "",
      aiProofVerification: this.aiVerificationResult,
      assignedUnits: ["Squad Alpha"],
      notes: "Direct report ingested via DisasterX intake."
    };

    this.incidents.unshift(newIncident);
    if (!this.saveIncidents()) {
      this.incidents.shift();
      return;
    }

    const form = document.getElementById("emergency-report-form");
    const result = document.getElementById("report-submission-result");
    const resultId = document.getElementById("submitted-incident-id");
    const resultAdvice = document.getElementById("submitted-safety-advice");
    if (resultId) resultId.textContent = newIncident.id;
    if (resultAdvice) resultAdvice.innerHTML = safetyAdvice.map(step => `<li>${this.escapeHTML(step)}</li>`).join("");
    form?.classList.add("hidden");
    result?.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (this.userRole === "admin") this.renderGisIncidentQueue();
  }

  renderAdminStats() {
    const total = this.incidents.length;
    const critical = this.incidents.filter(i => i.severity === "Critical").length;
    const pending = this.incidents.filter(i => i.status === "Pending" || i.status === "Reported").length;
    const resolved = this.incidents.filter(i => i.status === "Resolved").length;

    const elTotal = document.getElementById("stat-total-incidents");
    const elCritical = document.getElementById("stat-critical-incidents");
    const elPending = document.getElementById("stat-pending-incidents");
    const elResolved = document.getElementById("stat-resolved-incidents");

    if (elTotal) elTotal.textContent = total;
    if (elCritical) elCritical.textContent = critical;
    if (elPending) elPending.textContent = pending;
    if (elResolved) elResolved.textContent = resolved;
    const available = this.responseTeams.filter(team => team.status === "Available").length;
    const busy = this.responseTeams.filter(team => team.status === "Busy").length;
    const assigned = this.incidents.filter(incident => incident.assignedTeamId && incident.status !== "Resolved").length;
    const unassignedCritical = this.incidents.filter(incident => incident.status !== "Resolved" && !incident.assignedTeamId && ["Critical", "High"].includes(this.priorityLabel(incident))).length;
    const setCount = (id, count) => { const el = document.getElementById(id); if (el) el.textContent = count; };
    setCount("stat-teams-available", available);
    setCount("stat-teams-busy", busy);
    setCount("stat-assigned-incidents", assigned);
    setCount("stat-unassigned-critical", unassignedCritical);
  }

  renderAdminTable() {
    const tbody = document.getElementById("admin-incidents-tbody");
    if (!tbody) return;

    let filtered = [...this.incidents];
    if (this.filterCategory !== "All") filtered = filtered.filter(i => i.category === this.filterCategory);
    if (this.filterSeverity !== "All") filtered = filtered.filter(i => i.severity === this.filterSeverity);
    filtered.sort((a, b) => this.priorityScore(b) - this.priorityScore(a));

    tbody.innerHTML = filtered.map(inc => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-900/50 transition">
        <td class="py-2.5 px-3 font-mono text-xs text-slate-400">${inc.id}</td>
        <td class="py-2.5 px-3">
          <div class="font-semibold text-white text-xs">${inc.title}</div>
          <div class="text-[10px] text-slate-400">${inc.location}</div>
        </td>
        <td class="py-2.5 px-3 text-xs text-slate-300">${inc.category}</td>
        <td class="py-2.5 px-3"><span class="badge-clean ${this.getSeverityBadgeClass(inc.severity)}">${inc.severity}</span></td>
        <td class="py-2.5 px-3"><span class="badge-clean ${this.getSeverityBadgeClass(this.priorityLabel(inc))}">${this.priorityLabel(inc)}</span></td>
        <td class="py-2.5 px-3 text-[10px] text-slate-300">${inc.assignedTeamName ? `${this.escapeHTML(inc.assignedTeamName)} · ${Number(inc.dispatchDistanceKm || 0).toFixed(1)} km` : inc.status !== "Resolved" ? `<button onclick="app.assignNearestTeam('${this.escapeHTML(inc.id)}')" class="rounded bg-sky-800 px-2 py-1 text-[10px] text-white">Assign nearest</button>` : "—"}</td>
        <td class="py-2.5 px-3">
          <select onchange="app.updateIncidentStatus('${inc.id}', this.value)" class="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 text-slate-200">
            ${STATUS_OPTIONS.map(st => `<option value="${st}" ${inc.status === st ? 'selected' : ''}>${st}</option>`).join("")}
          </select>
        </td>
        <td class="py-2.5 px-3 text-xs font-mono text-slate-400">${this.formatTimeAgo(inc.timestamp)}</td>
        <td class="py-2.5 px-3 text-right space-x-1.5">
          <button onclick="app.showIncidentDetail('${inc.id}')" class="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="app.deleteIncidentPrompt('${inc.id}')" class="p-1 rounded bg-red-950/50 hover:bg-red-900 text-red-400">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      </tr>
    `).join("");

    if (window.lucide) window.lucide.createIcons();
  }

  updateIncidentStatus(incidentId, newStatus) {
    const inc = this.incidents.find(i => i.id === incidentId);
    if (!inc) return;
    inc.status = newStatus;
    const team = this.responseTeams.find(item => item.id === inc.assignedTeamId);
    if (team) {
      if (newStatus === "Resolved") {
        team.status = "Available";
        team.assignedIncidentId = "";
      } else if (["Assigned", "In Progress"].includes(newStatus)) {
        team.status = "Busy";
        team.assignedIncidentId = inc.id;
      }
      this.saveResponseTeams();
    }
    this.saveIncidents();
    if (this.currentView === "admin") {
      this.renderAdminStats();
      this.renderAdminTable();
      this.initDashboardCharts();
    } else if (this.currentView === "rescue") {
      this.renderRescuePortal();
      this.renderRescueMap();
    }
  }

  priorityScore(incident) {
    const severity = { Critical: 100, High: 65, Medium: 35, Low: 10 }[incident.severity] || 0;
    const people = Math.min(Number(incident.peopleAffected) || 0, 20) * 3;
    const category = { "Fire Emergency": 12, "Road Accident": 12, "Medical Emergency": 10, Flood: 8, "Building Collapse": 10 }[incident.category] || 0;
    const reportedAt = new Date(incident.timestamp).getTime();
    const ageMinutes = Number.isFinite(reportedAt) ? Math.max(0, (Date.now() - reportedAt) / 60000) : 0;
    return severity + people + category + Math.min(ageMinutes / 3, 20);
  }

  priorityLabel(incident) {
    const score = this.priorityScore(incident);
    return score >= 100 ? "Critical" : score >= 65 ? "High" : score >= 35 ? "Medium" : "Low";
  }

  renderPriorityQueue() {
    const queue = document.getElementById("dispatch-priority-queue");
    if (!queue) return;
    const active = this.incidents.filter(item => item.status !== "Resolved").sort((a, b) => this.priorityScore(b) - this.priorityScore(a));
    if (!active.length) {
      queue.innerHTML = `<p class="text-xs text-slate-400">No active incidents.</p>`;
      return;
    }
    queue.innerHTML = active.slice(0, 8).map((inc, index) => {
      const team = this.responseTeams.find(item => item.id === inc.assignedTeamId);
      return `<article class="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
        <div class="min-w-0"><p class="text-[10px] font-mono text-slate-400">#${index + 1} · ${this.escapeHTML(inc.id)}</p><p class="truncate text-xs font-semibold text-white">${this.escapeHTML(inc.title)}</p><p class="text-[10px] text-slate-400">${this.priorityLabel(inc)} · ${Number(inc.peopleAffected) || 0} affected · ${team ? this.escapeHTML(team.name) : "Unassigned"}</p></div>
        ${team ? `<span class="text-[10px] text-emerald-300">${Number(inc.dispatchDistanceKm || 0).toFixed(1)} km</span>` : `<button onclick="app.assignNearestTeam('${this.escapeHTML(inc.id)}')" class="shrink-0 rounded bg-sky-700 px-2 py-1.5 text-[10px] text-white">Assign nearest</button>`}
      </article>`;
    }).join("");
  }

  teamSupportsIncident(team, incident) {
    if (team.category === "Multi-purpose") return true;
    const support = {
      "Fire Emergency": ["Fire"],
      "Road Accident": ["Medical", "Rescue", "Police"],
      "Medical Emergency": ["Medical"],
      Flood: ["Rescue", "Medical"],
      "Building Collapse": ["Rescue", "Fire"],
      "Other Emergencies": ["Rescue", "Fire", "Medical", "Police"]
    };
    return (support[incident.category] || []).includes(team.category);
  }

  assignNearestTeam(incidentId) {
    const incident = this.incidents.find(item => item.id === incidentId);
    if (!incident || incident.status === "Resolved" || !incident.coordinates) return;
    const candidates = this.responseTeams.filter(team => team.status === "Available" && team.coordinates?.length === 2 && this.teamSupportsIncident(team, incident))
      .map(team => ({ team, distance: this.distanceKm(team.coordinates[0], team.coordinates[1], incident.coordinates[0], incident.coordinates[1]) }))
      .sort((a, b) => a.distance - b.distance);
    if (!candidates.length) {
      alert("No available team matches this incident. Update team availability or add a suitable team.");
      return;
    }
    const { team, distance } = candidates[0];
    team.status = "Busy";
    team.assignedIncidentId = incident.id;
    incident.assignedTeamId = team.id;
    incident.assignedTeamName = team.name;
    incident.dispatchDistanceKm = distance;
    incident.assignedAt = new Date().toISOString();
    incident.assignedUnits = [team.name];
    incident.status = "Assigned";
    this.saveResponseTeams();
    this.saveIncidents();
    this.renderAdminTable();
  }

  renderResponseTeams() {
    const host = document.getElementById("response-team-roster");
    if (!host) return;
    host.innerHTML = this.responseTeams.map(team => {
      const incident = this.incidents.find(item => item.id === team.assignedIncidentId);
      return `<article class="grid grid-cols-1 sm:grid-cols-5 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
        <div class="sm:col-span-2 min-w-0"><p class="truncate text-xs font-semibold text-white">${this.escapeHTML(team.name)} <span class="text-[9px] font-mono text-slate-400">${this.escapeHTML(team.id)}</span></p><p class="text-[10px] text-slate-400">${this.escapeHTML(team.category)} · ${Number(team.memberCount) || 1} members · ${team.coordinates?.map(n => Number(n).toFixed(4)).join(", ") || "Location missing"}${incident ? ` · ${this.escapeHTML(incident.id)}` : ""}</p></div>
        <select onchange="app.setTeamAvailability('${this.escapeHTML(team.id)}',this.value)" class="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] text-white"><option ${team.status === "Available" ? "selected" : ""}>Available</option><option ${team.status === "Busy" ? "selected" : ""}>Busy</option><option ${team.status === "Offline" ? "selected" : ""}>Offline</option></select>
        ${incident ? `<span class="text-[10px] text-amber-300">${this.escapeHTML(incident.title)}</span>` : `<span class="text-[10px] text-slate-500">No assignment</span>`}
        <button onclick="app.removeResponseTeam('${this.escapeHTML(team.id)}')" class="justify-self-start rounded border border-red-900/60 px-2 py-1 text-[10px] text-red-300">Remove</button>
      </article>`;
    }).join("") || `<p class="text-xs text-slate-400">No response teams have been added.</p>`;
  }

  setTeamAvailability(teamId, status) {
    const team = this.responseTeams.find(item => item.id === teamId);
    if (!team || !["Available", "Busy", "Offline"].includes(status)) return;
    if (status === "Available" && team.assignedIncidentId) {
      alert("Resolve the assigned incident before marking this team available.");
      this.renderResponseTeams();
      return;
    }
    team.status = status;
    this.saveResponseTeams();
  }

  addResponseTeam(event) {
    event.preventDefault();
    const id = document.getElementById("new-team-id")?.value.trim().toUpperCase();
    const name = document.getElementById("new-team-name")?.value.trim();
    const lat = Number(document.getElementById("new-team-lat")?.value);
    const lon = Number(document.getElementById("new-team-lon")?.value);
    const category = document.getElementById("new-team-category")?.value;
    const memberCount = Number(document.getElementById("new-team-members")?.value);
    if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 || !Number.isInteger(memberCount) || memberCount < 1) {
      alert("Enter a unique team ID, team name, member count, and valid coordinates.");
      return;
    }
    if (this.responseTeams.some(team => team.id === id)) {
      alert("That team ID already exists.");
      return;
    }
    this.responseTeams.push({ id, name, category, coordinates: [lat, lon], memberCount, status: "Available", assignedIncidentId: "" });
    event.target.reset();
    this.saveResponseTeams();
  }

  removeResponseTeam(teamId) {
    const team = this.responseTeams.find(item => item.id === teamId);
    if (!team) return;
    if (team.assignedIncidentId) {
      alert("Resolve or reassign the team’s incident before removing it.");
      return;
    }
    this.responseTeams = this.responseTeams.filter(item => item.id !== teamId);
    this.saveResponseTeams();
  }

  deleteIncidentPrompt(incidentId) {
    if (confirm(`Delete incident record ${incidentId}? (Clears duplicate or test report)`)) {
      this.incidents = this.incidents.filter(i => i.id !== incidentId);
      this.saveIncidents();
      if (this.currentView === "admin") {
        this.renderAdminStats();
        this.renderAdminTable();
        this.initDashboardCharts();
      }
      this.refreshAllMaps();
      this.closeIncidentDetailModal();
    }
  }

  showIncidentDetail(incidentId) {
    const inc = this.incidents.find(i => i.id === incidentId);
    if (!inc) return;

    const modal = document.getElementById("incident-detail-modal");
    if (!modal) return;

    modal.innerHTML = `
      <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="clean-card max-w-lg w-full p-6 border-slate-700 space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span class="text-[10px] font-mono text-slate-400">${inc.id}</span>
              <h3 class="text-base font-semibold text-white">${inc.title}</h3>
            </div>
            <button onclick="app.closeIncidentDetailModal()" class="text-slate-400 hover:text-white">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          ${inc.photoUrl ? `
            <div class="rounded-xl overflow-hidden border border-slate-800 max-h-48 relative">
              <img src="${inc.photoUrl}" class="w-full h-48 object-cover" />
              <div class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-emerald-500/40 text-[10px] text-emerald-400 font-mono">
                Evidence photo attached · authenticity not verified
              </div>
            </div>
          ` : ''}

          <div class="grid grid-cols-2 gap-3 text-xs">
            <div class="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span class="text-slate-400 text-[10px]">CATEGORY & SEVERITY</span>
              <p class="text-white font-medium mt-0.5">${inc.category} • <span class="${inc.severity === 'Critical' ? 'text-red-400' : 'text-amber-400'}">${inc.severity}</span></p>
            </div>
            <div class="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span class="text-slate-400 text-[10px]">CASUALTIES</span>
              <p class="text-white font-medium mt-0.5">${inc.peopleAffected} persons affected</p>
            </div>
          </div>

          <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1">
            <span class="text-slate-400 text-[10px]">INCIDENT NARRATIVE</span>
            <p class="text-slate-300 leading-relaxed">${inc.description}</p>
          </div>

          <div class="pt-2 flex justify-end space-x-2">
            <button onclick="app.closeIncidentDetailModal()" class="btn-pill-white text-xs py-2 px-4">
              Close
            </button>
          </div>
        </div>
      </div>
    `;
    modal.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons();
  }

  closeIncidentDetailModal() {
    document.getElementById("incident-detail-modal")?.classList.add("hidden");
  }

  renderRescuePortal() {
    if (this.userRole !== "rescue") return;
    const team = this.responseTeams.find(item => item.id === this.currentUser.teamId);
    if (!team) {
      const root = document.getElementById("rescue-react-root");
      if (root) root.innerHTML = `<div class="clean-card p-4 text-sm text-amber-200">Team unavailable.</div>`;
      return;
    }
    if (window.renderRescueDashboard) {
      window.renderRescueDashboard({
        team,
        teams: this.responseTeams,
        incidents: this.incidents,
        onStatusChange: (id, status) => this.updateIncidentStatus(id, status),
        onAvailabilityChange: () => this.toggleRescueAvailability(),
        onUpdateLocation: () => this.updateRescueTeamLocation(),
        onFocusMission: id => this.focusRescueMission(id)
      });
      this.renderRescueMap();
      return;
    }
    const host = document.getElementById("rescue-team-assignment-list");
    if (!host) return;
    const put = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = String(value); };
    put("rescue-portal-title", `${team.name} · ${team.category}`);
    put("rescue-welcome", `Welcome, ${team.name}`);
    const button = document.getElementById("rescue-availability-button");
    if (button) {
      button.textContent = team.status === "Available" ? "Set offline" : team.status === "Offline" ? "Set available" : "On assignment";
      button.disabled = team.status === "Busy" || Boolean(team.assignedIncidentId);
      button.classList.toggle("opacity-50", button.disabled);
    }
    const assigned = this.incidents.filter(incident => incident.assignedTeamId === team.id);
    const assignments = assigned.filter(incident => incident.status !== "Resolved").sort((a, b) => this.priorityScore(b) - this.priorityScore(a));
    const completed = assigned.filter(incident => incident.status === "Resolved");
    put("rescue-stat-assigned", assignments.length);
    put("rescue-stat-active", assignments.filter(i => i.status === "In Progress").length);
    put("rescue-stat-completed", completed.length);
    put("rescue-stat-members", Number(team.memberCount) || 1);
    put("rescue-current-mission-count", `${assignments.length} active`);
    const mission = document.getElementById("rescue-current-mission");
    const current = assignments[0];
    if (mission) mission.innerHTML = current ? `
      <article class="rounded-xl bg-slate-900/70 p-4 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-2"><div><p class="text-[10px] font-mono text-slate-400">${this.escapeHTML(current.id)}</p><h3 class="mt-1 font-semibold text-white">${this.escapeHTML(current.title)}</h3><p class="text-xs text-slate-300">${this.escapeHTML(current.location)}</p></div><span class="badge-clean ${this.getSeverityBadgeClass(current.severity)}">${this.escapeHTML(current.severity)}</span></div>
        <div class="flex items-center justify-between text-xs"><span class="text-sky-200">${this.escapeHTML(current.status)}</span><span class="text-slate-400">${this.priorityLabel(current)} priority</span></div>
        <div class="h-2 rounded-full bg-slate-700"><div class="h-2 rounded-full bg-sky-400" style="width:${current.status === "In Progress" ? 70 : 35}%"></div></div>
        <div class="flex flex-wrap gap-2"><button onclick="app.focusRescueMission('${this.escapeHTML(current.id)}')" class="rounded-lg bg-sky-900 px-4 py-2 text-xs text-white">View map</button><select aria-label="Mission status" onchange="app.updateIncidentStatus('${this.escapeHTML(current.id)}',this.value)" class="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white">${["Assigned", "In Progress", "Resolved"].map(status => `<option value="${status}" ${current.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
      </article>` : `<p class="rounded-xl bg-slate-900/70 p-4 text-sm text-slate-300">No active mission assigned.</p>`;
    const fleet = document.getElementById("rescue-fleet-availability");
    if (fleet) {
      const counts = { Available: 0, Busy: 0, Offline: 0 };
      this.responseTeams.forEach(t => { const state = t.assignedIncidentId ? "Busy" : (counts[t.status] !== undefined ? t.status : "Offline"); counts[state]++; });
      const total = Math.max(1, this.responseTeams.length);
      fleet.innerHTML = Object.entries(counts).map(([state, count]) => `<div><div class="mb-1 flex justify-between text-xs"><span class="text-slate-300">${state}</span><span class="text-slate-400">${count} / ${this.responseTeams.length}</span></div><div class="h-2 rounded-full bg-slate-800"><div class="h-2 rounded-full ${state === "Available" ? "bg-emerald-400" : state === "Busy" ? "bg-amber-400" : "bg-slate-500"}" style="width:${count / total * 100}%"></div></div></div>`).join("");
    }
    host.innerHTML = assignments.slice(1).map(incident => `
      <article class="clean-card p-4 space-y-3">
        <div class="flex items-start justify-between gap-3"><div><p class="text-[10px] font-mono text-slate-400">${this.escapeHTML(incident.id)} · ${this.priorityLabel(incident)} priority</p><h3 class="mt-1 text-sm font-semibold text-white">${this.escapeHTML(incident.title)}</h3><p class="text-xs text-slate-400">${this.escapeHTML(incident.location)}</p></div><span class="badge-clean ${this.getSeverityBadgeClass(incident.severity)}">${this.escapeHTML(incident.severity)}</span></div>
        <p class="text-xs text-slate-300">${this.escapeHTML(incident.description)}</p>
        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3"><span class="text-[10px] text-sky-200">${Number(incident.dispatchDistanceKm || 0).toFixed(1)} km straight-line dispatch distance</span><select onchange="app.updateIncidentStatus('${this.escapeHTML(incident.id)}',this.value)" class="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white">${["Assigned", "In Progress", "Resolved"].map(status => `<option value="${status}" ${incident.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
      </article>`).join("") || `<div class="clean-card p-4 text-sm text-slate-300">No other active assignments.</div>`;
    this.renderRescueMap();
  }

  focusRescueMission(incidentId) {
    const incident = this.incidents.find(item => item.id === incidentId);
    if (!incident || !this.rescueMap) return;
    const team = this.responseTeams.find(item => item.id === this.currentUser.teamId);
    const points = team?.coordinates?.length === 2 ? [team.coordinates, incident.coordinates] : [incident.coordinates];
    if (incident.coordinates?.length === 2) this.rescueMap.fitBounds(points, { padding: [32, 32], maxZoom: 15 });
    document.getElementById("rescue-team-map")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  initRescueMap() {
    const container = document.getElementById("rescue-team-map");
    if (!container || this.userRole !== "rescue") return;
    if (!this.rescueMap) {
      this.rescueMap = L.map(container, { zoomControl: true, attributionControl: true }).setView(this.userRealtimeCoords, 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(this.rescueMap);
    }
    this.renderRescueMap();
  }

  renderRescueMap() {
    if (!this.rescueMap || this.userRole !== "rescue") return;
    const routeRequestId = ++this.rescueRouteRequestId;
    this.rescueMapLayers.forEach(layer => this.rescueMap.removeLayer(layer));
    this.rescueMapLayers = [];
    this.renderHospitalMarkers(this.rescueMap, "rescue");
    const team = this.responseTeams.find(item => item.id === this.currentUser.teamId);
    if (!team?.coordinates) return;
    const teamPoint = team.coordinates.map(Number);
    const teamMarker = L.marker(teamPoint, { icon: L.divIcon({ className: "team-marker-wrap", html: `<div class="team-marker">R</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(this.rescueMap).bindPopup(this.escapeHTML(team.name));
    this.rescueMapLayers.push(teamMarker);
    const incident = this.incidents.find(item => item.id === team.assignedIncidentId && item.status !== "Resolved");
    if (incident?.coordinates?.length === 2) {
      const incidentMarker = L.marker(incident.coordinates, { icon: L.divIcon({ className: "incident-map-marker-wrap", html: `<div class="incident-map-marker">!</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(this.rescueMap).bindPopup(this.escapeHTML(incident.title));
      this.rescueMapLayers.push(incidentMarker);
      const status = document.getElementById("rescue-route-status");
      if (status) status.textContent = "Finding road route…";
      const [lat1, lon1] = teamPoint;
      const [lat2, lon2] = incident.coordinates.map(Number);
      const straightFallback = () => {
        if (routeRequestId !== this.rescueRouteRequestId) return;
        const route = L.polyline([teamPoint, [lat2, lon2]], { color: "#38BDF8", weight: 4, dashArray: "7 7" }).addTo(this.rescueMap);
        this.rescueMapLayers.push(route);
        this.rescueMap.fitBounds([teamPoint, [lat2, lon2]], { padding: [32, 32], maxZoom: 15 });
        if (status) status.textContent = "Direct distance shown · road routing unavailable";
      };
      fetch(`https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`)
        .then(response => response.ok ? response.json() : Promise.reject(new Error("Route service unavailable")))
        .then(data => {
          const coordinates = data.routes?.[0]?.geometry?.coordinates;
          if (routeRequestId !== this.rescueRouteRequestId) return;
          if (!coordinates?.length) return straightFallback();
          const route = L.polyline(coordinates.map(([lon, lat]) => [lat, lon]), { color: "#38BDF8", weight: 5, opacity: 0.9 }).addTo(this.rescueMap);
          this.rescueMapLayers.push(route);
          this.rescueMap.fitBounds(route.getBounds(), { padding: [32, 32], maxZoom: 15 });
          if (status) status.textContent = `Road route · ${Number(data.routes[0].distance / 1000).toFixed(1)} km`;
        })
        .catch(straightFallback);
    } else {
      this.rescueMap.setView(teamPoint, 13);
      const status = document.getElementById("rescue-route-status");
      if (status) status.textContent = "Team location · no active route";
    }
    requestAnimationFrame(() => this.rescueMap.invalidateSize());
  }

  updateRescueTeamLocation() {
    if (!navigator.geolocation || !window.isSecureContext) {
      alert("Team location needs browser permission and HTTPS or localhost.");
      return;
    }
    navigator.geolocation.getCurrentPosition(position => {
      const team = this.responseTeams.find(item => item.id === this.currentUser.teamId);
      if (!team) return;
      team.coordinates = [position.coords.latitude, position.coords.longitude];
      this.saveResponseTeams();
      this.renderRescueMap();
    }, () => alert("Could not read team location. Allow location access and try again."), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }

  toggleRescueAvailability() {
    const team = this.responseTeams.find(item => item.id === this.currentUser.teamId);
    if (!team || team.assignedIncidentId) return;
    team.status = team.status === "Available" ? "Offline" : "Available";
    this.saveResponseTeams();
    this.renderRescuePortal();
  }

  initDashboardCharts() {
    const catCanvas = document.getElementById("chart-categories");
    const sevCanvas = document.getElementById("chart-severity");
    if (!window.Chart || !catCanvas || !sevCanvas) return;

    if (this.categoryChart) this.categoryChart.destroy();
    if (this.severityChart) this.severityChart.destroy();

    const catCounts = EMERGENCY_CATEGORIES.map(c => this.incidents.filter(i => i.category === c.id).length);
    this.categoryChart = new Chart(catCanvas, {
      type: "doughnut",
      data: {
        labels: EMERGENCY_CATEGORIES.map(c => c.name),
        datasets: [{
          data: catCounts,
          backgroundColor: ["#EF4444", "#F97316", "#EC4899", "#06B6D4", "#8B5CF6", "#F59E0B"],
          borderWidth: 2,
          borderColor: "#0B1120"
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom", labels: { color: "#94A3B8", boxWidth: 10, font: { size: 10 } } } }
      }
    });

    const sevLabels = ["Low", "Medium", "High", "Critical"];
    const sevCounts = sevLabels.map(s => this.incidents.filter(i => i.severity === s).length);
    this.severityChart = new Chart(sevCanvas, {
      type: "bar",
      data: {
        labels: sevLabels,
        datasets: [{
          data: sevCounts,
          backgroundColor: ["#10B981", "#F59E0B", "#F97316", "#EF4444"],
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        scales: {
          x: { ticks: { color: "#94A3B8" }, grid: { display: false } },
          y: { ticks: { color: "#94A3B8", stepSize: 1 }, grid: { color: "#1E293B" } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  quickFilterByCategory(catId) {
    this.filterCategory = catId;
    this.switchView("admin");
    const select = document.getElementById("admin-filter-category");
    if (select) select.value = catId;
  }

  // Floating AI logic
  initFloatingAi() {
    const input = document.getElementById("floating-ai-input");
    const sendBtn = document.getElementById("floating-ai-send");
    if (input && sendBtn) {
      const handleSend = async () => {
        const text = input.value.trim();
        if (!text) return;
        this.appendAiMessage("user", text);
        input.value = "";
        const localResponse = window.rescueMate.respond(text);
        if (localResponse.type === "protocol") {
          const steps = localResponse.data.steps.map((step, i) => `<div class="mb-1"><strong>${i + 1}.</strong> ${this.escapeHTML(step)}</div>`).join("");
          const sourceUrls = localResponse.data.sourceUrls || (localResponse.data.sourceUrl ? [localResponse.data.sourceUrl] : []);
          const source = sourceUrls.map((url, index) => `<a href="${this.escapeHTML(url)}" target="_blank" rel="noopener noreferrer" class="mt-2 mr-2 inline-block text-[9px] text-sky-300 underline">Red Cross ${index + 1} ↗</a>`).join("");
          this.appendAiMessage("ai", `<div><div class="font-bold text-sky-400 text-xs mb-1">${this.escapeHTML(localResponse.data.title)}</div><p class="mb-2 text-[10px] text-amber-300">${this.escapeHTML(localResponse.reply)} Call local emergency services for life-threatening injuries.</p>${steps}<p class="mt-2 text-[9px] text-slate-400">General first aid information only. Follow the emergency dispatcher and trained responders.</p>${source}</div>`);
          return;
        }
        if (localResponse.type === "triage") {
          this.appendAiMessage("ai", `<p class="text-xs">${this.escapeHTML(localResponse.reply)} Open Report Incident to enter the details and confirm the location.</p>`);
          return;
        }
        if (localResponse.type === "text") {
          this.appendAiMessage("ai", `<p class="text-xs">${this.escapeHTML(localResponse.reply).replace(/\n/g, "<br>")}</p>`);
          return;
        }

        const waiting = this.appendAiMessage("ai", `<p class="text-xs text-slate-400">${this.escapeHTML(localResponse.reply)} Checking local MedLlama2…</p>`);
        const modelResponse = await this.askMedLlama(text);
        if (waiting) waiting.remove();
        if (modelResponse) this.appendAiMessage("ai", `<p class="text-xs">${this.escapeHTML(modelResponse).replace(/\n/g, "<br>")}</p><p class="mt-2 text-[9px] text-slate-500">MedLlama2 local model · general information, not a diagnosis.</p>`);
        else this.appendAiMessage("ai", `<p class="text-xs">${this.escapeHTML(localResponse.reply)}</p><p class="mt-2 text-[9px] text-slate-500">Start the local server and Ollama to enable MedLlama2 answers.</p>`);
      };

      sendBtn.addEventListener("click", handleSend);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") handleSend(); });
    }
  }

  appendAiMessage(sender, html) {
    const body = document.getElementById("floating-ai-messages");
    if (!body) return;
    const div = document.createElement("div");
    div.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
    div.innerHTML = `<div class="max-w-[85%] p-3 rounded-xl text-xs ${sender === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200 border border-slate-700'}">${html}</div>`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  async checkAiService() {
    const status = document.getElementById("ai-engine-status");
    try {
      const response = await fetch("/api/ai/status");
      const data = await response.json();
      if (status) {
        const text = data.available ? `${data.model} ready` : `${data.model} offline`;
        const vision = data.visionAvailable ? `${data.visionModel} ready` : `${data.visionModel || "Vision model"} offline`;
        status.textContent = `${text} · ${vision}`;
      }
    } catch (_) {
      if (status) status.textContent = "MedLlama2 · offline rule-based fallback";
    }
  }

  async askMedLlama(message) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 125000);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const data = await response.json();
      return data.response || null;
    } catch (_) {
      clearTimeout(timeout);
      return null;
    }
  }

  toggleFloatingAi() {
    document.getElementById("floating-ai-window")?.classList.toggle("hidden");
  }

  askAiPrompt(text) {
    const win = document.getElementById("floating-ai-window");
    if (win && win.classList.contains("hidden")) win.classList.remove("hidden");
    const input = document.getElementById("floating-ai-input");
    if (input) {
      input.value = text;
      document.getElementById("floating-ai-send")?.click();
    }
  }

  openLoginModal(tab = "signin") {
    document.getElementById("login-modal")?.classList.remove("hidden");
    this.switchAuthTab(tab);
    this.refreshMapSizes();
  }

  closeLoginModal() {
    document.getElementById("login-modal")?.classList.add("hidden");
    this.refreshMapSizes();
  }

  switchAuthTab(tab) {
    const tabSignIn = document.getElementById("auth-tab-signin");
    const tabSignUp = document.getElementById("auth-tab-signup");
    const tabAdmin = document.getElementById("auth-tab-admin");
    const tabRescue = document.getElementById("auth-tab-rescue");

    const contentSignIn = document.getElementById("auth-content-signin");
    const contentSignUp = document.getElementById("auth-content-signup");
    const contentAdmin = document.getElementById("auth-content-admin");
    const contentRescue = document.getElementById("auth-content-rescue");

    [contentSignIn, contentSignUp, contentAdmin, contentRescue].forEach(el => el?.classList.add("hidden"));
    [tabSignIn, tabSignUp, tabAdmin, tabRescue].forEach(el => {
      el?.classList.remove("text-white", "border-b-2", "border-blue-500");
      el?.classList.add("text-slate-400");
    });

    if (tab === "signin") {
      contentSignIn?.classList.remove("hidden");
      tabSignIn?.classList.add("text-white", "border-b-2", "border-blue-500");
    } else if (tab === "signup") {
      contentSignUp?.classList.remove("hidden");
      tabSignUp?.classList.add("text-white", "border-b-2", "border-blue-500");
    } else if (tab === "admin") {
      contentAdmin?.classList.remove("hidden");
      tabAdmin?.classList.add("text-white", "border-b-2", "border-blue-500");
    } else if (tab === "rescue") {
      contentRescue?.classList.remove("hidden");
      tabRescue?.classList.add("text-white", "border-b-2", "border-blue-500");
    }
  }

  handleUserSignIn(e) {
    e.preventDefault();
    const email = document.getElementById("signin-email")?.value.trim().toLowerCase();
    const password = document.getElementById("signin-password")?.value;
    if (email !== "citizen@disasterx.org" || password !== "citizen123") {
      alert("Demo sign-in only: use citizen@disasterx.org / citizen123.");
      return;
    }
    this.userRole = "citizen";
    this.currentUser = { name: "Demo Citizen", email, role: "citizen" };
    this.updateUserSessionUI();
    this.closeLoginModal();
    this.switchView("report");
  }

  handleUserSignUp(e) {
    e.preventDefault();
    const name = document.getElementById("signup-name")?.value;
    const email = document.getElementById("signup-email")?.value;
    this.userRole = "citizen";
    this.currentUser = { name: name || "New Reporter", email: email, role: "citizen" };
    this.updateUserSessionUI();
    this.closeLoginModal();
    this.switchView("report");
  }

  handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById("admin-login-email")?.value.trim().toLowerCase();
    const password = document.getElementById("admin-login-password")?.value;
    if (email !== "admin@disasterx.org" || password !== "admin123") {
      alert("Invalid demo administrator credentials.");
      return;
    }
    this.userRole = "admin";
    this.currentUser = { name: "Commander Krishna", email: "admin@disasterx.org", role: "admin" };
    this.updateUserSessionUI();
    this.closeLoginModal();
    this.switchView("admin");
  }

  handleRescueLogin(e) {
    e.preventDefault();
    const teamId = document.getElementById("rescue-team-id")?.value.trim().toUpperCase();
    const password = document.getElementById("rescue-team-password")?.value;
    const team = this.responseTeams.find(item => item.id === teamId);
    if (!team || password !== "rescue123") {
      alert("Invalid demo rescue team credentials.");
      return;
    }
    this.userRole = "rescue";
    this.currentUser = { name: team.name, email: "", role: "rescue", teamId: team.id };
    this.updateUserSessionUI();
    this.closeLoginModal();
    this.switchView("rescue");
  }

  quickAdminFill() {
    if (document.getElementById("admin-login-email")) document.getElementById("admin-login-email").value = "admin@disasterx.org";
    const password = document.getElementById("admin-login-password");
    if (password) password.value = "admin123";
  }

  quickUserFill() {
    const email = document.getElementById("signin-email");
    const password = document.getElementById("signin-password");
    if (email) email.value = "citizen@disasterx.org";
    if (password) password.value = "citizen123";
  }

  updateUserSessionUI() {
    const badge = document.getElementById("user-session-badge");
    const footerBtn = document.getElementById("footer-login-btn");
    if (badge) {
      badge.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full ${this.userRole === 'admin' ? 'bg-sky-400' : 'bg-emerald-400'} animate-pulse inline-block mr-1.5"></span>
        <span>${this.escapeHTML(this.currentUser.name)}</span>
        <span class="text-[9px] px-1 py-0.2 rounded bg-slate-800 ml-1 text-slate-300 font-mono">${this.userRole.toUpperCase()}</span>
      `;
    }
    if (footerBtn) {
      footerBtn.textContent = `Session: ${this.currentUser.name} (${this.userRole})`;
    }
    const isAdmin = this.userRole === "admin";
    const isCitizen = this.userRole === "citizen";
    const isRescue = this.userRole === "rescue";
    const isSignedIn = ["admin", "citizen", "rescue"].includes(this.userRole);
    document.querySelectorAll('[data-role="admin"]').forEach(el => el.classList.toggle("hidden", !isAdmin));
    document.querySelectorAll('[data-role="citizen"]').forEach(el => el.classList.toggle("hidden", !isCitizen));
    document.querySelectorAll('[data-role="rescue"]').forEach(el => el.classList.toggle("hidden", !isRescue));
    document.querySelectorAll('[data-role="authenticated"]').forEach(el => el.classList.toggle("hidden", !isSignedIn));
    document.getElementById("session-signout")?.classList.toggle("hidden", !isSignedIn);
  }

  signOut() {
    this.userRole = "guest";
    this.currentUser = { name: "Guest Reporter", email: "", role: "guest" };
    this.updateUserSessionUI();
    this.closeLoginModal();
    this.switchView("home");
  }

  toggleMobileMenu() {
    document.getElementById("mobile-menu")?.classList.toggle("hidden");
  }

  bindEvents() {
    document.getElementById("emergency-report-form")?.addEventListener("submit", (e) => this.submitReport(e));
    document.getElementById("response-team-form")?.addEventListener("submit", (e) => this.addResponseTeam(e));

    const desc = document.getElementById("form-incident-desc");
    const people = document.getElementById("form-incident-people");
    const category = document.getElementById("form-incident-category");
    const title = document.getElementById("form-incident-title");
    [desc, people, category, title].forEach(el => {
      if (el) {
        el.addEventListener("input", () => this.calculateDynamicSeverity());
        el.addEventListener("change", () => this.calculateDynamicSeverity());
      }
    });
    const locationInput = document.getElementById("form-incident-location");
    locationInput?.addEventListener("input", () => {
      this.locationConfirmed = false;
      const status = document.getElementById("gps-status-indicator");
      if (status) status.textContent = "Address changed · wait for map matching or move the pin to confirm it.";
    });
    locationInput?.addEventListener("change", () => this.geocodeIncidentLocation());
    document.getElementById("report-another-button")?.addEventListener("click", () => {
      document.getElementById("emergency-report-form")?.reset();
      this.locationConfirmed = false;
      this.removeUploadedPhoto();
      this.calculateDynamicSeverity();
      this.switchView("report");
    });

    const fileInput = document.getElementById("form-incident-photo");
    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) this.handlePhotoUpload(e.target.files[0]);
      });
    }

    const filterCat = document.getElementById("admin-filter-category");
    if (filterCat) filterCat.addEventListener("change", (e) => { this.filterCategory = e.target.value; this.renderAdminTable(); });
    const filterSev = document.getElementById("admin-filter-severity");
    if (filterSev) filterSev.addEventListener("change", (e) => { this.filterSeverity = e.target.value; this.renderAdminTable(); });
  }
}

window.app = new DisasterXApp();
