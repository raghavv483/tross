/**
 * Images. SPEC.md §2.
 *
 * An artifact's URL is only meaningful against its vector image's root URL:
 * `url` is `rootUrl + fileIdentifyingUrlPathSegment`, and an artifact with no
 * path segment is dropped rather than emitted as a bare root URL.
 *
 * Deviation from the brief, recorded in SPEC §2: `width` and `height` are
 * carried through. A consumer choosing between a 100 px and an 800 px
 * rendition should not have to parse the URL to do it.
 */
import type { ImageType, ProfileImage } from '../types/profile.js';

import { isRecord, readPath, readProperty, toArray } from './guards.js';
import { toNullableText } from './text.js';

/** Dimensions are only reported when they are genuinely usable numbers. */
function toNullableDimension(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

/**
 * Upstream wraps a vector image in a reference envelope in some payloads and
 * exposes it directly in others. Both shapes are accepted.
 */
function readVectorImage(picture: unknown): unknown {
  return readPath(picture, 'displayImageReference', 'vectorImage') ?? readProperty(picture, 'vectorImage');
}

function parsePicture(picture: unknown, type: ImageType): ProfileImage[] {
  const vectorImage = readVectorImage(picture);
  if (!isRecord(vectorImage)) return [];

  const rootUrl = toNullableText(readProperty(vectorImage, 'rootUrl'));
  const images: ProfileImage[] = [];

  for (const artifact of toArray(readProperty(vectorImage, 'artifacts'))) {
    if (!isRecord(artifact)) continue;

    const segment = toNullableText(readProperty(artifact, 'fileIdentifyingUrlPathSegment'));

    // No path segment - dropped.
    if (segment === null) continue;

    /**
     * Extension of the drop rule: with no root URL, concatenation would yield
     * a relative path that no consumer can fetch. A URL that cannot be
     * dereferenced is worse than an absent one, so it is dropped too - unless
     * the segment is already absolute, in which case it stands on its own.
     */
    if (rootUrl === null && !ABSOLUTE_URL_PATTERN.test(segment)) continue;

    images.push({
      url: rootUrl === null ? segment : `${rootUrl}${segment}`,
      type,
      width: toNullableDimension(readProperty(artifact, 'width')),
      height: toNullableDimension(readProperty(artifact, 'height')),
    });
  }

  return images;
}

export function parseImages(raw: unknown): ProfileImage[] {
  return [
    ...parsePicture(readProperty(raw, 'profilePicture'), 'profile'),
    ...parsePicture(readProperty(raw, 'backgroundImage'), 'background'),
  ];
}
