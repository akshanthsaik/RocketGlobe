import sys

if __name__ == "__main__":
    # In a packaged build, run_backend.exe *is* sys.executable - there's no
    # separate python.exe to run `-m app.workers.run_sync_once <run_id>`
    # against (that's how the sync subprocess is spawned in dev). Rather than
    # ship a second frozen binary just for the sync worker, this same exe
    # dispatches on a flag: normally it starts the server, but re-invoked as
    # `run_backend.exe --sync-once <run_id>` it runs one sync and exits.
    if len(sys.argv) >= 3 and sys.argv[1] == "--sync-once":
        from app.workers.run_sync_once import main as sync_once_main

        sys.argv = [sys.argv[0], sys.argv[2]]
        raise SystemExit(sync_once_main())

    import uvicorn

    from app.config import settings
    from app.main import app

    uvicorn.run(
        app,
        host=settings.API_HOST,
        port=settings.API_PORT,
        log_level="info",
        log_config=None,
    )
