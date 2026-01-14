import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ComfyGraphNode } from '@/core/domain/ComfyGraphNode';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { NodeMode } from '@/shared/types/app/base';

interface NodeSettingsEditorProps {
  selectedNode: ComfyGraphNode;
  getNodeMode: (nodeId: number, originalMode: number) => number;
  onNodeModeChange: (nodeId: number, mode: number) => void;
  onNodeColorChange?: (nodeId: number, bgcolor: string) => void;
  onNodeSizeChange?: (nodeId: number, width: number, height: number) => void;
  onNodeCollapseChange?: (nodeId: number, collapsed: boolean) => void;
  isVisible: boolean;
}

// Available node background colors (reduced similar colors)
const NODE_COLORS = [
  { name: 'Brown', key: 'circularMenu.colors.brown', value: '#593930' },
  { name: 'Teal', key: 'circularMenu.colors.teal', value: '#3f5159' },
  { name: 'Blue', key: 'circularMenu.colors.blue', value: '#29699c' },
  { name: 'Purple', key: 'circularMenu.colors.purple', value: '#335' },
  { name: 'Green', key: 'circularMenu.colors.green', value: '#353' },
  { name: 'Red', key: 'circularMenu.colors.red', value: '#653' },
  { name: 'Blue Gray', key: 'circularMenu.colors.blueGray', value: '#364254' },
  { name: 'Black', key: 'circularMenu.colors.black', value: '#000' },
  { name: 'Slate', key: 'circularMenu.colors.slate', value: '#475569' },
  { name: 'Default', key: 'circularMenu.colors.default', value: '' }
];

