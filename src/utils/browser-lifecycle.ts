/**
 * Browser lifecycle management for VedaTrace
 *
 * Handles:
 * - visibilitychange: flush when page becomes hidden
 * - pagehide: final flush when user leaves the page
 * - beforeunload: backup flush before page unload
 *
 * Uses fetch with keepalive: true for final flush to ensure
 * the request completes after the tab is closed.
 */

import type { VedaTraceTransport } from "../core/types"

interface BrowserLifecycleConfig {
	transports: VedaTraceTransport[]
	flush(): Promise<void>
	debug?: boolean
}

/**
 * Browser lifecycle manager
 * Attaches event listeners and handles graceful flush on page exit
 */
export class BrowserLifecycle {
	private boundVisibilityHandler: () => void
	private boundPageHideHandler: (event: PageTransitionEvent) => void
	private boundBeforeUnloadHandler: (event: BeforeUnloadEvent) => void
	private boundUnloadHandler: () => void
	private isAttached = false
	private pendingFlush: Promise<void> | null = null

	constructor(private config: BrowserLifecycleConfig) {
		this.boundVisibilityHandler = this.handleVisibilityChange.bind(this)
		this.boundPageHideHandler = this.handlePageHide.bind(this)
		this.boundBeforeUnloadHandler = this.handleBeforeUnload.bind(this)
		this.boundUnloadHandler = this.handleUnload.bind(this)
	}

	/** Start listening for browser lifecycle events */
	attach(): void {
		if (this.isAttached) return

		if (typeof document !== "undefined") {
			document.addEventListener("visibilitychange", this.boundVisibilityHandler)
			window.addEventListener("pagehide", this.boundPageHideHandler)
			window.addEventListener("beforeunload", this.boundBeforeUnloadHandler)
			window.addEventListener("unload", this.boundUnloadHandler)
		}

		this.isAttached = true

		if (this.config.debug) {
			console.log("[VedaTrace] Browser lifecycle handlers attached")
		}
	}

	/** Stop listening for browser lifecycle events */
	detach(): void {
		if (!this.isAttached) return

		if (typeof document !== "undefined") {
			document.removeEventListener(
				"visibilitychange",
				this.boundVisibilityHandler,
			)
			window.removeEventListener("pagehide", this.boundPageHideHandler)
			window.removeEventListener("beforeunload", this.boundBeforeUnloadHandler)
			window.removeEventListener("unload", this.boundUnloadHandler)
		}

		this.isAttached = false

		if (this.config.debug) {
			console.log("[VedaTrace] Browser lifecycle handlers detached")
		}
	}

	/** Handle visibility change - flush when page becomes hidden */
	private handleVisibilityChange(): void {
		if (document.visibilityState === "hidden") {
			if (this.config.debug) {
				console.log("[VedaTrace] Page became hidden, flushing logs")
			}
			this.scheduleFlush()
		}
	}

	/** Handle pagehide event - primary flush handler for Safari */
	private handlePageHide(event: PageTransitionEvent): void {
		if (this.config.debug) {
			console.log(
				"[VedaTrace] Page hide event",
				event.persisted ? "(cached)" : "(navigation)",
			)
		}

		if (event.persisted) {
			// Page is being cached (like back button), flush but don't block
			this.scheduleFlush()
		} else {
			// Page is being navigated away, do a final flush with keepalive
			this.finalFlush()
		}
	}

	/** Handle beforeunload - backup flush mechanism */
	private handleBeforeUnload(event: BeforeUnloadEvent): void {
		if (this.config.debug) {
			console.log("[VedaTrace] Before unload event")
		}
		// Don't prevent default, just schedule final flush
		this.finalFlush()
	}

	/** Handle unload - fallback for older browsers */
	private handleUnload(): void {
		if (this.config.debug) {
			console.log("[VedaTrace] Unload event")
		}
		this.finalFlush()
	}

	/** Schedule a debounced flush (for visibility change) */
	private scheduleFlush(): void {
		if (this.pendingFlush) return

		this.pendingFlush = this.config.flush().finally(() => {
			this.pendingFlush = null
		})
	}

	/**
	 * Final flush using keepalive fetch
	 * For sending logs after the page context is destroyed
	 */
	private finalFlush(): void {
		// For HTTP transports, we use keepalive fetch
		// The flush() call will use navigator.sendBeacon or fetch with keepalive
		for (const transport of this.config.transports) {
			if (transport.name === "http" && "flush" in transport) {
				transport.flush?.()
			}
		}

		// Also call the main flush for any remaining logs
		this.config.flush().catch(() => {
			// Silently ignore errors during final flush
		})
	}

	/** Check if handlers are attached */
	isActive(): boolean {
		return this.isAttached
	}
}

/**
 * Create a keepalive-capable flush for browser environments
 * Uses fetch with keepalive: true for final flush after tab close
 */
export function createBrowserKeepaliveFlush(
	transports: VedaTraceTransport[],
	originalFlush: () => Promise<void>,
): () => void {
	return () => {
		// Call original flush first
		originalFlush()

		// For HTTP transports, ensure they're using keepalive
		// The transport layer should handle this automatically
		for (const transport of transports) {
			if ("flush" in transport && typeof transport.flush === "function") {
				transport.flush()
			}
		}
	}
}
