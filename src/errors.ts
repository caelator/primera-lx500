/**
 * Typed error classes for the Primera LX500 SDK
 * Inspired by python-escpos's specific exception hierarchy
 */

export class PrimeraError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PrimeraError';
    }
}

export class PrinterNotFoundError extends PrimeraError {
    constructor() { super('No Primera LX500 found on USB bus. Check connection and power.'); this.name = 'PrinterNotFoundError'; }
}

export class PrinterBusyError extends PrimeraError {
    constructor(public readonly statusCode: number) {
        super(`Printer is not idle (status 0x${statusCode.toString(16)}). Wait for current job to complete.`);
        this.name = 'PrinterBusyError';
    }
}

export class InkEmptyError extends PrimeraError {
    constructor(public readonly channel: 'c' | 'm' | 'y', public readonly percent: number) {
        super(`${channel.toUpperCase()} ink is empty (${percent}%).`);
        this.name = 'InkEmptyError';
    }
}

export class PaperOutError extends PrimeraError {
    constructor() { super('Paper out — load labels and retry.'); this.name = 'PaperOutError'; }
}

export class USBTransferError extends PrimeraError {
    constructor(message: string, public readonly usbError: any) {
        super(`USB transfer failed: ${message}`);
        this.name = 'USBTransferError';
    }
}

export class PrintError extends PrimeraError {
    constructor(message: string, public readonly errorFlags: number[]) {
        super(`Print error: ${message} (flags: [${errorFlags.map(f => '0x' + f.toString(16)).join(', ')}])`);
        this.name = 'PrintError';
    }
}

export class InvalidArgumentError extends PrimeraError {
    constructor(message: string) { super(message); this.name = 'InvalidArgumentError'; }
}
