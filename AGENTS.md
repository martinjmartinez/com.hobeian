# AGENTS.md - AI Agent Guide for com.hobeian

## Project Overview

- **Type**: Homey SDK 3 app for Zigbee devices
- **Language**: TypeScript (compiles to JavaScript)
- **Target**: Homey Pro (local platform only)
- **Current Devices**: ZG-303Z soil moisture sensor (Tuya OEM, manufacturer `_TZE200_wqashyqo`); ZG-204ZX 24GHz mmWave presence + T&H sensor (Tuya OEM, manufacturer `_TZE200_w0ap83qu`)

## Development Commands

```bash
npm run build          # Compile TypeScript
npm run test           # Build + run tests (node --test)
npm run lint           # ESLint
homey app run          # Deploy to Homey for testing
```

### Critical: Running the App

- `homey app run` requires network access - **cannot run in a sandbox**
- **Always kill previous `homey app run` before starting a new one** or you get:
  ```
  ✖ Error: EACCES: permission denied, rmdir '.homeybuild/node_modules'
  ```
- Kill with: `pkill -f "homey app run"` or Ctrl+C in the terminal

## Architecture

```
drivers/zg-303z/
├── device.ts          # Main device logic, lifecycle handlers
├── driver.ts          # Driver initialization
└── driver.compose.json # Device metadata, capabilities, settings

drivers/zg-204zx/
├── device.ts          # Main device logic, lifecycle handlers
├── driver.ts          # Driver initialization
└── driver.compose.json # Device metadata, capabilities, settings

lib/
├── TuyaCluster.ts     # Tuya cluster (0xEF00) implementation
├── tuyaFrame.ts       # Tuya protocol frame encoding/decoding
├── zg303z.ts          # ZG-303Z value conversions
├── zg303zDatapoints.ts # ZG-303Z DP handler/write tables
├── zg204zx.ts         # ZG-204ZX value conversions
└── zg204zxDatapoints.ts # ZG-204ZX DP handler/write tables

types/
├── homey-zigbeedriver.d.ts  # Type declarations for homey-zigbeedriver
└── zigbee-clusters.d.ts     # Type declarations for zigbee-clusters
```

### Dependencies

- `homey-zigbeedriver` - Homey's Zigbee device base class
- `zigbee-clusters` - ZCL cluster definitions and communication

## Critical Patterns and Gotchas

### zigbee-clusters Library

1. **Commands become methods**: Commands defined in `static get COMMANDS()` are automatically exposed as methods on the cluster instance:
   ```typescript
   // In COMMANDS: { datapoint: { id: 0x00, args: {...} } }
   // Use as: this.datapoint({ ...args })
   // NOT: this.writeCommand('datapoint', args)  // WRONG - doesn't exist
   ```

2. **Attribute validation**: `readAttributes()` validates attribute names against known attributes and **silently discards unknown ones** - the request is never sent.

