'use strict';

/**
 * Handler types for DP processing
 */
export type DpHandler = 'presence' | 'illuminance' | 'temperature' | 'humidity' | 'battery' | 'setting';

/**
 * DP to handler mapping.
 *
 * Source: HOBEIAN ZG-204ZX definition in zigbee-herdsman-converters
 * (https://github.com/Koenkk/zigbee-herdsman-converters/blob/master/src/devices/tuya.ts,
 * fingerprint TS0601 / _TZE200_w0ap83qu).
 */
export const DP_HANDLERS: Record<number, { handler: DpHandler; divideBy?: number }> = {
  1: { handler: 'presence' },
  106: { handler: 'illuminance' },
  111: { handler: 'temperature', divideBy: 10 },
  101: { handler: 'humidity' },
  110: { handler: 'battery' },

  // Settings (echoed back by device)
  102: { handler: 'setting' }, // fading time
  103: { handler: 'setting' }, // anti interference
  4: { handler: 'setting' }, // detection distance
  2: { handler: 'setting' }, // static detection sensitivity
  123: { handler: 'setting' }, // motion detection sensitivity
  108: { handler: 'setting' }, // LED indicator
  109: { handler: 'setting' }, // temperature unit
  105: { handler: 'setting' }, // temperature calibration
  104: { handler: 'setting' }, // humidity calibration
  107: { handler: 'setting' }, // illuminance interval
};

/**
 * Settings DPs for writing to device
 */
export const DP_WRITE = {
  FADING_TIME: 102,
  ANTI_INTERFERENCE: 103,
  DETECTION_DISTANCE: 4,
  STATIC_SENSITIVITY: 2,
  MOTION_SENSITIVITY: 123,
  INDICATOR: 108,
  TEMP_UNIT: 109,
  TEMP_CALIBRATION: 105,
  HUMIDITY_CALIBRATION: 104,
  ILLUMINANCE_INTERVAL: 107,
} as const;

/**
 * Default setting values
 */
export const DEFAULTS = {
  FADING_TIME_SECONDS: 30,
  ILLUMINANCE_INTERVAL_MINUTES: 1,
  DETECTION_DISTANCE_METERS: 5,
  SENSITIVITY: 5,
  CALIBRATION: 0,
  ANTI_INTERFERENCE: false,
  INDICATOR: true,
} as const;
