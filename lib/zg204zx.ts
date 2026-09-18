'use strict';

export function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampPercent(value: number): number {
  return clampNumber(value, 0, 100);
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

/**
 * Convert a raw reported temperature to °C.
 *
 * Assumptions:
 * - The sensor reports temperature scaled by 10 (i.e. 234 => 23.4).
 */
export function rawTemperatureTimes10ToCelsius(rawTimes10: number): number {
  return rawTimes10 / 10;
}

/**
 * Convert a raw reported detection distance to meters.
 *
 * Assumptions:
 * - The sensor reports distance scaled by 100 (i.e. 350 => 3.5m).
 */
export function rawDistanceTimes100ToMeters(rawTimes100: number): number {
  return rawTimes100 / 100;
}

// Tuya ZG-204ZX writable datapoints expect integer formats:
// - Temperature calibration (DP 105): tenths of °C, range -20..20 (== -2.0..+2.0°C)
// - Humidity calibration (DP 104): integer %, range -30..30
// - Fading time (DP 102): seconds, range 0..28800
// - Illuminance interval (DP 107): minutes, range 1..720
// - Detection distance (DP 4): centimeters, range 0..500 (== 0..5.00m)
// - Motion/static detection sensitivity (DP 123/2): integer, range 0..10
export function toTuyaTemperatureCalibrationTenths(offsetC: number): number {
  return clampInt(offsetC * 10, -20, 20);
}

export function toTuyaHumidityCalibration(offsetPercent: number): number {
  return clampInt(offsetPercent, -30, 30);
}

export function toTuyaFadingTimeSeconds(seconds: number): number {
  return clampInt(seconds, 0, 28800);
}

export function toTuyaIlluminanceIntervalMinutes(minutes: number): number {
  return clampInt(minutes, 1, 720);
}

export function toTuyaDetectionDistanceCentimeters(meters: number): number {
  return clampInt(meters * 100, 0, 500);
}

export function toTuyaSensitivity(value: number): number {
  return clampInt(value, 0, 10);
}
