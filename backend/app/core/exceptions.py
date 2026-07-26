import logging

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


def _error_response(message: str, status_code: int) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": message})


def register_exception_handlers(app) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return _error_response(exc.message, exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        # Collapse pydantic's verbose error list into one plain-language message.
        first = exc.errors()[0] if exc.errors() else None
        field = ".".join(str(p) for p in first["loc"] if p != "body") if first else ""
        message = f"Please check the '{field}' field." if field else "Please check your input."
        return _error_response(message, status.HTTP_422_UNPROCESSABLE_ENTITY)

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError):
        logger.warning("Integrity error: %s", exc)
        return _error_response(
            "This action conflicts with existing data (e.g. a duplicate or linked record).",
            status.HTTP_409_CONFLICT,
        )

    @app.exception_handler(SQLAlchemyError)
    async def db_error_handler(request: Request, exc: SQLAlchemyError):
        logger.error("Database error: %s", exc)
        return _error_response(
            "A database error occurred. Please try again.", status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error")
        return _error_response(
            "Something went wrong. Please try again.", status.HTTP_500_INTERNAL_SERVER_ERROR
        )
