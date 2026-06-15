import { describe, it, expect } from 'vitest'
import type { AuthState } from '@/types'

describe('AuthState type', () => {
  it('should have correct shape for unauthenticated state', () => {
    const state: AuthState = {
      authenticated: false,
      username: null,
      avatar_url: null,
      token: null,
      discord_id: null,
      linked_since: null,
    }

    expect(state.authenticated).toBe(false)
    expect(state.username).toBeNull()
    expect(state.avatar_url).toBeNull()
    expect(state.token).toBeNull()
    expect(state.discord_id).toBeNull()
  })

  it('should have correct shape for authenticated state', () => {
    const state: AuthState = {
      authenticated: true,
      username: 'testuser',
      avatar_url: 'https://cdn.discordapp.com/avatars/123/abc.png',
      token: 'jwt-token',
      discord_id: '123456789',
      linked_since: '2024-01-01',
    }

    expect(state.authenticated).toBe(true)
    expect(state.username).toBe('testuser')
    expect(state.avatar_url).toContain('discordapp')
    expect(state.token).toBeTruthy()
  })
})
