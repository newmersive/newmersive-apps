# Backend

## Auth seeding
- The service seeds an admin demo user for development and testing: `admin@newmersive.local` with password `admin123`.
- Credentials live only in the in-memory user list; nothing is persisted to disk or a database, and no password hashes are exposed.
