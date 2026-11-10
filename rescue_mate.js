// Rescue mate AI - Emergency Guidance & Smart Triage Assistant
// DisasterX Intelligence Engine

const RESCUE_MATE_KNOWLEDGE = {
  cpr: {
    title: "CPR (Cardiopulmonary Resuscitation)",
    category: "Medical Emergency",
    steps: [
      "Check responsiveness: Tap shoulders firmly and shout 'Are you okay?'.",
      "Call emergency services (911 / 112) or instruct someone specific to call.",
      "Check breathing for no more than 10 seconds. If absent or only gasping, start CPR.",
      "Position hands: Place the heel of one hand in the center of the chest (lower half of sternum), interlock the other hand.",
      "Deliver compressions: Push hard and fast at 100-120 beats/minute (to the rhythm of 'Stayin' Alive'), 2-2.4 inches deep.",
      "Allow full chest recoil between compressions.",
      "If trained: Give 2 rescue breaths after every 30 compressions. Otherwise, perform continuous Hands-Only CPR.",
      "Deploy AED immediately as soon as available and follow voice prompts."
    ]
  },
  bleeding: {
    title: "Severe Bleeding & Hemorrhage Control",
    category: "Medical Emergency",
    steps: [
      "Ensure personal safety (wear gloves or use barrier if available).",
      "Expose the wound by cutting or removing clothing.",
      "Apply direct, continuous, firm pressure with a clean cloth, sterile gauze, or gloved hands.",
      "Do NOT remove deeply embedded objects (glass, metal) - pack gauze around them to stabilize.",
      "If blood soaks through, add more layers without lifting the original cloth.",
      "For life-threatening bleeding from an arm or leg, use a commercial tourniquet if available and you are trained. Place it above the wound, not on a joint; do not loosen it."
    ],
    sourceUrl: "https://www.redcross.org/take-a-class/resources/learn-first-aid/bleeding-life-threatening-external"
  },
  roadAccident: {
    title: "Severe Road Accident: Immediate First Aid",
    category: "Road Accident",
    steps: [
      "Protect yourself first. Do not enter traffic, fire, fuel spills, unstable vehicles, or other hazards. Ask someone to call emergency services now (India: 112).",
      "Do not move a person after a major crash if head, neck, back, or pelvic injury is possible. Move them only if the scene is unsafe or you must provide CPR or control life-threatening bleeding.",
      "Check whether they respond and breathe normally. If they are unresponsive and not breathing normally, begin CPR if you can and use an AED as soon as available.",
      "For severe bleeding, press firmly on the wound with clean cloth or gauze. For life-threatening bleeding from an arm or leg, use a commercial tourniquet if available and you know how; do not loosen it.",
      "Keep the person still and warm, reassure them, and keep watching their breathing and responsiveness until responders arrive. Do not give food or drink.",
      "If a helmet is on, do not remove it unless needed to provide CPR. Follow instructions from the emergency dispatcher." 
    ],
    sourceUrls: [
      "https://www.redcross.org/take-a-class/first-aid/performing-first-aid/first-aid-steps",
      "https://www.redcross.org/take-a-class/resources/learn-first-aid/head-neck-spinal-injury",
      "https://www.redcross.org/take-a-class/resources/learn-first-aid/bleeding-life-threatening-external"
    ]
  },
  fire: {
    title: "Fire Evacuation & Smoke Safety",
    category: "Fire Emergency",
    steps: [
      "Alert everyone in the building and pull manual fire alarm.",
      "Feel closed doors with the back of your hand before opening. If hot or smoke is seeping, DO NOT open.",
      "Crawl low under smoke - cleanest breathable air is 12-24 inches off the floor.",
      "If clothes catch fire: STOP, DROP, and ROLL to extinguish flames.",
      "Never use elevators during a fire; always take the emergency stairwells.",
      "Once outside, proceed to designated muster point and stay at least 300 feet away."
    ]
  },
  flood: {
    title: "Flash Flood Survival & Evacuation",
    category: "Flood",
    steps: [
      "Move immediately to higher ground. Do not wait for instructions if rising waters are seen.",
      "Never attempt to walk, swim, or drive through flowing floodwaters. Just 6 inches of moving water can sweep an adult away; 12 inches can carry away a car.",
      "Disconnect main electrical breakers and gas supplies before water enters the premise.",
      "If trapped in a building, climb to the roof rather than an attic without roof egress.",
      "Keep phone batteries conserved; flash bright lights or wave bright cloth to signal aerial rescuers."
    ]
  },
  collapse: {
    title: "Building Collapse & Earthquake Protocol",
    category: "Building Collapse",
    steps: [
      "DROP, COVER, and HOLD ON under heavy, sturdy furniture (sturdy desk or interior corner).",
      "Stay away from glass windows, exterior walls, and overhead lighting fixtures.",
      "If trapped in rubble: Cover mouth and nose with cloth to filter dust. Avoid shouting (conserves oxygen and prevents dust inhalation); tap rhythmically on pipes or walls with a stone or metal object.",
      "Do not light matches or lighters due to possible ruptured gas mains.",
      "Listen for acoustic search sensors used by search & rescue teams."
    ]
  },
  burns: {
    title: "Thermal & Chemical Burn Treatment",
    category: "Medical Emergency",
    steps: [
      "Remove source of heat immediately.",
      "Cool the burn under gentle, cool running tap water for 15-20 minutes. NEVER use ice, freezing water, or butter.",
      "Remove tight items (rings, belts) before swelling occurs.",
      "Cover loosely with a sterile, non-adherent dressing or clean plastic cling film.",
      "Do not burst blisters as this increases infection risk.",
      "Seek emergency medical evaluation for burns larger than 3 inches, or on face, hands, joints, or groin."
    ]
  }
};

