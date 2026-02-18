/**
 * Console transport for development/debugging
 */

import type {
	InternalLogEntry,
	VedaTraceLevel,
	VedaTraceTransport,
} from "../core/types"

export type ConsoleFormat = "pretty" | "json" | "simple"

export interface ConsoleTransportConfig {
	/** Output format */
	format?: ConsoleFormat
	/** Enable colors in pretty format */
	colors?: boolean
	/** Minimum level to log */
	minLevel?: VedaTraceLevel
}

const LEVEL_COLORS: Record<VedaTraceLevel, string> = {
	debug: "\x1b[36m", // cyan
	info: "\x1b[32m", // green
	warn: "\x1b[33m", // yellow
	error: "\x1b[31m", // red
	fatal: "\x1b[35m", // magenta
}

const RESET_COLOR = "\x1b[0m"

const LEVEL_PRIORITY: Record<VedaTraceLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	fatal: 4,
}

export class VedaTraceConsoleTransport implements VedaTraceTransport {
	readonly name = "console"
	private format: ConsoleFormat
	private colors: boolean
	private minLevel: VedaTraceLevel

	constructor(config: ConsoleTransportConfig = {}) {
		this.format = config.format ?? "pretty"
		this.colors = config.colors ?? true
		this.minLevel = config.minLevel ?? "debug"
	}

	/** Send logs to console */
	send(logs: InternalLogEntry[]): void {
		for (const log of logs) {
			if (LEVEL_PRIORITY[log.level] < LEVEL_PRIORITY[this.minLevel]) {
				continue
			}

			switch (this.format) {
				case "json":
					this.logJson(log)
					break
				case "simple":
					this.logSimple(log)
					break
				default:
					this.logPretty(log)
					break
			}
		}
	}

	/** Format as JSON */
	private logJson(log: InternalLogEntry): void {
		// eslint-disable-next-line no-console
		console.log(JSON.stringify(log))
	}

	/** Format as simple text */
	private logSimple(log: InternalLogEntry): void {
		const timestamp = new Date(log.timestamp ?? Date.now()).toISOString()
		const service = log.service ? `[${log.service}] ` : ""
		// eslint-disable-next-line no-console
		console.log(
			`${timestamp} ${log.level.toUpperCase()} ${service}${log.message}`,
		)
	}

	/** Format as pretty colored output */
	private logPretty(log: InternalLogEntry): void {
		const timestamp = new Date(log.timestamp ?? Date.now()).toISOString()
		const color = this.colors ? LEVEL_COLORS[log.level] : ""
		const reset = this.colors ? RESET_COLOR : ""
		const service = log.service ? ` ${color}[${log.service}]${reset}` : ""

		let output = `${timestamp} ${color}${log.level.toUpperCase()}${reset}${service} ${log.message}`

		if (log.metadata && Object.keys(log.metadata).length > 0) {
			output += `\n  ${color}metadata:${reset} ${JSON.stringify(log.metadata, null, 2).replace(/\n/g, "\n  ")}`
		}

		// eslint-disable-next-line no-console
		console.log(output)
	}
}
