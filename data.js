// Initial demo data for DisasterX.

const INITIAL_INCIDENTS = [
  {
    id: "INC-922d582f",
    title: "Three-Alarm Commercial Fire at Port Bay",
    description: "Caller reports massive black smoke and flames coming from a storage warehouse. Explosions heard from chemical containers. Workers evacuating building.",
    category: "Fire Emergency",
    severity: "Critical",
    status: "In Progress",
    assignedTeamId: "TEAM-FIRE-01",
    assignedTeamName: "Fire Unit 01",
    location: "200 Bay Street, Harbor Industrial District",
    nearbyLandmarks: "Adjacent to Pier 14 & Waterfront Cold Storage",
    coordinates: [13.0827, 80.2707], // Default city center coordinates
    peopleAffected: 12,
    reporterName: "Marcus Sterling",
    reporterContact: "+1 (555) 942-8812",
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    photoUrl: "https://images.unsplash.com/photo-1542385151-efd9000785a0?auto=format&fit=crop&w=600&q=80",
    assignedUnits: ["Engine 44", "Ladder 12", "Hazmat Unit 2"],
    notes: "Fire spreading toward northeast chemical tanks. Triage zone established at Bay Street intersection."
  },
  {
    id: "INC-883a411c",
    title: "Multi-Vehicle Pileup on North Expressway",
    description: "Collision involving a loaded fuel tanker and 3 passenger vehicles. Fuel spill reported across two active lanes. Two individuals trapped in vehicle cabin.",
    category: "Road Accident",
    severity: "Critical",
    status: "Assigned",
    assignedTeamId: "TEAM-MED-01",
    assignedTeamName: "Medical Unit 01",
    location: "Mile Marker 42, Northbound Expressway",
    nearbyLandmarks: "Overpass near Exit 9B, Green Valley Junction",
    coordinates: [13.0950, 80.2520],
    peopleAffected: 7,
    reporterName: "Elena Rostova",
    reporterContact: "+1 (555) 314-9901",
    timestamp: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
    photoUrl: "https://images.unsplash.com/photo-1590483736427-4a006c6e3925?auto=format&fit=crop&w=600&q=80",
    assignedUnits: ["Ambulance 07", "Rescue 3", "Traffic Police Delta"],
    notes: "Northbound lanes blocked. Heavy hydraulic cutters en route."
  },
  {
    id: "INC-441e990b",
    title: "River Flash Flood Inundation & Rising Waters",
    description: "Flash flood following severe storm surge. Riverbank breached, inundating residential homes up to 4 feet of water. Families sheltering on rooftops.",
    category: "Flood",
    severity: "High",
    status: "Assigned",
    assignedTeamId: "TEAM-RES-01",
    assignedTeamName: "Rescue Unit 01",
    location: "Riverside Colony, Sector 4 Lowland",
    nearbyLandmarks: "Old Steel Bridge, Riverside Community Hall",
    coordinates: [13.0640, 80.2310],
    peopleAffected: 28,
    reporterName: "Devon Reed",
    reporterContact: "+1 (555) 778-4321",
    timestamp: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    photoUrl: "https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=600&q=80",
    assignedUnits: ["Water Rescue Boat 1", "Disaster Relief Squad"],
    notes: "Boat evacuation required. Power substation shut down in Sector 4."
  },
  {
    id: "INC-612b774a",
    title: "Structural Crack & Partial Balcony Collapse",
    description: "Older 4-storey residential block experienced severe structural settlement after heavy rain. Balcony section collapsed onto courtyard.",
    category: "Building Collapse",
    severity: "High",
    status: "In Progress",
    assignedTeamId: "TEAM-MULTI-01",
    assignedTeamName: "Multi Response 01",
    location: "44 Victoria Crescent, Heritage Quarter",
    nearbyLandmarks: "Behind St. Andrew's Church, Library Square",
    coordinates: [13.0720, 80.2640],
    peopleAffected: 4,
    reporterName: "Sarah Al-Mansoor",
    reporterContact: "+1 (555) 233-9081",
    timestamp: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    photoUrl: "https://images.unsplash.com/photo-1599818816933-4f9382f6f5be?auto=format&fit=crop&w=600&q=80",
    assignedUnits: ["Structural Engineer Unit", "Civil Defense Squad 6"],
    notes: "Building fully cordoned off. 18 tenants relocated to temporary shelter."
  },
  {
    id: "INC-309f125d",
    title: "Acute Respiratory Distress at Public Arena",
    description: "Multiple attendees exhibiting fainting, wheezing, and allergic reaction symptoms near indoor food court. Suspected ventilation failure.",
    category: "Medical Emergency",
    severity: "Medium",
    status: "In Progress",
    location: "Metro Convention Arena, Hall B",
    nearbyLandmarks: "Gate 3, North Plaza Metro Entrance",
    coordinates: [13.0510, 80.2450],
    peopleAffected: 5,
    reporterName: "Dr. Kevin Tran",
    reporterContact: "+1 (555) 441-2099",
    timestamp: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
    photoUrl: "https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?auto=format&fit=crop&w=600&q=80",
    assignedUnits: ["Rapid Paramedic Unit 10", "Facility Safety Team"],
    notes: "Air ducts isolated. 3 patients stabilized on site with oxygen."
  },
  {
    id: "INC-772c883e",
    title: "Major Power Substation Transformer Sparking",
    description: "High voltage transformer throwing repeated sparks with loud popping noises. Strong ozone smell. Danger of ignition near dry brush.",
    category: "Other Emergencies",
    severity: "Low",
    status: "Resolved",
    location: "Substation 12-A, Pinehill Suburb",
    nearbyLandmarks: "Adjacent to Water Tower, Hilltop Road",
    coordinates: [13.1120, 80.2200],
    peopleAffected: 0,
    reporterName: "Officer J. Miller",
    reporterContact: "+1 (555) 800-2911",
    timestamp: new Date(Date.now() - 210 * 60 * 1000).toISOString(),
    photoUrl: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=600&q=80",
    assignedUnits: ["Grid Utility Response", "Fire Engine 9 (Standby)"],
    notes: "Power breaker tripped by utility control. Transformer cooled and isolated."
  }
];

