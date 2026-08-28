import { describe, expect, it } from 'vitest';

import {
  parseCertifications,
  parseEducation,
  parseExperience,
  parseImages,
  parseLanguages,
  parseLocation,
  parseName,
  parsePartialDate,
  parseRawProfile,
  parseSkills,
  toNullableText,
} from '../src/parsers/index.js';
import { completeProfile } from '../src/sources/fixtures/completeProfile.js';
import { edgeProfile } from '../src/sources/fixtures/edgeProfile.js';
import { sparseProfile } from '../src/sources/fixtures/sparseProfile.js';
import { ProfileSchema } from '../src/types/profile.js';
import type { RawProfile } from '../src/types/raw.js';

/** Lets a test feed deliberately malformed input past the raw type. */
const asRaw = (value: unknown): RawProfile => value as RawProfile;

describe('SPEC §2 normalization table', () => {
  describe('empty / whitespace-only strings become null, never ""', () => {
    it.each([['', 'empty'], ['   ', 'spaces'], ['\t\n ', 'tabs and newlines']])(
      'normalizes %o to null',
      (input) => {
        expect(toNullableText(input)).toBeNull();
      },
    );

    it('trims surrounding whitespace off a real value', () => {
      expect(toNullableText('  Engineer  ')).toBe('Engineer');
    });

    it('produces no empty strings anywhere in the edge fixture', () => {
      const json = JSON.stringify(parseRawProfile(edgeProfile));
      expect(json).not.toContain('""');
    });
  });

  describe('positions grouped by company are flattened', () => {
    const experience = parseExperience(completeProfile);

    it('yields one entry per role, not one per group', () => {
      expect(experience).toHaveLength(3);
    });

    it('gives the two-role group two entries carrying the group company', () => {
      const tross = experience.filter((entry) => entry.company === 'Tross');
      expect(tross).toHaveLength(2);
      expect(tross.map((entry) => entry.title)).toEqual([
        'Staff Software Engineer',
        'Senior Software Engineer',
      ]);
    });

    it('keeps the dates of each role rather than the group dates', () => {
      expect(experience[0]?.startDate).toBe('2024-07');
      expect(experience[1]?.startDate).toBe('2022-03');
      expect(experience[1]?.endDate).toBe('2024-06');
    });
  });
});

describe('companyName absent falls back to company.name', () => {
  it('resolves the fallback on the complete fixture', () => {
    expect(parseExperience(completeProfile)[2]?.company).toBe('Northwind Analytics');
  });

  it('resolves the fallback on the edge fixture', () => {
    expect(parseExperience(edgeProfile)[0]?.company).toBe('Chaincode Labs');
  });

  it('prefers companyName when both are present', () => {
    const raw = asRaw({
      positionGroups: [
        { companyName: 'Preferred', company: { name: 'Ignored' }, elements: [{ title: 'Dev' }] },
      ],
    });
    expect(parseExperience(raw)[0]?.company).toBe('Preferred');
  });

  it('falls back past an empty companyName', () => {
    const raw = asRaw({
      positionGroups: [
        { companyName: '  ', company: { name: 'Fallback' }, elements: [{ title: 'Dev' }] },
      ],
    });
    expect(parseExperience(raw)[0]?.company).toBe('Fallback');
  });
});

