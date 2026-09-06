/**
 * Browser lifecycle management for VedaTrace
 *
 * Handles:
 * - visibilitychange: flush when the page becomes hidden
 * - pagehide: final flush when the page goes away
 *
 * `beforeunload` and `unload` are deliberately not used. Registering either one
 * makes Chrome and Safari ineligible for the back/forward cache, so a logging
 * SDK that listens for them measurably slows down every back-navigation in the
 * host app. `visibilitychange` + `pagehide` covers every case they did,
 * including Safari, and is the pair the browsers themselves recommend.
 *
 * The final flush goes out through the batcher's normal HTTP transport, which
 * sets `keepalive: true` in the browser so the request outlives the document.
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
	private isAttached = false
	private pendingFlush: Promise<void> | null = null

	constructor(private config: BrowserLifecycleConfig) {
		this.boundVisibilityHandler = this.handleVisibilityChange.bind(this)
		this.boundPageHideHandler = this.handlePageHide.bind(this)
	}

	/** Start listening for browser lifecycle events */
	attach(): void {
		if (this.isAttached) return
		if (typeof document === "undefined" || typeof window === "undefined") return

		document.addEventListener("visibilitychange", this.boundVisibilityHandler)
		window.addEventListener("pagehide", this.boundPageHideHandler)

		this.isAttached = true

		if (this.config.debug) {
			console.log("[VedaTrace] Browser lifecycle handlers attached")
		}
	}

	/** Stop listening for browser lifecycle events */
	detach(): void {
		if (!this.isAttached) return

		if (typeof document !== "undefined" && typeof window !== "undefined") {
			document.removeEventListener(
				"visibilitychange",
				this.boundVisibilityHandler,
			)
			window.removeEventListener("pagehide", this.boundPageHideHandler)
		}

		this.isAttached = false

		if (this.config.debug) {
			console.log("[VedaTrace] Browser lifecycle handlers detached")
		}
	}

	/**
	 * Flush when the page becomes hidden.
	 *
	 * This is the one that actually matters: on mobile, a backgrounded tab is
	 * often discarded without ever firing pagehide, so "hidden" is the last
	 * reliable moment to ship what we have.
	 */
	private handleVisibilityChange(): void {
		if (document.visibilityState === "hidden") {
			if (this.config.debug) {
				console.log("[VedaTrace] Page became hidden, flushing logs")
			}
			this.scheduleFlush()
		}
	}

	/** Final flush as the page is torn down or frozen into the bfcache. */
	private handlePageHide(event: PageTransitionEvent): void {
		if (this.config.debug) {
			console.log(
				"[VedaTrace] Page hide event",
				event.persisted ? "(cached)" : "(navigation)",
			)
		}

		this.scheduleFlush()
	}

	/** Flush at most once at a time; keepalive carries it past the document. */
	private scheduleFlush(): void {
		if (this.pendingFlush) return

		this.pendingFlush = this.config
			.flush()
			.catch(() => {
				// Never let a failed exit flush surface as an unhandled rejection.
			})
			.finally(() => {
				this.pendingFlush = null
			})
	}

	/** Check if handlers are attached */
	isActive(): boolean {
		return this.isAttached
	}
}
