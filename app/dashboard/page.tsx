import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/api/auth/login')

  return (
    <DashboardClient
      user={{
        login: session.login,
        name: session.name,
        avatarUrl: session.avatarUrl,
      }}
    />
  )
}
