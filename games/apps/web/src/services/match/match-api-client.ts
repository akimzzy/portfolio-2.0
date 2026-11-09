export type MatchApiBody = Record<string, unknown>;
export type MatchApiResponse = Readonly<{
  ok: boolean;
  status: number;
  body: MatchApiBody;
}>;

/** Explicit HTTP operations for match setup and recovery; live match updates use MatchTransport. */
export class MatchApiClient {
  private readonly baseUrl: string;
  private readonly accountToken: () => string | null | Promise<string | null>;

  constructor(
    baseUrl: string,
    accountToken: () => string | null | Promise<string | null> = () => null,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.accountToken = accountToken;
  }

  private async identityHeaders(includeAccount = true): Promise<HeadersInit> {
    if (!includeAccount) return {};
    const token = await this.accountToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async identityHeadersForMode(
    identityMode: "account" | "guest" = "account",
  ): Promise<HeadersInit> {
    const headers = await this.identityHeaders(identityMode !== "guest");
    if (identityMode === "account" && !new Headers(headers).has("authorization"))
      throw new Error("Your sign-in session is unavailable. Sign in again or choose Guest.");
    return headers;
  }

  async createMatch(
    input: Readonly<{
      gameId: string;
      rulesVersion: number;
      visibility: string;
      seriesTarget: number;
      displayName: string;
      identityMode?: "account" | "guest";
    }>,
  ): Promise<MatchApiResponse> {
    const { identityMode = "account", ...requestBody } = input;
    const identityHeaders = await this.identityHeadersForMode(identityMode);
    return this.request("/v1/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...identityHeaders },
      body: JSON.stringify(requestBody),
    });
  }

  async quickMatch(
    input: Readonly<{
      gameId: string;
      rulesVersion: number;
      seriesTarget: number;
      matchAnySeries?: boolean;
      displayName: string;
      identityMode?: "account" | "guest";
    }>,
  ): Promise<MatchApiResponse> {
    const { identityMode = "account", ...requestBody } = input;
    const identityHeaders = await this.identityHeadersForMode(identityMode);
    return this.request("/v1/matches/quick", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...identityHeaders },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(8_000),
    });
  }

  async createAiMatch(
    input: Readonly<{
      gameId: string;
      profileId: string;
      inHousePlayerId: string;
      seriesTarget: number;
      displayName: string;
      opponentName: string;
      identityMode?: "account" | "guest";
    }>,
  ): Promise<MatchApiResponse> {
    const { identityMode = "account", ...requestBody } = input;
    const identityHeaders = await this.identityHeadersForMode(identityMode);
    return this.request("/v1/matches/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...identityHeaders },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(8_000),
    });
  }

  previewMatch(
    matchId: string,
    inviteToken: string | null,
    supportedGames: Readonly<Record<string, readonly number[]>>,
  ): Promise<MatchApiResponse> {
    return this.request(`/v1/matches/${encodeURIComponent(matchId)}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken, supportedGames }),
      signal: AbortSignal.timeout(8_000),
    });
  }

  async joinMatch(
    matchId: string,
    input: Readonly<{
      inviteToken: string | null;
      displayName: string | null;
      identityMode?: "account" | "guest";
      supportedGames: Readonly<Record<string, readonly number[]>>;
    }>,
  ): Promise<MatchApiResponse> {
    const { identityMode = "account", ...requestBody } = input;
    const identityHeaders = await this.identityHeadersForMode(identityMode);
    return this.request(`/v1/matches/${encodeURIComponent(matchId)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...identityHeaders },
      body: JSON.stringify(requestBody),
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
      method: "POST",
      headers: { Authorization: `Bearer ${seatToken}` },
    });
  }

  leaveWaitingMatch(matchId: string, seatToken: string): Promise<MatchApiResponse> {
    return this.request(`/v1/matches/${encodeURIComponent(matchId)}/leave`, {
      method: "POST",
      headers: { Authorization: `Bearer ${seatToken}` },
      signal: AbortSignal.timeout(8_000),
    });
  }

  leaveCompletedSeries(matchId: string, seatToken: string): Promise<MatchApiResponse> {
    return this.request(`/v1/matches/${encodeURIComponent(matchId)}/leave-series`, {
      method: "POST",
      headers: { Authorization: `Bearer ${seatToken}` },
      signal: AbortSignal.timeout(8_000),
    });
  }

  private async request(path: string, init: RequestInit): Promise<MatchApiResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    let decoded: unknown;
    try {
      decoded = await response.json();
    } catch {
      decoded = null;
    }
    const body =
      decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)
        ? (decoded as MatchApiBody)
        : {};
    return { ok: response.ok, status: response.status, body };
  }
}
