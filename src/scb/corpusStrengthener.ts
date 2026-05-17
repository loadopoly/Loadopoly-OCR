/**
 * Corpus Strengthener – IProcessor Implementation
 *
 * A `post-ocr` pipeline processor that enriches the knowledge graph
 * immediately after OCR extraction, before an asset is committed as MINTED.
 * This "corpus strengthening before release" step improves graph density by:
 *
 *   1. Computing a SHA-256 fixity checksum for the OCR text + document title
 *   2. Inferring ENTITY_CO_OCCURS edges between every pair of nodes that
 *      appear together in the same asset
 *   3. Recording the strengthening result in the processor output metadata
 *
 * Registration
 * ────────────
 * Register as a post-ocr processor before starting the processing pipeline:
 *
 * ```typescript
 * import { corpusStrengthener } from './scb/corpusStrengthener';
 * moduleRegistry.registerProcessor(corpusStrengthener);
 * ```
 *
 * Server-side strengthening
 * ──────────────────────────
 * The heavier server-side operations (graph_edges upsert, spatial linking,
 * FIXITY_CHECKSUM persistence to Supabase) are handled by the
 * `strengthenCorpus()` function added to the `process-ocr` edge function
 * when `SCB_CORPUS_STRENGTHEN=true`.  The client-side implementation here
 * focuses on in-memory graph enrichment that is safe to run in the browser.
 *
 * @module scb/corpusStrengthener
 * @version 2.21.0
 */

import { IProcessor, ProcessorInput, ProcessorOutput } from '../modules/types';
import { GraphData, GraphLink } from '../types';
import { logger } from '../lib/logger';
import { CorpusStrengtheningResult } from './types';

// ============================================
// Corpus Strengthener Implementation
// ============================================

export class CorpusStrengthener implements IProcessor {
  readonly name = 'scb-corpus-strengthener';
  readonly stage = 'post-ocr' as const;
  /** Run before other post-ocr processors that may depend on edge density */
  readonly priority = 10;

  /**
   * Enriches the asset's graph data and computes a fixity checksum.
   * Failures are caught and logged; the processor always continues the
   * pipeline (`shouldContinue: true`) so a strengthening failure never
   * blocks an asset from being committed.
   */
  async process(input: ProcessorInput): Promise<ProcessorOutput> {
    const { asset, graphData } = input;

    if (!asset) {
      logger.warn('[CorpusStrengthener] No asset provided – skipping');
      return { ...input, shouldContinue: true };
    }

    try {
      const assetRecord = asset as Record<string, unknown>;

      // 1. Compute fixity checksum
      const ocrText = (assetRecord['RAW_OCR_TRANSCRIPTION'] as string) ?? '';
      const title = (assetRecord['DOCUMENT_TITLE'] as string) ?? '';
      const fixityChecksum = await this.computeFixityChecksum(ocrText, title);

      // 2. Infer co-occurrence edges between all nodes in the same asset
      const enrichedGraph = graphData
        ? this.inferCoOccurrenceEdges(graphData)
        : graphData;

      const edgesAdded = enrichedGraph
        ? enrichedGraph.links.length - (graphData?.links.length ?? 0)
        : 0;

      // 3. Build the strengthening result for downstream processors / UI
      const result: CorpusStrengtheningResult = {
        entitiesAdded: 0,
        edgesAdded,
        spatialAnchorsLinked: 0,
        fixityChecksum,
        strengthenedAt: new Date().toISOString(),
      };

      logger.info('[CorpusStrengthener] Corpus strengthened', {
        assetId: assetRecord['ASSET_ID'] as string,
        fixityChecksumPrefix: fixityChecksum.slice(0, 8),
        edgesAdded,
      });

      return {
        asset,
        graphData: enrichedGraph,
        metadata: {
          ...(input.metadata ?? {}),
          corpusStrengthening: result,
        },
        shouldContinue: true,
      };
    } catch (err) {
      logger.error('[CorpusStrengthener] Processing failed (non-fatal)', { err });
      // Corpus strengthening must never block the main pipeline
      return { ...input, shouldContinue: true };
    }
  }

  // ============================================
  // Private helpers
  // ============================================

  /**
   * SHA-256 fixity checksum of the OCR text and document title.
   *
   * The checksum enables integrity verification: re-hashing the original
   * capture data and comparing to this value detects any tampering or
   * accidental corruption of the OCR record.
   */
  private async computeFixityChecksum(
    ocrText: string,
    title: string
  ): Promise<string> {
    const payload = `${title}\n${ocrText}`;
    const encoded = new TextEncoder().encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Infer `ENTITY_CO_OCCURS` edges between every pair of nodes that appear
   * together in the same asset's graph.
   *
   * Co-occurrence edges reflect the "relatedness by proximity" signal
   * extracted from the same document, strengthening the knowledge graph's
   * density without requiring an explicit relationship statement in the text.
   *
   * Only adds edges that do not already exist (by source/target identity).
   */
  private inferCoOccurrenceEdges(graphData: GraphData): GraphData {
    const { nodes, links } = graphData;
    if (nodes.length < 2) return graphData;

    const existingPairs = new Set(
      links.map(l => `${String(l.source)}|${String(l.target)}`)
    );

    const newLinks: GraphLink[] = [...links];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const fwd = `${nodes[i].id}|${nodes[j].id}`;
        const rev = `${nodes[j].id}|${nodes[i].id}`;
        if (!existingPairs.has(fwd) && !existingPairs.has(rev)) {
          newLinks.push({
            source: nodes[i].id,
            target: nodes[j].id,
            relationship: 'ENTITY_CO_OCCURS',
          });
          existingPairs.add(fwd);
        }
      }
    }

    return { ...graphData, links: newLinks };
  }
}

// ============================================
// Singleton export
// ============================================

/**
 * Pre-built CorpusStrengthener instance for use with `moduleRegistry`:
 *
 * ```typescript
 * moduleRegistry.registerProcessor(corpusStrengthener);
 * ```
 */
export const corpusStrengthener = new CorpusStrengthener();
