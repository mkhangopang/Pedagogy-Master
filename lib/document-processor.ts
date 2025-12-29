/**
 * DEPRECATED: Direct document processing is now handled via the unified /api/ai route
 * utilizing Gemini's native multimodal capabilities on the server.
 */
export const processDocument = async () => {
  throw new Error("Use geminiService with /api/ai for document tasks.");
};