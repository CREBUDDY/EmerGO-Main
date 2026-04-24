export interface SensorData {
  voiceKeywords: string[];    // detected threat keywords
  voiceTranscript: string;    // continuous stream of transcribed voice
  voiceLevel: number;         // current volume level
  motionAccel: number;        // max acceleration recorded in last window
  speedKmH: number;           // speed from geolocation
  isAwayFromHome: boolean;    // boolean context
  interactionRate: number;    // clicks/keys per minute
  connectedMeshNodes: number; // mesh network proximity inference
  activeSensors: {            // tracks if a sensor is actually providing data/has permissions
    voice: boolean;
    motion: boolean;
    context: boolean;
  };
}

export interface CalibrationProfile {
  baseline: {
    voice: number;
    motion: number;
  };
  max: {
    voice: number;
    motion: number;
  };
  confidence: {
    voice: number;
    motion: number;
  };
  calibratedAt: number;
}

export interface ScoringResult {
  score: number;
  breakdown: {
    voice: number;
    motion: number;
    context: number;
    behavior: number;
  };
  reasons: string[];
}

const EMERGENCY_KEYWORDS = ['help', 'stop', 'emergency', 'distress', 'police', 'attack', 'crash'];

export const calculateRiskScore = (data: SensorData): ScoringResult => {
  let voiceScore = 0;
  let motionScore = 0;
  let contextScore = 0;
  let behaviorScore = 0;
  const reasons: string[] = [];

  // 1. Voice (0 - 100)
  const matchCount = data.voiceKeywords.filter(w => EMERGENCY_KEYWORDS.includes(w.toLowerCase())).length;
  if (matchCount > 0) {
    voiceScore = Math.min(100, matchCount * 35); // 3 keywords maxes out
    reasons.push(`Detected ${matchCount} emergency keywords.`);
  }

  // Uncalibrated Fallback (Typical max byte frequency is ~255, normal loud talking is usually 50-80)
  // Always calculate voiceScore if we have any volume data at all
  if (data.voiceLevel > 90) {
    voiceScore = Math.max(voiceScore, 80);
    reasons.push(`Extreme ambient noise detected: ${data.voiceLevel.toFixed(0)}.`);
  } else if (data.voiceLevel > 70) {
    voiceScore = Math.max(voiceScore, 60);
    reasons.push(`High ambient noise detected: ${data.voiceLevel.toFixed(0)}.`);
  } else if (data.voiceLevel > 50) {
    voiceScore = Math.max(voiceScore, 40);
  } else if (data.voiceLevel > 30) {
    voiceScore = Math.max(voiceScore, 20);
  }

  // 2. Motion (0 - 100)
  // Fallback static scoring (boosted for Demo)
  if (data.motionAccel > 8) {
    motionScore = 100;
    reasons.push(`High impact/motion detected (${data.motionAccel.toFixed(1)}g).`);
  } else if (data.motionAccel > 3) {
    motionScore = 50; // light movement for demo
    reasons.push(`Light motion detected (${data.motionAccel.toFixed(1)}g). Demo mode active.`);
  }

  // 3. Context (0 - 100)
  if (data.activeSensors.context) {
    if (data.speedKmH > 60) {
      contextScore += 50;
      reasons.push(`High speed movement (${data.speedKmH.toFixed(0)} km/h).`);
    } else if (data.speedKmH > 15) {
      contextScore += 20;
    }
    if (data.isAwayFromHome) {
      contextScore += 30;
    }
  } else {
    // GPS Fallback: Infer context from motion patterns and mesh node proximity
    if (data.motionAccel > 10 && data.connectedMeshNodes < 2) {
      contextScore += 40;
      reasons.push(`Inferred location change: Elevated motion (${data.motionAccel.toFixed(1)}g) with low mesh proximity (${data.connectedMeshNodes} node(s)).`);
    } else if (data.motionAccel > 15) {
      contextScore += 30; 
      reasons.push(`Inferred traversal: Sustained high motion without GPS validation.`);
    } else if (data.interactionRate === 0 && data.connectedMeshNodes === 0) {
      contextScore += 20;
      reasons.push(`Isolated state: 0 nearby mesh nodes.`);
    }
  }
  contextScore = Math.min(100, contextScore);

  // 4. Behavior (0 - 100)
  if (data.interactionRate > 100) {
    behaviorScore = 80;
    reasons.push(`Erratic device interaction (${data.interactionRate} actions/min).`);
  } else if (data.interactionRate === 0 && data.motionAccel > 5) {
    behaviorScore = 60;
    reasons.push(`No interaction during motion event.`);
  } else if (data.interactionRate > 50) {
    behaviorScore = 50;
  } else if (data.interactionRate > 15) {
    behaviorScore = 40;
    reasons.push(`Testing interaction rate logic for demo.`);
  }

  // Multiply by dynamically adjusted weights perfectly scaled to available sensors
  let weights = { voice: 0.3, motion: 0.3, context: 0.2, behavior: 0.2 };
  
  // Disable weights for unavailable sensors
  if (!data.activeSensors.voice) {
    weights.voice = 0;
    reasons.push(`Sensor Error: Voice unavailable.`);
  }
  if (!data.activeSensors.motion) {
    weights.motion = 0;
    reasons.push(`Sensor Error: Motion unavailable.`);
  }
  if (!data.activeSensors.context && data.connectedMeshNodes === 0 && data.speedKmH === 0) {
    // Treat context as dead if GPS is dead AND mesh inferred proxy is dead
    weights.context = 0;
    reasons.push(`Sensor Error: Context/GPS unavailable.`);
  }

  // If behavior is the only thing active with voice, and voice is the primary intent, scale behavior down to let voice rule
  if (data.activeSensors.voice && !data.activeSensors.motion && !data.activeSensors.context) {
     weights.behavior = 0.1; // heavily bias towards the one physical sensor left
     voiceScore = Math.min(100, voiceScore * 1.5); // Boost raw voice score manually so it can reach the threshold quicker alone
  }
  // Behavior is always derivable conceptually via device interaction loops

  // Proportional Redistribution ensures that the score remains accurate even if 2 sensors are down
  const activeWeightSum = weights.voice + weights.motion + weights.context + weights.behavior;

  if (activeWeightSum > 0 && activeWeightSum < 1.0) {
    const scale = 1.0 / activeWeightSum;
    weights.voice *= scale;
    weights.motion *= scale;
    weights.context *= scale;
    weights.behavior *= scale;
    reasons.push(`Dynamically scaled scoring. Calculated solely on ${Math.round(activeWeightSum * 100)}% available sensors.`);
  } else if (activeWeightSum === 0) {
    reasons.push(`All critical sensors offline. Auto SOS disabled.`);
    return { score: 0, breakdown: { voice: 0, motion: 0, context: 0, behavior: 0 }, reasons };
  }

  const weightedVoice = voiceScore * weights.voice;
  const weightedMotion = motionScore * weights.motion;
  const weightedContext = contextScore * weights.context;
  const weightedBehavior = behaviorScore * weights.behavior;

  let totalScore = Math.round(weightedVoice + weightedMotion + weightedContext + weightedBehavior);

  // Safety Constraint
  let activeSignals = 0;
  if (weights.voice > 0 && voiceScore > 20) activeSignals++;
  if (weights.motion > 0 && motionScore > 20) activeSignals++;
  if (weights.context > 0 && contextScore > 40) activeSignals++;
  if (weights.behavior > 0 && behaviorScore > 30) activeSignals++;

  // We only constrain if we have enough sensors healthy to warrant a constraint. 
  // If only 1 or 2 sensors are alive, we shouldn't block them if they hit high certainty.
  const activeSensorCount = (data.activeSensors.voice ? 1 : 0) + (data.activeSensors.motion ? 1 : 0) + ((data.activeSensors.context || data.connectedMeshNodes > 0 || data.speedKmH > 0) ? 1 : 0) + 1; // +1 for behavior

  if (totalScore > 65) {
     if (activeSensorCount >= 3 && activeSignals < 2) {
        if (voiceScore >= 60 || matchCount >= 2) {
          reasons.push("Overridden multi-signal constraint due to explicit voice flags (extreme noise or keywords).");
        } else {
          totalScore = 65;
          reasons.push("Capped score: insufficient multi-sensor confirmation.");
        }
     }
  }

  return {
    score: Math.min(100, Math.max(0, totalScore)),
    breakdown: {
      voice: Math.round(weightedVoice),
      motion: Math.round(weightedMotion),
      context: Math.round(weightedContext),
      behavior: Math.round(weightedBehavior)
    },
    reasons
  };
};
