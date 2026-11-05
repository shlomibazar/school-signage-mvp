-- "אתר חיצוני" content type. Additive: existing rows and values are unchanged.
ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'IFRAME';
