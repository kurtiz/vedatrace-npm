/**
 * PII redaction utilities
 */

import type { RedactionConfig } from "../core/types"

const PII_PATTERNS = {
	// Email addresses
	email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
	// Phone numbers (various formats)
	phone: /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
	// Social Security Numbers
	ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
	// Credit card numbers (simplified)
	creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
}

const SENSITIVE_KEYS = [
	"password",
	"token",
	"secret",
	"key",
	"apiKey",
	"api_key",
	"auth",
	"authorization",
	"cookie",
	"session",
	"credit_card",
	"creditCard",
	"cvv",
	"ssn",
	"social_security",
	"dob",
	"birthdate",
]

/**
 * Redact sensitive data from an object
 */
export function redact(obj: unknown, config: RedactionConfig = {}): unknown {
	if (!obj || typeof obj !== "object") {
		return obj
	}

	const { paths = [], mask = "[REDACTED]", autoDetectPii = true } = config

	// Handle arrays
	if (Array.isArray(obj)) {
		return obj.map((item) => redact(item, config))
	}

	// Handle objects
	const result: Record<string, unknown> = {}

	for (const [key, value] of Object.entries(obj)) {
		// Check if key matches sensitive patterns
		if (isSensitiveKey(key, paths)) {
			result[key] = mask
			continue
		}

		// Recursively redact nested objects
		if (value && typeof value === "object") {
			result[key] = redact(value, config)
			continue
		}

		// Check for PII in string values
		if (autoDetectPii && typeof value === "string") {
			result[key] = redactPii(value, mask)
		} else {
			result[key] = value
		}
	}

	return result
}

/**
 * Check if a key is sensitive
 */
function isSensitiveKey(key: string, customPaths: string[]): boolean {
	const lowerKey = key.toLowerCase()

	// Check built-in sensitive keys
	if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive))) {
		return true
	}

	// Check custom paths (support dot notation like 'user.password')
	return customPaths.some((path) => {
		const parts = path.split(".")
		return parts[parts.length - 1].toLowerCase() === lowerKey
	})
}

/**
 * Redact PII patterns from a string
 */
function redactPii(value: string, mask: string): string {
	let result = value

	for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
		result = result.replace(pattern, `[${type.toUpperCase()}:${mask}]`)
	}

	return result
}
