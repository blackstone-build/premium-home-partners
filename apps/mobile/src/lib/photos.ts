// Photos in Storage, both private buckets:
//   visit-photos    {visit_id}/{task_id}/{kind}-{epoch_ms}.jpg  (docs/LIVE_ARCHITECTURE.md §4)
//   request-photos  {request_id}/{uuid}.jpg                     (docs/SERVICES_V2.md)
// Pure helpers live in components/camera/photoUtils.ts (unit-tested).

import {
  PHOTO_BUCKET,
  REQUEST_PHOTO_BUCKET,
  base64ToArrayBuffer,
  isDuplicateUploadError,
  isRetryableUploadError,
  photoPath,
  requestPhotoPath,
  type PhotoBucket,
  type PhotoKind,
} from '../components/camera/photoUtils';
import type { CapturedPhoto } from '../components/camera/types';
import { FriendlyError, friendlyError } from './errors';
import { invalidateTables } from './realtime';
import { rpc } from './rpc';
import { requireSupabase } from './supabase';

export { RemotePhoto } from '../components/camera/RemotePhoto';
export { getSignedUrl, getSignedUrls, useSignedPhotoUrl } from '../components/camera/signedUrls';
export { PHOTO_BUCKET, REQUEST_PHOTO_BUCKET, photoPath, requestPhotoPath, type PhotoBucket, type PhotoKind } from '../components/camera/photoUtils';
export type { CapturedPhoto } from '../components/camera/types';

const RETRY_DELAY_MS = 800;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Upload with one retry on a network error. `ownPath`: the path is unique to
 * this photo (a uuid), so an existing object can only be an earlier attempt of ours.
 */
async function uploadWithRetry(bucket: PhotoBucket, path: string, body: Blob | ArrayBuffer, ownPath = false): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    let err: unknown = null;
    try {
      const res = await requireSupabase()
        .storage.from(bucket)
        .upload(path, body, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });
      err = res.error;
    } catch (e) {
      err = e;
    }
    if (!err) return;
    // An earlier attempt landed but its answer was lost: the object is there.
    if ((attempt > 0 || ownPath) && isDuplicateUploadError(err)) return;
    if (attempt === 0 && isRetryableUploadError(err)) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    throw new FriendlyError(friendlyError(err));
  }
}

/** The bytes to upload: web sends the Blob; React Native an ArrayBuffer (supabase-js can't send RN Blobs). */
function photoBody(photo: CapturedPhoto): Blob | ArrayBuffer {
  try {
    return photo.blob ?? base64ToArrayBuffer(photo.base64);
  } catch {
    throw new FriendlyError("We couldn't read that photo. Try again.");
  }
}

/**
 * Upload a captured photo for a visit task and record it with
 * `add_visit_photo`. Retries the upload once on a network error. Throws a
 * FriendlyError whose message can go straight into a toast. Invalidates
 * `visit_photos` queries on success.
 */
export async function uploadVisitPhoto({
  visitId,
  taskId,
  kind,
  photo,
}: {
  visitId: string;
  taskId: string;
  kind: PhotoKind | (string & {});
  photo: CapturedPhoto;
}): Promise<{ path: string }> {
  const path = photoPath(visitId, taskId, kind);
  const body = photoBody(photo);
  await uploadWithRetry(PHOTO_BUCKET, path, body);
  await rpc('add_visit_photo', { p_task: taskId, p_kind: kind, p_path: path });
  void invalidateTables(['visit_photos']);
  return { path };
}

/**
 * Upload a homeowner's photo for a service request to `request-photos` at
 * `{request_id}/{uuid}.jpg` and record it with `add_service_request_photo`.
 * Retries the upload once on a network error; throws a FriendlyError.
 * Pass the same `path` again to retry a photo whose record failed.
 */
export async function uploadRequestPhoto({
  requestId,
  photo,
  path = requestPhotoPath(requestId),
}: {
  requestId: string;
  photo: CapturedPhoto;
  path?: string;
}): Promise<{ path: string }> {
  const body = photoBody(photo);
  await uploadWithRetry(REQUEST_PHOTO_BUCKET, path, body, true);
  await rpc('add_service_request_photo', { p_request_id: requestId, p_path: path });
  void invalidateTables(['service_request_photos', 'service_requests']);
  return { path };
}
