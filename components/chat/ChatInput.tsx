'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send as SendIcon, 
  Plus as PlusIcon, 
  Loader2 as LoaderIcon, 
  Mic as MicIcon, 
  MicOff as MicOffIcon,
  AlertCircle as AlertIcon,
  Check as CheckIcon,
  X as XIcon,
  Volume2 as VolumeIcon
} from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  onSpeechStateChange?: (isListening: boolean) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ 
  onSend, 
  disabled, 
  isLoading, 
  placeholder = "Ask your AI Tutor...",
  onSpeechStateChange
}) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [interimText, setInterimText] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseTextRef = useRef<string>('');

  // Check Web Speech API availability on client
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionClass) {
        setIsSpeechSupported(false);
      }
    }
  }, []);

  // Notify parent of speech state changes
  useEffect(() => {
    onSpeechStateChange?.(isListening);
  }, [isListening, onSpeechStateChange]);

  // Adjust textarea height dynamically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input, interimText]);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const startListening = useCallback(() => {
    setSpeechError(null);

    if (typeof window === 'undefined') return;
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setSpeechError('Speech recognition is not supported in this browser. Please try Chrome, Edge, or Safari.');
      setIsSpeechSupported(false);
      return;
    }

    try {
      // Abort previous session if running
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }

      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      // Capture whatever text was already typed before dictation starts
      baseTextRef.current = input;
      setInterimText('');

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalChunk = '';
        let interimChunk = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i][0];
          if (event.results[i].isFinal) {
            finalChunk += item.transcript;
          } else {
            interimChunk += item.transcript;
          }
        }

        if (finalChunk) {
          const prefix = baseTextRef.current ? baseTextRef.current.trim() + ' ' : '';
          const updated = prefix + finalChunk.trim();
          baseTextRef.current = updated;
          setInput(updated);
          setInterimText('');
        } else if (interimChunk) {
          setInterimText(interimChunk);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setSpeechError('Microphone permission was denied. Please allow microphone access in your browser address bar.');
        } else if (event.error === 'no-speech') {
          // No speech detected during interval, leave gracefully
        } else if (event.error === 'network') {
          setSpeechError('Network error during speech recognition. Please check your internet connection.');
        } else if (event.error !== 'aborted') {
          setSpeechError(`Speech recognition notice: ${event.error}`);
        }
        setIsListening(false);
        setInterimText('');
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimText('');
      };

      recognitionRef.current = recognition;
      recognition.start();

      // Focus the textarea so user sees the cursor
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    } catch (err: any) {
      console.error('Failed to initialize SpeechRecognition:', err);
      setSpeechError(err?.message || 'Could not access the microphone.');
      setIsListening(false);
    }
  }, [input]);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleCancelDictation = () => {
    stopListening();
    setInput(baseTextRef.current);
    setInterimText('');
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isListening) {
      stopListening();
    }

    const trimmed = input.trim();
    if (!trimmed || disabled || isLoading) return;
    
    onSend(trimmed);
    setInput('');
    baseTextRef.current = '';
    setInterimText('');
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-full bg-gradient-to-t from-slate-50 dark:from-[#0a0a0a] via-slate-50 dark:via-[#0a0a0a] to-transparent pt-6 pb-6 px-4">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
        
        {/* Active Speech Dictation Banner */}
        {isListening && (
          <div className="flex items-center justify-between px-4 py-2.5 mb-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-2xl shadow-sm animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
              </span>
              
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-rose-700 dark:text-rose-300 shrink-0">
                  Dictating prompt...
                </span>
                
                {/* Audio sound wave equalizer bars */}
                <div className="flex items-end gap-0.5 h-3.5 shrink-0" aria-hidden="true">
                  <span className="w-0.5 h-3 bg-rose-500 rounded-full animate-pulse [animation-duration:600ms]"></span>
                  <span className="w-0.5 h-4 bg-rose-600 rounded-full animate-pulse [animation-duration:450ms]"></span>
                  <span className="w-0.5 h-2 bg-rose-500 rounded-full animate-pulse [animation-duration:700ms]"></span>
                  <span className="w-0.5 h-3.5 bg-rose-600 rounded-full animate-pulse [animation-duration:500ms]"></span>
                  <span className="w-0.5 h-2.5 bg-rose-500 rounded-full animate-pulse [animation-duration:650ms]"></span>
                </div>

                {interimText && (
                  <span className="text-xs italic text-rose-900/70 dark:text-rose-200/70 truncate max-w-[200px] sm:max-w-xs">
                    &ldquo;{interimText}&rdquo;
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button
                type="button"
                onClick={stopListening}
                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors shadow-sm"
                title="Finish dictating and keep text"
              >
                <CheckIcon size={13} />
                Done
              </button>
              
              <button
                type="button"
                onClick={handleCancelDictation}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                title="Cancel dictation"
              >
                <XIcon size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Speech Error Banner */}
        {speechError && (
          <div className="flex items-center justify-between px-4 py-2.5 mb-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-2xl text-xs text-amber-800 dark:text-amber-300 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertIcon size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <span>{speechError}</span>
            </div>
            <button 
              type="button" 
              onClick={() => setSpeechError(null)}
              className="text-amber-700 dark:text-amber-400 hover:text-amber-900 font-bold ml-3 text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Chat Input Pill */}
        <div className={`relative flex items-end gap-2 bg-white dark:bg-[#1a1a1a] border-2 rounded-[28px] p-2 pl-4 shadow-2xl transition-all ${
          isListening 
            ? 'border-rose-500 dark:border-rose-500/80 shadow-rose-500/10 ring-2 ring-rose-500/20' 
            : 'border-slate-300 dark:border-white/20 focus-within:border-indigo-600'
        }`}>
          <button
            type="button"
            className="p-2 text-slate-500 hover:text-indigo-600 transition-colors mb-1 rounded-full hover:bg-slate-100 dark:hover:bg-white/5"
            title="Upload curriculum asset"
          >
            <PlusIcon size={20} />
          </button>
          
          <label htmlFor="ai-chat-input" className="sr-only">
            Ask AI anything about pedagogy or curriculum or dictate using microphone
          </label>
          
          <div className="flex-1 relative flex items-center">
            <textarea
              ref={textareaRef}
              id="ai-chat-input"
              name="ai-chat-input"
              value={input + (interimText ? (input && !input.endsWith(' ') ? ' ' : '') + interimText : '')}
              onChange={(e) => {
                setInput(e.target.value);
                baseTextRef.current = e.target.value;
                setInterimText('');
              }}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? "Listening... Speak your curriculum prompt" : placeholder}
              disabled={disabled || isLoading}
              rows={1}
              className="w-full bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 resize-none py-3 text-[16px] font-bold max-h-[160px] custom-scrollbar"
              aria-label="Pedagogy Master Query Input"
            />
          </div>

          {/* Microphone Dictation Button (Web Speech API) */}
          <button
            type="button"
            onClick={toggleListening}
            disabled={disabled || isLoading || !isSpeechSupported}
            className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all mb-1 ${
              isListening
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 ring-4 ring-rose-600/20 animate-pulse'
                : isSpeechSupported
                  ? 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95'
                  : 'text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-50'
            }`}
            title={
              !isSpeechSupported
                ? 'Speech recognition not supported in this browser'
                : isListening
                  ? 'Click to stop dictation'
                  : 'Dictate curriculum prompt with microphone (Web Speech API)'
            }
            aria-label={isListening ? 'Stop microphone dictation' : 'Start microphone dictation'}
          >
            {isListening ? (
              <MicOffIcon size={20} className="text-white" />
            ) : (
              <MicIcon size={20} />
            )}
          </button>
          
          {/* Submit / Send Button */}
          <button
            type="submit"
            disabled={(!input.trim() && !interimText.trim()) || disabled || isLoading}
            className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all mb-1 mr-1 ${
              (input.trim() || interimText.trim()) && !isLoading 
                ? 'bg-indigo-600 text-white shadow-xl hover:bg-indigo-700 active:scale-90' 
                : 'bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-600'
            }`}
            aria-label="Send Query"
          >
            {isLoading ? <LoaderIcon size={20} className="animate-spin" /> : <SendIcon size={20} />}
          </button>
        </div>
        
        <div className="flex items-center justify-between mt-3 px-2">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-[0.15em] flex items-center gap-1.5">
            <VolumeIcon size={12} className={isListening ? "text-rose-500 animate-pulse" : "text-slate-400"} />
            <span>Voice Dictation Ready • Web Speech API</span>
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-[0.2em]">
            Multi-Provider Logic v42.0
          </p>
        </div>
      </form>
    </div>
  );
};