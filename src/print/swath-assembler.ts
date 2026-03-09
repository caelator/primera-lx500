/**
 * Swath Assembler — Transposes horizontal raster into column-major nozzle-packed swaths
 * 40 nozzles high, MSB-first, 5 bytes per column
 */
import { Buffer } from 'buffer';
import { PRINT } from '../constants';

export class SwathAssembler {
    static readonly SWATH_HEIGHT = PRINT.ACTIVE_SWATH_HEIGHT; // 40
    static readonly BYTES_PER_COL = PRINT.BYTES_PER_COLUMN;   // 5

    /**
     * Assemble one swath from a binary (1-bit) raster plane.
     *
     * @param plane   Binary raster: Uint8Array where 1=ink, 0=no ink
     * @param width   Image width in pixels
     * @param height  Image height in pixels
     * @param startY  Starting row for this swath
     * @returns Buffer of column-major nozzle-packed data (width × 5 bytes)
     */
    static assemble(plane: Uint8Array, width: number, height: number, startY: number): Buffer {
        const actualHeight = Math.min(this.SWATH_HEIGHT, height - startY);
        const swath = Buffer.alloc(width * this.BYTES_PER_COL, 0);

        for (let x = 0; x < width; x++) {
            const colOffset = x * this.BYTES_PER_COL;
            for (let dy = 0; dy < actualHeight; dy++) {
                if (plane[(startY + dy) * width + x] === 1) {
                    const byteIdx = colOffset + (dy >> 3);   // dy / 8
                    const bitIdx = 7 - (dy & 7);             // MSB first
                    swath[byteIdx] |= (1 << bitIdx);
                }
            }
        }
        return swath;
    }

    /**
     * Check if a swath buffer is entirely blank (no ink).
     * Used to skip sending empty swaths for faster print times.
     */
    static isBlank(swath: Buffer): boolean {
        for (let i = 0; i < swath.length; i++) {
            if (swath[i] !== 0) return false;
        }
        return true;
    }
}
