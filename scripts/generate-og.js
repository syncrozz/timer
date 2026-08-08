import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve(process.cwd(), 'public');

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <!-- Background Gradient -->
    <radialGradient id="bgGrad" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#210a4a" />
      <stop offset="60%" stop-color="#0b0422" />
      <stop offset="100%" stop-color="#040111" />
    </radialGradient>

    <!-- Neon Glows -->
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="16" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="25" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <!-- Gradients -->
    <linearGradient id="purpleRing" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#d8b4fe" />
      <stop offset="50%" stop-color="#a855f7" />
      <stop offset="100%" stop-color="#7e22ce" />
    </linearGradient>

    <linearGradient id="badgeBorder" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#a855f7" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>

    <linearGradient id="pillBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(168, 85, 247, 0.25)" />
      <stop offset="100%" stop-color="rgba(88, 28, 135, 0.4)" />
    </linearGradient>
  </defs>

  <!-- Background Canvas -->
  <rect width="1200" height="630" fill="url(#bgGrad)" />

  <!-- Background Decorative Rays & Glow Orb -->
  <circle cx="600" cy="180" r="300" fill="#a855f7" opacity="0.15" filter="url(#softGlow)" />
  <circle cx="600" cy="180" r="140" fill="#c084fc" opacity="0.2" filter="url(#glow)" />

  <!-- Abstract Tech Grid Lines -->
  <path d="M 0,500 Q 600,350 1200,500" fill="none" stroke="#a855f7" stroke-width="1.5" opacity="0.25" />
  <path d="M 0,530 Q 600,380 1200,530" fill="none" stroke="#818cf8" stroke-width="1" opacity="0.2" />
  <path d="M 0,560 Q 600,410 1200,560" fill="none" stroke="#c084fc" stroke-width="1" opacity="0.15" />

  <!-- TOP CENTER TIMER ICON BADGE -->
  <g transform="translate(600, 185)">
    <!-- Outer Glow Circle -->
    <circle cx="0" cy="0" r="115" fill="#09031d" stroke="url(#purpleRing)" stroke-width="12" filter="url(#glow)" />
    
    <!-- Top Crown / Knob -->
    <rect x="-24" y="-142" width="48" height="14" rx="7" fill="url(#purpleRing)" />
    <rect x="-12" y="-130" width="24" height="12" rx="3" fill="url(#purpleRing)" />

    <!-- Inner Circle with Play Icon -->
    <circle cx="0" cy="-35" r="32" fill="none" stroke="url(#purpleRing)" stroke-width="6" />
    <polygon points="-10,-47 16,-35 -10,-23" fill="#ffffff" />

    <!-- Text inside icon: ONE TAP -->
    <text x="0" y="42" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="38" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">ONE TAP</text>
  </g>

  <!-- MAIN TITLE: ONE TAP TIMER -->
  <text x="600" y="388" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="76" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="4" filter="url(#glow)">ONE TAP TIMER</text>

  <!-- SUBTITLE -->
  <text x="600" y="438" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="28" font-weight="500" fill="#e9d5ff" text-anchor="middle" letter-spacing="1">Fast  •  Simple  •  One Tap Countdown Timer</text>

  <!-- BOTTOM FEATURE PILLS -->
  <!-- Pill 1: Progressive Web App -->
  <g transform="translate(250, 485)">
    <rect x="0" y="0" width="210" height="52" rx="26" fill="url(#pillBg)" stroke="url(#badgeBorder)" stroke-width="1.5" />
    <!-- Rocket Icon -->
    <path d="M 32 36 C 32 36 38 22 46 18 C 48 26 42 32 42 32 M 26 26 C 26 26 40 20 44 12 C 36 10 30 16 30 16" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round" />
    <text x="105" y="32" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle">Progressive Web App</text>
  </g>

  <!-- Pill 2: Install on Any Device -->
  <g transform="translate(495, 485)">
    <rect x="0" y="0" width="210" height="52" rx="26" fill="url(#pillBg)" stroke="url(#badgeBorder)" stroke-width="1.5" />
    <text x="105" y="32" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle">Install on Any Device</text>
  </g>

  <!-- Pill 3: Works Offline -->
  <g transform="translate(740, 485)">
    <rect x="0" y="0" width="210" height="52" rx="26" fill="url(#pillBg)" stroke="url(#badgeBorder)" stroke-width="1.5" />
    <text x="105" y="32" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle">Works Offline</text>
  </g>
</svg>
`;

async function main() {
  const svgBuffer = Buffer.from(ogSvg);
  const outputPath = path.join(publicDir, 'og-image.png');
  await sharp(svgBuffer)
    .resize(1200, 630)
    .png()
    .toFile(outputPath);
  console.log('Generated public/og-image.png successfully!');
}

main().catch(console.error);
