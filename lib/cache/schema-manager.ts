import { SupabaseClient } from '@supabase/supabase-js';

/**
 * SCHEMA CACHE MANAGER (v1.0)
 * Resolves FP-01: Schema Cache Desync.
 */
export class SchemaManager {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Triggers a NOTIFY reload for the PostgREST API cache.
   */
  public async reloadCache(): Promise<boolean> {
    try {
      const { error } = await this.supabase.rpc('reload_schema_cache');
      if (error) throw error;
      console.log("⚡ [SchemaManager] API Cache purged successfully.");
      return true;
    } catch (e) {
      console.error("❌ [SchemaManager] Cache reload refused.", e);
      return false;
    }
  }

  /**
   * Validates that critical performance columns are visible to the client.
   */
  public async validateSyncState(): Promise<{ inSync: boolean; missing?: string[] }> {
    const { data, error } = await this.supabase
      .from('rag_health_report')
      .select('*')
      .limit(1);

    if (error) {
      return { inSync: false, missing: ['rag_health_report_view'] };
    }

    return { inSync: true };
  }
}