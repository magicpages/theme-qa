// Uploads the generated fixtures once per run and hands back their Ghost URLs
// together with the sizes the cards need. Sizes are fixed here (not probed)
// because the fixtures are generated with exactly these dimensions.

import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';

export const FIXTURES_DIR = fileURLToPath(new URL('../../../fixtures/', import.meta.url));

const IMAGES = {
  landscape: { file: 'landscape.jpg', width: 2400, height: 1600 },
  wide: { file: 'wide.jpg', width: 1600, height: 900 },
  portrait: { file: 'portrait.jpg', width: 900, height: 1350 },
  square: { file: 'square.jpg', width: 1200, height: 1200 },
  avatar: { file: 'avatar.jpg', width: 400, height: 400 },
  tiny: { file: 'tiny.png', width: 48, height: 32 },
  logo: { file: 'logo.png', width: 600, height: 150 },
  icon: { file: 'icon.png', width: 512, height: 512, purpose: 'icon' },
};

/** Picks the Admin API upload endpoint and response key for a file. */
export function uploadTarget(filePath) {
  const ext = filePath.toLowerCase().split('.').pop();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'ico'].includes(ext)) {
    return { path: '/images/upload/', key: 'images' };
  }
  if (['mp3', 'mp4', 'm4a', 'wav', 'ogg', 'webm', 'mov', 'm4v'].includes(ext)) {
    return { path: '/media/upload/', key: 'media' };
  }
  return { path: '/files/upload/', key: 'files' };
}

/**
 * @param {ReturnType<import('../admin-api.mjs').createAdminApi>} api
 * @param {string} filePath absolute path
 * @param {Record<string, string>} [fields]
 */
export async function uploadFile(api, filePath, fields = {}) {
  const { path, key } = uploadTarget(filePath);
  const result = await api.upload(path, filePath, { fields });
  return result[key][0].url;
}

/** @param {ReturnType<import('../admin-api.mjs').createAdminApi>} api */
export async function uploadFixtures(api) {
  const at = (file) => `${FIXTURES_DIR}${file}`;
  const images = Object.fromEntries(
    await Promise.all(
      Object.entries(IMAGES).map(async ([name, { file, width, height, purpose }]) => {
        const src = await uploadFile(api, at(file), purpose ? { purpose } : {});
        return [name, { src, width, height }];
      }),
    ),
  );
  const [audio, video, document, documentStat] = await Promise.all([
    uploadFile(api, at('audio.mp3')),
    uploadFile(api, at('video.mp4')),
    uploadFile(api, at('document.pdf')),
    stat(at('document.pdf')),
  ]);
  return {
    images,
    audio: { src: audio, duration: 5, mimeType: 'audio/mpeg' },
    video: { src: video, width: 640, height: 360, duration: 2, mimeType: 'video/mp4' },
    document: { src: document, fileName: 'document.pdf', fileSize: documentStat.size },
  };
}
