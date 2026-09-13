from pydantic import BaseModel, Field
from typing import Dict, Optional, List, Any
from datetime import datetime

class ReportGenerationResponse(BaseModel):
    """
    Phase 8 Forensic Report Generation Response.
    Contains immutable cryptographic digest, artifact URL, and ledger integration info.
    """
    spill_id: str = Field(..., description="Unique spill identification string")
    pdf_url: str = Field(..., description="Relative or absolute URL to download the forensic PDF report")
    generated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z", description="ISO 8601 generation timestamp")
    report_hash: str = Field(..., description="SHA-256 cryptographic digest of the generated PDF document")
    evidence_ledger_entry_id: Optional[str] = Field(None, description="Identifier of the recorded evidence ledger entry for this report stage")
    ledger_index: Optional[int] = Field(None, description="Append-only ledger sequence index")
    provenance: Dict[str, str] = Field(
        default_factory=lambda: {
            "sar_detection": "DETECTED",
            "optical_analysis": "MEASURED",
            "drift_hindcast": "MODEL-PREDICTED",
            "vessel_anomaly": "ANOMALY-FLAGGED",
            "evidence_ledger": "VERIFIED",
            "forensic_report": "VERIFIED"
        },
        description="Provenance audit mapping for all evidentiary components"
    )
    file_size_bytes: Optional[int] = Field(None, description="Generated PDF size in bytes")
    pages_count: int = Field(6, description="Total pages in forensic dossier")