3. **Bypass validation with sendFrame()**: For manufacturer-specific attributes (like Tuya's 0xFFFE), use low-level `sendFrame()`:
   ```typescript
   await cluster.sendFrame({
     frameControl: [],  // [] for global commands, ['clusterSpecific'] for cluster commands
     cmdId: 0x00,       // 0x00 = Read Attributes
     data: payload,     // Raw ZCL payload
   });
   ```

### Sleepy (Battery-Powered) Devices

Battery-powered Zigbee devices sleep 99% of the time to conserve power. They cannot receive commands while sleeping.

1. **Detect sleepy devices**:
   ```typescript
   private isDeviceSleepy(): boolean {
     return this.node?.receiveWhenIdle === false;
   }
   ```

2. **Never send commands in `onNodeInit` to sleepy devices** - they're asleep. Queue actions instead:
   ```typescript
   if (isSleepy) {
     this.pendingSettingsApply = true;  // Apply when device wakes
   } else {
     await this.applyDeviceSettings();  // Apply immediately
   }
   ```

3. **Handle device wake-up** by overriding `onEndDeviceAnnounce()`:
   ```typescript
   async onEndDeviceAnnounce(): Promise<void> {
     // Device just woke up - now we can communicate
     if (this.pendingSettingsApply) {
       await this.applyDeviceSettings();
       this.pendingSettingsApply = false;
     }
   }
   ```

4. **Detect first pairing vs app restart**:
   ```typescript
   const isFirstInit = typeof this.isFirstInit === 'function' ? this.isFirstInit() : false;
   ```
   Only send configuration commands (like magic packet) on first init.

### Wake Handler Best Practices

- Use centralized `onDeviceAwake()` pattern called from multiple detection points
- Implement 5-second debounce to prevent duplicate wake processing
- **NEVER call sendDataQuery() in wake handlers** - causes infinite loops (device reports on its own)
- Only push settings when user actually changed them via `pendingSettingsApply` flag
- Tuya: only send magic packet on first init (`isFirstInit()`), not app restarts

### Tuya Protocol

Tuya devices use a proprietary protocol on cluster 0xEF00 (61184).

1. **Magic Packet**: Read attribute 0xFFFE on Basic cluster to wake Tuya devices and start their reporting cycle. Only needed during first pairing.

2. **dataQuery Command (0x03)**: Requests device to report all its current datapoint values:
   ```typescript
   await this.tuyaCluster.sendFrame({
     frameControl: ['clusterSpecific', 'disableDefaultResponse'],
     cmdId: 0x03,
     data: Buffer.alloc(0),
   });
   ```

3. **Datapoint Encoding**: Numeric values use big-endian encoding:
   ```typescript
   const data = Buffer.alloc(4);
   data.writeInt32BE(value, 0);
   ```

4. **Tuya Datapoint Types**:
   - `0x00` RAW
   - `0x01` BOOL (1 byte)
   - `0x02` VALUE (4 bytes, signed int32 BE)
   - `0x03` STRING
   - `0x04` ENUM (1 byte)
   - `0x05` BITMAP

## Testing

- **Unit tests**: `tests/*.test.js` - Run with `npm test`
- **Integration testing**: Deploy with `homey app run` and observe logs
- Logs appear in the terminal with format: `[ManagerDrivers] [Driver:zg-303z] [Device:uuid] message`

## Common Errors and Solutions

| Error | Cause | Fix |
|-------|-------|-----|
| `EACCES: permission denied, rmdir .homeybuild/node_modules` | Previous `homey app run` still running | Kill previous process with `pkill -f "homey app run"` |
| `TypeError: X is not a function` on cluster | Using wrong method name | Commands from `COMMANDS` become methods; use `this.commandName()` directly |
| `X is not a valid attribute` | zigbee-clusters validation rejecting unknown attribute | Use `sendFrame()` for manufacturer-specific attributes |
| Device not responding / timeout | Battery device is sleeping | Queue commands for `onEndDeviceAnnounce()`, don't send in `onNodeInit` |
| `sendFrame is not a function` | Missing type declaration | Add `sendFrame` to `types/zigbee-clusters.d.ts` Cluster class |

## Reference: ZG-303Z Datapoints

| DP | Name | Type | Description |
|----|------|------|-------------|
| 1 | Water Warning | BOOL | 0=OK, 1=Alarm |
| 101 | Temperature | VALUE | Raw / 10 = °C |
| 102 | Soil Calibration | VALUE | -30 to +30 |
| 104 | Temp Calibration | VALUE | -20 to +20 (tenths of °C) |
| 105 | Humidity Calibration | VALUE | -30 to +30 |
| 106 | Temp Unit | ENUM | 0=Celsius, 1=Fahrenheit |
| 107 | Soil Moisture | VALUE | 0-100% |
| 108 | Battery | VALUE | 0-100% |
| 109 | Air Humidity | VALUE | 0-100% |
| 110 | Soil Warning Threshold | VALUE | 0-100% |
| 111 | Temp Sampling Interval | VALUE | 5-3600 seconds |
| 112 | Soil Sampling Interval | VALUE | 5-3600 seconds |

## Reference: ZG-204ZX Datapoints

Source: HOBEIAN ZG-204ZX definition in [zigbee-herdsman-converters](https://github.com/Koenkk/zigbee-herdsman-converters/blob/master/src/devices/tuya.ts) (fingerprint `TS0601` / `_TZE200_w0ap83qu`).

| DP | Name | Type | Description |
|----|------|------|-------------|
| 1 | Presence | BOOL | 0=inactive, 1=active |
| 2 | Static Detection Sensitivity | VALUE | 0-10 |
| 4 | Detection Distance | VALUE | Raw / 100 = meters (0-5.00m) |
| 101 | Humidity | VALUE | 0-100% |
| 102 | Fading Time | VALUE | 0-28800 seconds |
| 103 | Anti Interference | BOOL | 0=off, 1=on |
| 104 | Humidity Calibration | VALUE | -30 to +30 |
| 105 | Temp Calibration | VALUE | -20 to +20 (tenths of °C) |
| 106 | Illuminance | VALUE | lux |
| 107 | Illuminance Interval | VALUE | 1-720 minutes |
| 108 | LED Indicator | BOOL | 0=off, 1=on |
| 109 | Temp Unit | ENUM | 0=Celsius, 1=Fahrenheit |
| 110 | Battery | VALUE | 0-100% |
| 111 | Temperature | VALUE | Raw / 10 = °C |
| 123 | Motion Detection Sensitivity | VALUE | 0-10 |

## Code Quality & Style

- Use named constants for all datapoint IDs and protocol values (no magic numbers)
- TypeScript: extract const arrays to explicitly typed `number[]` before using `.includes()`
- Research library source code (node_modules, GitHub) before implementing workarounds

## External References

- [Zigbee2MQTT Tuya implementation](https://github.com/Koenkk/zigbee-herdsman-converters/blob/master/src/lib/tuya.ts) - Reference for Tuya protocol handling
- [Homey Zigbee Driver docs](https://apps-sdk-v3.developer.homey.app/tutorial-Zigbee.html)
- [zigbee-clusters source](https://github.com/athombv/node-zigbee-clusters)

## Cursor Cloud specific instructions

- **Docker is installed** and configured (fuse-overlayfs storage driver, iptables-legacy). Start the daemon with `sudo dockerd &>/tmp/dockerd.log &` before using Docker-dependent commands.
- **Homey CLI** (`homey` v4.x) is installed globally. It authenticates automatically via the `HOMEY_PAT` environment variable (no interactive login needed).
- **`HOMEY_PAT` is an Apps Store PAT** (`pat-apps-*`). It authenticates `homey whoami` but is scoped to app publishing only — `homey list` returns 0 devices. `homey app run` requires a general-purpose PAT or interactive OAuth login with device-level access.
- **`homey app run` cannot work in this environment** — it requires both LAN access to a physical Homey Pro and a device-scoped token. It runs the app in a Docker container locally and bridges to the Homey via Socket.IO.
- **`homey app validate -l verified`** and **`homey app build`** work without a Homey device and are the primary offline verification steps. These plus `npm run build`, `npm run lint`, and `npm run test` constitute the full CI-viable dev loop.
- **Tests require build first.** `npm run test` already chains `npm run build`, so running `npm test` alone is sufficient.
- **Pre-existing lint errors.** The repo has ~22 pre-existing ESLint style errors (trailing spaces, key-spacing) in `device.ts` and `zg303zDatapoints.ts`. `npm run lint` exits non-zero; this is expected.
- Dev commands are documented in the "Development Commands" section above.
