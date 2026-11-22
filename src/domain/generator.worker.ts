import { generateSchedule } from './generator';
import type { AppState } from './types';

interface WorkerRequest {
  state: AppState;
  seed: number;
  overrideLimit?: number;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { state, seed, overrideLimit } = event.data;
  const result = generateSchedule(state, seed, {
    overrideLimit,
    onProgress: (nodes) => {
      self.postMessage({ type: 'progress', nodes });
    },
  });
  self.postMessage({ type: 'result', result });
};