class RescueMateAssistant {
  constructor() {
    this.history = [];
    this.speechSynthesis = window.speechSynthesis || null;
    this.isSpeaking = false;
  }

  // Smart Emergency Parsing for automated form filling
  parseEmergencyText(text) {
    const lower = text.toLowerCase();
    
    // Category detection
    let category = "Other Emergencies";
    if (lower.includes("fire") || lower.includes("smoke") || lower.includes("explosion") || lower.includes("flame") || lower.includes("burning")) {
      category = "Fire Emergency";
    } else if (lower.includes("crash") || lower.includes("accident") || lower.includes("car") || lower.includes("truck") || lower.includes("vehicle") || lower.includes("collision") || lower.includes("pileup") || lower.includes("motorcycle")) {
      category = "Road Accident";
    } else if (lower.includes("heart") || lower.includes("cpr") || lower.includes("faint") || lower.includes("unconscious") || lower.includes("bleeding") || lower.includes("breathing") || lower.includes("seizure") || lower.includes("medical")) {
      category = "Medical Emergency";
    } else if (lower.includes("flood") || lower.includes("water") || lower.includes("drowning") || lower.includes("river") || lower.includes("rain") || lower.includes("submerged")) {
      category = "Flood";
    } else if (lower.includes("collapse") || lower.includes("building") || lower.includes("rubble") || lower.includes("structural") || lower.includes("wall fell") || lower.includes("earthquake")) {
      category = "Building Collapse";
    }

    // Casualties extraction
    let peopleAffected = 1;
    const casualtyMatch = text.match(/(\d+)\s*(people|persons|injured|casualties|victims|trapped|dead)/i);
    if (casualtyMatch) {
      peopleAffected = parseInt(casualtyMatch[1], 10);
    } else if (lower.includes("multiple") || lower.includes("several")) {
      peopleAffected = 4;
    } else if (lower.includes("mass") || lower.includes("dozens")) {
      peopleAffected = 15;
    }

    // Severity calculation
    let severity = "Medium";
    if (peopleAffected >= 5 || lower.includes("dead") || lower.includes("fatal") || lower.includes("explosion") || lower.includes("critical") || lower.includes("trapped") || lower.includes("massive fire") || lower.includes("collapse")) {
      severity = "Critical";
    } else if (peopleAffected >= 2 || category === "Fire Emergency" || category === "Flood" || lower.includes("heavy bleeding") || lower.includes("unconscious")) {
      severity = "High";
    } else if (peopleAffected === 0 || lower.includes("minor") || lower.includes("small") || lower.includes("controlled")) {
      severity = "Low";
    }

    // Title generation
    let title = "";
    if (category === "Fire Emergency") title = `Fire Outbreak Report - ${severity} Priority`;
    else if (category === "Road Accident") title = `Traffic Collision involving ${peopleAffected > 1 ? peopleAffected + ' individuals' : 'vehicles'}`;
    else if (category === "Flood") title = `Localized Inundation and Water Surge`;
    else if (category === "Building Collapse") title = `Structural Distress and Building Hazard`;
    else if (category === "Medical Emergency") title = `Urgent Medical Intervention Request`;
    else title = `Reported Incident - Immediate Response Requested`;

    return {
      title,
      category,
      severity,
      peopleAffected,
      description: text,
      suggestedLocation: text.match(/(?:at|near|on|in)\s+([A-Za-z0-9\s,\.-]+?)(?:\s+(?:with|and|where|having|$))/i)?.[1]?.trim() || ""
    };
  }

