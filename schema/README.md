# Schema

**Status:** Normative. Licensed MIT, deliberately, and not under the repository's CC-BY-ND.

`v1/saga.schema.json` is the normative JSON schema for SAGA.

## Why this directory is MIT when the rest of the repository is not

The specification prose is CC-BY-ND 4.0 so that nobody publishes a modified SAGA standard under
the same name. A schema is different in kind: it is a machine-readable interface that
implementations embed, extend and ship. Under a no-derivatives clause, an implementation that
adapts or extends the schema is in a grey area, which would obstruct exactly the ecosystem the
specification exists to enable.

So the schema is MIT. Copy it, embed it, extend it, ship it. What you may not do is publish a
changed version of the specification prose and call it SAGA.

This split follows the practice of standards bodies that keep normative prose under a
no-derivatives licence while releasing machine-readable artifacts permissively.
