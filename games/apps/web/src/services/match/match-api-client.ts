export type MatchApiBody = Record<string, unknown>;
export type MatchApiResponse = Readonly<{
  ok: boolean;
  status: number;
  body: MatchApiBody;
}>;

/** Explicit HTTP operations for match setup and recovery; live match updates use MatchTransport. */
export class MatchApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  createMatch(input: Readonly<{
    gameId: string;
    rulesVersion: number;
    visibility: string;
    seriesTarget: number;
    displayName: string;
  }>): Promise<MatchApiResponse> {
    return this.request('/v1/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  previewMatch(matchId: string, inviteToken: string | null, supportedGames: Readonly<Record<string, readonly number[]>>): Promise<MatchApiResponse> {
    return this.request(`/v1/matches/${encodeURIComponent(matchId)}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteToken, supportedGames }),
      signal: AbortSignal.timeout(8_000),
    });
  }

  joinMatch(matchId: string, input: Readonly<{ inviteToken: string | null; displayName: string | null; supportedGames: Readonly<Record<string, readonly number[]>> }>): Promise<MatchApiResponse> {
    return this.request(`/v1/matches/${encodeURIComponent(matchId)}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  getMatch(matchId: string, seatToken: string): Promise<MatchApiResponse> {
    return this.request(`/v1/matches/${encodeURIComponent(matchId)}`, {
      headers: { Authorization: `Bearer ${seatToken}` },
      signal: AbortSignal.timeout(4_000),
    });
  }

  cancelMatch(matchId: string, seatToken: string): Promise<MatchApiResponse> {
    return this.request(`/v1/matches/${encodeURIComponent(matchId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seatToken}` },
    });
  }

  leaveWaitingMatch(matchId: string, seatToken: string): Promise<MatchApiResponse> {
    return this.request(`/v1/matches/${encodeURIComponent(matchId)}/leave`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seatToken}` },
      signal: AbortSignal.timeout(8_000),
    });
  }

  leaveCompletedSeries(matchId: string, seatToken: string): Promise<MatchApiResponse> {
    return this.request(`/v1/matches/${encodeURIComponent(matchId)}/leave-series`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seatToken}` },
      signal: AbortSignal.timeout(8_000),
    });
  }

  private async request(path: string, init: RequestInit): Promise<MatchApiResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    let decoded: unknown;
    try { decoded = await response.json(); } catch { decoded = null; }
    const body = decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)
      ? decoded as MatchApiBody
      : {};
    return { ok: response.ok, status: response.status, body };
  }
}
