import { orchestrator } from '../lib/ai/model-orchestrator';

// Fix: Declared Jest globals to resolve "Cannot find name" errors in test environment
declare var describe: any;
declare var it: any;
declare var expect: any;

describe('Model Orchestrator Routing', () => {
  it('should select Gemini for PDF parsing by default', async () => {
    const model = await orchestrator.selectModel('pdf_parse', 1000);
    expect(model).toBe('gemini');
  });

  it('should select Cerebras for fast RAG queries', async () => {
    const model = await orchestrator.selectModel('rag_query', 500);
    expect(model).toBe('cerebras');
  });
});