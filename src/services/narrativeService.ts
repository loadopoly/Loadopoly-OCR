/**
 * Narrative Service
 * 
 * Generates contextual stories and guided exploration paths
 * for the Knowledge World, creating an immersive "choose your
 * own adventure" experience through historical data.
 */

import { GraphData, GraphNode, GraphLink, DigitalAsset } from '../types';
import { logger } from '../lib/logger';

// ============================================
// Types
// ============================================

export interface StoryChapter {
  id: string;
  title: string;
  narrative: string;
  focusNode: GraphNode;
  relatedAssets: DigitalAsset[];
  choices: StoryChoice[];
  theme: NarrativeTheme;
  mood: 'mysterious' | 'revelatory' | 'contemplative' | 'exciting' | 'melancholic';
  readingTime: number; // seconds
}

export interface StoryChoice {
  id: string;
  label: string;
  teaser: string;
  targetNode: GraphNode;
  relationship: string;
  consequence: string;
  difficulty: 'easy' | 'medium' | 'challenging';
}

export interface NarrativeTheme {
  name: string;
  icon: string;
  color: string;
  keywords: string[];
}

export interface StoryPath {
  chapters: StoryChapter[];
  currentIndex: number;
  breadcrumbs: string[];
  totalJourney: number;
  discoveries: GraphNode[];
}

export interface NarrativeContext {
  previousNodes: GraphNode[];
  visitedThemes: Set<string>;
  characterArcs: Map<string, string[]>;
  plotThreads: string[];
}

// ============================================
// Narrative Themes
// ============================================

const NARRATIVE_THEMES: Record<string, NarrativeTheme> = {
  PERSON: {
    name: 'The Human Story',
    icon: '👤',
    color: '#3b82f6',
    keywords: ['lived', 'witnessed', 'shaped', 'remembered', 'legacy']
  },
  LOCATION: {
    name: 'Places & Memory',
    icon: '🗺️',
    color: '#10b981',
    keywords: ['stood', 'landscape', 'boundaries', 'home', 'journey']
  },
  ORGANIZATION: {
    name: 'Institutions & Power',
    icon: '🏛️',
    color: '#f59e0b',
    keywords: ['established', 'governed', 'influenced', 'maintained', 'transformed']
  },
  DATE: {
    name: 'Echoes of Time',
    icon: '⏳',
    color: '#ec4899',
    keywords: ['era', 'moment', 'turning point', 'epoch', 'memory']
  },
  CONCEPT: {
    name: 'Ideas & Beliefs',
    icon: '💡',
    color: '#8b5cf6',
    keywords: ['philosophy', 'tradition', 'innovation', 'meaning', 'understanding']
  },
  DOCUMENT: {
    name: 'Written Records',
    icon: '📜',
    color: '#6366f1',
    keywords: ['documented', 'recorded', 'preserved', 'testament', 'evidence']
  },
  CLUSTER: {
    name: 'Convergence',
    icon: '🌐',
    color: '#64748b',
    keywords: ['intersection', 'connection', 'pattern', 'weaving', 'nexus']
  }
};

// ============================================
// Narrative Templates
// ============================================

const OPENING_TEMPLATES = [
  "Before you lies {node}, a {type} that holds secrets waiting to be uncovered...",
  "The path has led you to {node}. What stories whisper here?",
  "In the vast web of history, {node} emerges as a crucial thread...",
  "Time seems to slow around {node}. Something significant happened here...",
  "Your journey brings you face to face with {node}. The air itself feels charged with history...",
  "Among the countless artifacts of memory, {node} calls to you...",
  "The fog of time parts to reveal {node}. Why has fate drawn you here?",
];

