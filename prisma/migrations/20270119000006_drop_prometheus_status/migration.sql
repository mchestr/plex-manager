/*
  Warnings:

  - You are about to drop the `Prometheus` table. If the table is not empty, all the data it contains will be lost.

*/
-- The wizard no longer has a Prometheus step, which was the last one. An
-- install that stopped on it resumes on the summary, not back on Plex.
UPDATE "Setup" SET "currentStepId" = 'summary' WHERE "currentStepId" = 'prometheus';

-- DropTable
DROP TABLE IF EXISTS "Prometheus";
