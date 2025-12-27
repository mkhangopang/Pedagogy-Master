
import { supabase } from '../lib/supabase';
import { UserProfile, OutputArtifact } from '../types';

export const adaptiveService = {
  /**
   * LAYER 1-4: Assembles the behavioral intelligence for the prompt
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
### ACTIVE ADAPTIVE CONTEXT
- Teaching Style: ${profile.teachingStyle || inferredStyle}
- Pedagogical Approach: ${profile.pedagogicalApproach || 'standard'}
- Success Rate: ${Math.round((profile.successRate || 0) * 100)}%

### BEHAVIORAL SIGNALS (LAYER 3)
${this.formatEditInstructions(editBehavior)}

### PROVEN SUCCESS PATTERNS (LAYER 4)
${recentSuccesses.length > 0 
  ? recentSuccesses.map((s, i) => `- Used ${s.contentType} pattern from ${new Date(s.createdAt).toLocaleDateString()} (Status: ${s.status})`).join('\n') 
  : '- Building pattern history...'}

### ADAPTIVE GENERATION PROTOCOL
- Complexity: Calibrate for ${profile.gradeLevel || 'K-12'}.
- Subjectivity: Lead with ${profile.subjectArea || 'General'} concepts.
- Instruction: If success rate is low, include more foundational explanations.
- Adaptivity: If user preferences indicate conciseness, omit non-essential transitions.
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
      subjectArea: data.subject_area, // Mapped from DB subject_area
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
    return avgLength > 2500 ? 'Comprehensive' : 'Concise';
  },

  formatEditInstructions(behavior: any) {
    const instructions = [];
    if (behavior.verbosity < -0.2) instructions.push("- ADAPTATION: Consistently prefers brevity. Generate 20% more concise.");
    if (behavior.verbosity > 0.2) instructions.push("- ADAPTATION: Prefers comprehensive detail. Expand activities and tips.");
    if (behavior.examplesAdded > 1) instructions.push("- ADAPTATION: Values concrete examples. Include 3+ real-world scenarios.");
    return instructions.length > 0 ? instructions.join('\n') : "- No strong behavioral trends detected yet.";
  },

  // FEEDBACK CAPTURE
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
    if (error) console.error("Artifact Save Error:", error);
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

    // Update global success metrics for user with Exponential Moving Average
    const { data: profile } = await supabase.from('profiles').select('success_rate, generation_count').eq('id', userId).single();
    if (profile) {
      const isSuccess = ['export', 'accept'].includes(eventType);
      // EMA logic: Success bumps rate, Failure (abandon) drops it
      const newRate = isSuccess ? profile.success_rate * 0.85 + 0.15 : profile.success_rate * 0.92;
      await supabase.from('profiles').update({
        success_rate: Math.min(1, newRate),
        generation_count: (profile.generation_count || 0) + 1,
        updated_at: new Date().toISOString()
      }).eq('id', userId);
    }
  }
};
