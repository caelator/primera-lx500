// @ts-nocheck
import { Primera } from './Primera';
import { usb, Endpoint, InEndpoint, OutEndpoint } from 'usb';

async function fuzzPrinter() {
    console.log("Starting Primera LX500 Hardware Fuzzer...");
    console.log("We will map common ESC and PCL command heuristics to the BULK OUT port until it physically moves.");

    const device = Primera.discover();
    if (!device) {
        console.error("Printer not found.");
        process.exit(1);
    }

    const primera = new Primera();
    try {
        primera.connect(device);

        const iface = device.interfaces[0];
        let outEndpoint: OutEndpoint | null = null;
        let inEndpoint: InEndpoint | null = null;

        iface.endpoints.forEach((ep: Endpoint) => {
            if (ep.direction === 'out') outEndpoint = ep as OutEndpoint;
            if (ep.direction === 'in') inEndpoint = ep as InEndpoint;
        });

        if (!outEndpoint || !inEndpoint) {
            console.error("Missing endpoints.");
            return;
        }

        const outEp = outEndpoint as OutEndpoint;
        const inEp = inEndpoint as InEndpoint;

        // Start listening to see if a fuzz payload triggers an error/status ping back.
        inEp.startPoll(1, 64);
        inEp.on('data', (d: Buffer) => {
            // We only log non-standard telemetry (something other than the keepalive ping)
            if (d.length > 0 && d[0] !== 0x01 && d[0] !== 0x00) {
                console.log(`\n[!] ANOMALOUS RETURN TRIGGERED! Length: ${d.length}`);
                console.log(d.toString('hex').match(/../g)?.join(' '));
            }
        });

        inEp.on('error', () => { }); // Ignore standard poll timeouts

        console.log("\n--- EXECUTING FUZZ PAYLOADS ---");

        // Fuzzing Strategy: Common ESC/Pos, PCL-3 GUI, and Primera S-Class headers
        const triggerPayloads: Buffer[] = [
            // Standard ESC (Escape) variants
            Buffer.from([0x1B, 0x45]), // ESC E (Reset)
            Buffer.from([0x1B, 0x40]), // ESC @ (Initialize)

            // Known Primera / VIPColor PCL-3 Headers
            Buffer.from([0x1B, 0x2A, 0x72, 0x41]), // Start Raster
            Buffer.from([0x0A]), // LF
            Buffer.from([0x0C]), // FF (Form Feed - should spit a label)

            // Fuzzing the Die-Cut toggle struct (guesswork based on legacy driver strings)
            // Usually starts with a command byte like 0x1D or 0x02
            Buffer.from([0x02, 0x01, 0x00, 0x00, 0x00]), // Mode 0
            Buffer.from([0x02, 0x01, 0x01, 0x00, 0x00]), // Mode 1

            // Let's send a raw Form Feed (0x0C) padded to 64 bytes (the block size)
            Buffer.alloc(64, 0x0C),

            // Let's send a bare "Status Request" byte
            Buffer.from([0x05]) // ENQ
        ];

        for (let i = 0; i < triggerPayloads.length; i++) {
            const payload = triggerPayloads[i];
            console.log(`[Fuzz ${i}] Sending ${payload.length} bytes: ${payload.toString('hex')}`);

            await new Promise((resolve) => {
                outEp.transfer(payload, (error) => {
                    if (error) console.log(`[Fuzz ${i}] Transfer Error:`, error.message);
                    resolve(true);
                });
            });

            // Wait 1.5 seconds between fuzzes so the user can look at the printer
            await new Promise(r => setTimeout(r, 1500));
        }

        console.log("\nFuzz sequence complete. Did the printer physically move, feed, or cut?");

    } catch (e) {
        console.error(e);
    } finally {
        setTimeout(() => {
            primera.disconnect();
            process.exit(0);
        }, 1000);
    }
}

fuzzPrinter();
