// @ts-nocheck
import { Primera } from './Primera';
import { usb, Endpoint, InEndpoint, OutEndpoint } from 'usb';

async function fuzzAggressive() {
    console.log("Starting Aggressive Structural Fuzzer (Phase 4)...");

    // We discovered 0x7E ('~') as the start sentinel from the IN payload
    // We will fuzz the second byte (Command Code) and map a dummy payload.

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

        const outEp = outEndpoint as OutEndpoint;
        const inEp = inEndpoint as InEndpoint;

        let anomalousResponseFound = false;

        inEp.startPoll(1, 64);
        inEp.on('data', (d: Buffer) => {
            if (d.length > 0 && d[0] !== 0x01 && d[0] !== 0x00) {
                console.log(`\n[!] ANOMALOUS RETURN TRIGGERED BY COMMAND. Length: ${d.length}`);
                console.log(d.toString('hex').match(/../g)?.join(' '));
                anomalousResponseFound = true;
            }
        });
        inEp.on('error', () => { });

        console.log("\n--- INITIATING 0x00 to 0xFF COMMAND BRUTE FORCE ---");

        // Let's iterate all 256 possible command bytes following a `~` sentinel
        for (let cmd = 0x00; cmd <= 0xFF; cmd++) {

            // Build struct: [Start=0x7E, Cmd, RecordType=0, len=1, payload=0, checksum, End=0xFF]
            const msg = Buffer.alloc(16, 0x00);
            msg[0] = 0x7E;
            msg[1] = cmd;
            msg[2] = 0x10; // 16 bytes len
            msg[14] = 0x00; // checksum dummy
            msg[15] = 0xFF; // end char

            process.stdout.write(`\rFuzzing CMD ${cmd.toString(16).padStart(2, '0').toUpperCase()}... `);

            await new Promise((resolve) => {
                outEp.transfer(msg, (err) => {
                    resolve(true);
                });
            });

            // Wait 50ms between sends to not overwhelm the bus
            await new Promise(r => setTimeout(r, 50));
        }

        console.log("\n--- EXECUTING RAW PCL-3 RASTER BRUTE FORCE ---");
        // Often these printers wait for a specific Job Start string before responding
        const pclHeaders = [
            Buffer.from("\x1B*b1M\x1B*r1A", "ascii"), // Typical HP PCL-3 Raster start
            Buffer.from("\x1B*b2M\x1B*r2A", "ascii"),
            Buffer.from("~R", "ascii"), // Fake command string
            Buffer.from("~C", "ascii"), // Configuration struct request
            Buffer.from("~I", "ascii"), // Ink Level request
        ];

        for (const payload of pclHeaders) {
            console.log(`Sending String: ${payload.toString('hex')}`);
            await new Promise((resolve) => {
                outEp.transfer(payload, () => resolve(true));
            });
            await new Promise(r => setTimeout(r, 500));
        }

        console.log("\nFuzz sweep complete. Did the device beep, flash, or feed?");

    } catch (e) {
        console.error(e);
    } finally {
        setTimeout(() => {
            primera.disconnect();
            process.exit(0);
        }, 1000);
    }
}

fuzzAggressive();
