import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, serverExternalPackages: ['tesseract.js', 'tesseract.js-core', 'sharp'], outputFileTracingIncludes: { '/api/**/*': ['./node_modules/tesseract.js/**/*', './node_modules/tesseract.js-core/**/*', './node_modules/@tesseract.js-data/*/4.0.0_best_int/*', './node_modules/@tesseract.js-data/*/package.json'] } };
export default config;
