// Offline demo on web: the photo is a data: URI kept in localStorage with the
// rest of the demo store, so it's re-encoded at 640 px (a few dozen KB)
// instead of the 1600 px upload size.

import type { CapturedPhoto } from './types';
import { downscaleImageFile } from './webCapture';

const DEMO_EDGE = 640;
const DEMO_QUALITY = 0.6;

/** A URI for `photo` that's small enough to keep in the demo store. */
export async function localPhotoUri(photo: CapturedPhoto): Promise<string> {
  if (!photo.blob) return photo.uri;
  try {
    return (await downscaleImageFile(photo.blob, DEMO_EDGE, DEMO_QUALITY)).uri;
  } catch {
    return photo.uri;
  }
}
