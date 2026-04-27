export const classifyBehavior = (
  gForce: number,
  gyroX: number,
  gyroY: number,
  gyroZ: number,
  isInPubOrClub: boolean,
  microphoneAmplitude: number
): "normal" | "fall" | "dance" | "celebration" => {
  // Heuristic rules for behavior classification
  if (gForce > 2.5 && Math.abs(gyroX) > 0.5 && !isInPubOrClub) return "fall";
  if (isInPubOrClub && microphoneAmplitude > 0.5) return "dance"; 
  if (gForce > 1.5 && (Math.abs(gyroY) > 1.0 || Math.abs(gyroZ) > 1.0)) return "celebration";
  return "normal";
};
