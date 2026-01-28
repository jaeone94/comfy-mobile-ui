/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  loadAllWorkflows
} from "@/infrastructure/storage/IndexedDBWorkflowService";
import ComfyUIService from '@/infrastructure/api/ComfyApiClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ArrowLeft,
  Settings,
  Code,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  Sparkles,
  Save,
  LayoutList
} from 'lucide-react';
import { toast } from 'sonner';
import { WidgetTypeSettings } from './WidgetTypeSettings';
import { WidgetTypeManager } from '@/core/services/WidgetTypeManager';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Workflow as IComfyWorkflow } from '@/shared/types/app/IComfyWorkflow';

// Interfaces
interface CustomWidgetType {
  id: string;
  type: 'select' | 'combo' | 'slider';
  options?: any[];
  min?: number;
  max?: number;
  step?: number;
}

interface InputFieldMapping {
  fieldName: string;
  fieldType: string;
  currentValue?: any;
  assignedWidgetType?: string;
  isCustomField?: boolean;
  hasWidget?: boolean;
}

interface NodeInfo {
  id: string;
  type: string;
  title?: string;
  inputs: Array<{
    name: string;
    type: string;
    link?: number;
    widget?: any;
  }>;
  _meta?: any;
}

interface Workflow extends IComfyWorkflow { }

