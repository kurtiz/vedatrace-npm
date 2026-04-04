/**
 * React integration for VedaTrace
 * Provides context and hooks for client-side logging
 */

import type { ReactElement, ReactNode } from "react"
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from "react"
import type {
	LogMetadata,
	VedaTraceConfig,
	VedaTraceLoggerInterface,
} from "@/core/types"
import { vedatrace } from "@/index"

// Create context
const VedaTraceContext = createContext<VedaTraceLoggerInterface | null>(null)

export interface VedaTraceProviderProps {
	/** API key for logging */
	apiKey?: string
	/** Default service name */
	service?: string
	/** Environment */
	environment?: string
	/** Additional config */
	config?: Omit<VedaTraceConfig, "apiKey" | "service" | "environment">
	/** React children */
	children: ReactNode
}

/**
 * VedaTrace Provider for React applications
 *
 * @example
 * ```tsx
 * import { VedaTraceProvider } from 'vedatrace/react'
 *
 * function App() {
 *   return (
 *     <VedaTraceProvider apiKey="..." service="frontend">
 *       <YourApp />
 *     </VedaTraceProvider>
 *   )
 * }
 * ```
 */
export function VedaTraceProvider({
	apiKey,
	service,
	environment,
	config = {},
	children,
}: VedaTraceProviderProps): ReactElement {
	// Serialize config for stable comparison
	const configRef = useRef(config)

	const logger = useMemo(() => {
		const config: VedaTraceConfig = { ...configRef.current }
		if (apiKey) config.apiKey = apiKey
		if (service) config.service = service
		if (environment) config.environment = environment
		return vedatrace(config)
	}, [apiKey, service, environment])

	// Flush logs on unmount
	useEffect(() => {
		return () => {
			logger.flush().catch(() => {
				// Silent fail on unmount
			})
		}
	}, [logger])

	return (
		<VedaTraceContext.Provider value={logger}>
			{children}
		</VedaTraceContext.Provider>
	)
}

/**
 * Hook to access the VedaTrace logger
 *
 * @example
 * ```tsx
 * import { useVedaTrace } from 'vedatrace/react'
 *
 * function MyComponent() {
 *   const logger = useVedaTrace()
 *
 *   useEffect(() => {
 *     logger.info('Component mounted')
 *   }, [])
 *
 *   return <div>Hello</div>
 * }
 * ```
 */
export function useVedaTrace(): VedaTraceLoggerInterface {
	const logger = useContext(VedaTraceContext)

	if (!logger) {
		throw new Error("useVedaTrace must be used within a VedaTraceProvider")
	}

	return logger
}

/**
 * Hook to create a child logger with additional context
 *
 * @example
 * ```tsx
 * import { useVedaTraceChild } from 'vedatrace/react'
 *
 * function UserProfile({ userId }: { userId: string }) {
 *   const logger = useVedaTraceChild({ userId, component: 'UserProfile' })
 *
 *   useEffect(() => {
 *     logger.info('Loading user profile')
 *   }, [userId])
 *
 *   return <div>User {userId}</div>
 * }
 * ```
 */
export function useVedaTraceChild(
	metadata: LogMetadata,
): VedaTraceLoggerInterface {
	const parentLogger = useVedaTrace()
	const metadataRef = useRef(metadata)

	const childLogger = useMemo(() => {
		return parentLogger.child(metadataRef.current)
	}, [parentLogger])

	return childLogger
}

/**
 * Hook to log component lifecycle events
 *
 * @example
 * ```tsx
 * import { useVedaTraceLifecycle } from 'vedatrace/react'
 *
 * function MyComponent() {
 *   useVedaTraceLifecycle('MyComponent', { id: '123' })
 *   return <div>Hello</div>
 * }
 * ```
 */
export function useVedaTraceLifecycle(
	componentName: string,
	metadata?: LogMetadata,
): void {
	const logger = useVedaTrace()
	const componentNameRef = useRef(componentName)
	const metadataRef = useRef(metadata)

	useEffect(() => {
		const name = componentNameRef.current
		const meta = metadataRef.current

		logger.info(`${name} mounted`, meta)

		return () => {
			logger.info(`${name} unmounted`, meta)
		}
	}, [logger])
}

/**
 * Hook to log errors with React Error Boundaries
 *
 * @example
 * ```tsx
 * import { useVedaTraceError } from 'vedatrace/react'
 *
 * function MyComponent() {
 *   const logError = useVedaTraceError()
 *
 *   const handleClick = () => {
 *     try {
 *       riskyOperation()
 *     } catch (err) {
 *       logError(err)
 *     }
 *   }
 *
 *   return <button onClick={handleClick}>Click me</button>
 * }
 * ```
 */
export function useVedaTraceError(): (
	error: Error,
	metadata?: LogMetadata,
) => void {
	const logger = useVedaTrace()

	return useCallback(
		(error: Error, metadata?: LogMetadata) => {
			logger.error(error, metadata)
		},
		[logger],
	)
}
