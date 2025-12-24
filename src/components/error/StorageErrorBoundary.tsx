/**
 * Storage Error Boundary
 * 
 * Catches React errors that might be caused by storage corruption
 * and provides recovery options to the user.
 */

import React from 'react';
import { toast } from 'sonner';
import { performSelectiveStorageCleanup } from '@/utils/storageRecovery';
import { withTranslation, WithTranslation } from 'react-i18next';

interface StorageErrorBoundaryState {
  hasError: boolean;
  errorInfo?: string;
  isRecovering: boolean;
}

interface StorageErrorBoundaryProps extends WithTranslation {
  children: React.ReactNode;
}

class StorageErrorBoundary extends React.Component<
  StorageErrorBoundaryProps,
  StorageErrorBoundaryState
> {
  constructor(props: StorageErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      isRecovering: false
    };
  }

  static getDerivedStateFromError(error: Error): StorageErrorBoundaryState {
    // Check if this looks like a storage-related error
    const storageRelatedKeywords = [
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'quota',
      'storage',
      'persist',
      'zustand'
    ];

    const isStorageError = storageRelatedKeywords.some(keyword =>
      error.message.toLowerCase().includes(keyword) ||
      error.stack?.toLowerCase().includes(keyword)
    );

    // Note: We can't access 't' here easily as it's static, 
    // so we set keys or simple strings that render will translate (or handle in render)
    // For simplicity, we'll keep errorInfo as a key or status flag
    // But since render reads it, we can just store the 'type' of error.

    return {
      hasError: true,
      errorInfo: isStorageError ? 'storage' : 'unexpected',
      isRecovering: false
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('💥 StorageErrorBoundary caught an error:', error, errorInfo);
  }

  handleRecovery = async () => {
    const { t } = this.props;
    this.setState({ isRecovering: true });

    try {
      toast.loading(`🔧 ${t('storageError.toast.attempting')}`, {
        description: t('storageError.toast.preserving'),
        duration: 2000
      });

      const result = await performSelectiveStorageCleanup();

      if (result.success) {
        toast.success(`✅ ${t('storageError.toast.success')}`, {
          description: t('storageError.toast.refreshing'),
          duration: 2000
        });

        setTimeout(() => {
          window.location.reload();
        }, 2500);
      } else {
        toast.error(`❌ ${t('storageError.toast.failed')}`, {
          description: result.errorMessage || t('storageError.toast.manual'),
          duration: 5000
        });
        this.setState({ isRecovering: false });
      }
    } catch (error) {
      console.error('Recovery failed:', error);
      toast.error(`❌ ${t('storageError.toast.failed')}`, {
        description: t('storageError.toast.manualAction'),
        duration: 5000
      });
      this.setState({ isRecovering: false });
    }
  };

  handleManualRefresh = () => {
    window.location.reload();
  };

  render() {
    const { t } = this.props;

    if (this.state.hasError) {
      const errorDescription = this.state.errorInfo === 'storage'
        ? t('storageError.description')
        : t('storageError.unexpected');

      return (
        <div className="pwa-container bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6 text-center space-y-4">

            {this.state.isRecovering ? (
              <>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto"></div>
                <h2 className="text-xl font-semibold text-white">🔧 {t('storageError.recovering')}</h2>
                <p className="text-gray-300">{t('storageError.recoveringDesc')}</p>
              </>
            ) : (
              <>
                <div className="text-6xl mb-4">⚠️</div>
                <h2 className="text-xl font-semibold text-white">{t('storageError.title')}</h2>
                <p className="text-gray-300 text-sm">
                  {errorDescription}
                </p>

                <div className="space-y-2 pt-4">
                  <button
                    onClick={this.handleRecovery}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition-colors"
                    disabled={this.state.isRecovering}
                  >
                    🔧 {t('storageError.tryAuto')}
                  </button>

                  <button
                    onClick={this.handleManualRefresh}
                    className="w-full bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-md transition-colors"
                    disabled={this.state.isRecovering}
                  >
                    🔄 {t('storageError.refresh')}
                  </button>

                  <div className="text-xs text-gray-400 pt-2">
                    <p>💡 {t('storageError.hint')}</p>
                    <p>{t('storageError.hintFail')}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation()(StorageErrorBoundary);