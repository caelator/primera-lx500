/**
 * TypeScript interfaces for the Primera LX500 SDK
 */

export type SensorMode = 'reflective' | 'die-cut' | 'continuous';
export type PrintQuality = 'draft' | 'standard' | 'best';
export type FitMode = 'contain' | 'cover' | 'fill';

export interface PrintOptions {
    /** Label size preset (e.g., '4x3') — overrides width/height */
    label?: string;
    /** Width in inches (default) or pixels */
    width?: number;
    /** Height in inches (default) or pixels */
    height?: number;
    /** Unit for width/height */
    unit?: 'inches' | 'px';
    /** Print quality preset */
    quality?: PrintQuality;
    /** Enable bidirectional printing (default: true) */
    bidi?: boolean;
    /** Number of copies (default: 1) */
    copies?: number;
    /** Ink density 0.0-1.0 (default: 1.0) */
    density?: number;
    /** Max total ink per pixel as percentage of single channel (default: 240) */
    inkLimit?: number;
    /** Image scaling mode (default: 'fill') */
    fit?: FitMode;
}

export interface PrinterStatus {
    fwVersion: string;
    systemStatus: number;
    systemStatusText: string;
    cartridgeType: number;
    sensorMode: SensorMode;
    totalPrints: number;
    errorFlags: number[];
    inkLevels: { c: number; m: number; y: number };
}

export interface PrintProgress {
    percent: number;
    swath: number;
    totalSwaths: number;
}

/** Events emitted by PrimeraLX500 */
export interface PrimeraEvents {
    'telemetry': (status: PrinterStatus) => void;
    'progress': (info: PrintProgress) => void;
    'warning': (message: string) => void;
    'retry': (info: { attempt: number; error: any }) => void;
    'ink-low': (channel: 'c' | 'm' | 'y', percent: number) => void;
}
