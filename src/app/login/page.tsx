'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {signIn} from './actions'
import { Wrench, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (!email || !password) {
      setError('Enter your email and password')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await signIn(email, password)
      if (result?.error) {
        setError(
          result.error.includes('Invalid')
            ? 'Invalid email or password'
            : result.error.includes('Confirm')
              ? 'Please confirm your email first'
              : result.error
        )
      } else {
        router.replace('/')
        router.refresh()
      }
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/30">
            <Wrench className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">H.K Motors Bike</h1>
            <p className="text-sm text-slate-400">POS & Inventory Management</p>
          </div>
        </div>

        <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription className="text-slate-400">
              Use the account created by your administrator
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  placeholder="you@company.lk"
                  className="border-slate-700 bg-slate-950 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-300">
                    Password
                  </Label>
                  <button
                    type="button"
                    className="text-xs text-blue-400 hover:underline"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? 'Hide' : 'Show'} password
                  </button>
                </div>
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="border-slate-700 bg-slate-950 text-slate-100"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.currentTarget.form as HTMLFormElement)?.requestSubmit()
                  }}
                />
              </div>

              {error && (
                <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-500">
          LKR (Rs.) · Cashiers, Managers & Admins only
        </p>
      </div>
    </div>
  )
}
