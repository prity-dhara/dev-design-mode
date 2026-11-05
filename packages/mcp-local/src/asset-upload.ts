import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ASSET_UPLOAD_PATH = '/.design-mode/upload-asset';
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;

export async function saveUploadedAsset(input: {
  name: string;
  data: string;
}, configuredRoot = process.env.DM_ASSET_PROJECT_ROOT): Promise<{ src: string; relativePath: string }> {
  if (!configuredRoot) throw new Error('Set DM_ASSET_PROJECT_ROOT to your website project folder before starting the local server.');
  const extension = path.extname(input.name || '').toLowerCase();
  if (extension !== '.png' && extension !== '.svg') throw new Error('Only PNG and SVG files are supported.');
  if (typeof input.data !== 'string' || input.data.length > Math.ceil(MAX_ASSET_BYTES * 4 / 3) + 8 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)) throw new Error('Invalid uploaded image data.');
  const buffer = Buffer.from(input.data, 'base64');
  if (!buffer.length || buffer.length > MAX_ASSET_BYTES) throw new Error('Image must be 8 MB or smaller.');
  if (extension === '.png' && !buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    throw new Error('This file is not a valid PNG.');
  }
  if (extension === '.svg') {
    const svg = buffer.toString('utf8');
    // Static SVG only: reject active elements, XML entities, and external resources.
    if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg) ||
        /<!|<\s*\/?\s*(?:script|foreignObject|iframe|object|embed|image|use|animate|set|animateMotion|animateTransform)\b/i.test(svg) ||
        /\bon[a-z]+\s*=/i.test(svg) ||
        /\b(?:href|src)\s*=/i.test(svg) ||
        /url\s*\(\s*['"]?\s*(?:https?:|data:|javascript:|\/\/)/i.test(svg) ||
        /@import|<\s*style\b/i.test(svg)) {
      throw new Error('SVG contains unsupported or potentially unsafe content. Upload a static SVG without scripts or external resources.');
    }
  }
  const projectRoot = await realpath(path.resolve(configuredRoot));
  const targetDir = path.join(projectRoot, 'public', 'images');
  await mkdir(targetDir, { recursive: true });
  // Refuse directory symlinks escaping the configured repository.
  const actualDir = await realpath(targetDir);
  if (actualDir !== path.join(projectRoot, 'public', 'images')) {
    throw new Error('Image directory resolves outside the selected project.');
  }
  const name = path.basename(input.name, extension).toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'image';
  const filename = name + '-' + randomUUID().slice(0, 8) + extension;
  await writeFile(path.join(actualDir, filename), buffer, { flag: 'wx' });
  return { src: '/images/' + filename, relativePath: 'public/images/' + filename };
}
