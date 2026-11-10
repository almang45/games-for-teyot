import { z } from 'zod';

/**
 * The rooms of the real house, from the denah (`reference/rumah/denah/`). Ids are stable forever:
 * progress, the manifest and layout.json all key on them. A new room is a contract change.
 */
export const ROOM_IDS = [
  // R. TIDUR UTAMA, Lt Atas. M1: tracing + bedtime.
  'kamar-tidur',
  // DAPUR + R. MAKAN, Lt Dasar. M1: counting.
  'dapur',
  // R. TAMU, Lt Dasar. M1: coloring + tidy-up. The start room.
  'ruang-keluarga',
  // Mezzanine 1. Locked in M1.
  'kantor-papa',
  // Mezzanine 2, the small upstairs bedroom. Locked in M1.
  'kamar-anak',
] as const;

export const roomId = z.enum(ROOM_IDS);
export type RoomId = z.infer<typeof roomId>;

/**
 * Storeys in elevation order. The house is split-level, so the number is an index, not a floor
 * count: walking from 0 to 2 passes the mezzanine landing.
 */
export const STOREYS = [
  { id: 0, name: 'lt-dasar', ffl: 0 },
  { id: 1, name: 'mezzanine-1', ffl: 2.4 },
  { id: 2, name: 'lt-atas', ffl: 3.4 },
  { id: 3, name: 'mezzanine-2', ffl: 4.8 },
] as const;

// Spelled out so the type is the literal union; a unit test keeps it equal to STOREYS.
export const storey = z.literal([0, 1, 2, 3]);
export type Storey = z.infer<typeof storey>;

/** What a room hosts. Each activity lives in at most one room, so the hub can route to it. */
export const ACTIVITIES = [
  'tracing',
  'counting',
  'coloring',
  'tidy',
  'bedtime',
  'reading',
  'words',
  'garden',
] as const;

export const activity = z.enum(ACTIVITIES);
export type Activity = z.infer<typeof activity>;
