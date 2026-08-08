import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const svgPath = path.join(publicDir, 'favicon.svg');

const iconSpecs = [
  { name: 'android-chrome-192x192.png', width: 192, height: 192 },
  { name: 'android-chrome-512x512.png', width: 512, height: 512 },
  { name: 'apple-touch-icon.png', width: 180, height: 180 },
  { name: 'favicon-16x16.png', width: 16, height: 16 },
  { name: 'favicon-32x32.png', width: 32, height: 32 },
  { name: 'favicon-48x48.png', width: 48, height: 48 },
  { name: 'favicon-96x96.png', width: 96, height: 96 },
  { name: 'mstile-150x150.png', width: 150, height: 150 },
  { name: 'favicon.ico', width: 32, height: 32 },
  { name: 'web-app-manifest-192x192.png', width: 192, height: 192 },
  { name: 'web-app-manifest-512x512.png', width: 512, height: 512 },
];

async function generateAll() {
  console.log('Generating PWA icon assets from favicon.svg...');
  for (const spec of iconSpecs) {
    const outputPath = path.join(publicDir, spec.name);
    await sharp(svgPath)
      .resize(spec.width, spec.height)
      .png()
      .toFile(outputPath);
    console.log(`Generated: ${spec.name} (${spec.width}x${spec.height})`);
  }
  console.log('All icons generated successfully!');
}

generateAll().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
