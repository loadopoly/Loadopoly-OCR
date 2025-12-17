import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GraphData, GraphNode, GraphLink } from '../types';

interface GraphVisualizerProps {
  data: GraphData;
  width?: number;
  height?: number;
}

const GraphVisualizer: React.FC<GraphVisualizerProps> = ({ data, width = 600, height = 400 }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    // Defensive check: Ensure nodes exist and have length before proceeding
    if (!svgRef.current || !data || !data.nodes || !data.nodes.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous

    const colorScale = d3.scaleOrdinal<string>()
      .domain(['PERSON', 'LOCATION', 'ORGANIZATION', 'DATE', 'CONCEPT'])
      .range(['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#6366f1']);

    // Deep copy to prevent mutation issues with React state in StrictMode
    const nodes = (data.nodes || []).map(d => ({ ...d }));
    const links = (data.links || []).map(d => ({ ...d }));

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(30));

    // Draw Links
    const link = svg.append("g")
      .attr("stroke", "#475569")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1.5);

    // Draw Nodes
    const node = svg.append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d: any) => 10 + (d.relevance || 0.5) * 10)
      .attr("fill", (d: any) => {
          // Special coloring for Public Domain Documents
          if (d.type === 'DOCUMENT') {
              return d.license === 'CC0' ? '#10b981' : '#64748b'; // Emerald for CC0, Slate for others
          }
          return colorScale(d.type);
      })
      .attr("stroke", (d: any) => {
          // Add a glow/stroke for CC0 nodes
          if (d.type === 'DOCUMENT' && d.license === 'CC0') return '#34d399';
          return "#fff";
      })
      .attr("stroke-width", (d: any) => d.type === 'DOCUMENT' && d.license === 'CC0' ? 3 : 1.5)
      .call(drag(simulation) as any)
      .on("click", (event, d) => {
          setSelectedNode(d as unknown as GraphNode);
      });

    // Labels
    const labels = svg.append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d: any) => d.label)
      .attr("font-size", "10px")
      .attr("fill", "#cbd5e1")
      .attr("dx", 12)
      .attr("dy", 4);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);

      labels
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    function drag(simulation: d3.Simulation<d3.SimulationNodeDatum, undefined>) {
      function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }

    return () => {
      simulation.stop();
    };
  }, [data, width, height]);

  if (!data || !data.nodes || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-slate-900/50 border border-slate-700 rounded-lg text-slate-500 text-xs">
        No Graph Data Available
      </div>
    )
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-slate-900/50">
      <svg ref={svgRef} width={width} height={height} className="cursor-pointer" />
      <div className="absolute top-2 left-2 flex flex-col gap-2 pointer-events-none bg-slate-950/80 p-2 rounded border border-slate-800">
         <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 border border-emerald-300"></span> Public Document (CC0)
         </div>
         <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-slate-500"></span> Private/Commercial Doc
         </div>
         <div className="h-px bg-slate-800 w-full my-1"></div>
         <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span> Person
         </div>
         <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Location
         </div>
         <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Org
         </div>
      </div>
      {selectedNode && (
          <div className="absolute bottom-4 right-4 bg-slate-800 p-3 rounded border border-slate-600 shadow-xl max-w-xs animate-in fade-in slide-in-from-bottom-2">
              <h4 className="font-bold text-white text-sm">{selectedNode.label}</h4>
              <p className="text-xs text-slate-400 capitalize flex items-center gap-1">
                  {selectedNode.type}
                  {selectedNode.license === 'CC0' && (
                      <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-1 rounded border border-emerald-500/30">CC0</span>
                  )}
              </p>
              <p className="text-xs text-slate-500 mt-1">Relevance Score: {selectedNode.relevance.toFixed(2)}</p>
          </div>
      )}
    </div>
  );
};

export default GraphVisualizer;