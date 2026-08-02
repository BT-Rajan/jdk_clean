"""Logs every request in and every response out to a dedicated file,
separate from pm2's general stdout/stderr logs -- built specifically to
answer "did this request even arrive, and what did we actually send
back" with direct evidence, rather than inferring it from curl tests or
browser DevTools that a misbehaving extension can also pollute.

Deliberately does NOT log request bodies -- a login attempt's password
included in a request body would otherwise end up sitting in a plain
log file, which is a real security downside a debugging tool shouldn't
introduce even temporarily. Status code, timing, method, path, client
IP, and the Origin header (the actual browser-sent origin, useful for
telling a genuine browser request apart from curl/Postman/etc.) are
enough to prove whether the backend saw the request at all and what it
answered, without ever writing credentials to disk.
"""

import logging
import time
from pathlib import Path

from fastapi import FastAPI, Request

LOG_DIR = Path(__file__).resolve().parent.parent.parent / "logs"
LOG_FILE = LOG_DIR / "requests.log"

_logger = logging.getLogger("jdk.requests")


def _configure_logger() -> None:
    if _logger.handlers:
        return
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    handler = logging.FileHandler(LOG_FILE)
    handler.setFormatter(logging.Formatter("%(asctime)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
    _logger.addHandler(handler)
    _logger.setLevel(logging.INFO)
    _logger.propagate = False


def install_request_logging(app: FastAPI) -> None:
    """Call once at app startup. Every request gets one line in, one
    line out -- grep the file for a timestamp or path to follow a
    single request's round trip."""
    _configure_logger()

    @app.middleware("http")
    async def _log_requests(request: Request, call_next):
        started = time.monotonic()
        client_host = request.client.host if request.client else "unknown"
        origin = request.headers.get("origin", "-")
        user_agent = request.headers.get("user-agent", "-")

        _logger.info(
            "IN   %s %s  client=%s  origin=%s  ua=%s",
            request.method,
            request.url.path,
            client_host,
            origin,
            user_agent[:80],
        )

        try:
            response = await call_next(request)
        except Exception as exc:
            elapsed_ms = (time.monotonic() - started) * 1000
            _logger.info(
                "ERR  %s %s  client=%s  origin=%s  %.1fms  exception=%s: %s",
                request.method,
                request.url.path,
                client_host,
                origin,
                elapsed_ms,
                type(exc).__name__,
                exc,
            )
            raise

        elapsed_ms = (time.monotonic() - started) * 1000
        cors_header = response.headers.get("access-control-allow-origin", "-")
        _logger.info(
            "OUT  %s %s  client=%s  origin=%s  status=%s  cors_allow_origin=%s  %.1fms",
            request.method,
            request.url.path,
            client_host,
            origin,
            response.status_code,
            cors_header,
            elapsed_ms,
        )
        return response
