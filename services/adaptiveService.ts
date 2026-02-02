import { supabase } from '../lib/supabase';
import { UserProfile, OutputArtifact } from '../types';

export const adaptiveService = {
  /**
   * LAYER 1-4: Assembles behavioral intelligence from history
   * Now includes "Success Pattern Injection" for Few-Shot learning.
   */
  async buildFullContext(userId: string, requestType: string): Promise<string> {
    const [profile, recentSuccesses] = await Promise.all([
      this.getUserProfile(userId),
      this.getRecentSuccesses(userId)
    ]);

    if (!profile) return "";

    const editBehavior = this.analyzeEditPatterns(profile.editPatterns || {});
    const inferredStyle = this.inferTeachingStyle(recentSuccesses);

    return `
### ADAPTIVE_BEHAVIOR_PROFILE
- Primary Teaching Style: ${profile.teachingStyle || inferredStyle}
- Preferred Approach: ${profile.pedagogicalApproach || '5E Inquiry-Based'}
- User Efficiency Rating: ${Math.round((profile.successRate || 0) * 100)}%

### INSTRUCTIONAL_PREFERENCES (Derived from Edits)
${this.formatEditInstructions(editBehavior)}

### SUCCESSFUL_PATTERNS (Few-Shot Reference)
${recentSuccesses.length > 0 
  ? recentSuccesses.map((s, i) => `- [Pattern ${i+1}] Previously ${s.status} ${s.contentType} from ${new Date(s.createdAt).toLocaleDateString()}.`).join('\n') 
  : '- Building instructional history...'}

### PROTOCOL_DIRECTIVE:
- Calibrate cognitive load for ${profile.gradeLevel || 'specified'} students.
- Prioritize ${profile.subjectArea || 'core'} concepts.
- If user preferences indicate conciseness, omit conversational filler.
`;
  },

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!data) return null;
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      plan: data.plan,
      queriesUsed: data.queries_used,
      queriesLimit: data.queries_limit,
      gradeLevel: data.grade_level,
      subjectArea: data.subject_area,
      teachingStyle: data.teaching_style,
      pedagogicalApproach: data.pedagogical_approach,
      generationCount: data.generation_count || 0,
      successRate: data.success_rate || 0,
      editPatterns: data.edit_patterns || { avgLengthChange: 0, examplesCount: 0, structureModifications: 0 }
    } as any;
  },

  async getRecentSuccesses(userId: string): Promise<OutputArtifact[]> {
    const { data } = await supabase
      .from('output_artifacts')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['exported', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(3);
    
    return (data || []).map(d => ({
      id: d.id,
      userId: d.user_id,
      contentType: d.content_type,
      content: d.content,
      metadata: d.metadata,
      status: d.status,
      editDepth: d.edit_depth,
      createdAt: d.created_at
    }));
  },

  analyzeEditPatterns(patterns: any) {
    return {
      verbosity: patterns.avgLengthChange || 0,
      examplesAdded: patterns.examplesCount || 0,
    };
  },

  inferTeachingStyle(successes: any[]) {
    if (successes.length === 0) return 'Balanced';
    const totalLength = successes.reduce((acc, s) => acc + s.content.length, 0);
    const avgLength = totalLength / successes.length;
    return avgLength > 3000 ? 'Comprehensive' : 'Concise';
  },

  formatEditInstructions(behavior: any) {
    const instructions = [];
    if (behavior.verbosity < -0.2) instructions.push("- ADAPTATION: Teacher favors brevity. Synthesize 25% more concisely.");
    if (behavior.verbosity > 0.2) instructions.push("- ADAPTATION: Teacher favors depth. Provide rich scaffolding and extensions.");
    if (behavior.examplesAdded > 1) instructions.push("- ADAPTATION: High value on real-world examples. Ensure 3+ specific local scenarios.");
    return instructions.length > 0 ? instructions.join('\n') : "- No strong stylistic signals yet. Maintain pedagogical balance.";
  },

  async captureGeneration(userId: string, contentType: string, content: string, metadata: any) {
    const id = crypto.randomUUID();
    const { error } = await supabase.from('output_artifacts').insert({
      id,
      user_id: userId,
      content_type: contentType,
      content,
      metadata,
      status: 'generated'
    });
    if (error) console.error("Artifact Capture Failure:", error);
    return id;
  },

  async captureEvent(userId: string, artifactId: string, eventType: 'export' | 'accept' | 'abandon' | 'edit', extraData: any = {}) {
    await supabase.from('feedback_events').insert({
      user_id: userId,
      artifact_id: artifactId,
      event_type: eventType,
      event_data: extraData
    });

    const statusMap = { export: 'exported', accept: 'accepted', abandon: 'abandoned', edit: 'edited' };
    await supabase.from('output_artifacts').update({ 
      status: statusMap[eventType],
      edit_depth: extraData.editDepth || 0
    }).eq('id', artifactId);

    const { data: profile } = await supabase.from('profiles').select('success_rate, generation_count').eq('id', userId).single();
    if (profile) {
      const isSuccess = ['export', 'accept'].includes(eventType);
      const newRate = isSuccess ? profile.success_rate * 0.88 + 0.12 : profile.success_rate * 0.95;
      await supabase.from('profiles').update({
        success_rate: Math.min(1, newRate),
        generation_count: (profile.generation_count || 0) + 1,
        updated_at: new Date().toISOString()
      }).eq('id', userId);
    }
  }
};