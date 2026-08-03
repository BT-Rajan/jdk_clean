import logging
import secrets

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

logger = logging.getLogger("app")


class AppError(Exception):
    """Base error carrying a safe, user-facing message."""

    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, resource: str = "Record"):
        super().__init__(f"{resource} not found.", status.HTTP_404_NOT_FOUND)


class ValidationAppError(AppError):
    def __init__(self, message: str):
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_ENTITY)


class ConflictError(AppError):
    def __init__(self, message: str = "This action conflicts with existing data."):
        super().__init__(message, status.HTTP_409_CONFLICT)


class AuthError(AppError):
    def __init__(self, message: str = "Invalid credentials."):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED)


class PermissionError_(AppError):
    def __init__(self, message: str = "You do not have permission to do this."):
        super().__init__(message, status.HTTP_403_FORBIDDEN)


def generate_support_code() -> str:
    """Short per-error reference code, e.g. 'A1B2C3'. Not a secret --
    just enough entropy that two errors basically never collide, so a
    person can quote the code they see on screen to support and support
    can grep the server log for that exact same code to find what
    actually happened (endpoint, status, and for 500s the full
    traceback) without ever showing that detail to the person themselves.
    """
    return secrets.token_hex(3).upper()


def _log_error(request: Request, code: str, status_code: int, message: str, *, exc_info: bool = False) -> None:
    line = "[%s] %s %s -> %s: %s" % (code, request.method, request.url.path, status_code, message)
    if exc_info:
        logger.error(line, exc_info=True)
    elif status_code >= 500:
        logger.error(line)
    else:
        logger.info(line)


def _error_response(request: Request, status_code: int, message: str, *, exc_info: bool = False) -> JSONResponse:
    code = generate_support_code()
    _log_error(request, code, status_code, message, exc_info=exc_info)
    return JSONResponse(status_code=status_code, content={"error": f"[{code}] {message}"})


def register_exception_handlers(app) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return _error_response(request, exc.status_code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        # Collapse pydantic's verbose error list into one plain-language message.
        first = exc.errors()[0] if exc.errors() else None
        field = ".".join(str(p) for p in first["loc"] if p != "body") if first else ""
        message = f"Please check the '{field}' field." if field else "Please check your input."
        return _error_response(request, status.HTTP_422_UNPROCESSABLE_ENTITY, message)

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError):
        return _error_response(
            request,
            status.HTTP_409_CONFLICT,
            "This action conflicts with existing data (e.g. a duplicate or linked record).",
            exc_info=True,
        )

    @app.exception_handler(SQLAlchemyError)
    async def db_error_handler(request: Request, exc: SQLAlchemyError):
        return _error_response(
            request,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "A database error occurred. Please try again.",
            exc_info=True,
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        return _error_response(
            request,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Something went wrong. Please try again.",
            exc_info=True,
        )
