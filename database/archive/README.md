# Archived: the old Supabase setup

These files belong to the Supabase-backed version of Signtext and are kept for
reference only.

- `schema.sql` created the users and translations tables in Postgres the way
  Supabase expected them, ready for row-level security.
- `policies.sql` granted row-level-security policies and storage-bucket rules,
  all keyed on Supabase's `auth.uid()`.

None of this is used by the current backend. Authentication, sessions, and data
now live in `backend/`, a FastAPI service with its own database and versioned
migrations in `backend/migrations/`.