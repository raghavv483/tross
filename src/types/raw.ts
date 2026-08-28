/**
 * The raw upstream shape.
 *
 * This file deliberately models the ugly reality a profile source returns:
 * dates split into `{ month, year }`, positions grouped by company, images as
 * artifacts behind a root URL, and every single field optional or nullable.
 *
 * It is intentionally NOT the public contract — `src/types/profile.ts` is.
 * Keeping the two apart is what gives the parser real work to do and stops the
 * public API from inheriting an upstream shape. If these two ever collapse into
 * one type, the abstraction has stopped earning its keep.
 *
 * These are structural hints for the parser, not a runtime guarantee. A source
 * can hand back anything; everything in `src/parsers/` must tolerate missing,
 * empty and malformed input and degrade to `null` / `[]` rather than throw.
 */

/** A date that may know only a year, or nothing at all. */
export interface RawDate {
  readonly day?: number | null;
  readonly month?: number | null;
  readonly year?: number | null;
}

export interface RawDateRange {
  readonly start?: RawDate | null;
  readonly end?: RawDate | null;
}

/** One rendition of an image. Its URL is only meaningful against a root URL. */
export interface RawImageArtifact {
  readonly width?: number | null;
  readonly height?: number | null;
  /** Appended to the owning `RawVectorImage.rootUrl`. Absent ⇒ artifact dropped. */
  readonly fileIdentifyingUrlPathSegment?: string | null;
  readonly expiresAt?: number | null;
}

/** A set of artifacts sharing one root URL. */
export interface RawVectorImage {
  readonly rootUrl?: string | null;
  readonly artifacts?: readonly (RawImageArtifact | null | undefined)[] | null;
}

/** Upstream wraps vector images in a reference envelope. Both shapes appear. */
export interface RawImageReference {
  readonly vectorImage?: RawVectorImage | null;
}

export interface RawPicture {
  readonly displayImageReference?: RawImageReference | null;
  readonly vectorImage?: RawVectorImage | null;
}

export interface RawCompany {
  readonly name?: string | null;
  readonly universalName?: string | null;
  readonly industries?: readonly (string | null | undefined)[] | null;
}

/** A single role inside a position group. */
export interface RawPosition {
  readonly title?: string | null;
  readonly description?: string | null;
  readonly locationName?: string | null;
  readonly companyName?: string | null;
  readonly company?: RawCompany | null;
  readonly dateRange?: RawDateRange | null;
}

/**
 * Roles are grouped by company upstream. One group holding N roles must
 * flatten to N `experience` entries, each carrying the group's company.
 * A group whose `elements` is empty is dropped entirely.
 */
export interface RawPositionGroup {
  readonly companyName?: string | null;
  readonly company?: RawCompany | null;
  readonly dateRange?: RawDateRange | null;
  readonly elements?: readonly (RawPosition | null | undefined)[] | null;
}

export interface RawSchool {
  readonly name?: string | null;
}

export interface RawEducation {
  readonly schoolName?: string | null;
  readonly school?: RawSchool | null;
  readonly degreeName?: string | null;
  readonly fieldOfStudy?: string | null;
  readonly description?: string | null;
  readonly dateRange?: RawDateRange | null;
}

export interface RawSkill {
  readonly name?: string | null;
}

export interface RawCertification {
  readonly name?: string | null;
  readonly authority?: string | null;
  readonly licenseNumber?: string | null;
  readonly dateRange?: RawDateRange | null;
}

export interface RawLanguage {
  readonly name?: string | null;
  readonly proficiency?: string | null;
}

/** What a `ProfileSource` returns. Every field is optional. */
export interface RawProfile {
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly headline?: string | null;
  readonly summary?: string | null;

  /** Location arrives in halves; either may be absent. */
  readonly geoLocationName?: string | null;
  readonly geoCountryName?: string | null;

  readonly positionGroups?: readonly (RawPositionGroup | null | undefined)[] | null;
  readonly educations?: readonly (RawEducation | null | undefined)[] | null;
  readonly skills?: readonly (RawSkill | null | undefined)[] | null;
  readonly certifications?: readonly (RawCertification | null | undefined)[] | null;
  readonly languages?: readonly (RawLanguage | null | undefined)[] | null;

  readonly profilePicture?: RawPicture | null;
  readonly backgroundImage?: RawPicture | null;
}
