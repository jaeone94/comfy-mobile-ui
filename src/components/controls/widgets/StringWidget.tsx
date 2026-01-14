/**
 * StringWidget Component
 * 
 * Handles STRING type parameters with multi-line text input control
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';

// Export supported types for this widget
export const StringWidgetSupportedTypes = ['STRING'] as const;
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { StringWidgetProps } from './types';

export const StringWidget: React.FC<StringWidgetProps> = ({
  param,
  editingValue,
  onValueChange,
  widget,
  node
}) => {
  const { t } = useTranslation();
  // Clipboard helper function with fallback
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        // using HTTPS
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // HTTP fallback
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const result = document.execCommand('copy');
        document.body.removeChild(textArea);
        return result;
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  };

  // Clipboard paste helper function with fallback
  const pasteFromClipboard = async (): Promise<string | null> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        // using HTTPS
        const text = await navigator.clipboard.readText();
        return text;
      } else {
        // HTTP fallback
        toast.info(t('node.pasteShortcutTip'));
        return null;
      }
    } catch (error) {
      console.error('Failed to read from clipboard:', error);
      toast.info(t('node.pasteShortcutTip'));
      return null;
    }
  };

  // Handle clipboard copy
  const handleCopy = async () => {
    const textToCopy = String(editingValue || '');
    const success = await copyToClipboard(textToCopy);

    if (success) {
      toast.success(t('node.textCopied'));
    } else {
      toast.error(t('node.failedToCopy'));
    }
  };

  // Handle clipboard paste
  const handlePaste = async () => {
    const pastedText = await pasteFromClipboard();

    if (pastedText !== null) {
      handleValueChange(pastedText);
      toast.success(t('node.textPasted'));
    }
  };

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
  const handleValueChange = (newValue: string) => {
    onValueChange(newValue);
    executeWidgetCallback(newValue);
  };

  // Check if we're in a secure context (HTTPS)
  const isSecureContext = window.isSecureContext && navigator.clipboard;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {param.label || param.name}
        </label>
        <div className="flex space-x-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-8 px-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-950/50"
            title={t('node.copyToClipboard')}
          >
            <Copy className="h-3 w-3 mr-1" />
            {t('common.copy')}
          </Button>
          {isSecureContext && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePaste}
              className="h-8 px-2 text-xs hover:bg-green-50 dark:hover:bg-green-950/50"
              title={t('node.pasteFromClipboard')}
            >
              <ClipboardPaste className="h-3 w-3 mr-1" />
              {t('common.paste')}
            </Button>
          )}
        </div>
      </div>
      <Textarea
        value={String(editingValue)}
        onChange={(e) => handleValueChange(e.target.value)}
        className="text-lg resize-y"
        rows={6}
        placeholder={t('node.enterText')}
      />
    </div>
  );
};