/**
 * Primera LX500 SDK — Main Orchestrator
 * Merges architect V2 with 12 best-in-class features:
 * - One-line print API (python-escpos)
 * - Label presets (PPD-derived)
 * - Mid-job telemetry + progress events (HPLIP)
 * - Error recovery with retry (HPLIP)
 * - Ink limiting + quality presets + density control (Gutenprint)
 * - Typed errors + EventEmitter contract (node-thermal-printer)
 * - Symbol.asyncDispose for resource safety
 * - Dry run mode for CI/CD
 */

import { Device, InEndpoint, OutEndpoint, getDeviceList } from 'usb';
import { EventEmitter } from 'events';
import sharp from 'sharp';
import { CommandBuilder as Cmd } from './protocol/command-builder';
import { Telemetry } from './protocol/telemetry';
import { ColorConverter } from './print/color-converter';
import { HalftoneEngine } from './print/halftone';
import { SwathAssembler } from './print/swath-assembler';
import { USB, LABEL_PRESETS, PRINT } from './constants';
import { PrinterNotFoundError, PrinterBusyError, USBTransferError, PrintError, InkEmptyError, InvalidArgumentError } from './errors';
import type { PrintOptions, PrinterStatus, PrintProgress, PrimeraEvents, PrintQuality } from './types';

export class PrimeraLX500 extends EventEmitter {
    private device: Device | null = null;
    private inEp?: InEndpoint;
    private outEp?: OutEndpoint;
    private currentConfig: Buffer = Buffer.alloc(128);
    private _dryRun: boolean;

    public status?: PrinterStatus;

    constructor(opts?: { dryRun?: boolean }) {
        super();
        this._dryRun = opts?.dryRun ?? false;
    }

    // ═══════════════════════════════════════════════
    // Discovery & Connection
    // ═══════════════════════════════════════════════

    /** Scan USB bus for Primera LX500 printers */
    static discover(): Device[] {
        return getDeviceList().filter(d =>
            d.deviceDescriptor.idVendor === USB.VENDOR_ID &&
            d.deviceDescriptor.idProduct === USB.PRODUCT_ID
        );
    }

