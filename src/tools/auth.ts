import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from './result.js';
import { jsonResult, runTool, successResult } from './result.js';
import { authResponseOutput, recordOutput, successOutput } from './outputs.js';

const collectionField = z
  .string()
  .default('users')
  .describe('Collection name (default: users)');

const otpOutput = z.looseObject({
  otpId: z.string().optional().describe('OTP id to pass to a follow-up call'),
  token: z.string().optional().describe('Authentication token'),
  record: recordOutput.optional().describe('Authenticated record'),
});

const authMethodsOutput = z.looseObject({
  password: z.looseObject({ enabled: z.boolean().optional() }).optional(),
  oauth2: z.looseObject({ enabled: z.boolean().optional() }).optional(),
  otp: z.looseObject({ enabled: z.boolean().optional() }).optional(),
  mfa: z.looseObject({ enabled: z.boolean().optional() }).optional(),
});

function resolveAdminFallback(
  value: string | undefined,
  envValue: string | undefined,
  isAdmin: boolean
): string | undefined {
  return isAdmin && !value ? envValue : value;
}

function requireCredentials(
  email: string | undefined,
  password: string | undefined
): { email: string; password: string } {
  if (!email || !password) {
    throw new Error('Email and password are required for authentication');
  }

  return { email, password };
}

function resolveCredentials(args: {
  email?: string;
  password?: string;
  collection?: string;
  isAdmin: boolean;
}): { collection: string; email: string; password: string } {
  const collection = args.isAdmin ? '_superusers' : args.collection || 'users';
  const email = resolveAdminFallback(args.email, process.env.POCKETBASE_ADMIN_EMAIL, args.isAdmin);
  const password = resolveAdminFallback(
    args.password,
    process.env.POCKETBASE_ADMIN_PASSWORD,
    args.isAdmin
  );

  return { collection, ...requireCredentials(email, password) };
}

function hasCompleteOtp(args: { otpId?: string; password?: string }): boolean {
  return Boolean(args.otpId && args.password);
}

function hasPartialOtp(args: { otpId?: string; password?: string }): boolean {
  return Boolean(args.otpId || args.password);
}

async function resolveOtpAuth(
  service: ReturnType<ToolContext['pb']['collection']>,
  args: { email: string; otpId?: string; password?: string }
) {
  if (hasCompleteOtp(args)) {
    const authData = await service.authWithOTP(args.otpId as string, args.password as string);
    return jsonResult(authData);
  }

  if (hasPartialOtp(args)) {
    throw new Error('Both otpId and password are required to complete OTP authentication');
  }

  const otp = await service.requestOTP(args.email);
  return jsonResult(otp);
}

