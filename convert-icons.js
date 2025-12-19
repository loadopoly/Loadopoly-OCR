const sharp = require('sharp');
const fs = require('fs');

const sizes = [16, 32, 48, 128];

const svgContent = {
  16: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><defs><linearGradient id="grad16" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" /><stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" /></linearGradient></defs><rect width="16" height="16" rx="3" fill="url(#grad16)"/><path d="M4 5h8M4 8h6M4 11h7" stroke="white" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="11" r="2" fill="#22c55e"/></svg>',
  32: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs><linearGradient id="grad32" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" /><stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" /></linearGradient></defs><rect width="32" height="32" rx="6" fill="url(#grad32)"/><path d="M7 10h18M7 16h14M7 22h16" stroke="white" stroke-width="2.5" stroke-linecap="round"/><circle cx="25" cy="22" r="4" fill="#22c55e"/><path d="M23 22l1.5 1.5 3-3" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  48: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><defs><linearGradient id="grad48" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" /><stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" /></linearGradient></defs><rect width="48" height="48" rx="10" fill="url(#grad48)"/><rect x="8" y="8" width="32" height="32" rx="4" fill="white" fill-opacity="0.15"/><path d="M12 16h24M12 24h20M12 32h22" stroke="white" stroke-width="3" stroke-linecap="round"/><circle cx="38" cy="34" r="6" fill="#22c55e"/><path d="M35 34l2 2 4-4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  128: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="grad128" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" /><stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" /></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.3"/></filter></defs><rect width="128" height="128" rx="24" fill="url(#grad128)" filter="url(#shadow)"/><rect x="16" y="16" width="96" height="96" rx="12" fill="white" fill-opacity="0.1"/><path d="M28 38h72M28 58h60M28 78h66M28 98h54" stroke="white" stroke-width="6" stroke-linecap="round"/><rect x="24" y="32" width="80" height="8" fill="#22c55e" fill-opacity="0.3" rx="2"/><circle cx="100" cy="92" r="16" fill="#22c55e"/><path d="M92 92l5 5 11-11" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="90" cy="42" r="6" fill="white" fill-opacity="0.5"/><circle cx="104" cy="56" r="4" fill="white" fill-opacity="0.4"/><line x1="90" y1="42" x2="104" y2="56" stroke="white" stroke-opacity="0.3" stroke-width="2"/></svg>'
};

(async () => {
  for (const size of sizes) {
    try {
      await sharp(Buffer.from(svgContent[size]))
        .png()
        .toFile(`public/icons/icon-${size}.png`);
      console.log(`✓ Created icon-${size}.png`);
    } catch (err) {
      console.error(`✗ Failed to create icon-${size}.png:`, err.message);
    }
  }
})();
