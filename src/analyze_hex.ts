// Sniffed IN Payload from Primera LX500 (64 bytes each)
// This is the active telemetry pulse the printer sends to the Mac.

// Payload A (Config/State Header)
const payloadA = Buffer.from("017e572d312e36392030362f31392f3230313920344243350a303030310201b1544900000001c0140101010108c0006419b4164400080100000300000000028a", "hex");

// Payload B (Status & Ink Levels)
const payloadB = Buffer.from("008ee34d0094b10500aef7142314230b0708540070702828280840004000010000007a1b1b6701020100034200040301001770181ea50003024055fc0100a304", "hex");

console.log("--- Payload A ---");
console.log(payloadA.toString('ascii')); // Check for ASCII text (like firmware versions)

console.log("\n--- Payload B ---");
console.log("Analyzing for percentage values (0-100 / 0x00-0x64)");
const bArray = [...payloadB];
bArray.forEach((byte, index) => {
    if (byte <= 100 && byte >= 0) {
        process.stdout.write(`[${index}]:${byte}% `);
    }
});
console.log();
