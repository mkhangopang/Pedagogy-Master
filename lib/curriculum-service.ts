
import { supabase } from './supabase';
import { TeacherProgress } from '../types';

export const curriculumService = {
  /**
   * Fetch all progress records for the current teacher
   */
  async getProgress(userId: string): Promise<TeacherProgress[]> {
    const { data, error } = await supabase
      .from('teacher_progress')
      .select('*')
      .eq('user_id', userId);

    if (error) return [];
    
    return (data || []).map(d => ({
      id: d.id,
      userId: d.user_id,
      sloCode: d.slo_code,
      status: d.status,
      taughtDate: d.taught_date,
      studentMasteryPercentage: d.student_mastery_percentage,
      notes: d.notes,
      createdAt: d.created_at
    }));
  },

  /**
   * Update or create a progress record for an SLO
   */
  async updateProgress(userId: string, progress: Partial<TeacherProgress> & { sloCode: string }) {
    const { data: existing } = await supabase
      .from('teacher_progress')
      .select('id')
      .eq('user_id', userId)
      .eq('slo_code', progress.sloCode)
      .maybeSingle();

    if (existing) {
      return await supabase
        .from('teacher_progress')
        .update({
          status: progress.status,
          taught_date: progress.taughtDate,
          student_mastery_percentage: progress.studentMasteryPercentage,
          notes: progress.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      return await supabase
        .from('teacher_progress')
        .insert({
          user_id: userId,
          slo_code: progress.sloCode,
          status: progress.status || 'planning',
          taught_date: progress.taughtDate,
          student_mastery_percentage: progress.studentMasteryPercentage,
          notes: progress.notes
        });
    }
  },

  /**
   * Calculate coverage statistics based on identified SLOs vs Progress
   */
  async getCoverageStats(userId: string) {
    const { data: slos } = await supabase
      .from('slo_database')
      .select('slo_code, documents!inner(user_id)')
      .eq('documents.user_id', userId);

    const { data: progress } = await supabase
      .from('teacher_progress')
      .select('slo_code, status')
      .eq('user_id', userId);

    const uniqueSLOs = Array.from(new Set(slos?.map(s => s.slo_code) || []));
    const coveredSLOs = progress?.filter(p => p.status === 'completed') || [];
    const inProgressSLOs = progress?.filter(p => p.status === 'teaching') || [];

    return {
      total: uniqueSLOs.length,
      completed: coveredSLOs.length,
      teaching: inProgressSLOs.length,
      percentage: uniqueSLOs.length > 0 ? Math.round((coveredSLOs.length / uniqueSLOs.length) * 100) : 0
    };
  }
};
