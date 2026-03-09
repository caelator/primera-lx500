#!/usr/bin/env node
/**
 * Primera LX500 CLI
 * Commands: status, ink, feed, eject, set-mode, print
 */

import { PrimeraLX500 } from './Primera';
import { LABEL_PRESETS } from './constants';
import type { PrintProgress } from './types';

const VALID_MODES = ['reflective', 'die-cut', 'continuous'] as const;

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === 'help' || command === '--help') {
        printUsage();
        return;
    }

    const printer = new PrimeraLX500();

    try {
        await printer.connect();

        switch (command) {
            case 'status': {
                const s = printer.status!;
                console.log(`🖨️  Primera LX500 — FW ${s.fwVersion}`);
                console.log(`   Status:      ${s.systemStatusText}`);
                console.log(`   Sensor:      ${s.sensorMode}`);
                console.log(`   Cartridge:   0x${s.cartridgeType.toString(16)} (${s.cartridgeType === 0x54 ? 'Tri-color CMY' : 'Unknown'})`);
                console.log(`   Total Prints: ${s.totalPrints.toLocaleString()}`);
                console.log(`   Ink:         C=${s.inkLevels.c}% M=${s.inkLevels.m}% Y=${s.inkLevels.y}%`);
                console.log(`   Errors:      ${s.errorFlags.every(f => f === 0) ? 'None' : s.errorFlags.map(f => '0x' + f.toString(16)).join(', ')}`);
                break;
            }

            case 'ink': {
                const ink = printer.status!.inkLevels;
                const bar = (pct: number) => {
                    const filled = Math.round(pct / 5);
                    return '█'.repeat(filled) + '░'.repeat(20 - filled);
                };
                console.log(`💧 Cyan:    ${bar(ink.c)} ${ink.c}%`);
                console.log(`💧 Magenta: ${bar(ink.m)} ${ink.m}%`);
                console.log(`💧 Yellow:  ${bar(ink.y)} ${ink.y}%`);
                break;
            }

            case 'set-mode': {
                const mode = args[1];
                if (!mode || !VALID_MODES.includes(mode as any)) {
                    console.error(`❌ Invalid mode. Use: ${VALID_MODES.join(', ')}`);
                    process.exit(1);
                }
                await printer.setSensorMode(mode as any);
                console.log(`⚙️  Sensor mode set to: ${mode}`);
                break;
            }

            case 'feed':
                await printer.feedLabel();
                console.log('📄 Label fed.');
                break;

            case 'eject':
                await printer.ejectLabel();
                console.log('📤 Label ejected.');
                break;

            case 'print': {
                const file = args[1];
                if (!file) {
                    console.error('❌ Usage: primera-cli print <file> [--label 4x3] [--quality standard] [--copies 1]');
                    process.exit(1);
                }

                // Parse CLI flags
                const label = getFlag(args, '--label') || '4x3';
                const quality = (getFlag(args, '--quality') || 'standard') as any;
                const copies = parseInt(getFlag(args, '--copies') || '1', 10);
                const density = parseFloat(getFlag(args, '--density') || '1.0');

                if (!LABEL_PRESETS[label]) {
                    console.error(`❌ Unknown label size '${label}'. Valid: ${Object.keys(LABEL_PRESETS).join(', ')}`);
                    process.exit(1);
                }

                // Progress bar
                printer.on('progress', (p: PrintProgress) => {
                    const filled = Math.round(p.percent / 5);
                    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
                    process.stdout.write(`\r   ${bar} ${p.percent}% (swath ${p.swath}/${p.totalSwaths})`);
                });

                console.log(`🖨️  Printing ${file} → ${label}" label, quality=${quality}, copies=${copies}`);
                await printer.print(file, { label, quality, copies, density });
                console.log('\n✅ Print complete.');
                break;
            }

            default:
                console.error(`❌ Unknown command: ${command}`);
                printUsage();
                process.exit(1);
        }
    } catch (err: any) {
        console.error(`\n❌ ${err.name || 'Error'}: ${err.message}`);
        process.exit(1);
    } finally {
        await printer.disconnect();
    }
}

function getFlag(args: string[], flag: string): string | undefined {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function printUsage() {
    console.log(`
🖨️  Primera LX500 CLI

Usage: primera-cli <command> [options]

Commands:
  status                           Show printer status, firmware, ink levels
  ink                              Show ink levels with visual bars
  set-mode <reflective|die-cut|continuous>   Set paper sensor mode
  feed                             Feed one label
  eject                            Eject current label
  print <file> [options]           Print an image

Print Options:
  --label <size>      Label preset: ${Object.keys(LABEL_PRESETS).join(', ')} (default: 4x3)
  --quality <mode>    draft, standard, best (default: standard)
  --copies <n>        Number of copies (default: 1)
  --density <0-1>     Ink density multiplier (default: 1.0)

Examples:
  primera-cli status
  primera-cli ink
  primera-cli print label.png
  primera-cli print logo.png --label 2x2 --quality best --copies 10
`);
}

main();
