# PERSON_ID_KEY — the birthday identity key

The birthday module matches students and teachers by their external identifier (usually ת״ז)
without storing it. It stores a keyed HMAC-SHA256 of the identifier, bound to the school and to a
key version (`people.identityKey`, `people.identityKeyVersion`), plus the last 3 characters for
display (`people.identityHint`). See `src/lib/people/identity.ts`.

## Rules

- **Required in production.** With `NODE_ENV=production` and no key (or a key shorter than 32
  characters), identity matching is off: requests that include an identifier get a Hebrew 503,
  the server logs one line ("PERSON_ID_KEY is not configured.") without any value, and the admin
  page `/admin/birthdays` shows a warning. People can still be added without an identifier.
  `JWT_SECRET` is never used instead of it in production.
- **Stable for the lifetime of the data.** Do not regenerate it on deployments or restarts. With a
  different key, existing people are no longer matched, and imports would create duplicates.
- **Secret.** Never commit it, print it, or put it in logs, tickets or chat. It lives only in the
  hosting environment (Render → service → Environment) and in the backup below.
- **Development** (`NODE_ENV` ≠ production) uses a fixed key derived from `JWT_SECRET` with a
  warning, so local data stays stable. Do not use real people's data locally.

## Generate, store, back up (once)

1. Generate 32 random bytes, e.g. `openssl rand -base64 32` (or
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
2. Render → the service → Environment → add `PERSON_ID_KEY` with that value → Save. Render restarts
   the service with it; nothing else has to change.
3. Store the same value in the organization's password manager / secrets vault (owner + one backup
   person). Losing it means losing identity matching for all existing people (they would have to be
   matched again from a source that has the identifiers).
4. Check: `/admin/birthdays` shows no "זיהוי לפי מספר זהות אינו מוגדר" warning.

## Rotation (only when the key may have leaked)

Raw identifiers are not stored, so old keys cannot be recomputed without the source data. The
version field allows a gradual, safe rotation:

1. Add the new key as `PERSON_ID_KEY_V2` (code change: `IDENTITY_KEY_VERSION = 2`, read both keys).
2. On every import/sync (which has the raw identifiers), match by the version-1 key; when a person
   is found, rewrite `identityKey` with the version-2 key and set `identityKeyVersion = 2`.
3. Manually entered people with an identifier are re-keyed when an admin re-enters the identifier.
4. When no rows have `identityKeyVersion = 1` (or after an agreed period), remove the old key.

Never replace the value of `PERSON_ID_KEY` in place: that silently breaks matching for everyone.
