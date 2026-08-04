/**
 * Event artwork upload.
 *
 * The P2P node stores the file and addresses it by content hash; that hash is
 * what gets minted on-chain, so the contract never holds a mutable path and the
 * same picture uploaded twice costs nothing extra.
 */

const IMAGES_ENDPOINT = 'http://127.0.0.1:8080/images';

/** What the node accepts — mirrors ALLOWED_IMAGE_TYPES in network/api.py. */
export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif';
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export interface UploadedImage {
  hash: string;
  url: string;
  bytes: number;
}

export async function uploadEventImage(file: File): Promise<UploadedImage> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image is larger than ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`);
  }

  const body = new FormData();
  body.append('file', file);

  let response: Response;
  try {
    response = await fetch(IMAGES_ENDPOINT, { method: 'POST', body });
  } catch {
    // A failed fetch here almost always means the node isn't running, which is
    // worth saying plainly rather than surfacing "Failed to fetch".
    throw new Error('Could not reach the P2P node — is it running on port 8080?');
  }

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body: { detail?: string }) => body.detail)
      .catch(() => undefined);
    throw new Error(detail ?? `Upload failed (${response.status}).`);
  }

  return response.json();
}
