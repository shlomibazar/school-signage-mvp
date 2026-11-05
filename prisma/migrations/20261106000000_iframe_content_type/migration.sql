-- "אתר חיצוני" content type. Additive and metadata-only: no table is rewritten and existing rows
-- and values are unchanged. Placed before EMPTY to match the order in schema.prisma.
ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'IFRAME' BEFORE 'EMPTY';
