// Shared canvas rendering functions for workflow visualization
// Used by both detail view and thumbnail generation

import type { IComfyGraphNode, IComfyGraphLink } from '@/shared/types/app/base';
import { DEFAULT_CANVAS_CONFIG, CanvasConfig } from '@/config/canvasConfig';
import { IComfyGraphGroup } from '@/shared/types/app/base';
import { ComfyGraphNode } from '@/core/domain/ComfyGraphNode';
import { useConnectionStore } from '@/ui/store/connectionStore';

// Alias for backward compatibility
type IGroup = IComfyGraphGroup;

// Image cache for preview images
const imageCache = new Map<string, HTMLImageElement>();
const imageLoadingPromises = new Map<string, Promise<HTMLImageElement>>();
// Track which nodes have already initiated image loading
const nodeImageLoadingInitiated = new Set<number>();
// Track which images belong to which nodes
const nodeImageMap = new Map<number, Set<string>>();

/**
 * Clear node image loading tracking (called when workflow changes)
 */
export function clearNodeImageLoadingCache() {
  nodeImageLoadingInitiated.clear();
  nodeImageMap.clear();
}

/**
 * Clear image cache for specific node widgets (called when NodeInspector closes)
 */
export function clearNodeImageCache(nodeId?: number) {
  if (nodeId !== undefined) {
    // Clear loading tracking for specific node
    nodeImageLoadingInitiated.delete(nodeId);

    // Clear cached images for this specific node only
    const nodeImages = nodeImageMap.get(nodeId);
    if (nodeImages) {
      nodeImages.forEach(filename => {
        imageCache.delete(filename);
        imageLoadingPromises.delete(filename);
      });
      nodeImageMap.delete(nodeId);
    }
  } else {
    // Clear all caches
    nodeImageLoadingInitiated.clear();
    imageCache.clear();
    imageLoadingPromises.clear();
    nodeImageMap.clear();
  }
}

/**
 * Check if a filename is a video file
 */
function isVideoFile(filename: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.mpg', '.mpeg'];
  const lowerFilename = filename.toLowerCase();
  return videoExtensions.some(ext => lowerFilename.endsWith(ext));
}

/**
 * Convert video filename to thumbnail PNG filename
 */
function getVideoThumbnailFilename(videoFilename: string): string {
  // Remove video extension and add .png
  const lastDotIndex = videoFilename.lastIndexOf('.');
  if (lastDotIndex > 0) {
    return videoFilename.substring(0, lastDotIndex) + '.png';
  }
  return videoFilename + '.png';
}

/**
 * Load an image from ComfyUI server
 */
async function loadComfyImage(filename: string, nodeId?: number): Promise<HTMLImageElement> {
  // Get server URL from connectionStore
  const serverUrl = useConnectionStore.getState().url || 'http://localhost:8188';

  // For video files, load the PNG thumbnail instead
  let targetFilename = filename;
  if (isVideoFile(filename)) {
    targetFilename = getVideoThumbnailFilename(filename);
    console.log(`🎬 [Canvas] Loading thumbnail for video: ${filename} -> ${targetFilename}`);
  }

  // Check cache first (use original filename as cache key for consistency)
  if (imageCache.has(filename)) {
    return imageCache.get(filename)!;
  }

  // Check if already loading
  if (imageLoadingPromises.has(filename)) {
    return imageLoadingPromises.get(filename)!;
  }

  // Create loading promise
  const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();

    // Parse filename and subfolder
    let actualFilename: string;
    let subfolder: string = '';

    if (targetFilename.includes('/')) {
      const lastSlashIndex = targetFilename.lastIndexOf('/');
      subfolder = targetFilename.substring(0, lastSlashIndex);
      actualFilename = targetFilename.substring(lastSlashIndex + 1);
    } else {
      actualFilename = targetFilename;
    }

    // Build URL for ComfyUI file view
    const url = `${serverUrl}/view?filename=${encodeURIComponent(actualFilename)}&type=input${subfolder ? `&subfolder=${encodeURIComponent(subfolder)}` : ''}`;

    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(filename, img);  // Use original filename as key
      imageLoadingPromises.delete(filename);

      // Track which node this image belongs to
      if (nodeId !== undefined) {
        if (!nodeImageMap.has(nodeId)) {
          nodeImageMap.set(nodeId, new Set());
        }
        nodeImageMap.get(nodeId)!.add(filename);
      }

      resolve(img);
    };

    img.onerror = () => {
      imageLoadingPromises.delete(filename);
      reject(new Error(`Failed to load image: ${targetFilename}`));
    };

    img.src = url;
  });

  imageLoadingPromises.set(filename, loadPromise);
  return loadPromise;
}

// Note: ComfyGraphNode can have Float32Array for pos and size when using LiteGraph
// The rendering functions handle both Float32Array and regular arrays

export interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  node: IComfyGraphNode;
}

export interface GroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  title?: string;
  color: string;
  id?: number; // Group ID for identification and selection
}

export interface ViewportTransform {
  x: number;
  y: number;
  scale: number;
}

export interface LongPressState {
  isActive: boolean;
  showProgress: boolean; // Separate flag for showing progress after 0.3s delay
  startTime: number;
  startX: number;
  startY: number;
  targetNode?: any | null; // WorkflowNode type
  timeoutId?: NodeJS.Timeout | null;
  progressTimeoutId?: NodeJS.Timeout | null; // For the 0.3s delay
  animationId?: number | null;
}

export interface RenderingOptions {
  selectedNode?: IComfyGraphNode | null;
  executingNodeId?: string | null;
  errorNodeId?: string | null;
  nodeExecutionProgress?: { nodeId: string; progress: number } | null;
  showText?: boolean; // Whether to render node titles and text (default: true)
  viewportScale?: number; // Viewport scale for responsive font sizing
  modifiedNodeIds?: Set<number>; // Nodes with temporary widget changes
  modifiedWidgetValues?: Map<number, Record<string, any>>; // Actual modified widget values
  repositionMode?: {
    isActive: boolean;
    selectedNodeId: number | null;
    selectedGroupId: number | null;
    gridSnapEnabled: boolean;
    resizeMode?: {
      isActive: boolean;
      gripperType: 'corner' | 'edge';
      gripperPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right';
      originalSize: [number, number];
      originalPosition: [number, number];
    };
  } | null; // Repositioning mode information
  connectionMode?: {
    isActive: boolean;
    phase: 'SOURCE_SELECTION' | 'TARGET_SELECTION' | 'SLOT_SELECTION';
    sourceNodeId: number | null;
    targetNodeId: number | null;
    compatibleNodeIds: Set<number>;
  } | null; // Connection mode information for node highlighting
  missingNodeIds?: Set<number>; // Nodes with missing types (not available on server)
  visibleRect?: { // Visible area in world coordinates
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null;
  longPressState?: LongPressState | null; // Long press visual feedback
}

/**
 * Helper function to darken or lighten a color
 * @param color - Hex color string
 * @param amount - Positive values darken, negative values lighten
 */
export function darkenColor(color: string, amount: number): string {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    let r = 0, g = 0, b = 0;

    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.substr(0, 2), 16);
      g = parseInt(hex.substr(2, 2), 16);
      b = parseInt(hex.substr(4, 2), 16);
    }

    if (amount >= 0) {
      // Darken by reducing RGB values
      r = Math.max(0, Math.round(r * (1 - amount)));
      g = Math.max(0, Math.round(g * (1 - amount)));
      b = Math.max(0, Math.round(b * (1 - amount)));
    } else {
      // Lighten by increasing RGB values towards 255
      const lightenAmount = Math.abs(amount);
      r = Math.min(255, Math.round(r + (255 - r) * lightenAmount));
      g = Math.min(255, Math.round(g + (255 - g) * lightenAmount));
      b = Math.min(255, Math.round(b + (255 - b) * lightenAmount));
    }

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // Return original color if unable to process
  return color;
}

/**
 * Get color for a specific slot type
 */
