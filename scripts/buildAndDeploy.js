const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== 1. Exporting Expo Mobile for Web ===');
execSync('npx expo export --platform web', { cwd: path.join(__dirname, '../mobile'), stdio: 'inherit' });

console.log('=== 2. Rebuilding Admin Panel ===');
execSync('npm run build', { cwd: path.join(__dirname, '../admin'), stdio: 'inherit' });

console.log('=== 3. Re-creating public_web directory ===');
const publicWeb = path.join(__dirname, '../public_web');
if (fs.existsSync(publicWeb)) {
  fs.rmSync(publicWeb, { recursive: true, force: true });
}
fs.mkdirSync(publicWeb, { recursive: true });

console.log('=== 4. Copying Mobile Web files ===');
copyFolderSync(path.join(__dirname, '../mobile/dist'), publicWeb);

console.log('=== 5. Copying Admin Web files ===');
const adminDest = path.join(publicWeb, 'admin');
fs.mkdirSync(adminDest, { recursive: true });
copyFolderSync(path.join(__dirname, '../admin/dist'), adminDest);

console.log('=== 6. Creating Web App Manifest ===');
const manifest = {
  name: "VivaFifa2026",
  short_name: "VivaFifa",
  description: "World Cup 2026 Private Betting Arena",
  start_url: "/",
  display: "standalone",
  background_color: "#0b0f19",
  theme_color: "#0b0f19",
  orientation: "portrait",
  icons: [
    {
      src: "/icon-192.png",
      sizes: "192x192",
      type: "image/png"
    },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png"
    }
  ]
};
fs.writeFileSync(path.join(publicWeb, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log('=== 7. Copying Launcher Icons ===');
fs.copyFileSync(
  path.join(__dirname, '../mobile/assets/splash-icon.png'),
  path.join(publicWeb, 'icon-192.png')
);
fs.copyFileSync(
  path.join(__dirname, '../mobile/assets/icon.png'),
  path.join(publicWeb, 'icon-512.png')
);

console.log('=== 8. Injecting manifest link in index.html ===');
const indexPath = path.join(publicWeb, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('manifest.json')) {
  html = html.replace('</head>', '  <link rel="manifest" href="/manifest.json" />\n</head>');
  fs.writeFileSync(indexPath, html, 'utf8');
}

console.log('=== 9. Deploying to Firebase Hosting ===');
execSync('npx firebase-tools deploy --only hosting --project vivafifa2026', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

console.log('=== Build and Deploy to Firebase completed! ===');

function copyFolderSync(from, to) {
  if (!fs.existsSync(from)) return;
  const files = fs.readdirSync(from);
  for (const file of files) {
    const fromPath = path.join(from, file);
    const toPath = path.join(to, file);
    const stat = fs.statSync(fromPath);
    if (stat.isDirectory()) {
      fs.mkdirSync(toPath, { recursive: true });
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}
