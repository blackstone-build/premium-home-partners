// Signed URLs for private photos: createSignedUrls with a 1 h expiry, cached
// per path until ~5 min before expiry, batched per tick so a grid of tiles
// makes one request. One loader per bucket (`visit-photos`, `request-photos`).

import { useEffect, useState } from 'react';
import { FriendlyError, friendlyError } from '../../lib/errors';
import { supabase } from '../../lib/supabase';
import { PHOTO_BUCKET, SIGNED_URL_TTL_S, createSignedUrlLoader, type PhotoBucket, type SignedUrlLoader } from './photoUtils';

const loaders = new Map<PhotoBucket, SignedUrlLoader>();

function loaderFor(bucket: PhotoBucket): SignedUrlLoader {
  let l = loaders.get(bucket);
  if (!l) {
    l = createSignedUrlLoader(async (paths) => {
      if (!supabase) return {};
      let res: Awaited<ReturnType<ReturnType<typeof supabase.storage.from>['createSignedUrls']>>;
      try {
        res = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL_S);
      } catch (e) {
        throw new FriendlyError(friendlyError(e));
      }
      if (res.error) throw new FriendlyError(friendlyError(res.error));
      const out: Record<string, string> = {};
      for (const r of res.data) if (r.path && r.signedUrl && !r.error) out[r.path] = r.signedUrl;
      return out;
    });
    loaders.set(bucket, l);
  }
  return l;
}

/** Signed URLs for many storage paths (default bucket `visit-photos`). Paths that can't be signed are left out. */
export function getSignedUrls(paths: readonly string[], bucket: PhotoBucket = PHOTO_BUCKET): Promise<Record<string, string>> {
  return loaderFor(bucket).getMany(paths);
}

/**
 * A signed URL for `path`, or null while it loads, when `path` is empty, or
 * when it can't be signed. Retries with backoff while the server is
 * unreachable, and re-signs shortly before the URL expires.
 */
export function useSignedPhotoUrl(path: string | null | undefined, bucket: PhotoBucket = PHOTO_BUCKET): string | null {
  const loader = loaderFor(bucket);
  const [state, setState] = useState<{ path: string | null | undefined; url: string | null }>(() => ({
    path,
    url: path ? loader.peek(path) : null,
  }));

  useEffect(() => {
    if (!path || !supabase) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const load = () => {
      loader.get(path).then(
        (url) => {
          if (!alive) return;
          failures = 0;
          setState((s) => (s.path === path && s.url === url ? s : { path, url }));
          const staleAt = loader.cache.staleAt(path);
          if (url && staleAt !== null) timer = setTimeout(load, Math.max(1_000, staleAt - Date.now() + 50));
        },
        () => {
          if (!alive) return;
          failures++;
          timer = setTimeout(load, Math.min(15_000, 2_000 * failures));
        },
      );
    };
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [path, loader]);

  if (!path) return null;
  return state.path === path ? state.url : loader.peek(path);
}
