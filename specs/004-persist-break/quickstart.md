# Validation guide

Run npm test, npm run check, npm run lint and npm run build.
Start node scripts/ui-preview.mjs and open its local URL.
Reset the synthetic fixture, start a break, reload and end it. Confirm continued
time and one coffee total. Repeat with a simulated write failure, reload and retry:
the frozen duration should remain fixed and contribute once.
