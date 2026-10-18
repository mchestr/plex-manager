-- P0.20: the roster clean-up nulls the prompt and response of Rewind,
-- playground and prompt-test LLMUsage rows, which held other members' names
-- and watch time (RWP-01).
-- AlterTable
ALTER TABLE "LLMUsage" ALTER COLUMN "prompt" DROP NOT NULL,
ALTER COLUMN "response" DROP NOT NULL;