    /** Connect and begin telemetry polling. Resolves after first telemetry frame. */
    async connect(targetDevice?: Device): Promise<void> {
        if (this._dryRun) {
            this.status = {
                fwVersion: 'DRY-RUN',
                systemStatus: 0x49,
                systemStatusText: 'Idle',
                cartridgeType: 0x54,
                sensorMode: 'continuous',
                totalPrints: 0,
                errorFlags: [0, 0, 0],
                inkLevels: { c: 100, m: 100, y: 100 },
            };
            return;
        }

        this.device = targetDevice || PrimeraLX500.discover()[0];
        if (!this.device) throw new PrinterNotFoundError();

        this.device.open();
        const iface = this.device.interface(0);

        // Critical: Detach macOS/CUPS kernel driver before claiming
        if (process.platform === 'darwin') {
            try { if (iface.isKernelDriverActive()) iface.detachKernelDriver(); } catch (e) { }
        }
        iface.claim();

        this.inEp = iface.endpoint(USB.IN_ENDPOINT) as InEndpoint;
        this.outEp = iface.endpoint(USB.OUT_ENDPOINT) as OutEndpoint;

        // Start interrupt-driven telemetry polling
        this.inEp.startPoll(1, 128);
        this.inEp.on('data', (data: Buffer) => {
            if (data.length === 128 && data[0] === 0x01) {
                data.copy(this.currentConfig);
                this.status = Telemetry.parse(data);
                this.emit('telemetry', this.status);

                // Emit ink-low warnings
                const { inkLevels } = this.status;
                if (inkLevels.c <= 10) this.emit('ink-low', 'c', inkLevels.c);
                if (inkLevels.m <= 10) this.emit('ink-low', 'm', inkLevels.m);
                if (inkLevels.y <= 10) this.emit('ink-low', 'y', inkLevels.y);
            }
        });

        // Wait for first telemetry frame
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Telemetry timeout (5s)')), 5000);
            this.once('telemetry', () => { clearTimeout(timeout); resolve(); });
        });
    }

    // ═══════════════════════════════════════════════
    // USB I/O with Retry (HPLIP-inspired)
    // ═══════════════════════════════════════════════

    private async writeUSB(data: Buffer, retries = 3): Promise<void> {
        if (this._dryRun) return;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await new Promise<void>((resolve, reject) =>
                    this.outEp!.transfer(data, err => err ? reject(err) : resolve())
                );
            } catch (err: any) {
                if (attempt === retries) throw new USBTransferError(err.message || 'Transfer failed', err);
                this.emit('retry', { attempt, error: err });
                await new Promise(r => setTimeout(r, 100 * attempt));
            }
        }
    }

    /** Poll for a fresh telemetry frame with timeout */
    private async pollStatus(timeoutMs = 500): Promise<PrinterStatus | null> {
        if (this._dryRun) return this.status!;
        return new Promise<PrinterStatus | null>((resolve) => {
            const timeout = setTimeout(() => resolve(null), timeoutMs);
            this.once('telemetry', (s: PrinterStatus) => { clearTimeout(timeout); resolve(s); });
        });
    }

    // ═══════════════════════════════════════════════
    // Configuration Commands
    // ═══════════════════════════════════════════════

    /** Set sensor mode */
    async setSensorMode(mode: 'reflective' | 'die-cut' | 'continuous'): Promise<void> {
        const map = { 'reflective': 0, 'die-cut': 1, 'continuous': 2 } as const;
        if (!(mode in map)) throw new InvalidArgumentError(`Invalid sensor mode: ${mode}`);
        await this.writeUSB(Telemetry.buildWrite(this.currentConfig, { 37: map[mode] }));
    }

    /** Feed one label forward */
    async feedLabel(): Promise<void> {
        await this.writeUSB(Cmd.loadPaper());
    }

    /** Eject the current label */
    async ejectLabel(): Promise<void> {
        await this.writeUSB(Cmd.ejectPaper());
    }

    // ═══════════════════════════════════════════════
    // Print — The One-Line API
    // ═══════════════════════════════════════════════

    /**
     * Print an image to the LX500.
     *
     * @example
     * // Simplest usage — prints to default 4×3" label
     * await printer.print("label.png");
     *
     * // With options
     * await printer.print("label.png", { label: '4x3', quality: 'best', copies: 2 });
     *
     * // Pixel-explicit
     * await printer.print(imageBuffer, { width: 2400, height: 1800, unit: 'px' });
     */
    async print(imageInput: string | Buffer, opts: PrintOptions = {}): Promise<void> {
        // Resolve dimensions
        const { widthPx, heightPx } = this.resolveDimensions(opts);
        const quality: PrintQuality = opts.quality ?? 'standard';
        const copies = opts.copies ?? 1;
        const density = opts.density ?? 1.0;
        const inkLimit = opts.inkLimit ?? HalftoneEngine.DEFAULT_INK_LIMIT;
        const bidi = opts.bidi !== false;
        const fit = opts.fit ?? 'fill';

        // Check printer state
        if (!this._dryRun && this.status?.systemStatus !== 0x49) {
            throw new PrinterBusyError(this.status?.systemStatus ?? 0);
        }

        // Check ink levels
        if (!this._dryRun && this.status) {
            const { inkLevels } = this.status;
            if (inkLevels.c <= 0) throw new InkEmptyError('c', inkLevels.c);
            if (inkLevels.m <= 0) throw new InkEmptyError('m', inkLevels.m);
            if (inkLevels.y <= 0) throw new InkEmptyError('y', inkLevels.y);
        }

        // Decode + scale image to label dimensions at 600dpi
        const { data: rgbData } = await sharp(imageInput)
            .resize({ width: widthPx, height: heightPx, fit })
            .removeAlpha().raw()
            .toBuffer({ resolveWithObject: true });

        // Color conversion with density control
        const { c, m, y } = ColorConverter.rgbToCmy(rgbData, density);

        // Ink limiting (Gutenprint-inspired)
        if (quality === 'best' || inkLimit < 300) {
            HalftoneEngine.applyInkLimit(c, m, y, inkLimit);
        }

        // Halftone with quality-appropriate algorithm
        const channels = [
            { id: 0, bin: HalftoneEngine.process(c, widthPx, heightPx, quality) },
            { id: 1, bin: HalftoneEngine.process(m, widthPx, heightPx, quality) },
            { id: 2, bin: HalftoneEngine.process(y, widthPx, heightPx, quality) },
        ];

        // Print N copies
        for (let copy = 0; copy < copies; copy++) {
            await this.printSingleCopy(channels, widthPx, heightPx, bidi);
        }
    }

    private async printSingleCopy(
        channels: Array<{ id: number; bin: Uint8Array }>,
        widthPx: number,
        heightPx: number,
        bidi: boolean,
    ): Promise<void> {
        const totalSwaths = Math.ceil(heightPx / SwathAssembler.SWATH_HEIGHT);

        // Hardware-verified boot sequence
        await this.writeUSB(Cmd.jobInformation(widthPx, heightPx, bidi));
        await this.writeUSB(Cmd.paperInformation());
        await this.writeUSB(Cmd.pageInformation(bidi ? 0x02 : 0x00));
        await this.writeUSB(Cmd.loadPaper());

        let address = 0;
        let swathCount = 0;

        for (let currentY = 0; currentY < heightPx; currentY += SwathAssembler.SWATH_HEIGHT) {
            for (const ch of channels) {
                const swathData = SwathAssembler.assemble(ch.bin, widthPx, heightPx, currentY);

                // Skip blank swaths for faster spool times
                if (!SwathAssembler.isBlank(swathData)) {
                    await this.writeUSB(Cmd.segmentHeader(swathData.length, address, ch.id));
                    await this.writeUSB(swathData);
                }
            }

            await this.writeUSB(Cmd.advancePaper(SwathAssembler.SWATH_HEIGHT));
            address += SwathAssembler.SWATH_HEIGHT;
            swathCount++;

            // Mid-job telemetry monitoring (HPLIP-inspired) — every 10 swaths
            if (swathCount % 10 === 0 && !this._dryRun) {
                const progress: PrintProgress = {
                    percent: Math.round((currentY / heightPx) * 100),
                    swath: swathCount,
                    totalSwaths,
                };
                this.emit('progress', progress);

                // Check for hardware errors
                if (this.status && (this.status.errorFlags[0] !== 0 || this.status.errorFlags[1] !== 0)) {
                    throw new PrintError('Hardware error during print', this.status.errorFlags);
                }
            }
        }

        // Finalize
        await this.writeUSB(Cmd.endPrint());
        await this.writeUSB(Cmd.ejectPaper());
        await this.writeUSB(Cmd.endOfJob());

        this.emit('progress', { percent: 100, swath: totalSwaths, totalSwaths });
    }

    /** Resolve label dimensions from options */
    private resolveDimensions(opts: PrintOptions): { widthPx: number; heightPx: number } {
        if (opts.label) {
            const preset = LABEL_PRESETS[opts.label];
            if (!preset) {
                throw new InvalidArgumentError(
                    `Unknown label preset '${opts.label}'. Valid: ${Object.keys(LABEL_PRESETS).join(', ')}`
                );
            }
            return { widthPx: preset.width, heightPx: preset.height };
        }

        const width = opts.width ?? 4;
        const height = opts.height ?? 3;
        const isInch = opts.unit !== 'px';

        return {
            widthPx: isInch ? Math.round(width * PRINT.DPI) : width,
            heightPx: isInch ? Math.round(height * PRINT.DPI) : height,
        };
    }

    // ═══════════════════════════════════════════════
    // Disconnect — Properly awaited (no setTimeout hack)
    // ═══════════════════════════════════════════════

    async disconnect(): Promise<void> {
        if (this._dryRun) return;

        return new Promise<void>((resolve) => {
            try { this.inEp?.stopPoll(); } catch (e) { }

            const iface = this.device?.interface(0);
            if (!iface) {
                try { this.device?.close(); } catch (e) { }
                return resolve();
            }

            iface.release(true, () => {
                if (process.platform === 'darwin') {
                    try { iface.attachKernelDriver(); } catch (e) { }
                }
                try { this.device?.close(); } catch (e) { }
                this.device = null;
                this.inEp = undefined;
                this.outEp = undefined;
                resolve();
            });
        });
    }

    /** Symbol.asyncDispose for `await using` pattern */
    async [Symbol.asyncDispose](): Promise<void> {
        await this.disconnect();
    }
}
