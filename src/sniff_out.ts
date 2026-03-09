// @ts-nocheck
import { usb } from 'usb';

let isListening = false;

// We will use the lower-level libusb bindings to sniff traffic
// without natively claiming the interface, allowing LX500Config.app
// to still send the command while we watch the bus.
console.log("Starting Low-Level USB Listener...");

usb.on('attach', function (device) {
    console.log("Device attached:", device.deviceDescriptor.idVendor);
});

// Since node-usb doesn't have a true promiscuous mode, we will rapidly poll
// the device descriptors and intercept control transfers on the default pipe
// if possible, but macOS might still block this.

console.log("Unfortunately, macOS IOUSBHostFamily strictly prohibits promiscuous sniffing");
console.log("without a custom kernel extension or the PacketLogger entitlement.");
console.log("We must rely on the returned IN telemetry or use a hardware intercept.");
