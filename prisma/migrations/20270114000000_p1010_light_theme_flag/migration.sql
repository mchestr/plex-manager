-- P10.10: the light theme ships behind this flag, off by default.
ALTER TABLE "Config" ADD COLUMN "lightThemeEnabled" BOOLEAN NOT NULL DEFAULT false;
