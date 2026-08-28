/**
 * The normalized domain model — the public contract. SPEC.md §2.
 *
 * Zod is the single source of truth: types are inferred with `z.infer`, never
 * hand-written alongside a schema, and the OpenAPI document is generated from
 * these same schemas.
 *
 * Two shape guarantees a consumer can rely on:
 *   - every scalar is nullable, so a missing value is `null`, never absent;
 *   - every list is always present, possibly empty, so a missing section is
 *     `[]`, never `undefined`.
 *
 * A consumer never has to distinguish "missing key" from "null value".
 */
import { z } from 'zod';

/**
 * `"YYYY-MM"` when month and year are known, `"YYYY"` when only the year is,
 * `null` otherwise. Never a partially-interpolated string such as
 * `"2022-undefined"`; an out-of-range month degrades to year-only.
 */
export const PARTIAL_DATE_PATTERN = /^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/;

export const PartialDateSchema = z
  .string()
  .regex(PARTIAL_DATE_PATTERN, 'Expected "YYYY-MM" or "YYYY"')
  .nullable();

export const ExperienceSchema = z.object({
  company: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  startDate: PartialDateSchema,
  endDate: PartialDateSchema,
  /**
   * `true` when a start exists and no end, `false` when an end exists, and
   * `null` when there is no date information at all.
   */
  isCurrent: z.boolean().nullable(),
});

export const EducationSchema = z.object({
  institution: z.string().nullable(),
  degree: z.string().nullable(),
  fieldOfStudy: z.string().nullable(),
  description: z.string().nullable(),
  startDate: PartialDateSchema,
  endDate: PartialDateSchema,
});

/** `name` is non-nullable — entries with no usable name are dropped upstream. */
export const SkillSchema = z.object({
  name: z.string(),
});

export const CertificationSchema = z.object({
  name: z.string().nullable(),
  issuer: z.string().nullable(),
  issueDate: PartialDateSchema,
  credentialId: z.string().nullable(),
});

export const LanguageSchema = z.object({
  name: z.string().nullable(),
  proficiency: z.string().nullable(),
});

export const IMAGE_TYPES = ['profile', 'background'] as const;

export const ImageTypeSchema = z.enum(IMAGE_TYPES).nullable();

/**
 * `url` is non-nullable: it is `rootUrl + fileIdentifyingUrlPathSegment`, and
 * an artifact with no path segment is dropped rather than emitted with a
 * partial URL.
 *
 * Deviation from the brief: `width` and `height` are included. A consumer
 * choosing between a 100 px and an 800 px rendition should not have to parse
 * the URL to do it.
 */
export const ImageSchema = z.object({
  url: z.string(),
  type: ImageTypeSchema,
  width: z.number().nullable(),
  height: z.number().nullable(),
});

export const ProfileSchema = z.object({
  /** First + last, tolerant of either being absent. */
  name: z.string().nullable(),
  headline: z.string().nullable(),
  /** `"City, Country"`, or whichever half exists, or `null`. */
  location: z.string().nullable(),
  about: z.string().nullable(),

  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  skills: z.array(SkillSchema),
  certifications: z.array(CertificationSchema),
  languages: z.array(LanguageSchema),
  images: z.array(ImageSchema),
});

export type PartialDate = z.infer<typeof PartialDateSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Certification = z.infer<typeof CertificationSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type ImageType = z.infer<typeof ImageTypeSchema>;
export type ProfileImage = z.infer<typeof ImageSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
