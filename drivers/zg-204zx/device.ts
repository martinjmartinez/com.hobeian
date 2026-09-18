'use strict';

import { ZigBeeDevice } from 'homey-zigbeedriver';
import { CLUSTER } from 'zigbee-clusters';

// Import and register Tuya cluster
import { TuyaDataTypes, TUYA_CLUSTER_ID } from '../../lib/TuyaCluster';
import { decodeTuyaDpValuesFromZclFrame } from '../../lib/tuyaFrame';
import {
  clampPercent,
  rawTemperatureTimes10ToCelsius,
  rawDistanceTimes100ToMeters,
  toTuyaDetectionDistanceCentimeters,
  toTuyaFadingTimeSeconds,
  toTuyaHumidityCalibration,
  toTuyaIlluminanceIntervalMinutes,
  toTuyaSensitivity,
  toTuyaTemperatureCalibrationTenths,
} from '../../lib/zg204zx';
import { DP_HANDLERS, DP_WRITE, DEFAULTS } from '../../lib/zg204zxDatapoints';

module.exports = class ZG204ZXDevice extends ZigBeeDevice {

  private tuyaCluster: any = null;
  private pendingSettingsApply = false;
  private endpoint1: any = null;
  private lastWakeHandledAt = 0;

  async onNodeInit({ zclNode }: { zclNode: any }) {
    this.log('ZG-204ZX device initialized');

    // This Tuya device reports presence, illuminance, temperature and humidity via
    // datapoints on 0xEF00, and exposes its configuration the same way.

    this.log('Available endpoints:', Object.keys(zclNode.endpoints));

    for (const [endpointId, endpoint] of Object.entries(zclNode.endpoints)) {
      this.log(`Endpoint ${endpointId} clusters:`, Object.keys((endpoint as any).clusters));
    }

    const endpoint = zclNode.endpoints[1];
    if (!endpoint) {
      this.error('Endpoint 1 not found');
      return;
    }
    this.endpoint1 = endpoint;

    const isSleepy = this.isDeviceSleepy();
    this.log(`Device is ${isSleepy ? 'sleepy (battery-powered)' : 'always-on'}`);

    // Only send magic packet on first init (pairing), not on app restarts
    const isFirstInit = typeof (this as any).isFirstInit === 'function' ? (this as any).isFirstInit() : false;
    if (isFirstInit) {
      this.log('First init - sending Tuya magic packet');
      await this.configureMagicPacket(zclNode).catch(this.error);
    }

    this.tuyaCluster = endpoint.clusters['tuya'] || endpoint.clusters[TUYA_CLUSTER_ID];

    if (this.tuyaCluster) {
      this.log('Tuya cluster found!');
      this.setupTuyaListeners();
    } else {
      this.log('Tuya cluster not found in named clusters, trying to bind...');

      try {
        await endpoint.bind('tuya');
        this.tuyaCluster = endpoint.clusters['tuya'];
        if (this.tuyaCluster) {
          this.log('Tuya cluster bound successfully');
          this.setupTuyaListeners();
        }
      } catch (err) {
        this.log('Could not bind Tuya cluster:', err);
      }
    }

    this.registerRawReportHandler(zclNode);

    // For sleepy devices, defer commands until device wakes up
    // For always-on devices, apply settings immediately
    if (isSleepy) {
      this.log('Device is sleepy - will apply settings and read battery when device wakes up');
      // Do NOT set pendingSettingsApply = true here - no user changes pending yet
    } else {
      if (this.tuyaCluster) {
        await this.applyDeviceSettings().catch(this.error);
      }
      await this.readBattery(endpoint).catch(this.error);
    }
  }

  private async applyDeviceSettings(): Promise<void> {
    if (!this.tuyaCluster) return;

    const fadingTime = toTuyaFadingTimeSeconds(this.getSetting('fading_time') ?? DEFAULTS.FADING_TIME_SECONDS);
    const illuminanceInterval = toTuyaIlluminanceIntervalMinutes(this.getSetting('illuminance_interval') ?? DEFAULTS.ILLUMINANCE_INTERVAL_MINUTES);
    const detectionDistance = toTuyaDetectionDistanceCentimeters(this.getSetting('detection_distance') ?? DEFAULTS.DETECTION_DISTANCE_METERS);
    const motionSensitivity = toTuyaSensitivity(this.getSetting('motion_detection_sensitivity') ?? DEFAULTS.SENSITIVITY);
    const staticSensitivity = toTuyaSensitivity(this.getSetting('static_detection_sensitivity') ?? DEFAULTS.SENSITIVITY);
    const antiInterference = this.getSetting('anti_interference') ?? DEFAULTS.ANTI_INTERFERENCE;
    const indicator = this.getSetting('indicator') ?? DEFAULTS.INDICATOR;
    const temperatureCalibrationTenths = toTuyaTemperatureCalibrationTenths(this.getSetting('temperature_calibration') ?? DEFAULTS.CALIBRATION);
    const humidityCalibration = toTuyaHumidityCalibration(this.getSetting('humidity_calibration') ?? DEFAULTS.CALIBRATION);

    // Best-effort: device may be sleeping; will apply on next awake/report window.
    await this.tuyaCluster.setDatapointEnum?.(DP_WRITE.TEMP_UNIT, 0); // enforce Celsius
    await this.tuyaCluster.setDatapointValue(DP_WRITE.FADING_TIME, fadingTime);
    await this.tuyaCluster.setDatapointValue(DP_WRITE.ILLUMINANCE_INTERVAL, illuminanceInterval);
    await this.tuyaCluster.setDatapointValue(DP_WRITE.DETECTION_DISTANCE, detectionDistance);
    await this.tuyaCluster.setDatapointValue(DP_WRITE.MOTION_SENSITIVITY, motionSensitivity);
    await this.tuyaCluster.setDatapointValue(DP_WRITE.STATIC_SENSITIVITY, staticSensitivity);
    await this.tuyaCluster.setDatapointBool(DP_WRITE.ANTI_INTERFERENCE, antiInterference);
    await this.tuyaCluster.setDatapointBool(DP_WRITE.INDICATOR, indicator);
    await this.tuyaCluster.setDatapointValue(DP_WRITE.TEMP_CALIBRATION, temperatureCalibrationTenths);
    await this.tuyaCluster.setDatapointValue(DP_WRITE.HUMIDITY_CALIBRATION, humidityCalibration);

    this.log('Applied device settings via Tuya DPs', {
      fadingTime,
      illuminanceInterval,
      detectionDistance,
      motionSensitivity,
      staticSensitivity,
      antiInterference,
      indicator,
      temperatureCalibrationTenths,
      humidityCalibration,
    });
  }

  /**
   * Set up listeners for Tuya cluster events
   */
  private setupTuyaListeners() {
    if (!this.tuyaCluster) return;

    this.tuyaCluster.on('reporting', (args: any) => {
      this.log('Tuya reporting event:', args);
      this.processTuyaReport(args);
    });

    this.tuyaCluster.on('response', (args: any) => {
      this.log('Tuya response event:', args);
      this.processTuyaReport(args);
    });

    this.tuyaCluster.on('datapoint', (args: any) => {
      this.log('Tuya datapoint event:', args);
      this.processTuyaReport(args);
    });
  }

  /**
   * Register handler for raw Zigbee frames
   */
  private registerRawReportHandler(zclNode: any) {
    const endpoint = zclNode.endpoints[1];
    if (!endpoint) return;

    const originalHandleFrame = endpoint.handleFrame?.bind(endpoint);
    if (originalHandleFrame) {
      endpoint.handleFrame = (clusterId: number, frame: Buffer, meta: any) => {
        if (clusterId === TUYA_CLUSTER_ID) {
          this.log('Raw Tuya frame received, cluster:', clusterId);
          this.log('Frame data:', frame.toString('hex'));
          this.parseRawTuyaFrame(frame);

          // Device is awake since we received data - trigger wake handler
          this.onDeviceAwake().catch(this.error);
        }
        return originalHandleFrame(clusterId, frame, meta);
      };
      this.log('Registered raw frame handler for Tuya cluster');
    }

    if (endpoint.clusters) {
      for (const [name, cluster] of Object.entries(endpoint.clusters)) {
        const cl = cluster as any;
        if (typeof cl.onReport === 'function') {
          const originalOnReport = cl.onReport.bind(cl);
          cl.onReport = (args: any) => {
            this.log(`Cluster ${name} report:`, args);
            return originalOnReport(args);
          };
        }
      }
    }
  }

  /**
   * Parse a raw Tuya frame
   */
  private parseRawTuyaFrame(frame: Buffer) {
    try {
      const decoded = decodeTuyaDpValuesFromZclFrame(frame);
      if (decoded.dpValues.length === 0) return;

      this.log(
        `Decoded Tuya frame: cmd=${decoded.commandId} status=${decoded.status} transid=${decoded.transid} dpCount=${decoded.dpValues.length}`,
      );

      for (const dpValue of decoded.dpValues) {
        this.processDataPoint(dpValue.dp, dpValue.datatype, dpValue.data);
      }
    } catch (error) {
      this.error('Error parsing raw Tuya frame:', error);
    }
  }

  /**
   * Process a Tuya report
   */
  private processTuyaReport(args: any) {
    if (!args) return;

    this.log('Processing Tuya report:', JSON.stringify(args));

    const { dp, datatype, data } = args;

    if (typeof dp === 'number' && data) {
      this.processDataPoint(dp, datatype || 0, Buffer.isBuffer(data) ? data : Buffer.from([data]));
    }
  }

  /**
   * Parse a raw value from Tuya datapoint data based on datatype
   */
  private parseDpValue(datatype: number, data: Buffer): number | boolean {
    switch (datatype) {
      case TuyaDataTypes.BOOL:
        return data.readUInt8(0) !== 0;
      case TuyaDataTypes.VALUE:
        if (data.length >= 4) return data.readInt32BE(0);
        if (data.length >= 2) return data.readInt16BE(0);
        return data.readUInt8(0);
      case TuyaDataTypes.ENUM:
        return data.readUInt8(0);
      default:
        if (data.length >= 4) return data.readInt32BE(0);
        if (data.length >= 2) return data.readUInt16BE(0);
        if (data.length >= 1) return data.readUInt8(0);
        throw new Error(`Unknown datatype ${datatype} or empty data`);
    }
  }

  /**
   * Process a Tuya datapoint value using the DP_HANDLERS mapping table
   */
  private processDataPoint(dp: number, datatype: number, data: Buffer) {
    const mapping = DP_HANDLERS[dp];

    if (!mapping) {
      this.log(`Unknown DP ${dp} (type: ${datatype})`);
      return;
    }

    const rawValue = this.parseDpValue(datatype, data);

    const value = mapping.divideBy && typeof rawValue === 'number'
      ? rawValue / mapping.divideBy
      : rawValue;

    this.log(`Processing DP ${dp} = ${value} (handler: ${mapping.handler})`);

    switch (mapping.handler) {
      case 'presence':
        if (typeof rawValue === 'boolean') {
          this.log(`Setting presence to ${rawValue}`);
          if (this.hasCapability('alarm_motion')) {
            this.setCapabilityValue('alarm_motion', rawValue).catch(this.error);
          }
        }
        break;

      case 'illuminance':
        if (typeof rawValue === 'number') {
          this.log(`Setting illuminance to ${rawValue} lx`);
          if (this.hasCapability('measure_luminance')) {
            this.setCapabilityValue('measure_luminance', rawValue).catch(this.error);
          }
        }
        break;

      case 'temperature':
        if (typeof rawValue === 'number') {
          const tempC = rawTemperatureTimes10ToCelsius(rawValue);
          this.log(`Setting temperature to ${tempC}°C`);
          if (this.hasCapability('measure_temperature')) {
            this.setCapabilityValue('measure_temperature', tempC).catch(this.error);
          }
        }
        break;

      case 'humidity':
        if (typeof value === 'number') {
          const humidity = clampPercent(value);
          this.log(`Setting humidity to ${humidity}%`);
          if (this.hasCapability('measure_humidity')) {
            this.setCapabilityValue('measure_humidity', humidity).catch(this.error);
          }
        }
        break;

      case 'battery':
        if (typeof value === 'number') {
          const battery = clampPercent(value);
          this.log(`Setting battery to ${battery}%`);
          if (this.hasCapability('measure_battery')) {
            this.setCapabilityValue('measure_battery', battery).catch(this.error);
          }
        }
        break;

      case 'setting':
        if (dp === DP_WRITE.DETECTION_DISTANCE && typeof rawValue === 'number') {
          this.log(`Setting DP ${dp} confirmed: ${rawDistanceTimes100ToMeters(rawValue)}m`);
        } else {
          this.log(`Setting DP ${dp} confirmed: ${value}`);
        }
        break;

      default:
        break;
    }
  }

  /**
   * Read battery status
   */
  private async readBattery(endpoint: any) {
    if (!endpoint.clusters[CLUSTER.POWER_CONFIGURATION.NAME]) {
      this.log('PowerConfiguration cluster not available');
      return;
    }

    try {
      const batteryStatus = await endpoint.clusters[CLUSTER.POWER_CONFIGURATION.NAME].readAttributes(['batteryPercentageRemaining']);
      if (batteryStatus.batteryPercentageRemaining !== undefined) {
        const battery = Math.round(batteryStatus.batteryPercentageRemaining / 2);
        this.log('Battery level:', battery, '%');
        await this.setCapabilityValue('measure_battery', battery);
      }
    } catch (err) {
      this.log('Could not read battery (device may be sleeping):', err);
    }
  }

  /**
   * Handle setting changes
   */
  async onSettings({ oldSettings, newSettings, changedKeys }: {
    oldSettings: Record<string, any>;
    newSettings: Record<string, any>;
    changedKeys: string[];
  }): Promise<void> {
    this.log('Settings changed:', changedKeys);

    const isSleepy = this.isDeviceSleepy();

    if (isSleepy) {
      this.log('Device is sleepy - queueing settings for next wake-up');
      this.pendingSettingsApply = true;
      return;
    }

    if (!this.tuyaCluster) return;

    for (const key of changedKeys) {
      const value = newSettings[key];
      try {
        if (key === 'fading_time') {
          await this.tuyaCluster.setDatapointValue(DP_WRITE.FADING_TIME, toTuyaFadingTimeSeconds(value ?? DEFAULTS.FADING_TIME_SECONDS));
        }
        if (key === 'illuminance_interval') {
          await this.tuyaCluster.setDatapointValue(DP_WRITE.ILLUMINANCE_INTERVAL, toTuyaIlluminanceIntervalMinutes(value ?? DEFAULTS.ILLUMINANCE_INTERVAL_MINUTES));
        }
        if (key === 'detection_distance') {
          await this.tuyaCluster.setDatapointValue(DP_WRITE.DETECTION_DISTANCE, toTuyaDetectionDistanceCentimeters(value ?? DEFAULTS.DETECTION_DISTANCE_METERS));
        }
        if (key === 'motion_detection_sensitivity') {
          await this.tuyaCluster.setDatapointValue(DP_WRITE.MOTION_SENSITIVITY, toTuyaSensitivity(value ?? DEFAULTS.SENSITIVITY));
        }
        if (key === 'static_detection_sensitivity') {
          await this.tuyaCluster.setDatapointValue(DP_WRITE.STATIC_SENSITIVITY, toTuyaSensitivity(value ?? DEFAULTS.SENSITIVITY));
        }
        if (key === 'anti_interference') {
          await this.tuyaCluster.setDatapointBool(DP_WRITE.ANTI_INTERFERENCE, value ?? DEFAULTS.ANTI_INTERFERENCE);
        }
        if (key === 'indicator') {
          await this.tuyaCluster.setDatapointBool(DP_WRITE.INDICATOR, value ?? DEFAULTS.INDICATOR);
        }
        if (key === 'temperature_calibration') {
          await this.tuyaCluster.setDatapointValue(DP_WRITE.TEMP_CALIBRATION, toTuyaTemperatureCalibrationTenths(value ?? DEFAULTS.CALIBRATION));
        }
        if (key === 'humidity_calibration') {
          await this.tuyaCluster.setDatapointValue(DP_WRITE.HUMIDITY_CALIBRATION, toTuyaHumidityCalibration(value ?? DEFAULTS.CALIBRATION));
        }
      } catch (err) {
        this.error('Failed to apply setting to device:', err);
      }
    }
  }

  /**
   * Clean up on device removal
   */
  async onDeleted() {
    this.log('ZG-204ZX device deleted');
  }

  /**
   * Called when a sleepy device announces itself (wakes up and rejoins network)
   */
  async onEndDeviceAnnounce(): Promise<void> {
    this.log('Device announced (woke up from sleep)');
    await this.onDeviceAwake();
  }

  private async configureMagicPacket(zclNode: any): Promise<void> {
    const endpoints = Object.values(zclNode.endpoints || {}) as any[];
    const candidates = endpoints.filter((e) => e?.clusters?.[CLUSTER.BASIC.NAME]);
    for (const endpoint of candidates) {
      try {
        await endpoint.clusters[CLUSTER.BASIC.NAME].readAttributes([
          'manufacturerName',
          'zclVersion',
          'appVersion',
          'modelId',
          'powerSource',
          0xfffe,
        ]);
        this.log('Sent Tuya configureMagicPacket readAttributes');
        return;
      } catch (err) {
        this.log('Tuya configureMagicPacket readAttributes failed on endpoint, trying next:', err);
      }
    }
  }

  /**
   * Check if device is sleepy (battery-powered, not always listening)
   */
  private isDeviceSleepy(): boolean {
    return (this as any).node?.receiveWhenIdle === false;
  }

  /**
   * Centralized handler for device wake-up events.
   * Called from onEndDeviceAnnounce and handleFrame when data is received.
   * Debounced to avoid duplicate processing within a short window.
   */
  private async onDeviceAwake(): Promise<void> {
    const now = Date.now();
    const DEBOUNCE_MS = 5000;

    if (now - this.lastWakeHandledAt < DEBOUNCE_MS) {
      this.log('Skipping duplicate wake handling (debounce)');
      return;
    }
    this.lastWakeHandledAt = now;

    this.log('Handling device wake-up');

    await this.setAvailable().catch(this.error);

    if (this.pendingSettingsApply) {
      this.log('Applying pending user settings...');
      await this.applyDeviceSettings().catch(this.error);
      this.pendingSettingsApply = false;
    }

    if (this.endpoint1) {
      await this.readBattery(this.endpoint1).catch(this.error);
    }
  }

};