export const NodePatch: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // View & Step state
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'settings'>('list');
  const [currentStep, setCurrentStep] = useState<'workflow' | 'node' | 'mapping'>('workflow');

  // Data state
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [widgetTypes, setWidgetTypes] = useState<CustomWidgetType[]>([]);
  const [existingMappings, setExistingMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Selection state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [inputMappings, setInputMappings] = useState<InputFieldMapping[]>([]);

  // Field creation state
  const [newFieldName, setNewFieldName] = useState('');
  const [selectedWidgetTypeForNewField, setSelectedWidgetTypeForNewField] = useState('LORA_CONFIG');
  const [isAddingNewField, setIsAddingNewField] = useState(false);
  const [selectedScope, setSelectedScope] = useState<'global' | 'workflow' | 'specific'>('global');
  const [saving, setSaving] = useState(false);

  // Node search query for Step 2
  const [nodeSearchQuery, setNodeSearchQuery] = useState('');

  // Expanded nodes for list view
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const loadExistingMappings = async () => {
    try {
      const mappings = await ComfyUIService.getCustomNodeMappings();
      setExistingMappings(mappings || []);
      console.log('📦 Loaded existing mappings:', mappings);
    } catch (error) {
      console.error('Failed to load existing mappings:', error);
      setExistingMappings([]);
    }
  };

  // Load data
  useEffect(() => {
    const initData = async () => {
      try {
        setLoading(true);
        const storedWorkflows = await loadAllWorkflows();
        setWorkflows(storedWorkflows);

        // Fetch widget types
        let remoteWidgetTypes: any[] = [];
        try {
          remoteWidgetTypes = await ComfyUIService.getAllCustomWidgetTypes();
        } catch (e) {
          console.warn('Failed to fetch widget types from server', e);
        }

        const savedWidgetTypes = localStorage.getItem('comfyui_custom_widget_types');
        const localWidgetTypes = savedWidgetTypes ? JSON.parse(savedWidgetTypes) : [];
        const combined = [...remoteWidgetTypes];
        localWidgetTypes.forEach((lt: any) => {
          if (!combined.find(t => t.id === lt.id)) combined.push(lt);
        });
        setWidgetTypes(combined);

        // Load mappings
        await loadExistingMappings();
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error(t('customTypes.toast.loadFailed') || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, [t, viewMode]);

  // Handlers
  const handleWorkflowSelect = (workflow: any) => {
    setSelectedWorkflowId(workflow.id);
    setSelectedNode(null);
    setInputMappings([]);
    setCurrentStep('node');
  };

  const handleNodeSelect = (nodeId: string, nodeData: any) => {
    const nodeInfo: NodeInfo = {
      id: nodeId,
      type: nodeData.type,
      inputs: nodeData.inputs || [],
      _meta: nodeData._meta
    };

    setSelectedNode(nodeInfo);

    const mappings: InputFieldMapping[] = nodeInfo.inputs.map((input) => ({
      fieldName: input.name,
      fieldType: input.type,
      assignedWidgetType: undefined,
      isCustomField: false,
      hasWidget: true
    }));

    setInputMappings(mappings);
    setCurrentStep('mapping');
  };

  const handleWidgetTypeAssignment = (fieldName: string, widgetTypeId: string) => {
    setInputMappings(prev =>
      prev.map(mapping =>
        mapping.fieldName === fieldName
          ? { ...mapping, assignedWidgetType: widgetTypeId === 'none' ? undefined : widgetTypeId }
          : mapping
      )
    );
  };

  const handleAddNewField = () => {
    if (!newFieldName.trim()) {
      toast.error(t('nodePatch.toast.enterName'));
      return;
    }

    if (inputMappings.some(m => m.fieldName === newFieldName.trim())) {
      toast.error(t('nodePatch.toast.exists'));
      return;
    }

    const newMapping: InputFieldMapping = {
      fieldName: newFieldName.trim(),
      fieldType: selectedWidgetTypeForNewField,
      assignedWidgetType: selectedWidgetTypeForNewField,
      isCustomField: true,
      hasWidget: true
    };

    setInputMappings(prev => [...prev, newMapping]);
    setNewFieldName('');
    setIsAddingNewField(false);
  };

  const handleRemoveCustomField = (fieldName: string) => {
    setInputMappings(prev => prev.filter(m => m.fieldName !== fieldName));
  };

  const handleSaveMapping = async () => {
    if (!selectedNode) return;

    setSaving(true);
    try {
      const workflow = workflows.find(w => w.id === selectedWorkflowId);

      const bindingData = {
        nodeType: selectedNode.type,
        inputMappings: inputMappings
          .filter(m => m.assignedWidgetType && !m.isCustomField)
          .reduce((acc, mapping) => {
            if (mapping.assignedWidgetType) acc[mapping.fieldName] = mapping.assignedWidgetType;
            return acc;
          }, {} as Record<string, string>),
        customFields: inputMappings
          .filter(m => m.isCustomField)
          .map(mapping => ({
            fieldName: mapping.fieldName,
            fieldType: mapping.assignedWidgetType || 'STRING',
            assignedWidgetType: mapping.assignedWidgetType,
            defaultValue: null
          })),
        scope: {
          type: selectedScope,
          workflowId: selectedScope !== 'global' ? selectedWorkflowId : undefined,
          workflowName: selectedScope !== 'global' ? workflow?.name : undefined,
          nodeId: selectedScope === 'specific' ? selectedNode.id : undefined
        },
        createdAt: new Date().toISOString()
      };

      await ComfyUIService.saveCustomNodeMapping(bindingData as any);
      toast.success(t('nodePatch.toast.saveSuccess', { type: selectedNode.type }));

      await loadExistingMappings();
      setViewMode('list');
      setCurrentStep('workflow');

      // Reset creation state
      setSelectedWorkflowId(null);
      setSelectedNode(null);
      setInputMappings([]);
    } catch (error) {
      console.error('Failed to save mapping:', error);
      toast.error(t('nodePatch.toast.saveFailed', { error: (error as any).message || error }));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMapping = async (nodeType: string, scope: any) => {
    const scopeTypeLabel = t(`nodePatch.scope.${scope.type}`);
    if (confirm(t('nodePatch.toast.deleteConfirm', { type: nodeType, scope: scopeTypeLabel }))) {
      try {
        await ComfyUIService.deleteCustomNodeMapping(nodeType, scope);
        toast.success(t('nodePatch.toast.deleteSuccess', { type: nodeType, scope: scopeTypeLabel }));
        await loadExistingMappings();
      } catch (error) {
        console.error('Error deleting mapping:', error);
        toast.error(t('nodePatch.toast.deleteFailed'));
      }
    }
  };

  const handleCreateLoraExample = async () => {
    setSaving(true);
    try {
      const loraType = WidgetTypeManager.createLoraConfigExample();

      const customFields = Array.from({ length: 15 }, (_, i) => ({
        fieldName: `lora_${i + 1}`,
        fieldType: 'LORA_CONFIG',
        assignedWidgetType: loraType.id,
        defaultValue: null
      }));

      const bindingData = {
        nodeType: 'Power Lora Loader (rgthree)',
        inputMappings: {},
        customFields,
        scope: { type: 'global' },
        createdAt: new Date().toISOString()
      };

      await ComfyUIService.saveCustomNodeMapping(bindingData as any);
      toast.success(t('nodePatch.toast.exampleCreated'));
      await loadExistingMappings();
    } catch (error) {
      console.error('Error creating example:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleNodeExpand = (nodeType: string, index: number) => {
    const key = `${nodeType}-${index}`;
    setExpandedNodes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getWorkflowConfiguredNodesCount = (wfId: string) => {
    return existingMappings.filter(m =>
      (m.scope?.type === 'workflow' || m.scope?.type === 'specific') &&
      m.scope?.workflowId === wfId
    ).length;
  };

  // Filtered nodes for Step 2
  const filteredNodes = useMemo(() => {
    if (!selectedWorkflowId) return [];
    const workflow = workflows.find(w => w.id === selectedWorkflowId);
    if (!workflow || !workflow.workflow_json || !workflow.workflow_json.nodes) return [];

    const nodes = workflow.workflow_json.nodes;
    let nodeList = (Object.values(nodes) as any[]);

    if (nodeSearchQuery) {
      const query = nodeSearchQuery.toLowerCase();
      nodeList = nodeList.filter(n =>
        n.type.toLowerCase().includes(query) ||
        (n._meta?.title && n._meta.title.toLowerCase().includes(query))
      );
    }

    return nodeList.sort((a, b) => a.type.localeCompare(b.type));
  }, [workflows, selectedWorkflowId, nodeSearchQuery]);

  // Renderers
  const renderHeader = () => (
    <div className="mb-6 rounded-2xl bg-white/5 border border-white/10 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-lg font-bold text-white tracking-tight leading-tight">
            {viewMode === 'settings' ? t('widgetTypeSettings.title') :
              viewMode === 'create' ? t('nodePatch.createTitle') :
                t('menu.nodePatches')}
          </h2>
          <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider mt-1">
            {viewMode === 'settings' ? t('widgetTypeSettings.subtitle') :
              viewMode === 'create' ? t('nodePatch.createSubtitle') :
                t('nodePatch.listSubtitle')}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {viewMode === 'list' && (
            <>
              <Button
                onClick={handleCreateLoraExample}
                variant="ghost"
                size="sm"
                className="bg-white/5 hover:bg-white/10 text-white/80 h-10 px-3 rounded-xl border border-white/5 shadow-sm transition-all active:scale-95"
                title={t('widgetTypeSettings.createLoraExample')}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {t('widgetTypeSettings.createLoraExample')}
              </Button>
              <Button
                onClick={() => {
                  setViewMode('create');
                  setCurrentStep('workflow');
                }}
                variant="default"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 h-10 w-10 p-0 rounded-xl transition-all active:scale-95"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </>
          )}
          {viewMode !== 'list' && (
            <Button
              onClick={() => {
                setViewMode('list');
                setCurrentStep('workflow');
              }}
              variant="ghost"
              size="sm"
              className="text-white/60 hover:text-white"
            >
              <LayoutList className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const renderWorkflowStep = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
      {workflows.map((workflow) => (
        <div
          key={workflow.id}
          onClick={() => handleWorkflowSelect(workflow)}
          className={`cursor-pointer group relative overflow-hidden rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/40 transition-all duration-300 ${selectedWorkflowId === workflow.id ? 'ring-1 ring-indigo-500 bg-indigo-500/10' : ''}`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="font-medium text-white/90 truncate pr-4">{workflow.name}</h3>
              <p className="text-xs text-white/40">
                {workflow.createdAt ? new Date(workflow.createdAt).toLocaleDateString() : 'Unknown date'}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-white/50">
            <div className="flex items-center">
              <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
              {t('nodePatch.inputs', { count: workflow.workflow_json?.nodes?.length || 0 })}
            </div>
            {getWorkflowConfiguredNodesCount(workflow.id) > 0 && (
              <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/5 px-1.5 text-[9px]">
                {getWorkflowConfiguredNodesCount(workflow.id)} {t('nodePatch.activePatches')}
              </Badge>
            )}
          </div>
        </div>
      ))}
      {workflows.length === 0 && (
        <div className="col-span-full flex flex-col items-center justify-center p-12 text-white/30 text-center">
          <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
          <p>{t('nodePatch.noWorkflows')}</p>
        </div>
      )}
    </div>
  );

  const renderNodeStep = () => {
    const workflow = workflows.find(w => w.id === selectedWorkflowId);
    if (!workflow) return null;

    return (
      <div className="space-y-4 pb-20">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
            {t('nodePatch.selectNode')}
          </h3>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <Input
            placeholder={t('nodePatch.searchPlaceholder')}
            value={nodeSearchQuery}
            onChange={(e) => setNodeSearchQuery(e.target.value)}
            className="pl-9 bg-black/20 border-white/10 text-white/90 placeholder:text-white/20 h-10 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          {filteredNodes.map((node: any) => (
            <div
              key={node.id}
              onClick={() => handleNodeSelect(node.id, node)}
              className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 transition-all cursor-pointer"
            >
              <div className="flex items-center space-x-4">
                <div className="p-2.5 bg-indigo-500/10 rounded-lg">
                  <Code className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <h4 className="font-medium text-white/90 text-sm">{node.type}</h4>
                  <p className="text-xs text-white/40 font-mono mt-0.5">ID: {node.id}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-white/20" />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMappingStep = () => {
    if (!selectedNode) return null;

    return (
      <div className="space-y-6 pb-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 gap-4">
          <div>
            <h3 className="text-lg font-medium text-indigo-100">{selectedNode.type}</h3>
            <p className="text-xs text-indigo-300/60">{t('nodePatch.nodeInfo', { id: selectedNode.id, count: inputMappings.length })}</p>
          </div>

          <div className="flex flex-col space-y-2 min-w-[140px]">
            <label className="text-[10px] uppercase tracking-wider text-indigo-300/60 font-medium">{t('nodePatch.scopeTitle')}</label>
            <Select
              value={selectedScope}
              onValueChange={(val: any) => setSelectedScope(val)}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1e293b] border-white/10 text-white text-xs">
                <SelectItem value="global">{t('nodePatch.scope.global')}</SelectItem>
                <SelectItem value="workflow">{t('nodePatch.scope.workflow')}</SelectItem>
                <SelectItem value="specific">{t('nodePatch.scope.specific')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          {inputMappings.map((mapping, idx) => (
            <div key={`${mapping.fieldName}-${idx}`} className="p-4 rounded-xl border border-white/10 bg-black/20 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-white/90">{mapping.fieldName}</label>
                    {mapping.isCustomField && <Badge variant="outline" className="text-[8px] py-0 h-4 border-white/5 opacity-40">{t('nodePatch.custom')}</Badge>}
                  </div>
                  <p className="text-xs text-white/40 mt-1">{t('common.item')}: {mapping.fieldType}</p>
                </div>
                {(mapping.isCustomField || mapping.assignedWidgetType) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                    onClick={() => {
                      if (mapping.isCustomField) {
                        handleRemoveCustomField(mapping.fieldName);
                      } else {
                        handleWidgetTypeAssignment(mapping.fieldName, 'none');
                      }
                    }}
                    title={t('common.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs text-white/50">{t('nodePatch.widgetType')}</label>
                <Select
                  value={mapping.assignedWidgetType || "none"}
                  onValueChange={(value) => handleWidgetTypeAssignment(mapping.fieldName, value)}
                >
                  <SelectTrigger className="bg-black/40 border-white/10 text-white h-9">
                    <SelectValue placeholder={t('nodePatch.selectWidgetType')} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1e293b] border-white/10 text-white">
                    <SelectItem value="none">{t('nodePatch.noWidgetType')}</SelectItem>
                    {widgetTypes.map(wt => (
                      <SelectItem key={wt.id} value={wt.id}>{wt.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>

        {/* Add Custom Field */}
        <div className="p-4 rounded-xl border-2 border-dashed border-white/5 bg-white/2 flex flex-col gap-3">
          {isAddingNewField ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-white/40 uppercase tracking-wider">{t('nodePatch.fieldName')}</label>
                  <Input
                    placeholder="e.g. lora_1"
                    className="bg-black/20 border-white/10 text-sm h-9"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-white/40 uppercase tracking-wider">{t('nodePatch.widgetType')}</label>
                  <Select value={selectedWidgetTypeForNewField} onValueChange={setSelectedWidgetTypeForNewField}>
                    <SelectTrigger className="bg-black/20 border-white/10 text-white h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1e293b] border-white/10 text-white">
                      {widgetTypes.map(wt => <SelectItem key={wt.id} value={wt.id}>{wt.id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 bg-indigo-600 hover:bg-indigo-500" onClick={handleAddNewField}>
                  {t('nodePatch.addField')}
                </Button>
                <Button size="sm" variant="ghost" className="px-3" onClick={() => setIsAddingNewField(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="ghost" className="text-white/40 hover:text-white/60 hover:bg-white/5 border-0 h-10 italic text-xs" onClick={() => setIsAddingNewField(true)}>
              <Plus className="h-3.5 w-3.5 mr-2" /> {t('nodePatch.addCustomPrompt')}
            </Button>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-white/5">
          <Button
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-12 shadow-xl shadow-indigo-500/20"
            onClick={handleSaveMapping}
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t('nodePatch.savePatch')}
          </Button>
        </div>
      </div>
    );
  };

  const renderListView = () => {
    if (loading) return <div className="p-20 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-indigo-500 opacity-50" /></div>;

    if (existingMappings.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-white/30 p-8 text-center">
          <div className="bg-white/5 p-6 rounded-full mb-6">
            <LayoutGrid className="h-12 w-12 opacity-50" />
          </div>
          <h3 className="text-xl font-medium text-white/90 mb-2">{t('nodePatch.noCustomMappings')}</h3>
          <p className="max-w-xs mx-auto mb-8">{t('nodePatch.startPrompt')}</p>
          <Button onClick={() => setViewMode('create')} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-12 px-6 shadow-lg shadow-indigo-500/20">
            <Plus className="mr-2 h-5 w-5" /> {t('nodePatch.createPatch')}
          </Button>
        </div>
      );
    }

    const grouped = existingMappings.reduce((acc, mapping) => {
      if (!acc[mapping.nodeType]) acc[mapping.nodeType] = [];
      acc[mapping.nodeType].push(mapping);
      return acc;
    }, {} as Record<string, any[]>);

    return (
      <div className="p-4 space-y-4 pb-20 max-w-4xl mx-auto">
        {(Object.entries(grouped) as [string, any[]][]).map(([nodeType, mappings], typeIdx) => (
          <div key={nodeType} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
            <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors" onClick={() => toggleNodeExpand(nodeType, typeIdx)}>
              <div className="flex items-center space-x-3 overflow-hidden">
                {expandedNodes[`${nodeType}-${typeIdx}`] ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
                <h3 className="font-medium text-white/90 truncate">{nodeType}</h3>
                <Badge variant="secondary" className="bg-white/10 text-white/60 text-[10px] ml-2">
                  {t('nodePatch.records', { count: (mappings as any[]).length })}
                </Badge>
              </div>
            </div>

            {expandedNodes[`${nodeType}-${typeIdx}`] && (
              <div className="border-t border-white/5 bg-black/10 px-4 py-4 space-y-4">
                {mappings.map((mapping: any, idx: number) => {
                  const scopeLabel = mapping.scope?.type === 'global' ? t('nodePatch.scope.global') :
                    mapping.scope?.type === 'workflow' ? `${t('nodePatch.scope.workflow')}: ${mapping.scope.workflowName || mapping.scope.workflowId}` :
                      `${t('nodePatch.scope.specific')}: ${mapping.scope.nodeId}`;
                  const scopeColor = mapping.scope?.type === 'global' ? 'indigo' : mapping.scope?.type === 'workflow' ? 'green' : 'amber';

                  return (
                    <div key={idx} className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-3 relative group">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className={`w-1 h-3 rounded bg-${scopeColor}-500`} />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">{scopeLabel}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-400/60 hover:text-red-400 hover:bg-red-400/10 rounded-lg absolute top-2 right-2 transition-all"
                          onClick={() => handleDeleteMapping(nodeType, mapping.scope)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {/* Input Mappings */}
                        {Object.entries(mapping.inputMappings || {}).map(([field, widget]) => (
                          <div key={field} className="flex items-center justify-between text-xs py-1.5 px-2 bg-black/40 rounded border border-white/5">
                            <span className="text-white/60 truncate mr-2">{field}</span>
                            <Badge variant="outline" className="border-indigo-500/20 text-indigo-300 font-mono py-0 h-4 px-1">{widget as string}</Badge>
                          </div>
                        ))}
                        {/* Custom Fields */}
                        {(mapping.customFields || []).map((f: any) => (
                          <div key={f.fieldName} className="flex items-center justify-between text-xs py-1.5 px-2 bg-indigo-500/5 rounded border border-indigo-500/10">
                            <span className="text-indigo-200/60 truncate mr-2">{f.fieldName}</span>
                            <Badge variant="outline" className="border-indigo-400/30 text-indigo-300 font-mono py-0 h-4 px-1">{f.assignedWidgetType}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="w-full min-h-full">
      {renderHeader()}
      <div className="mt-4">
        {viewMode === 'settings' ? (
          <div className="p-0 max-w-6xl mx-auto"><WidgetTypeSettings /></div>
        ) : viewMode === 'create' ? (
          <div className="p-4 max-w-4xl mx-auto">
            {/* Step Indicators */}
            <div className="flex items-center justify-center space-x-4 mb-12">
              {['workflow', 'node', 'mapping'].map((step, idx) => {
                const isActive = currentStep === step;
                const isCompleted = idx < ['workflow', 'node', 'mapping'].indexOf(currentStep);
                return (
                  <React.Fragment key={step}>
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${isActive ? 'border-indigo-500 bg-indigo-500/20 text-indigo-400' : isCompleted ? 'border-green-500 bg-green-500/20 text-green-400' : 'border-white/10 text-white/20'}`}>
                        {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                      </div>
                      <span className={`text-[10px] mt-2 font-medium uppercase tracking-wider ${isActive ? 'text-indigo-400' : 'text-white/30'}`}>{t(`nodePatch.step.${step}`)}</span>
                    </div>
                    {idx < 2 && <div className={`w-12 h-px ${isCompleted ? 'bg-green-500/30' : 'bg-white/5'}`} />}
                  </React.Fragment>
                );
              })}
            </div>

            {currentStep === 'workflow' && renderWorkflowStep()}
            {currentStep === 'node' && renderNodeStep()}
            {currentStep === 'mapping' && renderMappingStep()}

            {currentStep !== 'workflow' && (
              <div className="fixed bottom-6 left-0 right-0 px-4 flex justify-center z-40 pwa-safe-area">
                <Button onClick={() => { if (currentStep === 'mapping') setCurrentStep('node'); else if (currentStep === 'node') setCurrentStep('workflow'); }} variant="outline" className="bg-[#1e293b] border-white/10 text-white shadow-xl hover:bg-white/10">
                  <ArrowLeft className="mr-2 h-4 w-4" /> {t('common.prev')}
                </Button>
              </div>
            )}
          </div>
        ) : renderListView()}
      </div>
    </div>
  );
};

export default NodePatch;