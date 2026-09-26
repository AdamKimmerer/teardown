-- 0003: versions form a tree (docs/decisions.md #55). A refine can start from any version, not
-- only the newest, so each version records the one it was made from. Each also keeps the
-- model's one-line note on what it changed, which the Revisions panel shows as its reply.

alter table document_versions
  add column parent_version_id uuid references document_versions (id) on delete set null;

alter table document_versions
  add column note text;

-- Every refine before this migration was made from the version just before it.
update document_versions v
set parent_version_id = p.id
from document_versions p
where p.document_id = v.document_id
  and p.version_no = v.version_no - 1;

-- Web searches a refine made (billed per call on top of tokens), for "what did this cost".
alter table usage_events
  add column web_searches integer;
