'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampNumber,
  clampPercent,
  clampInt,
  rawTemperatureTimes10ToCelsius,
  rawDistanceTimes100ToMeters,
  toTuyaTemperatureCalibrationTenths,
  toTuyaHumidityCalibration,
  toTuyaFadingTimeSeconds,
  toTuyaIlluminanceIntervalMinutes,
  toTuyaDetectionDistanceCentimeters,
  toTuyaSensitivity,
} = require('../.homeybuild/lib/zg204zx');

test('clampNumber clamps to range', () => {
  assert.equal(clampNumber(5, 0, 10), 5);
  assert.equal(clampNumber(-1, 0, 10), 0);
  assert.equal(clampNumber(11, 0, 10), 10);
});

test('clampPercent clamps to 0..100', () => {
  assert.equal(clampPercent(-5), 0);
  assert.equal(clampPercent(50), 50);
  assert.equal(clampPercent(200), 100);
});

test('clampInt clamps and rounds', () => {
  assert.equal(clampInt(1.2, 0, 10), 1);
  assert.equal(clampInt(1.6, 0, 10), 2);
  assert.equal(clampInt(-5, 0, 10), 0);
  assert.equal(clampInt(50, 0, 10), 10);
});

test('rawTemperatureTimes10ToCelsius converts correctly (x10)', () => {
  assert.equal(rawTemperatureTimes10ToCelsius(234), 23.4);
});

test('rawDistanceTimes100ToMeters converts correctly (x100)', () => {
  assert.equal(rawDistanceTimes100ToMeters(350), 3.5);
});

test('toTuyaTemperatureCalibrationTenths maps °C to tenths with clamp', () => {
  assert.equal(toTuyaTemperatureCalibrationTenths(0), 0);
  assert.equal(toTuyaTemperatureCalibrationTenths(1.0), 10);
  assert.equal(toTuyaTemperatureCalibrationTenths(-0.5), -5);
  assert.equal(toTuyaTemperatureCalibrationTenths(99), 20);
  assert.equal(toTuyaTemperatureCalibrationTenths(-99), -20);
});

test('toTuyaHumidityCalibration clamps to -30..30', () => {
  assert.equal(toTuyaHumidityCalibration(0), 0);
  assert.equal(toTuyaHumidityCalibration(30), 30);
  assert.equal(toTuyaHumidityCalibration(-30), -30);
  assert.equal(toTuyaHumidityCalibration(999), 30);
  assert.equal(toTuyaHumidityCalibration(-999), -30);
});

test('toTuyaFadingTimeSeconds clamps to 0..28800', () => {
  assert.equal(toTuyaFadingTimeSeconds(0), 0);
  assert.equal(toTuyaFadingTimeSeconds(28800), 28800);
  assert.equal(toTuyaFadingTimeSeconds(-5), 0);
  assert.equal(toTuyaFadingTimeSeconds(999999), 28800);
});

test('toTuyaIlluminanceIntervalMinutes clamps to 1..720', () => {
  assert.equal(toTuyaIlluminanceIntervalMinutes(1), 1);
  assert.equal(toTuyaIlluminanceIntervalMinutes(720), 720);
  assert.equal(toTuyaIlluminanceIntervalMinutes(0), 1);
  assert.equal(toTuyaIlluminanceIntervalMinutes(9999), 720);
});

test('toTuyaDetectionDistanceCentimeters converts meters to clamped centimeters', () => {
  assert.equal(toTuyaDetectionDistanceCentimeters(0), 0);
  assert.equal(toTuyaDetectionDistanceCentimeters(3.5), 350);
  assert.equal(toTuyaDetectionDistanceCentimeters(5), 500);
  assert.equal(toTuyaDetectionDistanceCentimeters(-1), 0);
  assert.equal(toTuyaDetectionDistanceCentimeters(99), 500);
});

test('toTuyaSensitivity clamps to 0..10', () => {
  assert.equal(toTuyaSensitivity(0), 0);
  assert.equal(toTuyaSensitivity(10), 10);
  assert.equal(toTuyaSensitivity(-1), 0);
  assert.equal(toTuyaSensitivity(99), 10);
});
