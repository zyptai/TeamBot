const axios = require("axios");
const { OpenAIClient } = require("@azure/openai");
const { AzureKeyCredential } = require("@azure/core-auth");
const config = require("../config");
const LoggingUtil = require("./loggingUtil");
const appInsightsConfig = require('./utils/appInsightsConfig');

// Initialize the OpenAI client
const client = new OpenAIClient(config.azureOpenAIEndpoint, new AzureKeyCredential(config.azureOpenAIKey));

// Export a function that creates the logger when needed
function createLogger() {
    return new LoggingUtil(appInsightsConfig.client);
}

/**
 * Handles API queries by type and routes to appropriate handler
 * @param {Object} context - Bot context
 * @param {Object} state - Conversation state
 * @param {string} apiType - Type of API to handle (e.g., "JIRA")
 * @param {LoggingUtil} logger - The logger instance
 */
async function handleApiQuery(context, state, apiType, logger) {

  // Validate environment variables
  const envVars = {
    jiraBaseUrl: process.env.JIRA_BASE_URL,
    jiraUsername: process.env.JIRA_USERNAME,
    botId: process.env.BOT_ID
  };

    if (apiType === "JIRA") {
      // Log the start of API handling with user context
      logger.logEvent('JIRA_QUERY_RECEIVED', {
        apiType: apiType,
        userId: context.activity.from.id,
        userInfo: {
            name: context.activity.from.name,
            channelId: context.activity.channelId
        },
        query: context.activity.text,
        timestamp: new Date().toISOString()
    });
    const query = context.activity.text;
    await processApiQuery(query, context, state, getJiraApiInfo());
  } else {
    console.log(`Unsupported API type: ${apiType}`);
    await context.sendActivity("I'm sorry, I can only handle Jira API queries at the moment.");
  }
}

function getJiraApiInfo() {
  //console.log("jira token:", config.jiraApiToken);
  return {
    baseUrl: config.jiraBaseUrl,
    authType: "Basic",
    username: config.jiraUsername,
    //apiToken: config.jiraApiToken,
    defaultContentType: "application/json",
  };
}

async function processApiQuery(query, context, state, apiInfo) {
  const initialPrompt = `You are an AI assistant that interacts with a Jira REST API.
  User query: "${query}"
  
  API Info: ${JSON.stringify(apiInfo, null, 2)}
  
  Key Instructions:
  1. For custom fields: 
     a) First, GET /rest/api/3/issue/createmeta?expand=projects.issuetypes.fields to find custom field info.
     b) Search the response for the field name and get its id.
     c) Use the id in JQL queries: cf[id]~'value' (use ~ for contains match)
  2. Construct full URLs with base URL and endpoint.
  3. Always include headers, even if empty: { headers: {} }
  4. Use '~' for contains matches in long text fields, do not use '='
  5. 'maxresult=0' should be used for a count of issues
  6. First - determine what type of object is being asked about for the final result.  Is it message about the total number of issues or list of issues?  
        Is it the total number of projects or list or details about the project object?
  6. For any search involving the count or list of Jira issues:
   - Always use the "/rest/api/3/search" endpoint.
   - Use the "jql" parameter to specify search criteria (e.g., project, priority, assignee, etc.).
   - To count issues without returning details, set "maxResults = 0".
   - To list issues, use an appropriate "maxResults" value (e.g., 50 or 100).
   - **Example for counting issues**:
     json
     {
       "method": "GET",
       "url": "/rest/api/3/search?jql=project='PROJECTKEY'&maxResults=0"
     }
     
   - **Example for listing issues**:
     json
     {
       "method": "GET",
       "url": "/rest/api/3/search?jql=project='PROJECTKEY' AND priority='High'&maxResults=50"
     }
  7. For other Jira objects (like projects, sprints, boards, etc.):
   - Use the appropriate endpoint:
     - **Projects**: '/rest/api/3/project'
     - **Sprints**: '/rest/agile/1.0/sprint/{sprintId}'
     - **Boards**: '/rest/agile/1.0/board/{boardId}'
     - **Epics**: '/rest/agile/1.0/epic/{epicId}'
     - **Versions** (Releases): '/rest/api/3/project/{projectIdOrKey}/version'
     - **Components**: '/rest/api/3/project/{projectIdOrKey}/components'  
  5. If no results:
     - Try case-insensitive search
     - Check for multiple values: use 'IN' operator
     - Look for leading/trailing spaces
  6. Analyze responses for errors or unexpected results
  7. Explain any uncertainties in your final answer
  
  Use make_api_call function for all API interactions.
  Provide a clear, concise answer after gathering all necessary information.`;

  let messages = [{ role: "system", content: initialPrompt }];
  const functions = [genericApiFunction];

  // Get a single response from OpenAI
  let assistantResponse = await getOpenAIResponse(messages, functions);
  console.log("Assistant response:", JSON.stringify(assistantResponse, null, 2));

  messages.push(assistantResponse);

  if (assistantResponse.functionCall) {
    const functionName = assistantResponse.functionCall.name;
    const functionArgs = JSON.parse(assistantResponse.functionCall.arguments);

    if (functionName === "make_api_call") {
      try {
        let functionResult = await makeApiRequest(functionArgs);
        console.log("Jira API result (first 200 chars):", JSON.stringify(functionResult).substring(0, 200));

        if (apiInfo.baseUrl === process.env.JIRA_BASE_URL) {
          await generateDynamicResponse(query, functionResult, apiInfo, context);
        } else {
          await context.sendActivity("Unable to process the API response.");
        }
      } catch (error) {
        console.error("Error in API request:", error.message);
        await context.sendActivity("I encountered an error fetching the Jira issues. Please try again later.");
      }
    } else {
      await context.sendActivity(`Unknown function: ${functionName}`);
    }
  } else if (assistantResponse.content) {
    // Handle regular content returned by OpenAI
    await context.sendActivity(assistantResponse.content);
  } else {
    await context.sendActivity("Unable to process the assistant response.");
  }
}

