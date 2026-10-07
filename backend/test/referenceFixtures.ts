/** Reference (testimonial) test helpers. Synthetic quotes and tiny fake image files only (BR-090). */
import { call, type Json, type Session } from './gigFixtures.js';

export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('synthetic png')]);
export const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('synthetic jpg')]);
export const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBPVP8 synthetic')]);
export const PDF = Buffer.from('%PDF-1.4\n% synthetic\n');
export const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

export function multipart(filename: string, content: Buffer, contentType = 'application/octet-stream', field = 'file') {
  const boundary = '----instaglamourTestBoundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

export function uploadImage(
  s: Session,
  referenceId: string,
  content: Buffer,
  options: { filename?: string; contentType?: string; field?: string; cookie?: string | null } = {},
) {
  const { payload, headers } = multipart(options.filename ?? 'photo.png', content, options.contentType ?? 'image/png', options.field);
  const cookie = options.cookie === undefined ? s.cookie : options.cookie;
  return s.app.inject({
    method: 'PUT',
    url: `/api/references/${referenceId}/image`,
    headers: { ...headers, ...(cookie ? { cookie } : {}) },
    payload,
  });
}

export async function createReference(s: Session, body: Record<string, unknown> = {}): Promise<Json> {
  const res = await call(s, 'POST', '/api/references', { quoteFi: 'Lainaus', author: '— Person 1', ...body });
  if (res.statusCode !== 201) throw new Error(`create reference failed: ${res.statusCode} ${res.body}`);
  return res.json();
}
