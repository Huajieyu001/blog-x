# Deferred Items

## Plan 01-02 discoveries

- **Migration replay hardening (target: 01-08):** Running the 01-01 SQL migration a second time against an already migrated database ignores duplicate tables/indexes but still fails on the named foreign-key constraint. Plan 01-08 already owns migration concurrency and interruption recovery; add a repeat-run assertion there before local acceptance is complete.
