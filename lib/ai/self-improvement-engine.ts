import { SupabaseClient } from '@supabase/supabase-js';
import { kv } from '../kv';
import { orchestrator } from './model-orchestrator';

export interface LearnPayload {
  userId: string;
  input: string;
  output: string;
  tool: string;
  supabase: SupabaseClient;
  isGrounded?: boolean;
  latencyMs?: number;
}

export interface ImprovementSignal {
  pattern: string;
  frequency: number;
  suggestedFix: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

class SelfImprovementEngine {
  private readonly COMPILE_THRESHOLD = 50;
  private readonly SIGNAL_TABLE = 'improvement_signals';
  private readonly BRAIN_TABLE = 'neural_brain';

  async learn(payload: LearnPayload): Promise<void> {
    const { userId, input, output, tool, supabase, isGrounded, latencyMs } = payload;
    const tokenCount = output.split(/\s+/).length;
    const signals: Array<{ type: string; value: any }> = [];

    if (isGrounded === false) {
      signals.push({ type: 'vault_miss', value: { query: input.substring(0, 200), tool } });
    }
    if (tokenCount < 100) {
      signals.push({ type: 'under_generation', value: { query: input.substring(0, 200), tool, tokenCount } });
    }
    if (latencyMs && latencyMs > 8000) {
      signals.push({ type: 'high_latency', value: { latencyMs, tool } });
    }

    if (signals.length === 0) return;

    await supabase.from(this.SIGNAL_TABLE).insert(
      signals.map(s => ({
        user_id: userId,
        signal_type: s.type,
        signal_data: s.value,
        tool_type: tool,
        created_at: new Date().toISOString(),
        compiled: false
      }))
    );

    const { count } = await supabase
      .from(this.SIGNAL_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('compiled', false);

    if ((count || 0) >= this.COMPILE_THRESHOLD) {
      this.compileInsights(supabase).catch(e => console.error('[SIE] compileInsights error:', e));
    }
  }

  async compileInsights(supabase: SupabaseClient): Promise<void> {
    const lockKey = 'sie:compile:lock';
    const locked = await kv.acquireLease(lockKey, 120_000);
    if (!locked) return;

    try {
      const { data: signals } = await supabase
        .from(this.SIGNAL_TABLE)
        .select('*')
        .eq('compiled', false)
        .order('created_at', { ascending: false })
        .limit(200);

      if (!signals || signals.length === 0) return;

      const signalsSummary = signals.map(s => `${s.signal_type} (${s.tool_type}): ${JSON.stringify(s.signal_data)}`).join('\n');
      const prompt = `Analyze the following AI performance signals and provide an improvement insight summary or configuration updates. Focus on pedagogical outcomes and minimizing latency and misses.\n\nSignals:\n${signalsSummary}`;

      const aiResponse = await orchestrator.executeTask(prompt, 'strategy');
      
      const insight = {
        insight_text: aiResponse.text,
        timestamp: new Date().toISOString(),
        signals_compiled: signals.length
      };

      await supabase.from('improvement_insights').insert([insight]);

      // Mark signals as compiled
      const signalIds = signals.map(s => s.id);
      await supabase.from(this.SIGNAL_TABLE).update({ compiled: true }).in('id', signalIds);

      console.log(`[SIE] ✅ Compiled ${signals.length} signals into insights.`);
    } finally {
      await kv.releaseLease(lockKey);
    }
  }

  async getInsightSummary(supabase: SupabaseClient) {
    const { data } = await supabase.from('improvement_insights').select('*').order('timestamp', { ascending: false }).limit(5);
    return data || [];
  }
}

export const selfImprovementEngine = new SelfImprovementEngine();
