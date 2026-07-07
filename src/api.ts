import type { CompetitionSeriesRequest, CompetitionSeriesResponse, ComposeRequest, ComposeResponse, EnvConfigResponse, GenerateImageRequest, GenerateImageResponse, HealthResponse, SaveEnvConfigRequest, SuggestSettingsRequest, SuggestSettingsResponse } from './types'

interface ApiOptions {
  signal?: AbortSignal
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`
    throw new Error(message)
  }
  return payload as T
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health')
  return readJson<HealthResponse>(response)
}

export async function getEnvConfig(): Promise<EnvConfigResponse> {
  const response = await fetch('/api/env-config')
  return readJson<EnvConfigResponse>(response)
}

export async function saveEnvConfig(request: SaveEnvConfigRequest): Promise<EnvConfigResponse> {
  const response = await fetch('/api/env-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return readJson<EnvConfigResponse>(response)
}

export async function composeProject(request: ComposeRequest, options: ApiOptions = {}): Promise<ComposeResponse> {
  const response = await fetch('/api/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: options.signal,
  })
  return readJson<ComposeResponse>(response)
}

export async function suggestSettings(request: SuggestSettingsRequest): Promise<SuggestSettingsResponse> {
  const response = await fetch('/api/suggest-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return readJson<SuggestSettingsResponse>(response)
}

export async function composeCompetitionSeries(request: CompetitionSeriesRequest, options: ApiOptions = {}): Promise<CompetitionSeriesResponse> {
  const response = await fetch('/api/competition-series', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: options.signal,
  })
  return readJson<CompetitionSeriesResponse>(response)
}

export async function generateImage(request: GenerateImageRequest, options: ApiOptions = {}): Promise<GenerateImageResponse> {
  const response = await fetch('/api/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: options.signal,
  })
  return readJson<GenerateImageResponse>(response)
}
