# Presentation screenshots

The three `showcase-*.jpg` files are 960 x 608 presentation cards captured from
the current `FocusOverlayView` and `styles.css`, with English demo tasks and
an Obsidian API fixture. The surrounding canvas is presentation artwork;
window pinning and native transparency are not simulated in these images.

Run `node docs/screenshots/serve-presentation.mjs` from the repository root.
Open one of these local pages in a desktop browser:

- `http://127.0.0.1:4320/?presentation=1&feature=focus`
- `http://127.0.0.1:4320/?presentation=1&feature=subtasks`
- `http://127.0.0.1:4320/?presentation=1&feature=appearance`

The presentation canvas is 1200 x 760 CSS pixels. Capture that top-left area after `body[data-ready="true"]` appears. The connected browser exports these captures at 960 x 608 pixels.
The presentation query uses in-memory storage, so demo settings and tasks do
not read or overwrite browser-saved fixture data. No vault access is used.

The older PNG files and `render.mjs` remain as historical assets.