function getSlotColor(type: string | undefined): string {
  if (!type) return '#10b981'; // Default Green for unknown/untyped

  // Normalize type
  const normalizedType = type.toUpperCase();

  // Color mapping for common ComfyUI types
  // Using vibrant, distinct colors that work well on dark backgrounds
  const colorMap: Record<string, string> = {
    'IMAGE': '#64B5F6',        // Blue
    'LATENT': '#E040FB',       // Purple
    'MODEL': '#7986CB',        // Indigo
    'CLIP': '#FFD54F',         // Amber/Yellow
    'VAE': '#FF5252',          // Red
    'CONDITIONING': '#FFB74D', // Orange
    'MASK': '#81C784',         // Green
    'FLOAT': '#4DB6AC',        // Teal
    'INT': '#4DB6AC',          // Teal
    'NUMBER': '#4DB6AC',       // Teal
    'STRING': '#A1887F',       // Brown
    'BOOLEAN': '#90A4AE',      // Blue Grey
    'CONTROL_NET': '#009688',  // Teal Dark
    'STYLE_MODEL': '#AFB42B',  // Lime
    'CLIP_VISION': '#795548',  // Brown Dark
    'CLIP_VISION_OUTPUT': '#795548',  // Brown Dark
  };

  return colorMap[normalizedType] || '#10b981'; // Default to green if not found
}

// Note: enhanceNodeColor function removed for performance optimization

// Note: getOptimalTextColor function removed for performance optimization - using fixed white text

/**
 * Calculate bounds for all workflow elements
 */
export function calculateAllBounds(
  nodes: IComfyGraphNode[],
  groups?: IGroup[],
  config: CanvasConfig = DEFAULT_CANVAS_CONFIG,
  canvasWidth?: number,
  canvasHeight?: number
): { nodeBounds: Map<number, NodeBounds>; groupBounds: GroupBounds[] } {
  const nodeBounds = new Map<number, NodeBounds>();
  const groupBounds: GroupBounds[] = [];

  if (!nodes || nodes.length === 0) {
    return { nodeBounds, groupBounds };
  }

  // Calculate actual bounds to determine scaling
  const allElements: Array<{ x: number; y: number; width: number; height: number }> = [];

  // Add node positions with actual sizes
  for (const node of nodes) {
    let x = 0, y = 0;
    let width = config.nodeWidth;
    let height = config.nodeHeight;

    // Handle both Float32Array and regular arrays for position
    // Check all possible position properties
    const position = (node as any)._pos || node.pos || (node as any).position;
    if (position && (position instanceof Float32Array || Array.isArray(position)) && position.length >= 2) {
      // Use first two values as x,y position (works with both Float32Array and regular array)
      x = position[0];
      y = position[1];
    } else {
      // Fallback: arrange nodes in a grid
      const index = nodes.indexOf(node);
      const cols = Math.ceil(Math.sqrt(nodes.length));
      x = (index % cols) * 300;
      y = Math.floor(index / cols) * 200;
      console.warn(`⚠️ Node ${node.id} has no position, using grid fallback:`, { x, y });
    }

    // Handle both Float32Array and regular arrays for size
    // Check all possible size properties
    const nodeSize = (node as any)._size || node.size;
    if (nodeSize && (nodeSize instanceof Float32Array || Array.isArray(nodeSize)) && nodeSize.length >= 2) {
      width = Math.max(nodeSize[0], config.nodeWidth);
      height = Math.max(nodeSize[1], config.nodeHeight);
    }

    // Check if node is collapsed
    const isCollapsed = node.flags?.collapsed === true;
    if (isCollapsed) {
      width = 80;  // Fixed smaller width for collapsed nodes
      height = 30; // Fixed smaller height for collapsed nodes
    }

    allElements.push({ x, y, width, height });
  }

  // Add group bounds if available
  if (groups) {
    for (const group of groups) {
      // LiteGraph runtime uses _bounding, serialized uses bounding
      const bounding = (group as any)._bounding || group.bounding;
      if (!bounding) continue;

      const [gx, gy, gw, gh] = bounding;
      allElements.push({ x: gx, y: gy, width: gw, height: gh });
    }
  }

  if (allElements.length === 0) {
    return { nodeBounds, groupBounds };
  }

  // Calculate content bounds
  const minX = Math.min(...allElements.map(el => el.x));
  const minY = Math.min(...allElements.map(el => el.y));
  const maxX = Math.max(...allElements.map(el => el.x + el.width));
  const maxY = Math.max(...allElements.map(el => el.y + el.height));

  // Calculate scaling only if canvas dimensions are provided (for thumbnails)
  let scale = 1;
  if (canvasWidth && canvasHeight) {
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const availableWidth = canvasWidth - 2 * config.padding;
    const availableHeight = canvasHeight - 2 * config.padding;

    const scaleX = contentWidth > 0 ? availableWidth / contentWidth : 1;
    const scaleY = contentHeight > 0 ? availableHeight / contentHeight : 1;
    scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
  }

  // Apply scaling to nodes  
  for (const node of nodes) {
    let x = 0, y = 0;
    let width = config.nodeWidth;
    let height = config.nodeHeight;

    // Handle both Float32Array and regular arrays for position
    // Check all possible position properties
    const position = (node as any)._pos || node.pos || (node as any).position;
    if (position && (position instanceof Float32Array || Array.isArray(position)) && position.length >= 2) {
      // Use first two values as x,y position (works with both Float32Array and regular array)
      x = position[0];
      y = position[1];
    } else {
      // Fallback positioning
      const index = nodes.indexOf(node);
      const cols = Math.ceil(Math.sqrt(nodes.length));
      x = (index % cols) * 300;
      y = Math.floor(index / cols) * 200;
    }

    // Handle both Float32Array and regular arrays for size
    // Check all possible size properties
    const nodeSize = (node as any)._size || node.size;
    if (nodeSize && (nodeSize instanceof Float32Array || Array.isArray(nodeSize)) && nodeSize.length >= 2) {
      width = Math.max(nodeSize[0], config.nodeWidth);
      height = Math.max(nodeSize[1], config.nodeHeight);
    }

    // Check if collapsed
    const isCollapsed = node.flags?.collapsed === true;
    if (isCollapsed) {
      width = 80;  // Fixed smaller width for collapsed nodes
      height = 30; // Fixed smaller height for collapsed nodes
    }

    const scaledX = canvasWidth ? (x - minX) * scale + config.padding : x;
    const scaledY = canvasHeight ? (y - minY) * scale + config.padding : y;

    nodeBounds.set(node.id, {
      x: scaledX,
      y: scaledY,
      width: width * scale,
      height: height * scale,
      node
    });
  }

  // Apply scaling to groups
  if (groups) {
    for (const group of groups) {
      // LiteGraph runtime uses _bounding, serialized uses bounding
      const bounding = (group as any)._bounding || group.bounding;
      if (!bounding) continue;

      const [gx, gy, gw, gh] = bounding;

      // Use original group position and size without scaling
      const baseScaledX = gx;
      const baseScaledY = gy;
      const baseScaledWidth = gw;
      const baseScaledHeight = gh;

      const scaledX = canvasWidth ? (baseScaledX - minX) * scale + config.padding : baseScaledX;
      const scaledY = canvasHeight ? (baseScaledY - minY) * scale + config.padding : baseScaledY;
      const scaledWidth = baseScaledWidth * scale;
      const scaledHeight = baseScaledHeight * scale;

      groupBounds.push({
        x: scaledX,
        y: scaledY,
        width: scaledWidth,
        height: scaledHeight,
        title: group.title || '',
        color: group.color || config.groupColor,
      });
    }
  }

  return { nodeBounds, groupBounds };
}

/**
 * Render groups to canvas
 */
