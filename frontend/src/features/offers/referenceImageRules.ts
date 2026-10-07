// Reference photo rules (api-contract "References"): PNG / JPG / WebP ≤ 10 MB. The server checks
// again and answers 413 / 415.

export const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

/** `accept` for the file picker (phones offer the camera and the photo library for it). */
export const REFERENCE_IMAGE_ACCEPT = [...TYPES, ...EXTENSIONS.map((e) => `.${e}`)].join(',');

export type ReferenceImageProblem = 'FILE_TOO_LARGE' | 'UNSUPPORTED_FILE_TYPE';

/** Client-side check before uploading. */
export function referenceImageProblem(file: File): ReferenceImageProblem | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const typeOk = TYPES.includes(file.type) || (!file.type && EXTENSIONS.includes(ext));
  if (!typeOk) return 'UNSUPPORTED_FILE_TYPE';
  if (file.size > MAX_REFERENCE_IMAGE_BYTES) return 'FILE_TOO_LARGE';
  return null;
}
