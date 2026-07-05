import { create } from 'zustand'
import { authApi, walletApi, getStoredToken, setStoredToken } from '../api/client'

const USER_STORAGE_KEY = 'footfive:authUser'

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeStoredUser(user) {
  try {
    if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Auth + wallet state for the virtual betting layer.
 * All balances are virtual FootFive Credits (FC) - no real money.
 */
const useAuthStore = create((set, get) => ({
  token: getStoredToken(),
  user: readStoredUser(),
  balance: null,
  isAuthLoading: false,
  authError: null,

  isLoggedIn: () => !!get().token,

  register: async (username, password) => {
    set({ isAuthLoading: true, authError: null })
    try {
      const data = await authApi.register(username, password)
      setStoredToken(data.token)
      writeStoredUser(data.user)
      set({
        token: data.token,
        user: data.user,
        balance: data.wallet?.balance ?? null,
        isAuthLoading: false,
      })
      return data
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Registration failed'
      set({ isAuthLoading: false, authError: message })
      throw new Error(message)
    }
  },

  login: async (username, password) => {
    set({ isAuthLoading: true, authError: null })
    try {
      const data = await authApi.login(username, password)
      setStoredToken(data.token)
      writeStoredUser(data.user)
      set({
        token: data.token,
        user: data.user,
        balance: data.wallet?.balance ?? null,
        isAuthLoading: false,
      })
      return data
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Login failed'
      set({ isAuthLoading: false, authError: message })
      throw new Error(message)
    }
  },

  logout: () => {
    setStoredToken(null)
    writeStoredUser(null)
    set({ token: null, user: null, balance: null, authError: null })
  },

  setBalance: (balance) => {
    if (balance != null) set({ balance })
  },

  // Refresh balance from the backend (e.g. after bets settle)
  refreshWallet: async () => {
    if (!get().token) return
    try {
      const data = await walletApi.getWallet()
      set({ balance: data.wallet?.balance ?? get().balance })
    } catch (err) {
      // Expired/invalid token: log the user out so UI state stays honest
      if (err.response?.status === 401) get().logout()
    }
  },
}))

export default useAuthStore
