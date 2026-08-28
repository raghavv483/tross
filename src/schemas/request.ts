/**
 * Request envelopes. SPEC.md §1.
 *
 * Unknown body keys are stripped, not rejected. Zod's default object behaviour
 * does exactly that, and `validateBody` replaces `req.body` with the stripped
 * result so a handler cannot read a key that was never declared here.
 */
import { z } from 'zod';

/** The only request body the API accepts. */
export const ProfileRequestSchema = z.object({
  url: z.string().trim().min(1).max(2048),
});

export type ProfileRequest = z.infer<typeof ProfileRequestSchema>;
