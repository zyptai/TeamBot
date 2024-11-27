// Copyright (c) 2024 ZyptAI, tim.barrow@zyptai.com
// This software is proprietary to ZyptAI.
// File: /src/config.js

const { DefaultAzureCredential } = require("@azure/identity");
const { AppConfigurationClient } = require("@azure/app-configuration");

// Initialize Azure App Config client
const appConfigEndpoint = "https://zyptai-dev-app-config.azconfig.io";
const credential = new DefaultAzureCredential();
const configClient = new AppConfigurationClient(appConfigEndpoint, credential);

// Initial config object
const config = {};

// Load configuration from Azure App Config
async function loadConfig() {
    console.log("Loading configuration from Azure App Config...");
    try {
        const settings = configClient.listConfigurationSettings({
            labelFilter: null  // Get all settings without label filter
        });

        // Map of Azure App Config keys to config object keys
        const keyMapping = {
            'APP_INSIGHTS_CONNECTION_STRING': 'appInsightsConnectionString',
            'AZURE_OPENAI_API_KEY': 'azureOpenAIKey',
            'AZURE_OPENAI_ENDPOINT': 'azureOpenAIEndpoint',
            'AZURE_OPENAI_DEPLOYMENT_NAME': 'azureOpenAIDeploymentName',
            'AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME': 'azureOpenAIEmbeddingDeploymentName',
            'AZURE_RESOURCE_GROUP_NAME': 'azureResourceGroupName',
            'AZURE_SUBSCRIPTION_ID': 'azureSubscriptionId',
            'BOT_ID': 'botId',
            'BOT_DOMAIN': 'botDomain',
            'JIRA_BASE_URL': 'jiraBaseUrl',
            'JIRA_USERNAME': 'jiraUsername',
            'SEARCH_API_KEY': 'azureSearchKey',
            'SEARCH_ENDPOINT': 'azureSearchEndpoint',
            'SEARCH_INDEX_NAME': 'azureSearchIndexName',
            'TEAMS_APP_ID': 'teamsAppId'
            // Add any other mappings as needed
        };

        for await (const setting of settings) {
            const configKey = keyMapping[setting.key];
            if (configKey) {
                config[configKey] = setting.value;
                console.log(`Loaded ${setting.key} from Azure App Config`);
            }
        }

        console.log("Configuration loaded successfully");
    } catch (error) {
        console.error("Error loading from Azure App Config:", error);
        console.log("Falling back to environment variables");
        
        // Fallback to environment variables
        Object.entries(keyMapping).forEach(([envKey, configKey]) => {
            config[configKey] = process.env[envKey] || config[configKey];
        });
    }
}

// Initialize the configuration
loadConfig().catch(error => {
    console.error("Failed to load configuration:", error);
});

module.exports = config;