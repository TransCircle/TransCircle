// ============================================================================
// WebAuthn 浏览器辅助：在 base64url JSON（后端 @simplewebauthn/server 收发格式）
// 与浏览器 navigator.credentials API 的 BufferSource 之间手动转换，
// 无需引入 @simplewebauthn/browser 依赖。
// ============================================================================

import { arrayBufferToBase64url, base64urlToArrayBuffer } from "./string";

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials
  );
}

// ── 注册（POST /v1/me/passkeys/register/start → finish）─────────

interface CredentialDescriptorJSON {
  id: string;
  type?: string;
  transports?: string[];
}

interface CreationOptionsJSON {
  challenge: string;
  user: { id: string; name: string; displayName: string };
  rp: { id?: string; name: string };
  pubKeyCredParams: Array<{ type: string; alg: number }>;
  timeout?: number;
  excludeCredentials?: CredentialDescriptorJSON[];
  authenticatorSelection?: Record<string, unknown>;
  attestation?: string;
  extensions?: Record<string, unknown>;
}

export interface RegistrationResponseJSON {
  id: string;
  rawId: string;
  type: string;
  authenticatorAttachment?: string;
  clientExtensionResults: Record<string, unknown>;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
}

function toDescriptors(
  list: CredentialDescriptorJSON[] | undefined,
): PublicKeyCredentialDescriptor[] | undefined {
  if (!list) return undefined;
  return list.map((c) => ({
    id: base64urlToArrayBuffer(c.id),
    type: "public-key",
    ...(c.transports ? { transports: c.transports as AuthenticatorTransport[] } : {}),
  }));
}

export async function performRegistration(
  options: CreationOptionsJSON,
): Promise<RegistrationResponseJSON> {
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: base64urlToArrayBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64urlToArrayBuffer(options.user.id),
    },
    pubKeyCredParams: options.pubKeyCredParams.map((p) => ({
      type: "public-key",
      alg: p.alg,
    })),
    excludeCredentials: toDescriptors(options.excludeCredentials),
    authenticatorSelection: options.authenticatorSelection as
      | AuthenticatorSelectionCriteria
      | undefined,
    attestation: options.attestation as AttestationConveyancePreference | undefined,
  };

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error("WEBAUTHN_NO_CREDENTIAL");

  const response = credential.response as AuthenticatorAttestationResponse;
  const transports =
    typeof response.getTransports === "function" ? response.getTransports() : [];

  return {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults() as Record<string, unknown>,
    response: {
      clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
      attestationObject: arrayBufferToBase64url(response.attestationObject),
      transports,
    },
  };
}

// ── 断言（passkey 登录 / step-up）───────────────────────────────

interface RequestOptionsJSON {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: string;
  allowCredentials?: CredentialDescriptorJSON[];
  extensions?: Record<string, unknown>;
}

export interface AuthenticationResponseJSON {
  id: string;
  rawId: string;
  type: string;
  authenticatorAttachment?: string;
  clientExtensionResults: Record<string, unknown>;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
}

export async function performAssertion(
  options: RequestOptionsJSON,
): Promise<AuthenticationResponseJSON> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: base64urlToArrayBuffer(options.challenge),
    ...(options.rpId ? { rpId: options.rpId } : {}),
    ...(options.timeout ? { timeout: options.timeout } : {}),
    userVerification: options.userVerification as UserVerificationRequirement | undefined,
    allowCredentials: toDescriptors(options.allowCredentials),
  };

  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error("WEBAUTHN_NO_CREDENTIAL");

  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults() as Record<string, unknown>,
    response: {
      clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
      authenticatorData: arrayBufferToBase64url(response.authenticatorData),
      signature: arrayBufferToBase64url(response.signature),
      ...(response.userHandle ? { userHandle: arrayBufferToBase64url(response.userHandle) } : {}),
    },
  };
}
