-- 0009: drop legacy cbd_distance_km() (TRI-78)
--
-- 0008 replaced straight-line CBD distance with cbd_distance_routed(), but
-- deliberately kept cbd_distance_km() so the then-deployed UI kept working
-- until the new client shipped (decision recorded in 0008's header). PR #7
-- merged and the prod deploy was verified 2026-08-04; a repo grep before this
-- migration confirms nothing references the legacy function any more.
-- Dropping the function also drops its grants.

drop function if exists cbd_distance_km(text);