const CONNECTION_NARRATIVES: Record<string, string[]> = {
  'CREATED_BY': [
    "The hands that shaped this were those of {target}...",
    "Behind this creation stands {target}, whose vision breathed life into matter...",
    "{target} left their mark here, a signature in time...",
  ],
  'LOCATED_IN': [
    "This place, {target}, holds many such treasures within its embrace...",
    "The landscape of {target} has witnessed countless stories like this one...",
    "Within the boundaries of {target}, history layers upon history...",
  ],
  'MENTIONS': [
    "The text speaks of {target}, drawing a line through time...",
    "A reference to {target} connects this moment to a larger tapestry...",
    "{target} is named here, suggesting deeper connections...",
  ],
  'DATED_TO': [
    "This places us in {target}, a time of transformation...",
    "The calendar reads {target}, anchoring this story in its era...",
    "{target} marks when these events unfolded...",
  ],
  'RELATED_TO': [
    "A thread connects to {target}, weaving the story wider...",
    "The connection to {target} reveals hidden patterns...",
    "Look closer, and you'll see how {target} fits into this puzzle...",
  ],
  'PART_OF': [
    "This belongs to something greater: {target}...",
    "{target} encompasses this fragment, giving it context...",
    "Within the larger body of {target}, this finds its meaning...",
  ],
  'ASSOCIATED_WITH': [
    "{target} walks alongside this story, their fates intertwined...",
    "The association with {target} adds layers to our understanding...",
    "Where this story goes, {target} is never far behind...",
  ],
};

const CHOICE_TEASERS: Record<string, string[]> = {
  PERSON: [
    "Who was this person, really?",
    "What secrets did they carry?",
    "Their story beckons you deeper...",
    "A life full of untold chapters awaits...",
  ],
  LOCATION: [
    "What other stories does this place hold?",
    "The land remembers more than we know...",
    "Every corner hides a memory...",
    "Geography shapes destiny...",
  ],
  ORGANIZATION: [
    "What role did they play?",
    "Power leaves traces everywhere...",
    "Institutions shape the world quietly...",
    "Behind every organization, countless stories...",
  ],
  DATE: [
    "What else happened in this moment?",
    "Time connects all things...",
    "A single date, infinite possibilities...",
    "The past is never truly past...",
  ],
  CONCEPT: [
    "Ideas have consequences...",
    "What did they believe?",
    "Concepts shape reality...",
    "In understanding, we find connection...",
  ],
  DOCUMENT: [
    "What other stories were recorded?",
    "The written word preserves truth...",
    "Documents are windows to the past...",
    "Every record is a message in a bottle...",
  ],
  CLUSTER: [
    "Where do these threads converge?",
    "Patterns emerge from chaos...",
    "The big picture awaits...",
    "Step back to see the whole tapestry...",
  ],
};

const CHAPTER_TRANSITIONS = [
  "And so the story continues...",
  "But this is not where it ends...",
  "The thread leads onwards...",
  "New paths reveal themselves...",
  "The journey deepens...",
  "Another chapter unfolds...",
  "History has more to tell...",
  "The narrative branches here...",
];

const MOOD_MODIFIERS: Record<string, string[]> = {
  mysterious: [
    "Something about this feels unresolved...",
    "Questions multiply with each answer...",
    "The truth seems to hover just out of reach...",
  ],
  revelatory: [
    "A pattern emerges from the chaos...",
    "Suddenly, connections become clear...",
    "The pieces fall into place...",
  ],
  contemplative: [
    "Time seems to slow here, inviting reflection...",
    "What meaning can we draw from this?",
    "In the quiet, understanding grows...",
  ],
  exciting: [
    "The pace quickens as discoveries mount...",
    "History comes alive before your eyes...",
    "Adventure awaits in every direction...",
  ],
  melancholic: [
    "A sense of loss permeates this story...",
    "Time has taken much, but not all...",
    "In what remains, we find meaning...",
  ],
};

// ============================================
// Narrative Engine
// ============================================

export class NarrativeEngine {
  private graphData: GraphData;
  private assets: DigitalAsset[];
  private context: NarrativeContext;
  private nodeMap: Map<string, GraphNode>;
  private adjacencyList: Map<string, { node: GraphNode; relationship: string }[]>;

