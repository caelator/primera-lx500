# primera-lx500

> **A complete, open-source Node.js SDK for the Primera LX500 / ColorLabel 500 label printer.**

Bypass proprietary drivers. Print directly over USB with full programmatic control — ink levels, sensor modes, label printing, and more.

Built from scratch via binary reverse-engineering of Primera's macOS frameworks. Every ESC command byte verified against live hardware (40/40 protocol checks passed).

## Quick Start

```bash
npm install primera-lx500
```

```typescript
import { PrimeraLX500 } from 'primera-lx500';

const printer = await PrimeraLX500.connect();
await printer.print("label.png");          // One line to print
await printer.disconnect();
```

**Requires `sudo` on macOS** for USB access (IOKit permissions).

## CLI

```bash
sudo npx ts-node src/cli.ts status
# 🖨️  Primera LX500 — FW 1.69 06/19/2019
#    Status:      Idle
#    Sensor:      continuous
#    Cartridge:   0x54 (Tri-color CMY)
#    Total Prints: 652
#    Ink:         C=99% M=99% Y=99%

sudo npx ts-node src/cli.ts ink
# 💧 Cyan:    ████████████████████ 99%
# 💧 Magenta: ████████████████████ 99%
# 💧 Yellow:  ████████████████████ 99%

sudo npx ts-node src/cli.ts print label.png --label 4x3 --quality best --copies 5
```

### All Commands

| Command | Description |
|---------|-------------|
| `status` | Full printer status, firmware, ink, errors |
| `ink` | Visual ink level bars |
| `set-mode <reflective\|die-cut\|continuous>` | Set paper sensor mode |
| `feed` | Advance one label |
| `eject` | Eject current label |
| `print <file> [opts]` | Print an image to label |

### Print Options

| Flag | Default | Description |
|------|---------|-------------|
| `--label <size>` | `4x3` | Label preset (see supported sizes below) |
| `--quality <mode>` | `standard` | `draft`, `standard`, or `best` |
| `--copies <n>` | `1` | Number of copies |
| `--density <0-1>` | `1.0` | Ink density multiplier |

## API

### Connect & Discover

```typescript
import { PrimeraLX500 } from 'primera-lx500';

// Auto-discover and connect
const printer = new PrimeraLX500();
await printer.connect();

// Or connect to a specific device
const devices = PrimeraLX500.discover();
await printer.connect(devices[0]);
```

### Print

```typescript
// Simple — default 4×3" label
await printer.print("label.png");

// With options
await printer.print("label.png", {
  label: '4x3',           // Label preset
  quality: 'best',        // draft | standard | best
  copies: 5,              // Print multiple
  density: 0.85,          // Reduce ink for glossy media
  inkLimit: 240,           // Max ink % per pixel (prevents bleed)
  bidi: true,             // Bidirectional printing
  fit: 'fill',            // contain | cover | fill
});

// From buffer
const imageBuffer = fs.readFileSync("label.png");
await printer.print(imageBuffer, { label: '2x2' });
```

### Configuration

```typescript
// Ink levels
console.log(printer.status?.inkLevels);
// { c: 99, m: 99, y: 99 }

// Sensor mode
await printer.setSensorMode('die-cut');
await printer.setSensorMode('continuous');
await printer.setSensorMode('reflective');

// Paper control
await printer.feedLabel();
await printer.ejectLabel();
```

### Events

```typescript
printer.on('telemetry', (status) => console.log(status));
printer.on('progress', ({ percent, swath, totalSwaths }) => {
  console.log(`${percent}% — swath ${swath}/${totalSwaths}`);
});
printer.on('ink-low', (channel, pct) => console.warn(`${channel} ink low: ${pct}%`));
printer.on('retry', ({ attempt }) => console.warn(`USB retry ${attempt}/3`));
```

### Resource Safety

```typescript
// Automatic cleanup with Symbol.asyncDispose
{
  await using printer = await PrimeraLX500.connect();
  await printer.print("label.png");
} // disconnect() called automatically

// Or explicit try-finally
const printer = new PrimeraLX500();
try {
  await printer.connect();
  await printer.print("label.png");
} finally {
  await printer.disconnect();
}
```

### Dry Run (No Hardware)

```typescript
const printer = new PrimeraLX500({ dryRun: true });
await printer.connect();  // No USB — simulated
await printer.print("label.png"); // Pipeline runs, no USB writes
```

## Supported Label Sizes

All sizes from the official Primera PPD, at 600 DPI:

| Preset | Inches | Pixels |
|--------|--------|--------|
| `0.75x0.25` | 0.75" × 0.25" | 450 × 150 |
| `1x0.5` | 1" × 0.5" | 600 × 300 |
| `2x1` | 2" × 1" | 1200 × 600 |
| `2x2` | 2" × 2" | 1200 × 1200 |
| `3x2` | 3" × 2" | 1800 × 1200 |
| **`4x3`** | **4" × 3"** (default) | **2400 × 1800** |
| `4x6` | 4" × 6" | 2400 × 3600 |

## Print Quality Modes

| Mode | Algorithm | Speed | Use Case |
|------|-----------|-------|----------|
| `draft` | Ordered Bayer dither | ⚡ Fast | Proofs, test labels |
| `standard` | Floyd-Steinberg serpentine | ⚖️ Balanced | General labels |
| `best` | Floyd-Steinberg + ink limiting | 🎨 Highest | Photo labels, final production |

## Architecture

```
Image Input (PNG/JPG/Buffer)
    ↓
sharp (decode + scale to 600dpi)
    ↓
ColorConverter (RGB → CMY + density)
    ↓
HalftoneEngine (contone → binary + ink limiting)
    ↓
SwathAssembler (40-row nozzle-packed columns)
    ↓
CommandBuilder (ESC * byte serialization)
    ↓
USB Bulk OUT → Primera LX500
```

## Hardware Specs

| Parameter | Value |
|-----------|-------|
| USB Vendor ID | `0x0F25` |
| USB Product ID | `0x0032` |
| Resolution | 600 × 600 DPI |
| Ink Channels | CMY (no Black) |
| Nozzles/Color | 84 |
| Active Swath | 40 rows |
| Max Print Width | 4" (2400px) |
| Max Print Length | 8" (4800px) |

## How It Was Built

This SDK was created entirely through binary reverse-engineering:

1. **2,298 symbols** extracted from Primera's macOS frameworks using `nm` and `otool`
2. **Every ESC command** decoded from `SnakePrinterCommand` disassembly
3. **128-byte telemetry struct** fully mapped (firmware version, ink levels, sensor mode, calibration data)
4. **Nozzle geometry** extracted from `LotusColorPrinthead` constructor
5. **40/40 hardware verification checks** passed against live printer

No proprietary code was used. All protocol knowledge was obtained through clean-room reverse engineering for interoperability, which is legally protected under [DMCA § 1201(f)](https://www.law.cornell.edu/uscode/text/17/1201).

## Requirements

- **Node.js** 18+
- **macOS** (tested on Apple Silicon)
- **sudo** for USB access
- Primera LX500 / ColorLabel 500 connected via USB

## Development

```bash
git clone https://github.com/clawbotai/primera-lx500.git
cd primera-lx500
npm install
npx tsc --noEmit  # Type-check
sudo npx ts-node src/cli.ts status  # Test against hardware
```

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This is an independent, community-developed SDK. It is not affiliated with, endorsed by, or supported by Primera Technology, Inc. "Primera" and "LX500" are trademarks of Primera Technology, Inc.
