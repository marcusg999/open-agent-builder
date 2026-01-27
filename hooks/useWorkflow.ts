import { useState, useEffect, useCallback, useRef } from 'react';
import { Workflow, WorkflowNode, WorkflowEdge, MCPServer } from '@/lib/workflow/types';
import { saveMCPServer, getMCPServers } from '@/lib/workflow/storage';
import { cleanupInvalidEdges } from '@/lib/workflow/edge-cleanup';

/* ----------------------------- helpers ----------------------------- */

function sanitizeWorkflowForSave(workflow: Workflow) {
  // Helper to remove circular references and non-serializable data
  const cleanNodeData = (data: any): any => {
    if (!data || typeof data !== 'object') return data;
    
    // Remove known problematic properties
    const cleaned: any = {};
    for (const key in data) {
      if (key === 'Provider' || key === 'component' || key === 'ref') {
        continue; // Skip React-specific properties
      }
      
      const value = data[key];
      
      // Handle different value types
      if (value === null || value === undefined) {
        cleaned[key] = value;
      } else if (typeof value === 'function') {
        continue; // Skip functions
      } else if (Array.isArray(value)) {
        cleaned[key] = value.map(item => 
          typeof item === 'object' ? cleanNodeData(item) : item
        );
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        try {
          // Try to serialize to detect circular refs
          JSON.stringify(value);
          cleaned[key] = cleanNodeData(value);
        } catch (e) {
          // Skip circular or non-serializable objects
          console.warn(`Skipping non-serializable property: ${key}`);
        }
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  };

  const cleanNodes = workflow.nodes?.map(node => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: cleanNodeData(node.data || {})
  })) ?? [];

  const cleanEdges = workflow.edges?.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: edge.animated
  })) ?? [];

return {
    id: workflow.id,
    customId: workflow.customId || workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes: cleanNodes,
    edges: cleanEdges,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    _convexId: workflow._convexId,
    _id: workflow._id,
  };
}

/* ---------------------------- main hook ---------------------------- */
/* ---------------------------- main hook ---------------------------- */

export function useWorkflow(workflowId?: string) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [convexId, setConvexId] = useState<string | null>(null);

  const saveTimeout = useRef<NodeJS.Timeout | null>(null);

  /* -------------------------- load workflow ------------------------- */

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (!workflowId) {
          createNewWorkflow();
          return;
        }

        const listRes = await fetch('/api/workflows');
        const listData = await listRes.json();
        const found = listData.workflows?.find((w: any) => w.id === workflowId);

        if (!found) {
          createNewWorkflow();
          return;
        }

        const detailRes = await fetch(`/api/workflows/${workflowId}`);
        const detail = await detailRes.json();

        let wf = detail.workflow ?? found;

        const cleaned = cleanupInvalidEdges(wf.nodes, wf.edges);
        if (cleaned.removedCount > 0) {
          wf = { ...wf, nodes: cleaned.nodes, edges: cleaned.edges };
        }

        setWorkflow(wf);
        setConvexId(wf._convexId ?? wf._id ?? null);
      } catch (err) {
        console.error('Failed to load workflow:', err);
        createNewWorkflow();
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  /* ----------------------- load workflow list ----------------------- */

  const loadWorkflows = useCallback(async () => {
    try {
      const res = await fetch('/api/workflows');
      const data = await res.json();
      setWorkflows(data.workflows ?? []);
    } catch {
      setWorkflows([]);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  /* ----------------------- create new workflow ---------------------- */

  const createNewWorkflow = useCallback(() => {
    const wf: Workflow = {
      id: `workflow_${Date.now()}`,
      name: 'New Workflow',
      nodes: [
        {
          id: 'node_start',
          type: 'start',
          position: { x: 250, y: 100 },
          data: { label: 'Start' },
        },
      ],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setWorkflow(wf);
    return wf;
  }, []);

  /* --------------------------- save logic --------------------------- */

  const persistWorkflow = async (wf: Workflow) => {
    const payload = sanitizeWorkflowForSave(wf);
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.success && data.workflowId) {
      setConvexId(data.workflowId);
    }
  };

  const saveWorkflow = useCallback(
    (updates?: Partial<Workflow>) => {
      if (!workflow) return;

      const updated: Workflow = {
        ...workflow,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      setWorkflow(updated);

      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
      }

      saveTimeout.current = setTimeout(() => {
        persistWorkflow(updated).catch(err =>
          console.error('Auto-save failed:', err)
        );
      }, 1000);
    },
    [workflow]
  );

  const saveWorkflowImmediate = useCallback(async (updates?: Partial<Workflow>) => {
    if (!workflow) return false;

    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }

    try {
      const updated: Workflow = {
        ...workflow,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      setWorkflow(updated);
      await persistWorkflow(updated);
      return true;
    } catch (err) {
      console.error('Immediate save failed:', err);
      return false;
    }
  }, [workflow]);

  const deleteWorkflow = useCallback(async (workflowIdToDelete: string) => {
    try {
      const res = await fetch(`/api/workflows/${workflowIdToDelete}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        // Refresh the workflows list
        await loadWorkflows();
        // If we deleted the current workflow, create a new one
        if (workflow?.id === workflowIdToDelete) {
          createNewWorkflow();
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('Delete workflow failed:', err);
      return false;
    }
  }, [workflow, loadWorkflows, createNewWorkflow]);

  /* --------------------------- updates ------------------------------ */

  const updateNodes = useCallback(
    (nodes: WorkflowNode[]) => saveWorkflow({ nodes }),
    [saveWorkflow]
  );

  const updateEdges = useCallback(
    (edges: WorkflowEdge[]) => saveWorkflow({ edges }),
    [saveWorkflow]
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: any) => {
      if (!workflow) return;
      updateNodes(
        workflow.nodes.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
        )
      );
    },
    [workflow, updateNodes]
  );

  /* ----------------------------- api ------------------------------- */

  return {
    workflow,
    workflows,
    loading,
    convexId,
    saveWorkflow,
    saveWorkflowImmediate,
    deleteWorkflow,
    updateNodes,
    updateEdges,
    updateNodeData,
    createNewWorkflow,
    loadWorkflows,
  };
}

/* ------------------------- MCP servers ----------------------------- */

export function useMCPServers() {
  const [servers, setServers] = useState<MCPServer[]>([]);

  const loadServers = useCallback(() => {
    setServers(getMCPServers());
  }, []);

  // Load servers on mount - intentional state initialization
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadServers();
  }, [loadServers]);

  const addServer = useCallback((server: MCPServer) => {
    saveMCPServer(server);
    loadServers();
  }, [loadServers]);

  const updateServer = useCallback(
    (id: string, updates: Partial<MCPServer>) => {
      const existing = servers.find(s => s.id === id);
      if (!existing) return;
      saveMCPServer({ ...existing, ...updates });
      loadServers();
    },
    [servers, loadServers]
  );

  return { servers, addServer, updateServer, loadServers };
}