export function registerAuthTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    'list_auth_methods',
    {
      title: 'List Auth Methods',
      description: 'List all available authentication methods',
      annotations: { readOnlyHint: true },
      inputSchema: z.object({ collection: collectionField }),
      outputSchema: authMethodsOutput,
    },
    async (args) =>
      runTool('Failed to list auth methods', async () => {
        const methods = await context.pb.collection(args.collection).listAuthMethods();
        return jsonResult(methods);
      })
  );

  server.registerTool(
    'authenticate_user',
    {
      title: 'Authenticate User',
      description: 'Authenticate a user with email and password',
      inputSchema: z.object({
        email: z.string().optional().describe('User email'),
        password: z.string().optional().describe('User password'),
        collection: collectionField,
        isAdmin: z
          .boolean()
          .default(false)
          .describe('Whether to authenticate as an admin (uses _superusers collection)'),
      }),
      outputSchema: authResponseOutput,
    },
    async (args) =>
      runTool('Authentication failed', async () => {
        const { collection, email, password } = resolveCredentials(args);
        const authData = await context.pb.collection(collection).authWithPassword(email, password);
        return jsonResult(authData);
      })
  );

  server.registerTool(
    'authenticate_with_oauth2',
    {
      title: 'Authenticate with OAuth2',
      description: 'Authenticate a user with OAuth2',
      inputSchema: z.object({
        provider: z.string().describe('OAuth2 provider name (e.g., google, facebook, github)'),
        code: z.string().describe('The authorization code returned from the OAuth2 provider'),
        codeVerifier: z.string().describe('PKCE code verifier'),
        redirectUrl: z.string().describe('The redirect URL used in the OAuth2 flow'),
        collection: collectionField,
      }),
      outputSchema: authResponseOutput,
    },
    async (args) =>
      runTool('Failed to authenticate with OAuth2', async () => {
        const authData = await context.pb
          .collection(args.collection)
          .authWithOAuth2Code(args.provider, args.code, args.codeVerifier, args.redirectUrl);
        return jsonResult(authData);
      })
  );

  server.registerTool(
    'authenticate_with_otp',
    {
      title: 'Authenticate with OTP',
      description:
        'Authenticate a user with a one-time password. Call without otpId/password first to request an OTP (returns an otpId), then call again with otpId and the received password.',
      inputSchema: z.object({
        email: z.string().describe('User email'),
        otpId: z.string().optional().describe('OTP id returned by a previous request'),
        password: z.string().optional().describe('One-time password received by email'),
        collection: collectionField,
      }),
      outputSchema: otpOutput,
    },
    async (args) =>
      runTool('Failed to authenticate with OTP', async () => {
        const service = context.pb.collection(args.collection);
        return resolveOtpAuth(service, args);
      })
  );

  server.registerTool(
    'auth_refresh',
    {
      title: 'Refresh Authentication',
      description: 'Refresh authentication token',
      inputSchema: z.object({ collection: collectionField }),
      outputSchema: authResponseOutput,
    },
    async (args) =>
      runTool('Failed to refresh authentication', async () => {
        const authData = await context.pb.collection(args.collection).authRefresh();
        return jsonResult(authData);
      })
  );

  server.registerTool(
    'request_verification',
    {
      title: 'Request Verification',
      description: 'Request email verification',
      inputSchema: z.object({
        email: z.string().describe('User email'),
        collection: collectionField,
      }),
      outputSchema: successOutput,
    },
    async (args) =>
      runTool('Failed to request verification', async () => {
        const result = await context.pb.collection(args.collection).requestVerification(args.email);
        return successResult(result);
      })
  );

  server.registerTool(
    'confirm_verification',
    {
      title: 'Confirm Verification',
      description: 'Confirm email verification with token',
      inputSchema: z.object({
        token: z.string().describe('Verification token'),
        collection: collectionField,
      }),
      outputSchema: successOutput,
    },
    async (args) =>
      runTool('Failed to confirm verification', async () => {
        const result = await context.pb.collection(args.collection).confirmVerification(args.token);
        return successResult(result);
      })
  );

  server.registerTool(
    'request_password_reset',
    {
      title: 'Request Password Reset',
      description: 'Request password reset',
      inputSchema: z.object({
        email: z.string().describe('User email'),
        collection: collectionField,
      }),
      outputSchema: successOutput,
    },
    async (args) =>
      runTool('Failed to request password reset', async () => {
        const result = await context.pb
          .collection(args.collection)
          .requestPasswordReset(args.email);
        return successResult(result);
      })
  );

  server.registerTool(
    'confirm_password_reset',
    {
      title: 'Confirm Password Reset',
      description: 'Confirm password reset with token',
      inputSchema: z.object({
        token: z.string().describe('Reset token'),
        password: z.string().describe('New password'),
        passwordConfirm: z.string().describe('Confirm new password'),
        collection: collectionField,
      }),
      outputSchema: successOutput,
    },
    async (args) =>
      runTool('Failed to confirm password reset', async () => {
        const result = await context.pb
          .collection(args.collection)
          .confirmPasswordReset(args.token, args.password, args.passwordConfirm);
        return successResult(result);
      })
  );

  server.registerTool(
    'request_email_change',
    {
      title: 'Request Email Change',
      description: 'Request email change',
      inputSchema: z.object({
        newEmail: z.string().describe('New email address'),
        collection: collectionField,
      }),
      outputSchema: successOutput,
    },
    async (args) =>
      runTool('Failed to request email change', async () => {
        const result = await context.pb.collection(args.collection).requestEmailChange(args.newEmail);
        return successResult(result);
      })
  );

  server.registerTool(
    'confirm_email_change',
    {
      title: 'Confirm Email Change',
      description: 'Confirm email change with token',
      inputSchema: z.object({
        token: z.string().describe('Email change token'),
        password: z.string().describe('Current password for confirmation'),
        collection: collectionField,
      }),
      outputSchema: successOutput,
    },
    async (args) =>
      runTool('Failed to confirm email change', async () => {
        const result = await context.pb
          .collection(args.collection)
          .confirmEmailChange(args.token, args.password);
        return successResult(result);
      })
  );

  server.registerTool(
    'impersonate_user',
    {
      title: 'Impersonate User',
      description: 'Impersonate another user (admin only)',
      inputSchema: z.object({
        id: z.string().describe('ID of the user to impersonate'),
        collectionIdOrName: z
          .string()
          .default('users')
          .describe('Collection name or id (default: users)'),
        duration: z.number().default(3600).describe('Token expirey time (default: 3600)'),
      }),
      outputSchema: authResponseOutput,
    },
    async (args) =>
      runTool('Failed to impersonate user', async () => {
        await context.authorizeAsAdmin();
        const impersonated = await context.pb
          .collection(args.collectionIdOrName)
          .impersonate(args.id, args.duration);
        return jsonResult({
          token: impersonated.authStore.token,
          record: impersonated.authStore.record,
        });
      })
  );

  server.registerTool(
    'create_user',
    {
      title: 'Create User',
      description: 'Create a new user account',
      inputSchema: z.object({
        email: z.string().describe('User email'),
        password: z.string().describe('User password'),
        passwordConfirm: z.string().describe('Password confirmation'),
        name: z.string().optional().describe('User name'),
        collection: collectionField,
      }),
      outputSchema: recordOutput,
    },
    async (args) =>
      runTool('Failed to create user', async () => {
        const result = await context.pb.collection(args.collection).create({
          email: args.email,
          password: args.password,
          passwordConfirm: args.passwordConfirm,
          name: args.name,
        });
        return jsonResult(result);
      })
  );
}
