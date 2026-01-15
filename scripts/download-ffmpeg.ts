import { mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS_DIR = './public/assets';

// Download FFmpeg core files and worker for local serving
const FFMPEG_CORE_FILES = [
  // FFmpeg UMD bundle (avoids Vite worker issues)
  {
    url: 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.js',
    dest: 'ffmpeg.js',
  },
  // FFmpeg UMD chunk (required by main bundle)
  {
    url: 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd/814.ffmpeg.js',
    dest: '814.ffmpeg.js',
  },
  // FFmpeg util UMD bundle
  {
    url: 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js',
    dest: 'ffmpeg-util.js',
  },
  // Single-threaded core (UMD version for browser compatibility)
  {
    url: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
    dest: 'ffmpeg-core.js',
  },
  {
    url: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
    dest: 'ffmpeg-core.wasm',
  },
  // Multi-threaded core
  {
    url: 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js',
    dest: 'ffmpeg-core-mt.js',
  },
  {
    url: 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.wasm',
    dest: 'ffmpeg-core-mt.wasm',
  },
  {
    url: 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.worker.js',
    dest: 'ffmpeg-core.worker.js',
  },
];

async function fileExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.size > 0;
  } catch {
    return false;
  }
}

async function downloadFile(url: string, dest: string): Promise<boolean> {
  const destPath = join(ASSETS_DIR, dest);

  // Skip if file already exists
  if (await fileExists(destPath)) {
    const stats = await stat(destPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  ✓ ${dest} (${sizeMB} MB) - already exists, skipping`);
    return false;
  }

  console.log(`  ↓ Downloading ${dest}...`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await writeFile(destPath, Buffer.from(buffer));
  const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
  console.log(`    → ${dest} (${sizeMB} MB)`);
  return true;
}

async function main(): Promise<void> {
  console.log('FFmpeg.wasm asset check\n');

  if (!existsSync(ASSETS_DIR)) {
    await mkdir(ASSETS_DIR, { recursive: true });
  }

  let downloadCount = 0;
  for (const file of FFMPEG_CORE_FILES) {
    const downloaded = await downloadFile(file.url, file.dest);
    if (downloaded) downloadCount++;
  }

  if (downloadCount > 0) {
    console.log(`\n✓ Downloaded ${downloadCount} FFmpeg assets`);
  } else {
    console.log('\n✓ All FFmpeg assets already present');
  }
}

main().catch((error) => {
  console.error('Error downloading FFmpeg assets:', error);
  process.exit(1);
});
