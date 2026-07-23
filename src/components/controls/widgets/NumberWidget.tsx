/**
 * NumberWidget Component
 * 
 * Handles INT, FLOAT, and SEED type parameters with slider and input controls
 */

import React from 'react';

// Export supported types for this widget
export const NumberWidgetSupportedTypes = ['INT', 'FLOAT', 'SEED'] as const;
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { NumberWidgetProps } from './types';

export const NumberWidget: React.FC<NumberWidgetProps> = ({
  param,
  editingValue,
  onValueChange,
  type,
  widget,
  node
}) => {
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
  const handleValueChange = (newValue: any) => {
    onValueChange(newValue);
    executeWidgetCallback(newValue);
  };

  // Determine if this is an integer type
  const isInteger = type === 'INT' || type === 'SEED';
  
  // Get validation bounds
  const min = param.validation?.min !== undefined 
    ? param.validation.min 
    : (isInteger ? -1000 : -100);
    
  const max = param.validation?.max !== undefined 
    ? param.validation.max 
    : (isInteger ? 1000 : 100);
    
  const step = param.validation?.step !== undefined 
    ? param.validation.step 
    : (isInteger ? 1 : 0.1);

  return (
    <div className="space-y-3">
      {/* Slider */}
      <div 
 className="px-2"
        style={{ 
          touchAction: 'pan-x pinch-zoom', // Allow horizontal panning for slider
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          KhtmlUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          userSelect: 'none'
        }}
      >
        <Slider
          value={[Number(editingValue) || 0]}
          onValueChange={(values) => handleValueChange(isInteger ? Math.round(values[0]) : values[0])}
          min={min}
          max={max}
          step={step}
 className="w-full"
          data-slider="true"
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
          }}
        />
      </div>
      
      {/* Manual Input */}
      <Input
        type="number"
        value={String(editingValue)}
        onChange={(e) => handleValueChange(isInteger ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
 className="text-center text-[14px] font-medium"
      />
    </div>
  );
};