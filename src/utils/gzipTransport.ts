/**
 * FF-DATA-4a — gzip transport helper for Drive shard/manifest files (folds in the
 * former FF-DATA-3 gzip goal). Uses the browser-native `CompressionStream`/
 * `DecompressionStream` (Streams API) so no new dependency is added (respects
 * `ops/PRODUCT.md`'s $0/mo infra cap and adds no bundle weight).
 *
 * Support: Chromium >= 80 (desktop Chrome/Edge + Android system WebView, which is
 * Chromium-based) and Safari >= 16.4 / iOS >= 16.4 WKWebView. Per the design spec
 * (`ops/research/FF-DATA-4-entity-split-spec.md` §1), FinFlow's iOS target is "not
 * yet a full target" (`ops/PRODUCT.md`), so there is no legacy-iOS floor to design
 * around today.
 *
 * Fallback: feature-detected at both call sites. If `CompressionStream`/
 * `DecompressionStream` are unavailable, `compressJson` writes plain, uncompressed
 * JSON bytes instead of crashing or blocking. Every read path additionally
 * format-sniffs on the way in (checks the gzip magic bytes; on any decompression
 * failure, falls back to a plain-text `JSON.parse` of the raw bytes) so a file
 * written by a browser without `CompressionStream` support stays readable by one
 * that has it, and vice versa.
 *
 * If real-world telemetry later shows a meaningful population without
 * `CompressionStream`, add `pako` as a small dependency behind the same
 * feature-detect branch — not needed to ship this ticket (per the spec).
 */

const COMPRESSION_SUPPORTED =
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** Gzip's fixed 2-byte magic header (RFC 1952 §2.2). */
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

/**
 * Sanity bound on the *decompressed* payload size before it is ever handed to
 * `JSON.parse` — defense-in-depth against a corrupted or maliciously oversized
 * gzip payload exhausting memory on decompress (security review point, spec §7.3).
 * Generous relative to FF-DATA-2's projected sizes (a multi-year, ~800-invoice/
 * 1200-expense/300-client dataset was measured at ~1.06 MB raw); this bound is
 * about the decompressed shard/manifest content, not the whole app, so 50 MB is a
 * very wide margin, not a tight fit to today's data.
 */
const MAX_DECOMPRESSED_BYTES = 50 * 1024 * 1024;

async function gzipCompress(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  // Fire-and-forget write+close; the reader below awaits the full output via the
  // readable side, which is where the real error surfaces (arrayBuffer() below
  // rejects if the stream errored). The writer's own write()/close() promises are
  // explicitly `.catch(() => {})`-guarded here — NOT left as a bare unhandled
  // promise — because an unhandled rejection from a WRITABLE-side promise fires
  // independently of (and usually before) the readable-side rejection; without this
  // guard a malformed/corrupted input can produce an unhandled promise rejection
  // (crashes under Node's default unhandled-rejection policy; a console error in a
  // browser) even though the intended, catchable error still comes through below.
  // Cast to BufferSource: TS's generic Uint8Array<ArrayBufferLike> (from
  // TextEncoder etc.) isn't structurally identical to the DOM lib's
  // Uint8Array<ArrayBuffer>-typed BufferSource, though the runtime value is exactly
  // the byte buffer expected.
  const writeDone = writer.write(bytes as unknown as BufferSource).catch(() => {});
  const closeDone = writer.close().catch(() => {});
  const buffer = await new Response(cs.readable).arrayBuffer();
  await Promise.all([writeDone, closeDone]);
  return new Uint8Array(buffer);
}

async function gzipDecompress(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  // See gzipCompress above — same unhandled-rejection guard on the writable side.
  const writeDone = writer.write(bytes as unknown as BufferSource).catch(() => {});
  const closeDone = writer.close().catch(() => {});
  const buffer = await new Response(ds.readable).arrayBuffer();
  await Promise.all([writeDone, closeDone]);
  if (buffer.byteLength > MAX_DECOMPRESSED_BYTES) {
    throw new Error('gzipTransport: decompressed payload exceeds sanity bound, refusing to use it');
  }
  return new Uint8Array(buffer);
}

function looksGzipped(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1;
}

/**
 * Serializes `data` to JSON and gzip-compresses it into a `Blob` suitable for a
 * Drive `uploadType=media`/`multipart` upload body. Falls back to a plain,
 * uncompressed JSON `Blob` if `CompressionStream` is unavailable or compression
 * itself throws — a save must never fail outright just because compression isn't
 * supported.
 */
export async function compressJson(data: unknown): Promise<Blob> {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);

  if (!COMPRESSION_SUPPORTED) {
    return new Blob([bytes], { type: 'application/json' });
  }

  try {
    const compressed = await gzipCompress(bytes);
    return new Blob([compressed as unknown as BlobPart], { type: 'application/gzip' });
  } catch (error) {
    console.warn('gzipTransport: compression failed, falling back to plain JSON', error);
    return new Blob([bytes], { type: 'application/json' });
  }
}

/**
 * Reads a downloaded `Blob` (a Drive shard/manifest file's raw bytes) back into
 * parsed JSON. Format-sniffs first: if the bytes start with the gzip magic header
 * AND this browser supports `DecompressionStream`, gunzip then parse; otherwise
 * (not gzipped, or gzip support is missing, or decompression fails) parse the raw
 * bytes directly as UTF-8 JSON text. This lets a file written by an
 * older/newer/different browser always be read, whichever compression state
 * produced it.
 *
 * Throws on genuine failure (corrupted/unparseable content, or the sanity-bound
 * rejection above) — callers should catch and treat the result the same way the
 * existing whole-blob `fetchAppState` treats a bad download: degrade to an empty/
 * default shape rather than crash (F-7 "resilient, don't crash" posture).
 */
export async function decompressJson<T = unknown>(blob: Blob): Promise<T> {
  const buffer = await blob.arrayBuffer();
  if (buffer.byteLength > MAX_DECOMPRESSED_BYTES) {
    throw new Error('gzipTransport: payload exceeds sanity bound, refusing to decompress/parse');
  }
  const bytes = new Uint8Array(buffer);

  if (looksGzipped(bytes) && COMPRESSION_SUPPORTED) {
    try {
      const decompressed = await gzipDecompress(bytes);
      const text = new TextDecoder().decode(decompressed);
      return JSON.parse(text) as T;
    } catch (error) {
      console.warn(
        'gzipTransport: gzip decompression failed despite gzip magic bytes; falling back to a direct parse',
        error
      );
    }
  }

  // Not gzipped (a plain-JSON fallback file, or gzip unsupported/decompression
  // failed above) — parse the bytes directly as UTF-8 JSON text.
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

/** Exposed for tests/telemetry — whether this runtime can gzip at all. */
export function isGzipSupported(): boolean {
  return COMPRESSION_SUPPORTED;
}