async function generateDynamicResponse(query, apiResult, apiInfo, context) {
  const dynamicPrompt = `
    You are an AI assistant responding to a user query about Jira.
    The user asked: "${query}"
    
    API result: ${JSON.stringify(apiResult, null, 2)}
    
    Based on the above result, please generate a response that answers the user's query clearly and concisely.
    If the user has asked for a count of an object, provide the count clearly.
    If the user has asked for a list of objects, generate links to the objects based on the link format.
    Here are the link formats for different objects:
    - Issues: '${apiInfo.baseUrl}/browse/{issueKey}'
    - Projects: '${apiInfo.baseUrl}/projects/{projectIdOrKey})
    - Sprints: '${apiInfo.baseUrl}/jira/software/c/projects/{projectIdOrKey}/boards/{boardId}/sprints/{sprintId})
    - Boards: '${apiInfo.baseUrl}/jira/software/c/projects/{projectIdOrKey}/boards/{boardId})
    - Epics: '${apiInfo.baseUrl}/browse/{epicId})
    - Versions: '${apiInfo.baseUrl}/projects/{projectIdOrKey}/versions/{versionId})
    - Components: '${apiInfo.baseUrl}/projects/{projectIdOrKey}/components/{componentId})
    Describe how to join the information that came back from the API and the link format to provide a response including the link(s).

    Ensure that all links are formatted properly using Markdown syntax so they are clickable in the response.
    If the user is asking for specific information about an object, return that information.`;
  
  let messages = [{ role: "system", content: dynamicPrompt }];

  try {
    // Remove empty functions array to avoid error
    const dynamicResponse = await getOpenAIResponse(messages);
    console.log(dynamicResponse.content);
    if (dynamicResponse.content) {
      // Send the generated response to the user
      await context.sendActivity(dynamicResponse.content);
    } else {
      await context.sendActivity("I was unable to generate a response based on the API data.");
    }
  } catch (error) {
    console.error("Error getting dynamic OpenAI response:", error.message);
    await context.sendActivity("I encountered an error generating the response. Please try again later.");
  }
}
  
const genericApiFunction = {
  name: "make_api_call",
  description: "Make a call to the API.",
  parameters: {
    type: "object",
    properties: {
      method: {
        type: "string",
        enum: ["GET", "POST", "PUT", "DELETE"],
        description: "The HTTP method for the API call"
      },
      url: {
        type: "string",
        description: "The full URL for the API call, including the base URL, endpoint, and encoded query parameters"
      },
      headers: {
        type: "object",
        description: "Headers for the API call. Always include this, even if empty."
      },
      data: {
        type: "object",
        description: "Request body for POST, PUT, or DELETE requests"
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return (optional, for search queries)"
      }
    },
    required: ["method", "url", "headers"]
  }
};

async function makeApiRequest({ method, url, headers = {}, data }) {
  console.log("url before the call: ", url);
  const apiInfo = getJiraApiInfo();
  console.log("username", apiInfo.username);
  console.log("apitoken:", apiInfo.apiToken);
  console.log("url: ", url);
  
  // Retrieve Jira API token using the new getJiraApiToken function
  const apiToken = await getJiraApiToken();
  console.log("Jira API token retrieved:", "[REDACTED]");
  // Ensure authentication headers are always included
  const authHeaders = {
    "Authorization": "Basic " + Buffer.from(config.jiraUsername + ":" + apiToken).toString("base64"),
    "Content-Type": "application/json",
  };

  // Merge provided headers with auth headers, giving priority to auth headers
  const mergedHeaders = { ...headers, ...authHeaders };

  try {
    console.log("Method:", method);
    console.log("URL:", url);
    console.log("Headers:", mergedHeaders);
    console.log("Data:", data);

    const response = await axios({ method, url, headers: mergedHeaders, data });
    return response.data;
  } catch (error) {
    console.error("Error making API request:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
    throw error;
  }
}

const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");

async function getJiraApiToken() {
  // Initialize Key Vault client using Managed Identity or other credentials
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(config.vaultUrl, credential);

  try {
    // Fetch the Jira API token from Azure Key Vault
    console.log("Attempting to retrieve secret 'JiraApiToken' from Key Vault...");
    const secret = await client.getSecret("JiraApiToken");

    // Check if the secret has been successfully retrieved
    console.log("Secret retrieval successful:", secret ? "[REDACTED]" : "No secret found");

    return secret.value;  // Return the Jira API token
  } catch (error) {
    // Handle any errors in retrieving the secret
    console.error("Error retrieving Jira API token from Key Vault:", error.message);
    throw new Error("Unable to retrieve Jira API token from Key Vault.");
  }
}

async function getOpenAIResponse(messages, functions) {
  try {
    const response = await client.getChatCompletions(
      config.azureOpenAIDeploymentName,
      messages,
      {
        functions,
        temperature: 0,
      }
    );
    return response.choices[0].message;
  } catch (error) {
    console.error("Error getting OpenAI response:", error.message);
    throw error;
  }
}

module.exports = {
  handleApiQuery,
};