  constructor(graphData: GraphData, assets: DigitalAsset[]) {
    this.graphData = graphData;
    this.assets = assets;
    this.context = {
      previousNodes: [],
      visitedThemes: new Set(),
      characterArcs: new Map(),
      plotThreads: [],
    };
    
    // Build lookup structures
    this.nodeMap = new Map(graphData.nodes.map(n => [n.id, n]));
    this.adjacencyList = new Map();
    
    graphData.links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
      
      const sourceNode = this.nodeMap.get(sourceId);
      const targetNode = this.nodeMap.get(targetId);
      
      if (sourceNode && targetNode) {
        if (!this.adjacencyList.has(sourceId)) this.adjacencyList.set(sourceId, []);
        if (!this.adjacencyList.has(targetId)) this.adjacencyList.set(targetId, []);
        
        this.adjacencyList.get(sourceId)!.push({ node: targetNode, relationship: link.relationship });
        this.adjacencyList.get(targetId)!.push({ node: sourceNode, relationship: link.relationship });
      }
    });
  }

  /**
   * Generate a story chapter for a given node
   */
  generateChapter(node: GraphNode): StoryChapter {
    const theme = NARRATIVE_THEMES[node.type] || NARRATIVE_THEMES.CLUSTER;
    const connections = this.adjacencyList.get(node.id) || [];
    const relatedAssets = this.findRelatedAssets(node);
    
    // Determine mood based on context and connections
    const mood = this.determineMood(node, connections);
    
    // Build the narrative
    const narrative = this.buildNarrative(node, connections, mood);
    
    // Generate choices
    const choices = this.generateChoices(node, connections);
    
    // Update context
    this.context.previousNodes.push(node);
    this.context.visitedThemes.add(node.type);
    
    // Track character arcs for PERSON nodes
    if (node.type === 'PERSON') {
      const arc = this.context.characterArcs.get(node.id) || [];
      arc.push(`Visited at chapter ${this.context.previousNodes.length}`);
      this.context.characterArcs.set(node.id, arc);
    }
    
    const chapter: StoryChapter = {
      id: `chapter_${node.id}_${Date.now()}`,
      title: this.generateTitle(node, mood),
      narrative,
      focusNode: node,
      relatedAssets,
      choices,
      theme,
      mood,
      readingTime: Math.ceil(narrative.split(' ').length / 3), // ~3 words per second
    };
    
    logger.info('Generated story chapter', { 
      nodeId: node.id, 
      mood, 
      choiceCount: choices.length,
      assetCount: relatedAssets.length 
    });
    
    return chapter;
  }

  /**
   * Generate a complete story path starting from a node
   */
  generateStoryPath(startNode: GraphNode, maxChapters: number = 5): StoryPath {
    const chapters: StoryChapter[] = [];
    const discoveries: GraphNode[] = [];
    let currentNode = startNode;
    
    for (let i = 0; i < maxChapters; i++) {
      const chapter = this.generateChapter(currentNode);
      chapters.push(chapter);
      discoveries.push(currentNode);
      
      // Auto-select next node based on highest relevance unvisited
      const unvisitedChoices = chapter.choices.filter(
        c => !discoveries.some(d => d.id === c.targetNode.id)
      );
      
      if (unvisitedChoices.length === 0) break;
      
      // Prefer challenging paths for variety
      const nextChoice = unvisitedChoices.sort((a, b) => {
        if (a.difficulty === 'challenging' && b.difficulty !== 'challenging') return -1;
        if (b.difficulty === 'challenging' && a.difficulty !== 'challenging') return 1;
        return b.targetNode.relevance - a.targetNode.relevance;
      })[0];
      
      currentNode = nextChoice.targetNode;
    }
    
    return {
      chapters,
      currentIndex: 0,
      breadcrumbs: chapters.map(c => c.focusNode.label),
      totalJourney: chapters.length,
      discoveries,
    };
  }

  /**
   * Suggest an interesting starting point for exploration
   */
  suggestStartingPoint(): GraphNode | null {
    // Prioritize high-relevance nodes that haven't been visited
    const unvisitedNodes = this.graphData.nodes.filter(
      n => !this.context.previousNodes.some(p => p.id === n.id)
    );
    
    if (unvisitedNodes.length === 0) {
      // Reset and start fresh
      this.context.previousNodes = [];
      return this.graphData.nodes.sort((a, b) => b.relevance - a.relevance)[0] || null;
    }
    
    // Score nodes by: relevance + connection count + type diversity bonus
    const scored = unvisitedNodes.map(node => {
      const connections = this.adjacencyList.get(node.id)?.length || 0;
      const typeBonus = this.context.visitedThemes.has(node.type) ? 0 : 0.2;
      const relevanceScore = node.relevance;
      const connectivityScore = Math.min(connections / 10, 0.3);
      
      return {
        node,
        score: relevanceScore + connectivityScore + typeBonus,
      };
    });
    
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.node || null;
  }

  /**
   * Generate a summary of the journey so far
   */
  generateJourneySummary(): string {
    if (this.context.previousNodes.length === 0) {
      return "Your journey through the knowledge world has not yet begun. Select a node to start your adventure.";
    }
    
    const visited = this.context.previousNodes;
    const themes = Array.from(this.context.visitedThemes);
    
    const summaryParts = [
      `Your exploration has taken you through ${visited.length} discoveries,`,
      `touching on themes of ${themes.map(t => NARRATIVE_THEMES[t]?.name || t).join(', ')}.`,
    ];
    
    if (visited.length >= 3) {
      const keyFigures = visited.filter(n => n.type === 'PERSON');
      const keyPlaces = visited.filter(n => n.type === 'LOCATION');
      
      if (keyFigures.length > 0) {
        summaryParts.push(`You've encountered ${keyFigures.map(f => f.label).join(', ')}.`);
      }
      if (keyPlaces.length > 0) {
        summaryParts.push(`Your path has crossed ${keyPlaces.map(p => p.label).join(', ')}.`);
      }
    }
    
    summaryParts.push("The story continues...");
    
    return summaryParts.join(' ');
  }

  // ============================================
  // Private Methods
  // ============================================

  private findRelatedAssets(node: GraphNode): DigitalAsset[] {
    // Find assets that mention this node or related concepts
    const related = this.assets.filter(asset => {
      const metadata = asset.sqlRecord;
      if (!metadata) return false;
      
      // Check if the asset's title, description, or OCR text mention this node
      const searchText = [
        metadata.DOCUMENT_TITLE || '',
        metadata.DOCUMENT_DESCRIPTION || '',
        asset.ocrText || '',
      ].join(' ').toLowerCase();
      
      return searchText.includes(node.label.toLowerCase());
    });
    
    return related.slice(0, 3); // Limit to 3 most relevant
  }

  private determineMood(
    node: GraphNode, 
    connections: { node: GraphNode; relationship: string }[]
  ): StoryChapter['mood'] {
    // Mood heuristics based on node type and context
    const recentMoods = this.context.previousNodes.slice(-3);
    
    // Avoid repeating the same mood
    const moodWeights: Record<string, number> = {
      mysterious: connections.length > 3 ? 1.2 : 0.8,
      revelatory: this.context.previousNodes.length > 5 ? 1.3 : 0.7,
      contemplative: node.type === 'CONCEPT' || node.type === 'DATE' ? 1.4 : 0.6,
      exciting: node.relevance > 0.8 ? 1.3 : 0.8,
      melancholic: node.type === 'LOCATION' && connections.length < 2 ? 1.2 : 0.5,
    };
    
    // Random weighted selection
    const totalWeight = Object.values(moodWeights).reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    for (const [mood, weight] of Object.entries(moodWeights)) {
      random -= weight;
      if (random <= 0) return mood as StoryChapter['mood'];
    }
    
    return 'contemplative';
  }

  private buildNarrative(
    node: GraphNode,
    connections: { node: GraphNode; relationship: string }[],
    mood: StoryChapter['mood']
  ): string {
    const parts: string[] = [];
    
    // Opening
    const openingTemplate = OPENING_TEMPLATES[Math.floor(Math.random() * OPENING_TEMPLATES.length)];
    parts.push(this.fillTemplate(openingTemplate, { node: node.label, type: node.type.toLowerCase() }));
    
    // Add mood modifier
    const moodLines = MOOD_MODIFIERS[mood];
    parts.push(moodLines[Math.floor(Math.random() * moodLines.length)]);
    
    // Describe key connections
    const topConnections = connections.slice(0, 2);
    topConnections.forEach(conn => {
      const templates = CONNECTION_NARRATIVES[conn.relationship] || CONNECTION_NARRATIVES['RELATED_TO'];
      const template = templates[Math.floor(Math.random() * templates.length)];
      parts.push(this.fillTemplate(template, { target: conn.node.label }));
    });
    
    // Add transition if there are choices available
    if (connections.length > 0) {
      const transition = CHAPTER_TRANSITIONS[Math.floor(Math.random() * CHAPTER_TRANSITIONS.length)];
      parts.push(transition);
    }
    
    return parts.join('\n\n');
  }

  private generateTitle(node: GraphNode, mood: StoryChapter['mood']): string {
    const titlePrefixes: Record<string, string[]> = {
      mysterious: ['The Mystery of', 'Shadows of', 'The Secret of', 'Whispers from'],
      revelatory: ['Discovery:', 'Unveiling', 'The Truth About', 'Revelation:'],
      contemplative: ['Reflections on', 'Understanding', 'The Nature of', 'Meditating on'],
      exciting: ['Adventure:', 'The Quest for', 'Pursuing', 'Encountering'],
      melancholic: ['Remembering', 'The Lost', 'Echoes of', 'In Memory of'],
    };
    
    const prefixes = titlePrefixes[mood];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    // Truncate long labels
    const label = node.label.length > 30 ? node.label.slice(0, 27) + '...' : node.label;
    
    return `${prefix} ${label}`;
  }

  private generateChoices(
    node: GraphNode,
    connections: { node: GraphNode; relationship: string }[]
  ): StoryChoice[] {
    // Limit choices to prevent overwhelm
    const maxChoices = 3;
    const sortedConnections = connections
      .filter(c => c.node.id !== node.id)
      .sort((a, b) => b.node.relevance - a.node.relevance)
      .slice(0, maxChoices);
    
    return sortedConnections.map((conn, index) => {
      const teasers = CHOICE_TEASERS[conn.node.type] || CHOICE_TEASERS.CLUSTER;
      const teaser = teasers[Math.floor(Math.random() * teasers.length)];
      
      // Determine difficulty based on connectivity
      const targetConnections = this.adjacencyList.get(conn.node.id)?.length || 0;
      let difficulty: StoryChoice['difficulty'] = 'easy';
      if (targetConnections > 5) difficulty = 'challenging';
      else if (targetConnections > 2) difficulty = 'medium';
      
      return {
        id: `choice_${conn.node.id}_${index}`,
        label: conn.node.label,
        teaser,
        targetNode: conn.node,
        relationship: conn.relationship,
        consequence: this.generateConsequence(conn.node, difficulty),
        difficulty,
      };
    });
  }

  private generateConsequence(node: GraphNode, difficulty: StoryChoice['difficulty']): string {
    const consequences: Record<string, string[]> = {
      easy: [
        'A straightforward path leads deeper into the story.',
        'This choice reveals more of the tale.',
        'The narrative unfolds naturally from here.',
      ],
      medium: [
        'This path promises discoveries, but questions remain.',
        'Choosing this way opens new possibilities.',
        'The story branches in interesting directions.',
      ],
      challenging: [
        'This path is complex, but rich with meaning.',
        'Many threads converge here - tread carefully.',
        'A challenging exploration awaits, full of connections.',
      ],
    };
    
    const options = consequences[difficulty];
    return options[Math.floor(Math.random() * options.length)];
  }

  private fillTemplate(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  /**
   * Reset the narrative context for a fresh start
   */
  resetContext(): void {
    this.context = {
      previousNodes: [],
      visitedThemes: new Set(),
      characterArcs: new Map(),
      plotThreads: [],
    };
  }
}

// ============================================
// Story Hook for React
// ============================================

export interface UseNarrativeResult {
  currentChapter: StoryChapter | null;
  storyPath: StoryPath | null;
  isLoading: boolean;
  startJourney: (node: GraphNode) => void;
  makeChoice: (choice: StoryChoice) => void;
  getSuggestion: () => GraphNode | null;
  getJourneySummary: () => string;
  resetJourney: () => void;
}

export function createNarrativeEngine(graphData: GraphData, assets: DigitalAsset[]): NarrativeEngine {
  return new NarrativeEngine(graphData, assets);
}
