-- The reconciliation engine needs to know what time of day a spot was
-- actually contracted to air in order to flag OUT_OF_SLOT deviations.
-- Previously there was no such field, so the engine compared real broadcast
-- times against midnight and flagged nearly every airing as OUT_OF_SLOT.
alter table contracts add column if not exists expected_air_time time;
