# Submitting thaw

Everything here comes from `npm run package`: it builds `dist/`, types five short runs on seed 1 in Chromium (some from the `?scene=` stagings), saves a screenshot of each, and zips `dist/` into `thaw.zip`. Rerun it after any fix on `main`, then commit `submission/`.

| File | What |
|---|---|
| `thaw.zip` | the HTML5 build, `index.html` at its root |
| `1-wake.png` | waking blind: the console alone, `listen` |
| `2-pinhole.png` | the pinhole eye and the stepper relay |
| `3-deep.png` | saint's lens and the survey spool, six chunks out |
| `4-fight.png` | a fight: mites and a seraph lamp, nail psalm, mirror ward |
| `5-thaw.png` | the Thaw Engine ending: the light floods, the windows melt |
| `itch-page.md` | the itch.io page text |
| `ld-page.md` | the Ludum Dare entry text |

Deadline: the Compo closes Sunday 22:00 UTC (Monday 01:00 MSK); uploads until 23:00 UTC (02:00 MSK).

## 1. itch.io (first, so the LD page can link it)

1. itch.io, Dashboard, **Create new project**.
2. **Title** `thaw`. **Short description**: `An old machine wakes blind inside a dead god. Every part of you is a module you find.`
3. **Kind of project**: HTML. **Pricing**: No payments (or $0 or donate).
4. **Uploads**: upload `thaw.zip`, tick **This file will be played in the browser**.
5. **Embed options**: viewport 1280 x 720; tick **Fullscreen button**; leave mobile friendly off.
6. **Description**: paste `itch-page.md` below its title (fill the LD link after step 2.6, or leave it out).
7. **Genre** Adventure or Roguelike; tags `ludum-dare-60`, `ludum-dare`, `terminal`, `roguelike`, `dungeon-crawler`.
8. **Screenshots**: the five PNGs. **Cover image**: any of them (itch crops to 630 x 500).
9. **Visibility**: Public, **Save**. Open the page in a private window: `take`, `install pinhole`, and the eye window opens.

## 2. Ludum Dare (ldjam.com)

1. Log in, open the LD60 event page, **Create Entry** (or Join).
2. Event: **Compo**. **Name** `thaw`.
3. **Body**: paste `ld-page.md` without its first line; put the itch URL in its HTML5 line. Upload the five PNGs into the body, and one as the cover.
4. **Links**: **HTML5 (web)** = the itch page URL; **Source Code** = https://github.com/makscee/thaw. Platform: Web.
5. **Grading / opt-outs**: tick **Graphics** and **Audio**. Leave Overall, Fun, Innovation, Theme and Mood in.
6. Tick the Compo confirmations (made solo, in 48 hours, source included), then **Publish**.
7. Back on itch, add the LD entry link to the description.

The button and field names above are from memory of both sites; where one differs, the intent is the same.
