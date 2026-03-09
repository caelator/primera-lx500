/**
 * Primera LX500 Printer Protocol Config Builder
 *
 * Re-assembles the 128-byte C-Struct required for printer configuration.
 */

// This base payload was intercepted via USB wiretap. It represents the 128-byte
// structure containing everything from Firmware versions to offset coordinates.
const DEFAULT_CONFIG_PAYLOAD_HEX = "017e572d312e36392030362f31392f3230313920344243350a303030310201b1544900000001c0140101010108c0006419b4164400080100000300000000028a008ee34d0094b10500aef7142314230b0708540070702828280840004000010000007a1b1b6701020100034200040301001770181ea50003024055fc0100a304";

export enum SensorMode {
    REFLECTIVE = 0,
    DIE_CUT = 1,
    CONTINUOUS = 2
}

/**
 * Builds a complete 128-byte write command to alter the LX500 configuration.
 */
export function buildToggleSensorModeCommand(mode: SensorMode): Buffer {
    // 1. Clone the default configuration payload
    const buf = Buffer.from(DEFAULT_CONFIG_PAYLOAD_HEX, 'hex');

    // 2. Change startChar from 0x01 (Read) to 0x02 (Write)
    buf.writeUInt8(0x02, 0);

    // 3. Update the Sensor Mode parameter at the reversed-engineered offset (37)
    // C-Struct layout: 37th byte is `tofModeSelect`
    buf.writeUInt8(mode, 37);

    // 4. Calculate the Checksum
    // The Primera checksum validation algorithm is a Modulo-256 summation 
    // of all bytes starting from index 1 to index 125.
    let sum = 0;
    for (let i = 1; i <= 125; i++) {
        sum += buf[i];
    }
    const checksum = sum & 0xFF;

    // 5. Inject the new checksum at offset 126
    buf.writeUInt8(checksum, 126);

    // Ensure End Char is untouched (it sits at offset 127)
    return buf;
}
