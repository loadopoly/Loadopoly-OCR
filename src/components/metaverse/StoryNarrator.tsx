/**
 * Story Narrator Component
 * 
 * An immersive narrative panel that guides users through
 * their knowledge corpus like a "choose your own adventure" book.
 * Features animated text, photo displays, and branching choices.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  BookOpen, 
  Compass, 
  ChevronRight, 
  SkipForward,
  History,
  Sparkles,
  Image as ImageIcon,
  ArrowRight,
  Star,
  Clock,
  MapPin,
  RefreshCcw,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  X,
  ChevronDown,
  ChevronUp,
  Bookmark,
  Share2
} from 'lucide-react';
import { GraphData, GraphNode, DigitalAsset } from '../../types';
import { 
  NarrativeEngine, 
  StoryChapter, 
  StoryChoice, 
  StoryPath,
  createNarrativeEngine 
} from '../../services/narrativeService';

// ============================================
// Types
// ============================================

interface StoryNarratorProps {
  graphData: GraphData;
  assets: DigitalAsset[];
  selectedNode: GraphNode | null;
  onNodeSelect: (node: GraphNode | null) => void;
  onAssetView?: (assetId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

interface TypewriterTextProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  isSkipped?: boolean;
}

// ============================================
// Typewriter Effect Component
// ============================================

function TypewriterText({ text, speed = 30, onComplete, isSkipped }: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    if (isSkipped) {
      setDisplayedText(text);
      setIsComplete(true);
      onComplete?.();
      return;
    }

    setDisplayedText('');
    indexRef.current = 0;
    setIsComplete(false);

    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayedText(prev => prev + text[indexRef.current]);
        indexRef.current++;
      } else {
        clearInterval(interval);
        setIsComplete(true);
        onComplete?.();
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, isSkipped, onComplete]);

  return (
    <span className={`transition-opacity duration-300 ${isComplete ? 'opacity-100' : 'opacity-90'}`}>
      {displayedText}
      {!isComplete && <span className="animate-pulse text-primary-400">▌</span>}
    </span>
  );
}

// ============================================
// Photo Gallery Component
// ============================================

function ChapterGallery({ 
  assets, 
  onAssetView 
}: { 
  assets: DigitalAsset[]; 
  onAssetView?: (id: string) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (assets.length === 0) return null;

  const currentAsset = assets[selectedIndex];
  const imageUrl = currentAsset?.imageUrl;

  return (
    <div className="mt-4 rounded-lg overflow-hidden bg-slate-800/50 border border-slate-700">
      {/* Main Image */}
      <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
        {imageUrl ? (
          <img 
            src={imageUrl} 
            alt={currentAsset?.sqlRecord?.DOCUMENT_TITLE || 'Historical artifact'}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <ImageIcon size={48} />
            <span className="text-sm">No image available</span>
          </div>
        )}
        
        {/* Image caption */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <p className="text-sm text-white font-medium truncate">
            {currentAsset?.sqlRecord?.DOCUMENT_TITLE || 'Untitled'}
          </p>
          {currentAsset?.sqlRecord?.SOURCE_COLLECTION && (
            <p className="text-xs text-slate-400">
              {currentAsset.sqlRecord.SOURCE_COLLECTION}
            </p>
          )}
        </div>

        {/* View full button */}
        {onAssetView && (
          <button
            onClick={() => onAssetView(currentAsset.id)}
            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-lg text-white transition-colors"
          >
            <Maximize2 size={16} />
          </button>
        )}
      </div>

      {/* Thumbnails */}
      {assets.length > 1 && (
        <div className="flex gap-2 p-2 overflow-x-auto bg-slate-900/50">
          {assets.map((asset, index) => {
            const thumbUrl = asset.imageUrl;
            return (
              <button
                key={asset.id}
                onClick={() => setSelectedIndex(index)}
                className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-colors ${
                  index === selectedIndex 
                    ? 'border-primary-500' 
                    : 'border-transparent hover:border-slate-600'
                }`}
              >
                {thumbUrl ? (
                  <img 
                    src={thumbUrl} 
                    alt={`View ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-700 flex items-center justify-center">
                    <ImageIcon size={16} className="text-slate-500" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// Choice Card Component
// ============================================

function ChoiceCard({ 
  choice, 
  onSelect,
  index,
  isEnabled 
}: { 
  choice: StoryChoice; 
  onSelect: () => void;
  index: number;
  isEnabled: boolean;
}) {
  const difficultyColors = {
    easy: 'border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20',
    medium: 'border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20',
    challenging: 'border-rose-500/50 bg-rose-500/10 hover:bg-rose-500/20',
  };

  const difficultyBadge = {
    easy: { label: 'Easy path', color: 'text-emerald-400' },
    medium: { label: 'Moderate', color: 'text-amber-400' },
    challenging: { label: 'Complex', color: 'text-rose-400' },
  };

  return (
    <button
      onClick={onSelect}
      disabled={!isEnabled}
      className={`w-full p-4 rounded-lg border-2 text-left transition-all duration-300 ${
        isEnabled 
          ? `${difficultyColors[choice.difficulty]} cursor-pointer transform hover:scale-[1.02] hover:shadow-lg`
          : 'border-slate-700/50 bg-slate-800/30 opacity-50 cursor-not-allowed'
      }`}
      style={{ animationDelay: `${index * 150}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <span className="text-primary-400 font-mono text-sm">{index + 1}.</span>
            <span className="truncate">{choice.label}</span>
          </h4>
          <p className="text-sm text-slate-400 mt-1 italic">"{choice.teaser}"</p>
          <p className="text-xs text-slate-500 mt-2">{choice.consequence}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-xs ${difficultyBadge[choice.difficulty].color}`}>
            {difficultyBadge[choice.difficulty].label}
          </span>
          <ArrowRight size={18} className="text-slate-500" />
        </div>
      </div>
    </button>
  );
}

// ============================================
// Breadcrumb Trail Component  
// ============================================

function JourneyBreadcrumbs({ 
  path, 
  currentIndex,
  onJumpTo 
}: { 
  path: StoryPath | null;
  currentIndex: number;
  onJumpTo: (index: number) => void;
}) {
  if (!path || path.breadcrumbs.length === 0) return null;

  return (
    <div className="flex items-center gap-1 text-xs overflow-x-auto pb-2">
      <History size={12} className="text-primary-400 flex-shrink-0" />
      {path.breadcrumbs.map((crumb, index) => (
        <React.Fragment key={index}>
          <button
            onClick={() => onJumpTo(index)}
            className={`px-2 py-1 rounded whitespace-nowrap transition-colors ${
              index === currentIndex
                ? 'bg-primary-600/30 text-primary-300'
                : index < currentIndex
                  ? 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  : 'text-slate-600 cursor-not-allowed'
            }`}
            disabled={index > currentIndex}
          >
            {crumb.length > 15 ? crumb.slice(0, 12) + '...' : crumb}
          </button>
          {index < path.breadcrumbs.length - 1 && (
            <ChevronRight size={12} className="text-slate-600 flex-shrink-0" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ============================================
// Main Story Narrator Component
// ============================================

export function StoryNarrator({
  graphData,
  assets,
  selectedNode,
  onNodeSelect,
  onAssetView,
  isExpanded = false,
  onToggleExpand,
}: StoryNarratorProps) {
  // State
  const [narrativeEngine] = useState(() => createNarrativeEngine(graphData, assets));
  const [currentChapter, setCurrentChapter] = useState<StoryChapter | null>(null);
  const [storyPath, setStoryPath] = useState<StoryPath | null>(null);
  const [pathIndex, setPathIndex] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [isSkipText, setIsSkipText] = useState(false);
  const [isTextComplete, setIsTextComplete] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [journeyCount, setJourneyCount] = useState(0);
  
  const contentRef = useRef<HTMLDivElement>(null);

  // Generate chapter when a node is selected
  useEffect(() => {
    if (selectedNode && narrativeEngine) {
      const chapter = narrativeEngine.generateChapter(selectedNode);
      setCurrentChapter(chapter);
      setIsSkipText(false);
      setIsTextComplete(false);
      
      // Scroll to top of content
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
    }
  }, [selectedNode, narrativeEngine]);

  // Handle choice selection
  const handleChoiceSelect = useCallback((choice: StoryChoice) => {
    onNodeSelect(choice.targetNode);
    setJourneyCount(prev => prev + 1);
  }, [onNodeSelect]);

  // Get a suggested starting point
  const handleSuggestStart = useCallback(() => {
    if (narrativeEngine) {
      const suggestion = narrativeEngine.suggestStartingPoint();
      if (suggestion) {
        onNodeSelect(suggestion);
        setJourneyCount(prev => prev + 1);
      }
    }
  }, [narrativeEngine, onNodeSelect]);

  // Reset the journey
  const handleResetJourney = useCallback(() => {
    if (narrativeEngine) {
      narrativeEngine.resetContext();
      setCurrentChapter(null);
      setStoryPath(null);
      setPathIndex(0);
      setJourneyCount(0);
      onNodeSelect(null);
    }
  }, [narrativeEngine, onNodeSelect]);

  // Skip text animation
  const handleSkipText = useCallback(() => {
    setIsSkipText(true);
  }, []);

  // Journey summary
  const journeySummary = useMemo(() => {
    if (narrativeEngine) {
      return narrativeEngine.generateJourneySummary();
    }
    return '';
  }, [narrativeEngine, journeyCount]);

  // Render welcome state
  if (!selectedNode || !currentChapter) {
    return (
      <div className="h-full flex flex-col bg-gradient-to-b from-slate-900 to-slate-950 text-white">
        {/* Header */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen size={20} className="text-primary-400" />
              <h2 className="font-bold text-lg">Story Navigator</h2>
            </div>
            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            )}
          </div>
        </div>

        {/* Welcome content */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mb-6">
            <Compass size={40} className="text-white" />
          </div>
          
          <h3 className="text-2xl font-bold mb-3">Begin Your Journey</h3>
          <p className="text-slate-400 max-w-sm mb-8">
            Explore the knowledge world through an interactive narrative. 
            Each discovery leads to new choices, weaving your unique path through history.
          </p>

          <button
            onClick={handleSuggestStart}
            className="px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-500 hover:to-primary-600 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-105 shadow-lg shadow-primary-500/25"
          >
            <Sparkles size={18} />
            Start Adventure
          </button>

          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <div className="text-2xl font-bold text-primary-400">{graphData.nodes.length}</div>
              <div className="text-xs text-slate-500">Discoveries</div>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <div className="text-2xl font-bold text-emerald-400">{graphData.links.length}</div>
              <div className="text-xs text-slate-500">Connections</div>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <div className="text-2xl font-bold text-amber-400">{assets.length}</div>
              <div className="text-xs text-slate-500">Artifacts</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-900 to-slate-950 text-white">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{currentChapter.theme.icon}</span>
            <div>
              <h2 className="font-bold text-sm text-slate-400">{currentChapter.theme.name}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock size={12} />
                <span>~{currentChapter.readingTime}s read</span>
                <span className="text-slate-700">•</span>
                <span className="text-primary-400">Chapter {journeyCount + 1}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={handleSkipText}
              disabled={isTextComplete}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              title="Skip text animation"
            >
              <SkipForward size={16} />
            </button>
            <button
              onClick={handleResetJourney}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              title="Reset journey"
            >
              <RefreshCcw size={16} />
            </button>
            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            )}
          </div>
        </div>

        {/* Journey summary toggle */}
        <button
          onClick={() => setShowSummary(!showSummary)}
          className="w-full flex items-center justify-between p-2 bg-slate-800/50 rounded-lg text-xs hover:bg-slate-800 transition-colors"
        >
          <span className="text-slate-400 flex items-center gap-2">
            <History size={12} />
            Your Journey So Far
          </span>
          {showSummary ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        
        {showSummary && (
          <div className="mt-2 p-3 bg-slate-800/30 rounded-lg text-sm text-slate-400 italic">
            {journeySummary}
          </div>
        )}
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Chapter Title */}
        <h3 className="text-xl font-bold text-white border-l-4 border-primary-500 pl-3">
          {currentChapter.title}
        </h3>

        {/* Narrative Text */}
        <div className="prose prose-invert prose-sm max-w-none">
          {currentChapter.narrative.split('\n\n').map((paragraph, index) => (
            <p key={index} className="text-slate-300 leading-relaxed">
              {index === 0 && !isTextComplete ? (
                <TypewriterText 
                  text={paragraph}
                  speed={25}
                  isSkipped={isSkipText}
                  onComplete={() => index === currentChapter.narrative.split('\n\n').length - 1 && setIsTextComplete(true)}
                />
              ) : (
                isSkipText || index < currentChapter.narrative.split('\n\n').indexOf(paragraph) ? paragraph : (
                  <TypewriterText 
                    text={paragraph}
                    speed={25}
                    isSkipped={isSkipText}
                    onComplete={() => index === currentChapter.narrative.split('\n\n').length - 1 && setIsTextComplete(true)}
                  />
                )
              )}
            </p>
          ))}
        </div>

        {/* Photo Gallery */}
        {currentChapter.relatedAssets.length > 0 && (
          <div className="animate-fadeIn">
            <h4 className="text-sm font-semibold text-slate-400 flex items-center gap-2 mb-2">
              <ImageIcon size={14} />
              Related Artifacts
            </h4>
            <ChapterGallery 
              assets={currentChapter.relatedAssets} 
              onAssetView={onAssetView}
            />
          </div>
        )}

        {/* Node Info Card */}
        <div 
          className="p-4 rounded-lg border border-slate-700 bg-slate-800/30"
          style={{ borderLeftColor: currentChapter.theme.color, borderLeftWidth: 4 }}
        >
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-semibold text-white">{currentChapter.focusNode.label}</h4>
              <p className="text-xs text-slate-500 mt-1">
                {currentChapter.focusNode.type} • Relevance: {Math.round(currentChapter.focusNode.relevance * 100)}%
              </p>
            </div>
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: currentChapter.theme.color }}
            />
          </div>
        </div>

        {/* Choices Section */}
        {currentChapter.choices.length > 0 && (
          <div className="space-y-3 animate-fadeIn">
            <h4 className="text-sm font-semibold text-slate-400 flex items-center gap-2">
              <Compass size={14} />
              Choose Your Path
            </h4>
            
            <div className="space-y-2">
              {currentChapter.choices.map((choice, index) => (
                <ChoiceCard
                  key={choice.id}
                  choice={choice}
                  index={index}
                  isEnabled={isTextComplete || isSkipText}
                  onSelect={() => handleChoiceSelect(choice)}
                />
              ))}
            </div>

            {/* Alternative actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSuggestStart}
                className="flex-1 p-2 text-xs text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <Sparkles size={12} />
                Suggest Different Path
              </button>
              <button
                onClick={handleResetJourney}
                className="flex-1 p-2 text-xs text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <RefreshCcw size={12} />
                Start Over
              </button>
            </div>
          </div>
        )}

        {/* No choices - end of branch */}
        {currentChapter.choices.length === 0 && (
          <div className="text-center p-6 bg-slate-800/30 rounded-lg border border-slate-700">
            <Star size={32} className="text-amber-400 mx-auto mb-3" />
            <h4 className="font-bold text-white mb-2">End of This Path</h4>
            <p className="text-sm text-slate-400 mb-4">
              You've reached a unique destination in the knowledge world. 
              Would you like to explore a new direction?
            </p>
            <button
              onClick={handleSuggestStart}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg font-semibold text-sm transition-colors"
            >
              Find New Adventure
            </button>
          </div>
        )}
      </div>

      {/* Footer with mood indicator */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Mood:</span>
            <span className={`capitalize ${
              currentChapter.mood === 'mysterious' ? 'text-purple-400' :
              currentChapter.mood === 'revelatory' ? 'text-emerald-400' :
              currentChapter.mood === 'contemplative' ? 'text-blue-400' :
              currentChapter.mood === 'exciting' ? 'text-amber-400' :
              'text-slate-400'
            }`}>
              {currentChapter.mood}
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <span>{currentChapter.choices.length} paths available</span>
            <span>{currentChapter.relatedAssets.length} artifacts</span>
          </div>
        </div>
      </div>
    </div>
  );
}
