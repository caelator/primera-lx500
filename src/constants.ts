/**
 * Primera LX500 Hardware Constants
 * All values verified against live hardware (40/40 checks passed)
 */

export const USB = {
    VENDOR_ID: 0x0F25,
    PRODUCT_ID: 0x0032,
    IN_ENDPOINT: 0x84,
    OUT_ENDPOINT: 0x02,
} as const;

export const PRINT = {
    DPI: 600,
    NOZZLES_PER_COLOR: 84,
    ACTIVE_SWATH_HEIGHT: 40,
    BYTES_PER_COLUMN: 5,     // 40 nozzles / 8 bits
    NOZZLE_BANKS: 3,
    FIRE_GROUPS: 8,
    MAX_WIDTH_PX: 2400,      // 4" at 600dpi
    MAX_HEIGHT_PX: 4800,     // 8" at 600dpi
    MAX_SPITS: 1_440_000_000,
    DEFAULT_SATURATION: 95,
} as const;

export const LABEL_PRESETS: Record<string, { width: number; height: number }> = {
    '0.75x0.25': { width: 450, height: 150 },
    '1x0.5': { width: 600, height: 300 },
    '1.375x1.375': { width: 825, height: 825 },
    '1.5x1.5': { width: 900, height: 900 },
    '2x1': { width: 1200, height: 600 },
    '2x2': { width: 1200, height: 1200 },
    '2x6': { width: 1200, height: 3600 },
    '2.5x2.5': { width: 1500, height: 1500 },
    '3x1': { width: 1800, height: 600 },
    '3x2': { width: 1800, height: 1200 },
    '3x5': { width: 1800, height: 3000 },
    '4x1.5': { width: 2400, height: 900 },
    '4x2': { width: 2400, height: 1200 },
    '4x3': { width: 2400, height: 1800 },
    '4x4': { width: 2400, height: 2400 },
    '4x6': { width: 2400, height: 3600 },
} as const;

export const STATUS_CODES: Record<number, string> = {
    0x49: 'Idle',           // 'I'
    0x50: 'Printing',       // 'P'
    0x42: 'Busy',           // 'B'
    0x45: 'Error',          // 'E'
} as const;
