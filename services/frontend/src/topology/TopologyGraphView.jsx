import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Badge } from "./topologyCommon.jsx";
import { buildTopologyFlowGraph } from "./topologyLayout.js";

const kindStyle = {
  substation: { border: "#2563eb", bg: "#eff6ff" },
  transformer: { border: "#7c3aed", bg: "#f5f3ff" },
  line: { border: "#059669", bg: "#ecfdf5" },
  site: { border: "#d97706", bg: "#fffbeb" },
  meter: { border: "#475569", bg: "#f8fafc" }
};

function TopoNode({ data }) {
  const c = kindStyle[data.kind] || kindStyle.meter;
  const p = data.payload || {};
  const status = p.status || "offline";
  const load = p.load_kw != null ? `${p.load_kw} кВт` : null;

  return (
    <div
      style={{
        border: `2px solid ${c.border}`,
        background: c.bg,
        borderRadius: 8,
        padding: "8px 10px",
        width: 188,
        fontSize: 12,
        lineHeight: 1.25,
        boxSizing: "border-box"
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1 }} />
      <div style={{ whiteSpace: "pre-line", fontWeight: 600 }}>{data.label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginTop: 4 }}>
        <Badge status={status}>{status}</Badge>
        {load ? <span style={{ color: "#64748b", fontSize: 11 }}>{load}</span> : null}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  );
}

const nodeTypes = { topoNode: TopoNode };

function FlowInner({ substations }) {
  const built = useMemo(() => buildTopologyFlowGraph(substations), [substations]);
  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(built.nodes);
    setEdges(built.edges);
  }, [built, setNodes, setEdges]);

  useEffect(() => {
    if (!nodes.length) return;
    const id = requestAnimationFrame(() => fitView({ padding: 0.18, duration: 280 }));
    return () => cancelAnimationFrame(id);
  }, [nodes.length, fitView]);

  if (!substations?.length) {
    return (
      <div style={{ padding: 24, color: "#64748b", fontSize: 14 }}>
        Немає підстанцій у даних — спочатку налаштуйте мережу в адмін-панелі.
      </div>
    );
  }

  if (built.nodes.length === 0) {
    return (
      <div style={{ padding: 24, color: "#64748b", fontSize: 14 }}>Немає вузлів для графа (порожня топологія).</div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.06}
      maxZoom={1.6}
      defaultEdgeOptions={{
        style: { stroke: "#94a3b8", strokeWidth: 1.5 }
      }}
    >
      <Background gap={16} color="#e2e8f0" />
      <Controls />
      <MiniMap
        nodeStrokeWidth={2}
        zoomable
        pannable
        style={{ background: "#f1f5f9" }}
      />
    </ReactFlow>
  );
}

export default function TopologyGraphView({ substations }) {
  return (
    <div
      style={{
        height: "min(72vh, 820px)",
        width: "100%",
        minHeight: 420,
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        overflow: "hidden",
        background: "#fafafa"
      }}
    >
      <ReactFlowProvider>
        <FlowInner substations={substations} />
      </ReactFlowProvider>
    </div>
  );
}
