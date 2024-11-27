// Copyright (c) 2024 ZyptAI, tim.barrow@zyptai.com
// This software is proprietary to ZyptAI.
// File: /src/utils/configProvider.js
// Purpose: Configuration provider supporting both env files and Azure App Config for SAP implementation settings

const { DefaultAzureCredential } = require("@azure/identity");
const { AppConfigurationClient } = require("@azure/app-configuration");

/**
 * Configuration provider that can load from environment variables or Azure App Configuration
 * @class ConfigProvider
 */
class ConfigProvider {
    constructor() {
        // Flag to determine if using Azure App Config
        this.useAppConfig = process.env.USE_APP_CONFIG === 'true';
        this.appConfigEndpoint = process.env.AZURE_APP_CONFIG_ENDPOINT;
        this.configClient = null;
        this.cachedConfig = null;
    }

    /**
     * Initialize the configuration provider
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.useAppConfig && this.appConfigEndpoint) {
            try {
                const credential = new DefaultAzureCredential();
                this.configClient = new AppConfigurationClient(this.appConfigEndpoint, credential);
                console.log("Azure App Configuration client initialized");
            } catch (error) {
                console.error("Failed to initialize Azure App Configuration:", error);
                console.log("Falling back to environment variables");
                this.useAppConfig = false;
            }
        }
    }

    /**
     * Get all configuration values
     * @returns {Promise<Object>} Configuration object
     */
    async getConfig() {
        // Return cached config if available
        if (this.cachedConfig) {
            return this.cachedConfig;
        }

        // If using App Config, try to fetch from Azure first
        if (this.useAppConfig && this.configClient) {
            try {
                const settings = this.configClient.listConfigurationSettings({
                    labelFilter: "zyptai-bot"  // Use a label to group related settings
                });

                const config = {};
                for await (const setting of settings) {
                    config[setting.key] = setting.value;
                }

                // Fall back to env vars for any missing values
                this.cachedConfig = {
                    botId: config.BOT_ID || process.env.BOT_ID,
                    botPassword: config.BOT_PASSWORD || process.env.BOT_PASSWORD,
                    azureOpenAIKey: config.AZURE_OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY,
                    azureOpenAIEndpoint: config.AZURE_OPENAI_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT,
                    azureOpenAIDeploymentName: config.AZURE_OPENAI_DEPLOYMENT_NAME || process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
                    azureOpenAIEmbeddingDeploymentName: config.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME || process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME,
                    azureSearchKey: config.AZURE_SEARCH_KEY || process.env.AZURE_SEARCH_KEY,
                    azureSearchEndpoint: config.AZURE_SEARCH_ENDPOINT || process.env.AZURE_SEARCH_ENDPOINT,
                    jiraBaseUrl: config.JIRA_BASE_URL || process.env.JIRA_BASE_URL,
                    jiraUsername: config.JIRA_USERNAME || process.env.JIRA_USERNAME,
                    jiraApiToken: config.JIRA_API_TOKEN || process.env.SECRET_JIRA_API_TOKEN,
                    appInsightsInstrumentationKey: config.APP_INSIGHTS_INSTRUMENTATION_KEY || process.env.APP_INSIGHTS_INSTRUMENTATION_KEY,
                    appInsightsConnectionString: config.APP_INSIGHTS_CONNECTION_STRING || process.env.APP_INSIGHTS_CONNECTION_STRING,
                    keyVaultName: config.KEY_VAULT_NAME || process.env.KEY_VAULT_NAME,
                    vaultUrl: config.VAULT_URL || process.env.VAULT_URL,
                };

                return this.cachedConfig;
            } catch (error) {
                console.error("Error fetching from Azure App Configuration:", error);
                console.log("Falling back to environment variables");
            }
        }

        // Fall back to or primarily use environment variables
        this.cachedConfig = {
            botId: process.env.BOT_ID,
            botPassword: process.env.BOT_PASSWORD,
            azureOpenAIKey: process.env.AZURE_OPENAI_API_KEY,
            azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
            azureOpenAIDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
            azureOpenAIEmbeddingDeploymentName: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME,
            azureSearchKey: process.env.AZURE_SEARCH_KEY,
            azureSearchEndpoint: process.env.AZURE_SEARCH_ENDPOINT,
            jiraBaseUrl: process.env.JIRA_BASE_URL,
            jiraUsername: process.env.JIRA_USERNAME,
            jiraApiToken: process.env.SECRET_JIRA_API_TOKEN,
            appInsightsInstrumentationKey: process.env.APP_INSIGHTS_INSTRUMENTATION_KEY,
            appInsightsConnectionString: process.env.APP_INSIGHTS_CONNECTION_STRING,
            keyVaultName: process.env.KEY_VAULT_NAME,
            vaultUrl: process.env.VAULT_URL,
        };

        return this.cachedConfig;
    }

    /**
     * Clear the configuration cache
     */
    clearCache() {
        this.cachedConfig = null;
    }
}

// Export singleton instance
const configProvider = new ConfigProvider();
module.exports = configProvider;