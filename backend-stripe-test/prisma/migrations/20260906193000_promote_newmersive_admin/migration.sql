DO $$
DECLARE
  matching_users INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO matching_users
  FROM "User"
  WHERE LOWER("email") = 'newmersive@gmail.com'
    AND "deletedAt" IS NULL;

  IF matching_users <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active newmersive@gmail.com account, found %', matching_users;
  END IF;

  UPDATE "User"
  SET
    "role" = 'admin',
    "status" = 'active',
    "failedLoginCount" = 0,
    "lastFailedLoginAt" = NULL,
    "lockedUntil" = NULL
  WHERE LOWER("email") = 'newmersive@gmail.com'
    AND "deletedAt" IS NULL;
END $$;
