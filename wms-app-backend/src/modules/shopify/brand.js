const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Embed assets so OAuth and embedded pages work without a separate asset host.
function assetUrl(name) {
  return `data:image/svg+xml;base64,${readFileSync(join(__dirname, 'assets', name)).toString('base64')}`;
}

module.exports = {
  logoUrl: assetUrl('synovia-logo.svg'),
  iconUrl: assetUrl('synovia-icon.svg'),
};
