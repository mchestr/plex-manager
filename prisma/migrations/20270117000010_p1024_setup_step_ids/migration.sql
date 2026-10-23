-- P10.24: the setup wizard's position becomes a string step id. Stored numbers
-- map by the order the wizard had until now; 10 was written both by the Rewind
-- LLM save (a bug) and by Prometheus, so it resumes on Prometheus. This
-- migration changes no service row.

-- AlterTable
ALTER TABLE "Setup" ADD COLUMN "currentStepId" TEXT NOT NULL DEFAULT 'plex';

UPDATE "Setup" SET "currentStepId" = CASE
  WHEN "currentStep" = 2 THEN 'tautulli'
  WHEN "currentStep" = 3 THEN 'overseerr'
  WHEN "currentStep" = 4 THEN 'sonarr'
  WHEN "currentStep" = 5 THEN 'radarr'
  WHEN "currentStep" = 6 THEN 'discord'
  WHEN "currentStep" = 7 THEN 'llm-chat'
  WHEN "currentStep" = 8 THEN 'llm-rewind'
  WHEN "currentStep" >= 9 THEN 'prometheus'
  ELSE 'plex'
END;

-- AlterTable
ALTER TABLE "Setup" DROP COLUMN "currentStep";
