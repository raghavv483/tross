/**
 * Raw upstream shape -> normalized domain model.
 *
 * Pure functions, no I/O. Invariant 5: parsers degrade, they do not throw.
 * Everything here tolerates missing, empty and malformed input and returns
 * `null` or `[]`. A parser that throws on a missing section is a bug - the
 * service verifies this function's OUTPUT against `ProfileSchema` instead, so
 * a parser bug surfaces as a clean 502 rather than a malformed 200.
 */
import type { Profile } from '../types/profile.js';
import type { RawProfile } from '../types/raw.js';

import { parseCertifications } from './certifications.js';
import { parseEducation } from './education.js';
import { parseExperience } from './experience.js';
import { parseAbout, parseHeadline, parseLocation, parseName } from './identity.js';
import { parseImages } from './images.js';
import { parseLanguages } from './languages.js';
import { parseSkills } from './skills.js';

/**
 * Composes the section parsers into a whole profile.
 *
 * The declared parameter type is the well-behaved upstream shape; the
 * implementation assumes nothing about what actually arrives.
 */
export function parseRawProfile(raw: RawProfile): Profile {
  return {
    name: parseName(raw),
    headline: parseHeadline(raw),
    location: parseLocation(raw),
    about: parseAbout(raw),

    experience: parseExperience(raw),
    education: parseEducation(raw),
    skills: parseSkills(raw),
    certifications: parseCertifications(raw),
    languages: parseLanguages(raw),
    images: parseImages(raw),
  };
}

export { parsePartialDate, parseRangeEnd, parseRangeStart } from './date.js';
export { parseCertifications } from './certifications.js';
export { parseEducation } from './education.js';
export { parseExperience } from './experience.js';
export { parseAbout, parseHeadline, parseLocation, parseName } from './identity.js';
export { parseImages } from './images.js';
export { parseLanguages } from './languages.js';
export { parseSkills } from './skills.js';
export { firstText, joinText, toNullableText } from './text.js';
