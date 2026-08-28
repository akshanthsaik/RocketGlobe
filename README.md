# RocketGlobe

A desktop app that shows global rocket launch activity on a globe — upcoming launches, launch pads, agencies, and rockets, plus a history player you can scrub through decades of spaceflight.

RocketGlobe reads its data from a local copy of the [Launch Library 2](https://ll.thespacedevs.com/) database, kept in sync in the background. Once installed, it runs entirely offline except for that sync — no account, no cloud service, nothing but a local file on your machine.

## Download

Grab the latest installer from the [Releases page](../../releases/latest). Windows only for now.

Run the installer, launch the app. No separate Python, Rust, or database setup needed — everything required is bundled.

> **Note:** the installer isn't code-signed yet, so Windows may show a "Windows protected your PC" prompt on first run. Click **More info → Run anyway** to continue. This is normal for a small, freshly-published app and isn't a sign anything's wrong.

## What it does

- **Globe view** — pads and agencies plotted on a flat, schematic globe (no imagery tiles, so it works with zero network access beyond the data sync itself), colored by launch activity.
- **Launches, pads, rockets, agencies** — browse and filter every entity in the local database, with search, status, country, orbit, and schedule filters.
- **Timeline** — scrub or auto-play through launch history from the first tracked launch up to today, with the camera following along.
- **Background sync** — pulls new and updated launches from Launch Library 2 without blocking the UI, with built-in handling for LL2's rate limits.

## Building from source

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for architecture, the data model, the API surface, and how to set up a local dev environment.

## Data source

Launch data comes from [The Space Devs' Launch Library 2 API](https://ll.thespacedevs.com/). RocketGlobe is not affiliated with The Space Devs.
