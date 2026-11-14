export interface HealthResponse {
  status: 'ok' | 'unavailable';
  database: 'up' | 'down';
}