export function renderGroups(
  ctx: CanvasRenderingContext2D,
  groupBounds: GroupBounds[],
  config: CanvasConfig = DEFAULT_CANVAS_CONFIG,
  showText: boolean = true,
  viewportScale?: number,
  repositionMode?: {
    isActive: boolean;
    selectedNodeId: number | null;
    selectedGroupId: number | null;
    gridSnapEnabled: boolean;
    resizeMode?: {
      isActive: boolean;
      gripperType: 'corner' | 'edge';
      gripperPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right';
      originalSize: [number, number];
      originalPosition: [number, number];
    };
  } | null
): void {
  for (const group of groupBounds) {
    // Draw group background with slight transparency (no border)
    ctx.fillStyle = group.color + '80'; // Add 50% opacity
    ctx.fillRect(group.x, group.y, group.width, group.height);

    // Draw selection outline if this group is selected in repositioning mode
    if (repositionMode?.isActive && group.id !== undefined && repositionMode.selectedGroupId === group.id) {
      ctx.strokeStyle = '#3B82F6'; // Blue color (same as node selection)
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(group.x, group.y, group.width, group.height);
    }

    // Draw group title (only if showText is enabled)
    if (showText && group.title) {
      ctx.fillStyle = config.groupTextColor;

      // Calculate responsive font size for group title (same logic as node text)
      let groupFontSize = config.groupFontSize; // Default fallback

      if (viewportScale !== undefined) {
        // Linear interpolation from 0% to 80% (same as node text)
        const maxScale = 0.8;   // 80%
        const minFontSize = 52; // Font size at 0% (slightly larger than node text)
        const maxFontSize = 12; // Font size at 80%+ (slightly larger than node text)

        let fontSize: number;
        if (viewportScale >= maxScale) {
          fontSize = maxFontSize;
        } else {
          const progress = viewportScale / maxScale;
          fontSize = minFontSize - (progress * (minFontSize - maxFontSize));
        }

        groupFontSize = Math.max(12, Math.min(60, fontSize));
      }

      ctx.font = `bold ${groupFontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      // Position title at top-left of group with padding
      const titleX = group.x + 8;
      const titleY = group.y + 8;
      const maxTextWidth = group.width - 16; // Account for padding on both sides

      // Truncate text if too long (similar to node text logic)
      let truncatedTitle = group.title;
      const textMetrics = ctx.measureText(group.title);
      if (textMetrics.width > maxTextWidth) {
        // Truncate with ellipsis
        const ellipsis = '...';
        const ellipsisWidth = ctx.measureText(ellipsis).width;
        const availableWidth = maxTextWidth - ellipsisWidth;

        let truncated = group.title;
        while (ctx.measureText(truncated).width > availableWidth && truncated.length > 0) {
          truncated = truncated.slice(0, -1);
        }
        truncatedTitle = truncated + ellipsis;
      }

      ctx.fillText(truncatedTitle, titleX, titleY);
    }

    // Draw resize grippers if this group is selected in repositioning mode
    if (repositionMode?.isActive && group.id !== undefined &&
      repositionMode.selectedGroupId === group.id && !repositionMode?.resizeMode?.isActive) {
      drawResizeGrippers(
        ctx,
        group.x,
        group.y,
        group.width,
        group.height,
        viewportScale || 1
      );
    }
  }
}

/**
 * Calculate slot position on a node
 */
function getSlotPosition(
  nodeBounds: NodeBounds,
  slotIndex: number,
  slotCount: number,
  isOutput: boolean,
  isCollapsed: boolean = false
): { x: number; y: number } {
  // For collapsed nodes, always center the single slot
  if (isCollapsed) {
    const y = nodeBounds.y + nodeBounds.height / 2;
    const x = isOutput ? nodeBounds.x + nodeBounds.width : nodeBounds.x;
    return { x, y };
  }

  const slotHeight = 20; // Height per slot
  const topMargin = 35; // Fixed 35px from top (matching the slot rendering logic)

  // Calculate Y position - slots start from top margin, evenly spaced
  const y = nodeBounds.y + topMargin + (slotIndex * slotHeight) + (slotHeight / 2);

  // X position depends on whether it's input (left) or output (right)
  const x = isOutput ? nodeBounds.x + nodeBounds.width : nodeBounds.x;

  return { x, y };
}

/**
 * Render workflow links/connections to canvas
 */
export function renderConnections(
  ctx: CanvasRenderingContext2D,
  links: number[][] | IComfyGraphLink[],
  nodeBounds: Map<number, NodeBounds>,
  config: CanvasConfig = DEFAULT_CANVAS_CONFIG
): void {
  ctx.lineWidth = 2.5; // Increased from 1.5 to 2.5
  ctx.setLineDash([]);

  for (const link of links) {
    let sourceNodeId: number, sourceSlot: number, targetNodeId: number, targetSlot: number;

    // Handle both array and object formats
    if (Array.isArray(link) && link.length >= 5) {
      // Array format: [linkId, sourceNodeId, sourceSlot, targetNodeId, targetSlot, type]
      [, sourceNodeId, sourceSlot, targetNodeId, targetSlot] = link;
    } else if (typeof link === 'object' && link !== null) {
      // Object format: { id, origin_id, origin_slot, target_id, target_slot, type }
      const linkObj = link as IComfyGraphLink;
      sourceNodeId = linkObj.origin_id;
      sourceSlot = linkObj.origin_slot;
      targetNodeId = linkObj.target_id;
      targetSlot = linkObj.target_slot;

    } else {
      console.warn('🔗 Skipping invalid link:', link);
      continue;
    }
    const sourceBounds = nodeBounds.get(sourceNodeId);
    const targetBounds = nodeBounds.get(targetNodeId);

    if (!sourceBounds || !targetBounds) {
      continue;
    }

    // Get the actual nodes to access slot information
    const sourceNode = sourceBounds.node;
    const targetNode = targetBounds.node;

    // Determine connection color based on source output slot type
    let connectionColor = config.linkColor; // Default fallback
    if (sourceNode.outputs && sourceNode.outputs[sourceSlot]) {
      let type = sourceNode.outputs[sourceSlot].type;

      // If source type is wildcard '*', try to use target input type
      if (type === '*' && targetNode.inputs && targetNode.inputs[targetSlot]) {
        type = targetNode.inputs[targetSlot].type;
      }

      connectionColor = getSlotColor(type);
    }

    // Check if nodes are collapsed or too small to fit slots
    const sourceConnectedInputs = sourceNode.inputs?.filter((i: any) => i.link).length || 0;
    const sourceConnectedOutputs = sourceNode.outputs?.filter((o: any) => o.links?.length > 0).length || 0;
    const sourceMaxSlots = Math.max(sourceConnectedInputs, sourceConnectedOutputs);
    const sourceSlotAreaHeight = sourceMaxSlots * 20 + 35;
    const sourceCollapsed = sourceNode.flags?.collapsed === true || sourceSlotAreaHeight > sourceBounds.height;

    const targetConnectedInputs = targetNode.inputs?.filter((i: any) => i.link).length || 0;
    const targetConnectedOutputs = targetNode.outputs?.filter((o: any) => o.links?.length > 0).length || 0;
    const targetMaxSlots = Math.max(targetConnectedInputs, targetConnectedOutputs);
    const targetSlotAreaHeight = targetMaxSlots * 20 + 35;
    const targetCollapsed = targetNode.flags?.collapsed === true || targetSlotAreaHeight > targetBounds.height;

    // For expanded nodes, calculate the visual index among connected slots only
    let sourceVisualIndex = sourceSlot;
    let targetVisualIndex = targetSlot;

    if (!sourceCollapsed && sourceNode.outputs) {
      // Count connected outputs before this slot
      let connectedCount = 0;
      for (let i = 0; i < sourceSlot; i++) {
        if (sourceNode.outputs[i]?.links && sourceNode.outputs[i].links!.length > 0) {
          connectedCount++;
        }
      }
      sourceVisualIndex = connectedCount;
    }

    if (!targetCollapsed && targetNode.inputs) {
      // Count connected inputs before this slot
      let connectedCount = 0;
      for (let i = 0; i < targetSlot; i++) {
        if (targetNode.inputs[i]?.link) {
          connectedCount++;
        }
      }
      targetVisualIndex = connectedCount;
    }

    // Calculate actual slot positions using visual indices
    const sourcePos = getSlotPosition(
      sourceBounds,
      sourceVisualIndex,
      sourceNode.outputs?.length || 1,
      true, // is output
      sourceCollapsed
    );

    const targetPos = getSlotPosition(
      targetBounds,
      targetVisualIndex,
      targetNode.inputs?.length || 1,
      false, // is input
      targetCollapsed
    );

    // Set color for this specific connection
    ctx.strokeStyle = connectionColor;

    // Draw bezier curve connection
    ctx.beginPath();
    ctx.moveTo(sourcePos.x, sourcePos.y);

    const controlPointOffset = Math.abs(targetPos.x - sourcePos.x) * 0.5;
    const cp1X = sourcePos.x + controlPointOffset;
    const cp1Y = sourcePos.y;
    const cp2X = targetPos.x - controlPointOffset;
    const cp2Y = targetPos.y;

    ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, targetPos.x, targetPos.y);
    ctx.stroke();
  }
}

/**
 * Render workflow nodes to canvas
 */
export function renderNodes(
  ctx: CanvasRenderingContext2D,
  nodes: ComfyGraphNode[], // Properly typed as ComfyGraphNode array
  nodeBounds: Map<number, NodeBounds>,
  config: CanvasConfig = DEFAULT_CANVAS_CONFIG,
  options: RenderingOptions = {}
): void {
  const { selectedNode, executingNodeId, errorNodeId, nodeExecutionProgress, showText = true, viewportScale, modifiedNodeIds, modifiedWidgetValues, repositionMode, connectionMode, missingNodeIds, longPressState, visibleRect } = options;

  // Sort nodes by collapsed state first, then connection mode priority, then by order
  // Lower values are drawn first (behind), higher values are drawn last (in front)
  const sortedNodes = [...nodes].sort((a, b) => {
    const aCollapsed = a.flags?.collapsed === true;
    const bCollapsed = b.flags?.collapsed === true;

    // If one is collapsed and the other isn't, collapsed goes first (behind)
    if (aCollapsed && !bCollapsed) return -1;
    if (!aCollapsed && bCollapsed) return 1;

    // Connection mode z-order priority (higher priority = drawn later = on top)
    const getConnectionPriority = (node: any) => {
      if (!connectionMode?.isActive) return 0;

      // Source and target nodes get highest priority
      if (connectionMode.sourceNodeId === node.id) return 1000;
      if (connectionMode.targetNodeId === node.id) return 1000;

      // Compatible nodes get medium priority (above normal nodes, below source/target)
      if (connectionMode.phase === 'TARGET_SELECTION' &&
        connectionMode.compatibleNodeIds.has(node.id) &&
        connectionMode.sourceNodeId !== node.id) {
        return 500;
      }

      return 0;
    };

    const aPriority = getConnectionPriority(a);
    const bPriority = getConnectionPriority(b);

    // If connection priorities are different, use them
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // If both have same collapsed state and connection priority, sort by order (execution/drawing order)
    const aOrder = a.order || 0;
    const bOrder = b.order || 0;
    return aOrder - bOrder;  // Lower order = drawn first (behind)
  });

  for (const node of sortedNodes) {
    const bounds = nodeBounds.get(node.id);
    if (!bounds) continue;

    const isSelected = selectedNode?.id === node.id;
    const isRepositionSelected = repositionMode?.isActive && repositionMode?.selectedNodeId === node.id;

    // Connection mode highlighting logic
    const isConnectionSourceSelected = connectionMode?.isActive && connectionMode?.sourceNodeId === node.id;
    const isConnectionTargetSelected = connectionMode?.isActive && connectionMode?.targetNodeId === node.id;
    const isConnectionCompatible = connectionMode?.isActive &&
      connectionMode?.phase === 'TARGET_SELECTION' &&
      connectionMode?.compatibleNodeIds.has(node.id) &&
      connectionMode?.sourceNodeId !== node.id; // Don't highlight source as compatible target
    const isCollapsed = node.flags?.collapsed === true;
    const isExecuting = executingNodeId === String(node.id);
    const isError = errorNodeId === String(node.id);
    const isMuted = node.mode === 2; // Mode 2 = Mute/Never
    const isBypassed = node.mode === 4; // Mode 4 = Bypass
    const isInactive = isMuted || isBypassed; // Both muted and bypassed are inactive
    const hasModifications = modifiedNodeIds?.has(node.id) || false;
    const isMissingNodeType = missingNodeIds?.has(node.id) || false;

    // Check visibility if visibleRect is provided
    let isVisible = true;
    if (visibleRect) {
      // Add a small buffer (e.g. 50px) to prevent pop-in artifacts at edges
      const buffer = 50;
      isVisible = (
        bounds.x < visibleRect.maxX + buffer &&
        bounds.x + bounds.width > visibleRect.minX - buffer &&
        bounds.y < visibleRect.maxY + buffer &&
        bounds.y + bounds.height > visibleRect.minY - buffer
      );
    }

    // Save context state for opacity
    ctx.save();

    // Apply 35% opacity for inactive nodes (muted or bypassed)
    if (isInactive) {
      ctx.globalAlpha = 0.35;
    }

    // No shadows for better performance
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Use simple, solid colors for better performance
    let backgroundColor = config.defaultNodeColor;

    // Inactive nodes get special colors
    if (isMuted) {
      backgroundColor = '#3b82f6'; // Blue color for muted nodes
    } else if (isBypassed) {
      backgroundColor = '#9333ea'; // Purple color for bypassed nodes
    } else if (isExecuting) {
      // Executing nodes get green background color
      backgroundColor = '#10b981'; // Green background for executing nodes
    } else {
      if (node.bgcolor) {
        backgroundColor = node.bgcolor;
      } else {
        backgroundColor = '#2e2e2e';
      }

      // Simple state modifications without complex color enhancement
      if (isSelected) {
        backgroundColor = config.selectedNodeColor;
      } else if (isConnectionSourceSelected) {
        backgroundColor = '#1e40af'; // Blue background for selected source node
      } else if (isConnectionTargetSelected) {
        backgroundColor = '#dc2626'; // Red background for selected target node
      } else if (isConnectionCompatible) {
        backgroundColor = '#22c55e'; // Light green for compatible target nodes
      } else if (isCollapsed) {
        backgroundColor = darkenColor(backgroundColor, 0.15); // Simple darkening for collapsed
      }
    }

    // Simple rectangular nodes for maximum performance
    const cornerRadius = 4; // Minimal rounding to reduce GPU load

    {
      // Check if node is executing and has progress for gradient background
      const hasProgress = isExecuting && nodeExecutionProgress?.nodeId === String(node.id);

      if (hasProgress) {
        const currentProgress = nodeExecutionProgress.progress;
        const progressRatio = Math.max(0, Math.min(1, currentProgress / 100));

        // Create horizontal gradient for progress
        const gradient = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y);
        const baseGreen = '#10b981';    // Base green for executing nodes
        const lighterGreen = darkenColor(baseGreen, -0.3); // Lighter version of same color (negative = brighter)

        // Add gradient stops based on progress
        if (progressRatio > 0) {
          gradient.addColorStop(0, lighterGreen);
          if (progressRatio < 1) {
            gradient.addColorStop(progressRatio, lighterGreen);
            gradient.addColorStop(progressRatio, baseGreen);
          }
        }
        if (progressRatio < 1) {
          gradient.addColorStop(1, baseGreen);
        }

        ctx.fillStyle = gradient;
      } else {
        // Draw simple solid background
        ctx.fillStyle = backgroundColor;
      }

      ctx.beginPath();
      ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, cornerRadius);
      ctx.fill();
    }

    // Always draw subtle white outline for all nodes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // 20% opacity white
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, cornerRadius);
    ctx.stroke();

    // Additional border for special states
    if (isSelected || isError || hasModifications || isRepositionSelected ||
      isConnectionSourceSelected || isConnectionTargetSelected || isConnectionCompatible || isMissingNodeType) {
      let strokeColor = '#ffffff'; // Simple white for selected
      let lineWidth = 2;

      if (isMissingNodeType) {
        strokeColor = '#dc2626'; // Red border for missing node types
        lineWidth = 3;
      } else if (isError) {
        strokeColor = '#ef4444'; // Simple red for errors
        lineWidth = 2;
      } else if (hasModifications) {
        strokeColor = '#10b981'; // Simple green for nodes with temporary changes
        lineWidth = 6;
      } else if (isRepositionSelected) {
        strokeColor = '#3b82f6'; // Blue for repositioning selection
        lineWidth = 3;
      } else if (isConnectionSourceSelected) {
        strokeColor = '#3b82f6'; // Bright blue border for source node
        lineWidth = 4;
      } else if (isConnectionTargetSelected) {
        strokeColor = '#ef4444'; // Bright red border for target node
        lineWidth = 4;
      } else if (isConnectionCompatible) {
        strokeColor = '#16a34a'; // Green border for compatible nodes
        lineWidth = 3;
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;

      // Draw special state border
      ctx.beginPath();
      ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, cornerRadius);
      ctx.stroke();
    }


    // Draw node title and widgets with LOD rendering
    // Optimization: Only draw detailed content (text, widgets) if the node is visible
    if (showText && isVisible) {
      // Use viewport scale if provided, otherwise fallback to transform matrix
      let currentScale = 1.0; // Default scale

      if (viewportScale !== undefined) {
        currentScale = viewportScale;
      } else {
        const transform = ctx.getTransform();
        currentScale = transform.a; // a is the horizontal scale factor
      }

      // LOD (Level of Detail) thresholds
      const LOD_LOW = 0.5;     // Below 50% - very simplified
      const LOD_MEDIUM = 0.8;  // 50% to 80% - basic widgets
      const LOD_HIGH = 1.2;    // 80% to 120% - detailed widgets
      // Above 120% - full detail with values

      // Determine LOD level
      let lodLevel: 'low' | 'medium' | 'high' | 'ultra';
      if (currentScale < LOD_LOW) {
        lodLevel = 'low';
      } else if (currentScale < LOD_MEDIUM) {
        lodLevel = 'medium';
      } else if (currentScale < LOD_HIGH) {
        lodLevel = 'high';
      } else {
        lodLevel = 'ultra';
      }

      // Calculate font sizes
      const maxScale = 0.8;
      const minFontSize = 50;
      const maxFontSize = 10;

      let fontSize: number;
      if (currentScale >= maxScale) {
        fontSize = maxFontSize;
      } else {
        const progress = currentScale / maxScale;
        fontSize = minFontSize - (progress * (minFontSize - maxFontSize));
      }

      const clampedFontSize = Math.max(15, Math.min(60, fontSize));
      const finalFontSize = isCollapsed
        ? Math.min(clampedFontSize * 0.8, bounds.height / 3)
        : clampedFontSize;

      const displayText = node.title || node.type || `Node ${node.id}`;

      // Calculate if node is too small to show slots properly
      const connectedInputs = node.inputs?.filter((i: any) => i.link).length || 0;
      const connectedOutputs = node.outputs?.filter((o: any) => o.links?.length > 0).length || 0;
      const maxSlots = Math.max(connectedInputs, connectedOutputs);
      const requiredSlotHeight = maxSlots * 20 + 35; // slots * slotHeight + topMargin
      const isTooSmallForSlots = bounds.height < requiredSlotHeight;

      // Handle collapsed nodes or nodes too small for slots - title in center, no widgets
      if (isCollapsed || isTooSmallForSlots) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `${finalFontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textX = bounds.x + bounds.width / 2;
        const textY = bounds.y + bounds.height / 2;
        const maxTextWidth = bounds.width - 16;

        // Truncate text if too long
        let truncatedText = displayText;
        const textMetrics = ctx.measureText(displayText);
        if (textMetrics.width > maxTextWidth) {
          const ellipsis = '...';
          const ellipsisWidth = ctx.measureText(ellipsis).width;
          const availableWidth = maxTextWidth - ellipsisWidth;

          let truncated = displayText;
          while (ctx.measureText(truncated).width > availableWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
          }
          truncatedText = truncated + ellipsis;
        }

        ctx.fillText(truncatedText, textX, textY);
      } else {
        // Expanded nodes - title at top-left, widgets below with LOD
        // Always show title at top-left for expanded nodes
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.min(finalFontSize * 0.8, 20)}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // Draw title at top-left with padding
        const titleX = bounds.x + 12;
        const titleY = bounds.y + 8;
        ctx.fillText(displayText, titleX, titleY);

        // Calculate slot area to avoid overlap
        let slotAreaHeight = 0;
        if (node.inputs || node.outputs) {
          const connectedInputs = node.inputs?.filter((i: any) => i.link).length || 0;
          const connectedOutputs = node.outputs?.filter((o: any) => o.links?.length > 0).length || 0;
          const maxSlots = Math.max(connectedInputs, connectedOutputs);
          slotAreaHeight = maxSlots * 20 + 35; // slots * slotHeight + fixed topMargin (35px)
        }

        // Check if node is too small to fit slots properly - treat as collapsed
        const treatAsCollapsed = slotAreaHeight > bounds.height;

        // Draw widgets with LOD system - below slot area (only if not treating as collapsed)
        if (!treatAsCollapsed && node.widgets && node.getWidgets) {
          const widgets = node.getWidgets();
          if (widgets.length > 0) {
            // Widget area starts below title and slot area
            const widgetStartY = Math.max(titleY + 30, bounds.y + slotAreaHeight + 10);
            const widgetHeight = 24;
            const widgetSpacing = 4;
            const widgetLineHeight = widgetHeight + widgetSpacing;

            // First, collect IMAGE/VIDEO widgets and initiate loading
            const imageWidgets: { widget: any; value: string }[] = [];
            const shouldInitiateLoading = !nodeImageLoadingInitiated.has(node.id);
            if (shouldInitiateLoading) {
              nodeImageLoadingInitiated.add(node.id);
            }

            for (const widget of widgets) {
              const name = (widget.name || '').toLowerCase();
              // Check modifiedWidgetValues first, then fall back to widget.value
              const modifiedValues = modifiedWidgetValues?.get(node.id);
              const value = modifiedValues?.[widget.name] !== undefined ? modifiedValues[widget.name] : widget.value;

              // Check if it's an IMAGE or VIDEO widget
              if ((name.includes('image') || name.includes('img') || name.includes('video') ||
                name === 'filename' || name === 'file' || name === 'input') &&
                value && typeof value === 'string' &&
                (value.includes('.') || value.includes('/'))) {
                imageWidgets.push({ widget, value });

                // Track this image for the node
                if (!nodeImageMap.has(node.id)) {
                  nodeImageMap.set(node.id, new Set());
                }
                nodeImageMap.get(node.id)!.add(value);

                // Only initiate loading on first render of this node
                if (shouldInitiateLoading && !imageCache.has(value) && !imageLoadingPromises.has(value)) {
                  loadComfyImage(value, node.id).then(img => {
                    // Request a redraw when image loads
                    if (ctx.canvas && ctx.canvas.parentElement) {
                      ctx.canvas.dispatchEvent(new Event('imageLoaded'));
                    }
                  }).catch(err => {
                    console.log('Failed to load preview image:', value);
                  });
                }
              }
            }

            // Calculate available height for widgets - widgets are prioritized
            const availableHeight = bounds.height - (widgetStartY - bounds.y) - 10;
            const totalWidgetHeight = widgets.length * widgetLineHeight;
            const maxWidgetsToShow = Math.min(widgets.length, Math.floor(availableHeight / widgetLineHeight));
            const allWidgetsShown = widgets.length === maxWidgetsToShow;

            if (maxWidgetsToShow > 0) {
              // Render widgets based on LOD level
              widgets.slice(0, maxWidgetsToShow).forEach((widget, index) => {
                const widgetY = widgetStartY + (index * widgetLineHeight);
                const widgetX = bounds.x + 8;
                const widgetWidth = bounds.width - 16;

                // Check if this widget is connected (receives value from another node)
                const isConnectedWidget = node.inputs?.some((input: any) =>
                  input.widget?.name === widget.name && input.link !== null && input.link !== undefined
                );

                // Draw widget background with rounded corners
                const bgAlpha = lodLevel === 'ultra' ? 0.15 : (lodLevel === 'high' ? 0.1 : 0.05);

                if (isConnectedWidget) {
                  // Connected widget - green border and lighter background
                  ctx.fillStyle = `rgba(16, 185, 129, ${bgAlpha})`;
                  ctx.strokeStyle = `rgba(16, 185, 129, 0.4)`;
                  ctx.lineWidth = 1.5;
                } else {
                  // Regular widget
                  ctx.fillStyle = `rgba(255, 255, 255, ${bgAlpha})`;
                  ctx.strokeStyle = `rgba(255, 255, 255, ${bgAlpha * 2})`;
                  ctx.lineWidth = 1;
                }

                ctx.beginPath();
                ctx.roundRect(widgetX, widgetY, widgetWidth, widgetHeight, 4);
                ctx.fill();
                if (lodLevel === 'ultra' || lodLevel === 'high') {
                  ctx.stroke();
                }

                // LOD-based widget rendering
                if (lodLevel === 'low') {
                  // Very simplified - just show colored bars
                  ctx.fillStyle = isConnectedWidget ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.3)';
                  ctx.fillRect(widgetX + 2, widgetY + 2, widgetWidth - 4, widgetHeight - 4);
                } else if (lodLevel === 'medium') {
                  // Show widget names only
                  ctx.fillStyle = isConnectedWidget ? 'rgba(16, 185, 129, 0.7)' : 'rgba(255, 255, 255, 0.5)';
                  ctx.font = `11px system-ui, -apple-system, sans-serif`;
                  ctx.textAlign = 'left';
                  ctx.textBaseline = 'middle';
                  const widgetName = widget.name || `Widget ${index}`;
                  ctx.fillText(widgetName, widgetX + 8, widgetY + widgetHeight / 2);

                  // Add "⤓" indicator for connected widgets
                  if (isConnectedWidget) {
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
                    ctx.textAlign = 'right';
                    ctx.fillText('⤓', widgetX + widgetWidth - 8, widgetY + widgetHeight / 2);
                  }
                } else if (lodLevel === 'high') {
                  // Show names and actual values (with lower opacity)
                  const widgetFontSize = 12;
                  ctx.font = `${widgetFontSize}px system-ui, -apple-system, sans-serif`;

                  // Widget name
                  ctx.fillStyle = isConnectedWidget ? 'rgba(16, 185, 129, 0.7)' : 'rgba(255, 255, 255, 0.7)';
                  ctx.textAlign = 'left';
                  ctx.textBaseline = 'middle';
                  const widgetName = widget.name || `Widget ${index}`;
                  const maxNameWidth = widgetWidth * 0.5;

                  let truncatedName = widgetName;
                  // Optimization: Pre-truncate huge strings
                  if (truncatedName.length > 50) {
                    truncatedName = truncatedName.substring(0, 50) + '...';
                  }

                  if (ctx.measureText(truncatedName).width > maxNameWidth) {
                    while (ctx.measureText(truncatedName + '...').width > maxNameWidth && truncatedName.length > 0) {
                      truncatedName = truncatedName.slice(0, -1);
                    }
                    truncatedName += '...';
                  }
                  ctx.fillText(truncatedName, widgetX + 8, widgetY + widgetHeight / 2);

                  // Show value only if not connected
                  if (isConnectedWidget) {
                    // Show arrow indicator for connected widgets
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
                    ctx.textAlign = 'right';
                    ctx.fillText('⤓', widgetX + widgetWidth - 8, widgetY + widgetHeight / 2);
                  } else {
                    // Show actual value with lower opacity
                    ctx.textAlign = 'right';
                    let valueText = '';
                    // Check modifiedWidgetValues first, then fall back to widget.value
                    const modifiedValues = modifiedWidgetValues?.get(node.id);
                    const value = modifiedValues?.[widget.name] !== undefined ? modifiedValues[widget.name] : widget.value;

                    if (value === null || value === undefined) {
                      valueText = 'null';
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    } else if (typeof value === 'boolean') {
                      valueText = value ? 'true' : 'false';
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    } else if (typeof value === 'number') {
                      valueText = Number.isInteger(value) ? value.toString() : value.toFixed(1);
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    } else if (typeof value === 'string') {
                      valueText = value;
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    } else if (Array.isArray(value)) {
                      valueText = `[${value.length}]`;
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    } else if (typeof value === 'object') {
                      valueText = '{...}';
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    } else {
                      valueText = String(value);
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    }

                    // Truncate value if too long
                    const maxValueWidth = widgetWidth * 0.4;
                    // Optimization: Pre-truncate huge strings
                    if (valueText.length > 50) {
                      valueText = valueText.substring(0, 50);
                    }

                    if (ctx.measureText(valueText).width > maxValueWidth) {
                      while (ctx.measureText(valueText + '...').width > maxValueWidth && valueText.length > 0) {
                        valueText = valueText.slice(0, -1);
                      }
                      valueText += '...';
                    }

                    ctx.fillText(valueText, widgetX + widgetWidth - 8, widgetY + widgetHeight / 2);
                  }
                } else {
                  // Ultra detail - full names and values
                  const widgetFontSize = 13;
                  ctx.font = `${widgetFontSize}px system-ui, -apple-system, sans-serif`;

                  // Widget name
                  ctx.fillStyle = isConnectedWidget ? 'rgba(16, 185, 129, 0.9)' : 'rgba(255, 255, 255, 0.8)';
                  ctx.textAlign = 'left';
                  ctx.textBaseline = 'middle';
                  const widgetName = widget.name || `Widget ${index}`;
                  const maxNameWidth = widgetWidth * 0.45;

                  let truncatedName = widgetName;
                  // Optimization: Pre-truncate huge strings
                  if (truncatedName.length > 50) {
                    truncatedName = truncatedName.substring(0, 50) + '...';
                  }

                  if (ctx.measureText(truncatedName).width > maxNameWidth) {
                    while (ctx.measureText(truncatedName + '...').width > maxNameWidth && truncatedName.length > 0) {
                      truncatedName = truncatedName.slice(0, -1);
                    }
                    truncatedName += '...';
                  }
                  ctx.fillText(truncatedName, widgetX + 8, widgetY + widgetHeight / 2);

                  // Show value only if not connected
                  if (isConnectedWidget) {
                    // Show "from input" indicator for connected widgets
                    ctx.fillStyle = 'rgba(16, 185, 129, 1)';
                    ctx.textAlign = 'right';
                    ctx.font = `${widgetFontSize}px system-ui, -apple-system, sans-serif`;
                    ctx.fillText('⤓', widgetX + widgetWidth - 8, widgetY + widgetHeight / 2);
                  } else {
                    // Widget value
                    ctx.textAlign = 'right';
                    let valueText = '';
                    // Check modifiedWidgetValues first, then fall back to widget.value
                    const modifiedValues = modifiedWidgetValues?.get(node.id);
                    const value = modifiedValues?.[widget.name] !== undefined ? modifiedValues[widget.name] : widget.value;

                    if (value === null || value === undefined) {
                      valueText = 'null';
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    } else if (typeof value === 'boolean') {
                      valueText = value ? 'true' : 'false';
                      ctx.fillStyle = '#ffffff';
                    } else if (typeof value === 'number') {
                      valueText = Number.isInteger(value) ? value.toString() : value.toFixed(2);
                      ctx.fillStyle = '#ffffff';
                    } else if (typeof value === 'string') {
                      valueText = value;
                      ctx.fillStyle = '#ffffff';
                    } else if (Array.isArray(value)) {
                      valueText = `[${value.length}]`;
                      ctx.fillStyle = '#8b5cf6';
                    } else if (typeof value === 'object') {
                      valueText = '{...}';
                      ctx.fillStyle = '#8b5cf6';
                    } else {
                      valueText = String(value);
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                    }

                    // Truncate value if too long
                    const maxValueWidth = widgetWidth * 0.45;
                    // Optimization: Pre-truncate huge strings
                    if (valueText.length > 100) {
                      valueText = valueText.substring(0, 100);
                    }

                    if (ctx.measureText(valueText).width > maxValueWidth) {
                      while (ctx.measureText(valueText + '...').width > maxValueWidth && valueText.length > 0) {
                        valueText = valueText.slice(0, -1);
                      }
                      valueText += '...';
                    }

                    ctx.fillText(valueText, widgetX + widgetWidth - 8, widgetY + widgetHeight / 2);
                  }
                }
              });

              // Show indicator if there are more widgets
              if (widgets.length > maxWidgetsToShow && lodLevel !== 'low') {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.font = `italic 11px system-ui, -apple-system, sans-serif`;
                ctx.textAlign = 'center';
                const moreText = `+${widgets.length - maxWidgetsToShow} more`;
                ctx.fillText(moreText, bounds.x + bounds.width / 2, bounds.y + bounds.height - 12);
              }

              // Draw image preview at bottom ONLY if all widgets are shown and we have images
              // Images are shown at ALL LOD levels for better visibility
              if (allWidgetsShown && imageWidgets.length > 0) {
                // Calculate the position and size for the preview area
                const widgetEndY = widgetStartY + (maxWidgetsToShow * widgetLineHeight);
                const remainingHeight = bounds.y + bounds.height - widgetEndY - 15; // Leave some padding

                if (remainingHeight > 40) { // Only show if we have reasonable space
                  const previewY = widgetEndY + 5;
                  const previewHeight = remainingHeight;
                  const previewPadding = 8;

                  // Use full remaining height
                  const imageHeight = previewHeight - previewPadding * 2;
                  const imageSpacing = 8;
                  const numImagesToShow = Math.min(imageWidgets.length, 3);

                  // Use same width as widgets - full width divided by number of images
                  const previewX = bounds.x + 8;
                  const previewWidth = bounds.width - 16;

                  // Width is fixed - divide widget width by number of images
                  const imageWidth = (previewWidth - (imageSpacing * (numImagesToShow - 1))) / numImagesToShow;

                  // Start from the left edge, same as widgets
                  let imageX = previewX;

                  for (let i = 0; i < numImagesToShow; i++) {
                    const { value } = imageWidgets[i];

                    // Check if image is in cache
                    if (imageCache.has(value)) {
                      const img = imageCache.get(value)!;

                      // Track this cached image for the node if not already tracked
                      if (!nodeImageMap.has(node.id)) {
                        nodeImageMap.set(node.id, new Set());
                      }
                      nodeImageMap.get(node.id)!.add(value);

                      // Draw container with fixed width and dynamic height
                      ctx.save();
                      ctx.beginPath();
                      ctx.roundRect(imageX, previewY + previewPadding, imageWidth, imageHeight, 4);
                      ctx.clip();

                      // Fill width completely and crop height if needed (cover mode)
                      const aspectRatio = img.width / img.height;
                      const containerAspect = imageWidth / imageHeight;

                      let sourceX = 0, sourceY = 0, sourceWidth = img.width, sourceHeight = img.height;

                      if (aspectRatio > containerAspect) {
                        // Image is wider - crop width to fit height
                        sourceWidth = img.height * containerAspect;
                        sourceX = (img.width - sourceWidth) / 2;
                      } else {
                        // Image is taller - crop height to fit width
                        sourceHeight = img.width / containerAspect;
                        sourceY = (img.height - sourceHeight) / 2;
                      }

                      // Draw image to fill the entire container
                      ctx.drawImage(
                        img,
                        sourceX, sourceY, sourceWidth, sourceHeight,  // Source (what part of image to draw)
                        imageX, previewY + previewPadding, imageWidth, imageHeight  // Destination (where to draw)
                      );
                      ctx.restore();

                      // Draw border
                      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                      ctx.lineWidth = 1;
                      ctx.beginPath();
                      ctx.roundRect(imageX, previewY + previewPadding, imageWidth, imageHeight, 4);
                      ctx.stroke();
                    } else {
                      // Draw placeholder for loading
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                      ctx.beginPath();
                      ctx.roundRect(imageX, previewY + previewPadding, imageWidth, imageHeight, 4);
                      ctx.fill();

                      // Draw error indicator for failed image loads
                      ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
                      const fontSize = Math.min(32, Math.min(imageWidth, imageHeight) / 3);
                      ctx.font = `${fontSize}px system-ui`;
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.fillText('⚠', imageX + imageWidth / 2, previewY + previewPadding + imageHeight / 2);

                      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                      ctx.lineWidth = 1;
                      ctx.beginPath();
                      ctx.roundRect(imageX, previewY + previewPadding, imageWidth, imageHeight, 4);
                      ctx.stroke();
                    }

                    imageX += imageWidth + imageSpacing;
                  }

                  // Show count if more than 3 images
                  if (imageWidgets.length > 3) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    ctx.font = '12px system-ui';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`+${imageWidgets.length - 3}`, imageX - imageSpacing / 2, previewY + previewHeight / 2);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Draw input and output slots
    // Optimization: Only draw slots if visible
    if (showText && isVisible) { // Only draw slots when text is shown (detail view)
      const slotRadius = 4;
      const slotHeight = 20;

      // Check if node is too small to fit slots properly (use treatAsCollapsed from widget section)
      const connectedInputs = node.inputs?.filter((i: any) => i.link).length || 0;
      const connectedOutputs = node.outputs?.filter((o: any) => o.links?.length > 0).length || 0;
      const maxSlots = Math.max(connectedInputs, connectedOutputs);
      const slotAreaHeight = maxSlots * 20 + 35;
      const treatAsCollapsed = isCollapsed || slotAreaHeight > bounds.height;

      const topMargin = treatAsCollapsed ? bounds.height * 0.05 : 35; // Fixed 35px for expanded nodes, 5% for collapsed

      // Get current font size for slot labels
      const slotFontSize = 10; // Fixed small size for slot labels

      // Check if collapsed - collapsed nodes show only one slot
      if (treatAsCollapsed) {
        // For collapsed nodes, show single slot on each side if there are connections
        const hasInputConnections = node.inputs?.some((input: any) => input.link);
        const hasOutputConnections = node.outputs?.some((output: any) => output.links && output.links.length > 0);

        // Draw single input slot if there are connections
        if (hasInputConnections) {
          const slotY = bounds.y + bounds.height / 2;
          const slotX = bounds.x;

          // Try to get color from first connected input
          let slotColor = '#10b981';
          const validInput = node.inputs?.find((i: any) => i.link);
          if (validInput) {
            slotColor = getSlotColor(validInput.type);
          }

          ctx.fillStyle = slotColor; // Use determined color
          ctx.beginPath();
          ctx.arc(slotX, slotY, slotRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw single output slot if there are connections
        if (hasOutputConnections) {
          const slotY = bounds.y + bounds.height / 2;
          const slotX = bounds.x + bounds.width;

          // Try to get color from first connected output
          let slotColor = '#10b981';
          const validOutput = node.outputs?.find((o: any) => o.links && o.links.length > 0);
          if (validOutput) {
            slotColor = getSlotColor(validOutput.type);
          }

          ctx.fillStyle = slotColor;
          ctx.beginPath();
          ctx.arc(slotX, slotY, slotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // For expanded nodes, show only connected slots
        // Draw connected input slots
        if (node.inputs && node.inputs.length > 0) {
          let connectedIndex = 0; // Track position for connected slots only
          node.inputs.forEach((input: any, index: number) => {
            // Only draw if connected
            if (!input.link) return;

            const slotY = bounds.y + topMargin + (connectedIndex * slotHeight) + (slotHeight / 2);
            const slotX = bounds.x;
            connectedIndex++; // Increment only for connected slots

            // Draw slot circle
            ctx.fillStyle = getSlotColor(input.type);
            ctx.beginPath();
            ctx.arc(slotX, slotY, slotRadius, 0, Math.PI * 2);
            ctx.fill();

            // Draw slot label (only if enough space)
            if (bounds.width > 100) {
              ctx.fillStyle = '#ffffff';
              ctx.font = `${slotFontSize}px system-ui, -apple-system, sans-serif`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              const labelText = input.name || input.type || '';
              const maxLabelWidth = bounds.width * 0.3;

              // Truncate if too long
              let truncatedLabel = labelText;
              if (ctx.measureText(labelText).width > maxLabelWidth) {
                while (ctx.measureText(truncatedLabel + '...').width > maxLabelWidth && truncatedLabel.length > 0) {
                  truncatedLabel = truncatedLabel.slice(0, -1);
                }
                truncatedLabel += '...';
              }

              ctx.fillText(truncatedLabel, slotX + slotRadius + 4, slotY);
            }
          });
        }

        // Draw connected output slots
        if (node.outputs && node.outputs.length > 0) {
          let connectedIndex = 0; // Track position for connected slots only
          node.outputs.forEach((output: any, index: number) => {
            // Only draw if connected
            if (!output.links || output.links.length === 0) return;

            const slotY = bounds.y + topMargin + (connectedIndex * slotHeight) + (slotHeight / 2);
            const slotX = bounds.x + bounds.width;
            connectedIndex++; // Increment only for connected slots

            // Draw slot circle
            ctx.fillStyle = getSlotColor(output.type);
            ctx.beginPath();
            ctx.arc(slotX, slotY, slotRadius, 0, Math.PI * 2);
            ctx.fill();

            // Draw slot label (only if enough space)
            if (bounds.width > 100) {
              ctx.fillStyle = '#ffffff';
              ctx.font = `${slotFontSize}px system-ui, -apple-system, sans-serif`;
              ctx.textAlign = 'right';
              ctx.textBaseline = 'middle';
              const labelText = output.name || output.type || '';
              const maxLabelWidth = bounds.width * 0.3;

              // Truncate if too long
              let truncatedLabel = labelText;
              if (ctx.measureText(labelText).width > maxLabelWidth) {
                while (ctx.measureText(truncatedLabel + '...').width > maxLabelWidth && truncatedLabel.length > 0) {
                  truncatedLabel = truncatedLabel.slice(0, -1);
                }
                truncatedLabel += '...';
              }

              ctx.fillText(truncatedLabel, slotX - slotRadius - 4, slotY);
            }
          });
        }
      }
    }

    // Note: Progress is now shown as gradient background instead of separate progress bar

    // Draw execution state indicator
    if (isExecuting || isError) {
      const indicatorSize = 12;
      const indicatorX = bounds.x + bounds.width - indicatorSize - 4;
      const indicatorY = bounds.y + 4;

      ctx.fillStyle = isExecuting ? '#10b981' : '#ef4444';
      ctx.beginPath();
      ctx.arc(indicatorX + indicatorSize / 2, indicatorY + indicatorSize / 2, indicatorSize / 2, 0, Math.PI * 2);
      ctx.fill();

      // Add icon inside indicator
      ctx.fillStyle = '#ffffff';
      ctx.font = `${indicatorSize - 4}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        isExecuting ? '▶' : '✕',
        indicatorX + indicatorSize / 2,
        indicatorY + indicatorSize / 2
      );
    }

    // Restore context state (especially important for bypassed nodes with opacity)
    ctx.restore();

    // Draw resize grippers if this node is selected in repositioning mode (but not if collapsed)
    if (isRepositionSelected && !repositionMode?.resizeMode?.isActive && !isCollapsed) {
      drawResizeGrippers(
        ctx,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        viewportScale || 1
      );
    }
  }

  // Long press visual feedback is now handled by DOM overlay in WorkflowCanvas
  // This provides better reliability and positioning than canvas rendering
}

/**
 * Draw grid pattern on canvas background
 */
export function drawGridPattern(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  viewport: ViewportTransform
): void {
  const gridSize = 20; // Base grid size in pixels
  const dotSize = 1.5; // Size of grid dots

  // Calculate grid offset based on viewport position
  const offsetX = viewport.x % (gridSize * viewport.scale);
  const offsetY = viewport.y % (gridSize * viewport.scale);

  // Grid color (subtle dots)
  ctx.fillStyle = 'rgba(100, 116, 139, 0.3)'; // Slightly visible dots

  // Draw grid dots
  const scaledGridSize = gridSize * viewport.scale;

  // Only draw if grid is not too small or too large
  if (scaledGridSize > 5 && scaledGridSize < 100) {
    for (let x = offsetX; x < canvasWidth + scaledGridSize; x += scaledGridSize) {
      for (let y = offsetY; y < canvasHeight + scaledGridSize; y += scaledGridSize) {
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/**
 * Draw enhanced grid for repositioning mode
 */
export function drawRepositioningGrid(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  viewport: ViewportTransform
): void {
  const gridSize = 20; // Base grid size in pixels

  // Calculate grid offset based on viewport position
  const offsetX = viewport.x % (gridSize * viewport.scale);
  const offsetY = viewport.y % (gridSize * viewport.scale);

  // Draw grid lines (more visible than dots)
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)'; // Blue grid lines
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]); // Dashed lines

  const scaledGridSize = gridSize * viewport.scale;

  // Only draw if grid is large enough to be visible
  if (scaledGridSize > 8) {
    ctx.beginPath();

    // Draw vertical lines
    for (let x = offsetX; x < canvasWidth + scaledGridSize; x += scaledGridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
    }

    // Draw horizontal lines
    for (let y = offsetY; y < canvasHeight + scaledGridSize; y += scaledGridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
    }

    ctx.stroke();
  }

  // Reset line dash
  ctx.setLineDash([]);
}

/**
 * Draw resize grippers for selected node/group in repositioning mode
 */
export function drawResizeGrippers(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  viewportScale: number = 1
): void {
  const gripperSize = 16; // Base gripper size in screen pixels
  const actualGripperSize = gripperSize / viewportScale; // Adjust for viewport scale
  const halfGripper = actualGripperSize / 2;

  // Gripper style
  ctx.fillStyle = '#3b82f6'; // Blue color matching selection border
  ctx.strokeStyle = '#ffffff'; // White border for visibility
  ctx.lineWidth = 1 / viewportScale; // Adjust line width for viewport scale

  // Calculate gripper positions
  const grippers = [
    // Corners (allow both width and height resize)
    { x: x - halfGripper, y: y - halfGripper, position: 'top-left' },
    { x: x + width - halfGripper, y: y - halfGripper, position: 'top-right' },
    { x: x - halfGripper, y: y + height - halfGripper, position: 'bottom-left' },
    { x: x + width - halfGripper, y: y + height - halfGripper, position: 'bottom-right' },

    // Edges (allow single dimension resize)
    { x: x + width / 2 - halfGripper, y: y - halfGripper, position: 'top' },
    { x: x + width / 2 - halfGripper, y: y + height - halfGripper, position: 'bottom' },
    { x: x - halfGripper, y: y + height / 2 - halfGripper, position: 'left' },
    { x: x + width - halfGripper, y: y + height / 2 - halfGripper, position: 'right' },
  ];

  // Draw each gripper
  for (const gripper of grippers) {
    ctx.fillRect(gripper.x, gripper.y, actualGripperSize, actualGripperSize);
    ctx.strokeRect(gripper.x, gripper.y, actualGripperSize, actualGripperSize);
  }
}

/**
 * Check if a point intersects with any resize gripper
 */
export function getGripperAtPoint(
  x: number,
  y: number,
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  viewportScale: number = 1
): { position: string; type: 'corner' | 'edge' } | null {
  const gripperSize = 16; // Base gripper size in screen pixels
  const actualGripperSize = gripperSize / viewportScale;
  const halfGripper = actualGripperSize / 2;
  const hitTestSize = Math.max(actualGripperSize, 32 / viewportScale); // Minimum 32px hit area for better touch
  const halfHitTest = hitTestSize / 2;

  // Define grippers with hit test areas
  const grippers = [
    // Corners
    {
      x: nodeX - halfHitTest,
      y: nodeY - halfHitTest,
      width: hitTestSize,
      height: hitTestSize,
      position: 'top-left',
      type: 'corner' as const
    },
    {
      x: nodeX + nodeWidth - halfHitTest,
      y: nodeY - halfHitTest,
      width: hitTestSize,
      height: hitTestSize,
      position: 'top-right',
      type: 'corner' as const
    },
    {
      x: nodeX - halfHitTest,
      y: nodeY + nodeHeight - halfHitTest,
      width: hitTestSize,
      height: hitTestSize,
      position: 'bottom-left',
      type: 'corner' as const
    },
    {
      x: nodeX + nodeWidth - halfHitTest,
      y: nodeY + nodeHeight - halfHitTest,
      width: hitTestSize,
      height: hitTestSize,
      position: 'bottom-right',
      type: 'corner' as const
    },

    // Edges
    {
      x: nodeX + nodeWidth / 2 - halfHitTest,
      y: nodeY - halfHitTest,
      width: hitTestSize,
      height: hitTestSize,
      position: 'top',
      type: 'edge' as const
    },
    {
      x: nodeX + nodeWidth / 2 - halfHitTest,
      y: nodeY + nodeHeight - halfHitTest,
      width: hitTestSize,
      height: hitTestSize,
      position: 'bottom',
      type: 'edge' as const
    },
    {
      x: nodeX - halfHitTest,
      y: nodeY + nodeHeight / 2 - halfHitTest,
      width: hitTestSize,
      height: hitTestSize,
      position: 'left',
      type: 'edge' as const
    },
    {
      x: nodeX + nodeWidth - halfHitTest,
      y: nodeY + nodeHeight / 2 - halfHitTest,
      width: hitTestSize,
      height: hitTestSize,
      position: 'right',
      type: 'edge' as const
    },
  ];

  // Check each gripper
  for (const gripper of grippers) {
    if (x >= gripper.x && x <= gripper.x + gripper.width &&
      y >= gripper.y && y <= gripper.y + gripper.height) {
      return { position: gripper.position, type: gripper.type };
    }
  }

  return null;
}

/**
 * Generate workflow thumbnail as base64 data URL
 */
export function generateWorkflowThumbnail(
  workflow: { nodes: IComfyGraphNode[]; links?: IComfyGraphLink[]; groups?: IGroup[] },
  canvasWidth: number = 400,
  canvasHeight: number = 300,
  config: CanvasConfig = DEFAULT_CANVAS_CONFIG
): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // Clear canvas with background color
  ctx.fillStyle = config.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!workflow.nodes || workflow.nodes.length === 0) {
    // Draw empty state
    ctx.fillStyle = config.textColor;
    ctx.font = `${config.fontSize + 2}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Empty Workflow', canvasWidth / 2, canvasHeight / 2);
    return canvas.toDataURL('image/png');
  }

  // Calculate bounds for all elements
  const { nodeBounds, groupBounds } = calculateAllBounds(
    workflow.nodes,
    workflow.groups,
    config,
    canvasWidth,
    canvasHeight
  );

  // Draw groups first (background layer) - no text for thumbnails
  if (groupBounds.length > 0) {
    renderGroups(ctx, groupBounds, config, false);
  }

  // Skip connections for thumbnails - cleaner appearance
  // Connection lines are omitted in thumbnails for better visual clarity

  // Draw nodes (foreground layer) - no text for thumbnails
  renderNodes(ctx, workflow.nodes as ComfyGraphNode[], nodeBounds, config, { showText: false });

  return canvas.toDataURL('image/png');
}