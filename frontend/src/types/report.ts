export interface ReportGenerationResponse {
  spill_id: string;
  pdf_url: string;
  generated_at: string;
  report_hash: string;
  evidence_ledger_entry_id?: string | null;
  ledger_index?: number | null;
  provenance: Record<string, string>;
  file_size_bytes?: number | null;
  pages_count: number;
}
