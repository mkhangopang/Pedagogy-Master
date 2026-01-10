
import { supabase } from '../supabase';

/**
 * NEURAL SLO RECOMMENDER
 * Uses vector similarity search to find related learning objectives across the curriculum.
 */
export async function recommendRelatedSLOs(currentSLO: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('find_similar_slos', {
      target_slo: currentSLO,
      similarity_threshold: 0.7,
      max_results: 5,
    });
    
    if (error) {
      console.warn("SLO Recommendation Node Warning:", error.message);
      return [];
    }
    
    return data?.map((d: any) => d.slo_code) || [];
  } catch (err) {
    console.error("Neural Recommendation failure:", err);
    return [];
  }
}
