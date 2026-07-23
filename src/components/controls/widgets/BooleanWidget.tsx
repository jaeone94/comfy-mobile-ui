/**
 * BooleanWidget Component
 * 
 * Handles BOOLEAN type parameters with switch control
 */

import React from 'react';

// Export supported types for this widget
export const BooleanWidgetSupportedTypes = ['BOOLEAN'] as const;
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { BooleanWidgetProps } from './types';

export const BooleanWidget: React.FC<BooleanWidgetProps> = ({
  param,
  editingValue,
  onValueChange,
  widget,
  node
}) => {
  const { t } = useTranslation();
  // Handle widget callback execution
  const executeWidgetCallback = (value: any) => {
    if (widget?.callback && node) {
      try {
        widget.callback(value, node as any);
      } catch (error) {
        console.error('Widget callback error:', error);
      }
    }
  };

  // Handle value change with widget callback
  const handleValueChange = (newValue: boolean) => {
    onValueChange(newValue);
    executeWidgetCallback(newValue);
  };

  return (
    <div className="flex items-center justify-center space-x-4 py-4">
      <span className={`text-[14px] font-medium transition-colors ${!editingValue ? 'text-[#e9ebef]' : 'text-[#71798a]'
        }`}>
        {t('node.false')}
      </span>
      <Switch
        checked={Boolean(editingValue)}
        onCheckedChange={handleValueChange}
 className="data-[state=checked]:bg-[#34c77b] data-[state=unchecked]:bg-white/[0.1]"
      />
      <span className={`text-[14px] font-medium transition-colors ${editingValue ? 'text-[#e9ebef]' : 'text-[#71798a]'
        }`}>
        {t('node.true')}
      </span>
    </div>
  );
};