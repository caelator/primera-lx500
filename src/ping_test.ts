// @ts-nocheck
import { usb, InEndpoint, OutEndpoint, Endpoint } from 'usb';

const VENDOR_ID = 0x0F25;
const devices = usb.getDeviceList();
const dev = devices.find(d => d.deviceDescriptor.idVendor === VENDOR_ID);
if (!dev) { console.error("No printer"); process.exit(1); }

dev.open();
const iface = dev.interface(0);
if (iface.isKernelDriverActive()) iface.detachKernelDriver();
iface.claim();

let outEp: OutEndpoint | null = null;
let inEp: InEndpoint | null = null;
for (const ep of iface.endpoints) {
    if (ep.direction === 'out') outEp = ep as OutEndpoint;
    if (ep.direction === 'in') inEp = ep as InEndpoint;
}

console.log("--- Primera Ping Discovery ---");
console.log(`OUT: 0x${outEp!.address.toString(16)}, IN: 0x${inEp!.address.toString(16)}`);

// Strategy 1: Use startPoll (event-driven, like our successful sniff.ts)
// This is how the earlier capture worked -- the printer continuously pushes telemetry.
console.log("\n[Strategy 1] Using startPoll() to passively receive telemetry...");

let receivedCount = 0;
inEp!.startPoll(1, 128);
inEp!.on('data', (data: Buffer) => {
    receivedCount++;
    console.log(`  [Poll #${receivedCount}] Got ${data.length} bytes`);
    console.log(`    Hex: ${data.subarray(0, 20).toString('hex')}`);

    if (data.length >= 128) {
        console.log(`    startChar: 0x${data[0].toString(16)}`);
        console.log(`    numMsgBytes: ${data[1]}`);
        console.log(`    FWVersionDate: ${data.subarray(4, 20).toString('ascii')}`);
        console.log(`    tofModeSelect (sensor): ${data[37]}`);

        // Ink level offsets
        const ySpits = data.readUInt32LE(64);
        const mSpits = data.readUInt32LE(68);
        const cSpits = data.readUInt32LE(72);
        const maxSpits = 1440000000;
        const pct = (s: number) => Math.max(0, Math.min(100, Math.round(((maxSpits - s) / maxSpits) * 100)));
        console.log(`    Ink: C=${pct(cSpits)}% M=${pct(mSpits)}% Y=${pct(ySpits)}%`);
    }

    if (receivedCount >= 3) {
        console.log("\n  Got 3 payloads, stopping poll.");
        inEp!.stopPoll(() => {
            iface.release(true, () => { dev.close(); console.log("Done."); process.exit(0); });
        });
    }
});

inEp!.on('error', (err: any) => {
    console.error("  [Poll Error]", err.message);
});

// Timeout after 10 seconds
setTimeout(() => {
    console.log("\n  Timed out after 10s.");
    try {
        inEp!.stopPoll(() => {
            iface.release(true, () => { dev.close(); process.exit(1); });
        });
    } catch (e) { process.exit(1); }
}, 10000);
