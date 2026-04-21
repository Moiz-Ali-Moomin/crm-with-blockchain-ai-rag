/**
 * embedding.service.ts — backwards-compatibility re-export
 *
 * The concrete implementation is now RealEmbeddingService.
 * This file re-exports it under the old name so that any import of
 * `EmbeddingService` (e.g. in specs or legacy module references) continues
 * to compile without changes.
 *
 * New code should import from real-embedding.service.ts or depend on the
 * EMBEDDING_SERVICE injection token via IEmbeddingService.
 */
export { RealEmbeddingService as EmbeddingService } from './real-embedding.service';
