// @ts-nocheck
import { Primera } from './Primera';
import { usb, Endpoint, InEndpoint, OutEndpoint } from 'usb';

async function sniffPrinter() {
    console.log("Starting Custom Primera Payload Sniffer (Phase 3 Bypass)...");

    const device = Primera.discover();
    if (!device) {
        console.error("Priner not found on USB bus. Ensure it is plugged in.");
        process.exit(1);
    }

    const primera = new Primera();
    try {
        primera.connect(device);
        console.log("Interface successfully claimed!");

        // Locate endpoints
        const iface = device.interfaces[0];
        let inEndpoint: InEndpoint | null = null;
        let outEndpoint: OutEndpoint | null = null;

        iface.endpoints.forEach((ep: Endpoint) => {
            if (ep.direction === 'in') inEndpoint = ep as InEndpoint;
            if (ep.direction === 'out') outEndpoint = ep as OutEndpoint;
        });

        if (!inEndpoint || !outEndpoint) {
            console.error("Could not locate IN/OUT endpoints.");
            return;
        }

        console.log("\n--- LISTENING FOR PAYLOADS ---");
        console.log("Open LX500Config.app and click Apply, OR print a test page via CUPS!");
        console.log("(Note: CUPS may fail to print if we hold this claim)");

        // Start polling the IN endpoint for return telemetry
        const inEp = inEndpoint as InEndpoint;
        inEp.startPoll(1, 64);
        inEp.on('data', (data: Buffer) => {
            console.log(`[IN (Printer -> Mac)] Received ${data.length} bytes:`);
            console.log(data.toString('hex').match(/../g)?.join(' '));
        });

        inEp.on('error', (err: any) => {
            console.error("[IN Endpoint Error]", err);
        });

        // We can't actively listen on the OUT endpoint easily without a filter driver.
        // We will notify the user they must rely on the IN responses to back-calculate the ping.

        // Keep process alive for 60 seconds
        await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (e) {
        console.error("Sniffer Runtime Error:", e);
    } finally {
        console.log("Releasing interface and exiting.");
        primera.disconnect();
    }
}

sniffPrinter();
