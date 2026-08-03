import { isAxiosError } from 'axios'
import type { ApiErrorBody } from '@/types/auth'

const GENERIC_MESSAGE = 'Something went wrong. Please try again.'
const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.'

/** Short client-side reference code for the two cases below, where the
 * request never got a response to carry a backend support code (see
 * backend/app/core/exceptions.py) -- same '[XXXXXX]' shape either way,
 * so any error message anywhere in the app can be quoted to support. */
function localCode(): string {
  return Math.random().toString(16).slice(2, 8).toUpperCase()
}

/**
 * The backend's exception handlers always return {"error": "[CODE] safe
 * message"} (see backend/app/core/exceptions.py) -- the code is a
 * support reference logged server-side alongside the full detail, so
 * it's safe to display the whole string directly. Anything else
 * (network failure, unexpected shape) falls back to a generic message
 * with its own client-side code rather than surfacing raw error/stack
 * details to the user.
 */
export function getApiErrorMessage(error: unknown): string {
  if (isAxiosError<ApiErrorBody>(error)) {
    if (!error.response) return `[${localCode()}] ${NETWORK_MESSAGE}`
    return error.response.data?.error || `[${localCode()}] ${GENERIC_MESSAGE}`
  }
  return `[${localCode()}] ${GENERIC_MESSAGE}`
}
