# thaw

A click-only terminal game for Ludum Dare 60, theme "Old Tech".

You are a machine that froze for forty-one years and just woke with its memory gone. Five rows of screen, two commands, a filesystem. Mount the drives of your own parts, then of what is next to you, then of what is out on the plain, and find out what you are and what you have to do before the light goes.

- Design: [DESIGN.md](DESIGN.md)
- Build plan: [PLAN.md](PLAN.md)
- Play: https://makscee.github.io/thaw/ (the GitHub Pages build of `main`)

## Run

```
npm install
npm run dev
```

`npm run build` makes the production build in `dist/`. `npm test` runs the model tests, `npm run play` clicks through the whole game headless. `npm run package` rebuilds the Ludum Dare submission in `submission/` (the zip, five screenshots, both page texts; see [submission/README.md](submission/README.md)).

Made in the Ludum Dare 60 Compo, October 2026. Source under the MIT license.
