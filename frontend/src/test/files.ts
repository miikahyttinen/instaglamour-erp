/// <reference types="node" />
import { File as NodeFile } from 'node:buffer';

/**
 * A file for upload tests (Node `File`, see setup.ts). `sizeBytes` fakes a large size without
 * allocating it.
 */
export function testFile(name: string, type: string, sizeBytes?: number): File {
  const file = new NodeFile(['synthetic test file'], name, { type }) as unknown as File;
  if (sizeBytes !== undefined) Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}
