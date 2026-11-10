import * as Schema from "effect/Schema";
import { NonNegativeInt } from "./baseSchemas.ts";

export class DesignPackageMalformedError extends Schema.TaggedError<DesignPackageMalformedError>()(
  "DesignPackageMalformedError",
  {
    cwd: Schema.String,
    relativePath: Schema.String,
    message: Schema.String,
  },
) {}

export const DesignAssetPayload = Schema.Struct({
  assetId: Schema.String,
  mimeType: Schema.String,
  base64: Schema.String.check(Schema.isMaxLength(12_000_000)),
});
export type DesignAssetPayload = typeof DesignAssetPayload.Type;

/** Portable operation envelope for Design document sync. Payload stays JSON so the server never executes canvas code. */
export const DesignSyncOperation = Schema.Struct({
  operationId: Schema.String,
  baseRevision: NonNegativeInt,
  kind: Schema.Literals(["update-node", "add-node", "add-page", "add-asset"]),
  nodeId: Schema.NullOr(Schema.String),
  assetId: Schema.optional(Schema.String),
  fields: Schema.optional(Schema.Array(Schema.String)),
  payload: Schema.Unknown,
});
export type DesignSyncOperation = typeof DesignSyncOperation.Type;

export const DesignSyncRequest = Schema.Struct({
  documentId: Schema.String,
  baseRevision: NonNegativeInt,
  operations: Schema.Array(DesignSyncOperation),
  assetIds: Schema.Array(Schema.String),
  assetPayloads: Schema.optional(Schema.Array(DesignAssetPayload)),
  /** Serialized dependency-free Design IR for remote clients and future migrations. */
  snapshot: Schema.optional(Schema.String),
});
export type DesignSyncRequest = typeof DesignSyncRequest.Type;

export const DesignConflict = Schema.Struct({
  nodeId: Schema.NullOr(Schema.String),
  assetId: Schema.optional(Schema.String),
  baseRevision: NonNegativeInt,
  serverRevision: NonNegativeInt,
  localValue: Schema.Unknown,
  serverValue: Schema.Unknown,
});
export type DesignConflict = typeof DesignConflict.Type;

export const DesignSyncResult = Schema.Union([
  Schema.TaggedStruct("accepted", {
    documentId: Schema.String,
    revision: NonNegativeInt,
    acceptedOperationIds: Schema.Array(Schema.String),
  }),
  Schema.TaggedStruct("conflict", {
    documentId: Schema.String,
    revision: NonNegativeInt,
    conflicts: Schema.Array(DesignConflict),
  }),
]);
export type DesignSyncResult = typeof DesignSyncResult.Type;

export const DesignReadInput = Schema.Struct({
  cwd: Schema.String,
  relativePath: Schema.String,
});
export type DesignReadInput = typeof DesignReadInput.Type;

export const DesignReadResult = Schema.Struct({
  found: Schema.Boolean,
  contents: Schema.NullOr(Schema.String),
});
export type DesignReadResult = typeof DesignReadResult.Type;

export const DesignSyncInput = Schema.Struct({
  cwd: Schema.String,
  relativePath: Schema.String,
  request: DesignSyncRequest,
});
export type DesignSyncInput = typeof DesignSyncInput.Type;

export const DesignServerStateSnapshot = Schema.Struct({
  documentId: Schema.String,
  revision: NonNegativeInt,
  nodes: Schema.Record(Schema.String, Schema.Unknown),
  assetIds: Schema.Array(Schema.String),
  assetPayloads: Schema.optional(Schema.Array(DesignAssetPayload)),
  snapshot: Schema.optional(Schema.String),
});
export type DesignServerStateSnapshot = typeof DesignServerStateSnapshot.Type;
