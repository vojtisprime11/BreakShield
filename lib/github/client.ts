/**
 * lib/github/client.ts
 * GitHub App authentication and core API operations.
 */

import { App }     from '@octokit/app'
import { Octokit } from '@octokit/rest'
import { createHmac, timingSafeEqual } from 'crypto'

// ─── Singleton App instance ───────────────────────────────────────────────────

let _app: App | null = null

function getApp(): App {
  if (!_app) {
    const appId      = process.env.GITHUB_APP_ID
    const privateKey = process.env.GITHUB_PRIVATE_KEY?.replace(/\\n/g, '\n')
    const secret     = process.env.GITHUB_WEBHOOK_SECRET

    if (!appId || !privateKey || !secret) {
      throw new Error('Missing GITHUB_APP_ID, GITHUB_PRIVATE_KEY or GITHUB_WEBHOOK_SECRET')
    }

    _app = new App({
      appId,
      privateKey,
      webhooks: { secret },
    })
  }
  return _app
}

// ─── Webhook verification ─────────────────────────────────────────────────────

export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret || !signatureHeader) return false

  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(expected,         'utf8'),
      Buffer.from(signatureHeader,  'utf8')
    )
  } catch {
    return false
  }
}

// ─── Installation Octokit ─────────────────────────────────────────────────────

export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  return (await getApp().getInstallationOctokit(installationId)) as unknown as Octokit
}
