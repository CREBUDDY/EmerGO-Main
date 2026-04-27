export const calculateRiskScore = (
  voiceRiskScore: number,
  fallDetected: boolean,
  inactivityMinutes: number,
  isHighRiskLocation: boolean,
  batteryPercentage: number,
  userContext: "home" | "work" | "pub" | "outdoors"
): number => {
  let score = 0;
  let thresholdMultiplier = 1.0;

  // Adjust thresholds based on context
  if (userContext === "pub") thresholdMultiplier = 0.3; // Lower sensitivity in pubs
  if (userContext === "home") thresholdMultiplier = 0.7; // Moderate sensitivity at home
  if (userContext === "outdoors") thresholdMultiplier = 1.2;

  score += voiceRiskScore * 2 * thresholdMultiplier;
  if (fallDetected) score += 30 * thresholdMultiplier;
  score += inactivityMinutes * 5;
  if (isHighRiskLocation) score += 20;
  if (batteryPercentage < 20) score += 10;

  return Math.min(score, 100);
};
