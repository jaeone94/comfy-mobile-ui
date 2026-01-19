import { useState, useCallback, useRef } from 'react';
import { WorkflowNode } from '@/shared/types/app/IComfyWorkflow';
import type { GroupBounds } from '@/shared/utils/rendering/CanvasRendererService';
import { mapGroupsWithNodes, Group } from '@/utils/GroupNodeMapper';
import { getGripperAtPoint } from '@/shared/utils/rendering/CanvasRendererService';
import { toast } from 'sonner';

interface ViewportTransform {
  x: number;
  y: number;
  scale: number;
}

interface TouchStartInfo {
  x: number;
  y: number;
  identifier: number;
  startTime: number;
  touchedNode?: WorkflowNode | null;
  touchedGroup?: GroupBounds | null;
  initialViewport: { x: number; y: number };
}

interface LongPressState {
  isActive: boolean;
  showProgress: boolean; // Separate flag for showing progress after 0.3s delay
  startTime: number;
  startX: number;
  startY: number;
  targetNode?: WorkflowNode | null;
  timeoutId?: NodeJS.Timeout | null;
  progressTimeoutId?: NodeJS.Timeout | null; // For the 0.3s delay
}

interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  node: WorkflowNode;
}

// GroupBounds is now imported from CanvasRendererService

interface RepositionMode {
  isActive: boolean;
  selectedNodeId: number | null;
  selectedGroupId: number | null; // Support for group repositioning
  originalPosition: [number, number] | null;
  currentPosition: [number, number] | null;
  gridSnapEnabled: boolean;
  originalNodePositions: Map<number, [number, number]>; // Store original positions of nodes in selected group
  resizeMode?: {
    isActive: boolean;
    gripperType: 'corner' | 'edge';
    gripperPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right';
    originalSize: [number, number];
    originalPosition: [number, number];
  };
}

interface UseCanvasInteractionProps {
  viewport: ViewportTransform;
  setViewport: React.Dispatch<React.SetStateAction<ViewportTransform>>;
  selectedNode: WorkflowNode | null;
  setSelectedNode: (node: WorkflowNode | null) => void;
  nodeBounds: Map<number, NodeBounds>;
  setNodeBounds: React.Dispatch<React.SetStateAction<Map<number, NodeBounds>>>;
  groupBounds: GroupBounds[]; // Add group bounds support
  setGroupBounds: React.Dispatch<React.SetStateAction<GroupBounds[]>>; // Add group bounds setter
  workflowGroups: Group[];  // For group-node relationships
  workflow?: any; // Add workflow data for real-time group-node mapping
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  workflowId?: string;
  connectionMode?: {
    isActive: boolean;
    phase: 'SOURCE_SELECTION' | 'TARGET_SELECTION' | 'SLOT_SELECTION';
    sourceNodeId: number | null;
    targetNodeId: number | null;
    compatibleNodeIds: Set<number>;
  } | null;
  // Long press callbacks
  onNodeLongPress?: (node: WorkflowNode, position: { x: number; y: number }) => void;
  onCanvasLongPress?: (position: { x: number; y: number }, screenPosition?: { x: number; y: number }) => void;
  // Context menu callbacks (for mouse)
  onNodeContextMenu?: (node: WorkflowNode, position: { x: number; y: number }) => void;
  onCanvasContextMenu?: (position: { x: number; y: number }, screenPosition?: { x: number; y: number }) => void;
  // Menu interaction
  isMenuOpen?: boolean;
  onMenuDrag?: (position: { x: number; y: number }) => void;
  onMenuRelease?: () => void;
}

