import React, { useState, useEffect, useRef } from 'react';
import { Article, Comment } from '../types';
import { generateSummary, generateArticleAudio } from '../services/geminiService';
import ImageWithFallback from './ImageWithFallback';

// Add type definition for model-viewer since it's a custom element
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': any;
    }
  }
}

interface ArticleReaderProps {
    article: Article;
    onClose: () => void;
    onShare: (text: string) => void;
    onNext?: () => void;
    onPrev?: () => void;
    labels: any;
}

const decodePcmData = (buffer: ArrayBuffer, ctx: AudioContext) => {
    const pcmData = new Int16Array(buffer);
    const channels = 1;
    const sampleRate = 24000;
    const frameCount = pcmData.length;
    
    const audioBuffer = ctx.createBuffer(channels, frameCount, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    for (let i = 0; i < frameCount; i++) {
        // Normalize 16-bit integer to [-1.0, 1.0] float
        channelData[i] = pcmData[i] / 32768.0;
    }
    
    return audioBuffer;
};

const ArticleReader: React.FC<ArticleReaderProps> = ({ article, onClose, onShare, onNext, onPrev, labels }) => {
    const [summary, setSummary] = useState<string | null>(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [comments, setComments] = useState<Comment[]>(article.comments || []);
    const [newComment, setNewComment] = useState('');
    
    // Focus Mode State
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [fontSize, setFontSize] = useState(1.25); // rem
    const [lineHeight, setLineHeight] = useState(1.75); // unitless
    
    const [selectionRect, setSelectionRect] = useState<{top: number, left: number, text: string} | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'f') {
                setIsFocusMode(prev => !prev);
            }
            if (e.key === 'ArrowRight' && onNext) {
                onNext();
            }
            if (e.key === 'ArrowLeft' && onPrev) {
                onPrev();
            }
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onNext, onPrev, onClose]);

    // Font switching based on category
    const getFontClass = () => {
        switch (article.category) {
            case 'POLITICS': return 'font-serif';
            case 'TECH': return 'font-mono';
            case 'CULTURE': return 'font-display';
            default: return 'font-serif';
        }
    };

    const handleSummary = async () => {
        if (summary) return;
        setIsLoadingSummary(true);
        const textToSummarize = article.content.filter(b => b.type === 'text').map(b => b.content).join(' ');
        const result = await generateSummary(textToSummarize);
        setSummary(result);
        setIsLoadingSummary(false);
    };

    const handleListen = async () => {
        if (isPlaying) {
             audioContext?.close();
             setAudioContext(null);
             setIsPlaying(false);
             return;
        }

        setIsPlaying(true);
        const textToRead = article.content.filter(b => b.type === 'text').map(b => b.content).join(' ');
        const audioBufferRaw = await generateArticleAudio(textToRead);

        if (audioBufferRaw) {
            try {
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const buffer = decodePcmData(audioBufferRaw, ctx);
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                source.onended = () => {
                    setIsPlaying(false);
                    ctx.close();
                };
                source.start(0);
                setAudioContext(ctx);
            } catch (e) {
                console.error("Audio playback error", e);
                setIsPlaying(false);
            }
        } else {
            setIsPlaying(false);
            alert("Audio generation failed or API key missing.");
        }
    };

    // Handle Selection for Sharing
    useEffect(() => {
        const handleSelection = () => {
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0 && contentRef.current?.contains(selection.anchorNode)) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                
                // Position above text, centered
                setSelectionRect({
                    top: rect.top - 10,
                    left: rect.left + (rect.width / 2),
                    text: selection.toString()
                });
            } else {
                setSelectionRect(null);
            }
        };

        document.addEventListener('selectionchange', handleSelection);
        return () => document.removeEventListener('selectionchange', handleSelection);
    }, []);

    const handleShareClick = (textOverride?: string) => {
        // Default to subtitle if no text provided and no selection
        const text = textOverride || selectionRect?.text || article.subtitle;
        onShare(text);
        setSelectionRect(null);
    };

    const handlePostComment = () => {
        if (!newComment.trim()) return;
        const comment: Comment = {
            id: Date.now().toString(),
            author: 'You',
            text: newComment,
            timestamp: 'Just now',
            likes: 0
        };
        setComments([comment, ...comments]);
        setNewComment('');
    };

    return (
        <div className={`fixed inset-0 z-50 bg-tun-black overflow-y-auto animate-[fadeIn_0.3s_ease-out] ${isFocusMode ? 'scrollbar-hide' : ''}`}>
            {/* Nav */}
            {!isFocusMode && (
                <div className="fixed top-0 left-0 w-full h-16 flex items-center justify-between px-4 md:px-8 z-50 glass">
                    <button onClick={onClose} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors" data-cursor="hover">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span className="text-sm uppercase tracking-widest font-bold">Back</span>
                    </button>
                    <div className="flex items-center gap-3">
                        <span className="hidden md:block text-[10px] text-gray-500 mr-4 font-mono">
                            [F] Focus &nbsp; [←/→] Nav
                        </span>
                        <button onClick={() => setIsFocusMode(true)} className="text-xs uppercase font-bold tracking-widest text-gray-400 hover:text-white flex items-center gap-2 mr-2" data-cursor="hover">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                             </svg>
                             Focus
                        </button>
                        
                        <button 
                            onClick={handleListen}
                            className={`p-2 rounded-full border transition-all ${isPlaying ? 'bg-tun-accent border-tun-accent text-white' : 'border-white/20 text-gray-400 hover:text-white hover:border-white'}`}
                            data-cursor="hover"
                            title="Narrate Article"
                        >
                             <svg className={`w-5 h-5 ${isPlaying ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                        </button>

                        <button 
                            onClick={handleSummary}
                            className="text-xs font-bold border border-tun-accent text-tun-accent px-4 py-2 rounded-full hover:bg-tun-accent hover:text-white transition-all flex items-center gap-1"
                            data-cursor="hover"
                        >
                            {isLoadingSummary ? '...' : labels.askAI}
                        </button>
                        
                        {/* Prominent Share Button */}
                        <button 
                            onClick={() => handleShareClick()}
                            className="text-xs font-bold bg-white text-tun-black px-4 py-2 rounded-full hover:bg-gray-200 transition-all flex items-center gap-2"
                            data-cursor="hover"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                            {labels.share}
                        </button>
                    </div>
                </div>
            )}

            {/* Focus Mode Controls */}
            {isFocusMode && (
                <div className="fixed top-8 right-8 z-[60] flex flex-col gap-4 animate-[slideInRight_0.3s]">
                    <button onClick={() => setIsFocusMode(false)} className="p-3 bg-white/10 rounded-full hover:bg-white/20 text-white backdrop-blur-md" data-cursor="hover">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <div className="p-4 bg-white/5 rounded-2xl backdrop-blur-md flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                            <button onClick={() => setFontSize(Math.max(1, fontSize - 0.1))} className="w-8 h-8 flex items-center justify-center border border-white/10 rounded hover:bg-white/10" data-cursor="hover">A-</button>
                            <button onClick={() => setFontSize(Math.min(2, fontSize + 0.1))} className="w-8 h-8 flex items-center justify-center border border-white/10 rounded hover:bg-white/10" data-cursor="hover">A+</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Hero */}
            {!isFocusMode && (
                <div className="relative w-full h-[60vh]">
                    <ImageWithFallback src={article.coverImage} className="w-full h-full object-cover" alt="cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-tun-black via-tun-black/50 to-transparent"></div>
                    <div className="absolute bottom-0 left-0 w-full p-8 md:p-16 max-w-5xl mx-auto">
                        <div className="flex items-center gap-2 mb-4">
                             <span className="text-tun-accent font-bold tracking-widest uppercase text-sm">{article.category}</span>
                             {article.tags.includes('NYT Integration') && (
                                 <span className="bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                                     Partner: NYT
                                 </span>
                             )}
                        </div>
                        <h1 className={`${getFontClass()} text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-tight mb-6`}>
                            {article.title}
                        </h1>
                        <div className="flex items-center gap-4 text-gray-300">
                            <ImageWithFallback src={article.author.avatar} className="w-10 h-10 rounded-full border border-white/20" alt="author" />
                            <div>
                                <p className="text-sm font-bold text-white">{article.author.name}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Content Container */}
            <div 
                ref={contentRef}
                className={`mx-auto transition-all duration-500 ${isFocusMode ? 'max-w-2xl px-6 py-24 text-center' : 'max-w-3xl px-6 py-12'}`}
            >
                {/* AI Summary */}
                {!isFocusMode && summary && (
                    <div className="mb-12 p-6 rounded-lg bg-tun-gray/50 border-l-2 border-tun-accent animate-[fadeIn_0.5s]">
                        <p className="text-gray-300 italic text-lg leading-relaxed">{summary}</p>
                    </div>
                )}

                {/* Focus Header */}
                {isFocusMode && (
                    <div className="mb-16">
                        <h1 className={`${getFontClass()} text-4xl md:text-5xl font-bold text-white mb-4`}>{article.title}</h1>
                    </div>
                )}

                <div className={`space-y-8 ${getFontClass()}`} style={{ fontSize: `${fontSize}rem`, lineHeight: lineHeight }}>
                    {article.content.map((block, idx) => {
                        switch (block.type) {
                            case 'text':
                                return <p key={idx} className="text-gray-300 selection:bg-tun-accent selection:text-white">{block.content}</p>;
                            case 'heading':
                                return <h2 key={idx} className="text-2xl font-bold text-white mt-8 mb-4">{block.content}</h2>;
                            case 'quote':
                                return (
                                    <blockquote key={idx} className={`my-8 pl-6 border-l-4 border-tun-red text-left ${isFocusMode ? 'mx-auto max-w-lg' : ''}`}>
                                        <p className="text-2xl italic font-serif text-white mb-2">"{block.content}"</p>
                                        {block.metadata?.caption && <cite className="text-sm text-gray-500 not-italic">— {block.metadata.caption}</cite>}
                                    </blockquote>
                                );
                            case 'image':
                                return !isFocusMode && (
                                    <figure key={idx} className="my-8">
                                        <ImageWithFallback src={block.content} alt="article detail" className="w-full rounded-sm" />
                                        {block.metadata?.caption && <figcaption className="mt-2 text-center text-xs text-gray-500">{block.metadata.caption}</figcaption>}
                                    </figure>
                                );
                            case 'video':
                                return !isFocusMode && (
                                    <div key={idx} className="my-8 aspect-video w-full">
                                        <iframe src={`https://www.youtube.com/embed/${block.content}`} className="w-full h-full rounded-sm" frameBorder="0" allowFullScreen></iframe>
                                    </div>
                                );
                            case 'model3d':
                                return !isFocusMode && (
                                    <div key={idx} className="my-8 w-full h-[400px] bg-black/50 rounded-lg overflow-hidden relative">
                                        {/* @ts-ignore */}
                                        <model-viewer 
                                            src={block.content} 
                                            alt="3D Model" 
                                            auto-rotate 
                                            camera-controls
                                        />
                                        <div className="absolute bottom-4 right-4 bg-black/50 px-2 py-1 rounded text-[10px] text-white font-bold uppercase tracking-widest pointer-events-none">
                                            3D Interactive
                                        </div>
                                    </div>
                                );
                            default:
                                return null;
                        }
                    })}
                </div>

                {/* Footer Share */}
                {!isFocusMode && (
                    <div className="mt-16 pt-8 border-t border-white/10 flex justify-between items-center">
                         <div className="flex gap-4">
                            {['🔥', '💡', '🤔', '❤️'].map(emoji => (
                                <button key={emoji} className="text-2xl hover:scale-125 transition-transform p-2 bg-white/5 rounded-full" data-cursor="hover">
                                    {emoji}
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={() => handleShareClick()} 
                            className="text-gray-400 hover:text-white text-sm font-bold uppercase tracking-widest border border-white/10 px-6 py-3 rounded-full hover:bg-white/10 transition-all" 
                            data-cursor="hover"
                        >
                            {labels.share}
                        </button>
                    </div>
                )}

                {/* Comments Section */}
                {!isFocusMode && (
                    <div className="mt-16 border-t border-white/10 pt-12">
                        <h3 className="text-2xl font-bold text-white mb-8">{labels.comments} ({comments.length})</h3>
                        
                        {/* Add Comment */}
                        <div className="flex gap-4 mb-12">
                             <div className="w-10 h-10 rounded-full bg-tun-gray border border-white/10 flex items-center justify-center text-xs font-bold shrink-0">
                                ME
                            </div>
                            <div className="flex-1">
                                <textarea 
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder={labels.addComment}
                                    className="w-full bg-transparent border-b border-white/10 text-white p-2 focus:outline-none focus:border-tun-accent transition-colors min-h-[50px] resize-none"
                                />
                                <div className="flex justify-end mt-2">
                                    <button 
                                        onClick={handlePostComment}
                                        disabled={!newComment.trim()}
                                        className="text-xs font-bold bg-white text-black px-4 py-2 rounded-full hover:bg-gray-200 disabled:opacity-50 transition-colors"
                                        data-cursor="hover"
                                    >
                                        {labels.post}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* List */}
                        <div className="space-y-8">
                            {comments.map((comment) => (
                                <div key={comment.id} className="flex gap-4 animate-[fadeIn_0.5s]">
                                    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                        {comment.author[0]}
                                    </div>
                                    <div>
                                        <div className="flex items-baseline gap-2 mb-1">
                                            <span className="font-bold text-white text-sm">{comment.author}</span>
                                            <span className="text-xs text-gray-500">{comment.timestamp}</span>
                                        </div>
                                        <p className="text-gray-300 text-sm leading-relaxed">{comment.text}</p>
                                        <div className="flex items-center gap-4 mt-2">
                                            <button className="text-xs text-gray-500 hover:text-white flex items-center gap-1" data-cursor="hover">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                                                {comment.likes}
                                            </button>
                                            <button className="text-xs text-gray-500 hover:text-white" data-cursor="hover">Reply</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Highlight Popover */}
            {selectionRect && (
                <div 
                    className="fixed z-50 animate-[popIn_0.2s_ease-out] flex flex-col items-center"
                    style={{ top: selectionRect.top - 60, left: selectionRect.left - 75 }} // Adjusted centering
                >
                    <button 
                        onClick={() => handleShareClick()}
                        className="bg-tun-black border border-tun-accent/50 text-white px-5 py-2.5 rounded-full shadow-[0_0_15px_rgba(255,0,51,0.5)] flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:bg-tun-accent transition-all hover:scale-105"
                        data-cursor="hover"
                    >
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        {labels.shareQuote}
                    </button>
                    <div className="w-3 h-3 bg-tun-black rotate-45 border-r border-b border-tun-accent/50 -mt-1.5 z-[-1]"></div>
                </div>
            )}
        </div>
    );
};

export default ArticleReader;