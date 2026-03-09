/**
 * RGB → CMY Color Converter
 * Isolated for future ICC .icm profile integration
 */
import { Buffer } from 'buffer';

export class ColorConverter {
    /**
     * Naive RGB → CMY conversion with density control.
     * V2 roadmap: 3D 17³ LUT interpolation using Primera's .clrprm/.icm profiles.
     *
     * @param rgb    Raw RGB pixel buffer (3 bytes per pixel)
     * @param density Ink density multiplier 0.0–1.0 (default 1.0)
     */
    static rgbToCmy(rgb: Buffer, density = 1.0): { c: Buffer; m: Buffer; y: Buffer } {
        const len = rgb.length / 3;
        const c = Buffer.allocUnsafe(len);
        const m = Buffer.allocUnsafe(len);
        const y = Buffer.allocUnsafe(len);

        for (let i = 0, p = 0; i < rgb.length; i += 3, p++) {
            c[p] = Math.min(255, Math.round((255 - rgb[i]) * density));
            m[p] = Math.min(255, Math.round((255 - rgb[i + 1]) * density));
            y[p] = Math.min(255, Math.round((255 - rgb[i + 2]) * density));
        }

        return { c, m, y };
    }
}
