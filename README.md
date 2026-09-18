# Hobeian for Homey

Adds support for Hobeian Zigbee devices.

## Supported Devices

### ZG-303Z Soil Moisture Sensor

A battery-powered Zigbee soil moisture sensor with temperature and humidity sensing.

**Capabilities:**
- Soil Moisture (0-100%)
- Temperature (°C)
- Air Humidity (0-100%)
- Battery Level (%)
- Water Shortage Alarm

**Settings:**
- Temperature Calibration (-30 to +30)
- Humidity Calibration (-30 to +30)
- Soil Moisture Calibration (-30 to +30)
- Temperature/Humidity Sampling Interval (5-3600 seconds)
- Soil Moisture Sampling Interval (5-3600 seconds)
- Soil Dryness Threshold (0-100%)

**Technical Details:**
- Zigbee Manufacturer: HOBEIAN (Tuya OEM: _TZE200_wqashyqo)
- Zigbee Model: ZG-303Z (Tuya: TS0601)
- Power: 2x AAA batteries
- Protocol: Tuya Zigbee (Cluster 0xEF00)

### ZG-204ZX 24GHz Presence Sensor

A battery-powered Zigbee 24GHz mmWave presence sensor with illuminance, temperature and humidity sensing.

**Capabilities:**
- Presence (mmWave radar)
- Illuminance (lux)
- Temperature (°C)
- Humidity (0-100%)
- Battery Level (%)

**Settings:**
- Fading Time (0-28800 seconds)
- Illuminance Interval (1-720 minutes)
- Detection Distance (0-5 meters)
- Motion Detection Sensitivity (0-10)
- Static Detection Sensitivity (0-10)
- Anti-Interference
- LED Indicator
- Temperature Calibration (-2.0 to +2.0)
- Humidity Calibration (-30 to +30)

**Technical Details:**
- Zigbee Manufacturer: HOBEIAN (Tuya OEM: _TZE200_w0ap83qu)
- Zigbee Model: ZG-204ZX (Tuya: TS0601)
- Power: battery
- Protocol: Tuya Zigbee (Cluster 0xEF00)

## Installation

1. Install the app from the Homey App Store
2. Add device: Devices → + → Hobeian → select your device
3. Put the sensor in pairing mode (see the device's manual)
4. Follow the pairing instructions

## Changelog

### 1.0.0
- Initial release
- Added support for ZG-303Z Soil Moisture Sensor