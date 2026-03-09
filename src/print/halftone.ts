/**
 * Floyd-Steinberg Halftone Engine with Ink Limiting & Quality Presets
 * Inspired by Gutenprint's dithering quality controls
 */
import { Buffer } from 'buffer';
import type { PrintQuality } from '../types';

export class HalftoneEngine {
    /** Default max total ink per pixel (240% of single channel) */
    static DEFAULT_INK_LIMIT = 240;

    /**
     * Floyd-Steinberg error diffusion with serpentine scanning.
     * Uses Int16Array for zero-allocation error accumulation.
     *
     * @param channel  Single-channel contone buffer (0-255 per pixel)
     * @param width    Image width in pixels
     * @param height   Image height in pixels
     */
    static floydSteinberg(channel: Buffer, width: number, height: number): Uint8Array {
        const binary = new Uint8Array(width * height);
        const err = new Int16Array(width * height);

        // Copy channel data into Int16 for error accumulation
        for (let i = 0; i < channel.length; i++) err[i] = channel[i];

        for (let y = 0; y < height; y++) {
            const isReverse = y % 2 !== 0; // Serpentine scanning
            const startX = isReverse ? width - 1 : 0;
            const endX = isReverse ? -1 : width;
            const stepX = isReverse ? -1 : 1;

            for (let x = startX; x !== endX; x += stepX) {
                const idx = y * width + x;
                const val = err[idx];
                const newPixel = val > 127 ? 255 : 0;

                binary[idx] = newPixel === 255 ? 1 : 0;

                const error = val - newPixel;
                if (error === 0) continue;

                // Bitshift division by 16 for fast integer math
                const e7 = (error * 7) >> 4;
                const e3 = (error * 3) >> 4;
                const e5 = (error * 5) >> 4;
                const e1 = error - e7 - e3 - e5; // exact remainder

                const nx1 = x + stepX;
                const nx2 = x - stepX;
                const ny = y + 1;

                if (nx1 >= 0 && nx1 < width) err[y * width + nx1] += e7;
                if (nx2 >= 0 && nx2 < width && ny < height) err[ny * width + nx2] += e3;
                if (ny < height) err[ny * width + x] += e5;
                if (nx1 >= 0 && nx1 < width && ny < height) err[ny * width + nx1] += e1;
            }
        }
        return binary;
    }

    /**
     * Fast ordered dither for 'draft' quality — much faster than error diffusion.
     * Uses a 4x4 Bayer matrix.
     */
    static orderedDither(channel: Buffer, width: number, height: number): Uint8Array {
        const binary = new Uint8Array(width * height);
        const bayer4 = [
            0, 8, 2, 10,
            12, 4, 14, 6,
            3, 11, 1, 9,
            15, 7, 13, 5,
        ];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const threshold = ((bayer4[(y & 3) * 4 + (x & 3)] + 0.5) / 16) * 255;
                binary[idx] = channel[idx] > threshold ? 1 : 0;
            }
        }
        return binary;
    }

    /**
     * Process a single channel with quality-appropriate dithering.
     */
    static process(channel: Buffer, width: number, height: number, quality: PrintQuality = 'standard'): Uint8Array {
        switch (quality) {
            case 'draft':
                return this.orderedDither(channel, width, height);
            case 'standard':
            case 'best':
            default:
                return this.floydSteinberg(channel, width, height);
        }
    }

    /**
     * Apply ink limiting across C/M/Y channels.
     * Prevents total ink at any pixel from exceeding the budget.
     * Gutenprint-inspired dither_set_ink_budget.
     *
     * @param c CMY contone buffers (modified in-place)
     * @param inkLimit Max total ink as % of single channel (e.g., 240 = 240%)
     */
    static applyInkLimit(
        c: Buffer, m: Buffer, y: Buffer,
        inkLimit: number = HalftoneEngine.DEFAULT_INK_LIMIT
    ): void {
        const maxTotal = (inkLimit / 100) * 255; // e.g., 240% → 612

        for (let i = 0; i < c.length; i++) {
            const total = c[i] + m[i] + y[i];
            if (total > maxTotal) {
                const scale = maxTotal / total;
                c[i] = Math.round(c[i] * scale);
                m[i] = Math.round(m[i] * scale);
                y[i] = Math.round(y[i] * scale);
            }
        }
    }
}
