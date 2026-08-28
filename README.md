# RocketGlobe

A desktop app that shows global rocket launch activity on a globe: upcoming launches, launch pads, agencies, and rockets, plus a history player to scrub through decades of spaceflight. Data comes from a local copy of [Launch Library 2](https://ll.thespacedevs.com/), synced in the background. No account, no cloud service, nothing but a local file.

## Download

Grab the latest installer from the [Releases page](../../releases/latest). Windows only for now. Run it, launch the app, nothing else to set up.

> **Note:** the installer isn't code-signed yet, so Windows may show a "Windows protected your PC" prompt. Click **More info → Run anyway**.

## What it does

- **Globe view**: pads and agencies plotted on a flat, schematic globe, colored by launch activity.
- **Launches, pads, rockets, agencies**: browse and filter every entity in the local database.
- **Timeline**: scrub or auto-play through launch history, camera following along.
- **Background sync**: pulls new launches from Launch Library 2 in the background.

## Building from source

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Data source

Launch data comes from [The Space Devs' Launch Library 2 API](https://ll.thespacedevs.com/). RocketGlobe is not affiliated with The Space Devs.

## License

[MIT](LICENSE)
