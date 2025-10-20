import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { useConnectionStore } from '@/ui/store/connectionStore';
import {
  Search,
  FolderOpen,
  File,
  Copy,
  Move,
  Trash2,
  Edit,
  Zap,
  AlertTriangle,
  X,
  Plus,
  CheckCircle,
  ArrowLeft,
  FileImage,
  FileCode,
  FileArchive,
  Layers,
  Upload,
  Loader2
} from 'lucide-react';

interface ModelFile {
  name: string;
  filename: string;
  folder_type: string;
  subfolder: string;
  path: string;
  relative_path: string;
  size: number;
  size_mb: number;
  extension: string;
  modified: number;
  modified_iso: string;
}

interface FolderInfo {
  name: string;
  path: string;
  full_path?: string;
  file_count: number;
  subfolder_count?: number;
  has_subfolders?: boolean;
}

interface SearchResult {
  success: boolean;
  query: string;
  folder_type: string;
  results: ModelFile[];
  total_found: number;
  limited: boolean;
}

interface TriggerWordsData {
  [loraName: string]: string[];
}

interface ModelBrowserProps {
  serverUrl?: string;
}

const ModelBrowser: React.FC<ModelBrowserProps> = ({ serverUrl: propServerUrl }) => {
  const navigate = useNavigate();
  const { url: storeServerUrl } = useConnectionStore();
  const serverUrl = propServerUrl || storeServerUrl || 'http://localhost:8188';
  
  // State management
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [models, setModels] = useState<ModelFile[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<ModelFile[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Dialog states
  const [isOperationModalOpen, setIsOperationModalOpen] = useState<boolean>(false);
  const [operationType, setOperationType] = useState<'copy' | 'move' | 'delete' | 'rename'>('copy');
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [targetFolder, setTargetFolder] = useState<string>('');
  const [targetSubfolder, setTargetSubfolder] = useState<string>('');
  const [newFilename, setNewFilename] = useState<string>('');
  
  // Trigger words state
  const [triggerWords, setTriggerWords] = useState<TriggerWordsData>({});
  const [isTriggerWordsModalOpen, setIsTriggerWordsModalOpen] = useState<boolean>(false);
  const [selectedLora, setSelectedLora] = useState<string>('');
  const [currentTriggerWords, setCurrentTriggerWords] = useState<string[]>([]);
  const [newTriggerWord, setNewTriggerWord] = useState<string>('');

  // Upload state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFolder, setUploadFolder] = useState<string>('');
  const [uploadSubfolder, setUploadSubfolder] = useState<string>('');
  const [uploadOverwrite, setUploadOverwrite] = useState<boolean>(true); // Always overwrite
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Partial uploads state
  const [partialUploads, setPartialUploads] = useState<Array<{
    filename: string;
    partial_filename: string;
    bytes_uploaded: number;
    size_mb: number;
    modified_iso: string;
  }>>([]);

  // Load folders
  const loadFolders = async () => {
    try {
      const response = await ComfyUIService.fetchModelFolders();
      if (response.success) {
        setFolders(response.folders);
      } else {
        setError(response.error || 'Failed to load model folders');
      }
    } catch (error) {
      setError('Failed to connect to server');
    }
  };

  // Load all models or models from specific folder
  const loadModels = async (folderName?: string) => {
    setIsLoading(true);
    try {
      const response = folderName && folderName !== 'all'
        ? await ComfyUIService.getModelsFromFolder(folderName)
        : await ComfyUIService.getAllModels();
      
      console.log(`API Response for folder ${folderName}:`, response);
      if (response.success) {
        console.log(`Successfully loaded ${response.models?.length || 0} models for folder: ${folderName}`);
        setModels(response.models || []);
      } else {
        console.error(`Failed to load models for folder ${folderName}:`, response.error);
        setError(response.error || 'Failed to load models');
      }
    } catch (error) {
      setError('Failed to load models');
    } finally {
      setIsLoading(false);
    }
  };

  // Search models
  const searchModels = async (query: string, folderType?: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await ComfyUIService.searchModels(query, folderType);
      if (response.success) {
        setSearchResults(response.results);
      } else {
        setError(response.error || 'Search failed');
      }
    } catch (error) {
      setError('Search request failed');
    } finally {
      setIsSearching(false);
    }
  };

  // Load trigger words
  const loadTriggerWords = async () => {
    try {
      const response = await ComfyUIService.getTriggerWords();
      if (response.success && response.trigger_words && typeof response.trigger_words === 'object') {
        setTriggerWords(response.trigger_words);
      } else {
        setTriggerWords({});
      }
    } catch (error) {
      console.warn('Failed to load trigger words:', error);
      setTriggerWords({});
    }
  };

  // Save trigger words for a LoRA
  const saveTriggerWordsForLora = async (loraName: string, words: string[]) => {
    try {
      const response = await ComfyUIService.saveTriggerWords({
        lora_name: loraName,
        trigger_words: words
      });
      
      if (response.success) {
        // Update local state
        setTriggerWords(prev => ({
          ...prev,
          [loraName]: words
        }));
        return true;
      } else {
        setError(response.error || 'Failed to save trigger words');
        return false;
      }
    } catch (error) {
      setError('Failed to save trigger words');
      return false;
    }
  };

  // Perform file operations
  const performOperation = async () => {
    if (!selectedModel) return;

    try {
      let response: any;

      switch (operationType) {
        case 'copy':
          response = await ComfyUIService.copyModelFile({
            filename: selectedModel.filename,
            source_folder: selectedModel.folder_type,
            target_folder: targetFolder,
            source_subfolder: selectedModel.subfolder,
            target_subfolder: targetSubfolder,
            new_filename: newFilename,
            overwrite: true
          });
          break;
        case 'move':
          response = await ComfyUIService.moveModelFile({
            filename: selectedModel.filename,
            source_folder: selectedModel.folder_type,
            target_folder: targetFolder,
            overwrite: true
          });
          break;
        case 'delete':
          response = await ComfyUIService.deleteModelFile({
            filename: selectedModel.filename,
            folder: selectedModel.folder_type,
            subfolder: selectedModel.subfolder
          });
          break;
        case 'rename':
          response = await ComfyUIService.renameModelFile({
            old_filename: selectedModel.filename,
            new_filename: newFilename,
            folder: selectedModel.folder_type,
            subfolder: selectedModel.subfolder,
            overwrite: true
          });
          break;
      }

      if (response?.success) {
        setIsOperationModalOpen(false);
        // Refresh models
        loadModels(selectedFolder !== 'all' ? selectedFolder : undefined);
        
        // Refresh trigger words if this operation affected LoRA files
        if (selectedModel?.folder_type === 'loras' && (operationType === 'rename' || operationType === 'delete' || operationType === 'move')) {
          loadTriggerWords();
        }
        
        // Show success message
        setError('');
      } else {
        setError(response?.error || `${operationType} operation failed`);
      }
    } catch (error) {
      setError(`${operationType} operation failed`);
    }
  };

  // Load partial uploads
  const loadPartialUploads = async () => {
    try {
      const response = await ComfyUIService.listPartialUploads();
      if (response.success && response.partial_uploads) {
        setPartialUploads(response.partial_uploads);
      }
    } catch (error) {
      console.warn('Failed to load partial uploads:', error);
    }
  };

  // Delete partial upload
  const deletePartial = async (partialFilename: string) => {
    try {
      const response = await ComfyUIService.deletePartialUpload(partialFilename);
      if (response.success) {
        loadPartialUploads();
      }
    } catch (error) {
      console.error('Failed to delete partial upload:', error);
    }
  };

  // Effects
  useEffect(() => {
    loadFolders();
    loadTriggerWords();
    loadPartialUploads();
  }, []);

  useEffect(() => {
    loadModels(selectedFolder !== 'all' ? selectedFolder : undefined);
  }, [selectedFolder]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const timeoutId = setTimeout(() => {
        searchModels(searchQuery, selectedFolder !== 'all' ? selectedFolder : undefined);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, selectedFolder]);

  // Helper functions
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
  };

  const openOperationModal = (operation: typeof operationType, model: ModelFile) => {
    setOperationType(operation);
    setSelectedModel(model);
    setTargetFolder(model.folder_type);
    setTargetSubfolder('');
    setNewFilename(model.filename);
    setIsOperationModalOpen(true);
  };

  const openTriggerWordsModal = (loraName: string) => {
    setSelectedLora(loraName);
    setCurrentTriggerWords((triggerWords && triggerWords[loraName] && Array.isArray(triggerWords[loraName])) ? triggerWords[loraName] : []);
    setIsTriggerWordsModalOpen(true);
  };

  const addTriggerWord = () => {
    if (newTriggerWord.trim() && !currentTriggerWords.includes(newTriggerWord.trim())) {
      setCurrentTriggerWords([...currentTriggerWords, newTriggerWord.trim()]);
      setNewTriggerWord('');
    }
  };

  const removeTriggerWord = (index: number) => {
    setCurrentTriggerWords(currentTriggerWords.filter((_, i) => i !== index));
  };

  const saveTriggerWordsModal = async () => {
    const success = await saveTriggerWordsForLora(selectedLora, currentTriggerWords);
    if (success) {
      setIsTriggerWordsModalOpen(false);
    }
  };

  // Open upload modal
  const openUploadModal = () => {
    setUploadFile(null);
    setUploadFolder(selectedFolder !== 'all' ? selectedFolder : '');
    setUploadSubfolder('');
    setUploadProgress(0);
    setIsUploadModalOpen(true);
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setUploadFile(files[0]);
    }
  };

  // Perform upload with retry logic
  const performUpload = async (retryCount = 0) => {
    if (!uploadFile || !uploadFolder) {
      setError('Please select a file and folder');
      return;
    }

    setIsUploading(true);
    if (retryCount === 0) {
      setUploadProgress(0);

    }

    try {
      const response = await ComfyUIService.uploadModelFile({
        file: uploadFile,
        folder: uploadFolder,
        subfolder: uploadSubfolder,
        overwrite: uploadOverwrite,
        onProgress: (progress) => {
          setUploadProgress(progress);
        }
      });

      if (response.success) {
        setUploadProgress(100);
        setIsUploadModalOpen(false);
        setError('');
        // Refresh models and partial uploads
        loadModels(selectedFolder !== 'all' ? selectedFolder : undefined);
        loadPartialUploads();
      } else {
        // Check if upload is resumable
        if ((response as any).resumable && retryCount < 5) {
          const bytesUploaded = (response as any).bytes_uploaded || 0;
          console.log(`Upload interrupted at ${bytesUploaded} bytes, retrying (attempt ${retryCount + 1}/5)...`);
          setError(`Connection lost at ${(bytesUploaded / (1024 * 1024)).toFixed(1)} MB. Retrying... (${retryCount + 1}/5)`);

          // Wait 2 seconds before retry
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Retry upload
          return performUpload(retryCount + 1);
        } else {
          setError(response.error || 'Upload failed');
        }
      }
    } catch (error: any) {
      setError(error.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      // Reset progress after a delay to show completion
      setTimeout(() => setUploadProgress(0), 500);
    }
  };

  // Filter out models smaller than 1MB (1,048,576 bytes)
  const MIN_FILE_SIZE = 1024 * 1024; // 1MB in bytes
  const displayModels = (searchQuery.trim() ? (searchResults || []) : (models || []))
    .filter(model => model.size >= MIN_FILE_SIZE);
  const isLoRAFolder = selectedFolder === 'loras' || displayModels.some(m => m.folder_type === 'loras');

  const handleBack = () => {
    sessionStorage.setItem('app-navigation', 'true');
    navigate('/', { replace: true });
  };

  // Get file type icon based on extension
  const getFileIcon = (extension: string) => {
    switch (extension.toLowerCase()) {
      case '.safetensors':
      case '.ckpt':
      case '.pt':
      case '.pth':
        return <Layers className="h-4 w-4 text-blue-500 flex-shrink-0" />;
      case '.bin':
        return <FileArchive className="h-4 w-4 text-orange-500 flex-shrink-0" />;
      case '.onnx':
        return <FileCode className="h-4 w-4 text-green-500 flex-shrink-0" />;
      case '.trt':
        return <FileImage className="h-4 w-4 text-purple-500 flex-shrink-0" />;
      default:
        return <File className="h-4 w-4 text-slate-500 flex-shrink-0" />;
    }
  };

  return (
    <div 
      className="bg-black transition-colors duration-300 pwa-container"
      style={{
        overflow: 'hidden',
        height: '100dvh',
        maxHeight: '100dvh',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        touchAction: 'none'
      }}
    >
      {/* Main Background with Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" />
      
      {/* Glassmorphism Background Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
      
      {/* Main Scrollable Content Area */}
      <div 
        className="absolute top-0 left-0 right-0 bottom-0"
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          position: 'absolute'
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-50 pwa-header bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border-b border-white/20 dark:border-slate-600/20 shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/25 relative overflow-hidden">
          {/* Gradient Overlay for Enhanced Glass Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10 pointer-events-none" />
          <div className="relative z-10 p-4 space-y-3">
          {/* First Row - Back Button and Title */}
          <div className="flex items-center space-x-3">
            <Button
              onClick={handleBack}
              variant="ghost"
              size="sm"
              className="bg-white/20 dark:bg-slate-700/20 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 shadow-lg hover:shadow-xl hover:bg-white/30 dark:hover:bg-slate-700/30 transition-all duration-300 h-10 w-10 p-0 flex-shrink-0 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Model Browser
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Browse and manage your AI models
              </p>
            </div>
          </div>
          
          {/* Second Row - Search and Filter Controls */}
          <div className="flex items-center space-x-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white dark:bg-slate-800"
              />
            </div>
            <Select value={selectedFolder} onValueChange={setSelectedFolder}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Folders</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.name} value={folder.name}>
                    {folder.name} ({folder.file_count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={openUploadModal}
              variant="default"
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg h-10 px-4"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </div>
          
          {/* Status */}
          {searchQuery && (
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {isSearching ? 'Searching...' : `Found ${searchResults.length} models`}
            </div>
          )}
          </div>
        </div>
        
        {/* Content */}
        <div className="container mx-auto px-4 py-0 max-w-6xl">
        {/* Partial Uploads Banner */}
        {partialUploads.length > 0 && (
          <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                  Incomplete Uploads ({partialUploads.length})
                </h3>
                <div className="space-y-2">
                  {partialUploads.map((partial) => (
                    <div key={partial.partial_filename} className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{partial.filename}</div>
                        <div className="text-xs text-slate-500">
                          {partial.size_mb} MB uploaded · {new Date(partial.modified_iso).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex space-x-2 ml-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="text-xs"
                          onClick={() => {
                            // Pre-fill upload form with this file's info
                            setUploadFolder(selectedFolder !== 'all' ? selectedFolder : '');
                            setIsUploadModalOpen(true);
                            setError(`Ready to resume: ${partial.filename}`);
                          }}
                        >
                          Resume
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs"
                          onClick={() => deletePartial(partial.partial_filename)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 ml-auto"
                onClick={() => setError('')}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Model List */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : displayModels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-slate-400">
            <File className="h-16 w-16 mb-4" />
            <p className="text-lg">{searchQuery ? 'No models found' : 'No models in selected folder'}</p>
            <p className="text-sm">Try adjusting your search or selecting a different folder</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {displayModels.map((model, index) => (
              <div key={`${model.relative_path}-${index}`} className="hover:shadow-lg transition-shadow border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl px-3 py-3 space-y-1.5">
                  {/* Line 1: Title with File Icon and Date */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      {getFileIcon(model.extension)}
                      <h3 className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {model.filename}
                      </h3>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 ml-2">
                      {new Date(model.modified * 1000).toLocaleDateString()}
                    </span>
                  </div>
                  
                  {/* Line 2: Badges (Extension, Type, Folder, Size) */}
                  <div className="flex items-center flex-wrap gap-1">
                    <Badge variant="secondary" className="text-xs">
                      {model.extension}
                    </Badge>
                    {model.folder_type === 'loras' && (
                      <Badge variant="outline" className="text-xs">
                        LoRA
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      <FolderOpen className="h-2 w-2 mr-1" />
                      {model.folder_type}{model.subfolder ? `/${model.subfolder}` : ''}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {formatFileSize(model.size)}
                    </Badge>
                  </div>

                  {/* Trigger Words Count for LoRA (if exists) */}
                  {model.folder_type === 'loras' && triggerWords && triggerWords[model.filename] && Array.isArray(triggerWords[model.filename]) && triggerWords[model.filename].length > 0 && (
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs">
                        <Zap className="h-2 w-2 mr-1" />
                        {triggerWords[model.filename].length} trigger{triggerWords[model.filename].length === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  )}
                  
                  {/* Action Buttons - 5 Equal Columns for Mobile Touch */}
                  <div className="grid grid-cols-5 gap-1 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 p-2 flex flex-col items-center justify-center space-y-0.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                      onClick={() => openOperationModal('copy', model)}
                      title="Copy"
                    >
                      <Copy className="h-4 w-4" />
                      <span className="text-xs">Copy</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 p-2 flex flex-col items-center justify-center space-y-0.5 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                      onClick={() => openOperationModal('move', model)}
                      title="Move"
                    >
                      <Move className="h-4 w-4" />
                      <span className="text-xs">Move</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 p-2 flex flex-col items-center justify-center space-y-0.5 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg"
                      onClick={() => openOperationModal('rename', model)}
                      title="Rename"
                    >
                      <Edit className="h-4 w-4" />
                      <span className="text-xs">Rename</span>
                    </Button>
                    {model.folder_type === 'loras' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-11 p-2 flex flex-col items-center justify-center space-y-0.5 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg"
                        onClick={() => openTriggerWordsModal(model.filename)}
                        title="Manage Trigger Words"
                      >
                        <Zap className="h-4 w-4" />
                        <span className="text-xs">Trigger</span>
                      </Button>
                    ) : (
                      <div className="h-11"></div>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 p-2 flex flex-col items-center justify-center space-y-0.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      onClick={() => openOperationModal('delete', model)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="text-xs">Delete</span>
                    </Button>
                  </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {/* Operation Modal */}
      <Dialog open={isOperationModalOpen} onOpenChange={setIsOperationModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">{operationType} Model</DialogTitle>
          </DialogHeader>
          
          {selectedModel && (
            <div className="space-y-4">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {operationType === 'delete' ? 'Are you sure you want to delete this model?' : 'Configure the operation:'}
              </div>
              
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="font-medium text-sm">{selectedModel.filename}</div>
                <div className="text-xs text-slate-500">
                  {selectedModel.folder_type}{selectedModel.subfolder ? `/${selectedModel.subfolder}` : ''}
                </div>
              </div>

              {operationType === 'rename' && (
                <div>
                  <label className="text-sm font-medium">New Filename</label>
                  <Input
                    value={newFilename}
                    onChange={(e) => setNewFilename(e.target.value)}
                    placeholder="Enter new filename"
                  />
                </div>
              )}

              {(operationType === 'copy' || operationType === 'move') && (
                <>
                  <div>
                    <label className="text-sm font-medium">Target Folder</label>
                    <Select value={targetFolder} onValueChange={setTargetFolder}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {folders.map((folder) => (
                          <SelectItem key={folder.name} value={folder.name}>
                            {folder.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Target Subfolder (Optional)</label>
                    <Input
                      value={targetSubfolder}
                      onChange={(e) => setTargetSubfolder(e.target.value)}
                      placeholder="Enter subfolder name (will be created if it doesn't exist)"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOperationModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={performOperation}
              variant={operationType === 'delete' ? 'destructive' : 'default'}
            >
              {operationType === 'delete' ? 'Delete' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trigger Words Modal */}
      <Dialog open={isTriggerWordsModalOpen} onOpenChange={setIsTriggerWordsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Zap className="h-4 w-4 mr-2" />
              Manage Trigger Words
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Configure trigger words for: <strong>{selectedLora}</strong>
            </div>

            {/* Add new trigger word */}
            <div className="flex space-x-2">
              <Input
                value={newTriggerWord}
                onChange={(e) => setNewTriggerWord(e.target.value)}
                placeholder="Enter trigger word..."
                onKeyPress={(e) => e.key === 'Enter' && addTriggerWord()}
              />
              <Button onClick={addTriggerWord} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Current trigger words */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Trigger Words:</label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {currentTriggerWords.length === 0 ? (
                  <div className="text-sm text-slate-500 italic">No trigger words set</div>
                ) : (
                  currentTriggerWords.map((word, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                      <span className="text-sm">{word}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => removeTriggerWord(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTriggerWordsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveTriggerWordsModal}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Upload className="h-4 w-4 mr-2" />
              Upload Model File
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Upload a model file to your ComfyUI models directory
            </div>

            {/* File Selection */}
            <div>
              <label className="text-sm font-medium block mb-2">Select File</label>
              <Input
                type="file"
                onChange={handleFileSelect}
                disabled={isUploading}
                accept="*/*"
              />
              {uploadFile && (
                <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800 rounded text-sm">
                  <div className="font-medium truncate">{uploadFile.name}</div>
                  <div className="text-xs text-slate-500">
                    {formatFileSize(uploadFile.size)}
                  </div>
                </div>
              )}
            </div>

            {/* Target Folder */}
            <div>
              <label className="text-sm font-medium block mb-2">Target Folder *</label>
              <Select value={uploadFolder} onValueChange={setUploadFolder} disabled={isUploading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select folder..." />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((folder) => (
                    <SelectItem key={folder.name} value={folder.name}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Subfolder (Optional) */}
            <div>
              <label className="text-sm font-medium block mb-2">Subfolder (Optional)</label>
              <Input
                value={uploadSubfolder}
                onChange={(e) => setUploadSubfolder(e.target.value)}
                placeholder="e.g., character, style..."
                disabled={isUploading}
              />
              <p className="text-xs text-slate-500 mt-1">
                Will be created if it doesn't exist
              </p>
            </div>

            {/* Overwrite Option - Hidden, always enabled */}

            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsUploadModalOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={performUpload}
              disabled={!uploadFile || !uploadFolder || isUploading}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ModelBrowser;