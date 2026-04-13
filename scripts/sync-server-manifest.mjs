import fs from 'node:fs';

const manifestPath = 'server.json';
const version = process.env.RELEASE_VERSION;
const packageName = process.env.RELEASE_PACKAGE_NAME;

if (!version || !packageName) {
  throw new Error('RELEASE_VERSION and RELEASE_PACKAGE_NAME must be set.');
}

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Missing required manifest: ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = version;

let matchedPackageCount = 0;
if (Array.isArray(manifest.packages)) {
  manifest.packages = manifest.packages.map((pkg) => {
    if (
      pkg &&
      pkg.registryType === 'npm' &&
      pkg.identifier === packageName
    ) {
      matchedPackageCount += 1;
      return { ...pkg, version };
    }

    return pkg;
  });
}

if (matchedPackageCount === 0) {
  throw new Error(
    `No npm package entry matched identifier "${packageName}" in ${manifestPath}`
  );
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
