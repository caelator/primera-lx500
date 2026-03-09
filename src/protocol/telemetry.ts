/**
 * Telemetry Parser — 128-byte frame decoder and config writer
 * Checksum and all field offsets verified against live hardware
 */
import { Buffer } from 'buffer';
import { PRINT, STATUS_CODES } from '../constants';
import type { PrinterStatus, SensorMode } from '../types';

const SENSOR_MODES: SensorMode[] = ['reflective', 'die-cut', 'continuous'];

export class Telemetry {
    /**
     * Parse a 128-byte telemetry frame into a structured PrinterStatus.
     * All UInt32 values are Big Endian (verified).
     */
    static parse(buf: Buffer): PrinterStatus {
        if (buf.length < 128) throw new Error('Invalid telemetry frame: expected 128 bytes');

        const calcInk = (spits: number) =>
            Math.max(0, Math.min(100, Math.round(((PRINT.MAX_SPITS - spits) / PRINT.MAX_SPITS) * 100)));

        const systemStatus = buf[33];

        return {
            fwVersion: buf.toString('ascii', 4, 20).replace(/\0/g, '').trim(),
            systemStatus,
            systemStatusText: STATUS_CODES[systemStatus] || `Unknown (0x${systemStatus.toString(16)})`,
            cartridgeType: buf[32],
            sensorMode: SENSOR_MODES[buf[37]] || 'continuous',
            totalPrints: buf.readUInt32BE(60),
            errorFlags: [buf[34], buf[35], buf[36]],
            inkLevels: {
                y: calcInk(buf.readUInt32BE(64)),
                m: calcInk(buf.readUInt32BE(68)),
                c: calcInk(buf.readUInt32BE(72)),
            },
        };
    }

    /**
     * Verify the checksum of a telemetry frame.
     */
    static verifyChecksum(buf: Buffer): boolean {
        let sum = 0;
        for (let i = 1; i <= 125; i++) sum += buf[i];
        return (sum & 0xFF) === buf[126];
    }

    /**
     * Build a 128-byte write command from a current config buffer.
     * Sets startChar to 0x02 (Write) and recalculates checksum.
     *
     * @param current  Current 128-byte telemetry frame
     * @param updates  Map of {offset: value} to change
     */
    static buildWrite(current: Buffer, updates: Record<number, number>): Buffer {
        const buf = Buffer.from(current);
        buf[0] = 0x02; // Write flag

        for (const [offset, val] of Object.entries(updates)) {
            buf[Number(offset)] = val;
        }

        // Recalculate mod-256 checksum
        let sum = 0;
        for (let i = 1; i <= 125; i++) sum += buf[i];
        buf[126] = sum & 0xFF;

        return buf;
    }
}
