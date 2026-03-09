/**
 * ESC * Command Builder — Serializes all Primera LX500 print commands
 * All hex bytes verified via binary disassembly of SnakePrinterCommand (40/40 hardware test)
 */
import { Buffer } from 'buffer';

export class CommandBuilder {
    static readonly ESC = Buffer.from([0x1B, 0x2A]);

    // ═══════════════════════════════════════════════
    // Simple 4-byte commands
    // ═══════════════════════════════════════════════

    /** Feed paper to print position */
    static loadPaper(): Buffer {
        return Buffer.concat([this.ESC, Buffer.from([0x07, 0x63])]);
    }

    /** Eject completed label */
    static ejectPaper(): Buffer {
        return Buffer.concat([this.ESC, Buffer.from([0x07, 0x65])]);
    }

    /** End of job — session termination (8 bytes) */
    static endOfJob(): Buffer {
        return Buffer.concat([this.ESC, Buffer.from([0x82, 0x00, 0x00, 0x00, 0x00, 0xAC])]);
    }

    // ═══════════════════════════════════════════════
    // Parameterized commands
    // ═══════════════════════════════════════════════

    /** Advance paper by steps (1/600" per step, Big Endian) */
    static advancePaper(steps: number): Buffer {
        const buf = Buffer.alloc(8);
        this.ESC.copy(buf, 0);
        buf[2] = 0x07; buf[3] = 0x03;
        buf.writeUInt32BE(steps, 4);
        return buf;
    }

    /** Load paper + advance by distance in 1/600" steps */
    static loadPaperMove(distanceSteps: number): Buffer {
        const buf = Buffer.alloc(8);
        this.ESC.copy(buf, 0);
        buf[2] = 0x07; buf[3] = 0x66;
        buf.writeUInt32BE(distanceSteps, 4);
        return buf;
    }

    /** Page information — mode: 0x00=default, 0x02=bidi */
    static pageInformation(mode: number = 0x00): Buffer {
        const buf = Buffer.alloc(7);
        this.ESC.copy(buf, 0);
        buf[2] = 0x05; buf[3] = 0x06; buf[4] = mode;
        return buf;
    }

    /**
     * Job information — 86-byte payload with print dimensions and nozzle config.
     * Field offsets derived from KitaPrintModeInfo and SnakePrinterCommand disassembly.
     */
    static jobInformation(widthPx: number, heightPx: number, bidi = true): Buffer {
        const buf = Buffer.alloc(86, 0);
        this.ESC.copy(buf, 0);
        buf[2] = 0x81; buf[3] = 0x12; buf[4] = 0x56;  // Header + length marker
        buf[5] = 0x4E;   // Model byte 'N' (from disasm)
        buf[6] = 0x53;   // Sub-model byte 'S' (from disasm)
        buf[7] = 0x00;   // Padding

        buf.writeUInt16BE(widthPx, 8);    // Print width in pixels
        buf.writeUInt16BE(heightPx, 10);  // Print height in pixels
        buf.writeUInt16BE(40, 12);         // Active nozzle height (0x28)
        buf.writeUInt16BE(84, 14);         // Total nozzles per color (0x54)
        buf.writeUInt16BE(bidi ? 2 : 1, 16); // 2=bidi, 1=unidirectional

        return buf;
    }

    /** Paper information — media type / tray selection */
    static paperInformation(): Buffer {
        const buf = Buffer.alloc(7, 0);
        this.ESC.copy(buf, 0);
        buf[2] = 0x05; buf[3] = 0x06;    // Paper info prefix from PaperInformationCmd
        buf[4] = 0x00;                     // Default tray/media
        return buf;
    }

    /** End print — normal (0x01) or duplex (0x08) */
    static endPrint(duplex = false): Buffer {
        const buf = Buffer.alloc(8);
        this.ESC.copy(buf, 0);
        buf[2] = 0x44; buf[3] = 0x02;
        buf[7] = duplex ? 0x08 : 0x01;
        return buf;
    }

    /**
     * Segment header — 16 bytes preceding each raster swath.
     * Compression type 0 = intentionally uncompressed.
     */
    static segmentHeader(rasterSize: number, address: number, colorId: number): Buffer {
        const buf = Buffer.alloc(16);
        this.ESC.copy(buf, 0);
        buf[2] = 0x34; buf[3] = 0x01;
        buf.writeUInt32BE(rasterSize + 0x10, 4);  // Data length + header size
        buf.writeUInt32BE(address, 8);             // Swath vertical position
        buf[12] = 0;                                // Compression: 0=none
        buf[13] = colorId;                          // Color channel identifier
        return buf;
    }
}
