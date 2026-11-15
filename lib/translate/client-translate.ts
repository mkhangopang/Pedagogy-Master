'use client';

export interface ClientTranslateResult {
  translatedText: string;
  provider?: string;
  qaApplied?: boolean;
}

interface TranslateStreamParams {
  token: string;
  text: string;
  targetLanguage: 'ur' | 'sd';
  onDraft?: (draftText: string) => void;
  onStatus?: (message: string) => void;
}

async function performStreamingRequest(
  params: TranslateStreamParams
): Promise<ClientTranslateResult> {
  const { token, text, targetLanguage, onDraft, onStatus } = params;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);

  let latestDraft: string | null = null;

  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text,
        targetLanguage,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let errMsg = `Translation failed (HTTP ${res.status}).`;
      try {
        const errJson = await res.json();
        if (errJson?.error) errMsg = errJson.error;
      } catch {
        // Ignore JSON parse error on non-JSON error responses
      }
      throw new Error(errMsg);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!res.body || contentType.includes('application/json')) {
      const data = await res.json();
      if (!data?.translatedText) {
        throw new Error(data?.error || 'Unable to translate output right now.');
      }
      return {
        translatedText: data.translatedText,
        provider: data.provider,
        qaApplied: data.qaApplied,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: ClientTranslateResult | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'status' && typeof event.message === 'string') {
            onStatus?.(event.message);
          } else if (
            event.type === 'draft' &&
            typeof event.translatedText === 'string' &&
            event.translatedText.trim()
          ) {
            latestDraft = event.translatedText;
            onDraft?.(event.translatedText);
          } else if (
            event.type === 'result' &&
            typeof event.translatedText === 'string' &&
            event.translatedText.trim()
          ) {
            finalResult = {
              translatedText: event.translatedText,
              provider: event.provider,
              qaApplied: event.qaApplied,
            };
          } else if (event.type === 'error') {
            throw new Error(event.error || 'Translation failed.');
          }
        } catch (parseErr: any) {
          if (parseErr?.message && parseErr.message !== 'Unexpected end of JSON input') {
            if (!String(parseErr.message).includes('JSON')) {
              throw parseErr;
            }
          }
        }
      }
    }

    if (buffer.trim()) {
      try {
        const tailEvent = JSON.parse(buffer.trim());
        if (tailEvent.type === 'result' && tailEvent.translatedText) {
          finalResult = {
            translatedText: tailEvent.translatedText,
            provider: tailEvent.provider,
            qaApplied: tailEvent.qaApplied,
          };
        } else if (tailEvent.type === 'draft' && tailEvent.translatedText) {
          latestDraft = tailEvent.translatedText;
        } else if (tailEvent.type === 'error') {
          throw new Error(tailEvent.error || 'Translation failed.');
        }
      } catch {
        // Ignore partial trailing line if draft was already received
      }
    }

    if (finalResult) return finalResult;
    if (latestDraft) {
      return {
        translatedText: latestDraft,
        provider: 'google_translate_qa_draft',
        qaApplied: false,
      };
    }

    throw new Error('Unable to translate output right now. Please retry.');
  } catch (err: any) {
    if (latestDraft) {
      return {
        translatedText: latestDraft,
        provider: 'google_translate_qa_draft',
        qaApplied: false,
      };
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function translateContentStream(
  params: TranslateStreamParams
): Promise<ClientTranslateResult> {
  try {
    return await performStreamingRequest(params);
  } catch (firstErr: any) {
    const msg = String(firstErr?.message || '');
    const isTransientNetwork =
      firstErr?.name === 'TypeError' ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('network');

    if (isTransientNetwork) {
      try {
        await new Promise((r) => setTimeout(r, 450));
        return await performStreamingRequest(params);
      } catch (retryErr: any) {
        const retryMsg = String(retryErr?.message || '');
        if (
          retryErr?.name === 'TypeError' ||
          retryMsg.includes('Failed to fetch') ||
          retryMsg.includes('NetworkError')
        ) {
          throw new Error(
            'Connection interrupted while fetching translation. Please check your network and tap again.'
          );
        }
        throw retryErr;
      }
    }

    if (firstErr?.name === 'AbortError') {
      throw new Error('Translation request timed out. Please try again.');
    }

    throw firstErr;
  }
}