export const NodeSettingsEditor: React.FC<NodeSettingsEditorProps> = ({
  selectedNode,
  getNodeMode,
  onNodeModeChange,
  onNodeColorChange,
  onNodeSizeChange,
  onNodeCollapseChange,
  isVisible
}) => {
  const { t } = useTranslation();
  const nodeMode = getNodeMode(selectedNode.id, selectedNode.mode ?? 0);

  // Get current node size, defaulting to reasonable values
  const currentWidth = selectedNode.size?.[0] || 200;
  const currentHeight = selectedNode.size?.[1] || 100;
  const isCollapsed = selectedNode.flags?.collapsed === true;

  // Store original values when component first mounts or node changes
  const [originalWidth, setOriginalWidth] = React.useState(currentWidth);
  const [originalHeight, setOriginalHeight] = React.useState(currentHeight);
  const [originalCollapsed, setOriginalCollapsed] = React.useState(isCollapsed);

  // Local state for real-time preview
  const [previewWidth, setPreviewWidth] = React.useState(currentWidth);
  const [previewHeight, setPreviewHeight] = React.useState(currentHeight);
  const [previewCollapsed, setPreviewCollapsed] = React.useState(isCollapsed);

  // Update states when selectedNode changes (different node selected)
  React.useEffect(() => {
    const newWidth = selectedNode.size?.[0] || 200;
    const newHeight = selectedNode.size?.[1] || 100;
    const newCollapsed = selectedNode.flags?.collapsed === true;

    // Only update if this is a different node (by comparing current vs stored original)
    if (newWidth !== originalWidth || newHeight !== originalHeight || newCollapsed !== originalCollapsed) {
      setOriginalWidth(newWidth);
      setOriginalHeight(newHeight);
      setOriginalCollapsed(newCollapsed);
      setPreviewWidth(newWidth);
      setPreviewHeight(newHeight);
      setPreviewCollapsed(newCollapsed);
    }
  }, [selectedNode.id]); // Only depend on node ID to detect node changes

  // Handle width change
  const handleWidthChange = (values: number[]) => {
    const newWidth = values[0];
    setPreviewWidth(newWidth);
    if (onNodeSizeChange) {
      onNodeSizeChange(selectedNode.id, newWidth, previewHeight);
    }
  };

  // Handle height change
  const handleHeightChange = (values: number[]) => {
    const newHeight = values[0];
    setPreviewHeight(newHeight);
    if (onNodeSizeChange) {
      onNodeSizeChange(selectedNode.id, previewWidth, newHeight);
    }
  };

  // Handle collapse toggle
  const handleCollapseChange = (collapsed: boolean) => {
    setPreviewCollapsed(collapsed);
    if (onNodeCollapseChange) {
      onNodeCollapseChange(selectedNode.id, collapsed);
    }
  };

  // Handle color change
  const handleColorChange = (color: string) => {
    if (onNodeColorChange) {
      onNodeColorChange(selectedNode.id, color);
    }
  };

  // Check if current color is in predefined colors
  const selectedColor = selectedNode.bgcolor;
  const isColorInPredefined = selectedColor && NODE_COLORS.some(color => color.value === selectedColor);
  const isNoneSelected = !selectedColor || !isColorInPredefined;

  // Calculate relative size change based on original values
  const widthChange = ((previewWidth - originalWidth) / originalWidth * 100).toFixed(0);
  const heightChange = ((previewHeight - originalHeight) / originalHeight * 100).toFixed(0);

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 bg-white dark:bg-slate-900"
    >
      <ScrollArea className="h-full">
        <div className="p-6 space-y-6">
          {/* Node Mode Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              {t('node.executionMode')}
            </h3>
            <SegmentedControl
              value={nodeMode}
              onChange={(value) => onNodeModeChange(selectedNode.id, value as number)}
              items={[
                {
                  value: NodeMode.ALWAYS,
                  label: t('node.mode.always'),
                  color: 'text-green-600'
                },
                {
                  value: NodeMode.NEVER,
                  label: t('node.mode.mute'),
                  color: 'text-blue-600'
                },
                {
                  value: NodeMode.BYPASS,
                  label: t('node.mode.bypass'),
                  color: 'text-purple-600'
                }
              ]}
              size="md"
              className="w-full"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {nodeMode === NodeMode.ALWAYS && t('node.modeAlwaysDesc')}
              {nodeMode === NodeMode.NEVER && t('node.modeMuteDesc')}
              {nodeMode === NodeMode.BYPASS && t('node.modeBypassDesc')}
            </p>
          </div>

          <Separator />

          {/* Node Color Section */}
          {onNodeColorChange && (
            <>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                  {t('node.color')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {/* Clear/None option */}
                  <button
                    onClick={() => handleColorChange('')}
                    className={`w-12 h-12 rounded-lg border-2 transition-all flex items-center justify-center ${isNoneSelected
                      ? 'border-blue-500 scale-105 shadow-lg bg-slate-100 dark:bg-slate-800'
                      : 'border-gray-300 dark:border-gray-600 hover:scale-105 bg-slate-50 dark:bg-slate-900'
                      }`}
                    title={t('node.clearColor')}
                  >
                    <span className="text-xl font-bold text-slate-600 dark:text-slate-400">×</span>
                  </button>

                  {/* Color options */}
                  {NODE_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => handleColorChange(color.value)}
                      className={`w-12 h-12 rounded-lg border-2 transition-all shadow-sm ${selectedColor === color.value
                        ? 'border-blue-500 scale-105 shadow-lg ring-2 ring-blue-200 dark:ring-blue-800'
                        : 'border-gray-300 dark:border-gray-600 hover:scale-105 hover:shadow-md'
                        }`}
                      style={{ backgroundColor: color.value }}
                      title={t(color.key)}
                    />
                  ))}

                  {/* Show custom color indicator if selected color is not in predefined list */}
                  {selectedColor && !isColorInPredefined && (
                    <div
                      className="w-12 h-12 rounded-lg border-2 border-orange-500 scale-105 shadow-lg ring-2 ring-orange-200 dark:ring-orange-800 relative"
                      style={{ backgroundColor: selectedColor }}
                      title={`Custom color: ${selectedColor}`}
                    >
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full text-xs text-white flex items-center justify-center">
                        <span className="text-[10px] font-bold">C</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Node Size Section */}
          {(onNodeSizeChange || onNodeCollapseChange) && (
            <div className="space-y-6">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                {t('node.sizeLayout')}
              </h3>

              {/* Collapse Toggle */}
              <div className="flex items-center justify-between py-2">
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('node.collapsed')}</label>
                <Switch
                  checked={previewCollapsed}
                  onCheckedChange={handleCollapseChange}
                />
              </div>

              {/* Width Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('node.width')}</label>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-mono text-slate-700 dark:text-slate-300 min-w-[60px] text-right">
                      {Math.round(previewWidth)}px
                    </span>
                    {Math.abs(Number(widthChange)) > 0 && (
                      <span className={`text-xs font-medium min-w-[40px] text-right ${Number(widthChange) > 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                        }`}>
                        {Number(widthChange) > 0 ? '+' : ''}{widthChange}%
                      </span>
                    )}
                  </div>
                </div>
                <Slider
                  value={[previewWidth]}
                  onValueChange={handleWidthChange}
                  min={80}
                  max={1600}
                  step={10}
                  className="w-full"
                  disabled={previewCollapsed}
                />
              </div>

              {/* Height Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('node.height')}</label>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-mono text-slate-700 dark:text-slate-300 min-w-[60px] text-right">
                      {Math.round(previewHeight)}px
                    </span>
                    {Math.abs(Number(heightChange)) > 0 && (
                      <span className={`text-xs font-medium min-w-[40px] text-right ${Number(heightChange) > 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                        }`}>
                        {Number(heightChange) > 0 ? '+' : ''}{heightChange}%
                      </span>
                    )}
                  </div>
                </div>
                <Slider
                  value={[previewHeight]}
                  onValueChange={handleHeightChange}
                  min={30}
                  max={1600}
                  step={10}
                  className="w-full"
                  disabled={previewCollapsed}
                />
              </div>

              {/* Visual Preview */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('node.preview')}</label>
                <div
                  className="relative bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700"
                  style={{ height: '180px' }}  // Fixed height container
                >
                  <div className="absolute inset-0 flex justify-center items-center p-4">
                    {(() => {
                      // Calculate scale to fit both boxes within the container
                      const containerWidth = 280;  // Approximate width minus padding
                      const containerHeight = 148;  // Fixed height minus padding

                      // Determine the actual sizes for calculation
                      const origWidth = originalCollapsed ? 80 : originalWidth;
                      const origHeight = originalCollapsed ? 30 : originalHeight;
                      const newWidth = previewCollapsed ? 80 : previewWidth;
                      const newHeight = previewCollapsed ? 30 : previewHeight;

                      // Find the maximum dimensions to calculate scale
                      const maxWidth = Math.max(origWidth, newWidth);
                      const maxHeight = Math.max(origHeight, newHeight);

                      // Calculate scale factor to fit within container
                      const scaleX = containerWidth / maxWidth;
                      const scaleY = containerHeight / maxHeight;
                      const scale = Math.min(scaleX, scaleY, 0.8);  // Max 80% to leave some padding

                      // Calculate scaled dimensions
                      const scaledOrigWidth = origWidth * scale;
                      const scaledOrigHeight = origHeight * scale;
                      const scaledNewWidth = newWidth * scale;
                      const scaledNewHeight = newHeight * scale;

                      return (
                        <div className="relative" style={{ width: '100%', height: '100%' }}>
                          {/* Original size (ghost) */}
                          <div
                            className="absolute border-2 border-slate-300 dark:border-slate-600 rounded opacity-40"
                            style={{
                              width: `${scaledOrigWidth}px`,
                              height: `${scaledOrigHeight}px`,
                              left: '50%',
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                              transition: 'all 0.3s ease'
                            }}
                          >
                            {originalCollapsed && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium opacity-75">{t('node.original')}</span>
                              </div>
                            )}
                          </div>
                          {/* New size */}
                          <div
                            className="absolute border-2 border-blue-500 dark:border-blue-400 rounded bg-blue-100/50 dark:bg-blue-900/30"
                            style={{
                              width: `${scaledNewWidth}px`,
                              height: `${scaledNewHeight}px`,
                              left: '50%',
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                              transition: 'all 0.3s ease'
                            }}
                          >
                            {previewCollapsed && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">{t('node.collapsed')}</span>
                              </div>
                            )}
                          </div>

                          {/* Size labels */}
                          <div className="absolute bottom-2 left-2 right-2 flex justify-between text-[10px]">
                            <span className="text-slate-500 dark:text-slate-400">
                              {t('node.original')}: {origWidth}×{origHeight}
                            </span>
                            <span className="text-blue-600 dark:text-blue-400 font-medium">
                              {t('node.new')}: {newWidth}×{newHeight}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
};