export const useCanvasInteraction = ({
  viewport,
  setViewport,
  selectedNode,
  setSelectedNode,
  nodeBounds,
  setNodeBounds,
  groupBounds,
  setGroupBounds,
  workflowGroups,
  workflow,
  canvasRef,
  workflowId,
  connectionMode,
  onNodeLongPress,
  onCanvasLongPress,
  onNodeContextMenu,
  onCanvasContextMenu,
  isMenuOpen = false,
  onMenuDrag,
  onMenuRelease,
}: UseCanvasInteractionProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [mouseDownInfo, setMouseDownInfo] = useState<{
    x: number,
    y: number,
    time: number,
    clickedNode?: WorkflowNode | null,
    clickedGroup?: GroupBounds | null,
    initialViewport: { x: number, y: number }
  } | null>(null);
  const [touchStart, setTouchStart] = useState<TouchStartInfo | null>(null);
  const [pinchDistance, setPinchDistance] = useState<number | null>(null);
  const [lastTouchTime, setLastTouchTime] = useState<number>(0);
  const [lastTapInfo, setLastTapInfo] = useState<{
    time: number;
    x: number;
    y: number;
  } | null>(null);
  const [lastClickInfo, setLastClickInfo] = useState<{
    time: number;
    x: number;
    y: number;
  } | null>(null);
  const [activeTouchCount, setActiveTouchCount] = useState<number>(0);

  // Node add modal state
  const [isNodeAddModalOpen, setIsNodeAddModalOpen] = useState<boolean>(false);
  const [nodeAddPosition, setNodeAddPosition] = useState<{
    canvasX: number;
    canvasY: number;
    worldX: number;
    worldY: number
  } | null>(null);

  // Repositioning mode state
  const [repositionMode, setRepositionMode] = useState<RepositionMode>({
    isActive: false,
    selectedNodeId: null,
    selectedGroupId: null,
    originalPosition: null,
    currentPosition: null,
    gridSnapEnabled: true,
    originalNodePositions: new Map()
  });

  // tracking node changes
  const [nodeChanges, setNodeChanges] = useState<Array<{
    nodeId: number;
    newPosition: [number, number];
    originalPosition: [number, number];
  }>>([]);

  const [groupChanges, setGroupChanges] = useState<Array<{
    groupId: number;
    newPosition: [number, number];
    originalPosition: [number, number];
  }>>([]);

  // tracking resize changes
  const [resizeChanges, setResizeChanges] = useState<Array<{
    nodeId?: number;
    groupId?: number;
    newSize: [number, number];
    originalSize: [number, number];
    newPosition: [number, number];
    originalPosition: [number, number];
  }>>([]);


  // Store selected group's node list (calculated once when group is selected)
  const [selectedGroupNodeIds, setSelectedGroupNodeIds] = useState<number[]>([]);

  // Long press state
  const [longPressState, setLongPressState] = useState<LongPressState>({
    isActive: false,
    showProgress: false,
    startTime: 0,
    startX: 0,
    startY: 0,
    targetNode: null,
    timeoutId: null,
    progressTimeoutId: null,
  });

  // Constants for long press
  const LONG_PRESS_DURATION = 500; // Reduced from 1000
  const PROGRESS_DELAY = 150; // Delay before showing progress (half of 300)
  const LONG_PRESS_TOLERANCE = 8; // pixels
  const DRAG_THRESHOLD = 8; // pixels

  // Long press utility functions
  const clearLongPress = useCallback(() => {
    if (longPressState.timeoutId) {
      clearTimeout(longPressState.timeoutId);
    }
    if (longPressState.progressTimeoutId) {
      clearTimeout(longPressState.progressTimeoutId);
    }
    setLongPressState({
      isActive: false,
      showProgress: false,
      startTime: 0,
      startX: 0,
      startY: 0,
      targetNode: null,
      timeoutId: null,
      progressTimeoutId: null,
    });
  }, [longPressState.timeoutId, longPressState.progressTimeoutId]);

  // Removed complex progress tracking - CSS animation handles visual progress independently

  const startLongPress = useCallback((x: number, y: number, targetNode?: WorkflowNode | null, screenPos?: { x: number; y: number }) => {
    // Don't start long press if multiple touches are active
    if (activeTouchCount > 1) {
      return;
    }

    // Don't start long press if connection mode is active
    if (connectionMode?.isActive) {
      return;
    }

    clearLongPress();

    const startTime = Date.now();

    // First timeout: Show progress after 0.3 seconds
    const progressTimeoutId = setTimeout(() => {
      setLongPressState(prev => ({
        ...prev,
        showProgress: true,
        progressTimeoutId: null,
      }));
    }, PROGRESS_DELAY);

    // Second timeout: Complete long press after 1 second total
    const timeoutId = setTimeout(() => {
      // Long press completed - mark as completed before calling callback
      setLongPressState(prev => ({
        ...prev,
        timeoutId: null, // Mark as completed
      }));

      // Handle long press completion - simple and direct
      if (targetNode && onNodeLongPress) {
        // Node long press: Single-step connection mode activation
        // Pass SCREEN coordinates (x, y) which are preserved in closure
        onNodeLongPress(targetNode, screenPos || { x, y });
      } else if (!targetNode && onCanvasLongPress) {
        // Canvas long press: Enter reposition mode

        // CRITICAL FIX: onCanvasLongPress expects World Coordinates (logic in WorkflowEditor)
        // But for Circular Menu on Canvas, it might need Screen Coords?
        // WorkflowEditor's onCanvasLongPress currently converts World to Screen.
        // So we should pass World Coords here to maintain compatibility.
        // The bug was specific to onNodeLongPress being passed relative coords for menu.

        const worldX = (x - viewport.x) / viewport.scale;
        const worldY = (y - viewport.y) / viewport.scale;
        onCanvasLongPress({ x: worldX, y: worldY }, screenPos);
      }

      // Clear after a short delay to allow UI feedback to be visible
      setTimeout(() => {
        setLongPressState(prev => ({
          ...prev,
          isActive: false,
          showProgress: false,
        }));
      }, 100);
    }, LONG_PRESS_DURATION);

    setLongPressState({
      isActive: true,
      showProgress: false, // Progress will show after 0.3s delay
      startTime,
      startX: x,
      startY: y,
      targetNode: targetNode || null,
      timeoutId,
      progressTimeoutId,
    });
  }, [clearLongPress, onNodeLongPress, onCanvasLongPress, viewport, PROGRESS_DELAY, LONG_PRESS_DURATION, activeTouchCount, connectionMode]);

  const checkLongPressMovement = useCallback((currentX: number, currentY: number): boolean => {
    if (!longPressState.isActive) return false;

    const deltaX = Math.abs(currentX - longPressState.startX);
    const deltaY = Math.abs(currentY - longPressState.startY);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > LONG_PRESS_TOLERANCE) {
      console.log('🚫 [LongPress] Movement exceeded tolerance', { distance, tolerance: LONG_PRESS_TOLERANCE });
      clearLongPress();
      return false;
    }
    return true;
  }, [longPressState.isActive, longPressState.startX, longPressState.startY, clearLongPress]);

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Only handle left click (button 0) for selection and dragging
    // Right click (button 2) is handled by handleContextMenu
    if (e.button !== 0) return;

    // Ignore mouse events shortly after touch events (to prevent double-firing on mobile)
    const now = Date.now();
    if (now - lastTouchTime < 500) {
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Transform to world coordinates
    const worldX = (x - viewport.x) / viewport.scale;
    const worldY = (y - viewport.y) / viewport.scale;

    // Check if clicking on a node
    let clickedNode: WorkflowNode | null = null;
    nodeBounds.forEach((bounds) => {
      if (
        worldX >= bounds.x &&
        worldX <= bounds.x + bounds.width &&
        worldY >= bounds.y &&
        worldY <= bounds.y + bounds.height
      ) {
        clickedNode = bounds.node;
      }
    });

    // Check if clicking on a group (only if no node was clicked)  
    let clickedGroup: GroupBounds | null = null;
    if (!clickedNode && groupBounds.length > 0) {
      // Find the first matching group instead of overwriting with forEach
      for (const bounds of groupBounds) {
        if (
          bounds.id !== undefined &&
          worldX >= bounds.x &&
          worldX <= bounds.x + bounds.width &&
          worldY >= bounds.y &&
          worldY <= bounds.y + bounds.height
        ) {
          clickedGroup = bounds;
          break; // Stop at first match instead of overwriting
        }
      }
    }

    // Don't select node immediately - wait to see if user is dragging
    // Only clear selected node when clicking on background (immediate feedback for deselection)
    if (!clickedNode && selectedNode) {
      setSelectedNode(null);
    }

    // In repositioning mode, handle node/group selection immediately on mouse down
    if (repositionMode.isActive) {
      // First check if clicking on a gripper of the currently selected node/group
      let clickedGripper: { position: string; type: 'corner' | 'edge' } | null = null;

      if (repositionMode.selectedNodeId && clickedNode && (clickedNode as WorkflowNode).id === repositionMode.selectedNodeId) {
        // Check for gripper on selected node (but skip if collapsed)
        const bounds = nodeBounds.get(repositionMode.selectedNodeId);
        if (bounds) {
          const isCollapsed = bounds.node.flags?.collapsed === true;
          if (!isCollapsed) {
            clickedGripper = getGripperAtPoint(
              worldX, worldY,
              bounds.x, bounds.y, bounds.width, bounds.height,
              viewport.scale
            );
          }
        }
      } else if (repositionMode.selectedGroupId && clickedGroup && clickedGroup.id === repositionMode.selectedGroupId) {
        // Check for gripper on selected group
        clickedGripper = getGripperAtPoint(
          worldX, worldY,
          clickedGroup.x, clickedGroup.y, clickedGroup.width, clickedGroup.height,
          viewport.scale
        );
      }

      if (clickedGripper) {
        // Start resize mode
        startResize(clickedGripper.type, clickedGripper.position as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right');
      } else if (clickedNode) {
        // Select node for repositioning immediately on mouse down
        selectNodeForRepositioning((clickedNode as WorkflowNode).id);
      } else if (clickedGroup && (clickedGroup as GroupBounds).id !== undefined) {
        // Select group for repositioning immediately on mouse down
        selectGroupForRepositioning((clickedGroup as GroupBounds).id!);
      } else if (repositionMode.selectedNodeId || repositionMode.selectedGroupId) {
        // Deselect if clicking background
        setSelectedGroupNodeIds([]); // Clear group node list when clicking background
        setRepositionMode(prev => ({
          ...prev,
          selectedNodeId: null,
          selectedGroupId: null,
          originalPosition: null,
          currentPosition: null,
          originalNodePositions: new Map()
        }));
      }
    }

    // Start long press timer (ONLY FOR TOUCH)
    // We already check lastTouchTime < 500 above for mouse events, 
    // but to be explicit, mouse events should not trigger long press anymore.
    // (Existing mobile detection logic relies on latTouchTime)
    const isMouseEvent = !('touches' in e);
    if (!repositionMode.isActive && !isMouseEvent) {
      startLongPress(x, y, clickedNode || undefined, { x: e.clientX, y: e.clientY });
    }

    // Always store mouse down info for potential dragging (from anywhere on canvas)
    // Include clicked node info and initial viewport to decide later if we should select it
    setMouseDownInfo({
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      clickedNode,
      clickedGroup,
      initialViewport: { x: viewport.x, y: viewport.y }
    });
  };

  // Handle cursor feedback when hovering over grippers
  const handleMouseHover = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    if (!repositionMode.isActive) {
      // Reset cursor if not in repositioning mode
      canvas.style.cursor = '';
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Transform to world coordinates
    const worldX = (x - viewport.x) / viewport.scale;
    const worldY = (y - viewport.y) / viewport.scale;

    let cursor = '';

    // Check if hovering over gripper of selected node (but skip if collapsed)
    if (repositionMode.selectedNodeId) {
      const bounds = nodeBounds.get(repositionMode.selectedNodeId);
      if (bounds) {
        const isCollapsed = bounds.node.flags?.collapsed === true;
        if (!isCollapsed) {
          const gripper = getGripperAtPoint(
            worldX, worldY,
            bounds.x, bounds.y, bounds.width, bounds.height,
            viewport.scale
          );
          if (gripper) {
            cursor = getGripperCursor(gripper.position);
          }
        }
      }
    }

    // Check if hovering over gripper of selected group
    if (!cursor && repositionMode.selectedGroupId) {
      const groupBound = groupBounds.find(g => g.id === repositionMode.selectedGroupId);
      if (groupBound) {
        const gripper = getGripperAtPoint(
          worldX, worldY,
          groupBound.x, groupBound.y, groupBound.width, groupBound.height,
          viewport.scale
        );
        if (gripper) {
          cursor = getGripperCursor(gripper.position);
        }
      }
    }

    // Apply cursor
    canvas.style.cursor = cursor;
  };

  // Helper function to get cursor for gripper position
  const getGripperCursor = (position: string): string => {
    switch (position) {
      case 'top-left':
      case 'bottom-right':
        return 'nw-resize';
      case 'top-right':
      case 'bottom-left':
        return 'ne-resize';
      case 'top':
      case 'bottom':
        return 'n-resize';
      case 'left':
      case 'right':
        return 'e-resize';
      default:
        return '';
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Handle menu drag
    if (isMenuOpen && onMenuDrag) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        onMenuDrag({
          x: e.clientX,
          y: e.clientY
        });
      }
      return;
    }

    // Handle cursor feedback
    handleMouseHover(e);

    if (!mouseDownInfo) return;

    // Check long press movement tolerance
    if (longPressState.isActive) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        checkLongPressMovement(x, y);
      }
    }

    // Start dragging
    if (!isDragging && !longPressState.isActive) {
      const deltaX = Math.abs(e.clientX - mouseDownInfo.x);
      const deltaY = Math.abs(e.clientY - mouseDownInfo.y);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > DRAG_THRESHOLD) {
        setIsDragging(true);
      }
    }

    // Continue dragging if already started
    if (isDragging) {

      // Check if we're in repositioning mode with a selected node or group
      if (repositionMode.isActive) {
        // Handle resize mode
        if (repositionMode.resizeMode?.isActive) {
          handleResize(e.clientX - mouseDownInfo.x, e.clientY - mouseDownInfo.y);
        } else if (repositionMode.originalPosition && repositionMode.selectedNodeId && mouseDownInfo.clickedNode?.id === repositionMode.selectedNodeId) {
          // Repositioning mode - move the selected node using relative movement

          // Calculate mouse movement delta from mouse down position
          const deltaX = e.clientX - mouseDownInfo.x;
          const deltaY = e.clientY - mouseDownInfo.y;

          // Convert delta to world coordinates (accounting for scale)
          const worldDeltaX = deltaX / viewport.scale;
          const worldDeltaY = deltaY / viewport.scale;

          // Calculate new node position based on original position + delta
          const newX = repositionMode.originalPosition![0] + worldDeltaX;
          const newY = repositionMode.originalPosition![1] + worldDeltaY;

          // Apply smooth position calculation
          const [finalX, finalY] = calculateSmoothPosition(newX, newY);

          // Update the repositioning mode state with new position
          setRepositionMode(prev => ({
            ...prev,
            currentPosition: [finalX, finalY]
          }));

          // Update node position in bounds for real-time rendering
          updateNodePositionInBounds(repositionMode.selectedNodeId, finalX, finalY);
        } else if (repositionMode.selectedGroupId && mouseDownInfo.clickedGroup?.id === repositionMode.selectedGroupId) {
          // Repositioning mode - move the selected group using relative movement

          // Calculate mouse movement delta from mouse down position
          const deltaX = e.clientX - mouseDownInfo.x;
          const deltaY = e.clientY - mouseDownInfo.y;

          // Convert delta to world coordinates (accounting for scale)
          const worldDeltaX = deltaX / viewport.scale;
          const worldDeltaY = deltaY / viewport.scale;

          // Calculate new group position based on original position + delta
          const newX = repositionMode.originalPosition![0] + worldDeltaX;
          const newY = repositionMode.originalPosition![1] + worldDeltaY;

          // Apply smooth position calculation
          const [finalX, finalY] = calculateSmoothPosition(newX, newY);

          // Update the repositioning mode state with new position
          setRepositionMode(prev => ({
            ...prev,
            currentPosition: [finalX, finalY]
          }));

          // Update group position in bounds for real-time rendering
          updateGroupPositionInBounds(repositionMode.selectedGroupId, finalX, finalY);
        } else {
          // Repositioning mode but no node/group selected - move the viewport/canvas
          const deltaX = e.clientX - mouseDownInfo.x;
          const deltaY = e.clientY - mouseDownInfo.y;

          setViewport({
            ...viewport,
            x: mouseDownInfo.initialViewport.x + deltaX,
            y: mouseDownInfo.initialViewport.y + deltaY
          });
        }
      } else {
        // Normal mode - move the viewport/canvas
        const deltaX = e.clientX - mouseDownInfo.x;
        const deltaY = e.clientY - mouseDownInfo.y;

        setViewport({
          ...viewport,
          x: mouseDownInfo.initialViewport.x + deltaX,
          y: mouseDownInfo.initialViewport.y + deltaY
        });
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Only handle left click (button 0)
    if (e.button !== 0) return;

    if (isMenuOpen) {
      if (onMenuRelease) onMenuRelease();
      setMouseDownInfo(null); // Prevent phantom clicks
      return;
    }

    // Clear long press only if it's still in progress (not completed)
    if (longPressState.isActive && longPressState.timeoutId) {
      clearLongPress();
    }

    // Exit resize mode if active and save changes
    if (repositionMode.resizeMode?.isActive) {
      const { originalSize, originalPosition } = repositionMode.resizeMode;

      // Get current size and position after resize
      let currentSize: [number, number] = [0, 0];
      let currentPosition: [number, number] = [0, 0];
      let nodeId: number | undefined;
      let groupId: number | undefined;

      if (repositionMode.selectedNodeId) {
        nodeId = repositionMode.selectedNodeId;
        const bounds = nodeBounds.get(repositionMode.selectedNodeId);
        if (bounds) {
          currentSize = [bounds.width, bounds.height];
          currentPosition = [bounds.x, bounds.y];
        }
      } else if (repositionMode.selectedGroupId) {
        groupId = repositionMode.selectedGroupId;
        const group = groupBounds.find(g => g.id === repositionMode.selectedGroupId);
        if (group) {
          currentSize = [group.width, group.height];
          currentPosition = [group.x, group.y];
        }
      }

      // Only add to changes if size or position actually changed
      if (currentSize[0] !== originalSize[0] || currentSize[1] !== originalSize[1] ||
        currentPosition[0] !== originalPosition[0] || currentPosition[1] !== originalPosition[1]) {
        setResizeChanges(prev => {
          // Remove any existing resize change for this node/group
          const filtered = prev.filter(change =>
            (nodeId && change.nodeId !== nodeId) || (groupId && change.groupId !== groupId)
          );

          return [...filtered, {
            nodeId,
            groupId,
            newSize: currentSize,
            originalSize,
            newPosition: currentPosition,
            originalPosition
          }];
        });
      }

      setRepositionMode(prev => ({
        ...prev,
        resizeMode: undefined
      }));
    }

    // If we weren't dragging and had a mouse down, handle click/double-click logic
    if (!isDragging && mouseDownInfo) {
      // If we clicked on a node/group and didn't drag, select it now
      if (mouseDownInfo.clickedNode) {
        if (repositionMode.isActive) {
          // In repositioning mode, select node for repositioning instead of normal selection
          selectNodeForRepositioning(mouseDownInfo.clickedNode.id);
        } else {
          // Normal mode - open node inspector
          setSelectedNode(mouseDownInfo.clickedNode);
        }
      } else if (mouseDownInfo.clickedGroup && mouseDownInfo.clickedGroup.id) {
        if (repositionMode.isActive) {
          // In repositioning mode, select group for repositioning
          selectGroupForRepositioning(mouseDownInfo.clickedGroup.id);
        } else {
          // Normal mode - select group and create a group node for inspector
          selectGroupForInspection(mouseDownInfo.clickedGroup.id);
        }
      } else {
        // Handle double click detection for empty canvas
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          // Transform to world coordinates
          const worldX = (x - viewport.x) / viewport.scale;
          const worldY = (y - viewport.y) / viewport.scale;

          const currentClickInfo = {
            time: Date.now(),
            x: e.clientX,
            y: e.clientY
          };

          // Check if this is a double click
          if (lastClickInfo) {
            const timeDiff = currentClickInfo.time - lastClickInfo.time;
            const positionDiff = Math.sqrt(
              Math.pow(currentClickInfo.x - lastClickInfo.x, 2) +
              Math.pow(currentClickInfo.y - lastClickInfo.y, 2)
            );

            // Double click detected if:
            // 1. Second click within 500ms of first click
            // 2. Clicks are within 50 pixels of each other
            if (timeDiff < 500 && positionDiff < 50) {
              // Double click on empty canvas detected!
              // Skip AddNodeModal in repositioning mode
              if (!repositionMode.isActive) {
                handleDoubleTap({
                  canvasX: x,
                  canvasY: y,
                  worldX,
                  worldY
                });
              }

              // Clear the last click info to prevent triple-click issues
              setLastClickInfo(null);
            } else {
              // Single click or too far apart - store this click info
              setLastClickInfo(currentClickInfo);
            }
          } else {
            // First click - store click info
            setLastClickInfo(currentClickInfo);
          }
        }
      }
    }

    // Completely clean up all drag-related states
    setIsDragging(false);
    setMouseDownInfo(null);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Transform to world coordinates
    const worldX = (x - viewport.x) / viewport.scale;
    const worldY = (y - viewport.y) / viewport.scale;

    // Check if clicking on a node
    let clickedNode: WorkflowNode | null = null;
    nodeBounds.forEach((bounds) => {
      if (
        worldX >= bounds.x &&
        worldX <= bounds.x + bounds.width &&
        worldY >= bounds.y &&
        worldY <= bounds.y + bounds.height
      ) {
        clickedNode = bounds.node;
      }
    });

    if (clickedNode && onNodeContextMenu) {
      onNodeContextMenu(clickedNode, { x: e.clientX, y: e.clientY });
    } else if (!clickedNode && onCanvasContextMenu) {
      onCanvasContextMenu({ x: worldX, y: worldY }, { x: e.clientX, y: e.clientY });
    }
  };

  // Touch event handlers for mobile


  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // Update active touch count and last touch time
    setActiveTouchCount(e.touches.length);
    setLastTouchTime(Date.now());

    // Cancel any active long press if multi-touch detected
    if (e.touches.length > 1 && longPressState.isActive) {
      clearLongPress();
    }

    if (e.touches.length === 1) {
      // Single touch
      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      // Transform to world coordinates
      const worldX = (x - viewport.x) / viewport.scale;
      const worldY = (y - viewport.y) / viewport.scale;

      // First check if touching on a gripper (in repositioning mode)
      let touchedGripper: { position: string; type: 'corner' | 'edge' } | null = null;
      if (repositionMode.isActive) {
        // Check gripper on selected node (but skip if collapsed)
        if (repositionMode.selectedNodeId) {
          const bounds = nodeBounds.get(repositionMode.selectedNodeId);
          if (bounds) {
            const isCollapsed = bounds.node.flags?.collapsed === true;
            if (!isCollapsed) {
              touchedGripper = getGripperAtPoint(
                worldX, worldY,
                bounds.x, bounds.y, bounds.width, bounds.height,
                viewport.scale
              );
            }
          }
        }
        // Check gripper on selected group (if no node gripper found)
        if (!touchedGripper && repositionMode.selectedGroupId) {
          const groupBound = groupBounds.find(g => g.id === repositionMode.selectedGroupId);
          if (groupBound) {
            touchedGripper = getGripperAtPoint(
              worldX, worldY,
              groupBound.x, groupBound.y, groupBound.width, groupBound.height,
              viewport.scale
            );
          }
        }
      }

      // If gripper is touched, start resize mode immediately and skip node/group detection
      if (touchedGripper) {
        startResize(touchedGripper.type, touchedGripper.position as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right');

        // Store touch information for resize mode
        setTouchStart({
          x: touch.clientX,
          y: touch.clientY,
          identifier: touch.identifier,
          startTime: Date.now(),
          touchedNode: null, // No node touched, this is a gripper touch
          touchedGroup: null,
          initialViewport: { x: viewport.x, y: viewport.y }
        });
        return; // Exit early, skip normal node/group detection
      }

      // Check if touching a node (using Z-order priority)
      let touchedNode: WorkflowNode | null = null;
      let highestPriority = -Infinity;

      // Helper function to calculate connection mode priority (same as in CanvasRenderer)
      const getConnectionPriority = (node: WorkflowNode) => {
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

      nodeBounds.forEach((bounds) => {
        if (
          worldX >= bounds.x &&
          worldX <= bounds.x + bounds.width &&
          worldY >= bounds.y &&
          worldY <= bounds.y + bounds.height
        ) {
          // Calculate priority for this node (same logic as CanvasRenderer sorting)
          const isCollapsed = bounds.node.flags?.collapsed === true;
          let priority = bounds.node.order || 0;

          // Add collapsed penalty (collapsed nodes should be behind)
          if (isCollapsed) {
            priority -= 10000;
          }

          // Add connection mode priority
          priority += getConnectionPriority(bounds.node);

          if (priority > highestPriority) {
            highestPriority = priority;
            touchedNode = bounds.node;
          }
        }
      });

      // Check if touching a group (only if no node was touched)
      let touchedGroup: GroupBounds | null = null;
      if (!touchedNode && groupBounds.length > 0) {
        // Find the first matching group instead of overwriting with forEach
        for (const bounds of groupBounds) {
          if (
            bounds.id !== undefined &&
            worldX >= bounds.x &&
            worldX <= bounds.x + bounds.width &&
            worldY >= bounds.y &&
            worldY <= bounds.y + bounds.height
          ) {
            touchedGroup = bounds;
            break; // Stop at first match instead of overwriting
          }
        }
      }

      // Store touch information without immediately selecting node
      setTouchStart({
        x: touch.clientX,
        y: touch.clientY,
        identifier: touch.identifier,
        startTime: Date.now(),
        touchedNode: touchedNode,
        touchedGroup: touchedGroup,
        initialViewport: { x: viewport.x, y: viewport.y }
      });

      // Start long press timer (only if not in repositioning mode)
      if (!repositionMode.isActive) {
        startLongPress(
          touch.clientX - (canvasRef.current?.getBoundingClientRect().left || 0),
          touch.clientY - (canvasRef.current?.getBoundingClientRect().top || 0),
          touchedNode,
          { x: touch.clientX, y: touch.clientY }
        );
      }

      // Only clear selected node if touching background
      if (!touchedNode && selectedNode) {
        setSelectedNode(null);
      }

      // In repositioning mode, handle node/group selection immediately on touch down
      if (repositionMode.isActive) {
        if (touchedNode) {
          // Select node for repositioning immediately on touch down
          selectNodeForRepositioning((touchedNode as WorkflowNode).id);
        } else if (touchedGroup && (touchedGroup as GroupBounds).id !== undefined) {
          // Select group for repositioning immediately on touch down
          selectGroupForRepositioning((touchedGroup as GroupBounds).id!);
        } else if (repositionMode.selectedNodeId || repositionMode.selectedGroupId) {
          // Deselect if touching background
          setSelectedGroupNodeIds([]); // Clear group node list when touching background
          setRepositionMode(prev => ({
            ...prev,
            selectedNodeId: null,
            selectedGroupId: null,
            originalPosition: null,
            currentPosition: null,
            originalNodePositions: new Map()
          }));
        }
      }
    } else if (e.touches.length === 2) {
      // Two finger touch - prepare for pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setPinchDistance(Math.sqrt(dx * dx + dy * dy));

      // Clear touch start when switching to pinch
      setTouchStart(null);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isMenuOpen && onMenuDrag && e.touches.length > 0) {
      // Prevent default to stop scrolling/refresh
      if (e.cancelable) e.preventDefault();

      onMenuDrag({
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      });
      return;
    }

    // Prevent browser gestures
    e.preventDefault();

    // Update last touch time to prevent mouse events
    setLastTouchTime(Date.now());

    // Check long press movement tolerance
    if (e.touches.length === 1 && longPressState.isActive) {
      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        checkLongPressMovement(x, y);
      }
    }

    if (e.touches.length === 1 && touchStart) {
      // Single touch drag
      const touch = Array.from(e.touches).find(t => t.identifier === touchStart.identifier);
      if (!touch) return;

      // Start dragging if not already dragging and moved beyond threshold 
      if (!isDragging && !longPressState.isActive) {
        const deltaX = Math.abs(touch.clientX - touchStart.x);
        const deltaY = Math.abs(touch.clientY - touchStart.y);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (distance > DRAG_THRESHOLD) {
          setIsDragging(true);
        }
      }

      // Continue dragging if already started 
      if (isDragging) {
        // Check if we're in repositioning mode with a selected node or group
        if (repositionMode.isActive) {
          // Handle resize mode
          if (repositionMode.resizeMode?.isActive) {
            handleResize(touch.clientX - touchStart.x, touch.clientY - touchStart.y);
          } else if (repositionMode.originalPosition && repositionMode.selectedNodeId && touchStart.touchedNode?.id === repositionMode.selectedNodeId) {
            // Repositioning mode - move the selected node using relative movement

            // Calculate movement delta from touch start position
            const deltaX = touch.clientX - touchStart.x;
            const deltaY = touch.clientY - touchStart.y;

            // Convert delta to world coordinates (accounting for scale)
            const worldDeltaX = deltaX / viewport.scale;
            const worldDeltaY = deltaY / viewport.scale;

            // Calculate new node position based on original position + delta
            const newX = repositionMode.originalPosition![0] + worldDeltaX;
            const newY = repositionMode.originalPosition![1] + worldDeltaY;

            // Apply smooth position calculation
            const [finalX, finalY] = calculateSmoothPosition(newX, newY);

            // Update the repositioning mode state with new position
            setRepositionMode(prev => ({
              ...prev,
              currentPosition: [finalX, finalY]
            }));

            // Update node position in bounds for real-time rendering
            updateNodePositionInBounds(repositionMode.selectedNodeId, finalX, finalY);
          } else if (repositionMode.selectedGroupId && touchStart.touchedGroup?.id === repositionMode.selectedGroupId) {
            // Repositioning mode - move the selected group using relative movement 

            // Calculate movement delta from touch start position
            const deltaX = touch.clientX - touchStart.x;
            const deltaY = touch.clientY - touchStart.y;

            // Convert delta to world coordinates (accounting for scale)
            const worldDeltaX = deltaX / viewport.scale;
            const worldDeltaY = deltaY / viewport.scale;

            // Calculate new group position based on original position + delta
            const newX = repositionMode.originalPosition![0] + worldDeltaX;
            const newY = repositionMode.originalPosition![1] + worldDeltaY;

            // Apply smooth position calculation
            const [finalX, finalY] = calculateSmoothPosition(newX, newY);

            // Update the repositioning mode state with new position
            setRepositionMode(prev => ({
              ...prev,
              currentPosition: [finalX, finalY]
            }));

            // Update group position in bounds for real-time rendering
            updateGroupPositionInBounds(repositionMode.selectedGroupId, finalX, finalY);
          } else {
            // Repositioning mode but no node/group selected - move the viewport/canvas
            const deltaX = touch.clientX - touchStart.x;
            const deltaY = touch.clientY - touchStart.y;

            setViewport({
              ...viewport,
              x: touchStart.initialViewport.x + deltaX,
              y: touchStart.initialViewport.y + deltaY
            });
          }
        } else {
          // Normal mode - move the viewport/canvas
          const deltaX = touch.clientX - touchStart.x;
          const deltaY = touch.clientY - touchStart.y;

          setViewport({
            ...viewport,
            x: touchStart.initialViewport.x + deltaX,
            y: touchStart.initialViewport.y + deltaY
          });
        }
      }
    } else if (e.touches.length === 2 && pinchDistance) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDistance = Math.sqrt(dx * dx + dy * dy);

      const scale = newDistance / pinchDistance;
      const newScale = Math.max(0.05, Math.min(5, viewport.scale * scale));

      // Calculate center point for zoom
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = centerX - rect.left;
        const y = centerY - rect.top;

        const worldX = (x - viewport.x) / viewport.scale;
        const worldY = (y - viewport.y) / viewport.scale;

        setViewport({
          scale: newScale,
          x: x - worldX * newScale,
          y: y - worldY * newScale
        });
      }

      setPinchDistance(newDistance);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isMenuOpen) {
      if (onMenuRelease) onMenuRelease();
      // Clear touch start to prevent phantom taps after menu closes
      setTouchStart(null);
      return;
    }

    e.preventDefault();

    // Update active touch count and last touch time
    setActiveTouchCount(e.touches.length);
    setLastTouchTime(Date.now());

    // Clear long press when touch ends or if multiple touches detected
    if (longPressState.isActive) {
      clearLongPress();
    }

    // Exit resize mode if active and save changes
    if (repositionMode.resizeMode?.isActive) {
      const { originalSize, originalPosition } = repositionMode.resizeMode;

      // Get current size and position after resize
      let currentSize: [number, number] = [0, 0];
      let currentPosition: [number, number] = [0, 0];
      let nodeId: number | undefined;
      let groupId: number | undefined;

      if (repositionMode.selectedNodeId) {
        nodeId = repositionMode.selectedNodeId;
        const bounds = nodeBounds.get(repositionMode.selectedNodeId);
        if (bounds) {
          currentSize = [bounds.width, bounds.height];
          currentPosition = [bounds.x, bounds.y];
        }
      } else if (repositionMode.selectedGroupId) {
        groupId = repositionMode.selectedGroupId;
        const group = groupBounds.find(g => g.id === repositionMode.selectedGroupId);
        if (group) {
          currentSize = [group.width, group.height];
          currentPosition = [group.x, group.y];
        }
      }

      // Only add to changes if size or position actually changed
      if (currentSize[0] !== originalSize[0] || currentSize[1] !== originalSize[1] ||
        currentPosition[0] !== originalPosition[0] || currentPosition[1] !== originalPosition[1]) {
        setResizeChanges(prev => {
          // Remove any existing resize change for this node/group
          const filtered = prev.filter(change =>
            (nodeId && change.nodeId !== nodeId) || (groupId && change.groupId !== groupId)
          );

          return [...filtered, {
            nodeId,
            groupId,
            newSize: currentSize,
            originalSize,
            newPosition: currentPosition,
            originalPosition
          }];
        });
      }

      setRepositionMode(prev => ({
        ...prev,
        resizeMode: undefined
      }));
    }

    if (e.touches.length === 0) {
      // All fingers lifted - check if it was a tap on a node or background
      if (touchStart) {
        const endTime = Date.now();
        const duration = endTime - touchStart.startTime;

        // Get end position from the changedTouches (last finger that was lifted)
        const lastTouch = Array.from(e.changedTouches).find(
          t => t.identifier === touchStart.identifier
        );

        if (lastTouch) {
          const deltaX = Math.abs(lastTouch.clientX - touchStart.x);
          const deltaY = Math.abs(lastTouch.clientY - touchStart.y);
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

          // Consider it a tap if:
          // 1. Duration is less than 500ms
          // 2. Movement is less than 10 pixels
          // 3. Not currently dragging
          const isShortTap = duration < 500;
          const isSmallMovement = distance < 10;

          if (isShortTap && isSmallMovement && !isDragging) {
            // Handle node/group selection
            if (touchStart.touchedNode) {
              if (repositionMode.isActive) {
                // In repositioning mode, select node for repositioning instead of normal selection
                selectNodeForRepositioning(touchStart.touchedNode.id);
              } else {
                // Normal mode - open node inspector
                setSelectedNode(touchStart.touchedNode);
              }
            } else if (touchStart.touchedGroup && touchStart.touchedGroup.id) {
              if (repositionMode.isActive) {
                // In repositioning mode, select group for repositioning
                selectGroupForRepositioning(touchStart.touchedGroup.id);
              } else {
                // Normal mode - select group and create a group node for inspector
                selectGroupForInspection(touchStart.touchedGroup.id);
              }
            } else {
              // Handle background tap - check for double tap
              const currentTapInfo = {
                time: endTime,
                x: lastTouch.clientX,
                y: lastTouch.clientY
              };

              // Check if this is a double tap
              if (lastTapInfo) {
                const timeDiff = currentTapInfo.time - lastTapInfo.time;
                const positionDiff = Math.sqrt(
                  Math.pow(currentTapInfo.x - lastTapInfo.x, 2) +
                  Math.pow(currentTapInfo.y - lastTapInfo.y, 2)
                );

                // Double tap detected if:
                // 1. Second tap within 500ms of first tap
                // 2. Taps are within 50 pixels of each other
                if (timeDiff < 500 && positionDiff < 50) {
                  // Double tap on empty canvas detected!
                  const rect = canvasRef.current?.getBoundingClientRect();
                  if (rect) {
                    const canvasX = lastTouch.clientX - rect.left;
                    const canvasY = lastTouch.clientY - rect.top;
                    const worldX = (canvasX - viewport.x) / viewport.scale;
                    const worldY = (canvasY - viewport.y) / viewport.scale;

                    // DEPRECATED: Double tap for node addition replaced with long press (CircularMenu)
                    // Skip AddNodeModal in repositioning mode
                    // if (!repositionMode.isActive) {
                    //   handleDoubleTap({
                    //     canvasX,
                    //     canvasY,
                    //     worldX,
                    //     worldY
                    //   });
                    // }
                  }

                  // Clear the last tap info to prevent triple-tap issues
                  setLastTapInfo(null);
                } else {
                  // Single tap or too far apart - store this tap info
                  setLastTapInfo(currentTapInfo);
                }
              } else {
                // First tap - store tap info
                setLastTapInfo(currentTapInfo);
              }
            }
          }
        }
      }

      // Clean up dragging state when all touches end
      setIsDragging(false);
      setTouchStart(null);
      setPinchDistance(null);
    } else if (e.touches.length === 1) {
      // Reset to single touch
      setPinchDistance(null);
      const touch = e.touches[0];
      setTouchStart({
        x: touch.clientX,
        y: touch.clientY,
        identifier: touch.identifier,
        startTime: Date.now(),
        touchedNode: null, // Reset touched node for continuing gesture
        touchedGroup: null,
        initialViewport: { x: viewport.x, y: viewport.y }
      });
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // e.preventDefault();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scale = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.05, Math.min(5, viewport.scale * scale));

    // Scale around mouse position
    const worldX = (x - viewport.x) / viewport.scale;
    const worldY = (y - viewport.y) / viewport.scale;

    setViewport({
      scale: newScale,
      x: x - worldX * newScale,
      y: y - worldY * newScale
    });
  };

  // Zoom controls
  const handleZoomIn = () => {
    setViewport(prev => ({ ...prev, scale: Math.min(5, prev.scale * 1.2) }));
  };

  const handleZoomOut = () => {
    setViewport(prev => ({ ...prev, scale: Math.max(0.05, prev.scale / 1.2) }));
  };

  const handleZoomFit = () => {
    if (!nodeBounds.size || !canvasRef.current) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    nodeBounds.forEach(bounds => {
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;

    const scaleX = (canvasWidth - 100) / contentWidth;
    const scaleY = (canvasHeight - 100) / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1);

    setViewport({
      scale,
      x: (canvasWidth - contentWidth * scale) / 2 - minX * scale,
      y: (canvasHeight - contentHeight * scale) / 2 - minY * scale
    });
  };

  // Smooth animation function for viewport transitions
  const animateToViewport = (targetViewport: ViewportTransform, duration: number = 500) => {
    const startViewport = { ...viewport };
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentViewport = {
        x: startViewport.x + (targetViewport.x - startViewport.x) * easeOut,
        y: startViewport.y + (targetViewport.y - startViewport.y) * easeOut,
        scale: startViewport.scale + (targetViewport.scale - startViewport.scale) * easeOut
      };

      setViewport(currentViewport);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  };

  // Grid snap utility function
  const snapToGrid = (position: number, gridSize: number = 20, snapDistance: number = 15): number => {
    if (!repositionMode.gridSnapEnabled) return position;

    const nearestGrid = Math.round(position / gridSize) * gridSize;
    const distance = Math.abs(position - nearestGrid);

    // Use a larger snap distance and smoother transition
    return distance <= snapDistance ? nearestGrid : position;
  };

  // Smooth position calculation that reduces stuttering
  const calculateSmoothPosition = (newX: number, newY: number): [number, number] => {
    if (!repositionMode.gridSnapEnabled) {
      return [newX, newY];
    }

    // Apply grid snap with improved logic
    const snappedX = snapToGrid(newX);
    const snappedY = snapToGrid(newY);

    return [snappedX, snappedY];
  };

  // Update node position in nodeBounds for real-time rendering
  const updateNodePositionInBounds = (nodeId: number, x: number, y: number) => {
    setNodeBounds(prevBounds => {
      const newBounds = new Map(prevBounds);
      const bounds = newBounds.get(nodeId);
      if (!bounds) return prevBounds;

      // Check if position actually changed to avoid unnecessary updates
      const currentX = bounds.x;
      const currentY = bounds.y;
      const threshold = 0.5; // Minimum movement threshold to reduce micro-updates

      if (Math.abs(x - currentX) < threshold && Math.abs(y - currentY) < threshold) {
        return prevBounds; // Skip update if movement is too small
      }

      // Update the node bounds for real-time rendering
      const updatedBounds = {
        ...bounds,
        x: x,
        y: y,
        node: {
          ...bounds.node,
          pos: [x, y] as [number, number]
        }
      };

      // Update nodeBounds map (this triggers re-render)
      newBounds.set(nodeId, updatedBounds);
      return newBounds;
    });

    // tracking node changes (only when repositioning mode)
    if (repositionMode.isActive) {
      let originalPos: [number, number] | null = null;

      // single node movement
      if (repositionMode.selectedNodeId === nodeId && repositionMode.originalPosition) {
        originalPos = repositionMode.originalPosition;
      }
      // group node movement
      else if (repositionMode.originalNodePositions.has(nodeId)) {
        originalPos = repositionMode.originalNodePositions.get(nodeId)!;
      }

      if (originalPos) {
        setNodeChanges(prev => {
          // remove existing changes for this node
          const filtered = prev.filter(change => change.nodeId != nodeId);

          // add only if position has changed
          if (Math.abs(x - originalPos![0]) > 0.1 || Math.abs(y - originalPos![1]) > 0.1) {
            return [...filtered, {
              nodeId,
              newPosition: [x, y] as [number, number],
              originalPosition: originalPos
            }];
          }
          return filtered;
        });
      }
    }
  };

  // Update node size and position in nodeBounds for real-time rendering
  const updateNodeSizeInBounds = (nodeId: number, width: number, height: number, x?: number, y?: number) => {
    setNodeBounds(prevBounds => {
      const newBounds = new Map(prevBounds);
      const bounds = newBounds.get(nodeId);
      if (!bounds) return prevBounds;

      // Update the node bounds for real-time rendering
      const updatedBounds = {
        ...bounds,
        width,
        height,
        x: x !== undefined ? x : bounds.x,
        y: y !== undefined ? y : bounds.y,
        node: {
          ...bounds.node,
          size: [width, height] as [number, number],
          pos: [x !== undefined ? x : bounds.x, y !== undefined ? y : bounds.y] as [number, number]
        }
      };

      // Update nodeBounds map (this triggers re-render)
      newBounds.set(nodeId, updatedBounds);
      return newBounds;
    });
  };

  // Update group size and position in groupBounds for real-time rendering
  const updateGroupSizeInBounds = (groupId: number, width: number, height: number, x?: number, y?: number) => {
    setGroupBounds(prevBounds => {
      return prevBounds.map(bounds => {
        if (bounds.id === groupId) {
          return {
            ...bounds,
            width,
            height,
            x: x !== undefined ? x : bounds.x,
            y: y !== undefined ? y : bounds.y
          };
        }
        return bounds;
      });
    });
  };

  // Repositioning mode control functions
  const enterRepositionMode = (nodeId?: number) => {
    let selectedNodeId: number | null = null;
    let originalPosition: [number, number] | null = null;

    if (nodeId) {
      const nodeBound = nodeBounds.get(nodeId);
      if (nodeBound) {
        selectedNodeId = nodeId;
        originalPosition = [nodeBound.node.pos[0], nodeBound.node.pos[1]];
        // Clear selected group's node list when selecting a node
        setSelectedGroupNodeIds([]);
      }
    }

    setRepositionMode({
      isActive: true,
      selectedNodeId,
      selectedGroupId: null,
      originalPosition,
      currentPosition: originalPosition,
      gridSnapEnabled: true, // Always enable grid snap when entering repositioning mode
      originalNodePositions: new Map()
    });

    return true;
  };

  // Update group position in groupBounds for real-time rendering
  const updateGroupPositionInBounds = (groupId: number, x: number, y: number) => {
    // Get original position from repositioning mode instead of current groupBounds
    const originalPos = repositionMode.originalPosition;
    if (!originalPos) {
      return;
    }

    const deltaX = x - originalPos[0];
    const deltaY = y - originalPos[1];

    // Update group position
    setGroupBounds(prevBounds => {
      const newBounds = [...prevBounds];
      const groupIndex = newBounds.findIndex(g => g.id === groupId);
      if (groupIndex === -1) return prevBounds;

      const currentGroup = newBounds[groupIndex];
      const threshold = 0.5; // Minimum movement threshold to reduce micro-updates

      // Check if position actually changed to avoid unnecessary updates
      if (Math.abs(x - currentGroup.x) < threshold && Math.abs(y - currentGroup.y) < threshold) {
        return prevBounds; // Skip update if movement is too small
      }

      // Update the group bounds for real-time rendering
      newBounds[groupIndex] = {
        ...currentGroup,
        x: x,
        y: y
      };

      return newBounds;
    });

    // Use pre-calculated group node list from selection time
    if (selectedGroupNodeIds.length > 0) {
      // Update all nodes in the group with the same delta movement
      selectedGroupNodeIds.forEach(nodeId => {
        // Get original node position instead of current position
        const originalNodePos = repositionMode.originalNodePositions.get(nodeId);
        if (originalNodePos) {
          const newNodeX = originalNodePos[0] + deltaX;
          const newNodeY = originalNodePos[1] + deltaY;
          updateNodePositionInBounds(nodeId, newNodeX, newNodeY);
        }
      });
    }

    // tracking group changes (only when repositioning mode)
    if (repositionMode.isActive && repositionMode.selectedGroupId === groupId && originalPos) {
      setGroupChanges(prev => {
        // remove existing changes for this group
        const filtered = prev.filter(change => change.groupId != groupId);

        // add only if position has changed
        if (Math.abs(x - originalPos[0]) > 0.1 || Math.abs(y - originalPos[1]) > 0.1) {
          return [...filtered, {
            groupId,
            newPosition: [x, y] as [number, number],
            originalPosition: originalPos
          }];
        }
        return filtered;
      });
    }
  };

  const selectNodeForRepositioning = (nodeId: number) => {
    const nodeBound = nodeBounds.get(nodeId);
    if (!nodeBound) return false;

    const originalPos: [number, number] = [nodeBound.node.pos[0], nodeBound.node.pos[1]];

    // Clear selected group's node list when selecting a node
    setSelectedGroupNodeIds([]);

    setRepositionMode(prev => ({
      ...prev,
      selectedNodeId: nodeId,
      selectedGroupId: null, // Clear group selection
      originalPosition: originalPos,
      currentPosition: originalPos,
    }));

    return true;
  };

  const selectGroupForRepositioning = (groupId: number) => {
    const groupBound = groupBounds.find(g => g.id === groupId);

    if (!groupBound) {
      return false;
    }

    const originalPos: [number, number] = [groupBound.x, groupBound.y];

    // Use the same workflowGroups that handleGroupModeChange uses (for consistency)
    let groupNodeIds: number[] = [];
    let groupTitle = `Group ${groupId}`;

    const group = workflowGroups.find(g => g.id === groupId);
    if (group) {
      groupNodeIds = group.nodeIds;
      groupTitle = group.title;
    }

    // Store the calculated node list
    setSelectedGroupNodeIds(groupNodeIds);

    // Save original positions of all nodes in the group
    const nodeOriginalPositions = new Map<number, [number, number]>();
    groupNodeIds.forEach(nodeId => {
      const nodeBound = nodeBounds.get(nodeId);
      if (nodeBound && nodeBound.node && nodeBound.node.pos) {
        nodeOriginalPositions.set(nodeId, [nodeBound.node.pos[0], nodeBound.node.pos[1]]);
      }
    });

    setRepositionMode(prev => {
      const newMode = {
        ...prev,
        selectedNodeId: null, // Clear node selection
        selectedGroupId: groupId,
        originalPosition: originalPos,
        currentPosition: originalPos,
        originalNodePositions: nodeOriginalPositions, // Store original node positions
      };

      return newMode;
    });

    return true;
  };

  // general mode select group for inspection
  const selectGroupForInspection = (groupId: number) => {
    const groupBound = groupBounds.find(g => g.id === groupId);
    if (!groupBound) return false;

    // get group from workflowGroups
    const group = workflowGroups.find(g => g.id === groupId);
    if (!group) return false;

    // get actual nodes in the group
    const groupNodes: WorkflowNode[] = [];
    group.nodeIds.forEach(nodeId => {
      const nodeBound = nodeBounds.get(nodeId);
      if (nodeBound && nodeBound.node) {
        groupNodes.push(nodeBound.node);
      }
    });

    // create special group node object
    const groupNode: WorkflowNode = {
      id: -groupId, // negative to indicate group node
      type: 'GROUP_NODE',
      pos: [groupBound.x, groupBound.y],
      size: [groupBound.width, groupBound.height],
      title: group.title,
      // group info as additional property
      groupInfo: {
        groupId,
        title: group.title,
        nodeIds: group.nodeIds,
        nodes: groupNodes,
        bounding: group.bounding
      }
    } as WorkflowNode;

    // set selected node to group node
    setSelectedNode(groupNode);

    return true;
  };

  const startResize = (gripperType: 'corner' | 'edge', gripperPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right') => {
    if (!repositionMode.isActive) return;

    let originalSize: [number, number] = [0, 0];
    let originalPosition: [number, number] = [0, 0];

    if (repositionMode.selectedNodeId) {
      const bounds = nodeBounds.get(repositionMode.selectedNodeId);
      if (bounds) {
        originalSize = [bounds.width, bounds.height];
        originalPosition = [bounds.x, bounds.y];
      }
    } else if (repositionMode.selectedGroupId) {
      const group = groupBounds.find(g => g.id === repositionMode.selectedGroupId);
      if (group) {
        originalSize = [group.width, group.height];
        originalPosition = [group.x, group.y];
      }
    }

    setRepositionMode(prev => ({
      ...prev,
      resizeMode: {
        isActive: true,
        gripperType,
        gripperPosition,
        originalSize,
        originalPosition
      }
    }));
  };

  const handleResize = (deltaX: number, deltaY: number) => {
    if (!repositionMode.resizeMode?.isActive) return;

    const { gripperType, gripperPosition, originalSize, originalPosition } = repositionMode.resizeMode;

    // Convert delta to world coordinates
    const worldDeltaX = deltaX / viewport.scale;
    const worldDeltaY = deltaY / viewport.scale;

    let newWidth = originalSize[0];
    let newHeight = originalSize[1];
    let newX = originalPosition[0];
    let newY = originalPosition[1];

    // Calculate new dimensions based on gripper position
    switch (gripperPosition) {
      case 'top-left':
        newWidth = Math.max(80, originalSize[0] - worldDeltaX);
        newHeight = Math.max(30, originalSize[1] - worldDeltaY);
        newX = originalPosition[0] + (originalSize[0] - newWidth);
        newY = originalPosition[1] + (originalSize[1] - newHeight);
        break;
      case 'top-right':
        newWidth = Math.max(80, originalSize[0] + worldDeltaX);
        newHeight = Math.max(30, originalSize[1] - worldDeltaY);
        newY = originalPosition[1] + (originalSize[1] - newHeight);
        break;
      case 'bottom-left':
        newWidth = Math.max(80, originalSize[0] - worldDeltaX);
        newHeight = Math.max(30, originalSize[1] + worldDeltaY);
        newX = originalPosition[0] + (originalSize[0] - newWidth);
        break;
      case 'bottom-right':
        newWidth = Math.max(80, originalSize[0] + worldDeltaX);
        newHeight = Math.max(30, originalSize[1] + worldDeltaY);
        break;
      case 'top':
        newHeight = Math.max(30, originalSize[1] - worldDeltaY);
        newY = originalPosition[1] + (originalSize[1] - newHeight);
        break;
      case 'bottom':
        newHeight = Math.max(30, originalSize[1] + worldDeltaY);
        break;
      case 'left':
        newWidth = Math.max(80, originalSize[0] - worldDeltaX);
        newX = originalPosition[0] + (originalSize[0] - newWidth);
        break;
      case 'right':
        newWidth = Math.max(80, originalSize[0] + worldDeltaX);
        break;
    }

    // Apply grid snap if enabled
    if (repositionMode.gridSnapEnabled) {
      newWidth = snapToGrid(newWidth);
      newHeight = snapToGrid(newHeight);
      newX = snapToGrid(newX);
      newY = snapToGrid(newY);
    }

    // Update the target node or group
    if (repositionMode.selectedNodeId) {
      updateNodeSizeInBounds(repositionMode.selectedNodeId, newWidth, newHeight, newX, newY);
    } else if (repositionMode.selectedGroupId) {
      updateGroupSizeInBounds(repositionMode.selectedGroupId, newWidth, newHeight, newX, newY);
    }
  };

  const exitRepositionMode = () => {
    setRepositionMode({
      isActive: false,
      selectedNodeId: null,
      selectedGroupId: null,
      originalPosition: null,
      currentPosition: null,
      gridSnapEnabled: repositionMode.gridSnapEnabled,
      originalNodePositions: new Map() // Clear stored node positions
    });
  };

  const toggleGridSnap = () => {
    setRepositionMode(prev => ({
      ...prev,
      gridSnapEnabled: !prev.gridSnapEnabled
    }));
  };

  const cancelReposition = () => {
    // Restore resize changes
    resizeChanges.forEach(change => {
      if (change.nodeId) {
        updateNodeSizeInBounds(
          change.nodeId,
          change.originalSize[0],
          change.originalSize[1],
          change.originalPosition[0],
          change.originalPosition[1]
        );
      } else if (change.groupId) {
        updateGroupSizeInBounds(
          change.groupId,
          change.originalSize[0],
          change.originalSize[1],
          change.originalPosition[0],
          change.originalPosition[1]
        );
      }
    });

    // Restore selected group to its original position (if any)
    if (repositionMode.selectedGroupId && repositionMode.originalPosition) {
      updateGroupPositionInBounds(repositionMode.selectedGroupId, repositionMode.originalPosition[0], repositionMode.originalPosition[1]);
    }

    // Restore all nodes in the selected group to their original positions
    repositionMode.originalNodePositions.forEach((originalPos, nodeId) => {
      updateNodePositionInBounds(nodeId, originalPos[0], originalPos[1]);
    });

    // Restore selected node to its original position (if any)
    if (repositionMode.selectedNodeId && repositionMode.originalPosition) {
      updateNodePositionInBounds(repositionMode.selectedNodeId, repositionMode.originalPosition[0], repositionMode.originalPosition[1]);
    }

    // reset tracking arrays
    setNodeChanges([]);
    setGroupChanges([]);
    setResizeChanges([]);

    exitRepositionMode();
  };

  const applyReposition = () => {
    if (!repositionMode.isActive) {
      return null;
    }

    // return tracking arrays
    const changes = {
      nodeChanges: [...nodeChanges],
      groupChanges: [...groupChanges],
      resizeChanges: [...resizeChanges]
    };

    // reset tracking arrays
    setNodeChanges([]);
    setGroupChanges([]);
    setResizeChanges([]);
    exitRepositionMode();

    return changes;
  };

  // Navigate to specific node (used by search and node parameter navigation)
  const handleNavigateToNode = (nodeId: number) => {
    if (!canvasRef.current) return false;

    const nodeBound = nodeBounds.get(nodeId);
    if (!nodeBound) return false;

    const canvas = canvasRef.current;

    // Calculate node center
    const nodeCenter = {
      x: nodeBound.x + nodeBound.width / 2,
      y: nodeBound.y + nodeBound.height / 2
    };

    // Calculate target position (center both horizontally and vertically)
    const canvasTarget = {
      x: canvas.width / 2,
      y: canvas.height / 2  // Center vertically for full-screen inspector
    };

    // Target viewport position to place node at center (with zoom)
    const targetViewport = {
      x: canvasTarget.x - nodeCenter.x,
      y: canvasTarget.y - nodeCenter.y,
      scale: 1  // Zoom to 1x scale
    };

    // Animate to target viewport (300ms duration like original)
    animateToViewport(targetViewport, 300);

    return true;
  };

  // Handle double tap for node addition
  const handleDoubleTap = useCallback((position: {
    canvasX: number;
    canvasY: number;
    worldX: number;
    worldY: number
  }) => {
    // Set position and open modal
    setNodeAddPosition(position);
    setIsNodeAddModalOpen(true);
  }, []);

  return {
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleWheel,
    handleZoomIn,
    handleZoomOut,
    handleZoomFit,
    animateToViewport,
    handleNavigateToNode,
    // Repositioning mode
    repositionMode,
    enterRepositionMode,
    selectNodeForRepositioning,
    selectGroupForRepositioning,
    selectGroupForInspection,
    exitRepositionMode,
    toggleGridSnap,
    cancelReposition,
    applyReposition,
    // Node addition
    handleDoubleTap,
    isNodeAddModalOpen,
    setIsNodeAddModalOpen,
    nodeAddPosition,
    setNodeAddPosition,
    // Long press
    longPressState,
  };
};