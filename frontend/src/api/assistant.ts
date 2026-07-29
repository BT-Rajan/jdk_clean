import { apiClient } from './client'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function sendAssistantMessage(
  message: string,
  history: AssistantMessage[],
): Promise<string> {
  const { data } = await apiClient.post<{ reply: string }>('/api/assistant/chat', {
    message,
    // Mirrors the backend's own cap (MAX_HISTORY in assistant_service.py) --
    // trimming here too keeps the request body small on a long-running
    // drawer session.
    history: history.slice(-10),
  })
  return data.reply
}
