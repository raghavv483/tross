/**
 * Apify Actor output -> internal `RawProfile`.
 *
 * Targets `harvestapi/linkedin-profile-scraper`, mapping onto the same
 * `RawProfile` shape the fixtures use so every existing parser and the schema
 * verification in `ProfileService` run unchanged. Nothing in `src/parsers/` or
 * `src/types/` is modified to accommodate this provider.
 *
 * Shape differences absorbed here:
 *
 *   1. `experience[]` is FLAT - one entry per role, no company grouping - so
 *      each entry becomes a group holding exactly one element. A mechanical
 *      wrapper, not a reconstruction of grouping.
 *   2. Dates are STRUCTURED objects: `{ month: "Sep", year: 2024 }` or
 *      `{ year: 2023 }`. The month arrives as an English abbreviation and is
 *      converted to its number, producing the `{ month, year }` that
 *      `parsePartialDate` already consumes. The `PartialDate` regex is not
 *      loosened.
 *   3. `endDate: { text: "Present" }` is the provider stating the role is
 *      current. It carries no date, so it maps to a null end plus an explicit
 *      `isCurrent`, rather than being inferred from the missing end.
 *   4. Images arrive as a `sizes[]` array of real renditions, so width and
 *      height are carried through rather than nulled.
 *
 * Ignored deliberately - not part of the domain schema: `moreProfiles`,
 * `interests`, `featured`, `peopleAlsoViewed`, `profileActions`, `topSkills`.
 */
import type {
  RawCertification,
  RawDate,
  RawEducation,
  RawImageArtifact,
  RawLanguage,
  RawPicture,
  RawPositionGroup,
  RawProfile,
  RawSkill,
} from '../types/raw.js';

import { isRecord, readPath, readProperty, toArray } from '../parsers/guards.js';

/** Trims to non-empty text, or null. Mirrors the parser's text rule. */
function toText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** First value that yields usable text. */
function firstText(...values: readonly unknown[]): string | null {
  for (const value of values) {
    const text = toText(value);
    if (text !== null) return text;
  }
  return null;
}

/** English month abbreviations, as the provider emits them. */
const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** `"Sep"` -> `9`. Tolerates a full month name or an already-numeric month. */
export function toMonthNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
  }

  const text = toText(value);
  if (text === null) return null;

  const numeric = Number(text);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;

  return MONTHS[text.slice(0, 3).toLowerCase()] ?? null;
}

/**
 * `{ month: "Sep", year: 2024 }` -> `{ month: 9, year: 2024 }`.
 * `{ year: 2023 }` -> `{ year: 2023 }`.
 * `{ text: "Present" }` -> null, since it carries no date.
 */
export function toRawDate(value: unknown): RawDate | null {
  if (!isRecord(value)) return null;

  const year = readProperty(value, 'year');
  if (typeof year !== 'number' || !Number.isInteger(year)) return null;

  const month = toMonthNumber(readProperty(value, 'month'));
  return month === null ? { year } : { month, year };
}

/** The provider's marker for an ongoing role. */
const PRESENT = 'present';

function isPresent(endDate: unknown): boolean {
  return toText(readProperty(endDate, 'text'))?.toLowerCase() === PRESENT;
}

/**
 * `isCurrent` straight from the provider:
 *   - `endDate.text === "Present"` -> true
 *   - a real end date              -> false
 *   - nothing at all               -> null, so the parser infers from dates
 */
function resolveIsCurrent(endDate: unknown): boolean | null {
  if (isPresent(endDate)) return true;
  if (toRawDate(endDate) !== null) return false;
  return null;
}

/**
 * `experience[]` is the full history. `currentPosition[]` is a subset of it
 * and is deliberately ignored - mapping both would duplicate the current role.
 */
function mapExperience(items: readonly unknown[]): RawPositionGroup[] {
  const groups: RawPositionGroup[] = [];

  for (const item of items) {
    if (!isRecord(item)) continue;

    const endDate = readProperty(item, 'endDate');

    groups.push({
      companyName: toText(readProperty(item, 'companyName')),
      elements: [
        {
          isCurrent: resolveIsCurrent(endDate),
          title: toText(readProperty(item, 'position')),
          description: toText(readProperty(item, 'description')),
          locationName: toText(readProperty(item, 'location')),
          dateRange: {
            start: toRawDate(readProperty(item, 'startDate')),
            // "Present" is a claim about the present, not a date.
            end: toRawDate(endDate),
          },
        },
      ],
    });
  }

  return groups;
}

/**
 * `degree` and `fieldOfStudy` are separate fields on this Actor, so there is
 * no combined subtitle to split and no `"null, null"` sentinel to guard.
 */
function mapEducation(items: readonly unknown[]): RawEducation[] {
  const educations: RawEducation[] = [];

  for (const item of items) {
    if (!isRecord(item)) continue;

    educations.push({
      schoolName: toText(readProperty(item, 'schoolName')),
      degreeName: toText(readProperty(item, 'degree')),
      fieldOfStudy: toText(readProperty(item, 'fieldOfStudy')),
      description: toText(readProperty(item, 'description')),
      dateRange: {
        start: toRawDate(readProperty(item, 'startDate')),
        end: toRawDate(readProperty(item, 'endDate')),
      },
    });
  }

  return educations;
}

/** Skills are `{ name }`; some also carry `positions`, which is not mapped. */
function mapSkills(items: readonly unknown[]): RawSkill[] {
  const skills: RawSkill[] = [];

  for (const item of items) {
    const name = toText(readProperty(item, 'name'));
    if (name === null) continue;
    skills.push({ name });
  }

  return skills;
}

