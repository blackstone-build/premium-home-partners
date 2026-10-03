// Shared camera/photo types. Pure (no React Native imports).

/** A photo ready to upload: JPEG, long edge at most MAX_EDGE px. */
export interface CapturedPhoto {
  /** Native: a file:// URI in the cache directory. Web: a data: URI. Usable as an <Image> source. */
  uri: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  /** JPEG bytes as base64, without a `data:` prefix. */
  base64: string;
  /** Web only: the JPEG as a Blob (uploads send this instead of decoding base64). */
  blob?: Blob;
}

export interface CaptureOptions {
  /** Which camera to open. Defaults to the back camera. */
  facing?: 'back' | 'front';
  /** Native only: the eyebrow shown above the viewfinder, e.g. "Replace HVAC filter". */
  title?: string;
}

export interface PhotoCaptureApi {
  /**
   * Native: opens the full-screen camera. Web: opens the file picker (camera on
   * phones). Resolves null when the person cancels. Throws a FriendlyError when
   * the picked file can't be read.
   */
  capture(opts?: CaptureOptions): Promise<CapturedPhoto | null>;
}
