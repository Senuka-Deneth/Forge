import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const EDGE_FUNCTION_UNAVAILABLE_MESSAGE = 'Cloud chart settings are unavailable. Settings are saved locally on this device.'

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Supabase Edge Function calls will fail until they are configured.')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  : null

export class EdgeFunctionUnavailableError extends Error {
  constructor(message = EDGE_FUNCTION_UNAVAILABLE_MESSAGE, cause = null) {
    super(message)
    this.name = 'EdgeFunctionUnavailableError'
    this.cause = cause
  }
}

export function isEdgeFunctionUnavailableError(error) {
  return error instanceof EdgeFunctionUnavailableError
}

function isUnavailableFunctionError(error) {
  const status = error?.context?.status
  const message = String(error?.message || '').toLowerCase()
  const name = String(error?.name || '')

  return (
    status === 404 ||
    name === 'FunctionsFetchError' ||
    name === 'FunctionsRelayError' ||
    message.includes('failed to send a request to the edge function') ||
    message.includes('requested function was not found')
  )
}

export async function invokeFunction(name, body) {
  if (!supabase) {
    throw new EdgeFunctionUnavailableError()
  }

  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    if (isUnavailableFunctionError(error)) {
      throw new EdgeFunctionUnavailableError(undefined, error)
    }
    throw new Error(error.message || `${name} failed`)
  }
  return data
}
