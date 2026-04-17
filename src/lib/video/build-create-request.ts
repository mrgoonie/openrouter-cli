/**
 * Build the JSON body for POST /videos from CLI args.
 * Handles frame-image file reading: encodes small files (<2MB) as base64 data: URLs.
 */

import { CliError } from '../errors/exit-codes.ts';

const MAX_FRAME_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

/** Map file extension to MIME type for supported image formats. */
function mimeFromExt(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png'; // safe fallback
  }
}

/** Read a frame image file and return a base64 data: URL. Throws on files ≥2MB. */
async function encodeFrameImage(path: string): Promise<string> {
  const file = Bun.file(path);
  const size = file.size;

  if (size >= MAX_FRAME_IMAGE_BYTES) {
    throw new CliError(
      'usage',
      `frame-image files must be <2MB (got ${Math.round(size / 1024)}KB for ${path})`,
      // TODO: add URL-based upload flow for larger frame images — see phase spec unresolved Q
      'larger uploads are not supported in v1 — TODO: add URL-based upload flow',
    );
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Encode to base64 using Bun's Buffer for efficiency
  const b64 = Buffer.from(bytes).toString('base64');
  const mime = mimeFromExt(path);
  return `data:${mime};base64,${b64}`;
}

export type BuildCreateRequestArgs = {
  prompt: string;
  model: string;
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  size?: string;
  frameImages?: string[];
  generateAudio?: boolean;
  provider?: string;
};

/**
 * Build a POST /videos request body from normalized CLI args.
 * Reads frame-image files from disk and encodes them as base64 data: URLs.
 * Passes provider JSON through if a file path is given.
 */
export async function buildCreateRequest(args: BuildCreateRequestArgs): Promise<unknown> {
  const body: Record<string, unknown> = {
    prompt: args.prompt,
    model: args.model,
  };

  if (args.aspectRatio !== undefined) body.aspect_ratio = args.aspectRatio;
  if (args.duration !== undefined) body.duration = args.duration;
  if (args.resolution !== undefined) body.resolution = args.resolution;
  if (args.size !== undefined) body.size = args.size;
  if (args.generateAudio !== undefined) body.generate_audio = args.generateAudio;

  // Encode frame images as base64 data: URLs — throws if any file is ≥2MB
  if (args.frameImages && args.frameImages.length > 0) {
    body.frame_images = await Promise.all(args.frameImages.map(encodeFrameImage));
  }

  // Provider JSON passthrough from file
  if (args.provider) {
    const providerData = await Bun.file(args.provider).json();
    body.provider = providerData;
  }

  return body;
}
