import type { RawProfile } from '../../types/raw.js';

/**
 * The nasty one. SPEC.md §7.
 *
 * Exercises, following the normalization table in SPEC §2:
 *   - empty and whitespace-only strings, which become null and never ""
 *   - a position group with an empty `elements` array, dropped entirely
 *   - `companyName` absent, falling back to `company.name`
 *   - a year-only date, which becomes "2019" and never "2019-undefined"
 *   - an out-of-range month, which degrades to year-only
 *   - a position with no date information at all, so `isCurrent` is null
 *   - an unnamed skill, dropped because `skills[].name` is non-nullable
 *   - a surname-only name, so `name` is whichever half exists
 *   - an image artifact with no path segment, dropped
 */
export const edgeProfile: RawProfile = {
  firstName: '',
  lastName: 'Nakamoto',

  headline: '   ',
  summary: '',

  geoLocationName: '  ',
  geoCountryName: 'Japan',

  positionGroups: [
    {
      companyName: 'Ghost Company',
      dateRange: { start: { month: 1, year: 2020 }, end: null },
      elements: [],
    },
    {
      company: { name: 'Chaincode Labs' },
      elements: [
        {
          title: 'Researcher',
          description: '   ',
          locationName: '',
          dateRange: { start: { year: 2019 }, end: { month: 13, year: 2021 } },
        },
      ],
    },
    {
      companyName: 'Undated Ventures',
      elements: [{ title: 'Advisor' }],
    },
    {
      companyName: 'Partial Holdings',
      elements: [null, { title: 'Board Member', dateRange: { start: { month: 4, year: 2023 } } }],
    },
  ],

  educations: [
    {
      schoolName: '',
      degreeName: '  ',
      fieldOfStudy: 'Cryptography',
      description: '',
      dateRange: { start: { year: 2016 }, end: null },
    },
  ],

  skills: [
    { name: 'Cryptography' },
    { name: '' },
    { name: '   ' },
    {},
    { name: 'Go' },
  ],

  certifications: [
    {
      name: '',
      authority: '   ',
      licenseNumber: '',
      dateRange: { start: { year: 2018 } },
    },
  ],

  languages: [
    { name: 'Japanese', proficiency: '' },
    { name: '', proficiency: 'ELEMENTARY' },
  ],

  profilePicture: {
    displayImageReference: {
      vectorImage: {
        rootUrl: 'https://media.example-cdn.test/profile/nakamoto/',
        artifacts: [
          { width: 100, height: 100 },
          { width: 200, height: 200, fileIdentifyingUrlPathSegment: '' },
          { fileIdentifyingUrlPathSegment: '400_400/nakamoto.jpg' },
        ],
      },
    },
  },

  backgroundImage: {
    displayImageReference: {
      vectorImage: {
        rootUrl: '',
        artifacts: [],
      },
    },
  },
};
