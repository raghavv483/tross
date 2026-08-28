/**
 * Zod -> JSON Schema conversion for the OpenAPI document.
 *
 * Every schema here is GENERATED from the schemas validation actually runs on.
 * Nothing is hand-written: if a shape needs to change for the document to read
 * well, the change belongs in this conversion layer, never in
 * `src/schemas/` or `src/types/`, which are the source of truth.
 *
 * Zod 4 inlines everything it converts - no `$defs`, no `$ref`. That is valid
 * but renders as one enormous anonymous blob in Swagger UI, so the conversion
 * hoists the reusable pieces into named components and rewrites the
 * corresponding subtrees to `$ref`s. The result is a browsable model tree.
 */
import { z, type ZodType } from 'zod';

import {
  ErrorResponseSchema,
  HealthResponseSchema,
  ProfileMetaSchema,
  ProfileResponseSchema,
} from '../schemas/response.js';
import { ProfileRequestSchema } from '../schemas/request.js';
import {
  CertificationSchema,
  EducationSchema,
  ExperienceSchema,
  ImageSchema,
  LanguageSchema,
  PartialDateSchema,
  ProfileSchema,
  SkillSchema,
} from '../types/profile.js';

export type JsonSchema = Record<string, unknown>;

const COMPONENT_PATH = '#/components/schemas';

/** A `$ref` pointing at a named component. */
export const refTo = (name: string): JsonSchema => ({ $ref: `${COMPONENT_PATH}/${name}` });

/**
 * Converts one Zod schema and strips the `$schema` dialect marker.
 *
 * OpenAPI 3.1 declares its dialect once at the document level, so repeating it
 * inside every component is noise Swagger UI renders as an extra row.
 */
function convert(schema: ZodType): JsonSchema {
  const converted = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as JsonSchema;
  const { $schema: _dialect, ...rest } = converted;
  return rest;
}

/** Adds a human-readable description without touching the source schema. */
function describe(schema: JsonSchema, description: string): JsonSchema {
  return { ...schema, description };
}

/** Replaces `properties[key]` with a `$ref`, preserving nothing else about it. */
function refProperty(schema: JsonSchema, key: string, componentName: string): JsonSchema {
  const properties = { ...(schema['properties'] as Record<string, JsonSchema>) };
  properties[key] = refTo(componentName);
  return { ...schema, properties };
}

/** Replaces the `items` of an array-valued property with a `$ref`. */
function refArrayItems(schema: JsonSchema, key: string, componentName: string): JsonSchema {
  const properties = { ...(schema['properties'] as Record<string, JsonSchema>) };
  const array = { ...(properties[key] as JsonSchema) };
  array['items'] = refTo(componentName);
  properties[key] = array;
  return { ...schema, properties };
}

/**
 * The named component schemas.
 *
 * Order matters only for readability in the rendered page.
 */
export function buildComponentSchemas(): Record<string, JsonSchema> {
  const partialDate = describe(
    convert(PartialDateSchema),
    'A date known only to month or year precision. "YYYY-MM" when month and year are known, "YYYY" when only the year is, null otherwise. Never a partially-interpolated string, and an out-of-range month degrades to year-only.',
  );

  const experience = describe(
    convert(ExperienceSchema),
    'One role. Upstream groups roles by company; a group holding N roles is flattened into N entries, each carrying the group company. isCurrent is true when a start exists and no end, false when an end exists, and null when there is no date information at all.',
  );

  const education = describe(convert(EducationSchema), 'One education entry.');

  const skill = describe(
    convert(SkillSchema),
    'A skill. `name` is the only non-nullable string in the model: entries with no usable name are dropped rather than emitted as null.',
  );

  const certification = describe(convert(CertificationSchema), 'One certification.');

  const language = describe(convert(LanguageSchema), 'One language and its proficiency.');

  const image = describe(
    convert(ImageSchema),
    'One image rendition. `url` is the artifact root URL joined to its path segment; artifacts with no path segment, or with no way to resolve an absolute URL, are dropped. `width` and `height` are included so a consumer can choose a rendition without parsing the URL.',
  );

  // Point the profile's list properties at the named item components.
  let profile = convert(ProfileSchema);
  profile = refArrayItems(profile, 'experience', 'Experience');
  profile = refArrayItems(profile, 'education', 'Education');
  profile = refArrayItems(profile, 'skills', 'Skill');
  profile = refArrayItems(profile, 'certifications', 'Certification');
  profile = refArrayItems(profile, 'languages', 'Language');
  profile = refArrayItems(profile, 'images', 'ProfileImage');
  profile = describe(
    profile,
    'The normalized profile. Every scalar is nullable and every list is always present, so a consumer never has to distinguish a missing key from a null value.',
  );

  // Point the success envelope at Profile and ProfileMeta.
  let profileResponse = convert(ProfileResponseSchema);
  profileResponse = refProperty(profileResponse, 'data', 'Profile');
  profileResponse = refProperty(profileResponse, 'meta', 'ProfileMeta');

  const errorResponse = describe(
    convert(ErrorResponseSchema),
    'The only error shape the API produces. There is deliberately no field for a stack trace, an upstream payload or a detail array.',
  );

  return {
    ProfileRequest: describe(convert(ProfileRequestSchema), 'The request body.'),
    ProfileResponse: describe(profileResponse, 'A successful profile lookup.'),
    Profile: profile,
    ProfileMeta: describe(
      convert(ProfileMetaSchema),
      'Provenance for this response: which source served it, the canonical URL used as the cache key, and whether it was a cache hit.',
    ),
    Experience: experience,
    Education: education,
    Skill: skill,
    Certification: certification,
    Language: language,
    ProfileImage: image,
    PartialDate: partialDate,
    ErrorResponse: errorResponse,
    HealthResponse: describe(
      convert(HealthResponseSchema),
      'Liveness, the active data source, and the basis on which that source is authorized to retrieve data.',
    ),
  };
}
