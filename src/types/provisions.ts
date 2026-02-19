export interface LegalProvision {
  id: number;
  document_id: string;
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string;
  content: string;
  order_index?: number;
  valid_from?: string;
  valid_to?: string;
  language?: string;
}

export interface ProvisionRef {
  document_id: string;
  provision_ref: string;
}
