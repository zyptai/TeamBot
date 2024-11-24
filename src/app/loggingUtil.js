// Copyright (c) 2024 ZyptAI, tim.barrow@zyptai.com
// This software is proprietary to ZyptAI.
// File: /src/loggingUtil.js
// Purpose: Performance-optimized logging utility with user tracking for SAP implementation monitoring

const appInsights = require('applicationinsights');

/**
 * Minimum time between metric submissions in milliseconds
 * @type {number}
 */
const THROTTLE_INTERVAL = 1000;

class LoggingUtil {
    constructor(client) {
        this.client = client;
        this.lastMetricTime = {};
        this.userProperties = {};
    }

    /**
     * Set the current user context for logging
     * @param {string} userId - Unique identifier for the user
     * @param {Object} additionalProperties - Any additional user properties to track
     */
    setUserContext(userId, additionalProperties = {}) {
        if (!userId) {
            console.warn('User ID is required for setting user context');
            return;
        }

        // Store user properties for inclusion in logs
        this.userProperties = {
            userId,
            ...additionalProperties
        };

        // Explicitly log the user context setting event
        this.client.trackEvent({
            name: 'USER_CONTEXT_SET',
            properties: {
                timestamp: new Date().toISOString(),
                ...this.userProperties,
                eventType: 'UserContextSet'
            }
        });

        // Log a metric for user session start
        this.client.trackMetric({
            name: 'USER_SESSION_START',
            value: 1,
            properties: this.userProperties
        });
    }

    // Rest of your existing methods remain the same...
    logEvent(eventName, properties = {}) {
        this.client.trackEvent({
            name: eventName,
            properties: {
                timestamp: new Date().toISOString(),
                ...this.userProperties,
                ...properties
            }
        });
    }

    logOperation(operationType, duration, success = true, properties = {}) {
        const now = Date.now();
        
        // Ensure operationType is valid
        const sanitizedOperationType = operationType.trim().replace(/\s+/g, '_');
        const metricKey = `OP_${sanitizedOperationType}`;
        
        if (!this.lastMetricTime[metricKey] || 
            (now - this.lastMetricTime[metricKey]) > THROTTLE_INTERVAL) {
            
            const commonProperties = {
                success,
                timestamp: new Date().toISOString(),
                ...this.userProperties,
                ...properties
            };

            this.client.trackMetric({
                name: metricKey,
                value: duration,
                properties: commonProperties
            });

            this.client.trackEvent({
                name: `OPERATION_${operationType}`,
                properties: {
                    duration,
                    ...commonProperties
                }
            });

            this.lastMetricTime[metricKey] = now;
        }
    }

    logError(error, operationType, context = {}) {
        const isCritical = error.name === 'TypeError' || 
                          error.name === 'ReferenceError' ||
                          context.critical;

        const sanitizedError = new Error(error.message);
        sanitizedError.name = error.name;
        sanitizedError.stack = error.stack;

        this.client.trackException({
            exception: sanitizedError,
            properties: {
                operationType: operationType.trim().replace(/\s+/g, '_'),
                errorType: error.name,
                isCritical,
                timestamp: new Date().toISOString(),
                ...this.userProperties,
                ...context
            }
        });
    }
}

module.exports = LoggingUtil;