describe('a position group with empty elements is dropped entirely', () => {
  it('drops the empty group in the edge fixture', () => {
    const companies = parseExperience(edgeProfile).map((entry) => entry.company);
    expect(companies).not.toContain('Ghost Company');
  });

  it.each([[[]], [null], [undefined]])('drops a group whose elements is %o', (elements) => {
    const raw = asRaw({ positionGroups: [{ companyName: 'Empty', elements }] });
    expect(parseExperience(raw)).toEqual([]);
  });

  it('skips a null element without dropping its siblings', () => {
    const entries = parseExperience(edgeProfile).filter(
      (entry) => entry.company === 'Partial Holdings',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('Board Member');
  });
});

describe('isCurrent', () => {
  it('is true when a start exists and no end', () => {
    expect(parseExperience(completeProfile)[0]).toMatchObject({
      startDate: '2024-07',
      endDate: null,
      isCurrent: true,
    });
  });

  it('is false when an end exists', () => {
    expect(parseExperience(completeProfile)[1]).toMatchObject({
      endDate: '2024-06',
      isCurrent: false,
    });
  });

  it('is null when there is no date information at all', () => {
    const advisor = parseExperience(edgeProfile).find(
      (entry) => entry.company === 'Undated Ventures',
    );
    expect(advisor).toMatchObject({ startDate: null, endDate: null, isCurrent: null });
  });

  it('is false when only an end date exists', () => {
    const raw = asRaw({
      positionGroups: [
        { companyName: 'X', elements: [{ title: 'T', dateRange: { end: { year: 2020 } } }] },
      ],
    });
    expect(parseExperience(raw)[0]).toMatchObject({ startDate: null, isCurrent: false });
  });
});

describe('image artifacts', () => {
  it('builds url as rootUrl + fileIdentifyingUrlPathSegment', () => {
    expect(parseImages(completeProfile)[0]).toEqual({
      url: 'https://media.example-cdn.test/profile/ada/100_100/ada.jpg',
      type: 'profile',
      width: 100,
      height: 100,
    });
  });

  it('tags profile and background images', () => {
    const images = parseImages(completeProfile);
    expect(images.filter((image) => image.type === 'profile')).toHaveLength(3);
    expect(images.filter((image) => image.type === 'background')).toHaveLength(1);
  });

  it('reads the bare vectorImage envelope as well as displayImageReference', () => {
    const background = parseImages(completeProfile).find((image) => image.type === 'background');
    expect(background?.url).toBe('https://media.example-cdn.test/background/ada/1400_350/cover.jpg');
  });

  it('drops artifacts with no path segment', () => {
    const images = parseImages(edgeProfile);
    expect(images).toHaveLength(1);
    expect(images[0]?.url).toBe(
      'https://media.example-cdn.test/profile/nakamoto/400_400/nakamoto.jpg',
    );
  });

  it('reports null dimensions rather than inventing them', () => {
    expect(parseImages(edgeProfile)[0]).toMatchObject({ width: null, height: null });
  });

  it('never emits a url containing "undefined"', () => {
    for (const image of [...parseImages(completeProfile), ...parseImages(edgeProfile)]) {
      expect(image.url).not.toContain('undefined');
    }
  });
});

describe('skills with no usable name are dropped', () => {
  it('keeps only the named skills in the edge fixture', () => {
    expect(parseSkills(edgeProfile)).toEqual([{ name: 'Cryptography' }, { name: 'Go' }]);
  });

  it('keeps every named skill in the complete fixture', () => {
    expect(parseSkills(completeProfile)).toHaveLength(5);
  });
});

describe('location', () => {
  it('joins city and country when both are present', () => {
    expect(parseLocation(completeProfile)).toBe('London, United Kingdom');
  });

  it('uses whichever half exists when the city is absent', () => {
    expect(parseLocation(sparseProfile)).toBe('United States');
  });

  it('uses whichever half exists when the country is absent', () => {
    expect(parseLocation(asRaw({ geoLocationName: 'Berlin' }))).toBe('Berlin');
  });

  it('is null when neither half exists', () => {
    expect(parseLocation(asRaw({}))).toBeNull();
  });

  it('ignores a whitespace-only half rather than emitting a stray separator', () => {
    expect(parseLocation(edgeProfile)).toBe('Japan');
  });
});

describe('PartialDate', () => {
  it('formats a known month and year as YYYY-MM', () => {
    expect(parsePartialDate({ month: 3, year: 2022 })).toBe('2022-03');
  });

  it('zero-pads a single-digit month', () => {
    expect(parsePartialDate({ month: 9, year: 2019 })).toBe('2019-09');
  });

  it('formats a year-only date as YYYY', () => {
    expect(parsePartialDate({ year: 2019 })).toBe('2019');
  });

  it('never interpolates a missing month', () => {
    expect(parsePartialDate({ year: 2022 })).not.toContain('undefined');
  });

  it.each([[13], [0], [-1], [12.5], ['March'], [null]])(
    'degrades the out-of-range month %o to year-only',
    (month) => {
      expect(parsePartialDate({ month, year: 2021 })).toBe('2021');
    },
  );

  it.each([[undefined], [null], ['not a year'], [{}], [[]], ['2022-03']])(
    'returns null for the unusable input %o',
    (value) => {
      expect(parsePartialDate(value)).toBeNull();
    },
  );

  it('returns null for a month with no year, since a month alone is not expressible', () => {
    expect(parsePartialDate({ month: 6 })).toBeNull();
  });

  it.each([[999], [10000], [0]])('returns null for the out-of-range year %o', (year) => {
    expect(parsePartialDate({ year })).toBeNull();
  });

  it('tolerates numeric strings from a loose upstream', () => {
    expect(parsePartialDate({ month: '07', year: '2024' })).toBe('2024-07');
  });

  it('degrades the out-of-range month in the edge fixture to year-only', () => {
    expect(parseExperience(edgeProfile)[0]).toMatchObject({
      startDate: '2019',
      endDate: '2021',
    });
  });
});

describe('name', () => {
  it('joins first and last', () => {
    expect(parseName(completeProfile)).toBe('Ada Lovelace');
  });

  it('yields the surname alone when the first name is empty', () => {
    expect(parseName(edgeProfile)).toBe('Nakamoto');
  });

  it('yields the first name alone when the surname is absent', () => {
    expect(parseName(asRaw({ firstName: 'Prince' }))).toBe('Prince');
  });

  it('is null when neither half exists', () => {
    expect(parseName(asRaw({ firstName: '  ', lastName: null }))).toBeNull();
  });
});

describe('education, certifications and languages', () => {
  it('falls back from schoolName to school.name', () => {
    expect(parseEducation(completeProfile)[1]?.institution).toBe('Open University');
  });

  it('maps authority to issuer and licenseNumber to credentialId', () => {
    expect(parseCertifications(completeProfile)[0]).toEqual({
      name: 'AWS Certified Solutions Architect - Associate',
      issuer: 'Amazon Web Services',
      issueDate: '2023-05',
      credentialId: 'AWS-ASA-99183',
    });
  });

  it('nulls every empty certification field rather than dropping the entry', () => {
    expect(parseCertifications(edgeProfile)).toEqual([
      { name: null, issuer: null, issueDate: '2018', credentialId: null },
    ]);
  });

  it('keeps a language entry when only one half is usable', () => {
    expect(parseLanguages(edgeProfile)).toEqual([
      { name: 'Japanese', proficiency: null },
      { name: null, proficiency: 'ELEMENTARY' },
    ]);
  });
});

describe('absent sections yield [] and never undefined (SPEC §8 case 2)', () => {
  const parsed = parseRawProfile(sparseProfile);

  it.each([
    ['experience'],
    ['education'],
    ['skills'],
    ['certifications'],
    ['languages'],
    ['images'],
  ] as const)('returns an empty array for %s', (section) => {
    expect(parsed[section]).toEqual([]);
  });

  it('has no undefined value anywhere', () => {
    expect(JSON.stringify(parsed)).not.toContain('undefined');
    for (const value of Object.values(parsed)) {
      expect(value).not.toBeUndefined();
    }
  });

  it('reports every key the schema declares, even when the source omitted it', () => {
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'about',
        'certifications',
        'education',
        'experience',
        'headline',
        'images',
        'languages',
        'location',
        'name',
        'skills',
      ].sort(),
    );
  });
});

