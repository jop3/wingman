/**
 * Generate placeholder PNG icons for the extension
 * Creates simple colored squares with "W" text
 *
 * Run: node scripts/generate-icons.js
 *
 * Note: For production, replace these with proper designed icons.
 * You can use tools like:
 * - Figma/Canva for design
 * - favicon.io for conversion
 * - realfavicongenerator.net
 */

const fs = require('fs');
const path = require('path');

// PNG file header and basic structure creator
// This creates minimal valid PNG files

function createPNG(size) {
  // Create a simple PNG with a colored background
  // Using a minimal PNG implementation

  const width = size;
  const height = size;

  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);  // bit depth
  ihdrData.writeUInt8(2, 9);  // color type (RGB)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdr = createChunk('IHDR', ihdrData);

  // Create image data (simple gradient background with centered shape)
  const rawData = [];

  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte for each row

    for (let x = 0; x < width; x++) {
      // Create a gradient background (#1a1a2e to #16213e)
      const gradientFactor = (x + y) / (width + height);
      const r = Math.floor(26 + (22 - 26) * gradientFactor);
      const g = Math.floor(26 + (33 - 26) * gradientFactor);
      const b = Math.floor(46 + (62 - 46) * gradientFactor);

      // Add a lighter "W" shape in the center
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = width * 0.35;

      // Check if we're in the "W" area (simplified as a circle for placeholder)
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius) {
        // Lighter color for the center (#4fc3f7)
        rawData.push(79);  // R
        rawData.push(195); // G
        rawData.push(247); // B
      } else {
        rawData.push(r);
        rawData.push(g);
        rawData.push(b);
      }
    }
  }

  // Compress with zlib (deflate)
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData), { level: 9 });

  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  // Combine all chunks
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation for PNG
function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  const table = getCRC32Table();

  for (let i = 0; i < buffer.length; i++) {
    crc = table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
  }

  return crc ^ 0xFFFFFFFF;
}

let crc32Table = null;
function getCRC32Table() {
  if (crc32Table) return crc32Table;

  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
  }
  return crc32Table;
}

// Generate icons
const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, '..', 'src', 'icons');

// Ensure directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

console.log('Generating placeholder icons...');

for (const size of sizes) {
  const png = createPNG(size);
  const filename = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Created: icon${size}.png (${png.length} bytes)`);
}

console.log('\nDone! Icons created in src/icons/');
console.log('\nNote: These are placeholder icons. For production, create proper designed icons.');
