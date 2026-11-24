export interface UpdateStatus {
  managed: boolean;
  busy: number;
  current?: string;
  channel?: 'stable' | 'preview';
  checked?: number;
  available?: { tag: string; notes: string } | null;
  error?: string;
  job?: { tag?: string; phase?: 'waiting' | 'preparing' | 'activating' | 'done' | 'failed' };
}
