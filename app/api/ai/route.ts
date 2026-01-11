import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { 
      task, 
      message, 
      adaptiveContext, 
      history, 
      toolType, 
      userInput, 
      brain,
      priorityDocumentId // New Parameter
    } = body;
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🤖 [AI ROUTE] Task: ${task || 'chat'} | User: ${user.email}`);
    console.log(`💬 Message: "${message?.substring(0, 100)}..."`);
    if (priorityDocumentId) console.log(`🎯 Priority Asset: ${priorityDocumentId}`);

    const supabase = getSupabaseServerClient(token);
    const promptText = task === 'generate-tool' 
      ? `GENERATE_${toolType?.toUpperCase().replace('-', '_')}: ${userInput}`
      : message;

    const customSystem = brain?.masterPrompt;

    const { text, provider, metadata } = await generateAIResponse(
      promptText, 
      history || [], 
      user.id, 
      supabase,
      adaptiveContext, 
      undefined, 
      toolType,
      customSystem,
      priorityDocumentId // Passing to orchestrator
    );

    console.log(`✅ [AI ROUTE] Synthesis Complete`);
    console.log(`📡 Provider: ${provider}`);
    console.log(`📚 RAG Chunks: ${metadata?.chunksUsed || 0}`);
    if (metadata?.sources && metadata.sources.length > 0) {
      console.log('📊 Similarity Profile:');
      metadata.sources.forEach((s: any, i: number) => {
        console.log(`  - Source ${i+1}: ${(s.similarity * 100).toFixed(1)}% | SLOs: ${s.sloCodes?.join(',')}`);
      });
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.enqueue(encoder.encode(`\n\n---\n*Synthesis Node: ${provider}${metadata?.chunksUsed ? ` | Grounded in ${metadata.chunksUsed} assets` : ''}*`));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [AI ROUTE ERROR]:", error);
    return NextResponse.json({ 
      error: error.message || "Synthesis grid encountered a fatal exception." 
    }, { status: 500 });
  }
}