  // Answer user query in conversational chat
  respond(query) {
    const q = query.toLowerCase().trim();

    if ((q.includes("crash") || q.includes("collision") || q.includes("accident")) && (q.includes("first aid") || q.includes("what should") || q.includes("what to do") || q.includes("help me") || q.includes("severe") || q.includes("serious") || q.includes("injur") || q.includes("bleed") || q.includes("trapped"))) {
      return {
        reply: "A severe crash can cause hidden head, neck, or spine injuries. Call emergency services, protect yourself from traffic and fire, and follow these steps while help is coming:",
        data: RESCUE_MATE_KNOWLEDGE.roadAccident,
        type: "protocol"
      };
    }

    // Check for first aid or protocols
    if (q.includes("cpr") || q.includes("chest compression") || q.includes("heart attack") || q.includes("cardiac")) {
      return {
        reply: "Here is the critical CPR protocol. Act fast—every second counts! Push hard and fast in the center of the chest at 100-120 BPM.",
        data: RESCUE_MATE_KNOWLEDGE.cpr,
        type: "protocol"
      };
    }

    if (q.includes("bleed") || q.includes("hemorrhage") || q.includes("tourniquet") || q.includes("blood")) {
      return {
        reply: "Severe bleeding must be controlled immediately. Apply direct, firm pressure with a clean cloth. If arterial or unyielding, use a tourniquet 2-3 inches above the wound.",
        data: RESCUE_MATE_KNOWLEDGE.bleeding,
        type: "protocol"
      };
    }

    if (q.includes("fire") || q.includes("smoke") || q.includes("burning") || q.includes("flame")) {
      return {
        reply: "Fire evacuation rules: Crawl low under smoke where air is cleaner. Test doors with the back of your hand before opening. Never take elevators.",
        data: RESCUE_MATE_KNOWLEDGE.fire,
        type: "protocol"
      };
    }

    if (q.includes("flood") || q.includes("water") || q.includes("drown")) {
      return {
        reply: "Flash flood warnings: Seek high ground immediately. Never walk or drive across moving floodwaters. Disconnect electrical mains if safe.",
        data: RESCUE_MATE_KNOWLEDGE.flood,
        type: "protocol"
      };
    }

    if (q.includes("collapse") || q.includes("earthquake") || q.includes("rubble") || q.includes("building")) {
      return {
        reply: "Structural collapse / Earthquake: DROP, COVER, and HOLD ON under heavy furniture. If trapped, do not light flame, cover your mouth, and tap rhythmically on pipes.",
        data: RESCUE_MATE_KNOWLEDGE.collapse,
        type: "protocol"
      };
    }

    if (q.includes("burn") || q.includes("scald") || q.includes("hot water") || q.includes("chemical")) {
      return {
        reply: "Thermal Burn Protocol: Cool under cool running tap water for 15-20 minutes. Do NOT apply ice or butter. Cover loosely with sterile film.",
        data: RESCUE_MATE_KNOWLEDGE.burns,
        type: "protocol"
      };
    }

    if (q.includes("helpline") || q.includes("contact") || q.includes("phone") || q.includes("police") || q.includes("ambulance")) {
      return {
        reply: "🚨 Emergency Contact Directory:\n• 911 / 112: Universal Emergency Command (Police/Fire/EMS)\n• 108: Emergency Ambulance Dispatch\n• 101: Fire & Disaster Service\n• 100: Law Enforcement Control\n• 1077: Disaster Management Authority Control Room",
        type: "text"
      };
    }

    // If query resembles an incident report description, offer Smart Triage
    const triage = this.parseEmergencyText(query);
    if (q.split(" ").length > 3 && /\b(accident|crash|collision|fire|smoke|flood|drown\w*|collapse|bleed\w*|injur\w*|trapped|unconscious|burn\w*|explosion|medical emergency)\b/.test(q)) {
      return {
        reply: `Based on what you described, this may be a **${triage.category}** incident with **${triage.severity}** severity. ${triage.peopleAffected} people may be affected. Call emergency services for immediate danger, then submit the details in Report Incident.`,
        type: "triage"
      };
    }

    // Default friendly assistant fallback
    return {
      reply: "Hello, I am **Rescue mate AI**, your first aid and incident response companion. I can share general guidance for CPR, severe bleeding, fire, or flood emergencies. How can I assist you?",
      type: "general"
    };
  }

  // Voice output
  speak(text) {
    if (!this.speechSynthesis) return;
    this.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_`]/g, ""));
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    this.isSpeaking = true;
    utterance.onend = () => { this.isSpeaking = false; };
    utterance.onerror = () => { this.isSpeaking = false; };
    this.speechSynthesis.speak(utterance);
  }

  stopSpeaking() {
    if (this.speechSynthesis) {
      this.speechSynthesis.cancel();
      this.isSpeaking = false;
    }
  }
}

window.rescueMate = new RescueMateAssistant();