const INITIAL_RESPONSE_TEAMS = [
  { id: "TEAM-FIRE-01", name: "Fire Unit 01", category: "Fire", coordinates: [13.0805, 80.2690], memberCount: 4, status: "Busy", assignedIncidentId: "INC-922d582f" },
  { id: "TEAM-MED-01", name: "Medical Unit 01", category: "Medical", coordinates: [13.0910, 80.2470], memberCount: 3, status: "Busy", assignedIncidentId: "INC-883a411c" },
  { id: "TEAM-RES-01", name: "Rescue Unit 01", category: "Rescue", coordinates: [13.0640, 80.2310], memberCount: 5, status: "Busy", assignedIncidentId: "INC-441e990b" },
  { id: "TEAM-MULTI-01", name: "Multi Response 01", category: "Multi-purpose", coordinates: [13.0720, 80.2640], memberCount: 4, status: "Busy", assignedIncidentId: "INC-612b774a" }
];

// Helper to seed localStorage if empty
function initializeLocalStorageData() {
  const existing = localStorage.getItem("disasterx_incidents");
  if (!existing) {
    localStorage.setItem("disasterx_incidents", JSON.stringify(INITIAL_INCIDENTS));
  }
  if (!localStorage.getItem("disasterx_response_teams")) {
    localStorage.setItem("disasterx_response_teams", JSON.stringify(INITIAL_RESPONSE_TEAMS));
  }
}

// Categories list matching Round 1 spec
const EMERGENCY_CATEGORIES = [
  { id: "Fire Emergency", name: "Fire Emergency", icon: "flame", color: "#EF4444", bg: "rgba(239,68,68,0.15)" },
  { id: "Road Accident", name: "Road Accident", icon: "car", color: "#F97316", bg: "rgba(249,115,22,0.15)" },
  { id: "Medical Emergency", name: "Medical Emergency", icon: "heart-pulse", color: "#EC4899", bg: "rgba(236,72,153,0.15)" },
  { id: "Flood", name: "Flood", icon: "waves", color: "#06B6D4", bg: "rgba(6,182,212,0.15)" },
  { id: "Building Collapse", name: "Building Collapse", icon: "building-2", color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
  { id: "Other Emergencies", name: "Other Emergencies", icon: "alert-triangle", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" }
];

// Severity levels
const SEVERITY_LEVELS = [
  { level: "Low", color: "#10B981", badgeClass: "badge-low", description: "Minimal immediate danger, no casualties or minor property disruption." },
  { level: "Medium", color: "#F59E0B", badgeClass: "badge-medium", description: "Moderate threat, potential injuries, contained escalation risk." },
  { level: "High", color: "#F97316", badgeClass: "badge-high", description: "Severe threat, active casualties, significant danger to life or infrastructure." },
  { level: "Critical", color: "#EF4444", badgeClass: "badge-critical", description: "Life-threatening catastrophe, mass casualties, explosive spread, immediate mobilization required." }
];

// Status options
const STATUS_OPTIONS = ["Reported", "Pending", "Assigned", "In Progress", "Resolved"];
