import { isAxiosError } from 'axios'
import type { ApiErrorBody } from '@/types/auth'

const GENERIC_MESSAGE = 'Something went wrong. Please try again.'
const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.'

/**
 * The backend's exception handlers always return {"error": "safe message"}
 * (see backend/app/core/exceptions.py), so it's safe to display that string
 * directly -- it was already written to be user-facing. Anything else
 * (network failure, unexpected shape) falls back to a generic message
 * rather than surfacing raw error/stack details to the user.
 */
export function getApiErrorMessage(error: unknown): string {
  if (isAxiosError<ApiErrorBody>(error)) {
    if (!error.response) return NETWORK_MESSAGE
    return error.response.data?.error || GENERIC_MESSAGE
  }
  return GENERIC_MESSAGE
}
