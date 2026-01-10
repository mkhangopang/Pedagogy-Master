
import { supabase } from '../supabase';
import { synthesize } from './multi-provider-router';

/**
 * INTELLIGENT PEDAGOGICAL CACHE
 * Manages the lifecycle of AI-generated curriculum artifacts.
 * If a request for an SLO has been processed before, returns the high-quality cached version.
 */
export async function getCachedOrGenerate(
  sloCode: string,
  contentType: 'lesson_plan' | 'teaching_strategies' | 'assessment',
  userId: string
): Promise<string> {
  try {
    // 1. Check for cached generation
    const { data, error } = await supabase
      .from('ai_generated_content')
      .select('*')
      .eq('slo_code', sloCode)
      .eq('content_type', contentType)
      .maybeSingle();
    
    if (data && !error) {
      // Background: Update usage metrics
      supabase
        .from('ai_generated_content')
        .update({ usage_count: (data.usage_count || 0) + 1 })
        .eq('id', data.id)
        .then(() => {});
      
      return data.content;
    }
    
    // 2. Cache Miss: Fresh Synthesis
    const taskPrompts = {
      lesson_plan: `Create a comprehensive, structured lesson plan for Student Learning Objective (SLO) ${sloCode}. Include hooks, direct instruction, and guided practice.`,
      teaching_strategies: `List 5 high-impact teaching strategies and classroom activities for Student Learning Objective (SLO) ${sloCode}.`,
      assessment: `Generate a balanced formative assessment (quiz) with 5 questions and an answer key for Student Learning Objective (SLO) ${sloCode}.`
    };

    // We use a high-reliability model for artifact synthesis (Gemini)
    const { text, provider } = await synthesize(
      taskPrompts[contentType],
      [], 
      true, // Assume docs exist if we found the SLO in the DB
      undefined,
      'gemini'
    );
    
    // 3. Persist to Global Cache
    await supabase.from('ai_generated_content').insert({
      slo_code: sloCode,
      content_type: contentType,
      content: text,
      generated_by: provider,
      usage_count: 1
    });
    
    return text;
  } catch (err) {
    console.error("Intelligent Cache Error:", err);
    throw err;
  }
}
