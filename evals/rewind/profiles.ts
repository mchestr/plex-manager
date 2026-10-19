/**
 * The twenty Rewind fixture profiles (design 8.6), one module each under
 * `profiles/`. `generate-fixtures.ts` turns them into the committed JSON.
 *
 * @module evals/rewind/profiles
 */

import type { Profile } from "./profile"
import { creditsRoller } from "./profiles/credits-roller"
import { explorer } from "./profiles/explorer"
import { extreme } from "./profiles/extreme"
import { heavy } from "./profiles/heavy"
import { hostileTitles } from "./profiles/hostile-titles"
import { light } from "./profiles/light"
import { longAndEmailName } from "./profiles/long-and-email-name"
import { longAndNonLatinTitles } from "./profiles/long-and-non-latin-titles"
import { median } from "./profiles/median"
import { nightOwl } from "./profiles/night-owl"
import { noOverseerr } from "./profiles/no-overseerr"
import { postcard } from "./profiles/postcard"
import { premiereChaser } from "./profiles/premiere-chaser"
import { rewatcher } from "./profiles/rewatcher"
import { sevenMinutes } from "./profiles/seven-minutes"
import { singleTitle } from "./profiles/single-title"
import { soloServer } from "./profiles/solo-server"
import { weekendBinger } from "./profiles/weekend-binger"
import { zeroFilms } from "./profiles/zero-films"
import { zeroSeries } from "./profiles/zero-series"

export const PROFILES: Profile[] = [
  heavy,
  median, light, postcard, extreme, sevenMinutes, zeroFilms, zeroSeries, singleTitle, nightOwl, weekendBinger, rewatcher, explorer, creditsRoller, premiereChaser, noOverseerr, soloServer, longAndEmailName, longAndNonLatinTitles, hostileTitles]
