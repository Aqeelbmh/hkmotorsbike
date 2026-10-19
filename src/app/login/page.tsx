'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {signIn} from './actions'
import { Wrench, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  // Render native controls (autofill dropdown, scrollbars) for dark surfaces
  React.useEffect(() => {
    const el = document.documentElement
    const prev = el.style.colorScheme
    el.style.colorScheme = 'dark'
    return () => {
      el.style.colorScheme = prev
    }
  }, [])

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
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 px-4">
      {/* Ambient brand glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 -left-24 h-[360px] w-[360px] rounded-full bg-indigo-500/10 blur-[100px]" />
        <div className="absolute -right-24 top-1/3 h-[320px] w-[320px] rounded-full bg-sky-500/10 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 shadow-lg shadow-blue-600/40 ring-1 ring-white/15">
            <Wrench className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">H.K Motors Bike</h1>
          <p className="mt-1 text-sm text-slate-400">POS &amp; Inventory Management</p>
        </div>

        <Card className="border-slate-800/80 bg-slate-900/70 text-slate-100 shadow-2xl shadow-black/40 ring-1 ring-white/5 backdrop-blur">
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
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    placeholder="you@company.lk"
                    className="input-dark h-11 border-slate-700 bg-slate-950 pl-10 text-slate-100 placeholder:text-slate-600 focus-visible:ring-blue-500"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="input-dark h-11 border-slate-700 bg-slate-950 pl-10 pr-11 text-slate-100 placeholder:text-slate-600 focus-visible:ring-blue-500"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="h-11 w-full bg-gradient-to-b from-blue-500 to-blue-600 font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-400 hover:to-blue-600 focus-visible:ring-blue-500"
                disabled={pending}
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">
          LKR (Rs.) · Cashiers, Managers &amp; Admins only
        </p>
      </div>
    </div>
  )
}
