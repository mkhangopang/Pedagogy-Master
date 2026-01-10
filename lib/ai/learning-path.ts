
import { supabase } from '../supabase';

/**
 * SLO DATA RETRIEVAL
 * Fetches structured objective metadata for a specific code.
 */
export async function getSLOFromDatabase(sloCode: string, userId: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('slo_database')
      .select('*, documents!inner(user_id)')
      .eq('slo_code', sloCode)
      .eq('documents.user_id', userId)
      .maybeSingle();

    if (error) return null;
    return data;
  } catch (err) {
    return null;
  }
}

/**
 * NEURAL LEARNING PATH GENERATOR
 * Constructs a prerequisite learning sequence by mapping concept dependencies.
 */
export async function generateLearningPath(targetSLO: string, userId: string): Promise<string[]> {
  const slo = await getSLOFromDatabase(targetSLO, userId);
  if (!slo) return [targetSLO];
  
  // Use prerequisite_concepts to build a learning sequence
  const path: string[] = [];
  const seen = new Set<string>();
  
  // We want to avoid adding the target SLO to the prerequisite list initially
  seen.add(targetSLO);
  
  for (const prereq of slo.prerequisite_concepts || []) {
    // Find SLOs that teach this prerequisite keyword in the current user's library
    const { data } = await supabase
      .from('slo_database')
      .select('slo_code, documents!inner(user_id)')
      .eq('documents.user_id', userId)
      .contains('keywords', [prereq]);
    
    if (data) {
      data.forEach(d => {
        if (!seen.has(d.slo_code)) {
          path.push(d.slo_code);
          seen.add(d.slo_code);
        }
      });
    }
  }
  
  // The terminal node is the target objective itself
  path.push(targetSLO);
  return path;
}
