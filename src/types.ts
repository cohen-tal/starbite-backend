export interface Token {
  token: string;
  type: "access_token" | "refresh_token";
  expiresIn: number;
  issuer?: string;
  subject?: string;
}
