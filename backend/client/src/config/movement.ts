// Movement configuration constants
// Keep comments in English per project guidelines
// Tuning notes:
// - baseSpeed: blocks per second for normal walking. Raise to make walking faster.
// - boostMultiplier: applied to baseSpeed when CTRL is held. e.g. 2.0 => double speed while boosting.
// - acceleration: units/sec^2 controlling how quickly the player's velocity moves toward the
//   target velocity. Higher values make movement snappy (less sliding); lower values increase
//   sliding/inertia when starting/stopping.
// Example: baseSpeed=6, boostMultiplier=1.9, acceleration=40 gives a quick but still smooth feel.
export const MOVE_CONFIG = {
  baseSpeed: 6.0, // blocks per second (base walking speed)
  boostMultiplier: 1.9, // multiplier when boost (CTRL) is held
  acceleration: 40.0, // units per second squared (how fast velocity approaches target)
};
