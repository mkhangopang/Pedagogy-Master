import { SupabaseClient } from '@supabase/supabase-js';
import { parseSLOCode } from '../rag/slo-parser';

export interface AlignmentNode {
  code: string;
  prerequisites: string[];
  successors: string[];
}

/**
 * VERTICAL ALIGNMENT ENGINE (v1.0)
 * Mission: Map prerequisite learning pathways across grade levels.
 */
export class VerticalAlignmentEngine {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Finds the prerequisite SLO from the previous grade based on domain match.
   */
  public async getPrerequisites(sloCode: string): Promise<string[]> {
    const { data } = await this.supabase
      .from('vertical_alignment')
      .select('prerequisite_slo')
      .eq('slo_code', sloCode);

    return data?.map(d => d.prerequisite_slo) || [];
  }

  /**
   * Automated suggestion of prerequisites based on code structure (e.g., B11A01 -> B10A01).
   */
  public async suggestVerticalPrerequisite(sloCode: string): Promise<string | null> {
    const parsed = parseSLOCode(sloCode);
    if (!parsed) return null;

    const prevGrade = (parseInt(parsed.grade) - 1).toString().padStart(2, '0');
    if (parseInt(prevGrade) <= 0) return null;

    // Construct a theoretical prerequisite code
    const suggested = `${parsed.subject}${prevGrade}${parsed.domain}${parsed.number.toString().padStart(2, '0')}`;
    
    // Verify it exists in our ledger
    const { data } = await this.supabase
      .from('slo_database')
      .select('slo_code')
      .eq('slo_code', suggested)
      .maybeSingle();

    return data?.slo_code || null;
  }

  /**
   * Persists a verified alignment.
   */
  public async linkSLOs(target: string, prereq: string) {
    await this.supabase.from('vertical_alignment').upsert({
      slo_code: target,
      prerequisite_slo: prereq,
      verified: true
    });
  }
}
