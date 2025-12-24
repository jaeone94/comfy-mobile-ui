/**
 * SeedWithControlWidget Component
 * 
 * Handles seed parameters with control_after_generate functionality
 */

import React from 'react';

// Export supported types for this widget (special case handled separately)
export const SeedWithControlWidgetSupportedTypes = ['SEED_WITH_CONTROL'] as const;
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NumberWidget } from './NumberWidget';
import { SeedWithControlWidgetProps } from './types';

export const SeedWithControlWidget: React.FC<SeedWithControlWidgetProps> = ({
  param,
  editingValue,
  onValueChange,
  controlWidget,
  onControlAfterGenerateChange,
  forceRender,
  setForceRender,
  widget,
  node
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {/* Seed value input */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('node.seedValue')}
          </label>
          <Badge variant="outline" className="text-xs">
            {param.type}
          </Badge>
        </div>
        <NumberWidget
          param={param}
          editingValue={editingValue}
          onValueChange={onValueChange}
          type="SEED"
          widget={widget}
          node={node}
        />
      </div>

      {/* Control after generate selector */}
      {controlWidget && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('node.controlAfterGenerate')}
            </label>
            <Badge variant="outline" className="text-xs">
              COMBO
            </Badge>
          </div>
          <select
            value={String(controlWidget.value)}
            onChange={(e) => {

              // CRITICAL FIX: Update widget value directly for immediate UI response
              controlWidget.value = e.target.value;

              // Update widget callback (for UI display)
              if (controlWidget.callback && node) {
                controlWidget.callback(e.target.value, node as any);
              }

              // Force re-render by incrementing forceRender counter
              // This ensures the UI reflects the change immediately
              if (setForceRender) {
                setForceRender(prev => prev + 1);
              }

              // CRITICAL: Save to workflow metadata for persistence across save/reload
              if (onControlAfterGenerateChange && node) {
                onControlAfterGenerateChange(node.id, e.target.value);
              }

            }}
            className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="fixed">{t('node.seedModes.fixed')}</option>
            <option value="increment">{t('node.seedModes.increment')}</option>
            <option value="decrement">{t('node.seedModes.decrement')}</option>
            <option value="randomize">{t('node.seedModes.randomize')}</option>
          </select>
        </div>
      )}
    </div>
  );
};