/**
 * `certifications` and `languages` are real arrays on this Actor but were
 * EMPTY in the capture, so their inner key names are inferred. The contract
 * they are held to is "produces [] and never throws"; revisit against a
 * profile that populates them.
 */
function mapCertifications(items: readonly unknown[]): RawCertification[] {
  const certifications: RawCertification[] = [];

  for (const item of items) {
    if (!isRecord(item)) continue;

    certifications.push({
      name: firstText(readProperty(item, 'name'), readProperty(item, 'title')),
      authority: firstText(
        readProperty(item, 'issuedBy'),
        readProperty(item, 'authority'),
        readProperty(item, 'subtitle'),
      ),
      licenseNumber: firstText(
        readProperty(item, 'credentialId'),
        readProperty(item, 'licenseNumber'),
      ),
      dateRange: {
        start:
          toRawDate(readProperty(item, 'issueDate')) ?? toRawDate(readProperty(item, 'startDate')),
        end: null,
      },
    });
  }

  return certifications;
}

/** Inferred alongside `mapCertifications` - see the note there. */
function mapLanguages(items: readonly unknown[]): RawLanguage[] {
  const languages: RawLanguage[] = [];

  for (const item of items) {
    if (!isRecord(item)) continue;

    languages.push({
      name: firstText(readProperty(item, 'name'), readProperty(item, 'title')),
      proficiency: firstText(
        readProperty(item, 'proficiency'),
        readProperty(item, 'caption'),
        readProperty(item, 'subtitle'),
      ),
    });
  }

  return languages;
}

/**
 * Pictures arrive as a `sizes[]` array of real renditions, each with its own
 * dimensions. Every rendition is carried through so a consumer can pick one
 * without parsing the URL - which is why `images[]` reports width and height.
 *
 * Falls back to the single top-level `url` when `sizes` is absent.
 */
function toPicture(picture: unknown): RawPicture | null {
  if (!isRecord(picture)) return null;

  const artifacts: RawImageArtifact[] = [];

  for (const size of toArray(readProperty(picture, 'sizes'))) {
    if (!isRecord(size)) continue;

    const url = toText(readProperty(size, 'url'));
    if (url === null) continue;

    const width = readProperty(size, 'width');
    const height = readProperty(size, 'height');

    artifacts.push({
      fileIdentifyingUrlPathSegment: url,
      width: typeof width === 'number' ? width : null,
      height: typeof height === 'number' ? height : null,
    });
  }

  if (artifacts.length === 0) {
    const single = toText(readProperty(picture, 'url'));
    if (single === null) return null;
    artifacts.push({ fileIdentifyingUrlPathSegment: single, width: null, height: null });
  }

  // The URLs are absolute, which the existing image parser already handles
  // without a root URL.
  return { displayImageReference: { vectorImage: { rootUrl: null, artifacts } } };
}

/**
 * Fields that identify an item as a profile rather than an error blob.
 *
 * This Actor returns no `fullName`, so the name check is on the first/last
 * pair. All of these are genuinely present in real output.
 */
export const PROFILE_IDENTIFYING_KEYS = ['publicIdentifier', 'linkedinUrl'] as const;

/**
 * Confirms an item is a profile object rather than an error blob or an empty
 * shape. Deliberately stricter than "is it an object": a provider error blob
 * carries none of these keys and is still rejected.
 *
 * A missing `experience`, `skills` or `education` is NOT malformed - those
 * legitimately vary between profiles and map to `[]`.
 */
export function isApifyProfileItem(item: unknown): item is Record<string, unknown> {
  if (!isRecord(item)) return false;

  const hasIdentifier = PROFILE_IDENTIFYING_KEYS.some((key) => {
    const value = item[key];
    return typeof value === 'string' && value.trim().length > 0;
  });

  if (hasIdentifier) return true;

  // No fullName on this Actor, so either half of the name will do.
  return toText(item['firstName']) !== null || toText(item['lastName']) !== null;
}

/**
 * Maps one verified Apify item onto `RawProfile`.
 *
 * Call `isApifyProfileItem` first: this function assumes the item has already
 * been confirmed to be a profile, and degrades every individual field rather
 * than throwing.
 */
export function mapApifyProfile(item: Record<string, unknown>): RawProfile {
  return {
    // This Actor sends no fullName, so the domain name is the joined pair -
    // which is exactly what the existing name parser does with these two.
    firstName: toText(readProperty(item, 'firstName')),
    lastName: toText(readProperty(item, 'lastName')),
    headline: toText(readProperty(item, 'headline')),
    summary: toText(readProperty(item, 'about')),

    /**
     * Location is an object. `linkedinText` is the fuller, human-facing form
     * ("Bharatpur, Rajasthan, India"); the parsed text is the fallback. It
     * goes in whole, with the country half left absent, so the existing join
     * emits it verbatim and never a stray separator.
     */
    geoLocationName: firstText(
      readPath(item, 'location', 'linkedinText'),
      readPath(item, 'location', 'parsed', 'text'),
    ),
    geoCountryName: null,

    positionGroups: mapExperience(toArray(readProperty(item, 'experience'))),
    educations: mapEducation(toArray(readProperty(item, 'education'))),
    skills: mapSkills(toArray(readProperty(item, 'skills'))),
    certifications: mapCertifications(toArray(readProperty(item, 'certifications'))),
    languages: mapLanguages(toArray(readProperty(item, 'languages'))),

    profilePicture: toPicture(readProperty(item, 'profilePicture')),
    backgroundImage: toPicture(readProperty(item, 'coverPicture')),
  };
}
