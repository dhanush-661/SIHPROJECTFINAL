"""
app/schemas/evidence.py
=======================
Phase 7 — Tamper-Evident Evidence Ledger Schemas
Defines data structures for append-only cryptographic stage records,
Merkle-chain verification results, and public testnet blockchain anchors.
"""
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class LedgerEntry(BaseModel):
    """
    Cryptographic evidence ledger entry for an individual pipeline stage.
    """
    id: Optional[int] = Field(None, description="Primary autoincrement ID in the ledger database.")
    spill_id: str = Field(..., description="Unique spill event identifier.")
    stage: Literal["detection", "drift", "vessel_scoring", "fusion", "thickness", "report"] = Field(
        ..., description="Pipeline stage producing this record."
    )
    record_hash: str = Field(
        ..., description="SHA-256 hex digest of (previous_hash + canonical_json(payload))."
    )
    previous_hash: str = Field(
        ..., description="Merkle-chain link: record_hash of the preceding stage (or GENESIS)."
    )
    stage_timestamp: str = Field(
        ..., description="ISO 8601 UTC timestamp of stage execution."
    )
    payload: Optional[Dict[str, Any]] = Field(
        default=None, description="Canonical or parsed stage output payload."
    )
    tx_hash: Optional[str] = Field(
        default=None, description="Public blockchain transaction hash if anchored."
    )
    explorer_url: Optional[str] = Field(
        default=None, description="Block explorer URL for the on-chain anchor transaction."
    )
    is_valid: Optional[bool] = Field(
        default=None, description="True if hash validation recomputation succeeded during verification."
    )


class PublicAnchorStatus(BaseModel):
    """
    Public testnet blockchain anchor status for a spill's Merkle root.
    """
    enabled: bool = Field(..., description="Whether blockchain anchoring is active or succeeded.")
    status: Literal["ANCHORED", "SKIPPED_GRACEFUL", "FAILED", "NOT_CONFIGURED"] = Field(
        ..., description="Current status of public testnet anchor."
    )
    network: Optional[str] = Field(
        default="Polygon Amoy Testnet", description="Target testnet network name."
    )
    chain_id: Optional[int] = Field(default=80002, description="Network Chain ID (e.g. 80002 for Amoy).")
    merkle_root: Optional[str] = Field(
        default=None, description="SHA-256 Merkle root over the spill's ledger entries."
    )
    tx_hash: Optional[str] = Field(
        default=None, description="Public blockchain transaction hash."
    )
    explorer_url: Optional[str] = Field(
        default=None, description="Direct URL to block explorer transaction record."
    )
    anchored_at: Optional[str] = Field(
        default=None, description="ISO 8601 UTC timestamp when anchor transaction was broadcast."
    )
    details: Optional[str] = Field(
        default=None, description="Diagnostic notes or error explanations (never blocks pipeline)."
    )


class ChainVerificationResponse(BaseModel):
    """
    Response returned by GET /evidence/verify/{spill_id}.
    """
    success: bool = True
    chain_verified: bool = Field(
        ..., description="True if every ledger record in the chain has an unbroken cryptographic hash link."
    )
    spill_id: str = Field(..., description="Spill identifier evaluated.")
    chain_length: int = Field(..., description="Number of ledger entries in the chain.")
    merkle_root: str = Field(..., description="Cryptographic Merkle Root over the validated stage hashes.")
    provenance: Literal["VERIFIED", "TAMPERED", "UNVERIFIED"] = Field(
        ..., description="Provenance label: VERIFIED if unbroken, TAMPERED if invalid, UNVERIFIED if empty."
    )
    verified_at: str = Field(..., description="ISO 8601 UTC timestamp of verification run.")
    stages_covered: List[str] = Field(
        default_factory=list, description="List of pipeline stages present in the verified chain."
    )
    entries: List[LedgerEntry] = Field(
        default_factory=list, description="Ordered list of ledger entries with individual verification status."
    )
    public_anchor: PublicAnchorStatus = Field(
        ..., description="Public testnet blockchain anchor status."
    )
    disclaimer: str = Field(
        default="Cryptographic SHA-256 Merkle chain guarantees tamper-evident provenance. PostGIS table is append-only with DDL UPDATE/DELETE permissions revoked.",
        description="Legal and forensic evidence disclaimer."
    )


class AnchorRequest(BaseModel):
    """
    Optional manual anchor trigger request.
    """
    network: Optional[str] = Field(default="polygon_amoy", description="Target testnet network: polygon_amoy | ethereum_sepolia")
    force_reanchor: Optional[bool] = Field(default=False, description="Re-anchor even if previously anchored.")
