import { createClient } from '@supabase/supabase-js'

const runtimeConfig = typeof window !== "undefined" ? window.__TRAVELPLANER_CONFIG__ || {} : {}
const supabaseUrl = runtimeConfig.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = runtimeConfig.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
