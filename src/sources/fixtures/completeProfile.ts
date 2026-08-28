import type { RawProfile } from '../../types/raw.js';

/**
 * Every section populated. SPEC.md §7.
 *
 * Exercises:
 *   - one company group holding TWO roles, which must flatten to two
 *     `experience` entries that both carry the group's company (SPEC §8 case 1)
 *   - a current role (start, no end) and a past role (start and end)
 *   - a second group whose `companyName` is absent, falling back to
 *     `company.name`
 *   - profile and background images, each with multiple artifacts
 */
export const completeProfile: RawProfile = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  headline: 'Staff Software Engineer at Tross',
  summary:
    'Backend engineer focused on API design, data normalization and the unglamorous parts of reliability.',
  geoLocationName: 'London',
  geoCountryName: 'United Kingdom',

  positionGroups: [
    {
      companyName: 'Tross',
      company: { name: 'Tross', universalName: 'tross', industries: ['Software Development'] },
      dateRange: { start: { month: 3, year: 2022 }, end: null },
      elements: [
        {
          title: 'Staff Software Engineer',
          description:
            'Designed the profile ingestion API and its source abstraction. Led the migration off the legacy enrichment pipeline.',
          locationName: 'London, United Kingdom',
          dateRange: { start: { month: 7, year: 2024 }, end: null },
        },
        {
          title: 'Senior Software Engineer',
          description: 'Built the normalization layer and its test harness.',
          locationName: 'London, United Kingdom',
          dateRange: { start: { month: 3, year: 2022 }, end: { month: 6, year: 2024 } },
        },
      ],
    },
    {
      company: { name: 'Northwind Analytics' },
      dateRange: { start: { month: 9, year: 2019 }, end: { month: 2, year: 2022 } },
      elements: [
        {
          title: 'Software Engineer',
          description: 'Maintained the ETL services behind the customer data platform.',
          locationName: 'Manchester, United Kingdom',
          dateRange: { start: { month: 9, year: 2019 }, end: { month: 2, year: 2022 } },
        },
      ],
    },
  ],

  educations: [
    {
      schoolName: 'University of Manchester',
      degreeName: 'BSc',
      fieldOfStudy: 'Computer Science',
      description: 'First class honours. Dissertation on schema evolution in event streams.',
      dateRange: { start: { month: 9, year: 2015 }, end: { month: 6, year: 2018 } },
    },
    {
      school: { name: 'Open University' },
      degreeName: 'Postgraduate Certificate',
      fieldOfStudy: 'Distributed Systems',
      dateRange: { start: { month: 1, year: 2020 }, end: { month: 12, year: 2020 } },
    },
  ],

  skills: [
    { name: 'TypeScript' },
    { name: 'Node.js' },
    { name: 'API Design' },
    { name: 'PostgreSQL' },
    { name: 'Distributed Systems' },
  ],

  certifications: [
    {
      name: 'AWS Certified Solutions Architect - Associate',
      authority: 'Amazon Web Services',
      licenseNumber: 'AWS-ASA-99183',
      dateRange: { start: { month: 5, year: 2023 }, end: { month: 5, year: 2026 } },
    },
    {
      name: 'Certified Kubernetes Application Developer',
      authority: 'The Linux Foundation',
      licenseNumber: 'CKAD-2021-4471',
      dateRange: { start: { month: 11, year: 2021 }, end: null },
    },
  ],

  languages: [
    { name: 'English', proficiency: 'NATIVE_OR_BILINGUAL' },
    { name: 'French', proficiency: 'PROFESSIONAL_WORKING' },
  ],

  profilePicture: {
    displayImageReference: {
      vectorImage: {
        rootUrl: 'https://media.example-cdn.test/profile/ada/',
        artifacts: [
          { width: 100, height: 100, fileIdentifyingUrlPathSegment: '100_100/ada.jpg' },
          { width: 400, height: 400, fileIdentifyingUrlPathSegment: '400_400/ada.jpg' },
          { width: 800, height: 800, fileIdentifyingUrlPathSegment: '800_800/ada.jpg' },
        ],
      },
    },
  },

  backgroundImage: {
    vectorImage: {
      rootUrl: 'https://media.example-cdn.test/background/ada/',
      artifacts: [
        { width: 1400, height: 350, fileIdentifyingUrlPathSegment: '1400_350/cover.jpg' },
      ],
    },
  },
};
