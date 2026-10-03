// Camera + photo UI. Metro picks the `.web.tsx` files on web.
//
//   usePhotoCapture().capture()  native: full-screen camera modal; web: file picker
//   <PhotoCaptureHost />         mount once in the root layout (null on web)
//   <RemotePhoto path tag />     a stored photo in the report-tile frame

import type * as NativeLocal from './localPhoto';
import type * as WebLocal from './localPhoto.web';
import type * as NativeCapture from './PhotoCapture';
import type * as WebCapture from './PhotoCapture.web';

export { localPhotoUri } from './localPhoto';
export { PhotoCaptureHost, capturePhoto, usePhotoCapture } from './PhotoCapture';
export { RemotePhoto } from './RemotePhoto';
export { Shutter } from './Shutter';
export { CAMERA_OFF, JPEG_QUALITY, MAX_EDGE } from './photoUtils';
export type { CaptureOptions, CapturedPhoto, PhotoCaptureApi } from './types';

// Compile-time check that the native and web files export the same API.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type _PlatformParity = [
  Assert<Same<typeof NativeCapture.usePhotoCapture, typeof WebCapture.usePhotoCapture>>,
  Assert<Same<typeof NativeCapture.capturePhoto, typeof WebCapture.capturePhoto>>,
  Assert<Same<keyof typeof NativeCapture, keyof typeof WebCapture>>,
  Assert<Same<typeof NativeLocal.localPhotoUri, typeof WebLocal.localPhotoUri>>,
];
