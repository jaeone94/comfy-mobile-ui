import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Save,
  Search,
  ArrowLeft,
  Filter,
  MoreVertical,
  Settings,
  AlertCircle,
  CheckCircle2,
  FileJson,
  Code
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from 'sonner';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Interfaces (kept as is)
interface CustomWidgetType {
  id: string;
  type: 'select' | 'combo' | 'slider';
  options?: any[];
  min?: number;
  max?: number;
  step?: number;
}

interface NodePatch {
  nodeType: string;
  inputs: {
    [key: string]: {
      widgetType: string;
      customProps?: any;
    };
  };
}

interface WorkflowNode {
  id: number;
  type: string;
  pos: [number, number];
  size: [number, number] | { 0: number; 1: number };
  flags: any;
  order: number;
  mode: number;
  inputs?: Array<{ name: string; type: string; link: number | null }>;
  outputs?: Array<{ name: string; type: string; links: number[] }>;
  properties: { [key: string]: any };
  widgets_values?: any[];
}

interface Workflow {
  id: string;
  name: string;
  data: {
    nodes: WorkflowNode[];
    links: any[];
    groups: any[];
    config: any;
    extra: any;
    version: number;
  };
  timestamp: number;
}

export const NodePatch: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [widgetTypes, setWidgetTypes] = useState<CustomWidgetType[]>([]);
  const [nodePatches, setNodePatches] = useState<NodePatch[]>([]);
  const [customMappings, setCustomMappings] = useState<{
    [nodeType: string]: {
      [fieldName: string]: {
        widgetType: string;
        scope: 'global' | 'workflow' | 'specific';
        targetId?: string; // workflow_id or node_id
      }
    }
  }>({});
  const [currentStep, setCurrentStep] = useState<'workflow' | 'node' | 'mapping'>('workflow');

  // Load data from localStorage on mount
  useEffect(() => {
    // Load workflows
    try {
      const savedWorkflows = localStorage.getItem('comfyui_workflows');
      if (savedWorkflows) {
        setWorkflows(JSON.parse(savedWorkflows));
      }

      // Load widget types
      const savedWidgetTypes = localStorage.getItem('comfyui_custom_widget_types');
      if (savedWidgetTypes) {
        setWidgetTypes(JSON.parse(savedWidgetTypes));
      }

      // Load node patches/mappings
      const savedMappings = localStorage.getItem('comfyui_node_patches');
      if (savedMappings) {
        setCustomMappings(JSON.parse(savedMappings));
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error(t('customTypes.toast.loadFailed'));
    }
  }, []);

  // Filtered nodes based on search and selected workflow
  const filteredNodes = useMemo(() => {
    if (!selectedWorkflowId) return [];

    const workflow = workflows.find(w => w.id === selectedWorkflowId);
    if (!workflow) return [];

    let nodes = workflow.data.nodes || [];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      nodes = nodes.filter(node =>
        node.type.toLowerCase().includes(query) ||
        node.id.toString().includes(query) ||
        (node.properties?.name && node.properties.name.toLowerCase().includes(query))
      );
    }

    return nodes;
  }, [selectedWorkflowId, workflows, searchQuery]);

  // Handle saving mappings
  const handleSaveMapping = (nodeType: string, fieldName: string, config: any) => {
    const updatedMappings = { ...customMappings };

    if (!updatedMappings[nodeType]) {
      updatedMappings[nodeType] = {};
    }

    // Determine scope and targetId
    const mapping = {
      widgetType: config.widgetType,
      scope: config.scope || 'global',
      targetId: config.scope === 'workflow' ? selectedWorkflowId || undefined :
        config.scope === 'specific' ? selectedNodeId?.toString() : undefined
    };

    updatedMappings[nodeType][fieldName] = mapping;
    setCustomMappings(updatedMappings);

    // Save to localStorage
    localStorage.setItem('comfyui_node_patches', JSON.stringify(updatedMappings));
    toast.success(t('nodePatch.toast.saveSuccess', { type: nodeType }));
  };

  // Handle deleting mapping
  const handleDeleteMapping = (nodeType: string, fieldName: string) => {
    if (confirm(t('nodePatch.toast.deleteConfirm', { type: nodeType, scope: fieldName }))) {
      const updatedMappings = { ...customMappings };
      if (updatedMappings[nodeType]) {
        delete updatedMappings[nodeType][fieldName];
        if (Object.keys(updatedMappings[nodeType]).length === 0) {
          delete updatedMappings[nodeType];
        }
        setCustomMappings(updatedMappings);
        localStorage.setItem('comfyui_node_patches', JSON.stringify(updatedMappings));
        toast.success(t('nodePatch.toast.deleteSuccess', { type: nodeType, scope: fieldName }));
      }
    }
  };

  const getMappingForField = (nodeType: string, fieldName: string, nodeId: number) => {
    const nodeMappings = customMappings[nodeType];
    if (!nodeMappings) return null;

    const mapping = nodeMappings[fieldName];
    if (!mapping) return null;

    // Check scope applicability
    if (mapping.scope === 'global') return mapping;
    if (mapping.scope === 'workflow' && mapping.targetId === selectedWorkflowId) return mapping;
    if (mapping.scope === 'specific' && mapping.targetId === nodeId.toString()) return mapping;

    return null;
  };

  const renderWorkflowSelection = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{t('nodePatch.stepTitle.workflow')}</h3>
        <span className="text-sm text-muted-foreground">
          {workflows.length} {t('nodePatch.step.col1')}s
        </span>
      </div>

      {workflows.length === 0 ? (
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 space-y-4">
            <FileJson className="h-10 w-10 text-muted-foreground" />
            <div className="text-center space-y-1">
              <h4 className="font-medium">{t('nodePatch.noWorkflows')}</h4>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                {t('nodePatch.uploadWorkflows')}
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('nodePatch.backToList')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map(workflow => (
            <Card
              key={workflow.id}
              className={`cursor-pointer transition-all hover:border-primary/50 ${selectedWorkflowId === workflow.id ? 'border-primary ring-1 ring-primary' : ''
                }`}
              onClick={() => {
                setSelectedWorkflowId(workflow.id);
                setCurrentStep('node');
              }}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base truncate">{workflow.name}</CardTitle>
                <CardDescription className="text-xs">
                  {new Date(workflow.timestamp).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{workflow.data.nodes?.length || 0} nodes</span>
                  <span>v{workflow.data.version || 0}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderNodeSelection = () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedWorkflowId(null);
            setCurrentStep('workflow');
          }}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('nodePatch.step.workflow')}
        </Button>
        <div className="h-4 w-px bg-border" />
        <h3 className="text-lg font-medium">{t('nodePatch.stepTitle.node')}</h3>
      </div>

      <div className="flex space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('nodePatch.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>{t('nodePatch.step.node')} Type</DropdownMenuItem>
            <DropdownMenuItem>Status</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="h-[60vh] rounded-md border p-4">
        {filteredNodes.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            {t('nodePatch.noNodes')}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredNodes.map(node => {
              // Count configured fields
              const configuredCount = Object.keys(customMappings[node.type] || {}).length;

              return (
                <div
                  key={node.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${selectedNodeId === node.id ? 'bg-muted border-primary' : 'bg-card'
                    }`}
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    setCurrentStep('mapping');
                  }}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-primary/10 rounded-md">
                      <Code className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">{node.type}</h4>
                      <p className="text-xs text-muted-foreground">ID: {node.id}</p>
                    </div>
                  </div>
                  {configuredCount > 0 && (
                    <Badge variant="secondary" className="ml-auto">
                      {configuredCount} {t('nodePatch.assigned')}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  const renderMappingStep = () => {
    if (!selectedWorkflowId || selectedNodeId === null) return null;

    const workflow = workflows.find(w => w.id === selectedWorkflowId);
    if (!workflow) return null;

    const node = workflow.data.nodes?.find(n => n.id === selectedNodeId);
    if (!node) return null;

    // Get input fields that can be mapped
    // ComfyUI nodes define inputs in 'inputs' array usually
    // Also consider 'widgets_values' which might map to input widgets
    const inputFields = node.inputs || [];

    // Also we might want to map widget values (e.g. seed, text fields)
    // But typically node patches are for remapping widget types for specific inputs

    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-2 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedNodeId(null);
              setCurrentStep('node');
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('nodePatch.step.node')}
          </Button>
          <div className="h-4 w-px bg-border" />
          <div>
            <h3 className="text-lg font-medium">{node.type}</h3>
            <p className="text-xs text-muted-foreground">ID: {node.id}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('nodePatch.stepTitle.mapping')}</CardTitle>
            <CardDescription>
              {t('nodePatch.nodeInfo', { id: node.id, count: inputFields.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {inputFields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No configurable input fields found for this node.
              </div>
            ) : (
              inputFields.map((input, idx) => {
                const currentMapping = getMappingForField(node.type, input.name, node.id);

                return (
                  <div key={`${input.name}-${idx}`} className="flex items-start space-x-4 p-4 rounded-lg border bg-card">
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {input.name}
                          </label>
                          <p className="text-xs text-muted-foreground mt-1">
                            Type: {input.type}
                          </p>
                        </div>
                        {currentMapping && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            {t('nodePatch.assigned')}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-medium">{t('nodePatch.widgetType')}</label>
                          <Select
                            value={currentMapping?.widgetType || "default"}
                            onValueChange={(value) => {
                              if (value === "default") {
                                // If setting to default, effective delete the mapping?
                                // Or maybe we need a dedicated delete button
                                handleDeleteMapping(node.type, input.name);
                              } else {
                                handleSaveMapping(node.type, input.name, {
                                  widgetType: value,
                                  scope: currentMapping?.scope || 'global'
                                });
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('nodePatch.selectWidgetType')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">{t('nodePatch.noWidgetType')}</SelectItem>
                              {widgetTypes.map(wt => (
                                <SelectItem key={wt.id} value={wt.id}>
                                  {wt.id} ({wt.type})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {currentMapping && (
                          <div className="space-y-2">
                            <label className="text-xs font-medium">{t('nodePatch.scope.title')}</label>
                            <Select
                              value={currentMapping.scope}
                              onValueChange={(value) => {
                                handleSaveMapping(node.type, input.name, {
                                  widgetType: currentMapping.widgetType,
                                  scope: value
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('nodePatch.scope.selected', { scope: currentMapping.scope })} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="global">
                                  <div className="flex flex-col">
                                    <span>{t('nodePatch.scope.global')}</span>
                                    <span className="text-xs text-muted-foreground">{t('nodePatch.scope.globalDesc')}</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="workflow">
                                  <div className="flex flex-col">
                                    <span>{t('nodePatch.scope.workflow')}</span>
                                    <span className="text-xs text-muted-foreground">{t('nodePatch.scope.workflowDesc')}</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="specific">
                                  <div className="flex flex-col">
                                    <span>{t('nodePatch.scope.specific')}</span>
                                    <span className="text-xs text-muted-foreground">{t('nodePatch.scope.specificDesc')}</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // List view of patch stats
  const renderListView = () => {
    const nodeTypes = Object.keys(customMappings);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('customTypes.title')}</h2>
            <p className="text-muted-foreground">
              {t('nodePatch.listSubtitle')}
            </p>
          </div>
          <div className="flex space-x-2">
            <Button onClick={() => setActiveTab('create')}>
              <Plus className="mr-2 h-4 w-4" />
              {t('nodePatch.createPatch')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // Helper to create a patch for Lora Loader if not exists
                // Just as a demo helper
                handleSaveMapping("LoraLoader", "lora_name", {
                  widgetType: "LORA_SELECTOR",
                  scope: "global"
                });
                toast.success(t('nodePatch.toast.exampleCreated'));
              }}
            >
              {t('nodePatch.powerLora')}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('nodePatch.customNodePatches', { count: nodeTypes.length })}
              </CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{nodeTypes.length}</div>
              <p className="text-xs text-muted-foreground">
                {t('nodePatch.activeNodeTypes')}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('nodePatch.activePatches')}</CardTitle>
            <CardDescription>
              {t('nodePatch.patchesDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {nodeTypes.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                {t('nodePatch.noCustomMappings')}
                <br />
                <Button variant="link" onClick={() => setActiveTab('create')} className="mt-2">
                  {t('nodePatch.startPrompt')}
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {nodeTypes.map(nodeType => (
                    <div key={nodeType} className="flex items-start justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-semibold">{nodeType}</h4>
                        <div className="mt-2 space-y-1">
                          {Object.entries(customMappings[nodeType]).map(([field, mapping]: [string, any]) => (
                            <div key={field} className="text-sm flex items-center space-x-2">
                              <Badge variant="outline">{field}</Badge>
                              <span className="text-muted-foreground text-xs">→</span>
                              <Badge variant="secondary">{mapping.widgetType}</Badge>
                              <Badge variant="outline" className="text-xs scale-90 opacity-70">
                                {mapping.scope}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(t('nodePatch.toast.deleteConfirm', { type: nodeType, scope: 'all' }))) {
                            const newMappings = { ...customMappings };
                            delete newMappings[nodeType];
                            setCustomMappings(newMappings);
                            localStorage.setItem('comfyui_node_patches', JSON.stringify(newMappings));
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // Create/Edit View with Stepper
  const renderCreateView = () => {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('nodePatch.createTitle')}</h2>
            <p className="text-muted-foreground">
              {t('nodePatch.createSubtitle')}
            </p>
          </div>
          <Button variant="ghost" onClick={() => setActiveTab('list')}>
            {t('nodePatch.backToList')}
          </Button>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center space-x-4 mb-8">
          <div className={`flex flex-col items-center ${currentStep === 'workflow' ? 'text-primary' : 'text-muted-foreground'
            }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep === 'workflow' ? 'border-primary bg-primary/10' : 'border-muted'
              }`}>
              1
            </div>
            <span className="text-xs mt-1 font-medium">{t('nodePatch.step.workflow')}</span>
          </div>
          <div className="w-12 h-px bg-border" />
          <div className={`flex flex-col items-center ${currentStep === 'node' ? 'text-primary' : 'text-muted-foreground'
            }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep === 'node' ? 'border-primary bg-primary/10' : 'border-muted'
              }`}>
              2
            </div>
            <span className="text-xs mt-1 font-medium">{t('nodePatch.step.node')}</span>
          </div>
          <div className="w-12 h-px bg-border" />
          <div className={`flex flex-col items-center ${currentStep === 'mapping' ? 'text-primary' : 'text-muted-foreground'
            }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep === 'mapping' ? 'border-primary bg-primary/10' : 'border-muted'
              }`}>
              3
            </div>
            <span className="text-xs mt-1 font-medium">{t('nodePatch.step.mapping')}</span>
          </div>
        </div>

        <div className="min-h-[400px]">
          {currentStep === 'workflow' && renderWorkflowSelection()}
          {currentStep === 'node' && renderNodeSelection()}
          {currentStep === 'mapping' && renderMappingStep()}
        </div>
      </div>
    );
  };

  if (activeTab === 'create') {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-8 animate-in fade-in-50">
        {renderCreateView()}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8 animate-in fade-in-50">
      {renderListView()}
    </div>
  );
};

export default NodePatch;