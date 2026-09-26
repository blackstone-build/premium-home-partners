// Offline demo: a captured photo kept on the device instead of uploaded.
// Native keeps the camera's file:// URI (short). The web build (localPhoto.web.ts)
// shrinks the data: URI so a few photos fit in the persisted demo store.

import type { CapturedPhoto } from './types';

/** A URI for `photo` that's small enough to keep in the demo store. */
export async function localPhotoUri(photo: CapturedPhoto): Promise<string> {
  return photo.uri;
}
