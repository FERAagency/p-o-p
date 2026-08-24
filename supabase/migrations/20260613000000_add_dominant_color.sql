-- Adds a per-painting dominant colour (hex, e.g. '#7a6a3c').
-- Used by the gallery for two things:
--   1. the hover "color-glow" — each card casts a soft shadow in its own colour
--   2. an LQIP placeholder — this colour fills the card while the image loads,
--      so there's no blank flash and no layout jump.
-- Nullable: the gallery falls back to a neutral tone when it's unset.

alter table public.paintings
  add column if not exists dominant_color text;