describe('invariant 5: parsers degrade, they do not throw', () => {
  const hostile: readonly unknown[] = [
    null,
    undefined,
    'a string',
    42,
    true,
    [],
    {},
    { positionGroups: 'not an array' },
    { positionGroups: [null, 42, 'x', {}] },
    { positionGroups: [{ elements: 'not an array' }] },
    { positionGroups: [{ elements: [null, 42] }] },
    { educations: {}, skills: 7, languages: null, certifications: 'no' },
    { skills: [null, 42, {}, { name: 42 }] },
    { profilePicture: 'not an object' },
    { profilePicture: { displayImageReference: { vectorImage: { artifacts: 'no' } } } },
    { profilePicture: { displayImageReference: { vectorImage: { artifacts: [null, 1] } } } },
    { firstName: 42, lastName: [], headline: {}, summary: [] },
    { positionGroups: [{ elements: [{ dateRange: 'nope' }] }] },
    { positionGroups: [{ elements: [{ dateRange: { start: 'nope', end: 42 } }] }] },
  ];

  it.each(hostile.map((value, index) => [index, value] as const))(
    'survives hostile input #%i and still returns a schema-valid profile',
    (_index, value) => {
      const parsed = parseRawProfile(asRaw(value));
      expect(() => ProfileSchema.parse(parsed)).not.toThrow();
    },
  );

  it('returns a fully empty profile for input that carries nothing usable', () => {
    expect(parseRawProfile(asRaw(null))).toEqual({
      name: null,
      headline: null,
      location: null,
      about: null,
      experience: [],
      education: [],
      skills: [],
      certifications: [],
      languages: [],
      images: [],
    });
  });

  it('drops an unusable image artifact instead of emitting a relative url', () => {
    const raw = asRaw({
      profilePicture: {
        vectorImage: { artifacts: [{ fileIdentifyingUrlPathSegment: '100/x.jpg' }] },
      },
    });
    expect(parseImages(raw)).toEqual([]);
  });

  it('keeps an absolute segment that needs no root url', () => {
    const raw = asRaw({
      profilePicture: {
        vectorImage: { artifacts: [{ fileIdentifyingUrlPathSegment: 'https://cdn.test/x.jpg' }] },
      },
    });
    expect(parseImages(raw)[0]?.url).toBe('https://cdn.test/x.jpg');
  });
});

describe('every fixture parses to a schema-valid profile', () => {
  it.each([
    ['complete-profile', completeProfile],
    ['sparse-profile', sparseProfile],
    ['edge-profile', edgeProfile],
  ] as const)('%s satisfies ProfileSchema', (_slug, fixture) => {
    const result = ProfileSchema.safeParse(parseRawProfile(fixture));
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('produces two Tross experience entries for the complete fixture (SPEC §8 case 1)', () => {
    const parsed = ProfileSchema.parse(parseRawProfile(completeProfile));
    expect(parsed.experience.filter((entry) => entry.company === 'Tross')).toHaveLength(2);
  });
});
