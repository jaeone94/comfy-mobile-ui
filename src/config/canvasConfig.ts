// Shared canvas configuration for workflow rendering
// Used by both useCanvasRenderer (detail view) and WorkflowVisualizer (thumbnails)

export interface CanvasConfig {
  // Node dimensions
  nodeWidth: number;
  nodeHeight: number;
  
  // Layout
  padding: number;
  
  // Colors - Dark mode only
  backgroundColor: string;
  defaultNodeColor: string; // Default when no node color is specified
  linkColor: string;
  textColor: string;
  selectedNodeColor: string;
  
  // Group colors
  groupColor: string;
  groupBorderColor: string;
  groupTextColor: string;
  
  // Typography
  fontSize: number;
  groupFontSize: number;
}

// Default dark mode configuration
export const DEFAULT_CANVAS_CONFIG: CanvasConfig = {
  // Node dimensions (2x larger)  
  nodeWidth: 150,
  nodeHeight: 75,
  
  // Layout (increased padding)
  padding: 20,
  
  // Colors - Dark mode only (design-system page background)
  backgroundColor: '#111419', // canvas fill (lifted from #0b0c0f for visibility)
  defaultNodeColor: '#1c212c', // Elevated node surface (design system, lifted for canvas contrast)
  linkColor: '#566070',
  textColor: '#f1f5f9',
  selectedNodeColor: '#3069f0',
  
  // Group colors
  groupColor: '#1e293b',
  groupBorderColor: '#475569',
  groupTextColor: '#94a3b8',
  
  // Typography (increased for better readability)
  fontSize: 24,
  groupFontSize: 26,
};

// Helper function to create a partial config with overrides
export function createCanvasConfig(overrides?: Partial<CanvasConfig>): CanvasConfig {
  return { ...DEFAULT_CANVAS_CONFIG, ...overrides };
}