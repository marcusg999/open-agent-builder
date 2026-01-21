import { useState, useEffect, useCallback, useRef } from 'react';
import { Workflow, WorkflowNode, WorkflowEdge, MCPServer } from '@/lib/workflow/types';
import { saveMCPServer, getMCPServers } from '@/lib/workflow/storage';
import { cleanupInvalidEdges } from '@/lib/workflow/edge-cleanup';

/* ----------------------------- helpers ----------------------------- */

function sanitizeWorkflowForSave(workflow: Workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes: workflow.nodes ?? [],
    edges: workflow.edges ?? [],
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    _convexId: workflow._convexId,
    _id: workflow._id,
  };
}

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

  const saveWorkflowImmediate = useCallback(async () => {
    if (!workflow) return false;

    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }

    try {
      await persistWorkflow({
        ...workflow,
        updatedAt: new Date().toISOString(),
      });
      return true;
    } catch (err) {
      console.error('Immediate save failed:', err);
      return false;
    }
  }, [workflow]);

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

  useEffect(() => {
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

