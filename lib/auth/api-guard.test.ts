import { describe, it, expect, vi } from 'vitest';
import { validateApiKey } from './api-guard';
import { NextRequest } from 'next/server';

// Mock the supabase client
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: 'Not found' })
        }))
      }))
    }))
  }
}));

describe('validateApiKey', () => {
  it('should return authorized false if missing header', async () => {
    const req = { headers: new Map() } as any;
    const result = await validateApiKey(req);
    expect(result.authorized).toBe(false);
  });
});
