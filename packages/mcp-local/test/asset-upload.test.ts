import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { saveUploadedAsset } from '../src/asset-upload.js';

test('stores a PNG inside the configured website public/images directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dm-assets-'));
  try {
    const bytes = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
    const saved = await saveUploadedAsset({ name: 'Hero Image.png', data: bytes.toString('base64') }, root);
    assert.match(saved.src, /^\/images\/hero-image-[a-f0-9]{8}\.png$/);
    assert.deepEqual(await readFile(path.join(root, saved.relativePath)), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid or active SVG markup', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dm-assets-'));
  try {
    await assert.rejects(saveUploadedAsset({ name: 'evil.svg', data: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64') }, root));
    await assert.rejects(saveUploadedAsset({ name: 'fake.png', data: Buffer.from('not png').toString('base64') }, root));
    const saved = await saveUploadedAsset({ name: 'safe.svg', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>').toString('base64') }, root);
    assert.match(saved.src, /\.svg$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
