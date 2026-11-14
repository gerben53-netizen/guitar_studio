import { z } from 'zod';
/** Persisted playback controls shared by configuration and the existing audio engine. */
export const PracticeTransportOptionsSchema = z.strictObject({
  subdivision: z.enum(['none', 'eighth', 'sixteenth']),
  volume: z.number().min(0).max(1),
  mute: z.boolean(),
  ramp: z
    .strictObject({
      enabled: z.boolean(),
      start: z.number().int().min(20).max(300),
      target: z.number().int().min(20).max(300),
      step: z.number().int().min(1).max(40),
      everyBars: z.number().int().min(1).max(100),
    })
    .refine(
      (r) => r.target >= r.start,
      'Doeltempo moet minstens het starttempo zijn',
    ),
});
export const defaultTransportOptions: z.infer<
  typeof PracticeTransportOptionsSchema
> = {
  subdivision: 'none',
  volume: 0.45,
  mute: false,
  ramp: { enabled: false, start: 60, target: 100, step: 5, everyBars: 4 },
};
export const PracticePreferencesInputSchema = z.strictObject({
  goals: z.array(z.string().trim().min(1).max(200)).max(5),
  lastExerciseId: z.string().min(1).max(100).nullable(),
  revision: z.number().int().nonnegative().max(2147483646),
});
export type PracticePreferences = z.infer<
  typeof PracticePreferencesInputSchema
>;
