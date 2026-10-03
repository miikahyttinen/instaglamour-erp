// Attachment rules (BR-040). The server checks again and answers 413 / 415.

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
];
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'png', 'jpg', 'jpeg'];

/** `accept` for the file picker. */
export const ATTACHMENT_ACCEPT = [...ALLOWED_TYPES, ...ALLOWED_EXTENSIONS.map((e) => `.${e}`)].join(',');

/** Client-side check before uploading. */
export function attachmentProblem(file: File): 'FILE_TOO_LARGE' | 'UNSUPPORTED_FILE_TYPE' | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const typeOk =
    ALLOWED_TYPES.includes(file.type) || (!file.type && ALLOWED_EXTENSIONS.includes(ext));
  if (!typeOk) return 'UNSUPPORTED_FILE_TYPE';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'FILE_TOO_LARGE';
  return null;
}
