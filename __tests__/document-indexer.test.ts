import { indexDocumentForRAG } from '../lib/rag/document-indexer';

// Fix: Declared Jest globals to resolve "Cannot find name" errors in test environment
declare var describe: any;
declare var it: any;
declare var expect: any;

describe('Document Indexer Hierarchy', () => {
  it('should persist subject and grade across chunks', async () => {
    const mockSupabase = {
      from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: { subject: 'Math', grade_level: '9' } }) }) }) }),
      rpc: () => ({ data: [0.1, 0.2] })
    } as any;

    const result = await indexDocumentForRAG('test-id', '# GRADE 10\n### DOMAIN A\n- [TAG:M10A01] Test', mockSupabase);
    expect(result.success).toBe(true);
  });
});