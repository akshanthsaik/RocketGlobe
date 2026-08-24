from sqlalchemy import event


class QueryCounter:
    """Context manager that counts SQL statements executed by a SQLAlchemy Engine."""

    def __init__(self, engine):
        self.engine = engine
        self.count = 0

    def _before_cursor_execute(self, conn, cursor, statement, parameters, context, executemany):
        self.count += 1

    def __enter__(self):
        event.listen(self.engine, "before_cursor_execute", self._before_cursor_execute)
        self.count = 0
        return self

    def __exit__(self, exc_type, exc, tb):
        event.remove(self.engine, "before_cursor_execute", self._before_cursor_execute)
